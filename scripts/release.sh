#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: ./scripts/release.sh <version> (e.g. 0.2.0)}"

# Strip leading v if provided
VERSION="${VERSION#v}"

# Bump version in tauri.conf.json
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json
rm -f src-tauri/tauri.conf.json.bak

git add src-tauri/tauri.conf.json
git commit -m "v$VERSION"
git tag "v$VERSION"
git push origin main "v$VERSION"

echo "Released v$VERSION"
