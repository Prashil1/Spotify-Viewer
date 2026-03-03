package handlers

import (
	"archive/zip"
	"bytes"
	"github.com/gofiber/fiber/v2"
	"github.com/prashil/spotify-viewer/backend/importer"
	"gorm.io/gorm"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// ImportRoutes registers importer endpoints and requires a DB instance
func ImportRoutes(app *fiber.App, db *gorm.DB) {
	app.Post("/import/upload", func(c *fiber.Ctx) error {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file required"})
		}
		file, err := fileHeader.Open()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "unable to open file"})
		}
		defer file.Close()

		// Read file into memory
		fileBytes, err := io.ReadAll(file)
		if err != nil {
			log.Printf("[import] read error: %v", err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "unable to read file"})
		}

		var tracksImported int64
		var importErr error

		// Check if it's a ZIP file
		log.Printf("[import] uploaded file size: %d bytes", len(fileBytes))
		if bytes.HasPrefix(fileBytes, []byte("PK\x03\x04")) {
			log.Printf("[import] detected zip file")
			tracksImported, importErr = handleZipImport(db, fileBytes)
		} else {
			// Treat as JSON file
			outPath := "imported.json"
			err := os.WriteFile(outPath, fileBytes, 0644)
			if err != nil {
				log.Printf("[import] write file error: %v", err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "unable to save file"})
			}
			tracksImported, importErr = importer.ImportFile(db, outPath)
		}

		if importErr != nil {
			log.Printf("[import] import error: %v", importErr)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "import failed", "detail": importErr.Error()})
		}

		log.Printf("[import] tracks_imported=%d", tracksImported)

		return c.JSON(fiber.Map{"status": "ok", "tracks_imported": tracksImported})
	})
}

// handleZipImport extracts ZIP and imports all JSON files containing streaming history
func handleZipImport(db *gorm.DB, zipData []byte) (int64, error) {
	reader := bytes.NewReader(zipData)
	zipReader, err := zip.NewReader(reader, int64(len(zipData)))
	if err != nil {
		return 0, err
	}

	var totalTracks int64

	// Process all files in the ZIP (including subdirectories)
	for _, file := range zipReader.File {
		// Skip directories (they end with /)
		if len(file.Name) > 0 && file.Name[len(file.Name)-1] == '/' {
			continue
		}

			if filepath.Ext(file.Name) != ".json" {
				log.Printf("[import] skipping non-json file: %s", file.Name)
				continue
			}

			// Check if it's a streaming history file (matches pattern like StreamingHistory*, Streaming_History*, Streaming)
			baseFileName := filepath.Base(file.Name)
			bLower := strings.ToLower(baseFileName)
			if !(strings.Contains(bLower, "streaming") || strings.Contains(bLower, "streaming_history") || strings.Contains(bLower, "streaminghistory")) {
				log.Printf("[import] skipping unrelated json: %s", file.Name)
				continue
			}

		log.Printf("Processing file: %s", file.Name)

		// Extract and read the file
		rc, err := file.Open()
		if err != nil {
			log.Printf("Error opening file %s: %v", file.Name, err)
			continue
		}

		fileContent, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			log.Printf("Error reading file %s: %v", file.Name, err)
			continue
		}

		// Import the file
		tracks, err := importer.ImportJSONBytes(db, fileContent)
		if err != nil {
			log.Printf("Error importing file %s: %v", file.Name, err)
			continue
		}

		totalTracks += tracks
		log.Printf("Imported %d tracks from %s", tracks, file.Name)
	}

	return totalTracks, nil
}
