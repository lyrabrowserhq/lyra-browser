/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { LyraHistory } = ChromeUtils.importESModule(
  "resource:///modules/LyraHistory.sys.mjs"
);

const INDEX_PREF = "lyra.history.index.enabled";
let debounce = null;

function render(results) {
  let list = document.getElementById("results");
  list.replaceChildren();
  for (let r of results) {
    let li = document.createElement("li");
    let a = document.createElement("a");
    a.href = r.url;
    a.textContent = r.title || r.url;
    li.appendChild(a);
    let meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent =
      new Date(r.visited / 1000).toLocaleString() +
      (r.indexed ? " · indexed" : "");
    li.appendChild(meta);
    if (r.snippet) {
      let sn = document.createElement("div");
      sn.className = "snippet";
      sn.textContent = r.snippet;
      li.appendChild(sn);
    }
    let url = document.createElement("div");
    url.className = "url";
    url.textContent = r.url;
    li.appendChild(url);
    list.appendChild(li);
  }
}

function runSearch() {
  let q = document.getElementById("q").value;
  LyraHistory.search(q).then(render);
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("q").addEventListener("input", () => {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(runSearch, 200);
  });
  let toggle = document.getElementById("indexToggle");
  toggle.checked = Services.prefs.getBoolPref(INDEX_PREF, false);
  toggle.addEventListener("change", () => {
    Services.prefs.setBoolPref(INDEX_PREF, toggle.checked);
  });
});
