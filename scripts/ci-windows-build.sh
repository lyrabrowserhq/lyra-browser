#!/usr/bin/env bash
# Fetch ESR, apply overlay, compile Lyra for Windows, pack a zip.
# Runs inside the MozillaBuild msys2 shell on a windows-latest runner.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../VERSION
source "$ROOT/VERSION"

SRC="${LYRA_SRC:-$ROOT/firefox-src}"
OUT="${LYRA_OUT:-$ROOT/out}"
# 4-way rustc parallelism OOMs a 16 GB hosted runner. Keep one core back.
JOBS="${LYRA_JOBS:-$(( $(nproc) > 1 ? $(nproc) - 1 : 1 ))}"

export MOZBUILD_STATE_PATH="${MOZBUILD_STATE_PATH:-${USERPROFILE:-$HOME}/.mozbuild}"
MOZBUILD_STATE_PATH="$(cygpath -m "$MOZBUILD_STATE_PATH")"
export PATH="$(cygpath -u "${USERPROFILE:-$HOME}")/.cargo/bin:${PATH}"
umask 022

# Long compiles on hosted runners get SIGTERM with no hint. Log memory
# and disk every minute so a kill is diagnosable after the fact.
( while :; do
    printf 'monitor %s | ' "$(date -u +%H:%M:%S)"
    powershell.exe -NoProfile -Command \
      "\$o=Get-CimInstance Win32_OperatingSystem; 'mem {0}/{1}MB' -f [int]((\$o.TotalVisibleMemorySize-\$o.FreePhysicalMemory)/1KB), [int](\$o.TotalVisibleMemorySize/1KB)" \
      2>/dev/null | tr -d '\r' | tr '\n' ' '
    df -h "$ROOT" | awk 'NR==2 {printf "disk %s used, %s free\n", $3, $4}'
    sleep 60
  done ) &
trap 'kill %1 2>/dev/null || true' EXIT

# A bare msys2 login shell does not get the MozillaBuild PATH. Its bin
# dir holds bundled tools like nasm.
export PATH="/c/mozilla-build/bin:$PATH"

# Bundled CPython is not on PATH either. Find it under mozilla-build.
if ! command -v python3 >/dev/null && ! command -v python >/dev/null; then
  pyexe="$(find /c/mozilla-build -maxdepth 3 \( -name 'python3.exe' -o -name 'python.exe' \) 2>/dev/null | head -1)"
  if [[ -n "$pyexe" ]]; then
    export PATH="$(dirname "$pyexe"):$PATH"
  fi
fi
if ! command -v python3 >/dev/null && command -v python >/dev/null; then
  mkdir -p "$HOME/.local/bin"
  printf '#!/usr/bin/env bash\nexec python "$@"\n' > "$HOME/.local/bin/python3"
  chmod +x "$HOME/.local/bin/python3"
  export PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v python3 >/dev/null; then
  echo "python3 missing from MozillaBuild PATH" >&2
  exit 1
fi

# Configure looks for gmake or mozmake. MozillaBuild 4.x ships neither.
# The mozmake.exe from Mozilla's public toolchain artifact is a plain
# native binary, so pull the pinned build and alias it.
if ! command -v gmake >/dev/null && ! command -v make >/dev/null; then
  mm_dir="$ROOT/.cache/mozmake"
  if [[ ! -x "$mm_dir/mozmake/mozmake.exe" ]]; then
    mkdir -p "$mm_dir"
    if [[ ! -f "$mm_dir/mozmake.tar.zst" ]]; then
      curl -fL --retry 3 -o "$mm_dir/mozmake.tar.zst" \
        "https://firefox-ci-tc.services.mozilla.com/api/index/v1/task/gecko.cache.level-3.toolchains.v3.win64-mozmake.latest/artifacts/public/build/mozmake.tar.zst"
    fi
    echo "f5814ba25533e399ec4bd94e10f5d48281e98f74bbb9467e1792db55945683f3  $mm_dir/mozmake.tar.zst" | sha256sum -c -
    /c/Windows/System32/tar.exe -C "$mm_dir" -xf "$mm_dir/mozmake.tar.zst"
  fi
  cp "$mm_dir/mozmake/mozmake.exe" "$mm_dir/mozmake/gmake.exe"
  cp "$mm_dir/mozmake/mozmake.exe" "$mm_dir/mozmake/make.exe"
  export PATH="$mm_dir/mozmake:$PATH"
fi

# msys tar forks to spawn xz and can hit dll base collisions on hosted
# runners. bsdtar in System32 is a native binary and does not fork.
if [[ -x "/c/Windows/System32/tar.exe" ]]; then
  export TAR="/c/Windows/System32/tar.exe"
fi

"$ROOT/scripts/fetch-firefox.sh" "$SRC"
"$ROOT/scripts/apply-overlay.sh" "$SRC"
"$ROOT/extensions/ublock/fetch.sh"

cat "$ROOT/mozconfig" "$ROOT/mozconfig.windows" > "$SRC/mozconfig"
{
  echo "mk_add_options MOZ_MAKE_FLAGS=\"-j${JOBS}\""
  echo "mk_add_options AUTOCLOBBER=1"
  if command -v sccache >/dev/null; then
    echo "ac_add_options --with-ccache=sccache"
    echo 'mk_add_options "export RUSTC_WRAPPER=sccache"'
    echo 'mk_add_options "export SCCACHE_IDLE_TIMEOUT=0"'
  fi
  if [[ -n "${EXTRA_MOZCONFIG:-}" ]]; then
    printf '%s\n' "$EXTRA_MOZCONFIG"
  fi
} >> "$SRC/mozconfig"

export SCCACHE_DIR="${SCCACHE_DIR:-$ROOT/.sccache}"

MOZCONFIG="$(cygpath -m "$SRC/mozconfig")"
# Bootstrap on Windows does not fetch a compiler. Use the clang-cl that
# ships in the runner image: VS LLVM tools first, standalone LLVM next.
for d in \
  "/c/Program Files/Microsoft Visual Studio/2022/Enterprise/VC/Tools/Llvm/x64/bin" \
  "/c/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/Llvm/x64/bin" \
  "/c/Program Files/LLVM/bin"; do
  if [[ -x "$d/clang-cl.exe" ]]; then
    export PATH="$d:$PATH"
    echo "clang-cl from $d"
    break
  fi
done
if ! command -v clang-cl >/dev/null; then
  echo "clang-cl not found on PATH or in the runner image" >&2
  exit 1
fi

if ! command -v nasm >/dev/null; then
  nasm_dir="$ROOT/.cache/nasm"
  mkdir -p "$nasm_dir"
  curl -fL --retry 3 -o "$nasm_dir/nasm.zip" \
    "https://www.nasm.us/pub/nasm/releasebuilds/2.16.03/win64/nasm-2.16.03-win64.zip"
  echo "3ee4782247bcb874378d02f7eab4e294a84d3d15f3f6ee2de2f47a46aa7226e6  $nasm_dir/nasm.zip" | sha256sum -c -
  /c/Windows/System32/tar.exe -C "$nasm_dir" -xf "$nasm_dir/nasm.zip"
  export PATH="$nasm_dir/nasm-2.16.03:$PATH"
fi
if ! command -v nasm >/dev/null; then
  echo "nasm not found" >&2
  exit 1
fi

# Configure needs the Windows App SDK redistributable DLLs. Bootstrap does
# not fetch the toolchain on Windows, so pull the pinned redist zip and
# extract only the DLLs the build copies into dist.
sdk_cache="$ROOT/.cache/winappsdk"
sdk_dir="$sdk_cache/x64"
if [[ ! -f "$sdk_dir/CoreMessagingXP.dll" ]]; then
  rm -rf "$sdk_dir"
  mkdir -p "$sdk_dir"
  redist="$sdk_cache/Microsoft.WindowsAppRuntime.Redist.2.2.zip"
  if [[ ! -f "$redist" ]]; then
    echo "downloading Windows App SDK redist"
    curl -fL --retry 3 -o "$redist" \
      "https://aka.ms/windowsappsdk/2.2/2.2.0/Microsoft.WindowsAppRuntime.Redist.2.2.zip"
  fi
  echo "ab078d5b1d730f093ed4e1a33d0e709d1dbca85fa4a10f546cc6824e3b48057f  $redist" | sha256sum -c -
  /c/Windows/System32/tar.exe -C "$sdk_cache" -xf "$redist" \
    "MSIX/win10-x64/Microsoft.WindowsAppRuntime.2.msix"
  msix="$sdk_cache/MSIX/win10-x64/Microsoft.WindowsAppRuntime.2.msix"
  for dll in \
    CoreMessagingXP.dll marshal.dll Microsoft.InputStateManager.dll \
    Microsoft.Internal.FrameworkUdk.dll Microsoft.UI.Composition.OSSupport.dll \
    Microsoft.UI.Input.dll Microsoft.UI.Windowing.Core.dll \
    Microsoft.UI.Windowing.dll Microsoft.WindowsAppRuntime.dll \
    Microsoft.WindowsAppRuntime.Insights.Resource.dll; do
    /c/Windows/System32/tar.exe -C "$sdk_dir" -xf "$msix" "$dll"
  done
  rm -rf "$sdk_cache/MSIX"
fi
export MOZ_WINDOWS_APP_SDK_DIR="$(cygpath -m "$sdk_dir")"

# Wasm-sandboxed libraries need a wasi sysroot. Bootstrap does not fetch
# it on Windows, so unpack the pinned wasi-sdk sysroot. wasi-sdk 27 is
# built on LLVM 20.1.8, matching the clang 20 in the runner image.
wasi_cache="$ROOT/.cache/wasi"
wasi_dir="$wasi_cache/wasi-sysroot-27.0"
if [[ ! -f "$wasi_dir/lib/wasm32-wasi/libc.a" ]]; then
  mkdir -p "$wasi_cache"
  tarball="$wasi_cache/wasi-sysroot-27.0.tar.gz"
  if [[ ! -f "$tarball" ]]; then
    echo "downloading wasi sysroot"
    curl -fL --retry 3 -o "$tarball" \
      "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/wasi-sysroot-27.0.tar.gz"
  fi
  echo "7110ac48f5d0b1f6ab67d57aecf52450540dddd790cafdc45f0fdfb429bdab84  $tarball" | sha256sum -c -
  /c/Windows/System32/tar.exe -C "$wasi_cache" -xzf "$tarball"
fi
export WASI_SYSROOT="$(cygpath -m "$wasi_dir")"

# The wasm link check wants libclang_rt.builtins.a for wasm32-unknown-wasi
# inside the clang resource dir. Drop the pinned copy next to the image
# clang we put on PATH.
rt_tgz="$wasi_cache/libclang_rt-27.0.tar.gz"
clang_lib="$(dirname "$(command -v clang-cl)")/../lib/clang"
if [[ -d "$clang_lib" ]] \
  && ! ls "$clang_lib"/*/lib/wasm32-unknown-wasi/libclang_rt.builtins.a >/dev/null 2>&1; then
  if [[ ! -f "$rt_tgz" ]]; then
    curl -fL --retry 3 -o "$rt_tgz" \
      "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-27/libclang_rt-27.0.tar.gz"
  fi
  echo "9e0f382110a3cf9196f02432c8f2e54d151515de36f9311c8c16073f6e6b16d3  $rt_tgz" | sha256sum -c -
  for vdir in "$clang_lib"/*/lib; do
    mkdir -p "$vdir/wasm32-unknown-wasi"
    /c/Windows/System32/tar.exe -C "$vdir/wasm32-unknown-wasi" -xzf "$rt_tgz" \
      --strip-components=2 "libclang_rt-27.0/wasm32-unknown-wasi/libclang_rt.builtins.a"
  done
fi

export MOZCONFIG
cd "$SRC"

./mach --no-interactive bootstrap --application-choice browser --no-system-changes

# Windows bootstrap installs rustup but not cbindgen.
if ! command -v cbindgen >/dev/null; then
  cargo install cbindgen --locked
fi

# Configure needs the windows crate source extracted on disk. Mozilla does
# not ship it in the tarball. Pull the pinned crate from static.crates.io
# and export MOZ_WINDOWS_RS_DIR for configure.
winrs_ver="0.62.2"
winrs_dir="$ROOT/.cache/windows-rs/windows-$winrs_ver"
if [[ ! -f "$winrs_dir/Cargo.toml" ]]; then
  mkdir -p "$ROOT/.cache/windows-rs"
  crate="$ROOT/.cache/windows-rs/windows-$winrs_ver.crate"
  if [[ ! -f "$crate" ]]; then
    echo "downloading windows-rs crate"
    curl -fL --retry 3 -o "$crate" \
      "https://static.crates.io/crates/windows/windows-$winrs_ver.crate"
  fi
  echo "527fadee13e0c05939a6a05d5bd6eec6cd2e3dbd648b9f8e447c6518133d8580  $crate" | sha256sum -c -
  /c/Windows/System32/tar.exe -C "$ROOT/.cache/windows-rs" -xzf "$crate"
fi
export MOZ_WINDOWS_RS_DIR="$(cygpath -m "$winrs_dir")"

# gkrust compiles with fat LTO and one codegen unit, needing more RAM than
# a hosted runner has. Thin LTO plus a few codegen units still optimizes
# well enough for a CI artifact and fits in memory.
sed -i \
  -e 's/cargo_rustc_flags += -Clto\$(if \$(filter full,\$(MOZ_LTO_RUST_CROSS)),=fat)/cargo_rustc_flags += -Clto=thin/' \
  -e 's/RUSTFLAGS += -C codegen-units=1/RUSTFLAGS += -C codegen-units=4/' \
  "$SRC/config/makefiles/rust.mk"
grep -nE "cargo_rustc_flags \+= -Clto|codegen-units=" "$SRC/config/makefiles/rust.mk"

./mach configure
./mach build

OBJDIR="$(ls -d "$SRC"/obj-*/ 2>/dev/null | head -1)"
BIN="${OBJDIR%/}/dist/bin"
if [[ ! -d "$BIN" ]]; then
  echo "dist bin missing under $SRC/obj-*" >&2
  exit 1
fi

"$ROOT/scripts/package-extras.sh" "$BIN"

if [[ ! -x "$BIN/lyra.exe" ]]; then
  echo "lyra.exe missing after package-extras" >&2
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

mkdir -p "$OUT"
STAGE="$OUT/lyra-${LYRA_VERSION}-windows-x86_64"
ZIP="$OUT/lyra-${LYRA_VERSION}-windows-x86_64.zip"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp -aL "$BIN/." "$STAGE/"

if command -v 7z >/dev/null; then
  (cd "$STAGE" && 7z a -tzip -mx=5 "$ZIP" . >/dev/null)
elif [[ -x "/c/Program Files/7-Zip/7z.exe" ]]; then
  (cd "$STAGE" && "/c/Program Files/7-Zip/7z.exe" a -tzip -mx=5 "$ZIP" . >/dev/null)
elif command -v zip >/dev/null; then
  (cd "$STAGE" && zip -qr "$ZIP" .)
else
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path '$(cygpath -w "$STAGE")\\*' -DestinationPath '$(cygpath -w "$ZIP")' -CompressionLevel Optimal"
fi
rm -rf "$STAGE"

# The zip must contain plain files only: no symlinks and nothing
# referencing the runner workspace.
python3 - "$ZIP" <<'PYEOF'
import sys
import zipfile

zf = zipfile.ZipFile(sys.argv[1])
bad = []
for info in zf.infolist():
    mode = (info.external_attr >> 16) & 0o170000
    if mode == 0o120000:
        bad.append(("symlink", info.filename))
    if info.filename.startswith("/") or ":" in info.filename.split("/")[0]:
        bad.append(("absolute", info.filename))
if bad:
    for kind, name in bad[:20]:
        print(f"bad entry: {kind} {name}", file=sys.stderr)
    sys.exit(1)
print(f"zip ok: {len(zf.infolist())} entries")
PYEOF

ls -lh "$OUT"
echo "artifact $ZIP"
