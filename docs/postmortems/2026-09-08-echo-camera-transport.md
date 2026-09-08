# Echo camera, transport and A1 technical acceptance — September 8, 2026

Status: ECHO-04 and ECHO-07 technically accepted; ECHO-08/18 remain open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Evidence: `$ECHO_REVIEW_WORKSPACE/transport-camera-proof/`.

## Objective and reuse

Complete the original synchronization criteria and their dependent stem-visual requirement. Extend the existing persistent media player, protected-camera owner, shared lyric renderer and HyperFrames compiler. Reuse the earlier source-bound routing, history and gesture evidence. No replacement editor, new song/cut, analysis, model call or human acceptance was introduced.

## Changes and verified result

Preview videos now receive the same protected crop geometry as stills and export. Each incoming dissolve shot uses its own graph-card camera path. Pooled elements clear protected styles when reused for legacy framing. Actual normalized DOM geometry and clip regions agree in 55 visible-video observations across forward/reverse samples, at a 0.002 normalized-box tolerance.

A continuous-loop check found a real cadence defect: a 33.3ms wall-time throttle can skip output frames on a 75 Hz display, and the parent clock can be one callback old. Presentation now reads the live master and updates once per absolute song frame, retaining exact paused evaluation. A behavioral75Hz regression verifies the next output frame is processed and duplicate same-frame DOM work is skipped. Paused camera edits also refresh through graph/keyframe dependencies.

The final native run captures loop state before another seek, recovers from a 120 ms induced main-thread stall, and then plays the exact Dear Papa cut to its natural end. 27 sampled loop/recovery states agree with the actual generated adapter within the original one-output-frame allowance. Post-loop decoded-frame metadata contributes 37 samples: p95 21.185ms, maximum 25.115ms. Raw video `currentTime` is retained as a diagnostic, not misrepresented as decoded display time.

All 75 lyric entries and 80 authored accents were observed in the final full song. Lyric/painted-accent p95 absolute residuals against the browser audible-output estimate are 27.757/25.906ms. 2 lyric and 2 accent onsets exceed one frame; maximums are167.112/37.944ms. The original p95 criterion passes; this is not a guarantee of zero outliers, physical calibration, or word/vocal alignment. All scheduled lyric/accent onsets are accounted for, including the inner lyric accent canvas.

Twelve observations in isolated actual player/lyric components and actual generated adapters cover 0.5x/2.5x source rates, direct/reverse seeks and playback. Master audio remains 1x, lyric frames agree, and source differences are at most 0.002ms in song time. These fixtures use real existing media/audio and save no user cut. Their compiler correctly reports incomplete full-show coverage outside the isolated cue; they are not final music-video packages.

## Evidence reuse and acceptance boundary

ECHO-04.1: current continuous loop/recovery comparisons plus existing actual direct/reverse/out-of-order and pause/resume comparisons. ECHO-04.2: existing 0.6s absolute-time probe, native integer/float checkpoints, bounded replay/cancellation and shared 128MiB history tests. ECHO-04.3: matching actual camera/layer/lyric adapters plus current source-rate fixtures. ECHO-04.4: current full-song visible-onset measurement, post-loop decoded callbacks, and the previously verified explicit unsupported-callback fallback.

ECHO-07.1/3 reuse six-song 54 solo/restore cases, 158 baseline ports and 316 overrides, including missing stems and silence. ECHO-07.2 reuses the default prepared path and six-second 538-frame live recording with 46 reload/replay observations. ECHO-07.4 reuses six distinct gesture types across three target surfaces, 11 section-boundary observations and 383 camera paths, now consolidated with the satisfied synchronization dependency. None of these source/binding owners changed in this correction.

42 distinct affected cases and the current delivery build pass. Reuse the earlier A1 broad regression, Overcard and Tarot evidence for unchanged owners; no broad suite repeated. All 55 protected and 12 authoring hashes remain unchanged. The final source and build stayed fixed during native verification. Runtime receipts identify the tested working tree, including preserved pre-existing edits; the scoped commit contains only this task’s changes. Graph/cut/song/performance inputs agree with the reused export package; the project differs only in its delivery receipt.

## Corrections and learning

Initial camera fixtures required the real seeked-before-decoded-frame ordering; stale source assertions were updated. The rate fixture initially inherited a contradictory loop flag and initialized its UI clock ahead of unloaded audio; both fixture defects and their failed attempts are preserved. Raw continuous element positions and exact same-instant opacity comparisons first obscured the distinction between browser callback cadence and an output-frame tolerance. The actual transition lag then exposed the wall-time throttle defect; its repair received a new combined native acceptance run. The earlier full-song timing receipt remains historical instead of being relabeled as final-revision evidence. A screenshot named camera-4-7 was actually captured at the last sampled zero time and is not camera-at4.7 evidence.

Lesson Card candidate: synchronize presentation by the song's frame index, not elapsed callback milliseconds; compare actual output states at the declared frame tolerance and use decoded-frame metadata for video phase. Account for all target surfaces before treating missing instrumentation as missing paint.

## Remaining work

A1 is the first accepted pilot batch; effectiveness remains unevaluated until the protocol's later review. Eight requirements are done and ten remain open. Cold persistent reconstruction near 90 s and 19,579 main-canvas paints during this full song remain concrete 08/17 work. Finish a coherent performance/cache batch next; preserve the independent05/06 annotation/readability,10/11/12 direction/comic/camera,14/15 editing, and18 final-render/human gates. No album-wide or human acceptance is inferred.
