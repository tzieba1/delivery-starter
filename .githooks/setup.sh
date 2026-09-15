#!/usr/bin/env bash
#
# Git Hooks Setup Script
#
# Configures git to use the versioned hooks in .githooks/
# Run this once after cloning the repository.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Git Hooks Setup${NC}"
echo "================"

# Method 1: Git 2.9+ core.hooksPath (recommended)
if git config --version | grep -q "2\.[0-9]\|2\.[1-9][0-9]"; then
    echo -e "${GREEN}✓${NC} Using core.hooksPath (Git 2.9+)"
    git config core.hooksPath .githooks
else
    # Method 2: Symlink for older git versions
    echo -e "${YELLOW}!${NC} Git < 2.9 detected, using symlinks"

    HOOKS_DIR="$REPO_ROOT/.git/hooks"

    for hook in pre-commit post-merge commit-msg pre-push post-checkout; do
        if [[ -f "$SCRIPT_DIR/$hook" ]]; then
            ln -sf "../../.githooks/$hook" "$HOOKS_DIR/$hook"
            echo -e "${GREEN}✓${NC} Linked $hook"
        fi
    done
fi

# Build todo-tracker if not present
TRACKER="$REPO_ROOT/tools/todo-tracker-rust/target/release/todo-tracker"
if [[ ! -x "$TRACKER" ]]; then
    echo ""
    echo -e "${BLUE}Building todo-tracker...${NC}"

    if command -v cargo &> /dev/null; then
        (cd "$REPO_ROOT/tools/todo-tracker-rust" && cargo build --release)
        echo -e "${GREEN}✓${NC} todo-tracker built"
    else
        echo -e "${YELLOW}!${NC} Rust not installed. Install from https://rustup.rs"
        echo "  Then run: cd tools/todo-tracker-rust && cargo build --release"
    fi
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Hooks installed:"
echo "  pre-commit     - Auto-sync TODO.md before commits"
echo "  post-merge     - Sync after git pull/merge"
echo "  commit-msg     - Validate conventional commit format"
echo "  pre-push       - Run checks before pushing"
echo "  post-checkout  - Sync after branch switch"
echo ""
echo "To disable hooks temporarily:"
echo "  git commit --no-verify"
echo "  git push --no-verify"
