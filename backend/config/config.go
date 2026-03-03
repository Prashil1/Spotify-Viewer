package config

import (
	"io"
	"os"

	"gopkg.in/yaml.v3"
)

type SpotifyConfig struct {
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
}

type Config struct {
	Port    int           `yaml:"port"`
	DBPath  string        `yaml:"db_path"`
	Spotify SpotifyConfig `yaml:"spotify"`
}

func Load(path string) (*Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	b, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := yaml.Unmarshal(b, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
