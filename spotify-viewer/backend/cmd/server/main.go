package main

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	cfgpkg "github.com/prashil/spotify-viewer/backend/config"
	"github.com/prashil/spotify-viewer/backend/handlers"
	"github.com/prashil/spotify-viewer/backend/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

//go:embed all:frontend_out
var embeddedFiles embed.FS

func hasExtension(path string) bool {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			return false
		}
		if path[i] == '.' {
			return true
		}
	}
	return false
}

func isStaticPath(path string) bool {
	return len(path) > 1 && path[1] == '_'
}

func main() {
	configPath := flag.String("config", "", "path to config.yaml (required)")
	flag.Parse()
	if *configPath == "" {
		fmt.Println("-config is required")
		os.Exit(2)
	}
	cfg, err := cfgpkg.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	// set env fallbacks for legacy code that expects env vars
	os.Setenv("SPOTIFY_CLIENT_ID", cfg.Spotify.ClientID)
	os.Setenv("SPOTIFY_CLIENT_SECRET", cfg.Spotify.ClientSecret)

	dbPath := cfg.DBPath
	if dbPath == "" {
		dbPath = "spotify.db"
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// Automigrate minimal models (ensure Token is included)
	if err := db.AutoMigrate(&models.User{}, &models.Track{}, &models.Token{}); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	// Configure Fiber with increased body size limit for file uploads (100MB max)
	app := fiber.New(fiber.Config{
		BodyLimit: 100 * 1024 * 1024, // 100MB
	})

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// register auth and importer routes first
	handlers.AuthRoutes(app, db)
	handlers.ImportRoutes(app, db)
	handlers.WebRoutes(app)
	// analytics endpoints
	handlers.AnalyticsRoutes(app, db)

	// Serve embedded frontend files with a catch-all route at the END
	// This ensures API routes take precedence
	// Use the embedded FS directly without fs.Sub
	app.All("/*", func(c *fiber.Ctx) error {
		path := c.Path()

		// Remove leading / from path
		fsPath := path
		if len(fsPath) > 0 && fsPath[0] == '/' {
			fsPath = fsPath[1:]
		}

		// Try to open the file from embedded FS (without fs.Sub, use frontend_out/ prefix)
		fullPath := "frontend_out/" + fsPath
		log.Printf("Trying to serve: %s (fullPath: %s)", path, fullPath)

		file, err := embeddedFiles.Open(fullPath)
		if err != nil {
			log.Printf("Failed to open %s: %v", fullPath, err)
		} else {
			log.Printf("Successfully opened %s", fullPath)
			defer file.Close()
			info, err := file.Stat()
			if err == nil {
				if !info.IsDir() {
					// It's a file, serve it with appropriate content-type
					data, err := io.ReadAll(file)
					if err == nil {
						// Set content type based on extension
						if len(path) > 3 && path[len(path)-3:] == ".js" {
							c.Set("Content-Type", "application/javascript")
						} else if len(path) > 5 && path[len(path)-5:] == ".html" {
							c.Set("Content-Type", "text/html; charset=utf-8")
						}
						return c.Send(data)
					}
				}
			}
		}

		// Try adding .html extension for routes like /dashboard
		if !hasExtension(path) && path != "/" && !isStaticPath(path) {
			htmlPath := "frontend_out/" + fsPath + ".html"
			file, err := embeddedFiles.Open(htmlPath)
			if err == nil {
				defer file.Close()
				data, err := io.ReadAll(file)
				if err == nil {
					c.Set("Content-Type", "text/html; charset=utf-8")
					return c.Send(data)
				}
			}
		}

		// If path is /, try index.html
		if path == "/" {
			file, err := embeddedFiles.Open("frontend_out/index.html")
			if err == nil {
				defer file.Close()
				data, err := io.ReadAll(file)
				if err == nil {
					c.Set("Content-Type", "text/html; charset=utf-8")
					return c.Send(data)
				}
			}
		}

		// Return 404 if nothing found
		return c.Status(fiber.StatusNotFound).SendString("Not Found")
	})

	port := cfg.Port
	if port == 0 {
		port = 8020
	}
	addr := fmt.Sprintf(":%d", port)
	log.Printf("starting server on %s", addr)
	log.Fatal(app.Listen(addr))
}
