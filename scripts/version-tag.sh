#!/usr/bin/env bash
# version-tag.sh - Semantic versioning with Git tags
# Creates annotated tags with validation and changelog generation

set -euo pipefail

# Semantic versioning regex: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
SEMVER_REGEX="^v([0-9]+)\.([0-9]+)\.([0-9]+)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_error() { echo -e "${RED}Error: $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${BLUE}$1${NC}"; }

# Interactive mode if no version provided
if [[ $# -eq 0 ]]; then
    LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
    print_info "Current version: ${LATEST_TAG}"
    echo ""
    read -p "New version (e.g., v1.2.3): " VERSION
    read -p "Release message: " MESSAGE
else
    VERSION=$1
    MESSAGE=${2:-"Release ${VERSION}"}
fi

# Validate semantic version format
if ! [[ $VERSION =~ $SEMVER_REGEX ]]; then
    print_error "Invalid semantic version format: ${VERSION}"
    echo "Expected format: vMAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]"
    echo "Examples:"
    echo "  v1.0.0          - Production release"
    echo "  v2.1.3-beta.1   - Pre-release"
    echo "  v1.0.0+20240115 - Build metadata"
    exit 1
fi

# Extract version components
MAJOR="${BASH_REMATCH[1]}"
MINOR="${BASH_REMATCH[2]}"
PATCH="${BASH_REMATCH[3]}"

print_info "Version components: MAJOR=${MAJOR} MINOR=${MINOR} PATCH=${PATCH}"

# Check if tag already exists
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    print_error "Tag ${VERSION} already exists"
    exit 1
fi

# Get latest tag and validate increment
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")

if [[ $LATEST_TAG =~ $SEMVER_REGEX ]]; then
    PREV_MAJOR="${BASH_REMATCH[1]}"
    PREV_MINOR="${BASH_REMATCH[2]}"
    PREV_PATCH="${BASH_REMATCH[3]}"
    
    print_info "Previous version: ${LATEST_TAG} (${PREV_MAJOR}.${PREV_MINOR}.${PREV_PATCH})"
    
    # Validate version increment rules
    if (( MAJOR < PREV_MAJOR )); then
        print_error "Cannot decrement MAJOR version (${PREV_MAJOR} -> ${MAJOR})"
        exit 1
    elif (( MAJOR == PREV_MAJOR && MINOR < PREV_MINOR )); then
        print_error "Cannot decrement MINOR version (${PREV_MINOR} -> ${MINOR})"
        exit 1
    elif (( MAJOR == PREV_MAJOR && MINOR == PREV_MINOR && PATCH <= PREV_PATCH )); then
        echo -e "${YELLOW}Warning: PATCH version should increment (${PREV_PATCH} -> ${PATCH})${NC}"
        read -p "Continue anyway? (y/N): " CONTINUE
        if [[ ! $CONTINUE =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

# Generate changelog
print_info "Generating changelog since ${LATEST_TAG}..."
CHANGELOG=$(git log ${LATEST_TAG}..HEAD --pretty=format:"- %s (%h)" --no-merges | head -20)

if [[ -z "$CHANGELOG" ]]; then
    CHANGELOG="- Initial release"
fi

# Create tag message
TAG_MESSAGE="${MESSAGE}

Changes since ${LATEST_TAG}:
${CHANGELOG}
"

# Show what will be created
echo ""
print_info "Creating annotated tag: ${VERSION}"
echo "Message: ${MESSAGE}"
echo ""
echo "Changelog preview:"
echo "${CHANGELOG}"
echo ""

# Confirm
read -p "Create this tag? (y/N): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
fi

# Create annotated tag
git tag -a "$VERSION" -m "$TAG_MESSAGE"

print_success "Created tag: ${VERSION}"
echo ""
echo "Next steps:"
echo "  git push origin ${VERSION}    # Push tag to remote"
echo "  git push origin main          # Push commits"
echo ""
echo "To delete if needed:"
echo "  git tag -d ${VERSION}"
