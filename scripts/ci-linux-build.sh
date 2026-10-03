#!/usr/bin/env bash
# Fetch ESR, apply overlay, compile Lyra, stamp extras, pack a tarball.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../VERSION
source "$ROOT/VERSION"

SRC="${LYRA_SRC:-$ROOT/firefox-src}"
OUT="${LYRA_OUT:-$ROOT/out}"
# Unified bindings TUs plus rustc OOM a 16 GB hosted runner past -j2.
JOBS="${LYRA_JOBS:-2}"

export PATH="${HOME}/.cargo/bin:${PATH}"
export MOZBUILD_STATE_PATH="${MOZBUILD_STATE_PATH:-$HOME/.mozbuild}"
umask 022

# Long compiles on hosted runners get SIGTERM with no hint. Log memory
# and disk every minute so a kill is diagnosable after the fact.
( while :; do
    printf 'monitor %s | ' "$(date -u +%H:%M:%S)"
    free -m | awk 'NR==2 {printf "mem %s/%sMB ", $3, $2} NR==3 {printf "swap %s/%sMB ", $3, $2}'
    df -h "$ROOT" | awk 'NR==2 {printf "disk %s used, %s free\n", $3, $4}'
    sleep 60
  done ) &
trap 'kill %1 2>/dev/null || true' EXIT

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  python3 python3-pip python3-venv python3-dev \
  build-essential ccache curl git pkg-config \
  libasound2-dev libdbus-glib-1-dev libgtk-3-dev libpulse-dev \
  libx11-xcb-dev libxt-dev libxrandr-dev libxcomposite-dev \
  libxdamage-dev libxfixes-dev libdrm-dev libpango1.0-dev \
  libatk1.0-dev libcairo2-dev libgdk-pixbuf-2.0-dev \
  m4 unzip zip nasm xz-utils \
  clang llvm lld

"$ROOT/scripts/fetch-firefox.sh" "$SRC"
"$ROOT/scripts/apply-overlay.sh" "$SRC"
"$ROOT/extensions/ublock/fetch.sh"

cat "$ROOT/mozconfig" "$ROOT/mozconfig.linux" > "$SRC/mozconfig"
{
  echo "mk_add_options MOZ_MAKE_FLAGS=\"-j${JOBS}\""
  echo "mk_add_options AUTOCLOBBER=1"
  if command -v sccache >/dev/null; then
    echo "ac_add_options --with-ccache=sccache"
    echo 'mk_add_options "export RUSTC_WRAPPER=sccache"'
    echo 'mk_add_options "export SCCACHE_IDLE_TIMEOUT=0"'
  else
    echo "ac_add_options --with-ccache=$(command -v ccache)"
  fi
  if [[ -n "${EXTRA_MOZCONFIG:-}" ]]; then
    printf '%s\n' "$EXTRA_MOZCONFIG"
  fi
} >> "$SRC/mozconfig"

export MOZCONFIG="$SRC/mozconfig"
cd "$SRC"

# gkrust compiles with fat LTO and one codegen unit, needing more RAM than
# a hosted runner has even with swap. Thin LTO plus a few codegen units
# keeps a CI artifact well optimized and fits in memory.
sed -i \
  -e 's/cargo_rustc_flags += -Clto\$(if \$(filter full,\$(MOZ_LTO_RUST_CROSS)),=fat)/cargo_rustc_flags += -Clto=thin/' \
  -e 's/RUSTFLAGS += -C codegen-units=1/RUSTFLAGS += -C codegen-units=4/' \
  "$SRC/config/makefiles/rust.mk"
grep -nE "cargo_rustc_flags \+= -Clto|codegen-units=" "$SRC/config/makefiles/rust.mk"

./mach --no-interactive bootstrap --application-choice browser --no-system-changes

run_mach() {
  env -i \
    HOME="$HOME" \
    USER="${USER:-runner}" \
    LOGNAME="${LOGNAME:-${USER:-runner}}" \
    PATH="$PATH" \
    SHELL="${SHELL:-/bin/bash}" \
    TERM="${TERM:-xterm}" \
    LANG="${LANG:-C.UTF-8}" \
    LC_ALL="${LC_ALL:-C.UTF-8}" \
    MOZCONFIG="$MOZCONFIG" \
    MOZBUILD_STATE_PATH="$MOZBUILD_STATE_PATH" \
    CCACHE_DIR="${CCACHE_DIR:-$HOME/.ccache}" \
    SCCACHE_DIR="${SCCACHE_DIR:-$ROOT/.sccache}" \
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
