# Echo preview quality

Status: locally verified component of the open Echo A1 requirement batch (September 8, 2026). Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

Open Echo → Director Workbench → select a song/cut → Preview. The Preview quality fieldset provides presets and independent controls:

| Preset | Shader resolution | Shader layers | Prepared media maximum dimension |
| --- | --- | --- | --- |
| Full detail (default) | 100% | All scheduled | 1280 px |
| Balanced | 75% | Up to 4 | 960 px |
| Responsive | 50% | Up to 2 | 640 px |

Changing any individual setting marks the preset Custom. Layer limits retain the first scheduled layers. These are temporary viewing preferences; they do not rewrite the saved cut. Shader resolution changes rebuild effect history, while audio keeps its place. Lyrics retain their canonical output geometry and are composited at the normal preview size. Controls are disabled while starting or making a quick recording.

Use **Prepare selected-cut preview** to create video derivatives for a different media size. Preparation uses the existing cancellable job owner, includes size in cache identity, verifies original identity and reuses valid cached files. Until the selected size is ready, source media remains in use. Still images choose existing suitable renditions; this control does not generate missing still derivatives. Returning to a previously prepared size reuses its matching job. Final render uses the saved cut and original media; quick recordings capture the current preview appearance.

The existing preparation API accepts `maximumDimension=640|960|1280` on `/api/echos/director-preview/prepare`; default is 1280 and invalid values return 422. The existing selected-cut proof CLI accepts `--maximum-dimension=640|960|1280`. UI, API and source need the same build; the validation used an isolated API and did not restart the operator's existing app.

The preview shader pool shares one 128 MiB checkpoint budget across its surfaces. Eviction removes reconstructible checkpoints and preserves native float values and active GPU state. Active layers are protected from prewarm eviction; prewarming considers at most two imminent cards within three seconds. The current editor pool remains six surfaces. A 3/5/9 fixture comparison does not justify an adaptive default for real album cuts.

Diagnostics distinguish synchronous shader compilation (`renderer.loadSource`) from total preparation, including source loading. They report actual surface dimensions, checkpoint bytes, direct-decoder encoded/queued resources and lookahead canvases. These are owned allocations, not a measurement of all browser/GPU-driver or HTML-media memory.

Verified scope: real selected-cut controls, shader dimensions, three-to-two layer reduction and restoration, uninterrupted audio while changing quality, visible lyric geometry at 7 seconds, control bounds and painted screenshots at 1280×720, 200% zoom and a 760-pixel window. Size-specific video encoding is verified with the existing FFmpeg owner on a three-frame source. Full-song resource growth, physical/composite synchronization, dense lyrics, all-aspect visual acceptance and the five-task operator pilot remain open. See [the postmortem](postmortems/2026-09-08-echo-preview-quality-budget.md).
