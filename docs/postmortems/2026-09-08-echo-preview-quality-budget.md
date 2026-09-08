# Echo preview quality and shared checkpoint budget — September 8, 2026

Status: verified implementation checkpoint; A1 and ECHO-04/07/08/15/17/18 remain open. Six requirements done / twelve in progress; zero accepted workflow-pilot batches. Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`. The preceding status-only turn was no implementation progress; this continuation completed actual editor evidence and corrected metric labeling.

## Objective and reuse

Make preview load adjustable without altering song/cut truth. Extended the existing Preview compositor, shader pool/checkpoint store, derivative preparation owner and CLI. No replacement service or renderer. The [operator guide](../ECHO_PREVIEW_QUALITY.md) explains the controls and cache behavior.

## Changes and evidence

- Full/Balanced/Responsive presets independently control shader scale, admitted layers and media size. Existing API/job/cache identities include 640/960/1280; original and saved-cut content remains unchanged. Source stays in use while the requested size is unprepared. Existing still renditions are selected; no claim of generating all still derivatives.
- One 128 MiB checkpoint budget replaces independently growing preview-surface budgets. Cross-surface LRU eviction preserves native float buffers. Active layers are pinned during bounded prewarming. Direct decoder and lookahead counters expose owned resources. Synchronous shader compile time now excludes source loading; total preparation is a separate metric and neither measures asynchronous driver work.
- Real selected Dear Papa editor: shader canvases 902×507, 677×380 and 451×254; compositor 902×507 throughout. Three scheduled layers reduce to the first two and restore. Source selection and paused playhead survive changes. During playback a resolution change retains running audio, observed from 3.744 to 6.728876 seconds. Temporary shader edits are cancelled, never saved.
- Visible lyric check at 7 seconds: all three resolutions retain frame 210, identical text, 1920×1080 lyric stage, 56 px canonical font, stage transform and 902×507 overlay. Current text is honestly labeled phrase timing / word alignment unverified. Actual painted quality controls fit 1280×720, 200% zoom and a 760 px window. This does not certify the rest of the workbench's accessibility.
- Real FFmpeg owner test: a three-frame 1280×720 source produces separately keyed 1280/960/640 derivatives, warm reuse avoids encoding, wrong-size projection is refused and the original hash remains intact. The actual editor check reuses existing 1280 proxies when comparing shader scales and verifies smaller sizes as unprepared; it does not claim a full album transcode at each size.
- Native Feedback Loop/video fixture: six seek and twelve playback pixel comparisons pass, including held/cue isolation. A forced shared 4 MiB budget peaks at 3,686,400 bytes with nine evictions and releases entries on disposal. Nine distinct cue instances over eleven visits compare pools 3/5/9: total preparation/presentation time 1948.7/2024.7/1567.2 ms and 8/6/0 surface evictions. This is one shader fixture, not the same six actual saved cuts or a full-song memory proof; keep the editor default six.
- Initial affected tests: 85/88 passed; three expectations needed alignment with deliberate active-layer pinning and quality helper wiring. The affected repair passes 20 tests. After correcting metric scope, 25 runtime/pool tests pass. Final delivery build and selected-cut certificate pass. All 55 protected and 12 authoring hashes remain unchanged. Prior broad suite results remain scoped to prior revisions; none was repeated for this incomplete requirement batch.

## Corrections and noise

The first editor harness used a two-layer moment and could not test omission. A temporary third layer fixed its coverage. The second used the nonexistent “Pause Show” label; the observed button is “Pause”. Both attempts exited and their groups were confirmed absent before retry. The completed control proof passed in 37.72 seconds. Immediate post-scroll screenshots could capture stale content, especially at 200% zoom; a separate 31.35-second visual proof waited for paint and used a moment with visible lyrics. Earlier screenshots and failures remain recorded, not relabeled as visual acceptance. A shell read initially used a task-relative evidence path from the canonical checkout and failed; subsequent reads used the correct root.

A source review found that the initial compilation timer included fetching and preparing. It is now split at the existing compiler boundary; historical fixture values in that field represent preparation. No earlier number is promoted to a GPU compilation measurement.

## Process and methodology

The existing file-based Python supervisors owned one Node or Electron process plus its normal descendants, with sanitized environment, role marker, finite deadline and TERM/KILL fallback. All test/editor/API groups are terminal and absent. The task API on 19088 stopped after 369.65 seconds; operator services were preserved. The native screenshots were visually inspected. No Conviction call, cloud delegation or GitHub mutation occurred.

This is progress within one coherent quality/resource implementation, not an accepted A1 batch. Avoid repeating these bounded proofs after documentation changes. Reuse the code, native pixel evidence and actual UI evidence within their stated scopes. Next: measure the same actual cuts with 3/5/9 pools and a full song, finish global decoder/compositor memory policy and integrated timing/stem acceptance. Cold near-end persistent reconstruction remains an unresolved user-experience cost; no speedup claim from lowering resolution alone.

Lesson Card candidate: measure the operation named by a diagnostic; assert real rendered dimensions and the visible lyric layer; wait for scroll/paint before screenshot acceptance. Keep fixture failures separate from implementation defects and retain the original acceptance scope.

Evidence: `$ECHO_REVIEW_WORKSPACE/quality-budget-proof/` contains `affected.log`, `affected-repair.log`, `metric-check.log`, `native-quality/report.json`, `editor-clock/report.json`, `visual/report.json`, painted screenshots, build/certificate/integrity logs and process receipts. Owner task workspace retains original failed attempts. Local docs and board/Second Brain receipts establish local registration only, not fleet propagation.
