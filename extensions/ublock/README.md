# uBlock Origin packaging

Lyra ships uBlock Origin by default. This directory pins a signed Firefox XPI.

## Why

uBlock Origin is a content blocker that runs well on Firefox. License is GPL-3.0-only. Upstream: https://github.com/gorhill/uBlock.

## Pin

See `pin.json` and repo-root `VERSION`.

- Current pin: 1.75.0 (Firefox signed XPI)
- Download: GitHub Releases signed XPI (hash-pinned)
- Runtime updates: AMO latest via `policies.json` (`updates_disabled: false`)

The XPI is not in git. Run `extensions/ublock/fetch.sh`.

## Install

1. Copy the signed XPI to `$prefix/lyra/distribution/extensions/uBlock0@raymondhill.net.xpi` (`scripts/package-extras.sh`).
2. `policies.json` `ExtensionSettings` sets `installation_mode` to `force_installed`, AMO `install_url`, `private_browsing` true, updates allowed.
3. mozconfig: `--allow-addon-sideload` and `--with-unsigned-addon-scopes=app,system`. The pinned file is AMO-signed.

Users can disable the add-on. A profile reset still force-installs it.

## Builtin system add-on

Unpacking into `browser/extensions/` and `omni.ja` would need a per-ESR tree patch. Not done.

## Bump the pin

1. Take the new signed XPI from https://github.com/gorhill/uBlock/releases
2. Update `VERSION` and `extensions/ublock/pin.json`
3. Run `extensions/ublock/fetch.sh`
4. Rebuild so `package-extras.sh` ships the new file

Do not vendor the XPI in git. Do not ship unsigned XPIs in release packages.
