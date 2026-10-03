// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Load Lyra autoconfig from the application directory.
// Sandbox is off so lyra.cfg can apply fingerprint modes and load lyra-overrides.cfg
// the same way LibreWolf loads librewolf.overrides.cfg.

pref("general.config.filename", "lyra.cfg");
pref("general.config.obscure_value", 0);
pref("general.config.sandbox_enabled", false);
