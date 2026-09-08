# Echo A1 acceptance map

Status: **technical acceptance complete for ECHO-04 and ECHO-07**. ECHO-08 and final integration ECHO-18 remain in progress. Original requirements retain authority; no physical-calibration, full-pixel-identity or human-preference gate was added to04/07. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

| Criterion | Authoritative evidence and scope |
| --- | --- |
| 04.1 transport state | Current actual continuous loop/recovery adapter comparison (27 samples within one frame), plus prior direct/reverse/out-of-order, pause/resume and six-song paused-composition receipts. |
| 04.2 reproducible history | 0.6s modulation probe, native integer/float checkpoints, bounded replay/cancellation and shared 128MiB history. Cold near-end latency stays under08/17. |
| 04.3 independent clocks and adapter parity | 55 protected camera observations; prior48 matching lyric/accent,138 shader and55 media observations; 12 actual 0.5x/2.5x source-rate observations preserve master/lyric clocks. |
| 04.4 measured timing and fallback | Current full song: all 75 lyric/all 80 accent onsets, p95 27.757/25.906ms; post-loop decoded p95 21.185ms; prior explicit element-clock fallback. Outliers remain published; no word-alignment or physical-calibration claim. |
| 07.1 assigned visual buses | Six-song 54 solo/restore cases, 158 baseline ports,316 overrides and normalized range/headroom correction. |
| 07.2 prepared/live reproducibility | Default shared prepared curves; 538 recorded live frames and 46 replay observations after reload. |
| 07.3 isolation and missing data | Six-song assigned-channel isolation, real silence, explicit absent/unaligned data and restored native shader pixels. |
| 07.4 musical budgets | Six gestures/three surfaces, 11 section-boundary observations, 383 camera paths and 17 projections; recut locks/event decisions retained. |
| 08 remaining | Whole-frame work/late-frame budgets, cold history latency, independent quality controls and overall retained-resource acceptance. Existing pool/cache/prefetch evidence remains reusable. |

[Acceptance, failures and reuse record](postmortems/2026-09-08-echo-camera-transport.md). Evidence: `$ECHO_REVIEW_WORKSPACE/transport-camera-proof/`, with prior source-bound owners linked from the drain and postmortems.42 distinct affected checks and current build pass; unchanged broad/native evidence is reused under the active batch pilot. Eight done/ten in progress; human review remains pending under its own requirements.
