# Living Light first-entry renderer lifecycle repair

Status: repaired and verified for the saved pilot; wider lifecycle qualification
remains open. Requirements LL-012 and LL-916 remain in progress.
Attribution: Codex/root, chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.

## Trigger and diagnosis

Opening the saved prepared-audio pilot directly in Living Light repeatedly
terminated the app tab. Opening Living Light on an adjacent song before selecting
the pilot worked. The previous [native-stack follow-up](2026-10-16-living-light-native-visuals.md)
preserves both observations; its first-entry gap is addressed by this repair.

A new cold entry failed with audio paused at zero and the Director scene inactive.
Leaving Preview through Tracks first also failed, so simply separating Preview
teardown from Workspace entry was insufficient. A temporary diagnostic that
skipped native graphics allowed all editors and prepared-source reads to settle.
Enabling the native renderer afterward succeeded. The diagnostic switch and
button were removed; ordinary entry still creates the native preview automatically.

Inspection found avoidable renderer invalidations during initial hydration:
the registry provider created a new registry for equivalent owner responses,
and arriving audio measurements invalidated even a neutral study. Each
invalidation disposed and recreated the native graphics stack. This is a
confirmed lifecycle defect. The browser's low-level termination reason was not
available; no specific driver, out-of-memory or platform fault is claimed.

## Correction and reuse

The existing registry provider now retains one effective registry for equivalent
source, head, pinned-revision and visibility inputs. Note and custody metadata
continue updating separately. Changed presets, retained historical revisions,
visibility and source registries still invalidate it, and invalid input still
passes through the existing validation. Only the last result is memoized.

The existing Workspace preparation effect now observes measurement fingerprints
only when prepared response is selected and exploration is inactive. Neutral
studies keep their renderer when unused measurements arrive. Selecting prepared
response still prepares its exact input. No new renderer, player, loading delay,
owner store or replacement UI was introduced.

## Evidence and limits

- Three normal fresh pilot entries succeeded, each at generation 1 with one
  native canvas, all 14 visual installers, no view-owned audible context, no
  pending paused frame and no preview failure.
- Reloading unchanged saved presets retained generation 1.
- Study this recipe resolved both exact painted sources and rendered the Tidal
  Observatory water/wind/stage scene. The portal was required and ready; the
  next wall clip was resident and ready. The full scene was visually inspected.
- Switching to prepared response reported exact asset port response and a
  measured energy binding. The source master is silent at the tested zero-time
  frame; silence was measured, not substituted for unavailable data.
- All 39 focused preset, registry, preview-driver, Director-preview and media
  residency checks passed. The production build and owned process teardown pass.
- All 41 prior cuts and prior Journey payloads remain unchanged, including the
  other two cues and painted-media route. No edition or publication changed.

Private evidence in the source chat workspace: `stable-entry-first.json`,
`stable-entry-second.json`, `stable-entry-third.json`, `stable-entry-refresh.json`,
`stable-entry-painted.json`, `stable-entry-prepared.json/.png`, and
`stable-entry-focused-tests.log` with its process receipt. Earlier diagnostic
build receipts retain the experiment history; their temporary switch is absent
from source and final build. Broad checks from the prior native-stack batch are
historical reused evidence; no fresh full-suite claim is made here.

Short encoded proof for the restored visuals, complete passage compatibility,
Celestial figure loading, the full lifecycle matrix and human creative review
remain open. Three successful entries do not prove every lifecycle scenario.

Lesson candidate: treat effective registry identity and actually selected signal
inputs as graphics lifecycle inputs. Metadata freshness and unused measurements
must not imply a new graphics generation. Controlled isolation was useful;
repeated broad source scans without a discriminating experiment were not.
