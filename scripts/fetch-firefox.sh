#!/usr/bin/env bash
# Download the pinned Firefox ESR source tarball. Does not vendor it in git.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../VERSION
source "$ROOT/VERSION"

CACHE="${LYRA_CACHE:-$ROOT/.cache/firefox}"
NAME="firefox-${FIREFOX_VERSION}.source.tar.xz"
DEST="$CACHE/$NAME"
ASC="$DEST.asc"
EXTRACT="${1:-$ROOT/firefox-src}"

mkdir -p "$CACHE"

if [[ ! -f "$DEST" ]]; then
  echo "downloading $FIREFOX_SOURCE_URL"
  curl -fL --retry 3 --retry-delay 2 -o "$DEST.part" "$FIREFOX_SOURCE_URL"
  mv "$DEST.part" "$DEST"
fi

if [[ ! -f "$ASC" ]]; then
  echo "downloading $FIREFOX_SOURCE_ASC_URL"
  curl -fL --retry 3 --retry-delay 2 -o "$ASC" "$FIREFOX_SOURCE_ASC_URL" || true
fi

if [[ -z "${FIREFOX_SOURCE_SHA256:-}" ]]; then
  echo "VERSION is missing FIREFOX_SOURCE_SHA256" >&2
  exit 1
fi
echo "$FIREFOX_SOURCE_SHA256  $DEST" | sha256sum -c -
echo "tarball: $DEST"

if [[ "${LYRA_SKIP_EXTRACT:-0}" == "1" ]]; then
  exit 0
fi

mkdir -p "$EXTRACT"
if [[ -f "$EXTRACT/mach" ]]; then
  echo "source already extracted at $EXTRACT"
  exit 0
fi

echo "extracting into $EXTRACT (this takes a few minutes)"
"${TAR:-tar}" -C "$EXTRACT" --strip-components=1 -xf "$DEST"
echo "extracted $EXTRACT"
