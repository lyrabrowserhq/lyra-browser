#!/usr/bin/env python3
# Validate Lyra layout, JSON, and privacy policy invariants.

"""CI entry point. Does not compile Firefox."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
WARNS: list[str] = []


def error(msg: str) -> None:
    ERRORS.append(msg)


def warn(msg: str) -> None:
    WARNS.append(msg)


def require(path: Path) -> None:
    if not path.exists():
        error(f"missing {path.relative_to(ROOT)}")


def load_version() -> dict[str, str]:
    data: dict[str, str] = {}
    path = ROOT / "VERSION"
    require(path)
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key] = value
    for key in (
        "LYRA_VERSION",
        "LYRA_APP_ID",
        "FIREFOX_VERSION",
        "FIREFOX_SOURCE_URL",
        "FIREFOX_SOURCE_SHA256",
        "UBLOCK_VERSION",
        "UBLOCK_XPI_SHA256",
        "UBLOCK_ID",
    ):
        if key not in data:
            error(f"VERSION missing {key}")
    if data.get("FIREFOX_VERSION") and not data["FIREFOX_VERSION"].endswith("esr"):
        warn("FIREFOX_VERSION is not an ESR tag")
    if "firefox.com" in data.get("FIREFOX_SOURCE_URL", "") and "releases" not in data.get(
        "FIREFOX_SOURCE_URL", ""
    ):
        warn("unexpected Firefox source URL")
    return data


def check_json(path: Path) -> object | None:
    require(path)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        error(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return None


def check_policies(data: object | None) -> None:
    if not isinstance(data, dict):
        return
    policies = data.get("policies")
    if not isinstance(policies, dict):
        error("policies.json missing policies object")
        return
    for key in (
        "DisableTelemetry",
        "DisableFirefoxStudies",
        "DisablePocket",
        "DisableFirefoxAccounts",
        "NoDefaultBookmarks",
        "DisableAppUpdate",
    ):
        if policies.get(key) is not True:
            error(f"policies.json {key} must be true")
    home = policies.get("FirefoxHome", {})
    if isinstance(home, dict):
        for key in ("SponsoredTopSites", "Pocket", "SponsoredPocket"):
            if home.get(key) is not False:
                error(f"policies.json FirefoxHome.{key} must be false")
    ext = policies.get("ExtensionSettings", {})
    ublock = ext.get("uBlock0@raymondhill.net") if isinstance(ext, dict) else None
    if not isinstance(ublock, dict):
        error("policies.json missing uBlock Origin ExtensionSettings")
    else:
        if ublock.get("installation_mode") != "force_installed":
            error("uBlock Origin must be force_installed")
        if "ublock-origin" not in str(ublock.get("install_url", "")):
            error("uBlock Origin install_url should point at AMO ublock-origin")
    doh = policies.get("DNSOverHTTPS", {})
    if not isinstance(doh, dict):
        error("policies.json missing DNSOverHTTPS")
    else:
        if doh.get("Enabled") is not True:
            error("policies.json DNSOverHTTPS.Enabled must be true")
        if doh.get("Locked") is not False:
            error("policies.json DNSOverHTTPS must not be locked")
        provider = str(doh.get("ProviderURL", ""))
        if "doh.dns.sb" not in provider:
            error("policies.json DNSOverHTTPS.ProviderURL must be dns.sb")
        if doh.get("Fallback") is not True:
            error("policies.json DNSOverHTTPS.Fallback must be true")
    if policies.get("TranslateEnabled") is not True:
        error("policies.json TranslateEnabled must be true")
    search = policies.get("SearchEngines", {})
    if not isinstance(search, dict) or search.get("Default") != "Seek":
        error("policies.json SearchEngines.Default must be Seek")
    added = search.get("Add") if isinstance(search, dict) else None
    if not isinstance(added, list) or not any(
        isinstance(engine, dict)
        and engine.get("Name") == "Seek"
        and "seek.lyrabrowser.com" in str(engine.get("URLTemplate", ""))
        for engine in added
    ):
        error("policies.json must Add Seek at seek.lyrabrowser.com")
    if isinstance(added, list) and not any(
        isinstance(engine, dict) and engine.get("Name") == "Brave Search"
        for engine in added
    ):
        error("policies.json must Add Brave Search")
    if search.get("Default") == "Brave Search" or search.get("DefaultPrivate") == "Brave Search":
        error("policies.json must not make Brave Search the default")
    text = json.dumps(data)
    for banned in ("telemetry.mozilla.org", "incoming.telemetry", "pocket.com"):
        if banned in text.lower():
            error(f"policies.json should not phone home to {banned}")


def check_lyra_cfg() -> None:
    path = ROOT / "prefs" / "lyra.cfg"
    require(path)
    if not path.exists():
        return
    raw = path.read_text()
    if not raw.startswith("\n"):
        error("prefs/lyra.cfg first line must be empty")
    for needle in (
        'lockPref("toolkit.telemetry.enabled", false)',
        'lockPref("datareporting.policy.dataSubmissionEnabled", false)',
        'lockPref("app.normandy.enabled", false)',
        'lockPref("browser.vpn_promo.enabled", false)',
        'lockPref("browser.shopping.experience2023.enabled", false)',
        'defaultPref("privacy.fingerprintingProtection", true)',
        'defaultPref("lyra.fingerprint.mode", "firefox")',
        'defaultPref("network.trr.mode", 2)',
        'defaultPref("network.trr.uri", "https://doh.dns.sb/dns-query")',
        'defaultPref("gfx.bundled-fonts.activate", 1)',
        'defaultPref("privacy.resistFingerprinting.letterboxing", false)',
        'defaultPref("lyra.typing.protection", true)',
        'defaultPref("lyra.timezone.spoof", true)',
        'defaultPref("lyra.audio.protection", true)',
        'defaultPref("lyra.webrtc.protect", true)',
        'defaultPref("lyra.sensors.block", true)',
        'defaultPref("lyra.geo.block", true)',
        'defaultPref("lyra.geo.mode", "block")',
        'defaultPref("lyra.update.check", false)',
        'defaultPref("lyra.webgl.allowlist", "")',
        'defaultPref("webgl.disabled", false)',
        'defaultPref("browser.translations.enable", true)',
        'defaultPref("privacy.fingerprintingProtection.remoteOverrides.enabled", true)',
        'defaultPref("browser.sessionhistory.max_total_viewers", -1)',
        'pref("browser.safebrowsing.provider.google5.enabled", false)',
        'pref("browser.urlbar.merino.endpointURL", "")',
        'pref("messaging-system.rsexperimentloader.enabled", false)',
        'pref("identity.fxaccounts.remote.root", "")',
        'defaultPref("javascript.options.ion", !safest)',
        'defaultPref("lyra.sync.enabled", false)',
        'defaultPref("lyra.sync.server", "wss://sync.lyrabrowser.com/ws")',
        'defaultPref("geo.enabled", false)',
        'defaultPref("media.peerconnection.ice.no_host", true)',
        'defaultPref("network.http.referer.XOriginPolicy", 2)',
        'defaultPref("identity.fxaccounts.enabled", false)',
        'defaultPref("extensions.activeThemeID", "lyra-dark@lyrabrowser.com")',
        'defaultPref("ui.systemUsesDarkTheme", 1)',
    ):
        if needle not in raw:
            error(f"prefs/lyra.cfg missing {needle}")
    if "telemetry.mozilla.org" in raw:
        error("lyra.cfg must not set a Mozilla telemetry server URL")
    if "landlock" in raw.lower():
        error("lyra.cfg must not wrap the browser with Landlock")
    if "+JSDateTimeUTC" not in raw:
        error("lyra.cfg FPP overrides must include JSDateTimeUTC timezone spoof")
    if "-WebGLRandomization" not in raw:
        error("lyra.cfg FPP overrides must disable WebGLRandomization")
    if 'lockPref("lyra.cfg.version"' not in raw:
        error("lyra.cfg missing version lockPref")
    if 'defaultPref("lyra.version"' not in raw:
        error("lyra.cfg must set lyra.version")


def check_branding() -> None:
    brand = ROOT / "branding" / "lyra" / "firefox"
    require(brand / "configure.sh")
    require(brand / "locales" / "en-US" / "brand.ftl")
    require(brand / "locales" / "en-US" / "brand.properties")
    require(brand / "pref" / "firefox-branding.js")
    require(brand / "content" / "about-logo.svg")
    require(brand / "content" / "about-wordmark.svg")
    logo = (brand / "content" / "about-logo.svg").read_text() if (brand / "content" / "about-logo.svg").exists() else ""
    if '<rect' in logo and 'fill="#0A0A0B"' in logo:
        error("about-logo.svg must be a transparent mark, not a canvas square")
    if "context-fill" not in logo:
        error("about-logo.svg must use context-fill so policies/settings follow page color")
    for theme in ("lyra-dark", "lyra-light"):
        tdir = ROOT / "overlay" / "browser" / "themes" / "addons" / theme
        require(tdir / "manifest.json")
        require(tdir / "icon.svg")
        require(tdir / "preview.svg")
        data = json.loads((tdir / "manifest.json").read_text()) if (tdir / "manifest.json").exists() else {}
        gecko_id = ((data.get("browser_specific_settings") or {}).get("gecko") or {}).get("id")
        if gecko_id != f"{theme}@lyrabrowser.com":
            error(f"{theme} manifest id must be {theme}@lyrabrowser.com")
    ftl_overlay = ROOT / "overlay" / "browser" / "locales" / "en-US" / "browser"
    require(ftl_overlay / "aboutDialog.ftl")
    require(ftl_overlay / "aboutPolicies.ftl")
    for ftl in (ftl_overlay / "aboutDialog.ftl", ftl_overlay / "aboutPolicies.ftl"):
        raw = ftl.read_text() if ftl.exists() else ""
        if "\u2014" in raw or "\u2013" in raw:
            error(f"{ftl.relative_to(ROOT)} contains an em dash or en dash")
        if "global community" in raw.lower() or "want to help" in raw.lower():
            error(f"{ftl.relative_to(ROOT)} still has Mozilla marketing copy")
    lyra_ftl = ROOT / "overlay" / "browser" / "locales" / "en-US" / "browser" / "preferences" / "lyra.ftl"
    require(lyra_ftl)
    if lyra_ftl.exists():
        raw = lyra_ftl.read_text()
        if "\u2014" in raw or "\u2013" in raw:
            error("lyra.ftl contains an em dash or en dash")
        if "lyra-fingerprint-mode-firefox" not in raw:
            error("lyra.ftl missing Firefox crowd mode strings")
        if "lyra-timezone-spoof" not in raw:
            error("lyra.ftl missing timezone spoof strings")
        if "lyra-sync-enabled" not in raw:
            error("lyra.ftl missing P2P sync strings")
        if "Void Browser" in raw:
            error("lyra.ftl must not use the taken product name Void Browser")
    require(ROOT / "overlay" / "browser" / "components" / "preferences" / "config" / "lyra.mjs")
    ftl = (brand / "locales" / "en-US" / "brand.ftl").read_text() if (brand / "locales" / "en-US" / "brand.ftl").exists() else ""
    for line in ftl.splitlines():
        if line.startswith("-brand-") and "Firefox" in line.split("=", 1)[-1]:
            error("brand.ftl must not use Firefox as the product name")
    if "-brand-full-name = Lyra Browser" not in ftl:
        error("brand.ftl must name the product Lyra Browser")
    if "-brand-short-name = Lyra Browser" not in ftl:
        error("brand.ftl must name the short product Lyra Browser")
    if "-vendor-short-name = Lyra" not in ftl:
        error("brand.ftl must name the vendor Lyra")
    if "Void Browser" in ftl:
        error("brand.ftl must not use the taken product name Void Browser")
    cfg = (brand / "configure.sh").read_text() if (brand / "configure.sh").exists() else ""
    if "MOZ_APP_DISPLAYNAME=Lyra" not in cfg:
        error("configure.sh MOZ_APP_DISPLAYNAME must be Lyra")
    if "MOZ_MACBUNDLE_ID=com.lyrabrowser.lyra" not in cfg:
        error("configure.sh MOZ_MACBUNDLE_ID must be com.lyrabrowser.lyra")
    mozconfig = (ROOT / "mozconfig").read_text()
    if "--with-app-name=lyra" not in mozconfig:
        error("mozconfig must set --with-app-name=lyra")
    if "MOZ_APP_REMOTINGNAME=lyra" not in mozconfig:
        error("mozconfig must set MOZ_APP_REMOTINGNAME=lyra")
    if "--with-app-basename=Lyra" not in mozconfig:
        error("mozconfig must set --with-app-basename=Lyra")
    if "--enable-bundled-fonts" not in mozconfig:
        error("mozconfig must enable bundled fonts")
    win_moz = (ROOT / "mozconfig.windows").read_text() if (ROOT / "mozconfig.windows").exists() else ""
    if "--enable-bundled-fonts" not in win_moz:
        error("mozconfig.windows must enable bundled fonts")
    if "cairo-windows" not in win_moz:
        error("mozconfig.windows must set cairo-windows")
    for size in (16, 22, 24, 32, 48, 64, 128, 256):
        require(brand / f"default{size}.png")
    require(brand / "firefox.ico")
    require(brand / "content" / "about-logo.png")
    assets = ROOT / "branding" / "lyra" / "assets"
    require(assets / "favicon.svg")
    require(assets / "lyra-mark.png")
    require(assets / "lyra-mark.svg")
    require(assets / "lyra-lockup-on-dark.png")
    require(brand / "content" / "lyra-mark.png")
    wordmark = (brand / "content" / "about-wordmark.svg").read_text() if (brand / "content" / "about-wordmark.svg").exists() else ""
    if "LYRA BROWSER" not in wordmark:
        error("about-wordmark.svg must say LYRA BROWSER")
    if "VOID" in wordmark:
        error("about-wordmark.svg must not say VOID")


def check_layout() -> None:
    for rel in (
        "README.md",
        "LICENSE",
        "NOTICE",
        "mozconfig",
        "mozconfig.linux",
        "mozconfig.windows",
        "policies/policies.json",
        "prefs/autoconfig.js",
        "prefs/lyra-overrides.cfg.example",
        "overlay/browser/components/preferences/config/lyra.mjs",
        "overlay/browser/locales/en-US/browser/preferences/lyra.ftl",
        "overlay/browser/modules/LyraSync.sys.mjs",
        "overlay/browser/modules/LyraUpdateCheck.sys.mjs",
        "overlay/browser/modules/LyraSitePolicy.sys.mjs",
        "overlay/browser/components/lyra/LyraSitePolicyChild.sys.mjs",
        "scripts/sign-release.py",
        "scripts/test_release_sign.py",
        "scripts/release-pubkey.hex",
        "overlay/linux/com.lyrabrowser.lyra.desktop",
        "patches/series",
        "patches/0001-set-lyra-branding-directory.patch",
        "scripts/fetch-firefox.sh",
        "scripts/apply-overlay.sh",
        "scripts/package-extras.sh",
        "scripts/bootstrap-linux.sh",
        "extensions/ublock/pin.json",
        "extensions/ublock/fetch.sh",
        ".github/workflows/validate.yml",
        ".github/workflows/build.yml",
        ".github/dependabot.yml",
        "website/package.json",
        "website/src/config.yaml",
        "website/src/pages/sync.astro",
        "website/src/pages/contact.astro",
        "website/src/pages/branding.astro",
        "website/src/pages/404.astro",
        "website/src/pages/500.astro",
        "package.json",
        "commitlint.config.cjs",
        ".husky/commit-msg",
    ):
        require(ROOT / rel)
    autoconfig = (ROOT / "prefs" / "autoconfig.js").read_text()
    if 'pref("general.config.filename", "lyra.cfg")' not in autoconfig:
        error("autoconfig.js must point at lyra.cfg")
    if 'pref("general.config.sandbox_enabled", false)' not in autoconfig:
        error("autoconfig.js must disable the autoconfig sandbox so overrides can load")
    overlay = (ROOT / "scripts" / "apply-overlay.sh").read_text()
    if "searx.be" in overlay or "priv.au/search" in overlay:
        error("apply-overlay.sh must not ship public SearXNG instances")
    if "https://seek.lyrabrowser.com/search" not in overlay:
        error("apply-overlay.sh must add Seek at seek.lyrabrowser.com")
    if 'r["globalDefault"] = "seek"' not in overlay:
        error("apply-overlay.sh default search must be Seek")
    if "paneVoidPrivacy" in overlay:
        error("apply-overlay.sh must not keep paneVoidPrivacy")
    if "paneLyraPrivacy" not in overlay:
        error("apply-overlay.sh must register paneLyraPrivacy")
    if 'makeConstant("DEFAULT_THEME_ID", "lyra-dark@lyrabrowser.com")' not in overlay:
        error("apply-overlay.sh must set DEFAULT_THEME_ID to lyra-dark")
    if "resource://builtin-themes/lyra-dark/" not in overlay:
        error("apply-overlay.sh must install lyra-dark as a builtin theme at startup")
    if "application={3a3a4f99-f5ed-5ace-b1c2-6ca778f01a59}" not in overlay:
        error("apply-overlay.sh must register the Lyra app id with nsBrowserGlue")
    if 'imply_option("MOZ_APP_PROFILE", "lyra")' not in overlay:
        error("apply-overlay.sh must set MOZ_APP_PROFILE to lyra")
    if "about-logo.svg" not in overlay:
        error("apply-overlay.sh must point moz-page-nav at about-logo.svg")
    if 'lastSelectedTheme.includes("@")' not in overlay:
        error("apply-overlay.sh must keep @lyrabrowser.com themes from resetting to the default theme")
    if "lyraSpoof" not in overlay:
        error("apply-overlay.sh must register the timezone and leak settings group")
    if "LyraSync.init" not in overlay:
        error("apply-overlay.sh must start LyraSync on first window")
    if "LyraSitePolicy.init" not in overlay:
        error("apply-overlay.sh must start LyraSitePolicy before UI")
    if "LyraUpdateCheck.init" not in overlay:
        error("apply-overlay.sh must start LyraUpdateCheck on first window")
    if 'module: "chrome://browser/content/preferences/config/lyra.mjs"' not in overlay:
        error("apply-overlay.sh must load Lyra settings from lyra.mjs")
    if "Void settings failed to register" in overlay:
        error("apply-overlay.sh must not concatenate Lyra settings into SettingGroupManager.mjs")
    extras = (ROOT / "scripts" / "package-extras.sh").read_text()
    if "aboutDialog.xhtml preprocessed for dist" not in extras:
        error("package-extras.sh must preprocess aboutDialog.xhtml for unpacked dist chrome")
    if "preferences/config/lyra.mjs" not in extras:
        error("package-extras.sh must install the Lyra settings pane into dist")
    if "LyraSync.sys.mjs" not in extras:
        error("package-extras.sh must install LyraSync into dist")
    if "LyraSitePolicy.sys.mjs" not in extras:
        error("package-extras.sh must install LyraSitePolicy into dist")
    if "LyraSitePolicyChild.sys.mjs" not in extras:
        error("package-extras.sh must install LyraSitePolicyChild into dist")
    if "LyraUpdateCheck.sys.mjs" not in extras:
        error("package-extras.sh must install LyraUpdateCheck into dist")
    if "resource://builtin-themes/lyra-dark/" not in extras:
        error("package-extras.sh must install lyra-dark as a builtin theme at startup")
    if "ln -sfn lyra" in extras and "quad4" in extras:
        error("package-extras.sh must not keep void or quad4 binary aliases")
    if "brand.ftl" not in extras:
        error("package-extras.sh must stamp Lyra brand.ftl into dist")
    if "Void settings failed to register" in extras:
        error("package-extras.sh must not concatenate Lyra settings into SettingGroupManager.mjs")
    desktop = (ROOT / "overlay" / "linux" / "com.lyrabrowser.lyra.desktop").read_text()
    if "Exec=lyra" not in desktop:
        error("desktop file must launch the lyra binary")
    if "StartupWMClass=lyra" not in desktop:
        error("desktop file must use WM class lyra")
    workflow = (ROOT / ".github" / "workflows" / "validate.yml").read_text()
    if "windows-latest" not in workflow:
        error("validate.yml must run on windows-latest")
    if "persist-credentials: false" not in workflow:
        error("validate.yml checkout must set persist-credentials false")
    build_wf = (ROOT / ".github" / "workflows" / "build.yml").read_text()
    if "pull_request_target" in build_wf or "pull_request_target" in workflow:
        error("workflows must not use pull_request_target")
    if "persist-credentials: false" not in build_wf:
        error("build.yml checkout must set persist-credentials false")
    if "actions/checkout@" not in build_wf or "actions/upload-artifact@" not in build_wf:
        error("build.yml must pin checkout and upload-artifact")
    if "scripts/ci-linux-build.sh" not in build_wf:
        error("build.yml must run scripts/ci-linux-build.sh")
    if "scripts/ci-windows-build.sh" not in build_wf:
        error("build.yml must run scripts/ci-windows-build.sh")
    if "windows-latest" not in build_wf:
        error("build.yml must include a windows-latest job")
    if "scripts/sign-release.py" not in build_wf or "--require-key" not in build_wf:
        error("build.yml release job must sign with scripts/sign-release.py --require-key")
    if "actions/attest-build-provenance@" not in build_wf:
        error("build.yml release job must attest artifacts")
    if "LYRA_RELEASE_KEY" not in build_wf:
        error("build.yml must pass LYRA_RELEASE_KEY into sign-release")
    if "test_release_sign.py" not in workflow:
        error("validate.yml must run scripts/test_release_sign.py")
    if "commitlint" not in workflow:
        error("validate.yml must run commitlint")
    if (ROOT / ".github" / "workflows" / "pages.yml").exists():
        error("GitHub Pages workflow must be removed")
    if (ROOT / "website" / "public" / "CNAME").exists():
        error("website/public/CNAME is GitHub Pages and must be removed")
    pub = (ROOT / "scripts" / "release-pubkey.hex").read_text().strip()
    if len(pub) != 64:
        error("scripts/release-pubkey.hex must be 32-byte hex")
    update = (ROOT / "overlay" / "browser" / "modules" / "LyraUpdateCheck.sys.mjs").read_text()
    if pub not in update:
        error("LyraUpdateCheck.sys.mjs must ship scripts/release-pubkey.hex")
    if "lyra.update.check" not in update or "Ed25519" not in update:
        error("LyraUpdateCheck.sys.mjs must verify Ed25519 and honor lyra.update.check")
    if "landlock-lyra" in extras or "landlock-lyra" in overlay:
        error("overlay scripts must not wrap Lyra with Landlock")
    lyra_mjs = (ROOT / "overlay" / "browser" / "components" / "preferences" / "config" / "lyra.mjs").read_text()
    if "applyVoidMode" in lyra_mjs or "Void" in lyra_mjs:
        error("lyra.mjs must not keep Void identifiers")
    if "applyLyraMode" not in lyra_mjs:
        error("lyra.mjs must apply fingerprint mode via applyLyraMode")
    extras_text = extras
    if "paneVoidPrivacy" in extras_text:
        error("package-extras.sh must not keep paneVoidPrivacy")


def check_pin(version: dict[str, str]) -> None:
    pin = check_json(ROOT / "extensions" / "ublock" / "pin.json")
    if not isinstance(pin, dict):
        return
    if pin.get("version") != version.get("UBLOCK_VERSION"):
        error("ublock pin.json version does not match VERSION")
    sha = (pin.get("xpi") or {}).get("sha256") if isinstance(pin.get("xpi"), dict) else None
    if sha != version.get("UBLOCK_XPI_SHA256"):
        error("ublock pin.json sha256 does not match VERSION")
    if pin.get("addon_id") != version.get("UBLOCK_ID"):
        error("ublock pin.json addon_id does not match VERSION")


def main() -> int:
    version = load_version()
    check_layout()
    check_policies(check_json(ROOT / "policies" / "policies.json"))
    check_lyra_cfg()
    check_branding()
    check_pin(version)
    for msg in WARNS:
        print(f"warn: {msg}")
    if ERRORS:
        for msg in ERRORS:
            print(f"error: {msg}", file=sys.stderr)
        print(f"FAIL {len(ERRORS)} error(s)", file=sys.stderr)
        return 1
    print("OK Lyra validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
