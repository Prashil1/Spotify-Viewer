package models

import "time"

// User represents the single user of the app
type User struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DisplayName string    `json:"display_name"`
	SpotifyID   string    `json:"spotify_id"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Track is a simplified track record for analytics
type Track struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	SpotifyTrackID string    `json:"spotify_track_id"`
	Name           string    `json:"name"`
	Artist         string    `json:"artist"`
	PlayCount      int       `json:"play_count"`
	// TotalMs stores the total milliseconds listened for this track (aggregated)
	TotalMs        int64     `json:"total_ms"`
	AddedAt        time.Time `json:"added_at"`
}


// RecentlyPlayedResponse is the top-level structure for the Spotify API response
type RecentlyPlayedResponse struct {
	Items []PlayHistoryObject `json:"items"`
}

// PlayHistoryObject represents a single recently played track
type PlayHistoryObject struct {
	Track    TrackObject `json:"track"`
	PlayedAt time.Time   `json:"played_at"`
}

// TrackObject is a simplified representation of a Spotify track
type TrackObject struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Artists    []ArtistObject `json:"artists"`
	DurationMs int            `json:"duration_ms"`
}

// ArtistObject is a simplified representation of a Spotify artist
type ArtistObject struct {
	Name string `json:"name"`
}

// Token stores OAuth token details for the single-user app
type Token struct {
	ID           uint   `gorm:"primaryKey" json:"id"`
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	RefreshToken string `json:"refresh_token"`
	Expiry       time.Time `json:"expiry"`
}
