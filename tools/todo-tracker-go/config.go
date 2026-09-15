package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config represents the .todorc.json configuration
type Config struct {
	Services  []ServiceConfig `json:"services"`
	Output    OutputConfig    `json:"output"`
	Defaults  DefaultsConfig  `json:"defaults"`
	Priorities []string       `json:"priorities"`
	Tracking  TrackingConfig  `json:"tracking"`
}

type ServiceConfig struct {
	Name    string   `json:"name"`
	Path    string   `json:"path"`
	Include []string `json:"include"`
	Exclude []string `json:"exclude"`
}

type OutputConfig struct {
	Mode      string `json:"mode"`
	TodoFile  string `json:"todoFile"`
	FixmeFile string `json:"fixmeFile"`
	StateDir  string `json:"stateDir"`
}

type DefaultsConfig struct {
	Exclude []string `json:"exclude"`
}

type TrackingConfig struct {
	MaxCompletedItems      int `json:"maxCompletedItems"`
	CompletedRetentionDays int `json:"completedRetentionDays"`
}

// DefaultConfig returns a sensible default configuration
func DefaultConfig() Config {
	return Config{
		Services: []ServiceConfig{},
		Output: OutputConfig{
			Mode:      "root",
			TodoFile:  "TODO.md",
			FixmeFile: "FIXME.md",
			StateDir:  ".todo-tracker",
		},
		Defaults: DefaultsConfig{
			Exclude: []string{
				"node_modules", ".git", "dist", "build", ".next",
				"coverage", "*.min.js", "*.bundle.js", "*.lock",
				"*.md", "README*", "__pycache__", "*.pyc",
			},
		},
		Priorities: []string{"URGENT", "HIGH", "MEDIUM", "LOW"},
		Tracking: TrackingConfig{
			MaxCompletedItems:      50,
			CompletedRetentionDays: 30,
		},
	}
}

// LoadConfig loads configuration from .todorc.json
func LoadConfig(configPath string) (Config, error) {
	config := DefaultConfig()

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return config, nil // Use defaults if no config file
		}
		return config, err
	}

	if err := json.Unmarshal(data, &config); err != nil {
		return config, err
	}

	return config, nil
}

// FindConfigFile searches for .todorc.json starting from the given directory
func FindConfigFile(startDir string) (string, error) {
	dir := startDir
	for {
		configPath := filepath.Join(dir, ".todorc.json")
		if _, err := os.Stat(configPath); err == nil {
			return configPath, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			// Reached root, no config found
			return "", os.ErrNotExist
		}
		dir = parent
	}
}

// GetServiceByName returns a service config by name
func (c *Config) GetServiceByName(name string) *ServiceConfig {
	for i := range c.Services {
		if c.Services[i].Name == name {
			return &c.Services[i]
		}
	}
	return nil
}

// GetServiceNames returns all service names
func (c *Config) GetServiceNames() []string {
	names := make([]string, len(c.Services))
	for i, s := range c.Services {
		names[i] = s.Name
	}
	return names
}
