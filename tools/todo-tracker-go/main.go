package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var (
	version = "1.0.0"
)

func main() {
	// Define flags
	todoFlag := flag.Bool("todo", false, "Sync TODO comments (default)")
	fixmeFlag := flag.Bool("fixme", false, "Sync FIXME comments")
	allFlag := flag.Bool("all", false, "Sync both TODO and FIXME")
	serviceFlag := flag.String("service", "", "Only scan specific service")
	dryRunFlag := flag.Bool("dry-run", false, "Preview without writing files")
	verboseFlag := flag.Bool("verbose", false, "Verbose output")
	configFlag := flag.String("config", "", "Path to config file")
	versionFlag := flag.Bool("version", false, "Show version")
	helpFlag := flag.Bool("help", false, "Show help")

	flag.Parse()

	// Handle help/version
	if *helpFlag {
		printHelp()
		return
	}
	if *versionFlag {
		fmt.Printf("todo-tracker v%s\n", version)
		return
	}

	// Determine project root
	projectRoot, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Find and load config
	var configPath string
	if *configFlag != "" {
		configPath = *configFlag
		// If config is relative, make it absolute
		if !filepath.IsAbs(configPath) {
			configPath = filepath.Join(projectRoot, configPath)
		}
		// Update project root to config's directory
		projectRoot = filepath.Dir(configPath)
	} else {
		configPath, err = FindConfigFile(projectRoot)
		if err != nil && !os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "Error finding config: %v\n", err)
			os.Exit(1)
		}
		if configPath != "" {
			projectRoot = filepath.Dir(configPath)
		}
	}

	config, err := LoadConfig(configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	// Determine what to sync
	types := []string{}
	if *allFlag {
		types = []string{"TODO", "FIXME"}
	} else if *fixmeFlag {
		types = []string{"FIXME"}
	} else if *todoFlag || (!*fixmeFlag && !*allFlag) {
		types = []string{"TODO"} // Default or explicit --todo
	}

	// Validate service flag
	if *serviceFlag != "" {
		if config.GetServiceByName(*serviceFlag) == nil {
			fmt.Fprintf(os.Stderr, "Service not found: %s\n", *serviceFlag)
			fmt.Fprintf(os.Stderr, "Available: %s\n", strings.Join(config.GetServiceNames(), ", "))
			os.Exit(1)
		}
	}

	// Run sync for each type
	for _, itemType := range types {
		err := runSync(itemType, config, projectRoot, *serviceFlag, *dryRunFlag, *verboseFlag)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}
}

func runSync(itemType string, config Config, projectRoot string, serviceFilter string, dryRun bool, verbose bool) error {
	if verbose {
		fmt.Printf("Scanning for %ss...\n", itemType)
	}

	// Create scanner
	scanner := NewScanner(config, projectRoot, itemType)

	// Determine which services to scan
	var serviceNames []string
	scannedServices := make(map[string]bool)

	if serviceFilter != "" {
		serviceNames = []string{serviceFilter}
		scannedServices[serviceFilter] = true
	} else {
		for _, s := range config.Services {
			serviceNames = append(serviceNames, s.Name)
			scannedServices[s.Name] = true
		}
	}

	// Scan for items
	items, err := scanner.ScanServices(serviceNames)
	if err != nil {
		return err
	}

	if verbose {
		fmt.Printf("  Found %d %s(s) in %d service(s)\n", len(items), itemType, len(serviceNames))
		for _, name := range serviceNames {
			count := 0
			for _, item := range items {
				if item.Service == name {
					count++
				}
			}
			fmt.Printf("    - %s: %d\n", name, count)
		}
	}

	// Load existing state
	stateDir := filepath.Join(projectRoot, config.Output.StateDir)
	state, err := LoadState(stateDir, strings.ToLower(itemType))
	if err != nil {
		return err
	}

	// Match items
	matcher := NewMatcher(config)
	result := matcher.Match(items, state, scannedServices)

	// Generate output
	generator := NewOutputGenerator(config, itemType)

	if dryRun {
		fmt.Println("\n--- DRY RUN ---")
		fmt.Println(generator.Generate(result.NewState))
		fmt.Println("--- END DRY RUN ---")
	} else {
		// Save state
		if err := SaveState(stateDir, strings.ToLower(itemType), result.NewState, config); err != nil {
			return err
		}

		// Write markdown
		if err := generator.WriteMarkdown(projectRoot, result.NewState); err != nil {
			return err
		}
	}

	// Print summary
	PrintSummary(itemType, result.NewState, result.Stats, config.Output.StateDir)

	return nil
}

func printHelp() {
	fmt.Println(`todo-tracker - Smart TODO/FIXME tracking for codebases

Usage:
  todo-tracker [flags]

Flags:
  --todo          Sync TODO comments (default)
  --fixme         Sync FIXME comments
  --all           Sync both TODO and FIXME
  --service NAME  Only scan specific service
  --dry-run       Preview without writing files
  --verbose       Verbose output
  --config PATH   Path to config file (.todorc.json)
  --version       Show version
  --help          Show this help

Examples:
  todo-tracker                    # Sync TODOs
  todo-tracker --fixme            # Sync FIXMEs
  todo-tracker --all              # Sync both
  todo-tracker --service backend  # Only scan backend
  todo-tracker --dry-run          # Preview changes

Configuration:
  Create a .todorc.json in your project root. See README.md for details.`)
}
