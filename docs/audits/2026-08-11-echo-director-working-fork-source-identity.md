# Echo Director working-fork source identity

## Objective

Allow an edited Director working copy to save as a new append-only cut while retaining the guard against a genuinely changed source cut.

## Evidence

The selected-cut API can runtime-repair unavailable shader metadata before returning the editable projection. The prior client hashed that repaired projection as its `expectedParentFingerprint`; the fork endpoint correctly compares against the immutable on-disk source, so it rejected the save as stale.

## Change and guardrail

Hydrated variants now carry an out-of-band canonical `source_fingerprint`. Working forks use that identity, and fingerprinting excludes the delivery-only field. The server still compares the request against its recomputed persisted-source fingerprint, so source edits made after a fork begins remain a `409 parent_variant_changed` conflict rather than being overwritten.

## Verification

`node --test tests/echo-direction-variants.test.mjs tests/echos-api-payload.test.mjs tests/echo-direction-variant-ui.test.mjs` passes, including a runtime-repaired-fork regression and API round trip. `npm run build:check` passes.
