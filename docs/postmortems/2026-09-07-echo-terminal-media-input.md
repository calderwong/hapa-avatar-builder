# Echo terminal media input and layer fallback

Status: verified bounded correction; A1 and all affected requirements remain in progress.
Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40` (Codex). Evidence: `$ECHO_REVIEW_WORKSPACE/terminal-frame-proof`.

## Intended outcome and reuse

Keep persistent filters valid through intentionally empty media intervals, preserve authored timing, and never substitute another layer. Extend existing ISF pool/history and HyperFrames framing adapters; no replacement transport or compiler. The prior native run exposed a40ms terminal gap and a global last-presented fallback. Actual source inspection also found a fade-out declaration, so automatic tail extension was rejected.

## Outcome and evidence

One shared lazy transparent-input owner serves Preview/history and compiled export. Explicit absence is required; unknown state and scheduled-but-undecoded media do not qualify. The original cue end, audio/lyric clock and saved cut remain unchanged. Layer-specific fallback retains the successful canvas and receipt and clears references on eviction/disposal.

34 targeted tests pass. Six real native Feedback Loop terminal/reverse comparisons match a92-frame uninterrupted reference using the actual last clip. Both adapters supply zero RGBA at258.4s and258.433333s; moving backward into scheduled missing footage remains an error. The native screenshot contains feedback history, which is expected for this shader and does not prove composite taste or fade quality. Native proof precedes only relocation of the gap lookup behind the no-input branch; the lookup logic is unchanged. Delivery build passes. Affected compiler test and integrity receipts accompany this record. Actual editor terminal behavior, full-song/composite/physical timing, encoded terminal output and global memory remain to be accepted.

## Corrections and noise

Initial34 tests had six failures because the live draw result did not itself carry a canvas; retaining only lastResult.canvas dropped valid single-layer fallback. Store the verified surface canvas at successful presentation; all34 then pass. The compiler harness omitted the new finite/helper dependencies for a decoded-media framing test. Moving the gap-only lookup off that hot path both avoids needless whole-schedule scans and preserves that test's actual scope. Do not weaken its image framing assertions. Preserve original logs. No broad suite was repeated for these local corrections.

Conviction's bounded local review was operationally successful but substantively unreliable: its first expected result approved the observed cross-layer defect, its extension assertion ignored the50ms guard, and its timing language did not establish visible-event residual. Zero new defects accepted. Prior independent Codex reflection and the full response are preserved; the shared ledger records both perspectives. Next delegation uses literal extraction rather than code or expected-result inference. No extra trial call or token/savings estimate.

## Reusable lesson

Lesson Card candidate: absence on the authored timeline is a valid explicit input state; failed acquisition is a different state. Preserve the distinction through preview, export and failure receipts. A last-good frame belongs to a presentation layer, not the whole renderer pool. Attributed source remains the Codex task above.

Final affected-adapter gate:60/60 pass. Integrity:55 protected and12 authoring hashes unchanged. All owned test/native/build process groups are terminal and absent. This is a local checkpoint; A1 remains unaccepted.
