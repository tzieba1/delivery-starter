package main

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// FoundItem represents a TODO/FIXME found in the codebase
type FoundItem struct {
	ContentHash string
	Service     string
	File        string
	Line        int
	Label       string
	Content     string
}

// Scanner scans directories for TODO/FIXME comments
type Scanner struct {
	config      Config
	projectRoot string
	itemType    string // "TODO" or "FIXME"
	pattern     *regexp.Regexp
}

// NewScanner creates a new scanner
func NewScanner(config Config, projectRoot string, itemType string) *Scanner {
	// Pattern to match TODO: or FIXME: (case-sensitive)
	pattern := regexp.MustCompile(itemType + `:\s*(.*)`)
	return &Scanner{
		config:      config,
		projectRoot: projectRoot,
		itemType:    itemType,
		pattern:     pattern,
	}
}

// ScanAll scans all configured services
func (s *Scanner) ScanAll() ([]FoundItem, error) {
	return s.ScanServices(nil)
}

// ScanServices scans specified services (or all if nil)
func (s *Scanner) ScanServices(serviceNames []string) ([]FoundItem, error) {
	var items []FoundItem

	for _, service := range s.config.Services {
		// If specific services requested, filter
		if serviceNames != nil && !contains(serviceNames, service.Name) {
			continue
		}

		servicePath := filepath.Join(s.projectRoot, service.Path)
		if _, err := os.Stat(servicePath); os.IsNotExist(err) {
			continue // Skip missing service directories
		}

		serviceItems, err := s.scanService(service)
		if err != nil {
			return nil, err
		}
		items = append(items, serviceItems...)
	}

	return items, nil
}

// scanService scans a single service
func (s *Scanner) scanService(service ServiceConfig) ([]FoundItem, error) {
	var items []FoundItem
	servicePath := filepath.Join(s.projectRoot, service.Path)

	for _, include := range service.Include {
		includePath := filepath.Join(servicePath, include)

		// Check if it's a file or directory
		info, err := os.Stat(includePath)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, err
		}

		if info.IsDir() {
			// Walk directory
			err = filepath.Walk(includePath, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return nil
				}
				if info.IsDir() {
					// Check directory exclusions
					if s.shouldExcludeDir(info.Name(), service) {
						return filepath.SkipDir
					}
					return nil
				}
				// Check file exclusions
				if s.shouldExcludeFile(info.Name(), service) {
					return nil
				}
				// Scan file
				fileItems, err := s.scanFile(path, service.Name)
				if err != nil {
					return nil
				}
				items = append(items, fileItems...)
				return nil
			})
			if err != nil {
				return nil, err
			}
		} else {
			// Single file
			if !s.shouldExcludeFile(info.Name(), service) {
				fileItems, err := s.scanFile(includePath, service.Name)
				if err != nil {
					return nil, err
				}
				items = append(items, fileItems...)
			}
		}
	}

	return items, nil
}

// scanFile scans a single file for TODO/FIXME
func (s *Scanner) scanFile(path string, serviceName string) ([]FoundItem, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	// Get relative path from project root
	relPath, err := filepath.Rel(s.projectRoot, path)
	if err != nil {
		relPath = path
	}

	var items []FoundItem
	scanner := bufio.NewScanner(file)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := scanner.Text()

		matches := s.pattern.FindStringSubmatch(line)
		if matches == nil {
			continue
		}

		rawContent := strings.TrimSpace(matches[1])
		if rawContent == "" {
			continue // Skip empty TODOs
		}

		// Extract priority label
		label, content := extractPriority(rawContent)
		if content == "" {
			continue // Skip if only label, no content
		}

		// Generate content hash
		hash := generateContentHash(label, content)

		items = append(items, FoundItem{
			ContentHash: hash,
			Service:     serviceName,
			File:        relPath,
			Line:        lineNum,
			Label:       label,
			Content:     content,
		})
	}

	return items, scanner.Err()
}

// shouldExcludeDir checks if a directory should be excluded
func (s *Scanner) shouldExcludeDir(name string, service ServiceConfig) bool {
	// Check default exclusions
	for _, pattern := range s.config.Defaults.Exclude {
		if matchGlob(pattern, name) {
			return true
		}
	}
	// Check service-specific exclusions
	for _, pattern := range service.Exclude {
		if matchGlob(pattern, name) {
			return true
		}
	}
	return false
}

// shouldExcludeFile checks if a file should be excluded
func (s *Scanner) shouldExcludeFile(name string, service ServiceConfig) bool {
	// Check default exclusions
	for _, pattern := range s.config.Defaults.Exclude {
		if matchGlob(pattern, name) {
			return true
		}
	}
	// Check service-specific exclusions
	for _, pattern := range service.Exclude {
		if matchGlob(pattern, name) {
			return true
		}
	}
	return false
}

// matchGlob performs simple glob matching
func matchGlob(pattern, name string) bool {
	// Handle simple patterns
	if pattern == name {
		return true
	}

	// Handle *.ext patterns
	if strings.HasPrefix(pattern, "*.") {
		ext := pattern[1:] // ".ext"
		return strings.HasSuffix(name, ext)
	}

	// Handle prefix* patterns
	if strings.HasSuffix(pattern, "*") {
		prefix := pattern[:len(pattern)-1]
		return strings.HasPrefix(name, prefix)
	}

	return false
}

// extractPriority extracts [LABEL] from content
func extractPriority(content string) (string, string) {
	// Match [LABEL] at start of content
	re := regexp.MustCompile(`^\[([^\]]+)\]\s*`)
	matches := re.FindStringSubmatch(content)
	if matches != nil {
		label := strings.ToUpper(strings.TrimSpace(matches[1]))
		remaining := strings.TrimSpace(content[len(matches[0]):])
		if label == "" {
			return "NONE", remaining
		}
		return label, remaining
	}
	return "NONE", content
}

// contains checks if a string slice contains a value
func contains(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}
