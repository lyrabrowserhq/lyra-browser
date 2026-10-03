#!/usr/bin/env bash
# Build Lyra inside a container. Assumes system packages are installed and
# the tree is fetched and overlaid. Everything runs as the current user.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${SRC:-$ROOT/firefox-src}"
OUT="${OUT:-$ROOT/out}"
JOBS="${JOBS:-2}"

VERSION_FILE="$ROOT/VERSION"
LYRA_VERSION="$(grep -E '^LYRA_VERSION=' "$VERSION_FILE" | cut -d= -f2)"
UBLOCK_ID="$(grep -E '^UBLOCK_ID=' "$VERSION_FILE" | cut -d= -f2)"

cat "$ROOT/mozconfig" "$ROOT/mozconfig.linux" > "$SRC/mozconfig"
{
  echo "mk_add_options MOZ_MAKE_FLAGS=\"-j${JOBS}\""
  echo "mk_add_options AUTOCLOBBER=1"
  echo "ac_add_options --with-ccache=$(command -v ccache)"
  if [[ -n "${EXTRA_MOZCONFIG:-}" ]]; then
    printf '%s\n' "$EXTRA_MOZCONFIG"
  fi
} >> "$SRC/mozconfig"

export MOZCONFIG="$SRC/mozconfig"
cd "$SRC"

sed -i \
  -e 's/cargo_rustc_flags += -Clto\$(if \$(filter full,\$(MOZ_LTO_RUST_CROSS)),=fat)/cargo_rustc_flags += -Clto=thin/' \
  -e 's/RUSTFLAGS += -C codegen-units=1/RUSTFLAGS += -C codegen-units=4/' \
  "$SRC/config/makefiles/rust.mk"

./mach --no-interactive bootstrap --application-choice browser --no-system-changes

run_mach() {
  env -i \
    HOME="$HOME" \
    USER="${USER:-builder}" \
    LOGNAME="${LOGNAME:-${USER:-builder}}" \
    PATH="$PATH" \
    SHELL="${SHELL:-/bin/bash}" \
    TERM="${TERM:-xterm}" \
    LANG="${LANG:-C.UTF-8}" \
    LC_ALL="${LC_ALL:-C.UTF-8}" \
    MOZCONFIG="$MOZCONFIG" \
    MOZBUILD_STATE_PATH="${MOZBUILD_STATE_PATH:-$HOME/.mozbuild}" \
    CCACHE_DIR="${CCACHE_DIR:-$HOME/.ccache}" \
    CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}" \
    RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}" \
    ./mach "$@"
}

run_mach configure
run_mach build
run_mach package

OBJDIR="$(ls -d "$SRC"/obj-*/ 2>/dev/null | head -1)"
BIN="${OBJDIR%/}/dist/bin"
if [[ ! -d "$BIN" ]]; then
  echo "dist bin missing under $SRC/obj-*" >&2
  exit 1
fi

"$ROOT/scripts/package-extras.sh" "$BIN"

if [[ ! -x "$BIN/lyra" ]]; then
  echo "lyra binary missing after package-extras" >&2
  exit 1
fi
if ! grep -q '^Name=Lyra$' "$BIN/application.ini" \
  && ! grep -q '^Name=Lyra$' "$BIN/browser/application.ini"; then
  echo "application.ini Name is not Lyra" >&2
  exit 1
fi
if ! grep -q '{3a3a4f99-f5ed-5ace-b1c2-6ca778f01a59}' "$BIN/application.ini" \
  && ! grep -q '{3a3a4f99-f5ed-5ace-b1c2-6ca778f01a59}' "$BIN/browser/application.ini"; then
  echo "application.ini app id is not Lyra" >&2
  exit 1
fi
if [[ ! -f "$BIN/distribution/extensions/${UBLOCK_ID}.xpi" ]]; then
  echo "uBlock XPI missing from dist" >&2
  exit 1
fi

"$BIN/lyra" --version || true

mkdir -p "$OUT"
STAGE="$OUT/lyra-${LYRA_VERSION}-linux-x86_64"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -aL "$BIN/." "$STAGE/"
tar -C "$OUT" -cJf "$OUT/lyra-${LYRA_VERSION}-linux-x86_64.tar.xz" "$(basename "$STAGE")"
rm -rf "$STAGE"

if tar -tJvf "$OUT/lyra-${LYRA_VERSION}-linux-x86_64.tar.xz" | grep -q '^l'; then
  echo "symlinks leaked into artifact" >&2
  exit 1
fi

ls -lh "$OUT"
echo "artifact $OUT/lyra-${LYRA_VERSION}-linux-x86_64.tar.xz"
