/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Optional per-site JavaScript blocking built on nsIDomainPolicy.
 *
 * lyra.js.mode:
 *   off       - allow scripts everywhere (default)
 *   denylist  - block scripts on origins in lyra.js.blocklist
 *   allowlist - block scripts everywhere except lyra.js.allowlist
 *
 * Both lists hold space separated origins or hosts, for example
 * "example.com https://site.test". Applied via the script security
 * manager domain policy, so inline and external scripts are both denied
 * in the target origins.
 */

const MODE_PREF = "lyra.js.mode";
const BLOCKLIST_PREF = "lyra.js.blocklist";
const ALLOWLIST_PREF = "lyra.js.allowlist";

function readList(pref) {
  try {
    return Services.prefs
      .getStringPref(pref, "")
      .split(/\s+/)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function toURI(entry) {
  try {
    return Services.io.newURI(
      entry.includes("://") ? entry : "https://" + entry
    );
  } catch {
    return null;
  }
}

export const LyraScriptBlock = {
  _policy: null,
  _appliedBlock: new Set(),
  _appliedAllow: new Set(),

  init() {
    this.apply();
    Services.prefs.addObserver("lyra.js.", this, false);
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed" && data.startsWith("lyra.js.")) {
      this.apply();
    }
  },

  _ensurePolicy() {
    if (!this._policy) {
      this._policy =
        Services.scriptSecurityManager.activateDomainPolicy();
    }
    return this._policy;
  },

  _sync(set, applied, pref) {
    let next = new Set();
    for (let entry of readList(pref)) {
      let uri = toURI(entry);
      if (uri) {
        next.add(uri.prePath);
        set.add(uri);
      }
    }
    for (let old of applied) {
      if (!next.has(old)) {
        set.remove(Services.io.newURI(old));
      }
    }
    return next;
  },

  apply() {
    let mode = Services.prefs.getStringPref(MODE_PREF, "off");
    if (mode == "off") {
      if (this._policy) {
        Services.scriptSecurityManager.deactivateDomainPolicy();
        this._policy = null;
        this._appliedBlock.clear();
        this._appliedAllow.clear();
      }
      return;
    }
    let policy = this._ensurePolicy();
    if (mode == "denylist") {
      this._appliedAllow = this._sync(
        policy.allowlist,
        this._appliedAllow,
        ""
      );
      this._appliedBlock = this._sync(
        policy.blocklist,
        this._appliedBlock,
        BLOCKLIST_PREF
      );
    } else {
      this._appliedBlock = this._sync(
        policy.blocklist,
        this._appliedBlock,
        ""
      );
      this._appliedAllow = this._sync(
        policy.allowlist,
        this._appliedAllow,
        ALLOWLIST_PREF
      );
    }
  },
};
