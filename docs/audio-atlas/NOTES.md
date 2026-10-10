# Audio Atlas note and melody candidates

Status: implemented prototype; musical accuracy and broader acceptance open.
Owner: Avatar Builder. Card: `atlas-gap-notes`. Foundation accepted by Calder;
routine protocol application does not require another approval.

## Use

Choose a saved run with source-channel pitch analysis, then **Notes & melody**.
Use **Choose analyzed source for notes** when the selected source differs. The
30-second review window shows note spans over the retained pitch contour. Cue a
row to seek the same source; inspect its sample coordinates and frame references.
Other views show within-note pitch variation, repeated patterns and low-register
lines. Unknown, missing and rejected evidence never means an instrument is absent.

The existing `jobs.pitch` request / CLI `--pitch-source` prepares the underlying
pYIN evidence. This new deterministic view also works on older saved pitch runs
without new inference. It never rewrites a run or adds a human correction.

API: `GET /api/echos/audio-atlas/jobs/RUN/query?op=notes&asset=stem-1&start=S&end=E`.
S/E are integer source samples; the half-open window is at most 30 seconds.
CLI: `node cli/audio-atlas.mjs query RUN --op=notes --asset=stem-1 --start=S --end=E`.
All overlapping events retain their original, unclipped spans. The response holds
all window frames, including raw/abstained frequency and source frame indices;
it is not a silent first-page truncation. Matching motif groups include their
other occurrences outside the window so the UI can cue a comparison.

API/CLI JSON export adds `derived.notes`; the immutable `result` is unchanged.
The brief adds `note_analysis` and contract adds `derived_views.notes`, both
summaries without dense arrays. Original execution coverage is intentionally
retained: a historical run did not execute this later view. The generic typed
note-observation/correction contract remains unsupported; the versioned derived
view is distinct, with method, implementation SHA-256 and full pitch-evidence
SHA-256. Read-only derivation makes no execution or human-acceptance backfill.

## Method and assumptions

`hapa.pyin-note-segmentation.v1` is Hapa-owned segmentation of the existing
librosa pYIN evidence (see [pitch provenance](PITCH.md)). No new model, package,
network access or worker is added. The supported estimator range remains
50–1100 Hz; bass below 50 Hz is outside its scope.

Each contiguous voiced region is processed independently, and a new pYIN chunk
always ends a region. A centered five-frame median of continuous pitch in cents
never crosses either boundary. The first smoothed value anchors a span. A
same-direction difference of at least 90 cents for five consecutive frames
splits it at the first changed frame; the new anchor is the median of that held
change. Spans need at least eight frames and 80 ms. Rejected short spans remain
listed with frame references. A transient pitch change shorter than the hold
can remain inside the previous candidate; continuous glides can split.

Start is the first retained frame center. End is the next grid center or source
end. Onset support is the first frame's original FFT support; offset support is
the final retained frame's support. These are dependency windows, not calibrated
acoustic error brackets. Acoustic uncertainty remains null. No onset/release
accuracy is inferred from the 10 ms grid. Repeated attacks at unchanged pitch
may merge unless periodicity is interrupted; this is a known limitation, not
qualified full transcription.

Each event preserves its median Hz, p10/p90 Hz, uncalibrated voicing scores,
contour frame indices and source/channel identity. The displayed nearest MIDI
note assumes 12-tone equal temperament and A4=440 Hz; measured tuning is unknown.
Raw Hz remains authoritative evidence. A bend candidate means p90–p10 variation
of at least 40 cents around the median. Edge change compares the first/last five
frames (or half a short span). This does not distinguish vibrato, expressive
bends and estimator error.

Three consecutive notes form a pattern using two nearest-note semitone
intervals and duration ratios relative to the first note, quantized in quarter
log2 steps. Gaps must be at most 0.5 seconds and chunks must match. A pattern
requires two nonoverlapping occurrences and allows transposition. These are
candidate repeated pitch/rhythm shapes, not accepted motifs. Low-register lines
require at least two successive candidates at or below MIDI48/C3 with the same
gap/chunk rules; their basis is **register only**, independent of declared role.

## Verification and remaining qualification

108 distinct Atlas JavaScript checks pass (83 feature/interface +25 owner).
Six new tests cover voiced gaps, source clocks, stable pitch changes, short-span
rejection, vibrato, chunk boundaries, transposed patterns, register grouping,
legacy/source guards, malformed evidence and derived-contract provenance.
The first contract fixture lacked run/song IDs; this test-only setup error was
corrected and the original failure is retained in the task tool history.

An actual pYIN-to-segmentation synthetic probe recovered six separated sine notes
at 110,123.47,130.81,220,246.94,261.63 Hz. Maximum onset error20ms, offset30ms,
pitch deviation about4.996cents; it found the transposed pattern and low line.
A 35-cent,5Hz vibrato fixture remained one note with60-cent p10–p90 variation.
These are deterministic synthetic labels, not real-instrument or human quality.

The polyphonic counterexample is deliberately retained: equal220Hz and330Hz
sinusoids produced a110.318Hz subharmonic candidate. It did **not** recover two
notes. High periodicity or stable segmentation must never promote this output
to a correct transcription. Real isolated instruments, overlapping sources,
expressive ornaments, rearticulation and independently labeled song references
remain necessary for musical qualification; card stays In Progress.

Production build passes. Browser verifies four views, Master-to-Vocals guard,
complete26–56s window, source cue at27.58s and raw evidence disclosure. Browser
output is not native Electron acceptance. Existing broad/native/focused-commit
gates remain open; no requirement is declared closed.

## Reuse and learning delta

Reused the pitch validator, saved-result owner, query routes, CLI/export, source
player and scoped table styling. The pure derived view preserves old evidence
and avoids an unnecessary decode or inference cycle. Known weakness: a stable
wrong subharmonic survives every downstream segmentation check. The reusable
Lesson candidate is to test at least one *convincing wrong estimate*, not only
silence and expected notes, before calling a musical extractor qualified.

Source chat: [Audio Atlas continuation](codex://threads/01a0e4d5-31d6-74f0-ab17-f838cf3f0992).


## Brave Tongues source evidence

Saved combined run `e2c13270-33e7-49e8-992d-3bf4005e37a6`, Vocals/channel1, produces
410 candidate spans, 156 variation candidates,
7 repeated-pattern groups and 5 low-register
lines. 220 short spans are explicitly excluded. The26–56s
window contains 51 notes and 3000 raw pitch
frames. One measured derivation took 149.1ms; no general
latency guarantee. All13 original/preserved audio hashes and saved result bytes
remain unchanged. CLI, API handler, export and contract agree.

Source result SHA-256: `268d0a9608f9adc5bf842355f5965c1e229959ee631ffcfa8e38408709d73aa9`.
Pitch evidence SHA-256: `a57d87eba7010d9a18d3178cd6f370eb8eae05332eb42d1e9478e566603211e4`.
Implementation SHA-256: `6feff1884298ba93e5a600c49d25655d06a18711e4a467d93c09a3ac4af6c431`.
