#!/usr/bin/env bash
# Fail loudly if the release tag does not match package.json's version.
#
# Without this check, a mismatched tag (e.g. tagging v0.0.2 while package.json
# still says 0.0.1) would let publish.sh silently no-op, making it look like a
# release happened when nothing was published.
#
# Usage: verify-version.sh <release-tag>   (tag may be "v1.2.3" or "1.2.3")
set -euo pipefail

tag="${1:-}"
if [ -z "$tag" ]; then
  echo "Error: release tag argument is required." >&2
  exit 1
fi

tag_version="${tag#v}"
pkg_version=$(node -p "require('./package.json').version")

if [ "$tag_version" != "$pkg_version" ]; then
  echo "Error: release tag ($tag → $tag_version) does not match package.json version ($pkg_version)." >&2
  echo "Bump package.json to $tag_version (or retag the release) so they agree." >&2
  exit 1
fi

echo "Release tag matches package.json version: $pkg_version"
