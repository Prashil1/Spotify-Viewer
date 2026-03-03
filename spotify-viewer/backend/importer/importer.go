package importer

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"time"

	"github.com/prashil/spotify-viewer/backend/models"
	"gorm.io/gorm"
)

// TrackJSON - Expected simple JSON format: [{"spotify_track_id":"id","name":"...","artist":"...","play_count":1,"added_at":"2020-01-02T15:04:05Z"}, ...]
type TrackJSON struct {
	SpotifyTrackID string    `json:"spotify_track_id"`
	Name           string    `json:"name"`
	Artist         string    `json:"artist"`
	PlayCount      int       `json:"play_count"`
	AddedAt        time.Time `json:"added_at"`
}

// SpotifyStreamingHistory - Format from Spotify export
type SpotifyStreamingHistory struct {
	// Support both older camelCase export names and the newer/snake_case extended export names
	EndTime            string `json:"endTime,omitempty"`
	Ts                 string `json:"ts,omitempty"` // some exports use `ts`

	ArtistName         string `json:"artistName,omitempty"`
	MasterArtistName   string `json:"master_metadata_album_artist_name,omitempty"`

	TrackName          string `json:"trackName,omitempty"`
	MasterTrackName    string `json:"master_metadata_track_name,omitempty"`

	MsPlayed           int    `json:"msPlayed,omitempty"`
	MsPlayedAlt        int    `json:"ms_played,omitempty"`

	SpotifyTrackID     string `json:"spotifyTrackID,omitempty"`
	SpotifyTrackURI    string `json:"spotify_track_uri,omitempty"`
}

func ImportFile(db *gorm.DB, path string) (int64, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	
	content, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	
	return ImportJSONBytes(db, content)
}

// ImportJSONBytes imports track data from JSON bytes
// Handles both custom format and Spotify export format
func ImportJSONBytes(db *gorm.DB, jsonData []byte) (int64, error) {
	// Try parsing as custom TrackJSON format first
	var tracks []TrackJSON
	if err := json.Unmarshal(jsonData, &tracks); err == nil {
		log.Printf("[importer] parsed custom TrackJSON entries: %d", len(tracks))
		// Ensure parsed custom format actually contains name/artist fields
		hasValid := false
		for i := 0; i < len(tracks) && i < 5; i++ {
			if tracks[i].Name != "" && tracks[i].Artist != "" {
				hasValid = true
				break
			}
		}
		if hasValid {
			return importTracks(db, tracks)
		}
		log.Printf("[importer] custom TrackJSON appears empty of name/artist; falling back to spotify format")
	} else {
		log.Printf("[importer] custom TrackJSON unmarshal error: %v", err)
	}

	// Try parsing as Spotify streaming history format
	var spotifyTracks []SpotifyStreamingHistory
	if err := json.Unmarshal(jsonData, &spotifyTracks); err != nil {
		log.Printf("[importer] spotify streaming unmarshal error: %v", err)
		return 0, err
	}
	log.Printf("[importer] parsed spotify streaming entries: %d", len(spotifyTracks))

	return importSpotifyStreamingHistory(db, spotifyTracks)
}

// importTracks imports from our custom JSON format
func importTracks(db *gorm.DB, tracks []TrackJSON) (int64, error) {
	var imported int64
	
	for _, t := range tracks {
		if t.Name == "" || t.Artist == "" {
			continue // Skip empty entries
		}

		var existing models.Track
		found := false
		if t.SpotifyTrackID != "" {
			if err := db.Where("spotify_track_id = ?", t.SpotifyTrackID).First(&existing).Error; err == nil {
				found = true
			}
		}
		if !found {
			if err := db.Where("artist = ? AND name = ?", t.Artist, t.Name).First(&existing).Error; err == nil {
				found = true
			}
		}

		if found {
			// update counts
			existing.PlayCount += t.PlayCount
			// custom TrackJSON may not include ms, so we don't change TotalMs here
			if err := db.Save(&existing).Error; err != nil {
				log.Printf("[importer] Error updating track: %v", err)
				continue
			}
		} else {
			track := models.Track{
				SpotifyTrackID: t.SpotifyTrackID,
				Name:           t.Name,
				Artist:         t.Artist,
				PlayCount:      t.PlayCount,
				AddedAt:        t.AddedAt,
				TotalMs:        0,
			}
			if err := db.Create(&track).Error; err != nil {
				log.Printf("[importer] Error creating track: %v", err)
				continue
			}
		}
		imported++
	}

	return imported, nil
}

// importSpotifyStreamingHistory imports from Spotify's export format
// Groups by track and counts plays
func importSpotifyStreamingHistory(db *gorm.DB, spotifyTracks []SpotifyStreamingHistory) (int64, error) {
	// Group tracks by name+artist to count plays
	trackMap := make(map[string]*models.Track)

	for i, st := range spotifyTracks {
		if i < 3 {
			// log a small sample for debugging
			log.Printf("[importer] sample[%d]: %+v", i, struct{
				Ts string `json:"ts,omitempty"`
				End string `json:"endTime,omitempty"`
				Track string `json:"track,omitempty"`
			}{st.Ts, st.EndTime, st.TrackName})
		}
		// Normalize fields to support both formats
		artist := strings.TrimSpace(st.ArtistName)
		if artist == "" {
			artist = strings.TrimSpace(st.MasterArtistName)
		}

		name := strings.TrimSpace(st.TrackName)
		if name == "" {
			name = strings.TrimSpace(st.MasterTrackName)
		}

		// ms played may be in either field
		ms := st.MsPlayed
		if ms == 0 {
			ms = st.MsPlayedAlt
		}

		if ms == 0 || name == "" || artist == "" {
			// skip entries with missing critical info
			continue
		}

		// determine spotify id: prefer explicit id field, else extract from URI
		spotifyID := strings.TrimSpace(st.SpotifyTrackID)
		if spotifyID == "" && st.SpotifyTrackURI != "" {
			// spotify URI format: spotify:track:<id>
			parts := strings.Split(st.SpotifyTrackURI, ":")
			if len(parts) >= 3 {
				spotifyID = parts[len(parts)-1]
			}
		}

		// determine added/played time
		endTimeStr := strings.TrimSpace(st.EndTime)
		if endTimeStr == "" {
			endTimeStr = strings.TrimSpace(st.Ts)
		}
		var parsedTime time.Time
		if endTimeStr != "" {
			if t, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
				parsedTime = t
			}
		}

		key := artist + " - " + name

		if track, exists := trackMap[key]; exists {
			track.PlayCount++
			track.TotalMs += int64(ms)
		} else {
			trackMap[key] = &models.Track{
				SpotifyTrackID: spotifyID,
				Name:           name,
				Artist:         artist,
				PlayCount:      1,
				TotalMs:        int64(ms),
				AddedAt:        parsedTime,
			}
		}
	}

	// Save all tracks to DB (upsert behavior)
	var imported int64
	for _, t := range trackMap {
		var existing models.Track
		found := false
		if t.SpotifyTrackID != "" {
			if err := db.Where("spotify_track_id = ?", t.SpotifyTrackID).First(&existing).Error; err == nil {
				found = true
			}
		}
		if !found {
			if err := db.Where("artist = ? AND name = ?", t.Artist, t.Name).First(&existing).Error; err == nil {
				found = true
			}
		}

		if found {
			existing.PlayCount += t.PlayCount
			existing.TotalMs += t.TotalMs
			if t.AddedAt.After(existing.AddedAt) {
				existing.AddedAt = t.AddedAt
			}
			if err := db.Save(&existing).Error; err != nil {
				log.Printf("[importer] Error updating track: %v", err)
				continue
			}
		} else {
			if err := db.Create(t).Error; err != nil {
				log.Printf("[importer] Error creating track: %v", err)
				continue
			}
		}
		imported++
	}

	return imported, nil
}
