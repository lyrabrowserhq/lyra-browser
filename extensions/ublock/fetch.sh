#!/usr/bin/env bash
# Fetch the pinned uBlock Origin signed XPI into the local cache.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck source=../../VERSION
source "$ROOT/VERSION"

CACHE="${LYRA_CACHE:-$ROOT/.cache/ublock}"
DEST="$CACHE/$UBLOCK_XPI_NAME"

mkdir -p "$CACHE"

if [[ -f "$DEST" ]]; then
  got="$(sha256sum "$DEST" | awk '{print $1}')"
  if [[ "$got" == "$UBLOCK_XPI_SHA256" ]]; then
    echo "uBlock Origin $UBLOCK_VERSION already cached: $DEST"
    echo "$DEST"
    exit 0
  fi
  echo "cached XPI hash mismatch, re-downloading" >&2
  rm -f "$DEST"
fi

echo "downloading uBlock Origin $UBLOCK_VERSION"
tmp="$DEST.part"
curl -fL --retry 3 --retry-delay 2 -o "$tmp" "$UBLOCK_XPI_URL"
got="$(sha256sum "$tmp" | awk '{print $1}')"
if [[ "$got" != "$UBLOCK_XPI_SHA256" ]]; then
  echo "sha256 mismatch for $UBLOCK_XPI_NAME" >&2
  echo "  expected $UBLOCK_XPI_SHA256" >&2
  echo "  got      $got" >&2
  rm -f "$tmp"
  exit 1
fi
mv "$tmp" "$DEST"
echo "verified $DEST"
echo "$DEST"
