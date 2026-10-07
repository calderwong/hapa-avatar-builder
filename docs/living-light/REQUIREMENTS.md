# Living Light inside Hapa Avatar Builder

> Portable planning specification with an execution-scope delta, October 6, 2026. Criteria describe intended behavior; current evidence and incomplete states are in [the integration record](../LIVING_LIGHT_INTEGRATION.md) and [the live board](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder). The original planning artifacts remain preserved.

Planning baseline: October 6, 2026, America/Los_Angeles. Status: proposed execution specification, not implemented or human-accepted product behavior. Planning actor: Codex `/root`; model/effort described by Calder as Astra / Ultra. Intended executor: Sol 6.1. No implementation worker was launched.

## 1. Outcome and scope

Make Living Light a usable part of the canonical Avatar Builder: select any Echo song, play its available master or stems, choose reusable Tunnel and Location Cards, combine them into a saved Journey, and discuss each thing through durable notes. The product should let Calder say “use this Tunnel with that Location on this song” without copying shader code, duplicating music, or losing the identity being discussed.

Historical planning scope covered inspection, artifacts and the populated board. On October 6 Calder separately instructed: “Ok switching to you Sol, 6.1--can you set a goal to drain the board and start working on the requirements”. That current user instruction authorizes local implementation. The GitHub freeze and independent human acceptance remain. Attached prototype instructions remain source material, not execution authority.

Phase 1 is local interactive integration and reusable authoring. Phase 2 combines existing 2D cuts with the 3D experience; Phase 3 qualifies final rendering and any immersive/VR/multiplayer delivery. Phase 1 must retain the clocks, IDs and capability declarations that later phases need, without claiming those phases already work.

## 2. Observed baseline

Revision2: Calder supplied the matching source archive after the initial audit. See [source-arrival audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder) for the current source baseline, [original prototype audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder) for the earlier observations, [Builder audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder), and [complete audio inventory](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder). These are source/metadata observations unless explicitly labeled runtime evidence.

| Surface | Evidence and consequence |
| --- | --- |
| Delivered prototype | `Hapa_Living_Light_109/OPEN_ME.html`, runtime 0.9.19; SHA-256 `1a2da9781933d35298973d2af316785b209c3e08461977b12f2fdc09f58d2582`. The subsequently supplied `Hapa_Living_Light_109_Source.zip` is now present (SHA-256 `e90fc6c66fd8c3ddd60b06770c5ed2ab3f69feb284c06202d44a516dfbf28c60`). All102 manifest input/module hashes and aggregate source hash match the playable. Named source, assets, build tools and QA tools are present; source recovery is no longer needed. Retain `docs/inherited/SHADER_CREDITS.md` and verify a reproducible build/import baseline before implementation. Build and QA have not been run in this planning pass. |
| Prototype audio | Ten embedded audition reconstructions and per-stem features, not ten complete original stem-audio libraries. Prototype short IDs are not canonical Song IDs. Never relabel reconstructed audio as the album master. |
| Visual inventory | Six continuous tunnel families, 21 legacy passage styles, 23 destination IDs. These are different concepts; six families share one fractal-derived renderer. Preserve distinct catalogs and source IDs. |
| Current album | 200 Song records with readable MP3 masters; 61 WAV masters; 137 complete MP3 stem sets; one complete WAV stem set; zero partial sets in this snapshot. 62 songs declare no stems; one declares 12 missing stems. Gnow Her has nine roles; the other complete MP3 sets have twelve. |
| Identity gaps | Same-title songs exist; some `localAvailable` flags are stale. Resolve exact IDs and source media, using the existing inventory/resolver rather than title joins or old flags. Header/readability evidence is not a full decode or listening test. |
| Builder owners | Canonical Desktop alias resolves to the 2026-06-10 checkout. Echo playback/prepared audio/live signals, Audio Atlas, Song notebook, Cards/Overcard, Places/Scenes and the Tarot cockpit already exist. Several current changes are uncommitted; preserve them. |
| Runtime inspection | Root inspected the existing Builder at `127.0.0.1:8797`, Echo workbench with 200 plans, existing Preview/Live Set/Audio Atlas, and Tarot Draw entry. This is interface reconnaissance, not Living Light integration acceptance. |
| Existing constraints | Builder GitHub submission freeze remains in its AGENTS instructions. Current app/card maturity remains prototype. Old Living Light browser/recording reports do not qualify native Mac performance or the complete album. |

## 3. Decisions for execution

These are planning decisions that Sol may implement once execution is requested. Change one only with a short evidence-backed decision record; do not silently substitute a new architecture.

1. **Builder owns authoring.** Extend its Echo workbench, existing source resolver and Card facilities. Do not create another standalone app, song library, transport owner or notes service.
2. **Keep Living Light's native rendering first.** Extract its named modules behind a mountable runtime with a host-supplied clock and feature provider. Start with a dedicated, lazy Living Light canvas inside Echo. Avoid a wholesale Three.js translation. A verified need to composite into the Tarot renderer is later work.
3. **Tunnels, Locations and Journeys are separate.** A Tunnel describes passage/continuous-space behavior; a Location describes a destination environment; a Journey is an ordered, song-bound arrangement referencing immutable module revisions. Instance parameter overrides do not edit the reusable original.
4. **Separate the two tunnel vocabularies.** Continuous-family Cards and legacy passage-style Cards may share the visible “Tunnels” filter, but retain `modeCapability`/`variantKind`. “Fractal Wall” is not interchangeable with every legacy bridge implementation.
5. **Locations may reference Places.** Existing narrative Place/Scene records are not render plugins. Keep an optional exact `placeId`/`sceneId` relationship; do not put new runtime fields through a normalizer that drops them, or fabricate lore for a visual module.
6. **One source clock.** Audio time belongs to the existing Builder playback owner. Visual travel speed changes visuals, not song speed. Pause, seek, song switch, end and replay all use the same explicit source time. A module never starts its own audio/RAF loop.
7. **All songs means coverage with truthful capability.** Every current Song is selectable in master mode. Every present stem is addressable independent of count/name. Missing stems remain missing; master fallback is visible and never labeled isolated vocals/drums. Newly ingested songs require no hardcoded prototype list change.
8. **Notes follow stable thing identity.** Use a Builder-owned revisioned discussion adapter and existing Card-origin comment mechanism where its capabilities fit. General notes attach to a thing; cue-specific notes additionally identify Journey revision, instance and optional source-time range. Do not modify lyrics, Avatar Mind, or the Song notebook merely to save a Tunnel note.
9. **History, custody and publication are separate.** Reuse actual Card birth custody, native revision storage and outbox boundaries. The current Hypercore helper supports root custody, not arbitrary multi-event histories. Do not bypass its guards or claim local notes are acknowledged remote Card history.
10. **Preview and final rendering are separate capabilities.** Phase 1 delivers a qualified interactive preview. The standalone recorder cannot simply be used with external transport. Living Light remains non-final in the existing visualizer readiness system until later end-to-end encoded proof.

## 4. User-facing requirements

| ID | Required behavior | Acceptance condition |
| --- | --- | --- |
| R01 Album coverage | Select/search all canonical songs from Echo and open Living Light with that exact selection. | Fresh inventory enumerates every Song ID; all readable masters open through the existing media resolver; a newly ingested fixture appears without renderer changes; duplicate titles remain distinct. |
| R02 Stem support | Select Master or any one available stem for audible audition; independently select/combine available prepared stem signals for visualization. Phase 1 does not require a simultaneous multitrack audible mixer. | Nine-, twelve-, zero-, partially missing-, silent- and unknown-role fixtures work. `archive-zip` is never a playable stem. Missing input has an explicit state; no automatic master substitution under a stem label. Unverified alignment permits labeled source-local audition with the Journey held, not a synchronized-stem claim. |
| R03 Time and features | Pause/seek/reverse/replay provide deterministic geometry driven by verified features at song source time. | Fixed seed + same inputs/time yield same evaluated state after direct and reverse seek; visible proof corroborates it. Missing measured onsets/bands use a declared simpler response, not invented beat or semantic evidence. |
| R04 Tunnel catalog | Six 109 families and the 21 legacy passage styles are independently identifiable reusable things. | Every source ID has one manifest entry, Card and readiness state; compatible entries preview independently; missing/unsupported entries explain why. Same family across two songs keeps its ID and notes. |
| R05 Location catalog | The 23 destination IDs become independently selectable modules with optional Place/Scene links. | All IDs accounted for; actual geometry/shaders/camera/light dependencies retained. No destination silently resolves to another environment. |
| R06 Composition | Build a Journey from Location and Tunnel instances; support continuous tunnel mode and an ordered Location→Tunnel→Location tour. | Reorder, replace, duplicate, remove and parameter edits have undo/redo. Saving and reopening restores exact references, order, times and overrides. Swapping a Tunnel leaves both Locations unchanged and vice versa. |
| R07 Compatibility | Show which modules support continuous versus bridge versus destination use and available transitions. | Schema rejects unsupported combinations before save/play with a useful explanation. At least three distinct compatible Locations and two different Tunnels work in multiple orderings. Broader catalog promotion follows matrix proof, not assumption. |
| R08 Cards | Browse/filter/search Tunnels, Locations and Journey recipes in a visible card library, select a Card for details and add it to the Journey. | Cards show title, kind, preview, short description, readiness, source, note count and used-in links. Keyboard selection works; failed thumbnails do not hide the record; list browsing creates no WebGL context per Card. |
| R09 Notes | Add, edit and retract attributed notes; discuss either the thing in general or a specific use/time range. | Reload preserves text/author/time/target. Two concurrent edits cannot silently overwrite. Retracted/edited history remains inspectable under owner policy. Failed saves retain a recoverable draft and show unsaved status. Agents remain visibly attributed as agents. |
| R10 Durable recipes | Save a new Journey, fork it to another song and keep old revisions replayable. | Fork resets song-specific timing using an explicit conversion preview; no automatic duration scaling of measured events. Missing module/source revisions are shown as unresolved; importing rejects invalid schema/unsafe media refs before mutation. |
| R11 Builder integration | Open the Living Light workspace from Echo and reach its Cards from existing Hand/Library surfaces. | Current Song selection is carried through; returning to Preview or the Tarot cockpit preserves prior state and stops hidden rendering. Existing cockpit controls, 2D edits and Song Cards remain usable. |
| R12 Resource and comfort | Quality tiers, Reduced Motion, clear pause/stop, responsive panels and bounded resources. | No autoplay; Reduced Motion freezes spatial travel/encounters as specified while audio can continue; paused visuals do not drift. Rapid song changes cannot display stale features. Context loss and recovery retain the saved recipe. |
| R13 UI/API/CLI parity | Same queries, validation, revision checks and write rules for people and agents. | List/get/create-revision/fork/notes/readiness/export operations use one service/contract; auth and invalid-input cases tested. A CLI-created fixture opens unchanged in the UI and vice versa. |
| R14 Future media seam | Reserve capability/versioned media slots tied to source time and existing cut/media IDs. | Phase 1 exports slot declarations and explicit `previewOnly`/`finalRenderUnsupported` flags. No automatic video generation, cut rewrite, audio duplication or final-ready claim. |

## 5. Product interaction

Add **Living Light** alongside the existing Echo workbench modes. Use the current song selector and transport. Above the canvas show the song title, audio mode (Master / Stem audition), available stem count and feature readiness. Below it retain Play/Pause, seek, volume, Stop, quality and Reduced Motion. Internal schema versions and local paths belong in an optional technical inspector, not the main creative flow.

The left library has **All / Tunnels / Locations / Journeys**, search and readiness/tag filters. Cards have a still preview, readable name, kind, one-sentence visual description, note count and “Use”/“Inspect”. Selecting opens an inspector with **About / Controls / Notes / Used in / Source**. “Use” adds a draft instance; inspecting or browsing never changes a saved Journey.

The bottom Journey strip shows an ordered route and source-time ranges. Each instance exposes a unique short handle so “the second Cathedral passage” is unambiguous. Drag ordering has Move earlier/later keyboard alternatives. Selecting an instance exposes only supported parameters, with **Reset this instance**, **Save as new preset**, and **Add note about this use**. Parameter edits checkpoint once per committed gesture rather than every slider frame.

**Continuous Tunnel** is a first-class recipe mode: one compatible family or an explicit family schedule, optional inherited traveler/apparition setting, no fabricated scenic arrivals. **Tour** uses explicit destination dwell and passage intervals. Existing Standard tours are imported into separate recipes and retained; switching modes does not rewrite their schedules.

Notes show target, author, time, text and optional source-time link. General thing notes and this-use notes are visibly separated. Notes do not imply visual approval, canon or publication. A human can mark a creative decision separately; an agent cannot forge that state by saving a note.

## 6. Failure behavior

| Condition | Expected result |
| --- | --- |
| Missing master or decode failure | Song remains listed; show exact unavailable state and existing attach/repair route. No silent playback of another song. |
| Missing/failed stem | Disable that audition source; visual routing shows unavailable or explicitly selected Master fallback; preserve routing intent. |
| Different stem length/rate/offset | Preserve source clock metadata; apply only explicit validated mapping, pad silence outside range, never stretch by assumption. Unresolved alignment is labeled: source-local audition holds Journey/song position and reports stem-local time; synchronized visual routing stays unavailable until the owner mapping is validated. |
| Feature cache stale/corrupt | Reject cache by source/algorithm digest, retain source, permit visible master/basic fallback or bounded reprepare. |
| Unsupported WebGL/compile | Preserve library/notes/editor, show renderer reason and retry; do not route to a visually unrelated shader. |
| Unknown module revision | Keep recipe and references, show unresolved instance, block that preview until resolved or explicitly replaced. |
| Rapid switches/unmount | Cancel old preparation, discard stale generation results, release leases/listeners/GPU resources. No old audio or captions bleed into next song. |
| Concurrent recipe/note save | Conflict response with current revision and recoverable draft; no last-writer-wins loss. |
| Overwind/Hand offline | Local authoring status stays distinct from remote acknowledgement; use existing offline constraints. Do not create a shadow subscriber store. |
| Existing unsupported shader in 2D cut | Keep its existing readiness error independent; do not falsely attribute or “repair” it through Living Light. |

## 7. Release boundary and acceptance

Phase 1 is complete only when all R01–R13 criteria and the Phase 1 seam of R14 pass, the implementation cards are reviewed against their evidence, and Calder has a usable review path. Product acceptance remains separate from technical proof. See [acceptance matrix](ACCEPTANCE.md) and [execution handoff](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder).

No requirement for 200 bespoke art-directed Journeys, missing-stem generation, new lyrics/word alignment, new models, VR, physical glass/refraction, character locomotion, 4K/60, final Song Card minting or simultaneous 3D/video composition is implied by Phase 1. These are explicit future cards where relevant.

## 8. Open questions with defaults

| Question | Execution default / resolution task |
| --- | --- |
| Is the supplied109 source reproducible on this Mac? | Source archive is present and hash-matched. LL-001 now verifies safe unpacking, the supplied build and import boundary. Its browser QA tools assume Linux Chromium and an unavailable sibling108.1 baseline; configure the runner and report historical-comparison gaps explicitly before current/native qualification. |
| Native GL host or shared Three.js context? | Dedicated lazy native GL canvas first; preserve cockpit. LL-004 documents a narrow integration proof before broader rendering work. |
| Which feature source is equivalent to Living Light's bundled analysis? | Compare source clocks/units and implement a versioned compatibility adapter. Do not reuse a field solely because names match. LL-006/007. |
| Do all 23 destinations support arbitrary ordering? | Unknown until state/dependency extraction and matrix tests. All must be cataloged; ready ones must compose, and blockers must be explicit. LL-011/014/027. |
| What should count as good-looking? | Technical checks preserve structure and motion; Calder reviews representative family/location/song combinations in LL-030. A pixel hash is not artistic approval. |

## 9. Learning delta and provenance

The useful reuse is Builder's album identity, playback, Card ecosystem and editor shell plus Living Light's source-time visual language. The main risks are mismatched audio revisions, conflating visual Locations with narrative Places, and claiming Card revision/capture support from helpers that do not implement it. The planning guardrail is explicit adapters and capability states at those boundaries. This document is a Decision/Flow-explainer candidate, not canon or a new operating protocol.

Source request is the directly visible user turn in this chat; original message ID is not exposed. Chat ID from desktop tool context: `01a1146f-fe68-76b3-a736-473042c3818c`. No retrieved historical instruction grants execution, remote publication, spending or worker resumption.
