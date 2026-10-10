# Audio Atlas identity and timing contract

Version: `hapa.audio-atlas.contract.v1` · 2026-09-27 · first-pass prototype.
Owner: `server/audio-atlas-contract.mjs`; card: `atlas-gap-contracts`.
This implements a validated projection of the existing adapters. It is not a
claim that every proposed extraction family or the original pack is implemented.

## Identity and ownership

The Song store retains authoring identity. Composition identity stays unresolved
until independently established; titles and byte hashes do not establish it.
A recording-instance ID binds one Song registration to the exact master bytes.
It remains stable across analyzer upgrades with those same inputs. A transcode
gets another local recording instance; this does not assert a new composition
or determine whether the underlying performance is the same recording.

Source byte SHA-256, decoded PCM identity, decoded timeline, registered asset role,
analysis view and analyzer run are distinct. PCM identity retains rate, channel
count and float32 little-endian interleaved format. Decoder and delay/trim policy
remain attached. Missing legacy metadata stays null/unknown. An identical source
in two roles does not silently collapse the registered asset identities.

## Coordinates and transforms

Observations use integer source-sample coordinates. Intervals are half-open;
instants have equal endpoints and may not occur at the terminal sample boundary.
Observation timeline/rate, source hash, evidence asset and run references must
match their owner. Invalid output fails publication; invalid cache entries are
not reused. Contract version participates in new cache identities.

Affine maps use rational scale and offset. Piecewise maps retain separate
segments, support discontinuous target edits, and reject overlapping source
domains and unrepresented source gaps. `mapPoint` returns an exact rational and
an explicitly rounded sample. `mapSpan` returns fragments instead of joining a
discontinuity. Integer arithmetic uses BigInt internally and JSON-safe decimal
strings for rationals. Floor, ceil, ties-away and ties-even policies are supported.
The current Python adapters use ties-even. Grid precision is not acoustic accuracy.

Legacy analysis views expose their declared resampling/stride/crop transform.
Their bounded mathematical domains exclude right padding and the fractional
terminal residue. Actual transformed PCM lengths were not retained, so
`sample_count` is null. Preprocessing delay is unknown, never invented as zero.
These declared source-coordinate maps do not certify acoustic delay or align a
stem to its master. Piecewise support is a tested contract primitive; no existing
song is automatically time-warped. Future alignment adapters must supply evidence.

## Payloads, uncertainty and dependencies

Runtime per-kind validators cover all five currently emitted kinds: transients,
word candidates, beat candidates, downbeat candidates and semantic candidates.
They enforce shape, required values, score bounds and finite numbers. Unknown
kinds fail closed until a versioned payload validator is registered. Beat events
do not imply meter; CLAP cosine scores do not become probabilities.

Observation envelopes carry original claim type, versioned payload, source span,
analysis view, time map, raw/source evidence reference and hash, assessment and
original review state. Whisper scores are uncalibrated; missing uncertainty is
null. Supplied uncertainty must state its meaning and bracket the actual bounds.
Calibrated-confidence and new observation-kind adapters remain unsupported;
they cannot be admitted merely by assigning a field name.

The contract represents original observations. Append-only review decisions are
exported separately; effective query views apply them through the review owner.
An original unreviewed envelope does not erase a later accepted review.
Execution, presence/absence and review are independent states. A failed,
unsupported or unrequested capability cannot prove absence. Absence validation
requires completed evaluation and an evidence reference. Zero candidates remain
unknown. No adapter currently asserts verified absence.

Feature-array descriptors retain rate, hop, window, centering, first-frame origin,
channel axis, units, normalization and null/missing representation. Frames retain
explicit coordinates, including actual last-frame length. Missing legacy grid
metadata stays null. The original per-frame arrays remain in the result. No
spectrogram or additional technical measurement is synthesized by this contract.

Computational dependencies must resolve, be unique and acyclic. Symmetric musical
relations are a separate future owner, not computational dependency edges.
Phonemes, syllables, notes, diarization, pitch, harmony, sections and other future
families are explicitly enumerated as unsupported contracts. Their implementation
cards must add payload validators and qualification before claiming support.

## Human, API and CLI access

**Analysis details → Open identities & time maps** exposes the same bounded
summary as `query?op=contract` and:

```bash
node cli/audio-atlas.mjs query RUN_ID --op=contract
node cli/audio-atlas.mjs query RUN_ID --op=contract --detail=full
node cli/audio-atlas.mjs export RUN_ID
```

Summary responses explicitly count omitted observation/dependency records.
`detail=full` and JSON export include every envelope and dependency. Exports
retain the untouched original result and append-only reviews next to the new
contract. HTTP uses the existing session/auth boundary. No reads start inference,
rewrite sources or create a second authoritative Song Library.

## Verification and limits

38 focused tests pass: exact rational boundaries/rounding and large products,
piecewise discontinuities/gaps, identity separation across upgrades/transcodes,
crop padding, payload failures, clock/provenance mismatches, uncertainty,
dependency cycles, feature axes, independent states, query/export parity and
failed publication for malformed output. Production build passes.

The saved Brave Tongues run validates 13 assets/timelines,35 analysis views/maps,
8,333 observations and13 feature arrays. Four live API checks pass: authenticated
summary equals CLI, full validation, export parity, and byte-identical original
result/reviews. The summary is97,701 bytes; full pretty-printed contract is about
20.6 MB and is requested explicitly. No new analysis or real review was created.

Evidence: this task's `work/audio-atlas-2026-09-27/contracts/` logs and receipts.
Build: `sha256:9182f105feedcbbb83f4de6df67a83589230ec7ca7cd0fe073ef8dacc4fa76f9`.
Prior broad suite remains2433pass/11fail; not rerun at this intermediate foundation
checkpoint. Native smoke, full requirement qualification and focused completion
commit remain open. Contract validity does not qualify model accuracy, stem
synchronization, musical meaning or human acceptance.


## Foundation acceptance and execution guidance — September 27, 2026

Calder explicitly accepted this prototype foundation in Codex thread
`01a0e4d5-31d6-74f0-ab17-f838cf3f0992`. Card `atlas-gap-contracts` moved
from Review to Done through the board owner, with state readback verified.
This resolves the contract prerequisite for further audio-analysis work.

Calder also clarified that routine application of established Hapa protocols
does not require another human approval. Verify the technical criteria and
proceed within the authorized task. The prior stall incorrectly left routine
protocol application waiting on a human decision; future work should distinguish
technical review from an explicit human acceptance requirement. This instruction
does not manufacture model accuracy or waive independently required permissions.

Recorded model, native and repository acceptance limits above remain unchanged.
Audio analysis is prioritized; missing Suno files/catalog cleanup remain deferred.
