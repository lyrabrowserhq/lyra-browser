/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Site policy parent. Registers the content actor and keeps Gecko prefs
 * in line with Lyra graphics and geolocation modes.
 *
 * WebGL stays enabled globally so Cloudflare and maps work. A non-empty
 * lyra.webgl.allowlist switches to per-site opt-in. lyra.webgl.blocklist
 * always wins.
 *
 * WebGPU stays disabled until the allowlist is non-empty, then the
 * pref is on and the child allows getContext(webgpu) only there.
 *
 * Compatibility hosts in lyra.compat.sites drop canvas and WebGL
 * randomization for that first-party via FPP granularOverrides.
 */

const COMPAT_FPP =
  "-CanvasRandomization,-EfficientCanvasRandomization,-WebGLRandomization";

function readHosts(pref) {
  try {
    return Services.prefs
      .getStringPref(pref, "")
      .split(/[\s,]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function hostFromEntry(entry) {
  try {
    let raw = entry.includes("://") ? entry : "https://" + entry;
    return Services.io.newURI(raw).asciiHost.toLowerCase();
  } catch {
    return "";
  }
}

export const LyraSitePolicy = {
  init() {
    ChromeUtils.registerWindowActor("LyraSitePolicy", {
      parent: {
        esModuleURI: "resource:///modules/LyraSitePolicy.sys.mjs",
      },
      child: {
        esModuleURI: "resource:///actors/LyraSitePolicyChild.sys.mjs",
        events: { DOMWindowCreated: {} },
      },
      allFrames: true,
      messageManagerGroups: ["browsers"],
    });
    this.apply();
    Services.prefs.addObserver("lyra.geo.", this, false);
    Services.prefs.addObserver("lyra.webgpu.", this, false);
    Services.prefs.addObserver("lyra.webgl.", this, false);
    Services.prefs.addObserver("lyra.compat.", this, false);
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      this.apply();
    }
  },

  apply() {
    this.applyGeo();
    this.applyWebgpu();
    this.applyCompat();
  },

  geoMode() {
    let mode = Services.prefs.getStringPref("lyra.geo.mode", "");
    if (mode === "block" || mode === "spoof" || mode === "ask") {
      return mode;
    }
    return Services.prefs.getBoolPref("lyra.geo.block", true)
      ? "block"
      : "ask";
  },

  applyGeo() {
    let mode = this.geoMode();
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
  },

  applyWebgpu() {
    let allow = readHosts("lyra.webgpu.allowlist").length > 0;
    let global = Services.prefs.getBoolPref("lyra.webgpu.enabled", false);
    Services.prefs.setBoolPref("dom.webgpu.enabled", global || allow);
  },

  applyCompat() {
    let hosts = readHosts("lyra.compat.sites")
      .map(hostFromEntry)
      .filter(Boolean);
    let overrides = hosts.map(h => ({
      firstPartyDomain: h,
      overrides: COMPAT_FPP,
    }));
    Services.prefs.setStringPref(
      "privacy.fingerprintingProtection.granularOverrides",
      JSON.stringify(overrides)
    );
  },
};

export class LyraSitePolicyParent extends JSWindowActorParent {}
