/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MigrationUtils } = ChromeUtils.importESModule(
  "resource:///modules/MigrationUtils.sys.mjs"
);
const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

const DONE_PREF = "lyra.firstrun.done";
const STEPS = ["welcome", "import", "privacy", "search", "theme", "done"];
let stepIndex = 0;

function $(id) {
  return document.getElementById(id);
}

function showStep(i) {
  stepIndex = i;
  for (let s of document.querySelectorAll("section")) {
    s.hidden = s.id !== "step-" + STEPS[i];
  }
  $("backButton").disabled = i === 0;
  $("nextButton").hidden = i === STEPS.length - 1;
  if (STEPS[i] === "search") {
    buildEngineList();
  } else if (STEPS[i] === "theme") {
    buildThemeList();
  }
}

function buildEngineList() {
  let list = $("engineList");
  list.replaceChildren();
  let current;
  try {
    current = Services.search.defaultEngine?.name;
  } catch {}
  Services.search.getEngines().then(engines => {
    for (let engine of engines) {
      let label = document.createElement("label");
      let input = document.createElement("input");
      input.type = "radio";
      input.name = "engine";
      input.checked = engine.name === current;
      input.addEventListener("change", () => {
        Services.search.setDefault(engine);
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(engine.name));
      list.appendChild(label);
    }
  });
}

function buildThemeList() {
  let list = $("themeList");
  list.replaceChildren();
  AddonManager.getAddonsByTypes(["theme"]).then(themes => {
    let ours = themes.filter(t => t.id.endsWith("@lyrabrowser.com"));
    let current = themes.find(t => t.isActive);
    for (let theme of ours) {
      let label = document.createElement("label");
      let input = document.createElement("input");
      input.type = "radio";
      input.name = "theme";
      input.checked = current && current.id === theme.id;
      input.addEventListener("change", () => theme.enable());
      label.appendChild(input);
      label.appendChild(document.createTextNode(theme.name));
      list.appendChild(label);
    }
  });
}

function initPrivacy() {
  let mode = Services.prefs.getStringPref("lyra.fingerprint.mode", "firefox");
  document.querySelector(
    `input[name="fingerprint"][value="${mode}"]`
  ).checked = true;
  for (let input of document.querySelectorAll('input[name="fingerprint"]')) {
    input.addEventListener("change", () => {
      Services.prefs.setStringPref("lyra.fingerprint.mode", input.value);
    });
  }
  let geo = Services.prefs.getStringPref("lyra.geo.mode", "");
  if (geo !== "block" && geo !== "spoof" && geo !== "ask") {
    geo = Services.prefs.getBoolPref("lyra.geo.block", true) ? "block" : "ask";
  }
  let geoInput = document.querySelector(`input[name="geo"][value="${geo}"]`);
  if (geoInput) {
    geoInput.checked = true;
  }
  for (let input of document.querySelectorAll('input[name="geo"]')) {
    input.addEventListener("change", () => {
      Services.prefs.setStringPref("lyra.geo.mode", input.value);
      Services.prefs.setBoolPref("lyra.geo.block", input.value === "block");
    });
  }
  for (let input of document.querySelectorAll("#privacyChecks input")) {
    let pref = input.dataset.pref;
    input.checked = Services.prefs.getBoolPref(pref, true);
    input.addEventListener("change", () => {
      Services.prefs.setBoolPref(pref, input.checked);
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  if (Services.prefs.getBoolPref(DONE_PREF, false)) {
    window.location.replace("about:home");
    return;
  }

  initPrivacy();

  $("importButton").addEventListener("click", () => {
    MigrationUtils.showMigrationWizard(window, {
      entrypoint: MigrationUtils.MIGRATION_ENTRYPOINTS.FIRSTRUN,
    });
  });

  $("backButton").addEventListener("click", () =>
    showStep(Math.max(0, stepIndex - 1))
  );
  $("nextButton").addEventListener("click", () =>
    showStep(Math.min(STEPS.length - 1, stepIndex + 1))
  );
  $("finishButton").addEventListener("click", () => {
    Services.prefs.setBoolPref(DONE_PREF, true);
    window.location.replace("about:home");
  });

  showStep(0);
});
