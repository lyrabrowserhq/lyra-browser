# Patches

Lyra prefers file copies over a long patch series. `scripts/apply-overlay.sh` copies branding, then does small edits to:

- `browser/confvars.sh`
- `browser/app/distribution/moz.build`
- `browser/app/moz.build`

The diffs in this directory document intent. They may fail after an ESR major bump. If `patch(1)` rejects, the overlay script replacements are the path to use.

Never patch Mozilla official branding in place. Add `browser/branding/lyra`.
