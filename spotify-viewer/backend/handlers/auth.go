package handlers

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/prashil/spotify-viewer/backend/models"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

const (
	// a meta-key for storing the session cookie
	cookieName = "spotify-user-session"
)

func randString(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

// ----------------------------------------------------------------------------------------------------

// getBaseURL builds the external base URL from the incoming request. It respects
// X-Forwarded-Proto and X-Forwarded-Host headers so that the correct address is
// used regardless of whether the caller is on localhost, a Tailscale hostname,
// or behind a reverse proxy. If the resolved host is "localhost", it is rewritten
// to "127.0.0.1" because Spotify does not recognize localhost as a valid
// redirect URI.
func getBaseURL(c *fiber.Ctx) string {
	scheme := c.Get("X-Forwarded-Proto")
	if scheme == "" {
		scheme = c.Protocol()
	}

	// Prefer X-Forwarded-Host header when behind a proxy. Fall back to
	// fasthttp's Host() which reliably includes the port. Note: c.Get("Host")
	// returns empty in fasthttp because the Host header is stored separately
	// from regular headers.
	host := c.Get("X-Forwarded-Host")
	if host == "" {
		host = string(c.Request().Host())
	}

	// Spotify rejects "localhost" - normalize to "127.0.0.1"
	if strings.HasPrefix(host, "localhost") {
		host = "127.0.0.1" + host[len("localhost"):]
	}

	baseURL := scheme + "://" + host
	log.Printf("[auth] getBaseURL resolved to %s (scheme: %s, host: %s)", baseURL, scheme, host)

	return baseURL
}

// ----------------------------------------------------------------------------------------------------

// newOAuthConfig creates a fresh oauth2.Config using the given redirect URL.
// The client ID and secret are read from environment variables set at startup.
func newOAuthConfig(redirectURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     os.Getenv("SPOTIFY_CLIENT_ID"),
		ClientSecret: os.Getenv("SPOTIFY_CLIENT_SECRET"),
		RedirectURL:  redirectURL,
		Scopes: []string{
			"user-read-private",
			"user-top-read",
			"user-read-recently-played",
			"user-read-currently-playing",
		},
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://accounts.spotify.com/authorize",
			TokenURL: "https://accounts.spotify.com/api/token",
		},
	}
}

// ----------------------------------------------------------------------------------------------------

// AuthRoutes registers OAuth2-related routes. The redirect URI is determined
// dynamically from the incoming request so the same binary works whether
// accessed via localhost, a Tailscale address, or any other hostname.
func AuthRoutes(app *fiber.App, db *gorm.DB) {
	// A simple in-memory store for the anti-forgery state and the redirect
	// URL that was sent to Spotify during /auth/login. We must reuse the
	// exact same redirect URL in the token exchange on /auth/callback.
	var state string
	var pendingRedirectURL string

	app.Get("/auth/login", func(c *fiber.Ctx) error {
		// On each login request, generate a new anti-forgery state and
		// derive the redirect URI from the caller's host.
		state, _ = randString(16)
		pendingRedirectURL = getBaseURL(c) + "/auth/callback"
		conf := newOAuthConfig(pendingRedirectURL)
		url := conf.AuthCodeURL(state)
		return c.Redirect(url, http.StatusTemporaryRedirect)
	})

	app.Get("/auth/callback", func(c *fiber.Ctx) error {
		if c.Query("state") != state {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "state mismatch"})
		}

		// Use the same redirect URL that was sent during /auth/login so the
		// token exchange succeeds.
		conf := newOAuthConfig(pendingRedirectURL)
		token, err := conf.Exchange(context.Background(), c.Query("code"))
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "failed to exchange token"})
		}

		// Store the token in the database
		dbToken := models.Token{
			AccessToken:  token.AccessToken,
			TokenType:    token.TokenType,
			RefreshToken: token.RefreshToken,
			Expiry:       token.Expiry,
		}
		// for single-user app, just drop and recreate the token
		db.Exec("DELETE FROM tokens")
		if err := db.Create(&dbToken).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save token"})
		}

		// Fetch user info from spotify
		client := conf.Client(context.Background(), token)
		resp, err := client.Get("https://api.spotify.com/v1/me")
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get user info"})
		}
		defer resp.Body.Close()

		var user struct {
			DisplayName string `json:"display_name"`
			ID          string `json:"id"`
		}
		json.NewDecoder(resp.Body).Decode(&user)

		// for single-user app, just drop and recreate the user
		db.Exec("DELETE FROM users")
		db.Create(&models.User{DisplayName: user.DisplayName, SpotifyID: user.ID})

		// Set a simple session cookie
		c.Cookie(&fiber.Cookie{
			Name:    cookieName,
			Value:   "is-logged-in", // a simple flag
			Expires: time.Now().Add(24 * time.Hour),
		})

		return c.Redirect("/dashboard", http.StatusTemporaryRedirect)
	})

	app.Get("/auth/logout", func(c *fiber.Ctx) error {
		// for single-user-app, just nuke the token from DB
		db.Exec("DELETE FROM tokens")
		db.Exec("DELETE FROM users")
		// clear analytics cache on logout
		ClearAnalyticsCache()

		c.ClearCookie(cookieName)
		return c.Redirect("/", http.StatusTemporaryRedirect)
	})

	app.Get("/auth/me", func(c *fiber.Ctx) error {
		if c.Cookies(cookieName) != "is-logged-in" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "not logged in"})
		}

		var user models.User
		if err := db.First(&user).Error; err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
		}

		return c.JSON(user)
	})
}
