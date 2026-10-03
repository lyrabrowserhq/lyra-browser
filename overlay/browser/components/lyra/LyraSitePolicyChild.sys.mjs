/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Content actor for geolocation spoof and per-site WebGL / WebGPU.
 * Fail closed for WebGPU. Fail open for WebGL so Cloudflare still runs
 * when injection is blocked by a page.
 */

function hostList(pref) {
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

function hostOf(win) {
  try {
    return win.location.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function listed(host, entries) {
  if (!host) {
    return false;
  }
  for (let entry of entries) {
    let h = entry;
    if (h.includes("://")) {
      try {
        h = new URL(h).hostname;
      } catch {
        continue;
      }
    }
    h = h.replace(/^www\./, "").toLowerCase();
    let cur = host.replace(/^www\./, "");
    if (cur === h || cur.endsWith("." + h)) {
      return true;
    }
  }
  return false;
}

function exportFn(fn, win) {
  try {
    if (typeof ChromeUtils.exportFunction === "function") {
      return ChromeUtils.exportFunction(fn, win);
    }
  } catch {}
  try {
    if (typeof exportFunction === "function") {
      return exportFunction(fn, win);
    }
  } catch {}
  return fn;
}

function waive(obj) {
  try {
    return ChromeUtils.waiveXrays(obj);
  } catch {
    return obj;
  }
}

export class LyraSitePolicyChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type != "DOMWindowCreated") {
      return;
    }
    this._install();
  }

  actorCreated() {
    this._install();
  }

  _install() {
    let win = this.contentWindow;
    if (!win) {
      return;
    }
    this._geo(win);
    this._graphics(win);
  }

  _geo(win) {
    let mode = Services.prefs.getStringPref("lyra.geo.mode", "");
    if (!mode) {
      mode = Services.prefs.getBoolPref("lyra.geo.block", true)
        ? "block"
        : "ask";
    }
    if (mode !== "spoof") {
      return;
    }
    let lat = Number(Services.prefs.getStringPref("lyra.geo.latitude", "64.1466"));
    let lon = Number(Services.prefs.getStringPref("lyra.geo.longitude", "-21.9426"));
    let acc = Number(Services.prefs.getIntPref("lyra.geo.accuracy", 5000));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
      lat = 64.1466;
      lon = -21.9426;
    }
    let coords = {
      latitude: lat,
      longitude: lon,
      accuracy: acc,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    };
    try {
      let uw = waive(win);
      let pos = {
        coords,
        timestamp: Date.now(),
      };
      let getCurrentPosition = exportFn(function (success) {
        if (typeof success === "function") {
          win.setTimeout(() => success(pos), 0);
        }
      }, win);
      let watchPosition = exportFn(function (success) {
        if (typeof success === "function") {
          win.setTimeout(() => success(pos), 0);
        }
        return 1;
      }, win);
      let clearWatch = exportFn(function () {}, win);
      let geo = {
        getCurrentPosition,
        watchPosition,
        clearWatch,
      };
      Object.defineProperty(uw.navigator, "geolocation", {
        configurable: true,
        enumerable: true,
        get: exportFn(() => geo, win),
      });
    } catch {}
  }

  _graphics(win) {
    let host = hostOf(win);
    let glAllow = hostList("lyra.webgl.allowlist");
    let blockGl =
      listed(host, hostList("lyra.webgl.blocklist")) ||
      (glAllow.length > 0 && !listed(host, glAllow));
    let allowGpu =
      Services.prefs.getBoolPref("lyra.webgpu.enabled", false) ||
      listed(host, hostList("lyra.webgpu.allowlist"));
    if (!blockGl && allowGpu) {
      return;
    }
    try {
      let uw = waive(win);
      let proto = uw.HTMLCanvasElement.prototype;
      let orig = proto.getContext;
      if (typeof orig !== "function" || orig.__lyraPatched) {
        return;
      }
      let wrapped = exportFn(function (type, attrs) {
        let kind = String(type || "").toLowerCase();
        if (blockGl && (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl")) {
          return null;
        }
        if (!allowGpu && kind === "webgpu") {
          return null;
        }
        return orig.call(this, type, attrs);
      }, win);
      wrapped.__lyraPatched = true;
      proto.getContext = wrapped;
    } catch {}
  }
}
