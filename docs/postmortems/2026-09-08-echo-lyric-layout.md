# Echo lyric presentation and square export — September 8, 2026

Status: **verified implementation progress; ECHO-06 remains open**. A2 remains active, with nine requirements done and nine in progress. Source: Codex task `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Workflow effectiveness remains unevaluated.

## Objective and reuse

Finish readable vocal-driven captions as one coherent batch. Extended `EchoLyricOverlay`, `echo-lyric-presentation`, the existing timing policy and HyperFrames compiler. The production Song Card resolution mapper remains the export owner. No replacement service, new alignment claims, source media changes or synthetic human annotations were introduced.

## Implementation and evidence

Phrase/window layouts are cached (128 retained entries), including wraps, measured glyph boxes and font size. Frame updates use those cached boxes to keep motion inside the panel. Contract safe areas participate in execution identity. Layout changes are measured once per new content/configuration/protection state, rather than every frame. Missing or invalid word timing displays the selected source phrase, never stale alignment tokens. Overlapping, outside-phrase and explicitly unaligned word intervals trigger phrase fallback.

Source-bound protected regions are projected through existing protected camera geometry and conservatively unioned for the whole phrase. Constant-size translation corridors are supported; stale or unsupported geometry stays explicit. The renderer tries preferred and alternate anchors, then obstacle edges and bounded font reduction. It never claims every arbitrary scene can fit: unresolved collisions remain diagnostic. This is supplied geometry, not face detection.

Actual React Preview and generated HyperFrames pass **429 observations / 39 cases**: four templates, disabled captions, three aspects, full/half/reduced motion, direct/reverse seeks, sustained words, dense windows and source-text fallback. Maximum full-frame mean native difference is0.0263/255. All measured animated word boxes stay inside the panel, and supplied protected regions remain clear. Prepared caption calls make zero geometry reads; highest synchronous p95 is0.1001ms, excluding browser paint/GPU. The square long-phrase screenshot was visually inspected: full source text remains readable above the synthetic protected bubble.

The real installed HyperFrames CLI rendered **15 four-second MP4s**, each with120 frames and expected audio duration, covering all templates/disabled states and three aspects. All36 active samples pass the existing Song Card lyric comparison owner. This does not exercise the full managed Song Card mint pipeline. After honoring embedded screenshot ICC profiles, the stricter glyph/full-frame gate passes35/60 samples and fails25/60: maximum full-frame mean4.996/255 and minimum bright-glyph retention88.60%. Thresholds remain unchanged; these are unresolved fidelity evidence, not acceptance. Caption content is present, but exact font-edge/color fidelity needs further work.

**95 distinct affected checks have passing evidence**: the initial run passed94/95; the one loopback integration failed with sandbox EPERM, then passed alone with permission. The delivery build passes.55 protected and12 authoring hashes remain unchanged.14 supervised stages are terminal/absent; two task-owned temporary Electron profiles were removed. No broad suite or unrelated Tarot proof was repeated.

Evidence root: `$ECHO_REVIEW_WORKSPACE/lyric-layout-proof/`. Start with `checkpoint-report.json`, `resolved/native/report.json`, `resolved/encoded/color-managed-report.json`, and `source-integrity.json`. Native and encoded artifacts are explicitly synthetic fixtures, not real vocal or human preference evidence.

## What failed, and what changed

- The first native matrix failed a real square long-phrase collision. Added obstacle-edge anchors and bounded font reduction, then ran the complete matrix. Font sizes in the passing cases are54–56 canonical pixels; no unreadably small workaround was needed.
- The first encoded matrix inherited the production mapper's landscape fallback for square. HyperFrames explicitly rejected it. Fixed the production mapper and tested all output profiles; retained the10 completed landscape/portrait masters and rendered only the five square cases.
- Raw cross-renderer RGB comparison ignored the Electron PNG ICC profile. Comparison-only sRGB copies reduced that error without altering original captures, MP4s or thresholds. Remaining failures are retained; color normalization is insufficient to establish strict fidelity. Existing production comparison tolerance alone is insufficient to close ECHO-06.
- A diagnostic FFmpeg call rejected `.3`; corrected to`0.3` after its process exited. Cleanup initially compared `/var` and `/private/var` literally; resolved both paths before applying the same ownership guard. A few source reads used the wrong working directory or a guessed test filename: use absolute evidence paths and discover test owners with `rg`.
- The sandbox-denied integration listener was an execution-permission issue, not a product repair. Only that test was rerun with the needed permission.

The documentation helper initially treated the pilot JSON’s string pointers `postmortems` and `updates` as arrays. Kept those existing fields intact and added explicit current-event fields; the Markdown append is idempotent. Inspect actual schema types before modifying state.

## Method and next action

The batch combined layout caching, readability, protected-region placement, timing truth and output-profile behavior before its native/encoded gates. Unchanged native evidence was reused after the isolated resolution-mapper repair. Encoded masters were reused across analytical comparisons. No useful qualified fact-extraction packet justified another Conviction call.

Do not claim this completes A2 or ECHO-06. Next: resolve stricter encoded glyph/color fidelity through the existing capture/encoding owner, exercise the actual managed Song Card output path for the templates, then consolidate lyric presentation acceptance. The installed CLI uses JPEG capture defaults; inspect the actual configuration/path before attributing the remaining differences to compression or changing capture policy. Real200-onset annotations and six-excerpt vocal alignment, integrated comic/video proof, final full-song delivery and human preference remain separate outstanding criteria.

Reusable **Lesson Card candidate**: compare image colors in a shared declared color space, preserve raw failures, and test the production resolution mapper through the actual CLI. Reusable **Flow-explainer candidate**: prepare protected lyric layout once, animate cached geometry per song frame, and keep source/camera evidence limits explicit.
