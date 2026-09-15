# TODO Tracker (Go)

A portable, zero-dependency TODO/FIXME tracker for codebases. Single binary, instant startup.

## Features

- **Smart tracking**: Content-based hashing survives file moves and renames
- **Fuzzy matching**: Detects content changes (70% same-file, 85% cross-file similarity)
- **Multi-service**: Scan multiple services with independent configurations
- **Priority labels**: `[URGENT]`, `[HIGH]`, `[MEDIUM]`, `[LOW]`, or custom labels
- **History tracking**: Line moves, file relocations, content changes
- **Completion detection**: Removed TODOs marked as completed
- **Portable**: Single 2.7MB binary, no runtime dependencies

## Installation

### Build from source

```bash
cd tools/todo-tracker-go
go build -o todo-tracker .

# Optional: Install globally
go install .
```

### Cross-compile

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o todo-tracker-linux .

# Windows
GOOS=windows GOARCH=amd64 go build -o todo-tracker.exe .

# macOS ARM
GOOS=darwin GOARCH=arm64 go build -o todo-tracker-mac-arm .
```

## Usage

```bash
# Sync TODOs (default)
./todo-tracker

# Sync FIXMEs
./todo-tracker --fixme

# Sync both
./todo-tracker --all

# Preview without writing files
./todo-tracker --dry-run

# Only scan specific service
./todo-tracker --service backend

# Verbose output
./todo-tracker --verbose

# Custom config path
./todo-tracker --config /path/to/.todorc.json
```

## Configuration

Create a `.todorc.json` in your project root:

```json
{
  "services": [
    {
      "name": "frontend",
      "path": "services/frontend",
      "include": ["src"],
      "exclude": ["*.test.js", "*.spec.js"]
    },
    {
      "name": "backend",
      "path": "services/backend",
      "include": ["src"],
      "exclude": ["__pycache__", "*.pyc"]
    }
  ],
  "output": {
    "todoFile": "TODO.md",
    "fixmeFile": "FIXME.md",
    "stateDir": ".todo-tracker"
  },
  "defaults": {
    "exclude": ["node_modules", ".git", "dist", "build", "*.md"]
  },
  "priorities": ["URGENT", "HIGH", "MEDIUM", "LOW"],
  "tracking": {
    "maxCompletedItems": 50,
    "completedRetentionDays": 30
  }
}
```

## TODO Format

```typescript
// TODO: Basic todo
// TODO: [HIGH] With priority
// TODO: [TZ] Custom label
// FIXME: [URGENT] Critical bug
```

## Testing

```bash
go test -v ./...
```

## Comparison with Node.js Version

| Aspect | Go | Node.js |
|--------|-----|---------|
| Binary size | 2.7 MB | Requires Node runtime |
| Dependencies | Zero | node_modules |
| Startup time | Instant | ~100-200ms |
| Cross-compile | Trivial | Requires Node on target |

Both versions use the same `.todorc.json` config and produce identical output.

## License

MIT
