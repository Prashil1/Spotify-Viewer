package handlers

import (
    "context"
    "encoding/json"
    "fmt"
    "strconv"
    	"strings"
    	"sync"
    	"time"
    "github.com/gofiber/fiber/v2"
    "golang.org/x/oauth2"
    "github.com/prashil/spotify-viewer/backend/models"
    "gorm.io/gorm"
)

// syncRecentlyPlayed synchronizes recently played tracks with the database
func syncRecentlyPlayed(db *gorm.DB, recentlyPlayed *models.RecentlyPlayedResponse) {
	for _, item := range recentlyPlayed.Items {
		var track models.Track
		
		// Attempt to find the track by its Spotify ID
		if err := db.Where("spotify_track_id = ?", item.Track.ID).First(&track).Error; err != nil {
			// If not found, create a new record
			if err == gorm.ErrRecordNotFound {
				var artistNames []string
				for _, artist := range item.Track.Artists {
					artistNames = append(artistNames, artist.Name)
				}
				
				track = models.Track{
					SpotifyTrackID: item.Track.ID,
					Name:           item.Track.Name,
					Artist:         strings.Join(artistNames, ", "),
					PlayCount:      1,
					TotalMs:        int64(item.Track.DurationMs),
					AddedAt:        time.Now(),
				}
				db.Create(&track)
			}
		} else {
			// If found, update the play count and total milliseconds
			track.PlayCount++
			track.TotalMs += int64(item.Track.DurationMs)
			db.Save(&track)
		}
	}
}

// AnalyticsRoutes registers endpoints that proxy Spotify analytics APIs
func AnalyticsRoutes(app *fiber.App, db *gorm.DB) {
    // simple in-memory cache for summary/top-artists
    var cacheMu sync.Mutex
    var cacheData = make(map[string]struct{
        payload interface{}
        expiry time.Time
    })
    ttl := 30 * time.Second

    getCache := func(key string) (interface{}, bool) {
        cacheMu.Lock()
        defer cacheMu.Unlock()
        if v, ok := cacheData[key]; ok {
            if time.Now().Before(v.expiry) {
                return v.payload, true
            }
            delete(cacheData, key)
        }
        return nil, false
    }
    setCache := func(key string, payload interface{}) {
        cacheMu.Lock()
        defer cacheMu.Unlock()
        cacheData[key] = struct{
            payload interface{}
            expiry time.Time
        }{payload, time.Now().Add(ttl)}
    }
    // expose clear for logout
    ClearAnalyticsCache := func() {
        cacheMu.Lock()
        defer cacheMu.Unlock()
        cacheData = make(map[string]struct{
            payload interface{}
            expiry time.Time
        })
    }
    // Now Playing endpoint — proxies Spotify's currently-playing API
    app.Get("/now-playing", func(c *fiber.Ctx) error {
        ts, err := tokenSourceFromDB(db)
        if err != nil {
            return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "no token, login required"})
        }
        client := oauth2.NewClient(context.Background(), ts)
        resp, err := client.Get("https://api.spotify.com/v1/me/player/currently-playing")
        if err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "spotify request failed", "detail": err.Error()})
        }
        defer resp.Body.Close()
        // 204 means nothing is playing
        if resp.StatusCode == 204 {
            return c.JSON(fiber.Map{"is_playing": false})
        }
        var body interface{}
        json.NewDecoder(resp.Body).Decode(&body)
        return c.JSON(body)
    })

    app.Get("/top-artists", func(c *fiber.Ctx) error {
        // try cache
        key := "top-artists:limit="+c.Query("limit","20")+":tr="+c.Query("time_range","medium_term")
        if v, ok := getCache(key); ok {
            return c.JSON(v)
        }
        ts, err := tokenSourceFromDB(db)
        if err != nil {
            return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "no token, login required"})
        }
        client := oauth2.NewClient(context.Background(), ts)
        limit := c.Query("limit", "20")
        timeRange := c.Query("time_range", "medium_term")
        url := fmt.Sprintf("https://api.spotify.com/v1/me/top/artists?limit=%s&time_range=%s", limit, timeRange)
        resp, err := client.Get(url)
        if err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "spotify request failed", "detail": err.Error()})
        }
        defer resp.Body.Close()
        var body interface{}
        json.NewDecoder(resp.Body).Decode(&body)
        setCache(key, body)
        return c.JSON(body)
    })

    app.Get("/recently-played", func(c *fiber.Ctx) error {
        ts, err := tokenSourceFromDB(db)
        if err != nil {
            return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "no token, login required"})
        }
        client := oauth2.NewClient(context.Background(), ts)
        limit := c.Query("limit", "20")
        url := fmt.Sprintf("https://api.spotify.com/v1/me/player/recently-played?limit=%s", limit)
        resp, err := client.Get(url)
        if err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "spotify request failed", "detail": err.Error()})
        }
        defer resp.Body.Close()

        var recentlyPlayed models.RecentlyPlayedResponse
        if err := json.NewDecoder(resp.Body).Decode(&recentlyPlayed); err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to decode spotify response", "detail": err.Error()})
        }

        go syncRecentlyPlayed(db, &recentlyPlayed)

        return c.JSON(recentlyPlayed)
    })

    app.Get("/summary", func(c *fiber.Ctx) error {
        key := "summary:limit="+c.Query("limit","20")+":tr="+c.Query("time_range","medium_term")
        if v, ok := getCache(key); ok {
            return c.JSON(v)
        }
        // aggregate top-tracks and top-artists in parallel
        ts, err := tokenSourceFromDB(db)
        if err != nil {
            return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "no token, login required"})
        }
        client := oauth2.NewClient(context.Background(), ts)
        limit := c.Query("limit", "20")
        timeRange := c.Query("time_range", "medium_term")

        var wg sync.WaitGroup
        wg.Add(2)

        var topTracks interface{}
        var topArtists interface{}
        var ttErr, taErr error

        go func() {
            defer wg.Done()
            url := fmt.Sprintf("https://api.spotify.com/v1/me/top/tracks?limit=%s&time_range=%s", limit, timeRange)
            resp, err := client.Get(url)
            if err != nil {
                ttErr = err
                return
            }
            defer resp.Body.Close()
            json.NewDecoder(resp.Body).Decode(&topTracks)
        }()

        go func() {
            defer wg.Done()
            url := fmt.Sprintf("https://api.spotify.com/v1/me/top/artists?limit=%s&time_range=%s", limit, timeRange)
            resp, err := client.Get(url)
            if err != nil {
                taErr = err
                return
            }
            defer resp.Body.Close()
            json.NewDecoder(resp.Body).Decode(&topArtists)
        }()

        wg.Wait()
        if ttErr != nil || taErr != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to fetch summary", "top_tracks_err": fmt.Sprintf("%v", ttErr), "top_artists_err": fmt.Sprintf("%v", taErr)})
        }
        out := fiber.Map{"top_tracks": topTracks, "top_artists": topArtists}
        setCache(key, out)
        return c.JSON(out)
    })

    // Endpoint for all-time imported tracks from database
    app.Get("/imported-tracks", func(c *fiber.Ctx) error {
        limitStr := c.Query("limit", "50")
        limit := 50
        
        // Parse limit string to int
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
            limit = n
        }
        
        // Import models package to use Track type
        type TrackResult struct {
            SpotifyTrackID string    `json:"spotify_track_id"`
            Name           string    `json:"name"`
            Artist         string    `json:"artist"`
            PlayCount      int       `json:"play_count"`
            TotalMs        int64     `json:"total_ms"`
            AddedAt        time.Time `json:"added_at"`
        }
        
        // Query to get formatted results
        var importedTracks []TrackResult
        err := db.
            Table("tracks").
            Select("spotify_track_id", "name", "artist", "play_count", "total_ms", "added_at").
            Order("play_count DESC").
            Limit(limit).
            Find(&importedTracks).Error
        
        if err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "database query failed", "detail": err.Error()})
        }
        
        return c.JSON(fiber.Map{"items": importedTracks, "count": len(importedTracks)})
    })

    // Endpoint to increment play for a track (called by frontend when user listens)
    app.Post("/tracks/play", func(c *fiber.Ctx) error {
        var payload struct {
            SpotifyTrackID string `json:"spotify_track_id"`
            Name           string `json:"name"`
            Artist         string `json:"artist"`
            Ms             int64  `json:"ms"`
        }
        if err := c.BodyParser(&payload); err != nil {
            return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid payload", "detail": err.Error()})
        }

        var track models.Track
        found := false
        if payload.SpotifyTrackID != "" {
            if err := db.Where("spotify_track_id = ?", payload.SpotifyTrackID).First(&track).Error; err == nil {
                found = true
            }
        }
        if !found && payload.Name != "" && payload.Artist != "" {
            if err := db.Where("name = ? AND artist = ?", payload.Name, payload.Artist).First(&track).Error; err == nil {
                found = true
            }
        }

        if !found {
            // create a minimal track record if not found
            track = models.Track{
                SpotifyTrackID: payload.SpotifyTrackID,
                Name:           payload.Name,
                Artist:         payload.Artist,
                PlayCount:      0,
                TotalMs:        0,
                AddedAt:        time.Now(),
            }
            if err := db.Create(&track).Error; err != nil {
                return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create track", "detail": err.Error()})
            }
        }

        // increment counters
        incMs := payload.Ms
        track.PlayCount += 1
        track.TotalMs += incMs
        if err := db.Save(&track).Error; err != nil {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to update track", "detail": err.Error()})
        }

        return c.JSON(fiber.Map{"status": "ok", "play_count": track.PlayCount, "total_ms": track.TotalMs})
    })

    // Endpoint to return imported summary metrics (total plays, total minutes)
    app.Get("/imported-summary", func(c *fiber.Ctx) error {
        // optional from/to filters on AddedAt
        fromStr := c.Query("from", "")
        toStr := c.Query("to", "")
        var from time.Time
        var to time.Time
        var err error
        if fromStr != "" {
            from, err = time.Parse(time.RFC3339, fromStr)
            if err != nil {
                return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid from param"})
            }
        }
        if toStr != "" {
            to, err = time.Parse(time.RFC3339, toStr)
            if err != nil {
                return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid to param"})
            }
        }

        // Build query
        q := db.Model(&models.Track{})
        if !from.IsZero() {
            q = q.Where("added_at >= ?", from)
        }
        if !to.IsZero() {
            q = q.Where("added_at <= ?", to)
        }

        var totalPlays int64
        var totalMs int64
        // scan into a local struct then assign
        var sums struct{
            TotalPlays int64 `json:"total_plays"`
            TotalMs int64 `json:"total_ms"`
        }
        if err := q.Select("SUM(play_count) as total_plays, SUM(total_ms) as total_ms").Scan(&sums).Error; err != nil {
            // fallback: compute manually
            var tracks []models.Track
            if err2 := q.Find(&tracks).Error; err2 != nil {
                return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to compute summary", "detail": err2.Error()})
            }
            for _, t := range tracks {
                totalPlays += int64(t.PlayCount)
                totalMs += t.TotalMs
            }
        } else {
            totalPlays = sums.TotalPlays
            totalMs = sums.TotalMs
        }

        minutes := float64(totalMs) / 60000.0
        return c.JSON(fiber.Map{"total_plays": totalPlays, "total_ms": totalMs, "total_minutes": minutes})
    })

    // make ClearAnalyticsCache available to other packages via package-level function
    _clearAnalyticsCache = ClearAnalyticsCache
}

// package-level hook set at runtime
var _clearAnalyticsCache func()

// ClearAnalyticsCache clears the analytics in-memory cache.
func ClearAnalyticsCache() {
    if _clearAnalyticsCache != nil {
        _clearAnalyticsCache()
    }
}
