#!/usr/bin/env bash
# Downloads static ffmpeg/ffprobe binaries for all supported platforms.
# Places them in src-tauri/binaries/ with Tauri's target-triple naming convention.
#
# Usage: ./scripts/download-ffmpeg.sh

set -euo pipefail

BINDIR="src-tauri/binaries"
TMPDIR=$(mktemp -d)

cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

mkdir -p "$BINDIR"

echo "==> Downloading macOS (x86_64) ffmpeg/ffprobe from evermeet.cx..."
curl -L "https://evermeet.cx/ffmpeg/get/zip" -o "$TMPDIR/ffmpeg-mac.zip"
curl -L "https://evermeet.cx/ffmpeg/get/ffprobe/zip" -o "$TMPDIR/ffprobe-mac.zip"
unzip -o "$TMPDIR/ffmpeg-mac.zip" -d "$TMPDIR/mac"
unzip -o "$TMPDIR/ffprobe-mac.zip" -d "$TMPDIR/mac"

# macOS x86_64 (native Intel)
cp "$TMPDIR/mac/ffmpeg"  "$BINDIR/ffmpeg-x86_64-apple-darwin"
cp "$TMPDIR/mac/ffprobe" "$BINDIR/ffprobe-x86_64-apple-darwin"
# macOS aarch64 (runs via Rosetta 2 — no native arm64 static builds available)
cp "$TMPDIR/mac/ffmpeg"  "$BINDIR/ffmpeg-aarch64-apple-darwin"
cp "$TMPDIR/mac/ffprobe" "$BINDIR/ffprobe-aarch64-apple-darwin"

echo "==> Downloading Windows (x86_64) ffmpeg/ffprobe from BtbN..."
curl -L "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" \
  -o "$TMPDIR/ffmpeg-win.zip"
unzip -o "$TMPDIR/ffmpeg-win.zip" "*/bin/ffmpeg.exe" "*/bin/ffprobe.exe" -d "$TMPDIR/win"
cp "$TMPDIR/win/"*/bin/ffmpeg.exe  "$BINDIR/ffmpeg-x86_64-pc-windows-msvc.exe"
cp "$TMPDIR/win/"*/bin/ffprobe.exe "$BINDIR/ffprobe-x86_64-pc-windows-msvc.exe"

echo "==> Downloading Linux (x86_64) ffmpeg/ffprobe from BtbN..."
curl -L "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz" \
  -o "$TMPDIR/ffmpeg-linux.tar.xz"
tar xf "$TMPDIR/ffmpeg-linux.tar.xz" -C "$TMPDIR/linux" --strip-components=2 "*/bin/ffmpeg" "*/bin/ffprobe" 2>/dev/null || {
  # macOS tar doesn't support --strip-components with path filter, fallback
  mkdir -p "$TMPDIR/linux"
  tar xf "$TMPDIR/ffmpeg-linux.tar.xz" -C "$TMPDIR/linux-full"
  cp "$TMPDIR/linux-full/"*/bin/ffmpeg  "$TMPDIR/linux/ffmpeg"
  cp "$TMPDIR/linux-full/"*/bin/ffprobe "$TMPDIR/linux/ffprobe"
}
cp "$TMPDIR/linux/ffmpeg"  "$BINDIR/ffmpeg-x86_64-unknown-linux-gnu"
cp "$TMPDIR/linux/ffprobe" "$BINDIR/ffprobe-x86_64-unknown-linux-gnu"

# Make all executable
chmod +x "$BINDIR"/*

echo ""
echo "==> Done! Binaries placed in $BINDIR:"
ls -lh "$BINDIR/"
