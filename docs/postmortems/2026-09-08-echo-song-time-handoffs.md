# Echo song-time media handoffs — September 8, 2026

Status: verified implementation checkpoint; ECHO-04/07/08/18 remain open. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`. Evidence: `$ECHO_REVIEW_WORKSPACE/media-handoff-proof/`.

## Objective and reuse

Extend the existing compiler presentation-window/opacity functions and persistent player pool. The compiler functions now live in a browser-safe shared module; generated export code still serializes those exact functions. No replacement editor, audio clock, analysis job or new saved cut was introduced. Preserve all original requirements and source lineage.

## What changed

Preview previously used wall-clock CSS fades after cue changes, while export dissolved every adjacent media pair before the seam and advanced ordinary incoming footage during that handle. Shared opacity now honors cut/fade/dissolve settings. Incoming footage holds its source start until the logical cue; ordinary and mapped export source clocks start on that logical cue. The existing pool shows both prepared layers, stays mounted across image/video changes and updates at most 30 times per second while playing. Image layers use the existing rendition/framing owner. Export media has explicit cue order within a stacking context below shaders, so detach/remount cannot reverse the dissolve. The new shared module participates in renderer build identity.

## Evidence and practical limits

Six current-cut browser composition cases pass 12 held/reverse pixel comparisons: 11 identical; the remaining mean channel difference is 0.00005057/255 (maximum 12/255 at isolated channels), below the declared 1.5 mean / 1% over-16 tolerance. Corrected Dear Papa and Miss Medusa observations explicitly include standby video: incoming alpha 0.333333, source time 0, outgoing alpha 1, no CSS transition. Earlier five-song pixel results remain valid; their current-only capture cannot prove incoming source time and that assertion is rejected.

The real compiler produced an eight-second package from the existing derived Dear Papa graph and source media. Four native package samples at 4.7, 5.2, 8 and 4.7 seconds verify incoming source hold at 0, advance to 0.2, ordered stacking below shaders after release/remount, and exactly identical reverse screenshots. This is an actual generated adapter check, not a new encoded MP4 or a comparison against the same complete current editor cut. Screenshot inspection confirms blended media, shader overlays and visible phrase lyrics; dense overlays remain a human readability/taste question.

All 74 distinct affected checks pass after the recorded assertion repair; renderer identity adds one passing check. Final lifecycle coverage passes eight checks with the retained 30 Hz cap. Delivery build passes. All 55 protected and 12 authoring hashes are unchanged. Do not refresh the earlier full-suite or full-song timing claims to this revision.

## What was noise or misunderstood

The first compiler failure was a source-text assertion tied to the old endpoint expression. The cadence fixture later advanced song time without advancing its mock frame clock; restoring a realistic 40 ms tick repaired that fixture. The native selector first read the original project timeline, then selected a generated-only interval on the correct Miss Medusa cut. A fallback silently reselected that invalid interval when no qualifying pair existed below 40 seconds. The corrected fixture requires an actual adjacent media pair and uses the verified 41.7-second seam. Failed runs remain available.

The initial native capture logged only the current video and vacuously accepted a missing incoming observation. The corrected capture records all pool elements and requires the incoming element. The export readiness promise initially returned a non-cloneable timeline object through Electron IPC; it now returns a boolean. Its later scalar assertion rejected Chromium's six-decimal serialization of one-third opacity (absolute error 3.3334e-7). `export-acceptance.json` re-evaluates the unchanged raw observations with 1e-6 opacity tolerance; the original failed harness report is preserved and no redundant GPU run was made.

## Learning delta and next work

Lesson Card candidate: select exact cut identity, eligible media intervals and nonvacuous visible-layer observations before native acceptance; assert serializable IPC return values and distinguish CSS serialization precision from image error. Keep stable layer ordering within the media stacking context, reuse logical source mapping, and retain the 30 Hz presentation budget.

Complete matched Preview/HyperFrames cue, lyric, gesture and camera event-state acceptance, including loop, dropped-frame recovery, out-of-order and non-unit source-rate cases. Consolidate ECHO-04/07 original criteria and reuse verified media handoffs, stem isolation and resource evidence. Retain cold persistent-history latency under ECHO-08/17 and remaining lyric, direction, recut, UI and human gates. The larger-batch workflow remains active-pilot with zero accepted batches; harness rework is not evidence of a productivity improvement. No Conviction inference was needed for this implementation.


Additional integration coverage: 15 cases pass after refreshing stale transparent-gap/source-observer assertions and camera-loop variable references. The empty-media and observer behavior already existed in the captured baseline. This gives 90 distinct checked cases in this checkpoint; no broad suite or additional native run was needed for these test-fixture repairs. All owned processes are terminal and absent; six task-owned temporary Electron profiles were removed after absence was verified.
