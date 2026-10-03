/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Lyra branding-specific prefs. Privacy defaults live in prefs/lyra.cfg.

pref("startup.homepage_override_url", "");
pref("startup.homepage_welcome_url", "about:lyrasetup");
pref("startup.homepage_welcome_url.additional", "");

pref("app.support.baseURL", "https://lyrabrowser.com/");
pref("app.feedback.baseURL", "https://lyrabrowser.com/");
pref("app.releaseNotesURL", "https://lyrabrowser.com/");
pref("app.releaseNotesURL.aboutDialog", "https://lyrabrowser.com/");
pref("app.update.url.manual", "https://lyrabrowser.com/");
pref("app.update.url.details", "https://lyrabrowser.com/");

// Mozilla in-app updater is compiled out (--disable-updater).
// Lyra notifies only when lyra.update.check is true. No auto-install.
pref("app.update.interval", 0);
pref("app.update.promptWaitTime", 0);
pref("app.update.checkInstallTime.days", 0);
pref("app.update.badgeWaitTime", 0);

pref("devtools.selfxss.count", 5);

pref("extensions.activeThemeID", "lyra-dark@lyrabrowser.com");
pref("browser.theme.toolbar-theme", 0);
pref("browser.theme.content-theme", 0);
pref("ui.systemUsesDarkTheme", 1);
