/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_URL = "wss://sync.lyrabrowser.com/ws";
const WS_PROTOCOL = "lyra-sync-v1";
const MAGIC = [0x4c, 0x59, 0x52, 0x31];
const GROUP_LEN = 8;
const NONCE_LEN = 12;
const MAX_TABS = 80;
const MAX_BOOKMARKS = 400;
const FOLDER_TITLE = "Lyra";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

function concatBytes(parts) {
  let total = 0;
  for (const p of parts) {
    total += p.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i] & 31];
  }
  return `LYRA-${out.slice(0, 4)}-${out.slice(4)}`;
}

function isHttpUrl(spec) {
  return spec.startsWith("https://") || spec.startsWith("http://");
}

function isHttpsUrl(spec) {
  return spec.startsWith("https://");
}

export const LyraSync = {
  _ws: null,
  _win: null,
  _timer: null,
  _retry: null,
  _key: null,
  _group: null,
  _device: null,
  _reconnect: 0,
  _gen: 0,
  _mergeChain: Promise.resolve(),

  init(_jsGlobal, win) {
    this._win = win || Services.wm.getMostRecentWindow("navigator:browser");
    if (!this._device) {
      let id = Services.prefs.getStringPref("lyra.sync.deviceId", "");
      if (!id) {
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        id = Array.from(bytes, b => ALPHABET[b & 31]).join("");
        Services.prefs.setStringPref("lyra.sync.deviceId", id);
      }
      this._device = id;
    }
    Services.prefs.addObserver("lyra.sync.enabled", this);
    Services.prefs.addObserver("lyra.sync.secret", this);
    Services.obs.addObserver(this, "quit-application");
    if (Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
      this.connect();
    }
  },

  observe(_subject, topic, data) {
    if (topic === "quit-application") {
      this.disconnect();
      return;
    }
    if (data === "lyra.sync.enabled") {
      if (Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
        this.ensureSecret();
        this.connect();
      } else {
        this.disconnect();
      }
      return;
    }
    if (data === "lyra.sync.secret") {
      if (Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
        this.connect();
      }
    }
  },

  ensureSecret() {
    let secret = Services.prefs.getStringPref("lyra.sync.secret", "");
    if (!secret) {
      secret = randomCode();
      Services.prefs.setStringPref("lyra.sync.secret", secret);
    }
    return secret;
  },

  async _derive() {
    const secret = this.ensureSecret();
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      "HKDF",
      false,
      ["deriveKey", "deriveBits"]
    );
    this._key = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode("lyra-sync-v1"),
        info: enc.encode("aes-gcm"),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    const groupBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: enc.encode("lyra-sync-v1"),
        info: enc.encode("group"),
      },
      material,
      GROUP_LEN * 8
    );
    this._group = new Uint8Array(groupBits);
  },

  connect() {
    this.disconnect();
    if (!Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
      return;
    }
    const url = Services.prefs.getStringPref("lyra.sync.server", DEFAULT_URL);
    const win = this._win || Services.wm.getMostRecentWindow("navigator:browser");
    if (!win) {
      return;
    }
    this._win = win;
    const gen = ++this._gen;
    this._derive()
      .then(() => {
        if (gen !== this._gen) {
          return;
        }
        if (!Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
          return;
        }
        const ws = new win.WebSocket(url, WS_PROTOCOL);
        ws.binaryType = "arraybuffer";
        this._ws = ws;
        ws.addEventListener("open", () => {
          if (this._ws !== ws) {
            return;
          }
          this._reconnect = 0;
          this._sendState();
          this._armTimer();
        });
        ws.addEventListener("message", ev => {
          if (this._ws !== ws) {
            return;
          }
          this._onFrame(ev.data);
        });
        ws.addEventListener("close", () => {
          if (this._ws !== ws) {
            return;
          }
          this._ws = null;
          this._scheduleReconnect();
        });
        ws.addEventListener("error", () => {
          try {
            ws.close();
          } catch (e) {}
        });
      })
      .catch(() => {
        if (gen === this._gen) {
          this._scheduleReconnect();
        }
      });
  },

  disconnect() {
    this._gen += 1;
    if (this._timer) {
      this._win?.clearInterval(this._timer);
      this._timer = null;
    }
    if (this._retry) {
      this._win?.clearTimeout(this._retry);
      this._retry = null;
    }
    if (this._ws) {
      const ws = this._ws;
      this._ws = null;
      try {
        ws.close();
      } catch (e) {}
    }
  },

  _scheduleReconnect() {
    if (!Services.prefs.getBoolPref("lyra.sync.enabled", false)) {
      return;
    }
    this._reconnect = Math.min(this._reconnect + 1, 6);
    const delay = 2000 * this._reconnect;
    if (this._retry) {
      this._win?.clearTimeout(this._retry);
    }
    this._retry = this._win?.setTimeout(() => this.connect(), delay);
  },

  _armTimer() {
    if (this._timer) {
      this._win.clearInterval(this._timer);
    }
    this._timer = this._win.setInterval(() => this._sendState(), 45000);
  },

  collectTabs() {
    const urls = [];
    const seen = new Set();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
        continue;
      }
      const tabs = win.gBrowser?.tabs || [];
      for (const tab of tabs) {
        const spec = tab.linkedBrowser?.currentURI?.spec;
        if (!spec || !isHttpUrl(spec) || seen.has(spec)) {
          continue;
        }
        seen.add(spec);
        urls.push({
          url: spec,
          title: tab.label || spec,
        });
        if (urls.length >= MAX_TABS) {
          return urls;
        }
      }
    }
    return urls;
  },

  async collectBookmarks() {
    const out = [];
    const seen = new Set();
    const walk = node => {
      if (node.uri && isHttpUrl(node.uri) && !seen.has(node.uri)) {
        seen.add(node.uri);
        out.push({ url: node.uri, title: node.title || node.uri });
      }
      for (const child of node.children || []) {
        if (out.length >= MAX_BOOKMARKS) {
          return;
        }
        walk(child);
      }
    };
    try {
      const toolbar = await lazy.PlacesUtils.promiseBookmarksTree(
        lazy.PlacesUtils.bookmarks.toolbarGuid
      );
      walk(toolbar);
      if (out.length < MAX_BOOKMARKS) {
        const menu = await lazy.PlacesUtils.promiseBookmarksTree(
          lazy.PlacesUtils.bookmarks.unfiledGuid
        );
        walk(menu);
      }
    } catch (e) {}
    return out.slice(0, MAX_BOOKMARKS);
  },

  async _sendState() {
    if (!this._ws || this._ws.readyState !== 1 || !this._key) {
      return;
    }
    const payload = {
      v: 1,
      t: "state",
      device: this._device,
      ts: Date.now(),
    };
    if (Services.prefs.getBoolPref("lyra.sync.tabs", true)) {
      payload.tabs = this.collectTabs();
    }
    if (Services.prefs.getBoolPref("lyra.sync.bookmarks", true)) {
      payload.bookmarks = await this.collectBookmarks();
    }
    await this._sendJson(payload);
  },

  async _sendJson(obj) {
    const enc = new TextEncoder();
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce },
        this._key,
        enc.encode(JSON.stringify(obj))
      )
    );
    const frame = concatBytes([
      Uint8Array.from(MAGIC),
      this._group,
      nonce,
      cipher,
    ]);
    try {
      this._ws.send(frame);
    } catch (e) {}
  },

  async _onFrame(data) {
    try {
      const bytes = new Uint8Array(data);
      if (bytes.length < 4 + GROUP_LEN + NONCE_LEN + 16) {
        return;
      }
      for (let i = 0; i < 4; i++) {
        if (bytes[i] !== MAGIC[i]) {
          return;
        }
      }
      if (!this._group) {
        return;
      }
      for (let i = 0; i < GROUP_LEN; i++) {
        if (bytes[4 + i] !== this._group[i]) {
          return;
        }
      }
      const nonce = bytes.subarray(4 + GROUP_LEN, 4 + GROUP_LEN + NONCE_LEN);
      const cipher = bytes.subarray(4 + GROUP_LEN + NONCE_LEN);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        this._key,
        cipher
      );
      const msg = JSON.parse(new TextDecoder().decode(plain));
      if (!msg || msg.device === this._device) {
        return;
      }
      await this._apply(msg);
    } catch (e) {}
  },

  async _apply(msg) {
    if (msg.tabs && Services.prefs.getBoolPref("lyra.sync.tabs", true)) {
      Services.prefs.setStringPref(
        "lyra.sync.peerTabs",
        JSON.stringify(msg.tabs.slice(0, MAX_TABS))
      );
      if (Services.prefs.getBoolPref("lyra.sync.applyTabs", false)) {
        this._openMissingTabs(msg.tabs);
      }
    }
    if (msg.bookmarks && Services.prefs.getBoolPref("lyra.sync.bookmarks", true)) {
      await this._mergeBookmarks(msg.bookmarks);
    }
  },

  _openMissingTabs(tabs) {
    const win = Services.wm.getMostRecentWindow("navigator:browser");
    if (!win?.gBrowser) {
      return;
    }
    const have = new Set(this.collectTabs().map(t => t.url));
    let n = 0;
    for (const tab of tabs) {
      if (!tab?.url || !isHttpsUrl(tab.url) || have.has(tab.url)) {
        continue;
      }
      win.gBrowser.addTab(tab.url, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        skipAnimation: true,
      });
      n += 1;
      if (n >= 10) {
        break;
      }
    }
  },

  async _mergeBookmarks(bookmarks) {
    this._mergeChain = this._mergeChain
      .catch(() => {})
      .then(() => this._mergeBookmarksLocked(bookmarks));
    return this._mergeChain;
  },

  async _ensureFolder() {
    let guid = Services.prefs.getStringPref("lyra.sync.folderGuid", "");
    if (guid) {
      try {
        const existing = await lazy.PlacesUtils.bookmarks.fetch(guid);
        if (existing && existing.type === lazy.PlacesUtils.bookmarks.TYPE_FOLDER) {
          return guid;
        }
      } catch (e) {}
      guid = "";
    }
    try {
      const tree = await lazy.PlacesUtils.promiseBookmarksTree(
        lazy.PlacesUtils.bookmarks.toolbarGuid
      );
      for (const child of tree.children || []) {
        if (child.title === FOLDER_TITLE && child.guid && !child.uri) {
          Services.prefs.setStringPref("lyra.sync.folderGuid", child.guid);
          return child.guid;
        }
      }
    } catch (e) {}
    const folder = await lazy.PlacesUtils.bookmarks.insert({
      parentGuid: lazy.PlacesUtils.bookmarks.toolbarGuid,
      type: lazy.PlacesUtils.bookmarks.TYPE_FOLDER,
      title: FOLDER_TITLE,
    });
    Services.prefs.setStringPref("lyra.sync.folderGuid", folder.guid);
    return folder.guid;
  },

  async _mergeBookmarksLocked(bookmarks) {
    const guid = await this._ensureFolder();
    const have = new Set();
    try {
      const tree = await lazy.PlacesUtils.promiseBookmarksTree(guid);
      const walk = node => {
        if (node.uri) {
          have.add(node.uri);
        }
        for (const child of node.children || []) {
          walk(child);
        }
      };
      walk(tree);
    } catch (e) {}
    let added = 0;
    for (const bm of bookmarks) {
      if (!bm?.url || !isHttpUrl(bm.url) || have.has(bm.url)) {
        continue;
      }
      try {
        await lazy.PlacesUtils.bookmarks.insert({
          parentGuid: guid,
          url: bm.url,
          title: bm.title || bm.url,
        });
        have.add(bm.url);
        added += 1;
      } catch (e) {}
      if (added >= 50) {
        break;
      }
    }
  },
};
