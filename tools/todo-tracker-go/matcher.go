package main

import (
	"crypto/md5"
	"fmt"
	"math"
	"strings"
)

// generateContentHash creates a content-based hash for tracking
func generateContentHash(label, content string) string {
	normalized := strings.ToLower(strings.TrimSpace(label + ":" + content))
	hash := md5.Sum([]byte(normalized))
	return fmt.Sprintf("%x", hash)[:12]
}

// generateUniqueID creates a unique ID for an item
func generateUniqueID(hash string, line int, existingIDs map[string]bool) string {
	baseID := fmt.Sprintf("%s-%d", hash, line)
	if !existingIDs[baseID] {
		return baseID
	}

	// Find next available suffix
	suffix := 2
	for {
		id := fmt.Sprintf("%s-%d-%d", hash, line, suffix)
		if !existingIDs[id] {
			return id
		}
		suffix++
	}
}

// Matcher handles matching current items with existing state
type Matcher struct {
	config Config
}

// NewMatcher creates a new matcher
func NewMatcher(config Config) *Matcher {
	return &Matcher{config: config}
}

// MatchResult contains the results of matching
type MatchResult struct {
	NewState State
	Stats    MatchStats
}

// MatchStats contains statistics about the matching
type MatchStats struct {
	Added      int
	Updated    int
	Completed  int
	Relocated  int
	LineMoved  int
}

// Match matches current items against existing state
func (m *Matcher) Match(currentItems []FoundItem, existingState State, scannedServices map[string]bool) MatchResult {
	now := nowISO()
	newState := State{Items: make(map[string]*StateItem)}
	stats := MatchStats{}

	matchedCurrentIdx := make(map[int]bool)
	matchedStateIDs := make(map[string]bool)
	existingIDs := make(map[string]bool)

	// Build existing IDs set
	for id := range existingState.Items {
		existingIDs[id] = true
	}

	// Helper to find state items by hash prefix
	findByHash := func(hash string) []*stateItemWithID {
		var results []*stateItemWithID
		for id, item := range existingState.Items {
			if strings.HasPrefix(id, hash+"-") || id == hash {
				results = append(results, &stateItemWithID{ID: id, Item: item})
			}
		}
		return results
	}

	// Step 1: Exact hash matches
	for idx, current := range currentItems {
		if matchedCurrentIdx[idx] {
			continue
		}

		candidates := findByHash(current.ContentHash)
		var bestMatch *stateItemWithID

		// Find best match: prefer same file, then closest line
		for _, candidate := range candidates {
			if matchedStateIDs[candidate.ID] || candidate.Item.CompletedAt != "" {
				continue
			}
			if bestMatch == nil {
				bestMatch = candidate
			} else {
				// Prefer same file
				if candidate.Item.File == current.File && bestMatch.Item.File != current.File {
					bestMatch = candidate
				} else if candidate.Item.File == bestMatch.Item.File {
					// Same file preference, choose closer line
					if abs(candidate.Item.Line-current.Line) < abs(bestMatch.Item.Line-current.Line) {
						bestMatch = candidate
					}
				}
			}
		}

		if bestMatch != nil {
			matchedCurrentIdx[idx] = true
			matchedStateIDs[bestMatch.ID] = true

			fileMoved := bestMatch.Item.File != current.File
			lineMoved := bestMatch.Item.Line != current.Line && !fileMoved

			// Update line history
			lineHistory := bestMatch.Item.LineHistory
			if lineHistory == nil {
				lineHistory = []int{bestMatch.Item.Line}
			}
			if fileMoved {
				lineHistory = []int{current.Line}
			} else if lineMoved && !containsInt(lineHistory, current.Line) {
				lineHistory = append(lineHistory, current.Line)
			}

			// Update location history
			locationHistory := bestMatch.Item.LocationHistory
			if locationHistory == nil {
				locationHistory = []LocationEntry{{
					File:    bestMatch.Item.File,
					Line:    bestMatch.Item.Line,
					MovedAt: bestMatch.Item.FirstSeen,
				}}
			}
			if fileMoved {
				locationHistory = append(locationHistory, LocationEntry{
					File:    current.File,
					Line:    current.Line,
					MovedAt: now,
				})
				stats.Relocated++
			}

			fileMoveCount := bestMatch.Item.FileMoveCount
			lineMoveCount := bestMatch.Item.LineMoveCount
			if fileMoved {
				fileMoveCount++
			}
			if lineMoved {
				lineMoveCount++
				stats.LineMoved++
			}

			newState.Items[bestMatch.ID] = &StateItem{
				FirstSeen:          bestMatch.Item.FirstSeen,
				LastSeen:           now,
				LastUpdated:        bestMatch.Item.LastUpdated,
				File:               current.File,
				Line:               current.Line,
				Service:            current.Service,
				LineHistory:        lineHistory,
				LocationHistory:    locationHistory,
				Label:              current.Label,
				Content:            current.Content,
				ContentChangeCount: bestMatch.Item.ContentChangeCount,
				LineMoveCount:      lineMoveCount,
				FileMoveCount:      fileMoveCount,
				LastLineMoved:      ifStr(lineMoved, now, bestMatch.Item.LastLineMoved),
				LastFileMoved:      ifStr(fileMoved, now, bestMatch.Item.LastFileMoved),
				CompletedAt:        "",
			}
		}
	}

	// Step 2: Fuzzy matching for unmatched state items
	for id, stateItem := range existingState.Items {
		if matchedStateIDs[id] || newState.Items[id] != nil {
			continue
		}

		var fuzzyMatchIdx = -1
		var isFileMove bool

		// Try same-file fuzzy match
		for idx, current := range currentItems {
			if matchedCurrentIdx[idx] {
				continue
			}
			if current.File == stateItem.File &&
				abs(current.Line-stateItem.Line) <= 5 &&
				current.Label == stateItem.Label &&
				jaccardSimilarity(current.Content, stateItem.Content) > 0.7 {
				fuzzyMatchIdx = idx
				break
			}
		}

		// Try cross-file fuzzy match if no same-file match
		if fuzzyMatchIdx == -1 {
			for idx, current := range currentItems {
				if matchedCurrentIdx[idx] {
					continue
				}
				if current.File != stateItem.File &&
					current.Label == stateItem.Label &&
					jaccardSimilarity(current.Content, stateItem.Content) > 0.85 {
					fuzzyMatchIdx = idx
					isFileMove = true
					break
				}
			}
		}

		if fuzzyMatchIdx != -1 {
			matchedCurrentIdx[fuzzyMatchIdx] = true
			matchedStateIDs[id] = true
			current := currentItems[fuzzyMatchIdx]

			newID := generateUniqueID(current.ContentHash, current.Line, existingIDs)
			existingIDs[newID] = true

			fileMoved := current.File != stateItem.File
			lineMoved := current.Line != stateItem.Line && !fileMoved

			locationHistory := stateItem.LocationHistory
			if locationHistory == nil {
				locationHistory = []LocationEntry{{
					File:    stateItem.File,
					Line:    stateItem.Line,
					MovedAt: stateItem.FirstSeen,
				}}
			}
			if fileMoved {
				locationHistory = append(locationHistory, LocationEntry{
					File:    current.File,
					Line:    current.Line,
					MovedAt: now,
				})
			}

			lineHistory := stateItem.LineHistory
			if lineHistory == nil {
				lineHistory = []int{stateItem.Line}
			}
			if !fileMoved && !containsInt(lineHistory, current.Line) {
				lineHistory = append(lineHistory, current.Line)
			} else if fileMoved {
				lineHistory = []int{current.Line}
			}

			contentChangeCount := stateItem.ContentChangeCount
			if !isFileMove {
				contentChangeCount++
				stats.Updated++
			}
			if isFileMove {
				stats.Relocated++
			}
			if lineMoved {
				stats.LineMoved++
			}

			newState.Items[newID] = &StateItem{
				FirstSeen:          stateItem.FirstSeen,
				LastSeen:           now,
				LastUpdated:        now,
				File:               current.File,
				Line:               current.Line,
				Service:            current.Service,
				LineHistory:        lineHistory,
				LocationHistory:    locationHistory,
				Label:              current.Label,
				Content:            current.Content,
				ContentChangeCount: contentChangeCount,
				LineMoveCount:      ifInt(lineMoved, stateItem.LineMoveCount+1, stateItem.LineMoveCount),
				FileMoveCount:      ifInt(fileMoved, stateItem.FileMoveCount+1, stateItem.FileMoveCount),
				LastLineMoved:      ifStr(lineMoved, now, stateItem.LastLineMoved),
				LastFileMoved:      ifStr(fileMoved, now, stateItem.LastFileMoved),
				CompletedAt:        "",
			}
		} else {
			// Check if this item's service was scanned
			if scannedServices != nil && !scannedServices[stateItem.Service] {
				// Preserve items from non-scanned services
				newState.Items[id] = stateItem
			} else {
				// Mark as completed
				newState.Items[id] = &StateItem{
					FirstSeen:          stateItem.FirstSeen,
					LastSeen:           stateItem.LastSeen,
					LastUpdated:        stateItem.LastUpdated,
					File:               stateItem.File,
					Line:               stateItem.Line,
					Service:            stateItem.Service,
					LineHistory:        stateItem.LineHistory,
					LocationHistory:    stateItem.LocationHistory,
					Label:              stateItem.Label,
					Content:            stateItem.Content,
					ContentChangeCount: stateItem.ContentChangeCount,
					LineMoveCount:      stateItem.LineMoveCount,
					FileMoveCount:      stateItem.FileMoveCount,
					LastLineMoved:      stateItem.LastLineMoved,
					LastFileMoved:      stateItem.LastFileMoved,
					CompletedAt:        ifStr(stateItem.CompletedAt == "", now, stateItem.CompletedAt),
				}
				if stateItem.CompletedAt == "" {
					stats.Completed++
				}
			}
		}
	}

	// Step 3: Create new items
	for idx, current := range currentItems {
		if matchedCurrentIdx[idx] {
			continue
		}

		newID := generateUniqueID(current.ContentHash, current.Line, existingIDs)
		existingIDs[newID] = true
		stats.Added++

		newState.Items[newID] = &StateItem{
			FirstSeen:          now,
			LastSeen:           now,
			LastUpdated:        now,
			File:               current.File,
			Line:               current.Line,
			Service:            current.Service,
			LineHistory:        []int{current.Line},
			LocationHistory:    nil,
			Label:              current.Label,
			Content:            current.Content,
			ContentChangeCount: 0,
			LineMoveCount:      0,
			FileMoveCount:      0,
			LastLineMoved:      "",
			LastFileMoved:      "",
			CompletedAt:        "",
		}
	}

	return MatchResult{NewState: newState, Stats: stats}
}

// jaccardSimilarity calculates Jaccard similarity between two strings
func jaccardSimilarity(a, b string) float64 {
	setA := make(map[string]bool)
	setB := make(map[string]bool)

	for _, word := range strings.Fields(strings.ToLower(a)) {
		setA[word] = true
	}
	for _, word := range strings.Fields(strings.ToLower(b)) {
		setB[word] = true
	}

	if len(setA) == 0 && len(setB) == 0 {
		return 0
	}

	intersection := 0
	for word := range setA {
		if setB[word] {
			intersection++
		}
	}

	union := len(setA)
	for word := range setB {
		if !setA[word] {
			union++
		}
	}

	if union == 0 {
		return 0
	}

	return float64(intersection) / float64(union)
}

// Helper types and functions

type stateItemWithID struct {
	ID   string
	Item *StateItem
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func containsInt(slice []int, val int) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

func ifStr(cond bool, trueVal, falseVal string) string {
	if cond {
		return trueVal
	}
	return falseVal
}

func ifInt(cond bool, trueVal, falseVal int) int {
	if cond {
		return trueVal
	}
	return falseVal
}

// Used by output.go for priority sorting
func getPriorityIndex(label string, priorities []string) int {
	for i, p := range priorities {
		if p == label {
			return i
		}
	}
	return math.MaxInt32
}
