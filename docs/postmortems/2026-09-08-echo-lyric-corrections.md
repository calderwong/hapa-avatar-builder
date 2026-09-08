# Echo lyric correction workflow

September 8, 2026 UTC. Status: A2 implementation progress; ECHO-05/06 remain open. Source task `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

## Intended outcome and reuse

Continue the vocal presentation path after accepted resource work. Reuse `EchoLyricTimingEditor`, its timing helpers, the saved direction-cut owner, editor graph and Director v2 compiler. No replacement editor or alignment service was introduced. The preceding goal turn was progress: ECHO-08 acceptance was committed and both boards moved to 9 done / 9 in progress.

## Findings and changes

The existing editor silently labeled any edit measured-manual-review and raised source confidence to at least 0.9. Its saved-cut projection also omitted the edited timed lyrics and correction record. Working-cut identity ignored lyric/project settings. These are distinct correctness and persistence defects, not evidence of poor measured alignment.

A cut-owned transaction now preserves original source records and confidence, changed intervals, source identity, correction actions and compact inverses. It rejects stale revisions, changed audio identity and conflicting undo. Line/word locks guard interval changes and survive the fork payload. Word/line split and merge use explicit source times; changed words lose unsupported current confidence and retain the original evidence. Replacing text clears obsolete word alignment. The renderer keeps its explicit phrase fallback. The existing fork whitelist and working identity carry the complete correction; compiled words retain correction provenance and locks.

The editor has readable controls, explicit text-apply, line/word selectors, undo and history. The oscilloscope is labeled as a live signal and separated from the song-time phrase strip. This does not supply the still-missing source-bound acoustic waveform/annotation workflow.

## Verification and limits

56 affected checks pass, including six complete transaction/persistence scenarios; the final six recheck adds same-ID/different-command rejection and exact undo restoration.50 unchanged checks are reused. JSON fork/reload, editor graph and actual cue compiler preserve corrected intervals and metadata. Native actual-component actions cover locked rejection, nudge, undo, word split, line split/merge and text replacement, followed by desktop/narrow/200% layout. No horizontal overflow; minimum visible control font 13 px. Screenshots were inspected. Native source is an explicit synthetic fixture and creates no human or acoustic acceptance. Its unchanged UI interactions are reused after the final journal-only guard adjustment. Final delivery build and 55 protected / 12 authoring source checks pass. Nine owned process stages are terminal/absent; two proof-owned profiles were removed. No broad suite or full-song timing run was repeated for this unfinished A2 batch.

## What was noise and the guardrail

The first fixture bundle assumed esbuild was installed; it was not. The existing Vite toolchain was reused. Vite library mode then left `process.env.NODE_ENV` in the browser bundle and the component never mounted. That failed native process was terminal before retry; the corrected fixture defines the browser environment and captures renderer errors. Preserve both failures. Check installed dependencies and browser startup errors before blaming component interactions or adding retries.

A correction is not alignment verification. Preserve source uncertainty and source records while making edits usable and recoverable. Lesson Card candidates: distinguish edit validity from acoustic confidence; trace persisted fields and runtime identity together. Existing native/control and source-integrity receipts remain reusable within their declared scope.

## Next action

Nine requirements remain done and nine in progress; no card closes here. Finish source-bound review of at least 200 word onsets across six excerpts and actual app save/reload behavior, then complete all-template/aspect lyric readability and motion acceptance. Do not fabricate manual annotations or human taste. Evidence is under `$ECHO_REVIEW_WORKSPACE/vocal-correction-proof/`; [operator guide](../ECHO_LYRIC_CORRECTIONS.md).
