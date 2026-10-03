# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

aboutDialog-title =
    .title = About { -brand-full-name }

releaseNotes-link = Release notes

update-checkForUpdatesButton =
    .label = Check for updates
    .accesskey = C

update-updateButton =
    .label = Restart to update { -brand-shorter-name }
    .accesskey = R

update-checkingForUpdates = Checking for updates...
settings-update-checking-for-updates =
    .label = Checking for updates...

## Variables:
##   $transfer (string) - Transfer progress.

settings-update-downloading-2 =
    .label = Downloading update: { $transfer }
aboutdialog-update-downloading = Downloading update: <label data-l10n-name="download-status">{ $transfer }</label>

##

update-applying = Applying update...
settings-update-applying =
    .label = Applying update...

update-failed = Update failed. <label data-l10n-name="failed-link">Download the latest version</label>
update-failed-main =
    Update failed. <a data-l10n-name="failed-link-main">Download the latest version</a>

update-policy-disabled = Updates disabled
settings-update-policy-disabled =
    .label = Updates disabled
update-noUpdatesFound = { -brand-short-name } is up to date
settings-update-no-updates-found =
    .label = { -brand-short-name } is up to date
aboutdialog-update-checking-failed = Failed to check for updates.
settings-update-checking-failed =
    .label = Failed to check for updates.
update-otherInstanceHandlingUpdates = { -brand-short-name } is updating in another instance
settings-update-other-instance-handling-updates =
    .label = { -brand-short-name } is updating in another instance

## Variables:
##   $displayUrl (String): URL to page with download instructions.

aboutdialog-update-manual-with-link = Updates: <label data-l10n-name="manual-link">{ $displayUrl }</label>
settings-update-manual-with-link = Updates: <a data-l10n-name="manual-link">{ $displayUrl }</a>

update-unsupported = No further updates on this system. <label data-l10n-name="unsupported-link">Details</label>
settings-update-unsupported = No further updates on this system. <a data-l10n-name="unsupported-link">Details</a>

update-restarting = Restarting...
settings-update-restarting =
    .label = Restarting...

update-internal-error2 = Could not check for updates. Available at <label data-l10n-name="manual-link">{ $displayUrl }</label>
settings-update-internal-error = Could not check for updates. Available at <a data-l10n-name="manual-link">{ $displayUrl }</a>

##

# Variables:
#   $channel (String): description of the update channel
aboutdialog-channel-description = Update channel: <label data-l10n-name="current-channel">{ $channel }</label>

warningDesc-version = { -brand-short-name } is experimental.

aboutdialog-help-user = { -brand-product-name } help
aboutdialog-submit-feedback = Feedback

community-exp = <label data-l10n-name="community-exp-mozillaLink">{ -vendor-short-name }</label>
community-2 = { -brand-short-name } by <label data-l10n-name="community-mozillaLink">{ -vendor-short-name }</label>
helpus = <label data-l10n-name="helpus-donateLink">lyrabrowser.com</label>

bottomLinks-license = License
bottom-links-terms = Terms
bottom-links-privacy = Privacy

# Variables:
#   $version (String): version of Firefox, e.g. 66.0.1
#   $bits (Number): bits of the architecture (32 or 64)
aboutDialog-version = { $version } ({ $bits }-bit)

# Variables:
#   $version (String): version of Firefox for Nightly builds, e.g. 66.0a1
#   $isodate (String): date in ISO format, e.g. 2019-01-16
#   $bits (Number): bits of the architecture (32 or 64)
aboutDialog-version-nightly = { $version } ({ $isodate }) ({ $bits }-bit)

# Variables:
#   $version (String): version of Firefox, e.g. 66.0.1
#   $arch (String): name of the architecture (arm, aarch64, etc.)
aboutdialog-version-arch = { $version } ({ $arch })

# Variables:
#   $version (String): version of Firefox for Nightly builds, e.g. 66.0a1
#   $isodate (String): date in ISO format, e.g. 2019-01-16
#   $arch (String): name of the architecture (arm, aarch64, etc.)
aboutdialog-version-arch-nightly = { $version } ({ $isodate }) ({ $arch })
