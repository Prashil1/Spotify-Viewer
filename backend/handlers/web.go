package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/prashil/spotify-viewer/backend/models"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

// tokenSourceFromDB retrieves the token from the database and returns an oauth2.TokenSource.
func tokenSourceFromDB(db *gorm.DB) (oauth2.TokenSource, error) {
	var token models.Token
	if err := db.First(&token).Error; err != nil {
		return nil, err
	}

	// Create a static token source
	return oauth2.StaticTokenSource(&oauth2.Token{
		AccessToken:  token.AccessToken,
		TokenType:    token.TokenType,
		RefreshToken: token.RefreshToken,
		Expiry:       token.Expiry,
	}), nil
}


// WebRoutes is a placeholder for future non-API web routes.
// The root / is served by the embedded filesystem middleware (index.html).
func WebRoutes(app *fiber.App) {
    // Reserved for future server-rendered routes.
}
