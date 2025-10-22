#!/usr/bin/env bash
set -euo pipefail
PLATFORM=${1:-all}
PROFILE=${2:-production}
cd services/mobile
npm ci
npm test
CURRENT_VERSION=$(git describe --tags --abbrev=0 | sed 's/v//' || echo "1.0.0")
npm version "${CURRENT_VERSION}" --no-git-tag-version
eas build --platform ${PLATFORM} --profile ${PROFILE} --non-interactive
