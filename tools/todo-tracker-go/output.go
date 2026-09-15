package main

import (
	"fmt"
	"os"
	"sort"
	"strings"
)

// OutputGenerator generates markdown output
type OutputGenerator struct {
	config   Config
	itemType string
}

// NewOutputGenerator creates a new output generator
func NewOutputGenerator(config Config, itemType string) *OutputGenerator {
	return &OutputGenerator{
		config:   config,
		itemType: itemType,
	}
}

// Generate creates the markdown content
func (g *OutputGenerator) Generate(state State) string {
	active := state.GetActiveItems()
	completed := state.GetCompletedItems()

	var sb strings.Builder

	// Header
	sb.WriteString(fmt.Sprintf("# %s\n\n", g.itemType))
	sb.WriteString(fmt.Sprintf("> Last synced: %s\n", formatDate(nowISO())))
	sb.WriteString(fmt.Sprintf("> Active: %d | Completed: %d\n\n", len(active), len(completed)))

	if len(active) == 0 && len(completed) == 0 {
		sb.WriteString("✅ No items found\n")
		return sb.String()
	}

	// Active items
	if len(active) > 0 {
		sb.WriteString(g.generateSection(active, "Active Items", false))
	}

	// Completed items
	if len(completed) > 0 {
		sb.WriteString("---\n\n")
		sb.WriteString(g.generateSection(completed, "Completed Items", true))
	}

	return sb.String()
}

// generateSection generates a section of items
func (g *OutputGenerator) generateSection(items []*StateItemWithID, title string, isCompleted bool) string {
	var sb strings.Builder

	// Group by label
	groups := g.groupByLabel(items)
	sortedLabels := g.sortLabels(groups)

	sb.WriteString(fmt.Sprintf("## %s (%d)\n\n", title, len(items)))

	for _, label := range sortedLabels {
		labelItems := groups[label]
		displayLabel := label
		if label == "NONE" {
			displayLabel = "No Priority"
		}

		sb.WriteString(fmt.Sprintf("### %s (%d)\n\n", displayLabel, len(labelItems)))

		// Sort items within group
		g.sortItems(labelItems, isCompleted)

		for _, item := range labelItems {
			sb.WriteString(g.formatItem(item, isCompleted))
		}
	}

	return sb.String()
}

// groupByLabel groups items by their label
func (g *OutputGenerator) groupByLabel(items []*StateItemWithID) map[string][]*StateItemWithID {
	groups := make(map[string][]*StateItemWithID)
	for _, item := range items {
		label := item.Item.Label
		groups[label] = append(groups[label], item)
	}
	return groups
}

// sortLabels sorts label names by priority order
func (g *OutputGenerator) sortLabels(groups map[string][]*StateItemWithID) []string {
	labels := make([]string, 0, len(groups))
	for label := range groups {
		labels = append(labels, label)
	}

	priorities := append(g.config.Priorities, "NONE")

	sort.Slice(labels, func(i, j int) bool {
		iIdx := getPriorityIndex(labels[i], priorities)
		jIdx := getPriorityIndex(labels[j], priorities)

		if iIdx != jIdx {
			return iIdx < jIdx
		}
		return labels[i] < labels[j] // Alphabetical for custom labels
	})

	return labels
}

// sortItems sorts items within a group
func (g *OutputGenerator) sortItems(items []*StateItemWithID, isCompleted bool) {
	sort.Slice(items, func(i, j int) bool {
		if isCompleted {
			// Completed: newest first
			return items[i].Item.CompletedAt > items[j].Item.CompletedAt
		}
		// Active: oldest first
		return items[i].Item.FirstSeen < items[j].Item.FirstSeen
	})
}

// formatItem formats a single item as markdown
func (g *OutputGenerator) formatItem(item *StateItemWithID, isCompleted bool) string {
	var sb strings.Builder

	checkbox := "[ ]"
	if isCompleted {
		checkbox = "[x]"
	}

	// Build timestamp info
	timeInfo := fmt.Sprintf("Added: %s", formatDate(item.Item.FirstSeen))

	if item.Item.LastUpdated != "" && item.Item.LastUpdated != item.Item.FirstSeen {
		timeInfo += fmt.Sprintf(", Updated: %s", formatDate(item.Item.LastUpdated))
	}

	if item.Item.CompletedAt != "" {
		timeInfo += fmt.Sprintf(", Completed: %s", formatDate(item.Item.CompletedAt))
	}

	// Build change summary
	changeSummary := g.getChangeSummary(item.Item)

	sb.WriteString(fmt.Sprintf("- %s %s _[%s]_%s\n", checkbox, item.Item.Content, timeInfo, changeSummary))
	sb.WriteString(fmt.Sprintf("  %s\n\n", g.getLineInfo(item.Item)))

	return sb.String()
}

// getChangeSummary generates the change summary text
func (g *OutputGenerator) getChangeSummary(item *StateItem) string {
	var changes []string

	if item.ContentChangeCount > 0 {
		changes = append(changes, fmt.Sprintf("Content: %dx", item.ContentChangeCount))
	}

	if item.FileMoveCount > 0 {
		changes = append(changes, fmt.Sprintf("Relocated: %dx", item.FileMoveCount))
	} else if item.LineMoveCount > 0 {
		changes = append(changes, fmt.Sprintf("Line moved: %dx", item.LineMoveCount))
	}

	if len(changes) > 0 {
		return fmt.Sprintf(" (%s)", strings.Join(changes, ", "))
	}
	return ""
}

// getLineInfo generates the file:line info with history
func (g *OutputGenerator) getLineInfo(item *StateItem) string {
	lineInfo := fmt.Sprintf("`%s:%d`", item.File, item.Line)

	// Show relocation history if file was moved
	if len(item.LocationHistory) > 1 {
		var prevLocs []string
		for _, loc := range item.LocationHistory[:len(item.LocationHistory)-1] {
			prevLocs = append(prevLocs, fmt.Sprintf("`%s:%d` (%s)", loc.File, loc.Line, formatDate(loc.MovedAt)))
		}
		lineInfo += fmt.Sprintf("\n  _Previously: %s_", strings.Join(prevLocs, " → "))
	} else if len(item.LineHistory) > 1 {
		// Show line history if only lines changed
		var prevLines []string
		for _, line := range item.LineHistory[:len(item.LineHistory)-1] {
			prevLines = append(prevLines, fmt.Sprintf("line %d", line))
		}
		lineInfo += fmt.Sprintf(" _(previously: %s)_", strings.Join(prevLines, ", "))
	}

	return lineInfo
}

// WriteMarkdown writes the markdown to a file
func (g *OutputGenerator) WriteMarkdown(projectRoot string, state State) error {
	content := g.Generate(state)

	filename := g.config.Output.TodoFile
	if g.itemType == "FIXME" {
		filename = g.config.Output.FixmeFile
	}

	outputPath := filename
	if g.config.Output.Mode == "root" {
		outputPath = filename // Already relative to project root
	}

	fullPath := outputPath
	if projectRoot != "" && projectRoot != "." {
		fullPath = fmt.Sprintf("%s/%s", projectRoot, outputPath)
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// PrintSummary prints a summary to stdout
func PrintSummary(itemType string, state State, stats MatchStats, stateDir string) {
	active := state.GetActiveItems()
	completed := state.GetCompletedItems()

	fmt.Printf("✅ Synced %ss to %s.md\n", itemType, itemType)
	fmt.Printf("   Active: %d | Completed: %d\n", len(active), len(completed))

	if stats.Relocated > 0 {
		fmt.Printf("   🚚 %d item(s) relocated to different files\n", stats.Relocated)
	}
	if stats.LineMoved > 0 {
		fmt.Printf("   📍 %d item(s) moved lines\n", stats.LineMoved)
	}
	if stats.Updated > 0 {
		fmt.Printf("   ✏️  %d item(s) content changed\n", stats.Updated)
	}
	fmt.Printf("📊 State: %s/%s-state.json\n", stateDir, strings.ToLower(itemType))
}
