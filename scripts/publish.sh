#!/usr/bin/env bash
# Publish @qawolf/pom to npm only when package.json's version is greater than
# the version already on the registry. Mirrors the platform monorepo's
# packages/npm-publish.sh, scoped to this single package.
#
# Writes step outputs (published, version) to $GITHUB_OUTPUT so the release
# workflow knows whether to tag and create a GitHub Release.
set -euo pipefail

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version ?? ''")
is_private=$(node -p "require('./package.json').private === true ? 'true' : 'false'")

emit() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s\n' "$1" >>"$GITHUB_OUTPUT"
  fi
  return 0
}

if [ "$is_private" = "true" ]; then
  echo "Package is private. Skipping publish."
  emit "published=false"
  exit 0
fi

if [ -z "$version" ]; then
  echo "Error: version is missing from package.json." >&2
  exit 1
fi

# Fetch the published version. A 404 means this is the first publish; any other
# failure (auth, network) is a real error and should stop the release.
view_stderr=$(mktemp)
if published_version=$(npm view "$name" version 2>"$view_stderr"); then
  rm -f "$view_stderr"
else
  view_status=$?
  view_error=$(cat "$view_stderr")
  rm -f "$view_stderr"
  if printf '%s' "$view_error" | grep -qiE 'E404|404[[:space:]]+Not[[:space:]]+Found'; then
    published_version=""
  else
    echo "Error: failed to fetch published version for $name." >&2
    printf '%s\n' "$view_error" >&2
    exit "$view_status"
  fi
fi

echo "Local version:     $version"
echo "Published version: ${published_version:-<none>}"

# True when $1 is strictly greater than $2 (semver-aware via sort -V).
version_gt() { test "$(printf '%s\n' "$@" | sort -V | head -n1)" != "$1"; }

if [ -n "$published_version" ] && ! version_gt "$version" "$published_version"; then
  echo "Published version is >= local version. Nothing to publish."
  emit "published=false"
  exit 0
fi

echo "Publishing $name@$version"
# First-time scoped publishes default to restricted unless --access public.
npm publish --access public

emit "published=true"
emit "version=$version"
