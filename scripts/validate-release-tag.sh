#!/usr/bin/env bash
#
# Fails unless the release tag is exactly `v<version>` and that version has a
# CHANGELOG section.
#
#   scripts/validate-release-tag.sh v1.5.0
#   scripts/validate-release-tag.sh            # uses GITHUB_REF_NAME, else the tag on HEAD
#
# Two things go wrong at release time and both are silent until someone reads the
# release page:
#
#   1. the tag and package.json disagree, so the artifact is published under one
#      version and announced as another;
#   2. the version is bumped without a CHANGELOG entry, so `release.yml` has no
#      notes to attach and publishes an empty release.
#
# This is the gate for both, and it runs before anything is published.
set -euo pipefail

cd "$(dirname "$0")/.."

tag="${1:-${GITHUB_REF_NAME:-}}"
if [ -z "$tag" ]; then
  tag="$(git describe --tags --exact-match 2>/dev/null || true)"
fi
if [ -z "$tag" ]; then
  echo "validate-release-tag: no tag given and HEAD is not tagged" >&2
  exit 1
fi

version="$(node -p "require('./package.json').version")"
expected="v${version}"

if [ "$tag" != "$expected" ]; then
  echo "validate-release-tag: tag '$tag' does not match package.json version '$version' (expected '$expected')" >&2
  exit 1
fi
echo "validate-release-tag: $tag matches package.json"

if ! grep -qE "^## \[${version}\]" CHANGELOG.md; then
  echo "validate-release-tag: CHANGELOG.md has no '## [${version}]' section, so the release would have no notes" >&2
  exit 1
fi
echo "validate-release-tag: CHANGELOG.md has a ${version} section"

# The release notes themselves. Kept here rather than as four lines of awk
# inline in the workflow so it can be run — and seen to fail — locally.
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo 'notes<<__CHANGELOG__'
    awk -v v="$version" '
      $0 ~ "^## \\[" v "\\]" { inside = 1; next }
      inside && /^## \[/ { exit }
      inside { print }
    ' CHANGELOG.md | sed '/./,$!d'
    echo '__CHANGELOG__'
  } >> "$GITHUB_OUTPUT"
fi
