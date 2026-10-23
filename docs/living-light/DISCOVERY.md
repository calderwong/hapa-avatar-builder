# Living Light integration — discovery and owner map

Updated October 23, 2026. Local prototype; the sixteen-task integration goal,
including required LL-919–922 music response, is technically delivered. See the
[final audit](INTEGRATION_DELIVERY.md#october-23--final-amended-scope-delivery-audit)
and [music-response evidence](MUSIC_RESPONSE_PLAN.md#october-23--music-response-technical-acceptance).
Human creative acceptance remains pending; legacy broader qualification and
ordinary shader-cache recovery remain separate open board work.
Canonical application: **Hapa Avatar Builder → Echo Album → Living Light**.
This work extends the existing app and Song, Journey, Director and shared Hand
owners; it does not register a second app or media catalog.

## Scope and acceptance

The [Living Light board](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder)
owns task status and acceptance. Its original 40 tasks were extended to 49 by the
current integration work, then 53 with the four music-response tasks; the original [portable requirements](REQUIREMENTS.md),
[contracts](CONTRACTS.md) and [acceptance matrix](ACCEPTANCE.md) remain in force.
The additional LL-900-series tasks cover painting, Director/export, navigation
and modular interaction. A green subtask does not close its parent requirement.

| User intention | Existing implementation and evidence route | Remaining boundary |
| --- | --- | --- |
| Paint Hapa clips into tunnels and 3D features | [Current composition/delivery evidence](COMPOSITION_DELIVERY_ACCEPTANCE.md): exact clip uses, depth panels/portals, Fit/Fill/crop, trim/loop/hold, swaps and locks | Two enabled surfaces per recipe; arbitrary mesh UVs, physical refraction and VR are unqualified. |
| Place Living Light scenes and transitions in Director cuts | [Director cues](DIRECTOR_CUES.md), [202-song Album Pass](ALBUM_DIRECTOR_PASS.md), [encoded evidence](PAINT_PREVIEW_EXPORT_ACCEPTANCE.md) | Current restored visuals have a verified 25-second Landscape excerpt; older full/Vertical exports retain their renderer attribution. Final readiness remains per cut; whole-album creative/export review is open. |
| Visit album, media and Cards through 3D Locations | [Album navigation](ALBUM_NAVIGATION.md) and [native acceptance](MODULAR_NAVIGATION_ACCEPTANCE.md): exact destinations, painted travel, separate Explore clock and retained bookmark | Three-stop representative route; broad catalog/device qualification remains separate. |
| Swap modular Cards and scenes | [Modular acceptance](MODULAR_NAVIGATION_ACCEPTANCE.md): independent scene/media/recipe choices, locks, whole-recipe Undo, saved revisions and actual Tarot/Hand return | Undo is session-bounded; incompatible mappings refuse. Separate shared-package promotion and legacy parent acceptance remain open. |

Read the [integration history](../LIVING_LIGHT_INTEGRATION.md) for dated checkpoints.
Older pending/reload statements describe their dates, not today's runtime.
The [certified plan snapshot correction](../postmortems/2026-10-16-living-light-plan-snapshot-reuse.md)
records why the prior full encode was rejected and how equivalent replans now
preserve the certified bytes. No Song Card edition or human creative acceptance
is claimed by this discovery update. [Workflow pilot](../ECHO_WORKFLOW_PILOT.md)
records batch evidence; the live board remains the task-status owner.

For the full album, select **Direction script version → Living Light → Album
Pass** for the earlier comparison, or **Music Response** for the measured-motion
pass, then Preview / Record + Play. Each set covers 202 songs and 1,205 cues;
original cuts and recordings are preserved. Missing sources retain explicit
readiness. See [operator workflow and recovery](INTEGRATION_DELIVERY.md#operator-workflow-and-recovery).
The current final audit reuses the existing build and verifies a supervised idle
service refresh. No render is currently being awaited by this integration task.

## Related owners — consume evidence without transferring tasks

The existing [Builder board](http://127.0.0.1:5181/?project=hapa-app-hapa-avatar-builder)
retains these related tasks. Their current states must be read there; this
registration neither moves them nor claims their completion.

- `atlas-gap-visualizer-scope`: reconcile the separately proposed 3D Visualizer
  extension with this integration before claiming that proposal is fulfilled.
- `atlas-gap-stem-alignment`: [Audio Atlas per-stem timing](../audio-atlas/STEM_ALIGNMENT.md)
  owns measured offsets, drift and unresolved evidence. Readable files and
  aggregate reconstruction do not qualify each stem's clock.
- `atlas-gap-missing-media`: [missing-media reconciliation](../audio-atlas/MISSING_MEDIA.md)
  owns source recovery; [uploads](../audio-atlas/AUDIO_UPLOADS.md) use the existing
  Song/media intake. Living Light reports missing inputs and preserves fallback.

[Audio Atlas](../audio-atlas/README.md) remains the analysis owner. The
[Echo direction board](http://127.0.0.1:5181/?project=hapa-echo-music-video-direction)
retains `echo-epic-executable-visualizer-show-graph`; the
[Music Viz board](http://127.0.0.1:5181/?project=hapa-app-hapa-music-viz)
retains earlier telemetry/show-graph work. Those references are reuse leads,
not proof of this integration. Shared Card behavior stays with
[Overcard](../OVERCARD.md); existing Tarot Draw and Record Garden remain inherited
surfaces. Cross-board references do not become local dependency IDs.

## Registration checkpoint and reusable lesson

LL-033 addresses discoverability only. README, the existing integration guide
and the existing node manifest now route to this owner map and the portable
criteria. All historical manifest checkpoints are retained. Verification checks
local documentation targets, manifest identity and links, scoped source changes,
and Second Brain article readback; no application rebuild or render restart is
needed for these documentation-only inputs. The focused local commit is linked
from LL-033 after verification. The full operator walkthrough remains LL-031.

What worked: reuse the existing app registration and immutable evidence routes.
Correction: the manifest already contained a Living Light registration; its
stale foundation state was a discovery gap, not a missing app. Broad searches
through serialized evidence were noisy; direct owner/task references resolved
scope. Decision/Flow-explainer candidate: keep a compact current owner map ahead
of dated history so historical pending statements do not masquerade as live state.
Source: Codex/root chat `01a137cc-de1d-7511-ab65-227c92d5bca0`, Calder's continuing
integration request. No new identity, publication or creative approval is inferred.
