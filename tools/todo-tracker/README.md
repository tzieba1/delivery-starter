# TODO Tracker

A configurable TODO/FIXME tracking system for monorepos with smart tracking features.

## Features

- 📁 **Multi-service scanning** - Configure which directories to scan per service
- 🔍 **Smart tracking** - Detects line moves, file relocations, content changes
- ✅ **Completion tracking** - Marks removed TODOs as completed
- 🏷️ **Priority labels** - Support for `[HIGH]`, `[MEDIUM]`, `[LOW]`, custom labels
- 🔄 **State persistence** - Tracks history across syncs
- 📝 **Markdown output** - Clean, readable reports

## Quick Start

### 1. Create Configuration

Create `.todorc.json` in your project root:

```json
{
  "services": [
    {
      "name": "frontend",
      "path": "apps/web",
      "include": ["src", "components"],
      "exclude": ["*.test.tsx"]
    },
    {
      "name": "backend",
      "path": "services/api",
      "include": ["src"],
      "exclude": ["__pycache__"]
    }
  ],
  "output": {
    "todoFile": "TODO.md",
    "fixmeFile": "FIXME.md",
    "stateDir": ".todo-tracker"
  }
}
```

### 2. Run Sync

```bash
# From project root
node tools/todo-tracker/sync.js

# Or use the CLI
node tools/todo-tracker/cli.js sync
```

### 3. Add to package.json (optional)

```json
{
  "scripts": {
    "todos": "node tools/todo-tracker/sync.js --todo",
    "fixmes": "node tools/todo-tracker/sync.js --fixme",
    "todos:all": "node tools/todo-tracker/cli.js sync --all"
  }
}
```

## Configuration Reference

### Full `.todorc.json` Example

```json
{
  "$schema": "./tools/todo-tracker/todorc.schema.json",

  "services": [
    {
      "name": "mobile",
      "path": "services/mobile",
      "include": ["src", "App.tsx", "scripts"],
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
    "mode": "root",
    "todoFile": "TODO.md",
    "fixmeFile": "FIXME.md",
    "stateDir": ".todo-tracker"
  },

  "defaults": {
    "exclude": [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      "*.min.js",
      "*.md",
      "README*"
    ]
  },

  "priorities": ["URGENT", "HIGH", "MEDIUM", "LOW"],

  "tracking": {
    "maxCompletedItems": 50,
    "completedRetentionDays": 30
  }
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `services` | Array | List of services to scan |
| `services[].name` | String | Service identifier |
| `services[].path` | String | Path relative to project root |
| `services[].include` | Array | Directories/files to scan |
| `services[].exclude` | Array | Patterns to exclude (merged with defaults) |
| `output.todoFile` | String | Output file for TODOs |
| `output.fixmeFile` | String | Output file for FIXMEs |
| `output.stateDir` | String | Directory for state files |
| `defaults.exclude` | Array | Default exclusion patterns |
| `priorities` | Array | Priority order (first = highest) |
| `tracking.maxCompletedItems` | Number | Max completed items to keep |
| `tracking.completedRetentionDays` | Number | Days to keep completed items |

## CLI Usage

```bash
# Basic sync
node tools/todo-tracker/sync.js

# Sync FIXMEs
node tools/todo-tracker/sync.js --fixme

# Only scan specific service
node tools/todo-tracker/sync.js --service backend

# Preview without writing
node tools/todo-tracker/sync.js --dry-run

# Verbose output
node tools/todo-tracker/sync.js --verbose

# Custom config file
node tools/todo-tracker/sync.js --config path/to/config.json

# Using CLI wrapper
node tools/todo-tracker/cli.js sync --all  # Both TODO and FIXME
node tools/todo-tracker/cli.js help        # Show help
```

## Writing TODOs in Code

### Basic Format

```javascript
// TODO: Description of what needs to be done
// FIXME: Description of what needs to be fixed
```

### With Priority

```javascript
// TODO: [HIGH] Critical feature needed
// TODO: [MEDIUM] Nice to have
// TODO: [LOW] Minor improvement
// TODO: [URGENT] Do this now!
```

### With Custom Labels

```javascript
// TODO: [TZ] Assigned to TZ
// TODO: [BLOCKED] Waiting on API
// FIXME: [SECURITY] Potential vulnerability
```

## Output Format

### TODO.md Example

```markdown
# TODO

> Last synced: 2025-12-03
> Active: 5 | Completed: 2

## Active Items (5)

### URGENT (1)

- [ ] Fix authentication bug _[Added: 2025-12-01]_
  `services/backend/src/auth.py:45`

### HIGH (2)

- [ ] Add input validation _[Added: 2025-12-02]_ (Line moved: 1x)
  `services/mobile/src/forms.tsx:123` _(previously: line 120)_

...

---

## Completed Items (2)

### MEDIUM (1)

- [x] Update dependencies _[Added: 2025-11-28, Completed: 2025-12-01]_
  `services/backend/requirements.txt:15`
```

## Smart Tracking

### Line Movement Detection

When code is moved within a file, the tracker detects line number changes:

```markdown
- [ ] Add caching _[Added: 2025-12-01]_ (Line moved: 2x)
  `src/api.ts:150` _(previously: line 145, line 142)_
```

### File Relocation Detection

When a TODO moves to a different file (via refactoring):

```markdown
- [ ] Implement retry logic _[Added: 2025-11-20]_ (Relocated: 1x)
  `src/utils/retry.ts:25`
  _Previously: `src/api/client.ts:89` (2025-11-25)_
```

### Content Change Detection

Uses fuzzy matching (70% similarity threshold) to track TODOs even when their content changes slightly.

## Integration with Git Hooks

Add to `.githooks/pre-commit`:

```bash
#!/bin/bash
# Auto-sync TODOs before commit
node tools/todo-tracker/sync.js --todo
git add TODO.md .todo-tracker/
```

## Integration with CI

```yaml
# .github/workflows/todos.yml
name: Update TODOs
on:
  push:
    branches: [main]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: node tools/todo-tracker/sync.js --all
      - uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: "chore: sync TODOs"
          file_pattern: "TODO.md FIXME.md .todo-tracker/*"
```

## Troubleshooting

### Config not found

```
Config file not found: .todorc.json
```

Make sure `.todorc.json` exists in your project root, or specify path with `--config`.

### No items found

Check that:
1. `services[].path` points to existing directories
2. `services[].include` lists the right subdirectories
3. Exclusion patterns aren't too aggressive

### False positives

If documentation or test files are being scanned:
- Add `*.md` to exclusions
- Add test file patterns to service-specific excludes

## License

MIT
