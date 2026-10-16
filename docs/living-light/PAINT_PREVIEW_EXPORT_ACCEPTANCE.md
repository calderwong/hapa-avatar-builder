# Painted preview, Director playback and encoded output acceptance

Status: technical criteria accepted for **LL-901, LL-913 and LL-903**, October 15,
2026. Source: Codex /root chat `01a137cc-de1d-7511-ab65-227c92d5bca0`.
The full integration goal and Calder's creative acceptance remain open.

This audit uses the original board criteria, not a reduced restatement. Current
source is `c2d8b47` plus unrelated owner changes that this audit does not modify.
The original 49 tasks remain intact. LL-901's dependencies LL-003/013/016 and
LL-913's dependency LL-911 are already Done. Accept LL-901 and LL-913 before
LL-903, whose dependencies are LL-901/911/913. No waiver is needed.

## LL-901 — painted Journey preview

| Original criterion | Authoritative evidence and scope |
| --- | --- |
| Exact cut/media/source time/crop/loop metadata preserved | `living-light-media.test.mjs` verifies cut/source collision rejection, window/loop/hold mapping and immutable owner reopen. Saved fit/crop survives source replacement and export. `living-light-framing.test.mjs` and twelve native pixel samples verify source rectangle orientation and Fit/Fill. See [framing](DIRECTOR_CUES.md#painted-fit-and-crop--october-14). |
| Pause/reverse/end and stale decode behavior; no different soundtrack | Current decoder tests exercise paused/backward seeks, terminal trim hold and refusal when a seek clamps to another time. Actual native media diagnostics reach the requested 2 s with muted, paused clips. Saved pilot plays through the one Echo master. Full encoded audio lineage and cleanup are verified below. |
| Portrait/landscape profiles and readiness visible | The existing Director Video orientation selector names the selected profile; its frame and resolution label follow that profile. `EchoLivingLightPreview` sizes the native canvas from that frame and exposes preparing/unavailable/Retry states. Native portrait preview, full Landscape output and corrected Vertical mixed output are inspected. This does not claim the unrelated Workspace has a new orientation selector. |
| Independent media/surface/Journey choices, exact saved identity and missing-source state | Production placement controls apply each surface separately; swapping a clip preserves the route and other surface, and compatible Thing replacement preserves placements. Incompatible surfaces refuse. Owner save/reopen retains exact revisions. Production controls prove swap/Undo/locks; missing or changed source declarations remain unresolved with no title fallback. Full-app combinations remain LL-917. |

Evidence: [painted contract](PAINTED_JOURNEY.md),
[framing checkpoint](../postmortems/2026-10-14-living-light-framing.md), source-chat
`framing/final-pixel-proof.json`, `framing/final-native-diagnostics.json`, and
`saved-painted-pilot/owner-proof.json` beneath `execution/living-light/`.

## LL-913 — Director preview and transition timing

| Original criterion | Authoritative evidence and scope |
| --- | --- |
| Master time drives native scene and painted video; entry/exit/seek/pause retain one soundtrack | `echo-living-light-preview.test.mjs` checks half-open cue evaluation, source offsets, backward seeks, stale-result rejection and exact media resolution. Native production-component proof observes play/pause and Scene → Tunnel → Location → ordinary media with one audio element/canvas. Real saved pilot reopens and plays its master. Actual encoded boundaries and master audio corroborate the shared clock. |
| Locations and passages render in Landscape and Vertical using selected profile | Native preview receives the Director's real frame shape. Full managed Landscape and short mixed Vertical files show the portal, native tunnel and arrival; Vertical ordinary media uses canonical editor reframing. No Square/4K/60-fps qualification is implied. |
| Short transitions explicitly supported or clearly refused; no silent acceleration | Shared cue validation requires equal Song/Journey windows and a complete authored passage. The existing editor shows the refusal for a truncated passage; cue tests reject duration changes and partial passages. The native recipe minimum remains 4 s. Saved pilot's complete 8 s passage remains 8 s in both encoded profiles. No new short-treatment algorithm is claimed. |
| Bounded preparation/disposal; unavailable scenes show actionable readiness | Preview retains only current/next metadata and one active renderer, cancels stale asynchronous work and cleans graphics/cache on exit. Tests cover failed creation/draw and late reads. Native proof observes missing-revision status, explicit Retry and leave/return; export receipts return to baseline with no owned audio contexts or loops. |

Evidence: [native playback](DIRECTOR_CUES.md#native-director-playback-checkpoint--october-14),
source-chat `director-playback/browser-proof.json`, saved pilot owner proof and
the encoded artifacts below. Component evidence and actual album evidence are
identified separately; neither is presented as a full-app modular session.

## LL-903 — actual encoded mixed output

| Original criterion | Authoritative evidence and scope |
| --- | --- |
| Correct source audio, no drift/duplication and explicit lifecycle | Existing export owner muxes one exact master soundtrack; source videos remain muted. Full Landscape has one stereo 48 kHz AAC track and 0.995645 source correlation at zero best lag. Vertical has one such track and 0.998760 correlation at zero offset. Parent/worker cancellation and cleanup proofs retain bounded ownership. This proves the supplied master/export path, not live microphone or system-audio recording. |
| Encoded frames/dimensions/timestamps/audio inspected against exact source | Full managed master: 4,910 frames, 1920×1080/30 fps, 163.666667 s. Short Vertical: 660 frames, 1080×1920/30 fps, 22 s. Actual file probes, decoded pictures and source/master hashes were inspected; this audit rehashes both masters. |
| Mint/publication gates retained; no unqualified 4K/60 promise | Managed Landscape candidate is ready-for-mint-review with edition 1 unchanged. No mint occurred. Existing release validation still binds exact candidate, source, renderer and artifact. Profile policy makes no Square/4K/60 claim. |
| Short ordinary/native cut, single audio, exact cue boundaries and source identity | Corrected Vertical has ordinary footage around Scene frames 60–299 and Transition frames 360–599: 480 native frames. Frame timestamps and decoded source/output audio pass; exact snapshot, all 48 media cards and both cues survive. Original source inputs remain unchanged. |
| Explicit Landscape/Vertical policy; readiness only for verified output | Full managed Landscape and short mixed Vertical are the qualified scopes. Profile mismatch rejects; changing profile changes show identity, and stale Landscape compiler proof cannot admit Vertical. Release inspectors accept the actual Vertical file and reject it when asked for Landscape. Full-song Vertical is not an added requirement. |

Evidence: [full managed pilot](../postmortems/2026-10-15-living-light-final-pilot.md),
[portrait qualification](../postmortems/2026-10-15-living-light-portrait-export.md),
source-chat `final-pilot/inspection.json` and `portrait-export/reframed/inspection/`.
Their original failed/limited predecessors remain preserved.

## Current verification and retained work

All **58 focused checks** pass across media, framing, Director preview, cue,
prepared-export and output-profile suites, with process baseline restored.
Native/render/build evidence is reused because this audit changes no runtime
code or source inputs. It does not claim a newly clean full repository suite;
the previously recorded unrelated data-inventory failure is unchanged.
Exact original criteria, dependency status and fresh master hashes are in the
source-chat `acceptance-paint-preview-export/acceptance.json`.

LL-912 full-app proposal/save/reopen, LL-914 exact lookup acceptance, LL-915/916
navigation and shared Hand return, LL-917 integrated swaps/locks/recovery and
LL-918 complete pilot delivery stay open. Audio-bound export remains explicitly
refused until its real prepared bank is qualified. No original criterion is
removed and no broader goal completion or human creative approval is inferred.

Learning checkpoint: previous implementation and render checkpoints accumulated
valid evidence while task status stayed open. The useful correction is to map
that evidence to each original criterion and dependency, then close only those
tasks. Repeated full renders or extra scope would not strengthen this decision.
This is a Lesson/Decision Card candidate attributed to the source chat, not a new
general protocol or claimed throughput improvement. Active implementation and
verification minutes were not measured.
