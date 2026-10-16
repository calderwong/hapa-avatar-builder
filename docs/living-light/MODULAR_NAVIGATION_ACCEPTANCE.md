# Modular album navigation acceptance

2026-10-16 · Technical acceptance of LL-916 and LL-917 only.
Source: Codex /root, chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.
Human creative acceptance and the broader release tasks remain open.

The user prioritized Director coverage across the full album. All 202 saved
Album Pass variants remain available. This audit verifies the shared editing
and navigation mechanics; it does not claim a watch-through of 202 songs or
resume renderer polishing. Source checkpoint `9b57e32` includes reversible recipe
replacement; this acceptance batch also corrects two obsolete export captions.

## LL-916: guided and Explore navigation

| Original criterion | Evidence and result |
| --- | --- |
| Enter, travel a painted tunnel, land and inspect/add an existing media or Card target from the three-location map. | Current full Builder enters the saved 11:23 route, traverses the complete Fractal Loom passage with visible wall video, lands at the second Tidal stop and resolves Deevid Video 1675562. The final Resonance stop opens the exact Media Weave Card inspector. The stops are three distinct uses, with Tidal reused. Existing shared actions and verified persistent Journey Hand placement are reused, not a new Card store. |
| Follow Director uses song time; Explore has its own clock and explicit song/cut handoff. | At paused song time 14 seconds, Follow Director displays travel to Tidal from the exact saved transition cue. Explore travels separately while the song remains paused. Opening the first stop explicitly loads the historical 2 A.M. Lights performance cut despite its newer Album Pass; Return restores the original `living-light-album-pass-v1`. |
| Back, Home, direct jump, keyboard and reduced motion; exact bookmark and draft return. | Native Back returns to the middle stop, Home exposes the first Fractal connection, Direct jump reaches Resonance. Keyboard activation with Hold visual motion reaches the next stop without travel animation. Returning to the song preserves 14 seconds. The full Tarot/Hand visit retains an unsaved title and selected Fractal use; temporary edits are undone before finishing. Existing excursion regression covers dirty cuts, nested selection, canceled/stale requests and refusal to discard destination edits. |
| Only current/next required resources; abandoned transitions release resources. | Current arrival diagnostics show both painted clips nonresident, paused and not required; zero view-owned audio contexts, no pending paused frames or driver failure. Eight residency checks cover forward/reverse native phases, abandoned jumps, stale callbacks, inactive gaps and disposal. Eleven Director-preview checks cover current/next exact recipe reads, bounded renderer retention, cancellation and failed preparation. Prior native lifecycle evidence records ten real component unmounts with all observed allocations released. |

## LL-917: modular swaps and recovery

| Original criterion | Evidence and result |
| --- | --- |
| Independently swap media, tunnel, Location and Journey without losing unrelated choices. | Saved modular-pilot readback verifies independent Location/tunnel swaps with unchanged schedule and unaffected wall media. Subsequent distinct-video swap verifies preserved portal framing, trim, loop, other surface and other Director cue pins. Current full-app Hand return opens a different saved Journey revision after explicit comparison; one Undo restores the edited original, its selected passage and save identity. |
| Locks, explicit incompatible-change refusal and one-step Undo. | Current media/native-tour/editor checks cover protected uses and adjacent endpoints, incompatible surface/song/range inputs and atomic cue edits. Commit `9b57e32` fixes whole-recipe replacement history. Live lock → new tour → Undo restores the original lock, selection and Save new revision action; Redo and final cleanup also pass. History remains a bounded in-tab feature, not cross-reload Undo. |
| Exact pins and recoverable concurrent conflicts. | The Hand opens historical Journey revision `ll-journey-r:c90d3696d0460ba42cc71ac7f08f7bd4`, retaining verified root custody despite later revisions. Record navigation likewise opens its exact old performance cut. Independent store clients reject competing revisions; save-after-Undo targets the original Journey owner, refuses stale revision writes and leaves the draft available. |
| Save/reopen and existing Hand/Card round trip preserve source ownership and identity. | Prior real-owner saved-swap proofs retain all then-existing cuts and Journey payloads. Store restart and historical Hand tests verify exact pins/root custody. Current full App goes Echo → Tarot Draw → Header-held Journey → exact inspector, retaining dirty recipe title, selected use and paused 14-second song. Opening the Card in the editor presents comparison; replacement and Undo work, and the final editor is back on the clean original. No new album recipe, Card placement, mint or publication was needed for this check. |

## Evidence and limits

Current focused suites pass **74 checks**: 41 modular/store/Hand, 22
navigation/media-residency, and 11 Director-preview checks. Production build
passes and its bounded process owner returns to baseline. Browser control
timeouts were reconciled from fresh native state before continuing; they did
not establish an application crash. The initial record-return DOM read preceded
audio remount and contained no audio element; the later native read shows
Audio ready, Play Show and a 14-second slider. It is the final clock evidence.

Source-chat evidence under `execution/living-light/album-director-pass/`:

- `modular-acceptance-tests.log`, `navigation-acceptance-tests.log`,
  `navigation-scene-residency-tests.log`, `hand-return-build.log.receipt.json`.
- `hand-tarot-return.json`, `hand-tarot-away.png`, `hand-tarot-restored.png`:
  actual full-App historical Card return and temporary edit cleanup.
- `navigation-travel.png`, `navigation-arrival.json`,
  `navigation-director-proof.json`: painted travel, released media, shared clock.
- `navigation-exact-record.txt`, `navigation-record-return-ready.txt`,
  `navigation-record-return.png`: older cut selection and completed return.
- `recipe-undo-native.txt`, `recipe-undo-restored.png`: complete recipe Undo.

Reused evidence: `../modular-pilot/verification.json`,
`../hand-roundtrip/swap-verification.json`, `hand-verification.json`, and
`../audio-bound-pilot/native-lifecycle-verification.json`. Their scope remains
unchanged; aggregate file-preservation evidence for the later album pass is in
[the album-pass record](ALBUM_DIRECTOR_PASS.md). This acceptance does not promote
the separate Hand-creation package candidate, qualify every hardware/profile,
or certify every album export. Final export remains a per-cut readiness decision.
