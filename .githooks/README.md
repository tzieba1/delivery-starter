# Git Hooks & Native Git CI/CD

This directory contains versioned git hooks that integrate with the development workflow.

## Quick Start

```bash
# Run the setup script (one-time)
./.githooks/setup.sh
```

This configures git to use the hooks in this directory.

## Philosophy: Git-Native CI/CD

This project follows a **git-native CI/CD** philosophy, leveraging git's built-in features as the foundation for automation:

### Core Principles

1. **Hooks over plugins** - Git hooks are portable, don't require external tools, and work offline
2. **Convention over configuration** - Conventional commits enable automated changelogs and versioning
3. **Local validation first** - Catch issues before they reach CI, reducing feedback loops
4. **Versioned hooks** - Hooks in `.githooks/` are tracked, ensuring team consistency

### The Hook Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                        LOCAL DEVELOPMENT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  git checkout feature/xyz                                       │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │post-checkout │ → Sync TODOs for new branch                   │
│  └──────────────┘                                               │
│         │                                                        │
│         ▼                                                        │
│     [coding...]                                                 │
│         │                                                        │
│         ▼                                                        │
│  git commit -m "feat: add feature"                              │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ pre-commit   │ → │ commit-msg   │ → │ post-commit  │        │
│  │              │   │              │   │              │        │
│  │ • Sync TODOs │   │ • Validate   │   │ • [optional] │        │
│  │ • Run lints  │   │   format     │   │              │        │
│  │ • Stage .md  │   │ • Check len  │   │              │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         │                                                        │
│         ▼                                                        │
│  git push origin feature/xyz                                    │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │  pre-push    │ → Validate before sending                     │
│  │              │   • Check URGENT TODOs                        │
│  │              │   • [optional] Run tests                      │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         REMOTE / CI                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GitHub Actions / GitLab CI                                     │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────┐                   │
│  │ .github/workflows/todo-tracker.yml       │                   │
│  │                                          │                   │
│  │ • Build todo-tracker                     │                   │
│  │ • Sync TODO.md / FIXME.md               │                   │
│  │ • Comment on PR with stats              │                   │
│  │ • Auto-commit updates                   │                   │
│  │ • Fail if > N URGENT items              │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Hooks Reference

### pre-commit

Runs before each commit is created.

**Actions:**
- Syncs TODO.md and FIXME.md with codebase
- Auto-stages tracking files
- Warns about URGENT items

**Skip:** `git commit --no-verify`

### commit-msg

Validates commit message format.

**Format:** `<type>(<scope>): <description>`

**Types:**
| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting (no logic change) |
| `refactor` | Code restructuring |
| `test` | Adding/updating tests |
| `chore` | Maintenance tasks |
| `ci` | CI/CD changes |
| `perf` | Performance improvement |
| `build` | Build system changes |

**Examples:**
```
feat(auth): add OAuth2 login flow
fix(api): handle null response from payment gateway
docs: update README with new CLI options
chore(deps): upgrade React to v18
```

### post-merge

Runs after `git pull` or `git merge`.

**Actions:**
- Syncs TODOs to reflect merged changes
- Shows what changed in verbose mode

### post-checkout

Runs after `git checkout` or `git switch`.

**Actions:**
- Syncs TODOs for the new branch state
- Only runs on branch checkouts (not file checkouts)

### pre-push

Runs before pushing to remote.

**Actions:**
- Warns if TODO.md is out of sync
- Optionally blocks on URGENT items
- Optionally runs tests

**Skip:** `git push --no-verify`

## Configuration

### Enabling Hooks

```bash
# Recommended: Git 2.9+ (uses core.hooksPath)
./.githooks/setup.sh

# Or manually:
git config core.hooksPath .githooks
```

### Disabling Hooks Temporarily

```bash
# Single commit
git commit --no-verify -m "message"

# Single push
git push --no-verify

# Disable for session
export SKIP_HOOKS=1
```

### Customizing Hooks

Edit the hook files directly. Key configuration variables are at the top of each file.

**pre-push configuration:**
```bash
BLOCK_ON_URGENT=0   # Set to 1 to block push on URGENT TODOs
REQUIRE_SYNC=1      # Check if TODO.md is synchronized
RUN_TESTS=0         # Set to 1 to run tests before push
```

## Submodule Considerations

When working with git submodules:

1. **Each submodule can have its own hooks**
   ```
   parent-repo/.githooks/
   parent-repo/services/frontend/.githooks/   # submodule hooks
   parent-repo/services/backend/.githooks/    # submodule hooks
   ```

2. **Parent hooks can orchestrate submodule updates**
   ```bash
   # In parent pre-commit
   git submodule foreach 'todo-tracker --all'
   ```

3. **Use `--recurse-submodules` for consistency**
   ```bash
   git pull --recurse-submodules
   git push --recurse-submodules=check
   ```

## Extending the Pipeline

### Adding Custom Checks

Create new hooks or modify existing ones:

```bash
# .githooks/pre-commit (add to main())

# Check for debug statements
if git diff --cached | grep -E "console\.log|debugger|pdb\.set_trace"; then
    echo "Warning: Debug statements detected"
fi

# Check for secrets
if git diff --cached | grep -E "API_KEY|SECRET|PASSWORD" | grep -v ".example"; then
    echo "Error: Possible secrets in commit"
    exit 1
fi
```

### Integrating with Language Tools

```bash
# .githooks/pre-commit additions for polyglot repos

# Rust
if git diff --cached --name-only | grep -q "\.rs$"; then
    cargo fmt --check
    cargo clippy
fi

# TypeScript
if git diff --cached --name-only | grep -q "\.[tj]sx\?$"; then
    npx eslint --fix $(git diff --cached --name-only | grep "\.[tj]sx\?$")
fi

# Python
if git diff --cached --name-only | grep -q "\.py$"; then
    ruff check $(git diff --cached --name-only | grep "\.py$")
fi

# Go
if git diff --cached --name-only | grep -q "\.go$"; then
    go fmt ./...
    go vet ./...
fi
```

## Troubleshooting

### Hooks not running

```bash
# Check hooks path
git config core.hooksPath

# Verify permissions
ls -la .githooks/

# Should show executable
chmod +x .githooks/*
```

### Hook fails but shouldn't

```bash
# Run hook manually to debug
./.githooks/pre-commit

# Check exit code
echo $?
```

### todo-tracker not found

```bash
# Build it
cd tools/todo-tracker-rust
cargo build --release

# Or install globally
cargo install --path .
```

## Future Enhancements

Planned improvements for git-native CI/CD:

- [ ] `prepare-commit-msg` - Auto-link commits to issues
- [ ] `post-rewrite` - Handle rebases and amends
- [ ] Git notes for metadata (build info, test results)
- [ ] Branch naming validation
- [ ] Automatic semantic versioning from commits
