#!/usr/bin/env bash
# Generates a semver version string from Git metadata.
#
# Strategy: extract major.minor from the latest tag (or default v0.1.0),
# then use the total commit count as the patch number.
#
# Examples (assuming latest tag is v0.11.0 and HEAD is commit #152):
#   output: 0.11.152
#
# Usage:
#   VERSION=$(bash scripts/version.sh)
#   echo "${VERSION}"   # 0.11.152
set -euo pipefail

# Get the latest semver tag (strip leading 'v'), default to 0.1.0 if none exist
LATEST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.1.0")"
LATEST_TAG="${LATEST_TAG#v}"

# Count all commits reachable from HEAD — monotonically increasing
COMMIT_COUNT="$(git rev-list --count HEAD 2>/dev/null || echo "0")"

# Extract major.minor (ignoring any pre-release suffix on the tag)
MAJOR="$(echo "${LATEST_TAG}" | cut -d. -f1)"
MINOR="$(echo "${LATEST_TAG}" | cut -d. -f2)"

echo "${MAJOR}.${MINOR}.${COMMIT_COUNT}"
