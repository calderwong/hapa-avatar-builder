# Source-bound harmony review

Status: implemented prototype; musical qualification remains open.
Owner: Hapa Avatar Builder, card `atlas-gap-harmony`.

## Review workflow

Open **Harmony** on a saved analysis made with the current worker, then choose
Master. Older runs explicitly report unavailable; no analysis is launched by
opening the view. **Analyze locally / reuse matching result** prepares harmony
inside the existing base stage. Beat, word and pitch options remain independent.
The UI displays original A440 or tuning-adjusted chroma, competing chord and
inversion hypotheses, and local/global key alternatives. Select a frame to cue
Master and inspect all five ranked chords with their low-frequency evidence.

The same source-sample window is available through
`GET /api/echos/audio-atlas/jobs/RUN/query?op=harmony&asset=master&start=S&end=E`
and `node cli/audio-atlas.mjs query RUN --op=harmony --asset=master --start=S --end=E`.
The half-open query is limited to30seconds, returns every overlapping frame and
local-key window, and preserves whole-source tuning and key alternatives. Full
run/export retains all frames and spectral peaks. Brief/contract omit dense
frames; the contract binds the feature array to Master, its timeline and the
original result evidence. Old results and reviews remain unchanged.

## Inherited method and Hapa-owned implementation

The Hapa helper is an original, pure-NumPy implementation of spectral peak
analysis and template matching. The conceptual reference for chroma/template
matching is [Meinard Müller's FMP chord-recognition notebook](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C5/C5S2_ChordRec_Templates.html).
No upstream code, recordings, learned model or benchmark result is copied.
The local/global key weights below are Hapa-declared heuristics, not an inherited
perceptually qualified key profile. Existing FFmpeg decoding owns the audio view;
source ownership and all prior word/pitch/rhythm attribution remain unchanged.

The helper reuses the existing mono8kHz FFmpeg view, without another decoder,
model, package, network call, subprocess or gain normalization. Mono downmix may
cancel phase-opposed material. Frequencies outside55–2000Hz do not contribute.

### Spectral evidence and tuning

An8192-sample periodic-Hann FFT is centered at0,2000,4000… analysis samples, with
zero padding at edges. Grid centers map to source samples by rational
nearest-half-up rounding. Support bounds use floor/ceil and clip to actual source
length. Display cells cover250ms (partial final retained), while each measurement
uses1.024seconds. The last cell ends at the exact source count. No acoustic
boundary accuracy is implied by either width; timing uncertainty remains null.

Above−70dBFS RMS and below0.2 spectral flatness in55–2000Hz, local magnitude
maxima at least0.1 of the strongest in-band peak are retained. At most32 strongest
peaks survive per frame; original candidate count and truncation are explicit.
Log-magnitude parabolic interpolation is clipped to±0.5 FFTbin. Stored frequency,
amplitude, bin and sub-bin offset retain the measurement, without calling a peak
a fundamental. Amplitude is2*|FFT|/sum(Hann), with original PCM gain retained.

Tuning uses amplitude-weighted circular residuals relative to the nearest A440
semitone. Only FFTs with full in-source support contribute. The global candidate
requires at least12 retained peak observations and circular concentration≥0.65.
Otherwise offset and inferred A4Hz are null. Peak observations repeat over time;
they are not independent note counts. Residuals are modulo100cents: absolute
semitone/octave ambiguity and local tuning changes remain unresolved. A candidate
offset is applied for the second chroma view; the original A440 view is retained.

### Chroma, chords and bass/inversions

Each peak distributes its amplitude linearly between neighboring equal-tempered
semitone bins; octaves fold into12 pitch classes ordered C…B. Each vector is L1
normalized, or allzero when unresolved. UI brightness uses sqrt(value) only for
display. Stored values are unchanged. Raw peak Hz remains independent of the
pitch-class mapping and tuning assumption.

The chord vocabulary is12 roots × nine qualities: major, minor, diminished,
augmented, sus2, sus4, dominant7, major7 and minor7. Their semitone sets travel in
the result. At least three pitch classes must each have0.08 share before chord
ranking. Cosine similarity compares the measured vector with binary templates;
five alternatives and the top-two margin are retained. Neither similarity nor
margin is a calibrated confidence. Symmetric or related templates can tie.

Low spectral peaks between55 and260Hz at least0.25 of the strongest retained
peak are sorted by frequency; up to the first three are carried as competing bass
candidates. For every chord hypothesis, a compatible pitch-class interval yields
its zero-based inversion index (0=root position). A non-chord tone yields null
with an explicit incompatible/pedal/wrong-hypothesis possibility. These are
spectral components, not verified bass notes or instrument identities.

### Local and global key alternatives

Chroma averages give equal weight to candidate frames, independent of their
absolute loudness. Local windows use32 grid cells (8seconds), with the final
partial window retained. Whole-source averaging uses every candidate frame.
At least8 active frames and4 pitch classes at≥0.06 share are required; otherwise
the key state is unresolved. Available modes are major and natural minor only.
Scale-tone template weights are1, tonic1.5, fifth1.25 and third1.2. Twenty-four
root/mode alternatives are compared by cosine, retaining five. Related keys,
limited vocabulary and non-tonal music remain explicit limitations.

## Verification, process safety and learning delta

Six numerical tests cover23-cent-detuned Cmajor, first-inversion evidence,
C–Am–F–G changes and competing keys, silence/noise/single-tone abstention,
conflicting tuning, invalid PCM and44.1kHz source clocks/partial tail. Five new
JS checks validate identities, grids, tuning, scores, inversion relationships,
legacy/source states, contract projection, shared HTTP query and helper-hash
cache invalidation. 114 distinct Atlas JS tests pass (113 initial plus the independent-owner progress regression); production build passes.
These are synthetic/mechanical checks, not human harmonic qualification.

The existing serial base→beat→pitch lifecycle remains the process owner. Harmony
adds no child. Existing role/argv/environment,600second worker timeout,
TERM/KILL escalation and writer lock are reused. Execution code was frozen before
the real combined run. Full repository/native/commit gates remain open.

Reuse decision: extend the existing8kHz analysis view, immutable result, cache,
contract/query/export and source player. Tuning/chroma alternatives stay distinct
from note transcription, so a spectral peak is not silently promoted to a note.
The useful Lesson candidate is to retain the untuned representation whenever an
estimated global correction is applied; that correction is itself a hypothesis
and can otherwise hide mixed or changing tuning. Human chord-change, key and
inversion examples remain required to qualify musical correctness.

Source chat: [Audio Atlas continuation](codex://threads/01a0e4d5-31d6-74f0-ab17-f838cf3f0992).


## Brave Tongues verification

Combined run `8018fabb-8514-45e3-bc11-a42ea8ee3ab2` analyzed13 registered sources in
198.955s; harmony helper 1.993s. There are
974 source-timed frames, 928 with spectral
evidence, 834 meeting the chord policy and
31 local-key windows. The26–56s window returns all120frames.
Global tuning remains unresolved: circular concentration
0.373 is below0.65. The display therefore
retains its declared A440 assumption. Bnatural minor and Dmajor are leading
whole-source template candidates, with only
0.0099 cosine separation; this is not an accepted
key or a probability.

All13 original/preserved source hashes and the prior combined result are
unchanged. Every pYIN frame and every rhythm tempo interval matches the previous
run. Query/API/CLI/contract, exact-option cache reuse and temporary-PCM cleanup
pass. Source result SHA-256: `45dc37d2aacb67c8e12783e8e0b0c2d44eb6ae4604118eff66191f6cdf73eb9a`.

The first cache-verification harness hit the filesystem sandbox at its normal
writer lock after its read-only checks. It was rerun through narrow authorized
escalation; no inference retry occurred. No analysis worker remains.

The real browser exposed a separate status issue: a CLI-owned active job showed
Preparing0/? because only in-process jobs read progress.json. The shared owner
now reads atomic progress for any verified live queued/running/cancelling job.
A separate-owner regression passes; all25 existing owner tests pass after the
change. The analysis helper remained unchanged during inference. The final build
passes with source receipt
`f31c4fc19159ef7f6c75a2bd26949e9a92af1d7300855a8fa7fc2fb8f324c561`.
The completed real-run UI verifies chroma, five chord/inversion alternatives,
local/global keys, original chroma toggle and source playback cueing. Live-job
progress fix has a regression proof; no new inference was launched just to repeat
that UI state. Human harmonic review and broad/native/commit gates remain open.

Final visual refinement: the original-chroma checkbox now uses a compact inline
layout instead of inheriting full-width form-input styling. The rebuilt view was
inspected at the30s selection and its screenshot saved. An optional subsequent
DOM geometry lookup timed out; no geometry measurement is claimed.

Calder accepted the foundation and confirmed routine application of Hapa protocols
requires no repeat contract-review confirmation. Harmonic accuracy review remains
a separate evidence requirement, not a reopened foundation approval.
