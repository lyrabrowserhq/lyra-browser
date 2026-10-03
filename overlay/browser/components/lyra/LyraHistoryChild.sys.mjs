/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class LyraHistoryChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type != "DOMContentLoaded") {
      return;
    }
    if (!Services.prefs.getBoolPref("lyra.history.index.enabled", false)) {
      return;
    }
    let doc = this.contentWindow?.document;
    if (!doc || !this.isTopLevel) {
      return;
    }
    if (this.browsingContext?.usePrivateBrowsing) {
      return;
    }
    let url = doc.location?.href;
    if (!url || !url.startsWith("http")) {
      return;
    }
    let text = doc.body?.textContent || "";
    text = text.replace(/\s+/g, " ").trim().slice(0, 8192);
    if (!text) {
      return;
    }
    this.sendAsyncMessage("LyraHistory:PageText", {
      url,
      title: doc.title || "",
      text,
    });
  }
}
