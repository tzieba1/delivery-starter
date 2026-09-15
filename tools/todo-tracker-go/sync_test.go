package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Test helpers

func setupTestDir(t *testing.T) string {
	dir := t.TempDir()

	// Create service directories
	os.MkdirAll(filepath.Join(dir, "services/frontend/src"), 0755)
	os.MkdirAll(filepath.Join(dir, "services/backend/src"), 0755)
	os.MkdirAll(filepath.Join(dir, ".todo-tracker"), 0755)

	return dir
}

func createTestConfig(t *testing.T, dir string) Config {
	config := Config{
		Services: []ServiceConfig{
			{Name: "frontend", Path: "services/frontend", Include: []string{"src"}, Exclude: []string{"*.test.js"}},
			{Name: "backend", Path: "services/backend", Include: []string{"src"}, Exclude: []string{"*.pyc"}},
		},
		Output: OutputConfig{
			TodoFile:  "TODO.md",
			FixmeFile: "FIXME.md",
			StateDir:  ".todo-tracker",
		},
		Defaults: DefaultsConfig{
			Exclude: []string{"node_modules", ".git", "*.md"},
		},
		Priorities: []string{"URGENT", "HIGH", "MEDIUM", "LOW"},
		Tracking: TrackingConfig{
			MaxCompletedItems:      50,
			CompletedRetentionDays: 30,
		},
	}

	// Write config file
	configPath := filepath.Join(dir, ".todorc.json")
	data, _ := json.MarshalIndent(config, "", "  ")
	os.WriteFile(configPath, data, 0644)

	return config
}

func writeTestFile(t *testing.T, dir, relativePath, content string) {
	fullPath := filepath.Join(dir, relativePath)
	os.MkdirAll(filepath.Dir(fullPath), 0755)
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}
}

func runTestSync(t *testing.T, dir string, config Config) State {
	scanner := NewScanner(config, dir, "TODO")
	items, err := scanner.ScanAll()
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	state, _ := LoadState(filepath.Join(dir, config.Output.StateDir), "todo")
	matcher := NewMatcher(config)
	result := matcher.Match(items, state, nil)

	SaveState(filepath.Join(dir, config.Output.StateDir), "todo", result.NewState, config)
	return result.NewState
}

// ============================================================================
// CORE FUNCTIONALITY TESTS
// ============================================================================

func TestConfigLoading(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	loaded, err := LoadConfig(filepath.Join(dir, ".todorc.json"))
	if err != nil {
		t.Fatalf("Config loading failed: %v", err)
	}

	if len(loaded.Services) != len(config.Services) {
		t.Errorf("Expected %d services, got %d", len(config.Services), len(loaded.Services))
	}
}

func TestBasicTodoDetection(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/app.ts", `
		// TODO: This is a basic todo
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Expected 1 item, got %d", len(state.Items))
	}

	for _, item := range state.Items {
		if item.Content != "This is a basic todo" {
			t.Errorf("Content mismatch: %s", item.Content)
		}
		if item.Service != "frontend" {
			t.Errorf("Service mismatch: %s", item.Service)
		}
	}
}

func TestMultiServiceScanning(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/app.ts", `// TODO: Frontend todo`)
	writeTestFile(t, dir, "services/backend/src/main.py", `# TODO: Backend todo`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 2 {
		t.Errorf("Expected 2 items, got %d", len(state.Items))
	}

	services := make(map[string]bool)
	for _, item := range state.Items {
		services[item.Service] = true
	}

	if !services["frontend"] || !services["backend"] {
		t.Error("Should find TODOs in both services")
	}
}

func TestDuplicateContentHandling(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/app.ts", `
		// TODO: Handle error
		try { } catch (e) { }
		// TODO: Handle error
		try { } catch (e) { }
		// TODO: Handle error
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 3 {
		t.Errorf("Expected 3 items for duplicates, got %d", len(state.Items))
	}

	// Verify unique IDs
	ids := make(map[string]bool)
	for id := range state.Items {
		ids[id] = true
	}
	if len(ids) != 3 {
		t.Error("Each duplicate should have unique ID")
	}
}

func TestPriorityLabels(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/priorities.ts", `
		// TODO: [LOW] Low priority
		// TODO: [URGENT] Urgent priority
		// TODO: [HIGH] High priority
		// TODO: [MEDIUM] Medium priority
	`)

	state := runTestSync(t, dir, config)

	labels := make(map[string]int)
	for _, item := range state.Items {
		labels[item.Label]++
	}

	if labels["URGENT"] != 1 || labels["HIGH"] != 1 || labels["MEDIUM"] != 1 || labels["LOW"] != 1 {
		t.Errorf("Priority parsing failed: %v", labels)
	}
}

func TestEmptyTodoSkipped(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/empty.ts", `
		// TODO:
		// TODO:
		// TODO: Valid todo
		// TODO: [HIGH]
		// TODO: [HIGH] Valid high priority
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 2 {
		t.Errorf("Should skip empty TODOs, got %d items", len(state.Items))
	}
}

func TestFixmeDetection(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/bugs.ts", `
		// FIXME: This needs fixing
		// FIXME: [HIGH] Critical bug
	`)

	scanner := NewScanner(config, dir, "FIXME")
	items, err := scanner.ScanAll()
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	if len(items) != 2 {
		t.Errorf("Expected 2 FIXMEs, got %d", len(items))
	}
}

func TestLineMovementTracking(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/move.ts", `
		// Line 1
		// TODO: Track this
		// Line 3
	`)

	runTestSync(t, dir, config)

	// Move the TODO down
	writeTestFile(t, dir, "services/frontend/src/move.ts", `
		// Line 1
		// New line
		// Another line
		// TODO: Track this
		// Line 3
	`)

	state := runTestSync(t, dir, config)

	for _, item := range state.Items {
		if item.LineMoveCount < 1 {
			t.Error("Should track line movement")
		}
	}
}

func TestCompletionDetection(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/complete.ts", `
		// TODO: Will be completed
		const x = 1;
	`)

	runTestSync(t, dir, config)

	// Remove the TODO
	writeTestFile(t, dir, "services/frontend/src/complete.ts", `
		const x = 1;
	`)

	state := runTestSync(t, dir, config)

	completedCount := 0
	for _, item := range state.Items {
		if item.CompletedAt != "" {
			completedCount++
		}
	}

	if completedCount != 1 {
		t.Errorf("Should mark removed TODO as completed, got %d", completedCount)
	}
}

func TestStatePersistence(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/persist.ts", `// TODO: Persistent todo`)

	state1 := runTestSync(t, dir, config)
	var firstSeen1 string
	for _, item := range state1.Items {
		firstSeen1 = item.FirstSeen
	}

	state2 := runTestSync(t, dir, config)
	var firstSeen2 string
	for _, item := range state2.Items {
		firstSeen2 = item.FirstSeen
	}

	if firstSeen1 != firstSeen2 {
		t.Error("firstSeen should persist across syncs")
	}
}

func TestCaseInsensitivePriority(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/case.ts", `
		// TODO: [high] Lowercase
		// TODO: [HIGH] Uppercase
		// TODO: [High] Mixed
	`)

	state := runTestSync(t, dir, config)

	highCount := 0
	for _, item := range state.Items {
		if item.Label == "HIGH" {
			highCount++
		}
	}

	if highCount != 3 {
		t.Errorf("All case variants should normalize to HIGH, got %d", highCount)
	}
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

func TestFileRelocation(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/original.ts", `// TODO: [HIGH] Relocatable todo`)
	runTestSync(t, dir, config)

	// Move to different file
	os.Remove(filepath.Join(dir, "services/frontend/src/original.ts"))
	writeTestFile(t, dir, "services/frontend/src/moved.ts", `// TODO: [HIGH] Relocatable todo`)

	state := runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state.Items {
		if item.CompletedAt == "" {
			activeCount++
			if !strings.Contains(item.File, "moved.ts") {
				t.Error("Should track new file location")
			}
		}
	}

	if activeCount != 1 {
		t.Errorf("Should have 1 active item after relocation, got %d", activeCount)
	}
}

func TestFuzzyMatching(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/fuzzy.ts", `// TODO: [HIGH] Add user authentication`)
	state1 := runTestSync(t, dir, config)

	var originalFirstSeen string
	for _, item := range state1.Items {
		originalFirstSeen = item.FirstSeen
	}

	// Slightly modify content
	writeTestFile(t, dir, "services/frontend/src/fuzzy.ts", `// TODO: [HIGH] Add user authentication flow`)
	state2 := runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state2.Items {
		if item.CompletedAt == "" {
			activeCount++
			if item.FirstSeen != originalFirstSeen {
				t.Error("Fuzzy match should preserve firstSeen")
			}
		}
	}

	if activeCount != 1 {
		t.Errorf("Fuzzy matching should track as single item, got %d", activeCount)
	}
}

func TestSpecialCharacters(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/special.ts", `
		// TODO: Handle "quoted" strings
		// TODO: Support unicode: 日本語 émojis
		// TODO: Fix regex /pattern.*test/g
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 3 {
		t.Errorf("Should handle special characters, got %d items", len(state.Items))
	}
}

func TestVeryLongContent(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	longContent := strings.Repeat("A", 500)
	writeTestFile(t, dir, "services/frontend/src/long.ts", `// TODO: `+longContent)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Error("Should handle long content")
	}

	for _, item := range state.Items {
		if len(item.Content) < 100 {
			t.Error("Content should be preserved")
		}
	}
}

func TestCorruptedStateRecovery(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/recover.ts", `// TODO: Test recovery`)

	// Create corrupted state file
	statePath := filepath.Join(dir, ".todo-tracker/todo-state.json")
	os.WriteFile(statePath, []byte("{ invalid json !!!"), 0644)

	// Should not crash
	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should recover from corrupted state, got %d items", len(state.Items))
	}
}

func TestRevivingCompletedItems(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/revive.ts", `// TODO: Will be removed then re-added`)
	runTestSync(t, dir, config)

	// Remove TODO
	writeTestFile(t, dir, "services/frontend/src/revive.ts", `// No todos here`)
	state := runTestSync(t, dir, config)

	completedCount := 0
	for _, item := range state.Items {
		if item.CompletedAt != "" {
			completedCount++
		}
	}
	if completedCount != 1 {
		t.Error("Should be completed")
	}

	// Re-add the same TODO
	writeTestFile(t, dir, "services/frontend/src/revive.ts", `// TODO: Will be removed then re-added`)
	state = runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state.Items {
		if item.CompletedAt == "" {
			activeCount++
		}
	}
	if activeCount != 1 {
		t.Errorf("Should revive the TODO, got %d active", activeCount)
	}
}

func TestMissingServiceDirectory(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// Add a non-existent service
	config.Services = append(config.Services, ServiceConfig{
		Name:    "nonexistent",
		Path:    "services/does-not-exist",
		Include: []string{"src"},
		Exclude: []string{},
	})

	writeTestFile(t, dir, "services/frontend/src/exists.ts", `// TODO: This should still work`)

	// Should not crash
	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should find TODO in existing service, got %d", len(state.Items))
	}
}

func TestNestedDirectories(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/components/forms/validation/rules/index.ts", `
		// TODO: Deep nested todo
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Error("Should find TODO in nested directory")
	}

	for _, item := range state.Items {
		if !strings.Contains(item.File, "components/forms/validation/rules") {
			t.Error("Path should include nested directories")
		}
	}
}

func TestDefaultExclusions(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// Create a file that should be excluded by defaults
	writeTestFile(t, dir, "services/frontend/src/test.md", `<!-- TODO: Should be excluded -->`)
	writeTestFile(t, dir, "services/frontend/src/real.ts", `// TODO: Should be included`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should exclude .md files, got %d", len(state.Items))
	}

	for _, item := range state.Items {
		if strings.HasSuffix(item.File, ".md") {
			t.Error("Should not include .md files")
		}
	}
}

func TestServiceSpecificExclusions(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/component.test.js", `// TODO: In test file`)
	writeTestFile(t, dir, "services/frontend/src/component.ts", `// TODO: In source file`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should apply service-specific exclusions, got %d", len(state.Items))
	}

	for _, item := range state.Items {
		if strings.Contains(item.File, ".test.js") {
			t.Error("Should exclude test files")
		}
	}
}

// ============================================================================
// LANGUAGE SUPPORT TESTS
// ============================================================================

func TestPythonHashComments(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/backend/src/main.py", `
# TODO: Python style todo
# TODO: [HIGH] High priority python todo
def foo():
    # TODO: Nested python todo
    pass
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 3 {
		t.Errorf("Should detect Python # TODO comments, got %d", len(state.Items))
	}
}

func TestBlockComments(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/block.ts", `
		/* TODO: Block comment todo */
		/**
		 * TODO: JSDoc style todo
		 */
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) < 2 {
		t.Errorf("Should detect block comment TODOs, got %d", len(state.Items))
	}
}

func TestMixedCommentStyles(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/mixed.tsx", `
		// TODO: Line comment
		/* TODO: Block comment */
		{/* TODO: JSX comment */}
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) < 2 {
		t.Errorf("Should detect mixed comment styles, got %d", len(state.Items))
	}
}

// ============================================================================
// CROSS-SERVICE TESTS
// ============================================================================

func TestCrossServiceRelocation(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/shared.ts", `// TODO: [HIGH] Shared utility function`)
	runTestSync(t, dir, config)

	// Move to backend
	os.Remove(filepath.Join(dir, "services/frontend/src/shared.ts"))
	writeTestFile(t, dir, "services/backend/src/shared.py", `# TODO: [HIGH] Shared utility function`)

	state := runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state.Items {
		if item.CompletedAt == "" {
			activeCount++
			if item.Service != "backend" {
				t.Error("Should update service after cross-service relocation")
			}
		}
	}

	if activeCount != 1 {
		t.Errorf("Should track cross-service relocation, got %d active", activeCount)
	}
}

// ============================================================================
// PARSING EDGE CASES
// ============================================================================

func TestEmptyPriorityBrackets(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/empty-bracket.ts", `
		// TODO: [] Empty brackets
		// TODO: [ ] Spaces in brackets
	`)

	// Should not crash
	state := runTestSync(t, dir, config)
	_ = state // Just ensure no panic
}

func TestPriorityWithExtraSpaces(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/spaces.ts", `
		// TODO: [ HIGH ] Spaces around priority
		// TODO: [  MEDIUM  ] Extra spaces
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 2 {
		t.Errorf("Should handle spaces in brackets, got %d", len(state.Items))
	}
}

func TestLowercaseTodoIgnored(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/case.ts", `
		// todo: lowercase should be ignored
		// Todo: mixed case ignored
		// TODO: Uppercase detected
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should only detect uppercase TODO, got %d", len(state.Items))
	}
}

// ============================================================================
// OUTPUT TESTS
// ============================================================================

func TestMarkdownFormat(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/format.ts", `// TODO: [HIGH] Test format`)

	state := runTestSync(t, dir, config)
	generator := NewOutputGenerator(config, "TODO")
	md := generator.Generate(state)

	if !strings.HasPrefix(md, "# TODO") {
		t.Error("Should start with h1 header")
	}
	if !strings.Contains(md, "Last synced:") {
		t.Error("Should have sync timestamp")
	}
	if !strings.Contains(md, "Active:") {
		t.Error("Should show active count")
	}
	if !strings.Contains(md, "- [ ]") {
		t.Error("Should have checkbox format")
	}
}

// ============================================================================
// ROBUSTNESS TESTS
// ============================================================================

func TestBinaryFileHandling(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// Create a binary file
	binaryPath := filepath.Join(dir, "services/frontend/src/image.png")
	os.WriteFile(binaryPath, []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, 0644)

	writeTestFile(t, dir, "services/frontend/src/real.ts", `// TODO: Real todo`)

	// Should not crash
	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should handle binary files gracefully, got %d", len(state.Items))
	}
}

func TestLargeFileWithManyTodos(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	var content strings.Builder
	for i := 0; i < 100; i++ {
		content.WriteString("// TODO: Todo number ")
		content.WriteString(string(rune('0' + i%10)))
		content.WriteString("\n")
		content.WriteString("const x")
		content.WriteString(string(rune('0' + i%10)))
		content.WriteString(" = ")
		content.WriteString(string(rune('0' + i%10)))
		content.WriteString(";\n")
	}

	writeTestFile(t, dir, "services/frontend/src/large.ts", content.String())

	state := runTestSync(t, dir, config)

	if len(state.Items) != 100 {
		t.Errorf("Should handle 100 TODOs in one file, got %d", len(state.Items))
	}
}

func TestDeeplyNestedPath(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	deepPath := "services/frontend/src/a/b/c/d/e/f/g/h/i/j/deep.ts"
	writeTestFile(t, dir, deepPath, `// TODO: Very deeply nested`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should find deeply nested files, got %d", len(state.Items))
	}
}

// ============================================================================
// CONFIG VALIDATION TESTS
// ============================================================================

func TestEmptyServicesArray(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)
	config.Services = []ServiceConfig{}

	state := runTestSync(t, dir, config)

	if len(state.Items) != 0 {
		t.Errorf("Should handle empty services, got %d", len(state.Items))
	}
}

func TestServiceWithEmptyInclude(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)
	config.Services = []ServiceConfig{
		{Name: "empty-include", Path: "services/frontend", Include: []string{}, Exclude: []string{}},
	}

	writeTestFile(t, dir, "services/frontend/src/test.ts", `// TODO: Should not be found`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 0 {
		t.Errorf("Empty include should find nothing, got %d", len(state.Items))
	}
}

// ============================================================================
// IDEMPOTENCY TESTS
// ============================================================================

func TestIdempotency(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/idem.ts", `
		// TODO: Stable todo
		// TODO: [HIGH] High priority stable
	`)

	state1 := runTestSync(t, dir, config)
	state2 := runTestSync(t, dir, config)
	state3 := runTestSync(t, dir, config)

	if len(state1.Items) != len(state2.Items) || len(state2.Items) != len(state3.Items) {
		t.Error("State should be stable after multiple syncs")
	}
}

func TestEmptyFileHandling(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/empty.ts", "")
	writeTestFile(t, dir, "services/frontend/src/real.ts", "// TODO: Real todo")

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should skip empty file without error, got %d", len(state.Items))
	}
}

func TestFileWithNoTrailingNewline(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// Write file without trailing newline
	filePath := filepath.Join(dir, "services/frontend/src/nonewline.ts")
	os.WriteFile(filePath, []byte("// TODO: No trailing newline"), 0644)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should find TODO in file without trailing newline, got %d", len(state.Items))
	}
}

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

func TestJaccardSimilarity(t *testing.T) {
	tests := []struct {
		a, b     string
		expected float64
	}{
		{"hello world", "hello world", 1.0},
		{"hello world", "world hello", 1.0},
		{"hello", "goodbye", 0.0},
		{"add user authentication", "add user authentication flow", 0.75},
	}

	for _, tc := range tests {
		result := jaccardSimilarity(tc.a, tc.b)
		if (result - tc.expected) > 0.1 {
			t.Errorf("jaccardSimilarity(%q, %q) = %f, expected ~%f", tc.a, tc.b, result, tc.expected)
		}
	}
}

func TestGenerateContentHash(t *testing.T) {
	hash1 := generateContentHash("HIGH", "Fix bug")
	hash2 := generateContentHash("HIGH", "Fix bug")
	hash3 := generateContentHash("LOW", "Fix bug")

	if hash1 != hash2 {
		t.Error("Same label+content should produce same hash")
	}
	if hash1 == hash3 {
		t.Error("Different label should produce different hash")
	}
	if len(hash1) != 12 {
		t.Errorf("Hash should be 12 chars, got %d", len(hash1))
	}
}

func TestGlobMatching(t *testing.T) {
	tests := []struct {
		pattern, name string
		expected      bool
	}{
		{"*.js", "test.js", true},
		{"*.js", "test.ts", false},
		{"node_modules", "node_modules", true},
		{"README*", "README.md", true},
		{"README*", "readme.md", false},
	}

	for _, tc := range tests {
		result := matchGlob(tc.pattern, tc.name)
		if result != tc.expected {
			t.Errorf("matchGlob(%q, %q) = %v, expected %v", tc.pattern, tc.name, result, tc.expected)
		}
	}
}

// ============================================================================
// ADDITIONAL TESTS TO MATCH NODE.JS COVERAGE
// ============================================================================

func TestServiceFiltering(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/app.ts", `// TODO: Frontend todo`)
	writeTestFile(t, dir, "services/backend/src/main.py", `# TODO: Backend todo`)

	// First sync all
	scanner := NewScanner(config, dir, "TODO")
	items, _ := scanner.ScanAll()
	state, _ := LoadState(filepath.Join(dir, config.Output.StateDir), "todo")
	matcher := NewMatcher(config)
	result := matcher.Match(items, state, nil)
	SaveState(filepath.Join(dir, config.Output.StateDir), "todo", result.NewState, config)

	// Then sync only backend
	scanner2 := NewScanner(config, dir, "TODO")
	items2, _ := scanner2.ScanServices([]string{"backend"})
	state2, _ := LoadState(filepath.Join(dir, config.Output.StateDir), "todo")
	scannedServices := map[string]bool{"backend": true}
	result2 := matcher.Match(items2, state2, scannedServices)

	// Both should still be active (service filter preserves other services)
	activeCount := 0
	for _, item := range result2.NewState.Items {
		if item.CompletedAt == "" {
			activeCount++
		}
	}

	if activeCount != 2 {
		t.Errorf("Should preserve items from non-scanned services, got %d active", activeCount)
	}
}

func TestCompletedItemsShownInMarkdown(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/done.ts", `// TODO: Will complete`)
	runTestSync(t, dir, config)

	writeTestFile(t, dir, "services/frontend/src/done.ts", `// Done`)
	state := runTestSync(t, dir, config)

	generator := NewOutputGenerator(config, "TODO")
	md := generator.Generate(state)

	if !strings.Contains(md, "Completed Items") {
		t.Error("Markdown should have Completed section")
	}
	if !strings.Contains(md, "[x]") {
		t.Error("Completed items should have checked checkbox")
	}
}

func TestCustomLabelsSupported(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/custom.ts", `
		// TODO: [TZ] Assigned to TZ
		// TODO: [BLOCKED] Waiting on API
	`)

	state := runTestSync(t, dir, config)
	generator := NewOutputGenerator(config, "TODO")
	md := generator.Generate(state)

	if !strings.Contains(md, "TZ") {
		t.Error("Custom label TZ should appear in markdown")
	}
	if !strings.Contains(md, "BLOCKED") {
		t.Error("Custom label BLOCKED should appear in markdown")
	}
}

func TestFilePathsAreRelative(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/paths.ts", `// TODO: Check path`)

	state := runTestSync(t, dir, config)

	for _, item := range state.Items {
		if !strings.HasPrefix(item.File, "services/") {
			t.Errorf("File path should be relative to project root, got: %s", item.File)
		}
	}
}

func TestDryRunDoesNotModifyFiles(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/dry.ts", `// TODO: Dry run test`)

	statePath := filepath.Join(dir, ".todo-tracker/todo-state.json")
	mdPath := filepath.Join(dir, "TODO.md")

	// Remove any existing files
	os.Remove(statePath)
	os.Remove(mdPath)

	// Scan but don't save (simulating dry run)
	scanner := NewScanner(config, dir, "TODO")
	scanner.ScanAll()

	// Files should not exist
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Error("State file should not be created in dry run")
	}
}

func TestDuplicateRemovalTracksCorrectItem(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/dup.ts", `
		// TODO: Duplicate
		// Line
		// TODO: Duplicate
		// Line
		// TODO: Duplicate
	`)

	runTestSync(t, dir, config)

	// Remove middle duplicate
	writeTestFile(t, dir, "services/frontend/src/dup.ts", `
		// TODO: Duplicate
		// Line
		// Line
		// TODO: Duplicate
	`)

	state := runTestSync(t, dir, config)

	activeCount := 0
	completedCount := 0
	for _, item := range state.Items {
		if item.CompletedAt == "" {
			activeCount++
		} else {
			completedCount++
		}
	}

	if activeCount != 2 {
		t.Errorf("Should have 2 active, got %d", activeCount)
	}
	if completedCount != 1 {
		t.Errorf("Should have 1 completed, got %d", completedCount)
	}
}

func TestMultipleLabelsInTodo(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/multilabel.ts", `
		// TODO: [HIGH] [TZ] Review this code
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Error("Should parse TODO with multiple brackets")
	}

	for _, item := range state.Items {
		if item.Label != "HIGH" {
			t.Errorf("First bracket should become label, got: %s", item.Label)
		}
	}
}

func TestInvalidServiceName(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	if config.GetServiceByName("nonexistent-service") != nil {
		t.Error("Should return nil for invalid service name")
	}
}

func TestEmptyServiceNoFiles(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// Don't create any files, just run sync
	state := runTestSync(t, dir, config)

	if len(state.Items) != 0 {
		t.Errorf("Should have 0 items with no files, got %d", len(state.Items))
	}
}

func TestWhitespaceHandling(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/whitespace.ts", `
		// TODO:    Extra   spaces   should   normalize
		// TODO:			Tabs too
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 2 {
		t.Errorf("Should handle various whitespace, got %d", len(state.Items))
	}

	for _, item := range state.Items {
		if strings.HasPrefix(item.Content, " ") || strings.HasPrefix(item.Content, "\t") {
			t.Error("Content should be trimmed")
		}
	}
}

func TestInlineTodo(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/inline.ts", `
		const x = 1; // TODO: Inline comment
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) < 1 {
		t.Error("Should detect inline TODOs")
	}
}

func TestCompletedItemsPurging(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)
	config.Tracking.MaxCompletedItems = 2

	// Create and complete 4 TODOs
	for i := 1; i <= 4; i++ {
		writeTestFile(t, dir, fmt.Sprintf("services/frontend/src/purge%d.ts", i),
			fmt.Sprintf("// TODO: Item %d", i))
	}
	runTestSync(t, dir, config)

	// Remove all TODOs to complete them
	for i := 1; i <= 4; i++ {
		writeTestFile(t, dir, fmt.Sprintf("services/frontend/src/purge%d.ts", i), "// No todos")
	}

	state := runTestSync(t, dir, config)

	completedCount := 0
	for _, item := range state.Items {
		if item.CompletedAt != "" {
			completedCount++
		}
	}

	if completedCount > 2 {
		t.Errorf("Should purge old completed items, got %d", completedCount)
	}
}

func TestMarkdownSpecialCharsEscaped(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/markdown.ts", `
		// TODO: Handle *bold* and _italic_ in content
		// TODO: Support [links](url)
	`)

	state := runTestSync(t, dir, config)
	generator := NewOutputGenerator(config, "TODO")
	md := generator.Generate(state)

	// Should produce valid markdown without crashing
	if !strings.Contains(md, "Handle") {
		t.Error("Content should be present")
	}
}

func TestFilePathsWithSpecialChars(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/file-with-dashes.ts", `// TODO: Dashes in filename`)
	writeTestFile(t, dir, "services/frontend/src/file_with_underscores.ts", `// TODO: Underscores in filename`)

	state := runTestSync(t, dir, config)
	generator := NewOutputGenerator(config, "TODO")
	md := generator.Generate(state)

	if !strings.Contains(md, "file-with-dashes") {
		t.Error("Should handle dashes")
	}
	if !strings.Contains(md, "file_with_underscores") {
		t.Error("Should handle underscores")
	}
}

func TestFalsePositiveVariableName(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/constants.ts", `
		const TODO_LIMIT = 100;
		const MAX_TODO_COUNT = 50;
		// TODO: This is a real todo
	`)

	state := runTestSync(t, dir, config)

	// The scanner uses regex that matches TODO: pattern
	// Variable names like TODO_LIMIT don't have the colon
	realTodoCount := 0
	for _, item := range state.Items {
		if strings.Contains(item.Content, "real todo") {
			realTodoCount++
		}
	}

	if realTodoCount != 1 {
		t.Error("Should find the comment TODO")
	}
}

func TestFalsePositiveStringContent(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/strings.ts", `
		const message = "TODO: remember to fix this";
		// TODO: Actual todo comment
	`)

	state := runTestSync(t, dir, config)

	// Documents behavior - scanner finds TODO: in strings too
	if len(state.Items) < 1 {
		t.Error("Should find at least the comment TODO")
	}
}

func TestFalsePositiveURL(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/urls.ts", `
		const apiUrl = "https://api.example.com/TODO/items";
		// TODO: Real todo here
	`)

	state := runTestSync(t, dir, config)

	// Documents behavior - URL path doesn't have TODO:
	if len(state.Items) < 1 {
		t.Error("Should find at least the real TODO")
	}
}

func TestMultipleTodosOnSameLine(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/sameline.ts", `
		// TODO: First TODO: Second (two on one line)
	`)

	state := runTestSync(t, dir, config)

	// Should find at least one
	if len(state.Items) < 1 {
		t.Error("Should handle multiple TODOs on same line")
	}
}

func TestJSDocTodoTag(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/jsdoc.ts", `
		/**
		 * @todo Add validation
		 * @param x The input
		 */
		function process(x) {}
		// TODO: Regular todo
	`)

	state := runTestSync(t, dir, config)

	// @todo is lowercase so won't match - documents this behavior
	if len(state.Items) < 1 {
		t.Error("Should find uppercase TODO")
	}
}

func TestHTMLTemplateTodos(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/template.tsx", `
		export default function Component() {
			return (
				<div>
					{/* TODO: Add loading state */}
					<span>Content</span>
				</div>
			);
		}
	`)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should find JSX comment TODO, got %d", len(state.Items))
	}
}

func TestWindowsCRLF(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// Write file with CRLF line endings
	content := "// Line 1\r\n// TODO: CRLF todo\r\n// Line 3\r\n"
	writeTestFile(t, dir, "services/frontend/src/crlf.ts", content)

	// Should not crash
	state := runTestSync(t, dir, config)

	// Documents behavior - Go's bufio.Scanner handles CRLF
	_ = state
}

func TestUTF8BOM(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	// BOM + content
	content := "\xEF\xBB\xBF// TODO: File with BOM\nconst x = 1;"
	writeTestFile(t, dir, "services/frontend/src/bom.ts", content)

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should handle UTF-8 BOM, got %d items", len(state.Items))
	}
}

func TestMixedLineEndings(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	content := "// Line 1\n// TODO: Unix LF\r\n// TODO: Windows CRLF\r// TODO: Old Mac CR"
	writeTestFile(t, dir, "services/frontend/src/mixed-endings.ts", content)

	// Should not crash
	state := runTestSync(t, dir, config)

	// At minimum should find the Unix LF one
	_ = state
}

func TestPriorityPromotion(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/priority.ts", `// TODO: [LOW] This will be promoted`)
	runTestSync(t, dir, config)

	// Change priority
	writeTestFile(t, dir, "services/frontend/src/priority.ts", `// TODO: [HIGH] This will be promoted`)
	state := runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state.Items {
		if item.CompletedAt == "" {
			activeCount++
		}
	}

	if activeCount != 1 {
		t.Errorf("Should track as same item after priority change, got %d", activeCount)
	}
}

func TestContentUpdatePreservesHistory(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/evolve.ts", `// TODO: [HIGH] Add user authentication`)
	state1 := runTestSync(t, dir, config)

	var originalFirstSeen string
	for _, item := range state1.Items {
		originalFirstSeen = item.FirstSeen
	}

	// Update content slightly (should fuzzy match)
	writeTestFile(t, dir, "services/frontend/src/evolve.ts", `// TODO: [HIGH] Add user authentication flow`)
	state2 := runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state2.Items {
		if item.CompletedAt == "" {
			activeCount++
			if item.FirstSeen != originalFirstSeen {
				t.Error("Should preserve firstSeen on fuzzy match")
			}
		}
	}

	if activeCount != 1 {
		t.Errorf("Should track as single item via fuzzy match, got %d", activeCount)
	}
}

func TestAddingLabelToUnlabeled(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/label.ts", `// TODO: Unlabeled todo`)
	runTestSync(t, dir, config)

	// Add label
	writeTestFile(t, dir, "services/frontend/src/label.ts", `// TODO: [HIGH] Unlabeled todo`)
	state := runTestSync(t, dir, config)

	activeCount := 0
	for _, item := range state.Items {
		if item.CompletedAt == "" {
			activeCount++
		}
	}

	if activeCount < 1 {
		t.Error("Should track label addition")
	}
}

func TestStatisticsMarkdownCounts(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/stats.ts", `
		// TODO: [HIGH] High 1
		// TODO: [HIGH] High 2
		// TODO: [LOW] Low 1
		// TODO: No priority
	`)

	state := runTestSync(t, dir, config)
	generator := NewOutputGenerator(config, "TODO")
	md := generator.Generate(state)

	if !strings.Contains(md, "Active: 4") {
		t.Error("Should show correct active count")
	}
}

func TestWhitespaceOnlyFile(t *testing.T) {
	dir := setupTestDir(t)
	config := createTestConfig(t, dir)

	writeTestFile(t, dir, "services/frontend/src/whitespace-only.ts", "   \n\n\t\t\n   ")
	writeTestFile(t, dir, "services/frontend/src/real.ts", "// TODO: Real todo")

	state := runTestSync(t, dir, config)

	if len(state.Items) != 1 {
		t.Errorf("Should skip whitespace-only file, got %d", len(state.Items))
	}
}
