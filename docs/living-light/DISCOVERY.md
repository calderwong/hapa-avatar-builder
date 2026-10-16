# Living Light integration — discovery and owner map

Updated October 16, 2026. Prototype; the complete integration remains in progress.
Canonical application: **Hapa Avatar Builder → Echo Album → Living Light**.
This work extends the existing app and Song, Journey, Director and shared Hand
owners; it does not register a second app or media catalog.

## Scope and acceptance

The [Living Light board](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder)
owns task status and acceptance. Its original 40 tasks were extended to 49 by the
current integration work; the original [portable requirements](REQUIREMENTS.md),
[contracts](CONTRACTS.md) and [acceptance matrix](ACCEPTANCE.md) remain in force.
The additional LL-900-series tasks cover painting, Director/export, navigation
and modular interaction. A green subtask does not close its parent requirement.

| User intention | Existing implementation and evidence route | Remaining boundary |
| --- | --- | --- |
| Paint Hapa clips into tunnels and 3D features | [Painted Journey](PAINTED_JOURNEY.md): exact clip uses, depth surfaces, trim/loop/hold, swaps and locks | Full integrated native/resource acceptance remains open. |
| Place Living Light scenes and transitions in Director cuts | [Director cues](DIRECTOR_CUES.md): saved exact Journey revisions, editing, proposals, native preview and managed export path | The saved full-song pilot is undergoing a local render retry; successful encoding alone is not release acceptance. |
| Visit album, media and Cards through 3D Locations | [Album navigation](ALBUM_NAVIGATION.md): owner-bound destinations, passage edges and independent bookmarks; LL-915 accepted | Native traversal and decoder residency acceptance remain open in LL-916. |
| Swap modular Cards and scenes | [Card Library](CARD_LIBRARY.md), [shared Hand](SHARED_HAND.md), [authoring](AUTHORING_IMPLEMENTATION.md) | Full shared-Hand round trip, proposal integration and parent acceptance remain open. |

Read the [integration history](../LIVING_LIGHT_INTEGRATION.md) for dated checkpoints.
Older pending/reload statements describe their dates, not today's runtime.
The [certified plan snapshot correction](../postmortems/2026-10-16-living-light-plan-snapshot-reuse.md)
records why the prior full encode was rejected and how equivalent replans now
preserve the certified bytes. No Song Card edition or human creative acceptance
is claimed by this discovery update. [Workflow pilot](../ECHO_WORKFLOW_PILOT.md)
records batch evidence; the live board remains the task-status owner.

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
