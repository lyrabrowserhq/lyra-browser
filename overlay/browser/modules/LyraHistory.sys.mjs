/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Local page-text index for richer history search, plus the query API
 * used by about:lyrahistory. Inspired by hister's full-text history
 * idea, but everything stays on the machine and indexing is opt-in.
 *
 * Prefs:
 *   lyra.history.index.enabled  - index page text on load (default false)
 *   lyra.history.index.maxEntries - index size cap (default 2000)
 */

const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { IOUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/IOUtils.sys.mjs"
);

const ENABLED_PREF = "lyra.history.index.enabled";
const MAX_ENTRIES_PREF = "lyra.history.index.maxEntries";
const TEXT_CAP = 8192;
const WRITE_DELAY_MS = 15000;

export const LyraHistory = {
  _index: null,
  _writeTimer: null,
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    ChromeUtils.registerWindowActor("LyraHistory", {
      parent: {
        esModuleURI: "resource:///modules/LyraHistory.sys.mjs",
      },
      child: {
        esModuleURI: "resource:///actors/LyraHistoryChild.sys.mjs",
        events: { DOMContentLoaded: {} },
      },
      messageManagerGroups: ["browsers"],
    });

    Services.obs.addObserver(this, "browser:purge-session-history");
  },

  observe() {
    this._index = new Map();
    this._writeSoon();
  },

  async _loadIndex() {
    if (this._index) {
      return this._index;
    }
    this._index = new Map();
    try {
      let data = await IOUtils.readJSON(
        PathUtils.join(PathUtils.profileDir, "lyra-history-index.json")
      );
      for (let [url, rec] of Object.entries(data)) {
        this._index.set(url, rec);
      }
    } catch {}
    return this._index;
  },

  _writeSoon() {
    if (this._writeTimer) {
      return;
    }
    this._writeTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._writeTimer.initWithCallback(
      () => {
        this._writeTimer = null;
        let obj = Object.fromEntries(this._index ?? []);
        IOUtils.writeJSON(
          PathUtils.join(PathUtils.profileDir, "lyra-history-index.json"),
          obj
        );
      },
      WRITE_DELAY_MS,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  },

  async _store(url, title, text) {
    if (!Services.prefs.getBoolPref(ENABLED_PREF, false)) {
      return;
    }
    let index = await this._loadIndex();
    index.delete(url);
    index.set(url, { t: title || "", x: text.slice(0, TEXT_CAP), v: Date.now() });
    let cap = Services.prefs.getIntPref(MAX_ENTRIES_PREF, 2000);
    while (index.size > cap) {
      index.delete(index.keys().next().value);
    }
    this._writeSoon();
  },

  async remove(url) {
    let index = await this._loadIndex();
    if (index.delete(url)) {
      this._writeSoon();
    }
    await PlacesUtils.history.remove(url);
  },

  snippet(text, query) {
    let pos = text.toLowerCase().indexOf(query.toLowerCase());
    if (pos < 0) {
      return "";
    }
    let start = Math.max(0, pos - 60);
    let end = Math.min(text.length, pos + query.length + 60);
    return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  },

  async search(query) {
    query = query.trim();
    if (!query) {
      return [];
    }
    let esc = query.replace(/[%_\\]/g, c => "\\" + c);
    let rows = await PlacesUtils.withConnectionWrapper("lyra-history", db =>
      db.executeCached(
        `SELECT p.url, p.title, MAX(v.visit_date) last_visit,
                p.visit_count, p.frecency
           FROM moz_places p
           JOIN moz_historyvisits v ON v.place_id = p.id
          WHERE p.url LIKE :q ESCAPE '\\'
             OR p.title LIKE :q ESCAPE '\\'
          GROUP BY p.id
          ORDER BY last_visit DESC
          LIMIT 200`,
        { q: `%${esc}%` }
      )
    );
    let seen = new Set();
    let results = rows.map(r => {
      seen.add(r.getResultByName("url"));
      return {
        url: r.getResultByName("url"),
        title: r.getResultByName("title"),
        visited: r.getResultByName("last_visit"),
        visits: r.getResultByName("visit_count"),
        snippet: "",
      };
    });
    let index = await this._loadIndex();
    for (let [url, rec] of index) {
      if (seen.has(url)) {
        continue;
      }
      let hay = `${rec.t}\n${rec.x}`;
      if (hay.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          url,
          title: rec.t,
          visited: rec.v * 1000,
          visits: 0,
          snippet: this.snippet(rec.x, query),
          indexed: true,
        });
      }
    }
    results.sort((a, b) => b.visited - a.visited);
    return results.slice(0, 300);
  },
};

export class LyraHistoryParent extends JSWindowActorParent {
  receiveMessage(msg) {
    if (msg.name != "LyraHistory:PageText") {
      return undefined;
    }
    let { url, title, text } = msg.data;
    if (typeof url != "string" || !url.startsWith("http")) {
      return undefined;
    }
    LyraHistory._store(url, title, String(text ?? ""));
    return undefined;
  }
}
