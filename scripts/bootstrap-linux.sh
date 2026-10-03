#!/usr/bin/env bash
# Print Linux bootstrap notes. Does not install packages.

set -euo pipefail

cat <<'EOF'
Lyra Linux build

This repo does not vendor Firefox. Use a Linux host with about 30 GB disk
and 16 GB RAM.

1. Dependencies (Debian / Ubuntu)

   sudo apt install python3 python3-pip python3-venv python3-dev \
     build-essential ccache curl git pkg-config libasound2-dev \
     libdbus-glib-1-dev libgtk-3-dev libpulse-dev libx11-xcb-dev \
     libxt-dev m4 unzip zip nasm rustc cargo clang llvm lld

   After extract, `./mach bootstrap` is the supported way to get clang,
   rust, and sysroot pieces.

2. Fetch ESR source (not committed)

   ./scripts/fetch-firefox.sh ./firefox-src

3. Apply overlay

   ./scripts/apply-overlay.sh ./firefox-src

4. Fetch uBlock Origin XPI

   ./extensions/ublock/fetch.sh

5. Configure and build

   cd firefox-src
   cat ../mozconfig ../mozconfig.linux > mozconfig
   export MOZCONFIG="$PWD/mozconfig"
   ./mach configure
   ./mach build
   ./mach package

6. Stamp policies and uBlock

   ../scripts/package-extras.sh ./objdir/dist/bin

7. Run

   ./objdir/dist/bin/lyra

`mach package` writes under objdir/dist/. GitHub Actions compiles this
path on v* tags and workflow_dispatch (see .github/workflows/build.yml).
EOF
