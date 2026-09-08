# Echo vocal-review workflow — September 8, 2026

Status: verified implementation progress inside A2; ECHO-05/06/15 remain open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

## Outcome and reuse

Extended the existing lyric editor, prepared float32 playback reader, correction transaction, saved-cut fork and cue graph. Source waveform windows reuse verified playback audio through byte ranges; there is no new analysis service or whole-song decode. Word/phrase zoom, bounded pagination, click/keyboard seek, operator reference capture and downloadable error summaries now form one review path. Original-candidate and corrected errors remain distinct, and references never raise confidence.

The actual app saved a Dear Papa line correction and word lock once to a new child in an isolated variant store copied from the exact current parent. A fresh page loaded that child; its UI, API-delivered variant, existing projection owner and disk payload agree. Undo restores the original lyric timing in the unsaved working copy. The actual prepared PCM waveform renders. No artificial reference was added to the real song; reference tests use an explicitly synthetic fixture.

## Verification and boundaries

Evidence directory: `$ECHO_REVIEW_WORKSPACE/vocal-review-proof`.

- `review-checks.log`:16 passing cases across range extraction, byte/duration caps, malformed/stale/cancelled responses, source-bound references, confidence/locks, splitting, fork/cue projection, and existing correction behavior.
- `native-ui-selected/report.json`: actual React component with synthetic waveform/reference interactions, desktop/narrow/200% layout and controls. Desktop screenshot inspected.
- `native-app-editable/save-result.json`: actual UI POST returned201 and created exactly one isolated child. Its failed post-save assertion is preserved; the save itself succeeded.
- `native-app-owner/report.json`: readback of that same child, original-source integrity, actual prepared waveform, unsaved undo, and visible bounded-nudge feedback. Screenshot inspected. It reuses the successful save and does not submit another.
- Current delivery build passes. Only that build was repeated after adding nudge feedback; unchanged domain checks and reference/layout observations were reused. No broad suite, full-song render, GPU-memory run or delegation was repeated.
-55 protected and12 authoring file hashes unchanged; all supervised groups absent and task profiles removed. The isolated catalog omits Winter Grain because its selected cut was not copied; this is a proof-store limitation, not a new live-catalog coverage claim.

Manual200-onset/six-excerpt acoustic review, all-template/aspect/Song Card presentation and human preference remain open. The observed waveform is the master mix, not an isolated lead-vocal claim. A recorded annotator name is operator input, not independently authenticated identity. Batch count remains one accepted pilot batch; effectiveness remains unevaluated.

## Failures, cause and corrections

The synthetic test retained word1 after earlier split/undo actions but asserted word0. Explicit selection fixed it. The first app selector matched a Lyrics export action instead of the workbench tab; exact rendered tab labels fixed it. A subsequent run assumed the already-selected protected parent was editable; the actual Start editable copy action was required. These were harness assumptions, not product failures.

A requested50ms line shift moved30ms because the next phrase begins at8.66s. The existing owner correctly clamps against neighboring cues. The old fixed-delta assertion was wrong; acceptance now uses the original source boundary. This revealed silent clamping in the operator UI, so applied/requested feedback was added and verified. After the201 save response, only readback/unsaved edits continued; no retry created another child.

The first reload assertion compared the API's unchanged base-project lyrics with child lyrics. The endpoint intentionally returns the base plus selected full variant. The actual UI had retained its lock and corrected start. The repaired assertion follows `deriveEchoDirectionVariantProject` and checks the delivered variant against saved bytes. No API behavior was changed.

Some inspections used the wrong cwd or searched ignored evidence without an explicit path. These produced no source changes and wasted effort. Keep absolute evidence paths separate from canonical source paths.

## Learning and next action

Lesson/Flow candidate: derive persistence assertions from the owning read contract before running native proofs; preserve successful writes across later assertion failures and resume from their IDs. Exercise real cue boundaries before assuming a requested nudge can be applied in full. The waveform/ref path is reusable for manual review; next complete remaining automated lyric-template/output coverage and assemble source-bound human review material. Codex owns integration and acceptance. No Conviction call was useful for these UI/persistence checks; its qualified scope remains literal supplied-fact extraction.
