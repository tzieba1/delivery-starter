package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// State represents the persisted state
type State struct {
	Items map[string]*StateItem `json:"items"`
}

// StateItem represents a tracked TODO/FIXME item
type StateItem struct {
	FirstSeen          string          `json:"firstSeen"`
	LastSeen           string          `json:"lastSeen"`
	LastUpdated        string          `json:"lastUpdated"`
	File               string          `json:"file"`
	Line               int             `json:"line"`
	Service            string          `json:"service"`
	LineHistory        []int           `json:"lineHistory,omitempty"`
	LocationHistory    []LocationEntry `json:"locationHistory,omitempty"`
	Label              string          `json:"label"`
	Content            string          `json:"content"`
	ContentChangeCount int             `json:"contentChangeCount"`
	LineMoveCount      int             `json:"lineMoveCount"`
	FileMoveCount      int             `json:"fileMoveCount"`
	LastLineMoved      string          `json:"lastLineMoved,omitempty"`
	LastFileMoved      string          `json:"lastFileMoved,omitempty"`
	CompletedAt        string          `json:"completedAt,omitempty"`
}

// LocationEntry represents a file location in history
type LocationEntry struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	MovedAt string `json:"movedAt"`
}

// LoadState loads state from a JSON file
func LoadState(stateDir, itemType string) (State, error) {
	statePath := getStatePath(stateDir, itemType)
	state := State{Items: make(map[string]*StateItem)}

	data, err := os.ReadFile(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return state, nil
		}
		return state, err
	}

	if err := json.Unmarshal(data, &state); err != nil {
		// Corrupted state file - start fresh
		return State{Items: make(map[string]*StateItem)}, nil
	}

	if state.Items == nil {
		state.Items = make(map[string]*StateItem)
	}

	return state, nil
}

// SaveState saves state to a JSON file
func SaveState(stateDir, itemType string, state State, config Config) error {
	// Ensure state directory exists
	if err := os.MkdirAll(stateDir, 0755); err != nil {
		return err
	}

	// Purge old completed items
	purgeOldCompleted(&state, config.Tracking)

	statePath := getStatePath(stateDir, itemType)
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(statePath, data, 0644)
}

// getStatePath returns the path to the state file
func getStatePath(stateDir, itemType string) string {
	filename := itemType + "-state.json"
	return filepath.Join(stateDir, filename)
}

// purgeOldCompleted removes old completed items based on config
func purgeOldCompleted(state *State, tracking TrackingConfig) int {
	now := time.Now()
	retentionDuration := time.Duration(tracking.CompletedRetentionDays) * 24 * time.Hour

	// Collect completed items
	type completedItem struct {
		id          string
		completedAt time.Time
	}
	var completed []completedItem

	for id, item := range state.Items {
		if item.CompletedAt != "" {
			t, err := time.Parse(time.RFC3339, item.CompletedAt)
			if err != nil {
				continue
			}
			completed = append(completed, completedItem{id: id, completedAt: t})
		}
	}

	// Sort by completed date (newest first)
	sort.Slice(completed, func(i, j int) bool {
		return completed[i].completedAt.After(completed[j].completedAt)
	})

	// Determine which to remove
	toRemove := make(map[string]bool)
	for i, item := range completed {
		age := now.Sub(item.completedAt)
		if age > retentionDuration || i >= tracking.MaxCompletedItems {
			toRemove[item.id] = true
		}
	}

	// Remove old items
	for id := range toRemove {
		delete(state.Items, id)
	}

	return len(toRemove)
}

// GetActiveItems returns all non-completed items
func (s *State) GetActiveItems() []*StateItemWithID {
	var items []*StateItemWithID
	for id, item := range s.Items {
		if item.CompletedAt == "" {
			items = append(items, &StateItemWithID{ID: id, Item: item})
		}
	}
	return items
}

// GetCompletedItems returns all completed items
func (s *State) GetCompletedItems() []*StateItemWithID {
	var items []*StateItemWithID
	for id, item := range s.Items {
		if item.CompletedAt != "" {
			items = append(items, &StateItemWithID{ID: id, Item: item})
		}
	}
	return items
}

// StateItemWithID is a helper that pairs an item with its ID
type StateItemWithID struct {
	ID   string
	Item *StateItem
}

// nowISO returns the current time in ISO format
func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// formatDate formats an ISO timestamp to YYYY-MM-DD
func formatDate(iso string) string {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return iso[:10] // Fallback: just take first 10 chars
	}
	return t.Format("2006-01-02")
}
