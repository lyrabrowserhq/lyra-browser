<h1>
  <img src="branding/lyra/assets/lyra-mark.png" alt="" width="48" height="48" align="absmiddle">
  Lyra Browser
</h1>

Privacy browser overlay. This git repo does not contain engine source.

Pinned base: 153.4.0esr.

Site: https://lyrabrowser.com

## Features

| Feature | Detail |
| --- | --- |
| Engine | 153.4.0esr |
| uBlock Origin | Force-installed 1.75.0, AMO updates on |
| Telemetry | Mozilla telemetry, studies, Pocket, and accounts promo off |
| Search | Seek. Brave Search and DuckDuckGo still listed. Google, Bing, Amazon, eBay, and Twitter engines removed |
| DNS | DNS over HTTPS via dns.sb, native fallback on |
| Fingerprint | Crowd by default (FPP, no RFP, no letterboxing). Optional Resist Fingerprinting mode |
| Tracking | Strict blocking, Global Privacy Control, HTTPS-Only, query stripping |
| Graphics | WebGL on and sanitized (Cloudflare-safe). WebGPU off. Per-site allow and block lists |
| Location | GPS blocked by default. Optional Reykjavik spoof, or ask per site |
| Updates | Opt-in. Ed25519-signed release.json, SHA-256 artifacts, GitHub provenance attestations |
| DRM | Encrypted Media Extensions off |
| WebRTC | Local IPs hidden (no host ICE candidates) |
| LAN | Public pages cannot probe private or loopback addresses |
| Sync | Optional encrypted P2P via Sync, off by default |

Every control in the settings pane can be changed. Crowd mode is the one that will break some sites. Tag releases fail if `LYRA_RELEASE_KEY` is missing. Keep a backup of `secrets/lyra-release.pem` off this machine.

## Build

About 30 GB disk and 16 GB RAM. From this repo:

```
podman build --output type=local,dest=out .
```

Writes `out/lyra-<version>-linux-x86_64.tar.xz`. To keep the toolchain image and open a shell instead:

```
podman build --target build -t lyra-build .
podman run --rm -it lyra-build bash
```

Host without a container:

```
./scripts/fetch-firefox.sh ./firefox-src
./scripts/apply-overlay.sh ./firefox-src
./extensions/ublock/fetch.sh
cd firefox-src
cat ../mozconfig ../mozconfig.linux > mozconfig
export MOZCONFIG="$PWD/mozconfig"
./mach bootstrap
./mach configure
./mach build
./mach package
../scripts/package-extras.sh ./objdir/dist/bin
./objdir/dist/bin/lyra
```

## License

Overlay files: MPL-2.0.
Lyra mark: Lyra.
Space Mono: OFL-1.1.
uBlock Origin: GPL-3.0-only, fetched not vendored.

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
