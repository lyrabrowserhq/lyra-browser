/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

const DNS_SB_URI = "https://doh.dns.sb/dns-query";
const DNS_SB_BOOTSTRAP = "185.222.222.222";

const GSB_GOOGLE4_HASH =
  "https://safebrowsing.googleapis.com/v4/fullHashes:find?$ct=application/x-protobuf&key=%GOOGLE_SAFEBROWSING_API_KEY%&$httpMethod=POST";
const GSB_GOOGLE4_UPDATE =
  "https://safebrowsing.googleapis.com/v4/threatListUpdates:fetch?$ct=application/x-protobuf&key=%GOOGLE_SAFEBROWSING_API_KEY%&$httpMethod=POST";
const GSB_GOOGLE_HASH =
  "https://safebrowsing.google.com/safebrowsing/gethash?client=SAFEBROWSING_ID&appver=%MAJOR_VERSION%&pver=2.2";
const GSB_GOOGLE_UPDATE =
  "https://safebrowsing.google.com/safebrowsing/downloads?client=SAFEBROWSING_ID&appver=%MAJOR_VERSION%&pver=2.2&key=%GOOGLE_SAFEBROWSING_API_KEY%";

const FPP_BASE = [
  "-WebGLRandomization",
  "+CanvasRandomization",
  "+EfficientCanvasRandomization",
  "+FontVisibilityLangPack",
  "+FontVisibilityBaseSystem",
  "+JSMathFdlibm",
  "+ScreenAvailToResolution",
  "+NavigatorHWConcurrencyTiered",
  "+MaxTouchPointsCollapse",
  "+SpeechSynthesis",
  "+UseHardcodedFontSubstitutes",
  "+WebGLVendorSanitize",
  "+PdfjsSpoof",
  "+MediaCapabilities",
  "+ScreenPixelDepth",
  "+CanvasExtractionFromThirdPartiesIsBlocked",
  "+WebGPULimits",
  "+WebGPUIsFallbackAdapter",
  "+WebGPUSubgroupSizes",
  "+WebCodecs",
  "+MediaError",
  "+VideoElementMozFrames",
  "+VideoElementMozFrameDelay",
  "+VideoElementPlaybackQuality",
  "+MouseEventScreenPoint",
  "+FrameRate",
  "+UseStandinsForNativeColors",
  "+WebVTT",
  "+DiskStorageLimit",
  "+CSSColorInfo",
  "+WindowOuterSize",
];

function lyraAddPref(info) {
  if (!Preferences.get(info.id)) {
    Preferences.add(info);
  }
}

function observePref(name, emitChange) {
  Services.prefs.addObserver(name, emitChange);
  return () => Services.prefs.removeObserver(name, emitChange);
}

function currentMode() {
  return Services.prefs.getStringPref("lyra.fingerprint.mode", "firefox");
}

function currentUaMode() {
  return Services.prefs.getStringPref("lyra.ua.mode", "firefox");
}

function buildFppOverrides() {
  if (currentMode() === "crowd") {
    const skip = ["-CSSPrefersColorScheme"];
    // crowd uses RFP. FPP overrides here only turn extras off.
    if (!Services.prefs.getBoolPref("lyra.timezone.spoof", true)) {
      skip.push("-JSDateTimeUTC");
    }
    return skip.join(",");
  }
  const parts = FPP_BASE.slice();
  if (Services.prefs.getBoolPref("lyra.typing.protection", true)) {
    parts.push("+KeyboardEvents", "+ReduceTimerPrecision", "+WidgetEvents");
  }
  if (Services.prefs.getBoolPref("lyra.window.buckets", true)) {
    parts.push("+RoundWindowSize");
  }
  if (Services.prefs.getBoolPref("lyra.timezone.spoof", true)) {
    parts.push("+JSDateTimeUTC");
  }
  if (Services.prefs.getBoolPref("lyra.audio.protection", true)) {
    parts.push("+AudioSampleRate", "+AudioContext");
  }
  if (Services.prefs.getBoolPref("lyra.sensors.block", true)) {
    parts.push(
      "+Gamepad",
      "+MediaDevices",
      "+NetworkConnection",
      "+DeviceSensors",
      "+StreamVideoFacingMode"
    );
  }
  if (Services.prefs.getIntPref("privacy.spoof_english", 0) === 2) {
    parts.push("+JSLocale");
  }
  if (currentUaMode() === "crowd") {
    parts.push(
      "+NavigatorUserAgent",
      "+HttpUserAgent",
      "+NavigatorAppVersion",
      "+NavigatorPlatform",
      "+NavigatorOscpu",
      "+NavigatorBuildID"
    );
  }
  return parts.join(",");
}

function applyWebrtc(protect) {
  Services.prefs.setBoolPref("media.peerconnection.ice.default_address_only", true);
  Services.prefs.setBoolPref("media.peerconnection.ice.obfuscate_host_addresses", true);
  Services.prefs.setBoolPref("media.peerconnection.ice.no_host", protect);
}

function applySensors(block) {
  Services.prefs.setBoolPref("device.sensors.enabled", !block);
  Services.prefs.setBoolPref("device.sensors.motion.enabled", !block);
  Services.prefs.setBoolPref("device.sensors.orientation.enabled", !block);
  Services.prefs.setBoolPref("dom.gamepad.enabled", !block);
  Services.prefs.setBoolPref("dom.vr.enabled", !block);
  Services.prefs.setBoolPref("dom.vibrator.enabled", !block);
}

function applyGeo() {
  let mode = Services.prefs.getStringPref("lyra.geo.mode", "");
  if (mode !== "block" && mode !== "spoof" && mode !== "ask") {
    mode = Services.prefs.getBoolPref("lyra.geo.block", true) ? "block" : "ask";
  }
  Services.prefs.setBoolPref("lyra.geo.block", mode === "block");
  if (mode === "block") {
    Services.prefs.setBoolPref("geo.enabled", false);
    Services.prefs.setIntPref("permissions.default.geo", 2);
    return;
  }
  Services.prefs.setBoolPref("geo.enabled", true);
  if (mode === "spoof") {
    Services.prefs.setIntPref("permissions.default.geo", 1);
    Services.prefs.setStringPref("geo.provider.network.url", "");
    Services.prefs.setBoolPref("geo.provider.use_geoclue", false);
    Services.prefs.setBoolPref("geo.provider.ms-windows-location", false);
    Services.prefs.setBoolPref("geo.provider.use_corelocation", false);
    return;
  }
  Services.prefs.setIntPref("permissions.default.geo", 0);
  Services.prefs.setStringPref(
    "geo.provider.network.url",
    "https://api.beacondb.net/v1/geolocate"
  );
}

function applyLan(block) {
  Services.prefs.setBoolPref("network.lna.block_trackers", block);
  Services.prefs.setBoolPref("network.lna.block_insecure_contexts", block);
}

function applySafest(on) {
  for (const p of [
    "javascript.options.ion",
    "javascript.options.baselinejit",
    "javascript.options.wasm",
    "javascript.options.wasm_optimizingjit",
    "javascript.options.wasm_baselinejit",
  ]) {
    Services.prefs.setBoolPref(p, !on);
  }
}

function applyPermBlock(on) {
  for (const p of ["camera", "microphone", "desktop-notification"]) {
    Services.prefs.setIntPref(`permissions.default.${p}`, on ? 2 : 0);
  }
}

function applyClearOnExit() {
  const any =
    Services.prefs.getBoolPref("privacy.clearOnShutdown.cookies", false) ||
    Services.prefs.getBoolPref("privacy.clearOnShutdown.cache", false) ||
    Services.prefs.getBoolPref("privacy.clearOnShutdown.history", false) ||
    Services.prefs.getBoolPref("privacy.clearOnShutdown.formdata", false) ||
    Services.prefs.getBoolPref("privacy.clearOnShutdown.sessions", false);
  Services.prefs.setBoolPref(
    "privacy.sanitize.sanitizeOnShutdown",
    any
  );
}

const UA_STRINGS = {
  "firefox-win":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
  "firefox-mac":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:153.0) Gecko/20100101 Firefox/153.0",
  "chrome-win":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  "chrome-mac":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  "edge-win":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0",
  "safari-mac":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
};

function applyUa() {
  const mode = currentUaMode();
  if (mode === "firefox" || mode === "crowd") {
    if (Services.prefs.prefHasUserValue("general.useragent.override")) {
      Services.prefs.clearUserPref("general.useragent.override");
    }
    return;
  }
  const ua =
    mode === "custom"
      ? Services.prefs.getStringPref("lyra.ua.custom", "")
      : UA_STRINGS[mode];
  if (ua) {
    Services.prefs.setStringPref("general.useragent.override", ua);
  }
}

function applyLyraMode() {
  const mode = currentMode();
  const buckets = Services.prefs.getBoolPref("lyra.window.buckets", true);
  const restrictFonts = Services.prefs.getBoolPref("lyra.fonts.restrict", true);
  const typing = Services.prefs.getBoolPref("lyra.typing.protection", true);
  if (mode === "crowd") {
    Services.prefs.setBoolPref("privacy.resistFingerprinting", true);
    Services.prefs.setBoolPref("privacy.resistFingerprinting.pbmode", true);
    Services.prefs.setBoolPref("privacy.fingerprintingProtection", true);
    Services.prefs.setBoolPref("privacy.fingerprintingProtection.pbmode", true);
    Services.prefs.setStringPref(
      "privacy.fingerprintingProtection.overrides",
      buildFppOverrides()
    );
    Services.prefs.setBoolPref("privacy.resistFingerprinting.letterboxing", true);
    Services.prefs.setStringPref("lyra.ua.mode", "crowd");
    Services.prefs.setIntPref("layout.css.font-visibility", restrictFonts ? 1 : 3);
  } else {
    Services.prefs.setBoolPref("privacy.resistFingerprinting", false);
    Services.prefs.setBoolPref("privacy.resistFingerprinting.pbmode", false);
    Services.prefs.setBoolPref("privacy.fingerprintingProtection", true);
    Services.prefs.setBoolPref("privacy.fingerprintingProtection.pbmode", true);
    Services.prefs.setStringPref(
      "privacy.fingerprintingProtection.overrides",
      buildFppOverrides()
    );
    Services.prefs.setBoolPref(
      "privacy.resistFingerprinting.letterboxing",
      false
    );
    Services.prefs.setIntPref("layout.css.font-visibility", restrictFonts ? 2 : 3);
  }
  if (typing) {
    Services.prefs.setBoolPref("privacy.reduceTimerPrecision", true);
    Services.prefs.setBoolPref(
      "privacy.resistFingerprinting.reduceTimerPrecision.jitter",
      true
    );
  }
  applyWebrtc(Services.prefs.getBoolPref("lyra.webrtc.protect", true));
  applySensors(Services.prefs.getBoolPref("lyra.sensors.block", true));
  applyGeo();
  applyLan(Services.prefs.getBoolPref("lyra.lan.block", true));
  applySafest(Services.prefs.getBoolPref("lyra.safest", false));
  applyPermBlock(Services.prefs.getBoolPref("lyra.permissions.block", false));
  Services.prefs.setBoolPref(
    "privacy.firstparty.isolate",
    Services.prefs.getBoolPref("lyra.fpi", false)
  );
  applyUa();
}

function applyDohMode(mode) {
  Services.prefs.setIntPref("network.trr.mode", mode);
  if (mode === 2 || mode === 3) {
    Services.prefs.setStringPref("network.trr.uri", DNS_SB_URI);
    Services.prefs.setStringPref("network.trr.custom_uri", DNS_SB_URI);
    Services.prefs.setStringPref("network.trr.bootstrapAddr", DNS_SB_BOOTSTRAP);
    Services.prefs.setStringPref("lyra.doh.provider", "dns.sb");
    Services.prefs.setBoolPref("doh-rollout.enabled", false);
  }
}

for (const info of [
  { id: "lyra.fingerprint.mode", type: "string" },
  { id: "lyra.ua.mode", type: "string" },
  { id: "lyra.window.buckets", type: "bool" },
  { id: "lyra.fonts.restrict", type: "bool" },
  { id: "lyra.typing.protection", type: "bool" },
  { id: "lyra.timezone.spoof", type: "bool" },
  { id: "lyra.audio.protection", type: "bool" },
  { id: "lyra.webrtc.protect", type: "bool" },
  { id: "lyra.sensors.block", type: "bool" },
  { id: "lyra.geo.block", type: "bool" },
  { id: "lyra.geo.mode", type: "string" },
  { id: "lyra.geo.latitude", type: "string" },
  { id: "lyra.geo.longitude", type: "string" },
  { id: "lyra.webgpu.enabled", type: "bool" },
  { id: "lyra.webgpu.allowlist", type: "string" },
  { id: "lyra.webgl.blocklist", type: "string" },
  { id: "lyra.webgl.allowlist", type: "string" },
  { id: "lyra.compat.sites", type: "string" },
  { id: "lyra.sync.enabled", type: "bool" },
  { id: "lyra.sync.tabs", type: "bool" },
  { id: "lyra.sync.bookmarks", type: "bool" },
  { id: "lyra.sync.applyTabs", type: "bool" },
  { id: "lyra.sync.secret", type: "string" },
  { id: "lyra.ua.custom", type: "string" },
  { id: "lyra.lan.block", type: "bool" },
  { id: "lyra.js.mode", type: "string" },
  { id: "lyra.js.blocklist", type: "string" },
  { id: "lyra.js.allowlist", type: "string" },
  { id: "lyra.storage.encrypt", type: "bool" },
  { id: "lyra.history.index.enabled", type: "bool" },
  { id: "lyra.history.index.maxEntries", type: "int" },
  { id: "lyra.sync.server", type: "string" },
  { id: "browser.privatebrowsing.autostart", type: "bool" },
  { id: "lyra.safest", type: "bool" },
  { id: "lyra.permissions.block", type: "bool" },
  { id: "lyra.fpi", type: "bool" },
  { id: "lyra.update.check", type: "bool" },
  { id: "lyra.gsb.enabled", type: "bool" },
  { id: "privacy.userContext.newTabContainerOnLeftClick.enabled", type: "bool" },
  { id: "privacy.clearOnShutdown.cookies", type: "bool" },
  { id: "privacy.clearOnShutdown.cache", type: "bool" },
  { id: "privacy.clearOnShutdown.history", type: "bool" },
  { id: "privacy.clearOnShutdown.formdata", type: "bool" },
  { id: "privacy.clearOnShutdown.sessions", type: "bool" },
  { id: "privacy.resistFingerprinting.letterboxing", type: "bool" },
  { id: "gfx.bundled-fonts.activate", type: "int" },
  { id: "layout.css.font-visibility", type: "int" },
  {
    id: "privacy.resistFingerprinting.reduceTimerPrecision.microseconds",
    type: "int",
  },
  { id: "privacy.query_stripping.enabled", type: "bool" },
  { id: "network.http.referer.XOriginPolicy", type: "int" },
  { id: "webgl.disabled", type: "bool" },
  { id: "security.OCSP.enabled", type: "int" },
]) {
  lyraAddPref(info);
}

Preferences.addSetting({
  id: "lyraFingerprintMode",
  pref: "lyra.fingerprint.mode",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraUaMode",
  pref: "lyra.ua.mode",
  deps: ["lyraFingerprintMode"],
  disabled: () => currentMode() === "crowd",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraUaCustom",
  pref: "lyra.ua.custom",
  deps: ["lyraUaMode"],
  disabled: () => currentUaMode() !== "custom",
  onUserChange() {
    applyUa();
  },
});

Preferences.addSetting({
  id: "lyraLanBlock",
  pref: "lyra.lan.block",
  onUserChange(checked) {
    applyLan(checked);
  },
});

Preferences.addSetting({
  id: "lyraJsMode",
  pref: "lyra.js.mode",
});

Preferences.addSetting({
  id: "lyraJsBlocklist",
  pref: "lyra.js.blocklist",
  deps: ["lyraJsMode"],
  disabled: () =>
    Services.prefs.getStringPref("lyra.js.mode", "off") !== "denylist",
});

Preferences.addSetting({
  id: "lyraJsAllowlist",
  pref: "lyra.js.allowlist",
  deps: ["lyraJsMode"],
  disabled: () =>
    Services.prefs.getStringPref("lyra.js.mode", "off") !== "allowlist",
});

Preferences.addSetting({
  id: "lyraStorageEncrypt",
  get() {
    return Services.prefs.getBoolPref(
      "security.storage.encryption.sqlite.enabled",
      false
    );
  },
  set(checked) {
    Services.prefs.setBoolPref(
      "security.storage.encryption.sqlite.enabled",
      checked
    );
    Services.prefs.setBoolPref("lyra.storage.encrypt", checked);
  },
  setup(emitChange) {
    return observePref(
      "security.storage.encryption.sqlite.enabled",
      emitChange
    );
  },
});

Preferences.addSetting({
  id: "lyraWindowBuckets",
  pref: "lyra.window.buckets",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraLetterboxing",
  pref: "privacy.resistFingerprinting.letterboxing",
  onUserChange(checked) {
    Services.prefs.setBoolPref("lyra.window.buckets", checked);
    if (checked) {
      applyLyraMode();
    }
  },
});

Preferences.addSetting({
  id: "lyraBundledFonts",
  pref: "gfx.bundled-fonts.activate",
  get(val) {
    return val !== 0;
  },
  set(checked) {
    return checked ? 1 : 0;
  },
});

Preferences.addSetting({
  id: "lyraFontsRestrict",
  pref: "lyra.fonts.restrict",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraFontVisibility",
  pref: "layout.css.font-visibility",
  get(val) {
    return String(val);
  },
  set(val) {
    return Number(val);
  },
});

Preferences.addSetting({
  id: "lyraTypingProtection",
  pref: "lyra.typing.protection",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraTypingDelay",
  pref: "privacy.resistFingerprinting.reduceTimerPrecision.microseconds",
  get(val) {
    if (val >= 100000) {
      return "100000";
    }
    if (val >= 20000) {
      return "20000";
    }
    return "1000";
  },
  set(val) {
    return Number(val);
  },
});

Preferences.addSetting({
  id: "lyraDohMode",
  get() {
    const val = Services.prefs.getIntPref("network.trr.mode", 5);
    if (val === 2 || val === 3) {
      return String(val);
    }
    return "5";
  },
  set(val) {
    applyDohMode(Number(val));
  },
  setup(emitChange) {
    return observePref("network.trr.mode", emitChange);
  },
});

Preferences.addSetting({
  id: "lyraDohAdvanced",
  onUserClick(e) {
    e.preventDefault();
    window.gotoPref("paneDnsOverHttps");
  },
});

Preferences.addSetting({
  id: "lyraHttpsOnly",
  get() {
    return Services.prefs.getBoolPref("dom.security.https_only_mode", true);
  },
  set(checked) {
    Services.prefs.setBoolPref("dom.security.https_only_mode", checked);
  },
  setup(emitChange) {
    return observePref("dom.security.https_only_mode", emitChange);
  },
});

Preferences.addSetting({
  id: "lyraQueryStripping",
  pref: "privacy.query_stripping.enabled",
  onUserChange(checked) {
    Services.prefs.setBoolPref(
      "privacy.query_stripping.enabled.pbmode",
      checked
    );
  },
});

Preferences.addSetting({
  id: "lyraReferrer",
  pref: "network.http.referer.XOriginPolicy",
  get(val) {
    return val === 2;
  },
  set(checked) {
    return checked ? 2 : 0;
  },
});

Preferences.addSetting({
  id: "lyraWebgl",
  pref: "webgl.disabled",
  get(val) {
    return !val;
  },
  set(checked) {
    return !checked;
  },
});

Preferences.addSetting({
  id: "lyraEme",
  get() {
    return Services.prefs.getBoolPref("media.eme.enabled", false);
  },
  set(checked) {
    Services.prefs.setBoolPref("media.eme.enabled", checked);
  },
  setup(emitChange) {
    return observePref("media.eme.enabled", emitChange);
  },
});

Preferences.addSetting({
  id: "lyraOcsp",
  pref: "security.OCSP.enabled",
  get(val) {
    return val !== 0;
  },
  set(checked) {
    return checked ? 1 : 0;
  },
});

Preferences.addSetting({
  id: "lyraSpoofEnglish",
  get() {
    return Services.prefs.getIntPref("privacy.spoof_english", 0) === 2;
  },
  set(checked) {
    Services.prefs.setIntPref("privacy.spoof_english", checked ? 2 : 0);
    applyLyraMode();
  },
  setup(emitChange) {
    return observePref("privacy.spoof_english", emitChange);
  },
});

Preferences.addSetting({
  id: "lyraTimezone",
  pref: "lyra.timezone.spoof",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraAudio",
  pref: "lyra.audio.protection",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraWebrtc",
  pref: "lyra.webrtc.protect",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraSensors",
  pref: "lyra.sensors.block",
  onUserChange() {
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraGeoMode",
  pref: "lyra.geo.mode",
  onUserChange() {
    applyGeo();
    applyLyraMode();
  },
});

Preferences.addSetting({
  id: "lyraGeoLat",
  pref: "lyra.geo.latitude",
  deps: ["lyraGeoMode"],
  disabled: () => Services.prefs.getStringPref("lyra.geo.mode", "block") !== "spoof",
});

Preferences.addSetting({
  id: "lyraGeoLon",
  pref: "lyra.geo.longitude",
  deps: ["lyraGeoMode"],
  disabled: () => Services.prefs.getStringPref("lyra.geo.mode", "block") !== "spoof",
});

function lyraSync() {
  try {
    return ChromeUtils.importESModule(
      "resource:///modules/LyraSync.sys.mjs"
    ).LyraSync;
  } catch (e) {
    return null;
  }
}

Preferences.addSetting({
  id: "lyraSyncEnabled",
  pref: "lyra.sync.enabled",
  onUserChange(checked) {
    const sync = lyraSync();
    if (!sync) {
      return;
    }
    if (checked) {
      sync.ensureSecret();
      sync.connect();
    } else {
      sync.disconnect();
    }
  },
});

Preferences.addSetting({
  id: "lyraSyncTabs",
  pref: "lyra.sync.tabs",
});

Preferences.addSetting({
  id: "lyraSyncBookmarks",
  pref: "lyra.sync.bookmarks",
});

Preferences.addSetting({
  id: "lyraSyncServer",
  pref: "lyra.sync.server",
});

Preferences.addSetting({
  id: "lyraSyncApplyTabs",
  pref: "lyra.sync.applyTabs",
});

Preferences.addSetting({
  id: "lyraSyncSecret",
  pref: "lyra.sync.secret",
  onUserChange() {
    const sync = lyraSync();
    if (sync && Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
      sync.connect();
    }
  },
});

Preferences.addSetting({
  id: "lyraSyncPair",
  onUserClick(e) {
    e.preventDefault();
    const sync = lyraSync();
    if (!sync) {
      return;
    }
    Services.prefs.setStringPref("lyra.sync.secret", "");
    sync.ensureSecret();
    Services.prefs.setBoolPref("lyra.sync.enabled", true);
    sync.connect();
  },
});

Preferences.addSetting({ id: "lyraRestartNote" });

Preferences.addSetting({
  id: "lyraHistoryIndex",
  pref: "lyra.history.index.enabled",
});

Preferences.addSetting({
  id: "lyraHistoryOpen",
  onUserClick(e) {
    e.preventDefault();
    Services.wm
      .getMostRecentBrowserWindow()
      ?.openTrustedLinkIn("about:lyrahistory", "tab");
  },
});

Preferences.addSetting({
  id: "lyraAlwaysPrivate",
  pref: "browser.privatebrowsing.autostart",
});

Preferences.addSetting({
  id: "lyraSafest",
  pref: "lyra.safest",
  onUserChange(checked) {
    applySafest(checked);
  },
});

Preferences.addSetting({
  id: "lyraPermissionsBlock",
  pref: "lyra.permissions.block",
  onUserChange(checked) {
    applyPermBlock(checked);
  },
});

Preferences.addSetting({
  id: "lyraFpi",
  pref: "lyra.fpi",
  onUserChange(checked) {
    Services.prefs.setBoolPref("privacy.firstparty.isolate", checked);
  },
});

for (const [id, pref] of [
  ["lyraClearCookies", "privacy.clearOnShutdown.cookies"],
  ["lyraClearCache", "privacy.clearOnShutdown.cache"],
  ["lyraClearHistory", "privacy.clearOnShutdown.history"],
  ["lyraClearFormdata", "privacy.clearOnShutdown.formdata"],
  ["lyraClearSessions", "privacy.clearOnShutdown.sessions"],
]) {
  Preferences.addSetting({
    id,
    pref,
    onUserChange() {
      applyClearOnExit();
    },
  });
}

Preferences.addSetting({
  id: "lyraUpdateCheck",
  pref: "lyra.update.check",
});

Preferences.addSetting({
  id: "lyraUpdateCheckNow",
  onUserClick() {
    try {
      ChromeUtils.importESModule(
        "resource:///modules/LyraUpdateCheck.sys.mjs"
      ).LyraUpdateCheck.checkNow();
    } catch {}
  },
});

Preferences.addSetting({
  id: "lyraWebgpu",
  pref: "lyra.webgpu.enabled",
  onUserChange() {
    const allow =
      Services.prefs.getStringPref("lyra.webgpu.allowlist", "").trim().length >
      0;
    Services.prefs.setBoolPref(
      "dom.webgpu.enabled",
      Services.prefs.getBoolPref("lyra.webgpu.enabled", false) || allow
    );
  },
});

Preferences.addSetting({
  id: "lyraWebgpuAllowlist",
  pref: "lyra.webgpu.allowlist",
  onUserChange() {
    const allow =
      Services.prefs.getStringPref("lyra.webgpu.allowlist", "").trim().length >
      0;
    Services.prefs.setBoolPref(
      "dom.webgpu.enabled",
      Services.prefs.getBoolPref("lyra.webgpu.enabled", false) || allow
    );
  },
});

Preferences.addSetting({
  id: "lyraWebglBlocklist",
  pref: "lyra.webgl.blocklist",
});

Preferences.addSetting({
  id: "lyraWebglAllowlist",
  pref: "lyra.webgl.allowlist",
});

Preferences.addSetting({
  id: "lyraCompatSites",
  pref: "lyra.compat.sites",
});

Preferences.addSetting({
  id: "lyraTranslations",
  get() {
    return Services.prefs.getBoolPref("browser.translations.enable", true);
  },
  set(checked) {
    Services.prefs.setBoolPref("browser.translations.enable", checked);
  },
  setup(emitChange) {
    return observePref("browser.translations.enable", emitChange);
  },
});

Preferences.addSetting({
  id: "lyraGsb",
  get() {
    return Services.prefs.getBoolPref("lyra.gsb.enabled", false);
  },
  set(checked) {
    Services.prefs.setBoolPref("lyra.gsb.enabled", checked);
    Services.prefs.setBoolPref("browser.safebrowsing.malware.enabled", checked);
    Services.prefs.setBoolPref("browser.safebrowsing.phishing.enabled", checked);
    Services.prefs.setBoolPref("browser.safebrowsing.blockedURIs.enabled", checked);
    Services.prefs.setBoolPref("browser.safebrowsing.downloads.enabled", checked);
    if (checked) {
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google4.gethashURL",
        GSB_GOOGLE4_HASH
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google4.updateURL",
        GSB_GOOGLE4_UPDATE
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google.gethashURL",
        GSB_GOOGLE_HASH
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google.updateURL",
        GSB_GOOGLE_UPDATE
      );
      Services.prefs.setBoolPref("browser.safebrowsing.provider.google5.enabled", true);
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google5.gethashURL",
        "https://safebrowsing.googleapis.com/v5/hashes:search?key=%GOOGLE_SAFEBROWSING_API_KEY%"
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google5.updateURL",
        "https://safebrowsing.googleapis.com/v5/hashLists:batchGet?key=%GOOGLE_SAFEBROWSING_API_KEY%"
      );
    } else {
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google4.gethashURL",
        ""
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google4.updateURL",
        ""
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google.gethashURL",
        ""
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google.updateURL",
        ""
      );
      Services.prefs.setBoolPref("browser.safebrowsing.provider.google5.enabled", false);
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google5.gethashURL",
        ""
      );
      Services.prefs.setStringPref(
        "browser.safebrowsing.provider.google5.updateURL",
        ""
      );
    }
  },
  setup(emitChange) {
    return observePref("lyra.gsb.enabled", emitChange);
  },
});

Preferences.addSetting({
  id: "lyraNewTabContainer",
  pref: "privacy.userContext.newTabContainerOnLeftClick.enabled",
});

try {
  SettingGroupManager.registerGroups({
    lyraFingerprint: {
      l10nId: "lyra-fingerprint-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraFingerprintMode",
          l10nId: "lyra-fingerprint-mode",
          control: "moz-radio-group",
          options: [
            {
              value: "firefox",
              l10nId: "lyra-fingerprint-mode-firefox",
              controlAttrs: { id: "lyraFingerprintFirefox" },
            },
            {
              value: "crowd",
              l10nId: "lyra-fingerprint-mode-crowd",
              controlAttrs: { id: "lyraFingerprintCrowd" },
            },
          ],
        },
        {
          id: "lyraUaMode",
          l10nId: "lyra-ua-mode",
          control: "moz-radio-group",
          options: [
            {
              value: "firefox",
              l10nId: "lyra-ua-mode-firefox",
              controlAttrs: { id: "lyraUaFirefox" },
            },
            {
              value: "crowd",
              l10nId: "lyra-ua-mode-crowd",
              controlAttrs: { id: "lyraUaCrowd" },
            },
            {
              value: "firefox-win",
              l10nId: "lyra-ua-mode-firefox-win",
            },
            {
              value: "firefox-mac",
              l10nId: "lyra-ua-mode-firefox-mac",
            },
            {
              value: "chrome-win",
              l10nId: "lyra-ua-mode-chrome-win",
            },
            {
              value: "edge-win",
              l10nId: "lyra-ua-mode-edge-win",
            },
            {
              value: "safari-mac",
              l10nId: "lyra-ua-mode-safari-mac",
            },
            {
              value: "custom",
              l10nId: "lyra-ua-mode-custom",
            },
          ],
        },
        {
          id: "lyraUaCustom",
          l10nId: "lyra-ua-custom",
          control: "moz-input-text",
        },
      ],
    },
    lyraWindows: {
      l10nId: "lyra-windows-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraWindowBuckets",
          l10nId: "lyra-window-buckets",
          control: "moz-checkbox",
        },
        {
          id: "lyraLetterboxing",
          l10nId: "lyra-letterboxing",
          control: "moz-checkbox",
        },
      ],
    },
    lyraFonts: {
      l10nId: "lyra-fonts-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraBundledFonts",
          l10nId: "lyra-bundled-fonts",
          control: "moz-checkbox",
        },
        {
          id: "lyraFontsRestrict",
          l10nId: "lyra-fonts-restrict",
          control: "moz-checkbox",
        },
        {
          id: "lyraFontVisibility",
          l10nId: "lyra-font-visibility",
          control: "moz-select",
          options: [
            {
              value: "1",
              l10nId: "lyra-font-visibility-base",
            },
            {
              value: "2",
              l10nId: "lyra-font-visibility-langpack",
            },
            {
              value: "3",
              l10nId: "lyra-font-visibility-all",
            },
          ],
        },
      ],
    },
    lyraTyping: {
      l10nId: "lyra-typing-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraTypingProtection",
          l10nId: "lyra-typing-protection",
          control: "moz-checkbox",
        },
        {
          id: "lyraTypingDelay",
          l10nId: "lyra-typing-delay",
          control: "moz-select",
          options: [
            {
              value: "1000",
              l10nId: "lyra-typing-delay-1ms",
            },
            {
              value: "20000",
              l10nId: "lyra-typing-delay-20ms",
            },
            {
              value: "100000",
              l10nId: "lyra-typing-delay-100ms",
            },
          ],
        },
      ],
    },
    lyraSpoof: {
      l10nId: "lyra-spoof-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraTimezone",
          l10nId: "lyra-timezone-spoof",
          control: "moz-checkbox",
        },
        {
          id: "lyraAudio",
          l10nId: "lyra-audio-protection",
          control: "moz-checkbox",
        },
        {
          id: "lyraWebrtc",
          l10nId: "lyra-webrtc-protect",
          control: "moz-checkbox",
        },
        {
          id: "lyraSensors",
          l10nId: "lyra-sensors-block",
          control: "moz-checkbox",
        },
        {
          id: "lyraGeoMode",
          l10nId: "lyra-geo-mode",
          control: "moz-radio-group",
          options: [
            {
              value: "block",
              l10nId: "lyra-geo-mode-block",
            },
            {
              value: "spoof",
              l10nId: "lyra-geo-mode-spoof",
            },
            {
              value: "ask",
              l10nId: "lyra-geo-mode-ask",
            },
          ],
        },
        {
          id: "lyraGeoLat",
          l10nId: "lyra-geo-lat",
          control: "moz-input-text",
        },
        {
          id: "lyraGeoLon",
          l10nId: "lyra-geo-lon",
          control: "moz-input-text",
        },
      ],
    },
    lyraDns: {
      l10nId: "lyra-dns-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraDohMode",
          l10nId: "lyra-doh-mode",
          control: "moz-radio-group",
          options: [
            {
              value: "2",
              l10nId: "lyra-doh-mode-2",
              controlAttrs: { id: "lyraDohFirst" },
            },
            {
              value: "3",
              l10nId: "lyra-doh-mode-3",
              controlAttrs: { id: "lyraDohOnly" },
            },
            {
              value: "5",
              l10nId: "lyra-doh-mode-5",
              controlAttrs: { id: "lyraDohOff" },
            },
          ],
        },
        {
          id: "lyraDohAdvanced",
          l10nId: "lyra-doh-advanced",
          control: "moz-box-button",
        },
      ],
    },
    lyraProtections: {
      l10nId: "lyra-protections-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraLanBlock",
          l10nId: "lyra-lan-block",
          control: "moz-checkbox",
        },
        {
          id: "lyraPermissionsBlock",
          l10nId: "lyra-permissions-block",
          control: "moz-checkbox",
        },
        {
          id: "lyraFpi",
          l10nId: "lyra-fpi",
          control: "moz-checkbox",
        },
      ],
    },
    lyraScripts: {
      l10nId: "lyra-scripts-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraJsMode",
          l10nId: "lyra-js-mode",
          control: "moz-radio-group",
          options: [
            {
              value: "off",
              l10nId: "lyra-js-mode-off",
            },
            {
              value: "denylist",
              l10nId: "lyra-js-mode-denylist",
            },
            {
              value: "allowlist",
              l10nId: "lyra-js-mode-allowlist",
            },
          ],
        },
        {
          id: "lyraJsBlocklist",
          l10nId: "lyra-js-blocklist",
          control: "moz-input-text",
        },
        {
          id: "lyraJsAllowlist",
          l10nId: "lyra-js-allowlist",
          control: "moz-input-text",
        },
        {
          id: "lyraSafest",
          l10nId: "lyra-safest",
          control: "moz-checkbox",
        },
      ],
    },
    lyraStorage: {
      l10nId: "lyra-storage-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraStorageEncrypt",
          l10nId: "lyra-storage-encrypt",
          control: "moz-checkbox",
        },
        {
          id: "lyraAlwaysPrivate",
          l10nId: "lyra-always-private",
          control: "moz-checkbox",
        },
      ],
    },
    lyraHistory: {
      l10nId: "lyra-history-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraHistoryIndex",
          l10nId: "lyra-history-index",
          control: "moz-checkbox",
        },
        {
          id: "lyraHistoryOpen",
          l10nId: "lyra-history-open",
          control: "moz-box-button",
        },
      ],
    },
    lyraWipe: {
      l10nId: "lyra-wipe-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraClearCookies",
          l10nId: "lyra-clear-cookies",
          control: "moz-checkbox",
        },
        {
          id: "lyraClearCache",
          l10nId: "lyra-clear-cache",
          control: "moz-checkbox",
        },
        {
          id: "lyraClearHistory",
          l10nId: "lyra-clear-history",
          control: "moz-checkbox",
        },
        {
          id: "lyraClearFormdata",
          l10nId: "lyra-clear-formdata",
          control: "moz-checkbox",
        },
        {
          id: "lyraClearSessions",
          l10nId: "lyra-clear-sessions",
          control: "moz-checkbox",
        },
        {
          id: "lyraUpdateCheck",
          l10nId: "lyra-update-check",
          control: "moz-checkbox",
        },
        {
          id: "lyraUpdateCheckNow",
          l10nId: "lyra-update-check-now",
          control: "moz-box-button",
        },
      ],
    },
    lyraSync: {
      l10nId: "lyra-sync-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraSyncEnabled",
          l10nId: "lyra-sync-enabled",
          control: "moz-checkbox",
        },
        {
          id: "lyraSyncTabs",
          l10nId: "lyra-sync-tabs",
          control: "moz-checkbox",
        },
        {
          id: "lyraSyncBookmarks",
          l10nId: "lyra-sync-bookmarks",
          control: "moz-checkbox",
        },
        {
          id: "lyraSyncServer",
          l10nId: "lyra-sync-server",
          control: "moz-input-text",
        },
        {
          id: "lyraSyncApplyTabs",
          l10nId: "lyra-sync-apply-tabs",
          control: "moz-checkbox",
        },
        {
          id: "lyraSyncSecret",
          l10nId: "lyra-sync-secret",
          control: "moz-input-text",
        },
        {
          id: "lyraSyncPair",
          l10nId: "lyra-sync-pair",
          control: "moz-box-button",
        },
      ],
    },
    lyraCompat: {
      l10nId: "lyra-compat-group",
      headingLevel: 2,
      items: [
        {
          id: "lyraHttpsOnly",
          l10nId: "lyra-https-only",
          control: "moz-checkbox",
        },
        {
          id: "lyraQueryStripping",
          l10nId: "lyra-query-stripping",
          control: "moz-checkbox",
        },
        {
          id: "lyraReferrer",
          l10nId: "lyra-referrer",
          control: "moz-checkbox",
        },
        {
          id: "lyraWebgl",
          l10nId: "lyra-webgl",
          control: "moz-checkbox",
        },
        {
          id: "lyraWebglBlocklist",
          l10nId: "lyra-webgl-blocklist",
          control: "moz-input-text",
        },
        {
          id: "lyraWebglAllowlist",
          l10nId: "lyra-webgl-allowlist",
          control: "moz-input-text",
        },
        {
          id: "lyraWebgpu",
          l10nId: "lyra-webgpu",
          control: "moz-checkbox",
        },
        {
          id: "lyraWebgpuAllowlist",
          l10nId: "lyra-webgpu-allowlist",
          control: "moz-input-text",
        },
        {
          id: "lyraCompatSites",
          l10nId: "lyra-compat-sites",
          control: "moz-input-text",
        },
        {
          id: "lyraGsb",
          l10nId: "lyra-gsb",
          control: "moz-checkbox",
        },
        {
          id: "lyraTranslations",
          l10nId: "lyra-translations",
          control: "moz-checkbox",
        },
        {
          id: "lyraNewTabContainer",
          l10nId: "lyra-newtab-container",
          control: "moz-checkbox",
        },
        {
          id: "lyraEme",
          l10nId: "lyra-eme",
          control: "moz-checkbox",
        },
        {
          id: "lyraOcsp",
          l10nId: "lyra-ocsp",
          control: "moz-checkbox",
        },
        {
          id: "lyraSpoofEnglish",
          l10nId: "lyra-spoof-english",
          control: "moz-checkbox",
        },
        {
          id: "lyraRestartNote",
          l10nId: "lyra-restart-note",
          control: "moz-message-bar",
          controlAttrs: {
            role: "status",
          },
        },
      ],
    },
  });
} catch (e) {
  if (!String(e).includes("already registered")) {
    throw e;
  }
}

applyLyraMode();
