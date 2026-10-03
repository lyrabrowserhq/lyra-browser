/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Opt-in update notifier. Never downloads a binary. Never uses Mozilla
 * BALROG. Trust is an Ed25519 signature over release.json plus a
 * SHA-256 of each artifact listed inside that signed document.
 *
 * Startup check is off until lyra.update.check is true. The settings
 * button runs the same path on demand.
 *
 * release.json is fetched from GitHub Releases. The matching
 * release.json.sig is 64 raw Ed25519 bytes. Host allowlist is strict.
 * Redirects that leave github.com are rejected.
 */

const RELEASE_JSON =
  "https://github.com/lyrabrowserhq/lyra/releases/latest/download/release.json";
const RELEASE_SIG =
  "https://github.com/lyrabrowserhq/lyra/releases/latest/download/release.json.sig";
const RELEASES_API =
  "https://api.github.com/repos/lyrabrowserhq/lyra/releases/latest";
const RELEASES_PAGE = "https://github.com/lyrabrowserhq/lyra/releases";
const REPO_PREFIX =
  "https://github.com/lyrabrowserhq/lyra/releases/download/";
const CHECK_DELAY_MS = 25000;
const FETCH_MS = 15000;
const JSON_MAX = 65536;
const SIG_LEN = 64;
const PUBKEY_LEN = 32;

const SHIPPED_PUBKEYS = [
  "725192f6316c011691f8a9762da63e2f1937a7e41edd0e47c5263adbb5a662a4",
];

const ALLOWED_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

function hexToBytes(hex) {
  if (!hex || hex.length % 2) {
    throw new Error("bad hex");
  }
  let out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function isHex(s, len) {
  return typeof s === "string" && s.length === len && /^[0-9a-f]+$/i.test(s);
}

function allowedUrl(url) {
  let u = new URL(url);
  return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
}

function parseVersion(v) {
  let m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) {
    return null;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function newerThan(a, b) {
  let pa = parseVersion(a);
  let pb = parseVersion(b);
  if (!pa || !pb) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) {
      return true;
    }
    if (pa[i] < pb[i]) {
      return false;
    }
  }
  return false;
}

function trustedPubkeys() {
  let keys = SHIPPED_PUBKEYS.slice();
  try {
    let extra = JSON.parse(
      Services.prefs.getStringPref("lyra.update.trusted_pubkeys", "[]")
    );
    if (Array.isArray(extra)) {
      for (let k of extra) {
        if (isHex(k, 64) && !keys.includes(k.toLowerCase())) {
          keys.push(k.toLowerCase());
        }
      }
    }
  } catch {}
  return keys.slice(0, 8);
}

function rememberPubkeys(list) {
  if (!Array.isArray(list) || !list.length) {
    return;
  }
  let have = trustedPubkeys();
  for (let k of list) {
    if (isHex(k, 64) && !have.includes(k.toLowerCase())) {
      have.push(k.toLowerCase());
    }
  }
  Services.prefs.setStringPref(
    "lyra.update.trusted_pubkeys",
    JSON.stringify(have.slice(0, 8))
  );
}

async function fetchBytes(url, max) {
  if (!allowedUrl(url)) {
    throw new Error("host not allowed");
  }
  let res = await fetch(url, {
    credentials: "omit",
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
    headers: { Accept: "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error("http " + res.status);
  }
  if (!allowedUrl(res.url)) {
    throw new Error("redirect left github");
  }
  let buf = await res.arrayBuffer();
  if (buf.byteLength < 1 || buf.byteLength > max) {
    throw new Error("unexpected size");
  }
  return { bytes: new Uint8Array(buf), url: res.url };
}

async function verifyEd25519(pubHex, msg, sig) {
  if (sig.byteLength !== SIG_LEN) {
    return false;
  }
  let raw = hexToBytes(pubHex);
  if (raw.byteLength !== PUBKEY_LEN) {
    return false;
  }
  let key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("Ed25519", key, sig, msg);
}

function validateManifest(doc, current) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("manifest not an object");
  }
  let version = String(doc.version || "");
  if (!parseVersion(version)) {
    throw new Error("bad version");
  }
  if (String(doc.tag || "") !== "v" + version) {
    throw new Error("tag mismatch");
  }
  if (doc.channel && doc.channel !== "stable") {
    throw new Error("not stable");
  }
  if (/-/.test(version)) {
    throw new Error("pre-release");
  }
  if (!newerThan(version, current)) {
    throw new Error("not newer");
  }
  if (doc.min_lyra && newerThan(doc.min_lyra, current)) {
    throw new Error("min_lyra too new");
  }
  if (!Array.isArray(doc.artifacts) || !doc.artifacts.length) {
    throw new Error("no artifacts");
  }
  let prefix = REPO_PREFIX + "v" + version + "/";
  for (let a of doc.artifacts) {
    if (!a || typeof a !== "object") {
      throw new Error("bad artifact");
    }
    if (!isHex(a.sha256, 64)) {
      throw new Error("bad sha256");
    }
    if (!Number.isInteger(a.size) || a.size < 1 || a.size > 2_000_000_000) {
      throw new Error("bad size");
    }
    if (typeof a.name !== "string" || /[\\/]/.test(a.name) || !a.name.length) {
      throw new Error("bad name");
    }
    if (typeof a.url !== "string" || !a.url.startsWith(prefix)) {
      throw new Error("artifact url not this tag");
    }
    if (!allowedUrl(a.url)) {
      throw new Error("artifact host");
    }
  }
  if (doc.notes_url && !String(doc.notes_url).startsWith(RELEASES_PAGE)) {
    throw new Error("notes url");
  }
  return version;
}

function pickArtifact(artifacts) {
  let os = Services.appinfo.OS;
  let want =
    os === "WINNT" ? "windows" : os === "Darwin" ? "macos" : "linux";
  return artifacts.find(
    a => a.os === want && (a.arch === "x86_64" || a.arch === "amd64")
  );
}

export const LyraUpdateCheck = {
  init() {
    if (!Services.prefs.getBoolPref("lyra.update.check", false)) {
      return;
    }
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(
      () => this.check({ notify: true }),
      CHECK_DELAY_MS,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  },

  async check({ notify = true, force = false } = {}) {
    let current = Services.prefs.getStringPref("lyra.version", "");
    if (!current) {
      return { ok: false, reason: "no current version" };
    }
    try {
      let jsonPart = await fetchBytes(RELEASE_JSON, JSON_MAX);
      let sigPart = await fetchBytes(RELEASE_SIG, SIG_LEN);
      if (sigPart.bytes.byteLength !== SIG_LEN) {
        return { ok: false, reason: "bad signature length" };
      }
      let verified = false;
      for (let pub of trustedPubkeys()) {
        if (await verifyEd25519(pub, jsonPart.bytes, sigPart.bytes)) {
          verified = true;
          break;
        }
      }
      if (!verified) {
        return { ok: false, reason: "signature rejected" };
      }
      let text = new TextDecoder("utf-8", { fatal: true }).decode(
        jsonPart.bytes
      );
      let doc = JSON.parse(text);
      let version = validateManifest(doc, current);
      rememberPubkeys(doc.next_pubkeys);

      try {
        let api = await fetchBytes(RELEASES_API, JSON_MAX);
        let body = JSON.parse(new TextDecoder().decode(api.bytes));
        let tag = String(body.tag_name || "").replace(/^v/, "");
        if (tag && tag !== version) {
          return { ok: false, reason: "api tag mismatch" };
        }
      } catch {
        // API is a cross-check. Signed JSON is the trust root.
      }

      if (!force && Services.prefs.getStringPref("lyra.update.seen", "") == version) {
        return { ok: true, version, already: true };
      }
      if (notify) {
        this._notify(version, pickArtifact(doc.artifacts), doc);
      }
      return { ok: true, version, artifact: pickArtifact(doc.artifacts) };
    } catch (e) {
      return { ok: false, reason: String(e.message || e) };
    }
  },

  async checkNow() {
    return this.check({ notify: true, force: true });
  },

  async _notify(version, artifact, doc) {
    let l10n = new Localization(["browser/lyra.ftl"], true);
    let message = await l10n.formatValue("lyra-update-available", {
      version,
    });
    if (artifact?.sha256) {
      let extra = await l10n.formatValue("lyra-update-hash", {
        sha256: artifact.sha256.slice(0, 16),
      });
      if (extra) {
        message = message + " " + extra;
      }
    }
    let download = await l10n.formatValue("lyra-update-download");
    let dismiss = await l10n.formatValue("lyra-update-dismiss");
    let notes = doc?.notes_url || `${RELEASES_PAGE}/tag/v${version}`;
    if (!allowedUrl(notes)) {
      notes = `${RELEASES_PAGE}/tag/v${version}`;
    }
    for (let win of Services.wm.getEnumerator("navigator:browser")) {
      let notify = win.PopupNotifications;
      if (!notify) {
        continue;
      }
      notify.show(
        win.gBrowser.selectedBrowser,
        "lyra-update",
        message,
        "urlbar",
        {
          label: download,
          accessKey: "D",
          callback: () => {
            Services.prefs.setStringPref("lyra.update.seen", version);
            win.openTrustedLinkIn(notes, "tab");
          },
        },
        [
          {
            label: dismiss,
            accessKey: "m",
            callback: () => {
              Services.prefs.setStringPref("lyra.update.seen", version);
            },
          },
        ],
        { hideClose: false }
      );
    }
  },
};
