# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

pane-lyra-privacy-title = Lyra Browser
    .title = Lyra Browser

lyra-privacy-header =
    .heading = Lyra Browser
    .description = Fingerprint, DNS, fonts, timezone, leak protections, and optional P2P sync. Every control can be changed. Sites stay usable unless you pick Crowd mode.

lyra-fingerprint-group =
    .label = Fingerprint crowd
    .description = Firefox mode uses fingerprinting protection and the stock Firefox user agent. Crowd mode turns on Resist Fingerprinting, letterboxing, and a shared user agent.

lyra-fingerprint-mode =
    .label = Fingerprint mode
    .aria-description = Choose how Lyra Browser hides among other browsers

lyra-fingerprint-mode-firefox =
    .label = Firefox crowd
    .description = Stock Firefox user agent. Safer for site compatibility.

lyra-fingerprint-mode-crowd =
    .label = Crowd identical
    .description = Resist Fingerprinting. Matches LibreWolf and Mullvad. Some sites may break.

lyra-ua-mode =
    .label = User agent
    .aria-description = Choose the user agent string sent to websites

lyra-ua-mode-firefox =
    .label = Firefox default
    .description = Same platform and version string as Firefox ESR.

lyra-ua-mode-crowd =
    .label = Spoof crowd UA
    .description = Report the Resist Fingerprinting user agent even when RFP is off.

lyra-windows-group =
    .label = Window buckets
    .description = Round the inner window so fewer exact sizes leak. Letterboxing adds gray bars.

lyra-window-buckets =
    .label = Use window size buckets
    .description = Rounds new windows toward 1600x900 and related sizes.

lyra-letterboxing =
    .label = Letterbox the viewport
    .description = Adds gray bars so the page size matches a small set of buckets.

lyra-fonts-group =
    .label = Fonts
    .description = Bundled fonts plus font visibility limits reduce the font fingerprint. Web fonts stay on so pages still render.

lyra-bundled-fonts =
    .label = Load bundled fonts
    .description = Needs a restart. Compile flag --enable-bundled-fonts is on for Linux and Windows.

lyra-font-visibility =
    .label = Fonts websites can see

lyra-font-visibility-base =
    .label = Base system fonts only

lyra-font-visibility-langpack =
    .label = Base fonts and language packs

lyra-font-visibility-all =
    .label = All installed fonts

lyra-fonts-restrict =
    .label = Restrict extra fonts from fingerprinting
    .description = Keeps language-pack fonts in Firefox mode. Crowd mode uses the base set.

lyra-typing-group =
    .label = Typing and keyboard
    .description = Keyboard event spoofing and timer rounding. Lyra Browser does not insert fake key delays, which would break typing.

lyra-typing-protection =
    .label = Protect typing and keyboard fingerprinting
    .description = Spoofs KeyboardEvent fields and rounds event timestamps.

lyra-typing-delay =
    .label = Timestamp rounding

lyra-typing-delay-1ms =
    .label = 1 ms (Firefox default)

lyra-typing-delay-20ms =
    .label = 20 ms (recommended)

lyra-typing-delay-100ms =
    .label = 100 ms (stronger, can feel laggy)

lyra-spoof-group =
    .label = Timezone and leaks
    .description = Spoof timezone to UTC, reduce audio and WebRTC leaks, and keep sensors and geolocation off unless you turn them on.

lyra-timezone-spoof =
    .label = Spoof timezone to UTC
    .description = Reports Atlantic/Reykjavik. Sites that show local time may be wrong.

lyra-audio-protection =
    .label = Protect audio fingerprinting
    .description = Spoofs AudioContext sample rate. Can affect some web audio apps.

lyra-webrtc-protect =
    .label = Hide local IP from WebRTC
    .description = Drops host ICE candidates. Calls still work through STUN when a server is available.

lyra-sensors-block =
    .label = Block device sensors and gamepads
    .description = Motion, orientation, gamepad, and related device APIs stay off.

lyra-geo-mode =
    .label = Geolocation
    .aria-description = Block, spoof, or ask for location

lyra-geo-mode-block =
    .label = Block location
    .description = Sites cannot read GPS. Default.

lyra-geo-mode-spoof =
    .label = Spoof location
    .description = Returns the coordinates below. Default is Reykjavik, matching the UTC timezone spoof. No lookup is sent.

lyra-geo-mode-ask =
    .label = Ask each site
    .description = Real location via BeaconDB. You confirm each prompt.

lyra-geo-lat =
    .label = Spoof latitude

lyra-geo-lon =
    .label = Spoof longitude

lyra-dns-group =
    .label = DNS over HTTPS
    .description = Default resolver is dns.sb. Fallback to native DNS stays on unless you pick DoH only.

lyra-doh-mode =
    .label = DNS mode
    .aria-description = Choose how DNS queries are resolved

lyra-doh-mode-2 =
    .label = DNS over HTTPS, dns.sb first
    .description = Uses https://doh.dns.sb/dns-query and falls back if it fails.

lyra-doh-mode-3 =
    .label = DNS over HTTPS only
    .description = No native DNS fallback.

lyra-doh-mode-5 =
    .label = Native DNS
    .description = DoH off. Uses the operating system resolver.

lyra-doh-advanced =
    .label = Open Firefox DNS over HTTPS settings

lyra-sync-group =
    .label = P2P sync
    .description = Encrypted device-to-device sync through wss://sync.lyrabrowser.com/ws. The relay only sees ciphertext. Type the same pairing code on each device. Passwords are never sent.

lyra-sync-enabled =
    .label = Enable P2P sync
    .description = Connects to Lyra Browser websocket relay. Off by default.

lyra-sync-tabs =
    .label = Sync open tab URLs

lyra-sync-bookmarks =
    .label = Sync bookmarks into a Lyra Browser toolbar folder

lyra-sync-apply-tabs =
    .label = Open tabs received from paired devices
    .description = Off by default. Only https URLs, at most 10 per update.

lyra-sync-secret =
    .label = Pairing code
    .placeholder = LYRA-XXXX-XXXX

lyra-sync-pair =
    .label = Create a new pairing code

lyra-compat-group =
    .label = Extra privacy
    .description = Safe defaults that stay out of the way. Each one can be turned off.

lyra-https-only =
    .label = HTTPS-Only Mode

lyra-query-stripping =
    .label = Strip tracking query parameters

lyra-referrer =
    .label = Hide the page URL from other sites
    .description = Cross-site navigations do not send document.referrer. Same-site links still send it.

lyra-webgl =
    .label = Allow WebGL
    .description = Keep on. Maps and Cloudflare challenges need it. Renderer strings stay sanitized. Randomization is off so challenges can pass.

lyra-webgl-blocklist =
    .label = Disable WebGL on these sites
    .description = Space separated hosts. Use this instead of turning WebGL off globally.

lyra-webgl-allowlist =
    .label = Allow WebGL on these sites only
    .description = Space separated hosts. When this list is not empty, WebGL is opt-in per site. Leave empty so Cloudflare and maps keep working.

lyra-webgpu =
    .label = Allow WebGPU everywhere
    .description = Off by default. Extra fingerprint and GPU attack surface.

lyra-webgpu-allowlist =
    .label = Allow WebGPU on these sites only
    .description = Space separated hosts. Enables the API only there.

lyra-compat-sites =
    .label = Compatibility exceptions
    .description = Space separated hosts. Drops canvas and WebGL randomization on those sites so challenges can pass. Does not disable tracking protection.

lyra-gsb =
    .label = Google Safe Browsing lists
    .description = Off by default. Checks stay local after the list download. uBlock Origin already includes urlhaus.

lyra-translations =
    .label = Translate pages on this device
    .description = Firefox Translations. Models run locally. Page text is not sent to a cloud service.

lyra-newtab-container =
    .label = Hold the new tab button for containers
    .description = Work, banking, and school identities use separate cookies.

lyra-eme =
    .label = Allow DRM (EME)
    .description = Off by default. Needed only for some streaming sites.

lyra-ocsp =
    .label = Check OCSP for certificates
    .description = Off by default (CRLite covers revocation without phoning CAs).

lyra-spoof-english =
    .label = Spoof English locale to websites
    .description = Can break local-language pages. Off by default.

lyra-restart-note =
    .message = Bundled fonts and some fingerprint targets apply after a restart.

lyra-ua-mode-firefox-win =
    .label = Firefox on Windows
    .description = Report a Windows Firefox user agent.

lyra-ua-mode-firefox-mac =
    .label = Firefox on macOS
    .description = Report a macOS Firefox user agent.

lyra-ua-mode-chrome-win =
    .label = Chrome on Windows
    .description = Report a Windows Chrome user agent. Some sites may misdetect features.

lyra-ua-mode-edge-win =
    .label = Edge on Windows
    .description = Report a Windows Edge user agent.

lyra-ua-mode-safari-mac =
    .label = Safari on macOS
    .description = Report a macOS Safari user agent.

lyra-ua-mode-custom =
    .label = Custom string
    .description = Send the user agent typed below. Applies after restart.

lyra-ua-custom =
    .label = Custom user agent
    .description = Full User-Agent header value. Used when the Custom string mode is selected.

lyra-protections-group =
    .label = Local network
    .description = Stops public websites from reaching devices on your local network.

lyra-lan-block =
    .label = Block intrusions into the LAN
    .description = Public pages cannot contact private or loopback addresses, and tracker-initiated LAN requests are always blocked. Covers the technique Meta and Yandex used to probe localhost.

lyra-scripts-group =
    .label = Script blocking
    .description = Optional per-site JavaScript blocking. Changes apply to new page loads.

lyra-js-mode =
    .label = JavaScript policy

lyra-js-mode-off =
    .label = Allow scripts everywhere

lyra-js-mode-denylist =
    .label = Block on listed sites only

lyra-js-mode-allowlist =
    .label = Block everywhere except listed sites

lyra-js-blocklist =
    .label = Blocked sites
    .description = Space separated hosts or origins, for example example.com https://bad.test.

lyra-js-allowlist =
    .label = Allowed sites
    .description = Space separated hosts or origins allowed to run scripts.

lyra-storage-group =
    .label = Profile storage
    .description = Encrypt the SQLite databases in the profile, including cookies.sqlite.

lyra-storage-encrypt =
    .label = Encrypt profile databases at rest
    .description = Applies after restart and cannot be turned off for that profile. Cookies and site data become harder for offline tools to read.

lyra-sync-server =
    .label = Sync server
    .description = WebSocket endpoint for Lyra Browser sync. Default is wss://sync.lyrabrowser.com/ws. Point it at your own relay if you run one.

lyra-history-group =
    .label = History search
    .description = Optional richer history: a dedicated page at about:lyrahistory plus local page text indexing.

lyra-history-index =
    .label = Index page text for history search
    .description = Stores up to a few KB of page text locally so the history page can search inside pages. Never indexes private windows. All data stays on this machine.

lyra-history-open =
    .label = Open history search page

lyra-always-private =
    .label = Always start in private browsing
    .description = Every window is private. History, cookies and site data are not kept between sessions.

lyra-permissions-block =
    .label = Block camera, mic and notification prompts
    .description = Sites cannot ask for these permissions at all. Change per-site in the address bar.

lyra-fpi =
    .label = Isolate every site (first-party isolation)
    .description = Strongest isolation: every origin gets its own storage, cache and credentials. Expect breakage on logins and embedded content.

lyra-safest =
    .label = Disable JavaScript JIT and WebAssembly
    .description = Largest single exploit-surface reduction available. Sites still run scripts but much slower. Applies after restart.

lyra-wipe-group =
    .label = Clear data on exit
    .description = Chosen categories are wiped when the browser closes.

lyra-clear-cookies =
    .label = Cookies and site data

lyra-clear-cache =
    .label = Cached pages and files

lyra-clear-history =
    .label = Browsing history

lyra-clear-formdata =
    .label = Form history

lyra-clear-sessions =
    .label = Active sessions

lyra-update-check =
    .label = Check for Lyra Browser updates at startup
    .description = Off by default. One GitHub fetch after idle. The payload must be Ed25519 signed.

lyra-update-check-now =
    .label = Check for updates now
