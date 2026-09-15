# TODO Tracker (Rust)

A portable, zero-dependency TODO/FIXME tracker for codebases. Single binary, instant startup, smallest footprint.

## Features

- **Smart tracking**: Content-based hashing survives file moves and renames
- **Fuzzy matching**: Detects content changes (70% same-file, 85% cross-file similarity)
- **Multi-service**: Scan multiple services with independent configurations
- **Priority labels**: `[URGENT]`, `[HIGH]`, `[MEDIUM]`, `[LOW]`, or custom labels
- **History tracking**: Line moves, file relocations, content changes
- **Completion detection**: Removed TODOs marked as completed
- **Portable**: Single 1.4MB binary, no runtime dependencies

## Installation

### Build from source

```bash
cd tools/todo-tracker-rust

# Debug build (faster compilation)
cargo build

# Release build (optimized, smaller binary)
cargo build --release

# Binary location
./target/release/todo-tracker
```

### Install globally

```bash
cargo install --path .
```

### Cross-compile

```bash
# Linux x86_64
cargo build --release --target x86_64-unknown-linux-gnu

# Linux ARM64
cargo build --release --target aarch64-unknown-linux-gnu

# Windows
cargo build --release --target x86_64-pc-windows-gnu

# macOS Intel
cargo build --release --target x86_64-apple-darwin

# macOS ARM (M1/M2/M3)
cargo build --release --target aarch64-apple-darwin
```

> **Note**: Cross-compilation may require additional toolchains. Install targets with:
> ```bash
> rustup target add <target-triple>
> ```

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

# Show version
./todo-tracker --version

# Show help
./todo-tracker --help
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

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `services` | Array of service configurations | `[]` |
| `services[].name` | Service identifier | Required |
| `services[].path` | Path relative to project root | Required |
| `services[].include` | Directories to scan within service | `["."]` |
| `services[].exclude` | Glob patterns to exclude | `[]` |
| `output.todoFile` | Output file for TODOs | `"TODO.md"` |
| `output.fixmeFile` | Output file for FIXMEs | `"FIXME.md"` |
| `output.stateDir` | Directory for state files | `".todo-tracker"` |
| `defaults.exclude` | Global exclusion patterns | Common patterns |
| `priorities` | Priority labels (first = highest) | `["URGENT", "HIGH", "MEDIUM", "LOW"]` |
| `tracking.maxCompletedItems` | Max completed items to retain | `50` |
| `tracking.completedRetentionDays` | Days to keep completed items | `30` |

## TODO Format

```typescript
// TODO: Basic todo
// TODO: [HIGH] With priority
// TODO: [TZ] Custom label
// FIXME: [URGENT] Critical bug
```

### Supported Comment Styles

```javascript
// Single-line comment
/* Block comment */
/** JSDoc comment */
{/* JSX comment */}
# Python/Shell comment
```

## Output Format

The tracker generates a markdown file with sections:

```markdown
# TODO

## frontend

### src/components/Button.tsx
- [ ] **[HIGH]** Add hover state animation *(line 42)*

### src/utils/api.ts
- [ ] Implement retry logic *(line 15)*
- [ ] Add request timeout *(line 89)*

## backend

### src/handlers/auth.py
- [ ] [URGENT] Fix session expiry bug *(line 234)*

---

## Completed

- [x] ~~Add loading spinner~~ *(was: frontend/src/App.tsx:12)*

---

*Last updated: 2024-01-15 10:30:00 UTC*
*Active: 4 | Completed: 1*
```

## State Tracking

The tracker maintains state in `.todo-tracker/` directory:

- `todo-state.json` - Current TODO items and history
- `fixme-state.json` - Current FIXME items and history

### How Tracking Works

1. **Content Hash**: Each TODO gets a unique hash based on its content
2. **Location History**: Tracks where each TODO has been (file, line)
3. **Fuzzy Matching**: When content changes slightly, matches to existing items
4. **Completion Detection**: When a TODO disappears, it's marked completed

## Testing

```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_fuzzy_matching

# Run tests in release mode
cargo test --release
```

## Development

### Project Structure

```
todo-tracker-rust/
├── Cargo.toml          # Package manifest
├── README.md           # This file
└── src/
    └── main.rs         # All code in single file
        ├── Config      # Configuration parsing
        ├── State       # State persistence
        ├── Scanner     # File scanning
        ├── Matcher     # Fuzzy matching
        ├── Output      # Markdown generation
        ├── CLI         # Command-line interface
        └── tests       # 68 comprehensive tests
```

### Dependencies

| Crate | Purpose |
|-------|---------|
| `serde` | JSON serialization |
| `serde_json` | JSON parsing |
| `walkdir` | Directory traversal |
| `regex` | Pattern matching |
| `clap` | CLI argument parsing |
| `md-5` | Content hashing |
| `chrono` | Date/time handling |
| `tempfile` | Test fixtures (dev only) |

### Release Optimizations

The `Cargo.toml` includes aggressive size optimizations:

```toml
[profile.release]
opt-level = "z"      # Optimize for size
lto = true           # Link-time optimization
codegen-units = 1    # Single codegen unit
strip = true         # Strip symbols
```

## Comparison with Other Implementations

| Aspect | Rust | Go | Node.js |
|--------|------|-----|---------|
| Binary size | **1.4 MB** | 2.7 MB | Requires Node |
| Dependencies | Zero runtime | Zero runtime | node_modules |
| Startup time | Instant | Instant | ~100-200ms |
| Memory usage | Lower | Low | Higher |
| Cross-compile | Easy | Trivial | N/A |

All three versions:
- Use the same `.todorc.json` configuration
- Produce identical output
- Have 68 matching tests
- Support the same features

## Troubleshooting

### Binary not found after build

```bash
# Check build succeeded
ls -la target/release/todo-tracker

# Or use cargo run
cargo run --release -- --help
```

### Permission denied

```bash
chmod +x target/release/todo-tracker
```

### Config not found

The tracker searches for `.todorc.json` in:
1. Path specified by `--config`
2. Current directory
3. Parent directories (up to filesystem root)

### No TODOs detected

Check that:
1. Files are not in excluded directories
2. Comment format includes `TODO:` (with colon)
3. Service paths in config are correct

## License

MIT
