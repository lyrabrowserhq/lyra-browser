/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Lyra OpenSearch helpers.
 *
 * Watches OpenSearchManager offers per browser, prompts once per engine to
 * install it, and backs the tab context menu item that installs an offered
 * engine and makes it the default.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OpenSearchManager:
    "moz-src:///browser/components/search/OpenSearchManager.sys.mjs",
  SearchUIUtils:
    "moz-src:///browser/components/search/SearchUIUtils.sys.mjs",
});

const DISMISSED_PREF = "lyra.search.installDismissed";
const l10n = new Localization(["browser/lyra.ftl"], true);

class LyraOpenSearchImpl {
  #prompted = new WeakMap();
  #initialized = false;

  init() {
    if (this.#initialized) {
      return;
    }
    this.#initialized = true;
    Services.obs.addObserver(this, "lyra-opensearch-offered");
  }

  observe(subject) {
    let win = subject?.ownerGlobal ? subject.ownerGlobal : subject;
    try {
      this.maybePrompt(win);
    } catch (e) {
      console.error("LyraOpenSearch prompt failed", e);
    }
  }

  getOfferedEngine(tab) {
    if (!tab?.linkedBrowser) {
      return null;
    }
    let engines = lazy.OpenSearchManager.getEngines(tab.linkedBrowser);
    return engines?.length ? engines[0] : null;
  }

  getDismissed() {
    try {
      return JSON.parse(Services.prefs.getStringPref(DISMISSED_PREF, "[]"));
    } catch {
      return [];
    }
  }

  markDismissed(title) {
    let dismissed = this.getDismissed();
    if (!dismissed.includes(title)) {
      dismissed.push(title);
      Services.prefs.setStringPref(DISMISSED_PREF, JSON.stringify(dismissed));
    }
  }

  maybePrompt(win) {
    let browser = win?.gBrowser?.selectedBrowser;
    if (!browser) {
      return;
    }
    let offered = lazy.OpenSearchManager.getEngines(browser);
    if (!offered?.length) {
      return;
    }
    let dismissed = this.getDismissed();
    let seen = this.#prompted.get(browser) || new Set();
    this.#prompted.set(browser, seen);
    for (let engine of offered) {
      if (dismissed.includes(engine.title) || seen.has(engine.title)) {
        continue;
      }
      seen.add(engine.title);
      this.#showPrompt(win, browser, engine);
      break;
    }
  }

  async #showPrompt(win, browser, engine) {
    let [message, addLabel, dismissLabel] = await l10n.formatValues([
      { id: "lyra-search-offer-message", args: { engine: engine.title } },
      "lyra-search-offer-add",
      "lyra-search-offer-dismiss",
    ]);
    win.PopupNotifications.show(
      browser,
      "lyra-search-offer",
      message,
      "urlbar",
      {
        label: addLabel,
        accessKey: "A",
        callback: () => {
          lazy.SearchUIUtils.addOpenSearchEngine(
            engine.uri,
            engine.icon,
            browser.browsingContext
          );
        },
      },
      [
        {
          label: dismissLabel,
          accessKey: "N",
          callback: () => this.markDismissed(engine.title),
        },
      ],
      {
        removeOnDismissal: true,
        hideClose: false,
        eventCallback: state => {
          if (state === "dismissed") {
            this.markDismissed(engine.title);
          }
        },
      }
    );
  }

  async setDefaultFromTab(tab) {
    let engine = this.getOfferedEngine(tab);
    if (!engine) {
      return;
    }
    let added = await lazy.SearchUIUtils.addOpenSearchEngine(
      engine.uri,
      engine.icon,
      tab.linkedBrowser.browsingContext
    );
    if (!added) {
      return;
    }
    let installed = Services.search.getEngineByName(engine.title);
    if (installed) {
      await Services.search.setDefault(installed);
    }
  }
}

export const LyraOpenSearch = new LyraOpenSearchImpl();
