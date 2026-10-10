# Supplied pack audit and substitute acceptance matrix

Status: missing implementation-pack inputs verified; explicit substitute matrix
prepared for review. This does not recover or replace the absent source authority.
Source: Calder's Audio Atlas gap goal; card `atlas-gap-missing-pack`.

## What is actually available

The bounded audit inspected the ten immediate supplied files and both ZIP member
tables. No home-directory crawl, remote retrieval, executable archive extraction
or source mutation occurred. The original design archive SHA-256 is
`2779add793fe2f03da37b6d310cee4678da88db34eb26daea5fc5d251231ce30`, exactly the
archive named in the supplied PACK_CHECK_REPORT. It contains eight files. All
seven content entries in its internal checksum manifest match. The manifest
itself has no self-hash; its bytes are covered by the archive hash. The loose
README is byte-identical to the original design README.

The other archive is the separate 3D Visualizer extension. Its member names were
inspected to rule out the missing Audio Atlas implementation pack. It is not a
replacement test suite and remains under `atlas-gap-visualizer-scope`.

The supplied PACK_CHECK_REPORT says 36 unit tests passed in an artifact-preparation
Linux container. Neither the tests nor their logs are supplied. That historical
claim is not a local Hapa test receipt. The original example validator exists,
but attempts with system Python and bundled Codex Python stop at missing
`jsonschema`. No dependency was installed and no validation pass is claimed.
Even a passing example validator would only check fabricated envelopes, not audio.

## Exact missing documents and substitute routes

These routes use existing owner material and the surviving user-authorized
requirements. They are not invented versions of the absent documents.

| Missing file | Existing route / remaining acceptance |
| --- | --- |
| `02_HAPA_INTEGRATION_DISCOVERY.md` | [Discovery](DISCOVERY.md), [integration map](integration-map.json); verify live owner routes before changes. |
| `03_IMPLEMENTATION_PLAN.md` | The [56-card matrix](substitute-acceptance-matrix.json) preserves exact acceptance/dependencies. Board event log owns current task state. |
| `04_DATA_AND_TIMING_CONTRACTS.md` | [Contract](CONTRACT.md); inspect typed payloads, rational/piecewise maps and unsupported kinds. Contract tests do not qualify timing accuracy. |
| `05_API_CLI_AGENT_TOOLS.md` | [Current commands](README.md); `agent-tools`, `briefs` and retrieval cards retain incomplete operation parity. |
| `06_MODEL_ADAPTERS_AND_SOURCES.md` | Original `adapter_candidates.json` / `sources.json`, [tested music profile](requirements-music-profile.txt); actual specialist execution and quality remain distinct. |
| `07_MAC_OPERATIONS_SECURITY.md` | [Runtime boundary](README.md), owner process protocol; `recovery`, `asset-policy`, `provider-policy`, `redaction` and `adapter-health` cards. No missing resource/download defaults are inferred. |
| `08_TEST_AND_BENCHMARK_PLAN.md` | Matrix below plus every numbered acceptance criterion in the JSON. Original test equivalence cannot be asserted. |
| `09_REVIEW_UI_AND_WORKFLOWS.md` | [UI evidence](UI_VERIFICATION.md); spectrogram, aligned review and correction-history cards remain open. |
| `10_AGENT_PROMPT_TEMPLATES.md` | `semantic`, `briefs`, `agent-tools`; raw media text remains untrusted. No missing prompt has been fabricated. |
| `11_HANDOFF_AND_RESUME.md` | [Verification](VERIFICATION.md), [reflection](REFLECTION.md), board evidence and goal handoffs. Historical receipts keep their original scope. |
| `12_SCHEMA_CHANGELOG.md` | [Versioned contract](CONTRACT.md) explicitly distinguishes the current implementation from the original starter envelope. Full unseen-schema compatibility is unknown. |

Also absent at their stated paths: `config/atlas.proposed.defaults.json`,
`scripts/validate_pack.py`, `validation/check_1.log`, `validation/check_2.log`;
and the implementation pack's config/schema/example directories, synthetic
fixture generator and `scripts/test_*.py` suite. Exact unprovided test filenames
are unknown. The implementation pack's `sources.json` revision is unavailable;
the older design register exists in its ZIP. The named `references/original_design/`
directory is absent, but its content can be read from the separately supplied ZIP.
See [machine-readable inventory](pack-input-audit.json) for every member/hash.

## Substitute proof matrix

This matrix is a local acceptance plan, not a recreation of the missing36tests.
Existing tests often use fabricated observations or injected runners. Their
passing assertions prove only the stated mechanics, never acoustic accuracy.

| Requirement / proof to collect | Existing evidence and explicit gap |
| --- | --- |
| Composition/recording/source/PCM/view identities stay distinct | `audio-atlas-contract.test.mjs`; composition remains unresolved owner reference. |
| Rational and piecewise maps, rounding, padding, unmapped gaps | Contract fixtures; real individual stem alignment still requires shifted/drifting/partial examples. |
| Half-open intervals and points at query boundaries | `audio-atlas.test.mjs`; include effective correction timing/search and original evidence. |
| Stereo, partial frames, silent clips, sum lag | `scripts/test_audio_atlas_worker.py`; mathematical signal fixtures, no individual-origin claim. |
| Source preservation, tampering and idempotent ingestion | Atlas owner fixtures plus real Brave Tongues source hashes; broaden intake/policy cases under their cards. |
| Schema/payload/units, unknown uncertainty and state separation | Contract negative fixtures; no fabricated confidence or unsupported-kind success. |
| Same-run corrections, concurrency and original/effective queries | Owner/UI tests and correction-query receipt; cross-run approved correction lineage still missing. |
| Jobs, cancellation, recovery and publication failure | Injected runner tests cover state mechanics; real process kill/lease/checkpoint recovery remains required. |
| Cache invalidation and source/model/runtime identity | Source/worker changes and corrupt-result tests; exact model/runtime and policy variants require adapter/recovery proof. |
| Authorization, purpose filtering and archive/path security | HTTP origin/auth and basic traversal rejection exist; per-asset filtering and hostile portable package cases remain open. |
| Embedding-space isolation and query-only retrieval | Same-space fixture/fixed-category execution exists; arbitrary text, catalog/stem indexing and relevance evaluation remain open. |
| Portable export/import and authorized redaction | Current export evidence only; import round trip, redaction cascade and tombstone checks remain required. |
| Runtime offline behavior and adapter health | Real qualified profiles documented; local dependency manifests, denied-network probes and failure cases must be recorded per adapter. |
| Real speech and sung word/phone/syllable alignment | Song word candidates exist; real speech, forced acoustic phones/nuclei and human boundary labels remain required. |
| Pitch, energy/pitch peaks and phonation/reverb separation | Not supplied by current waveform/word outputs; retain silence, consonant, vibrato, overlap and reverb cases. |
| Rhythm, structure, harmony, notes and source activity | Beat/downbeat execution exists; changing tempo/meter, section boundary versus names, note quality and source hypotheses remain open. |
| Diarization, vocal delivery, sound events and semantics | No current execution/quality proof for these families. Respect anonymous layers, consent/access and uncertainty. |
| Briefs, comparison and agent/pipeline parity | Technical counts/queries exist; bounded evidence-backed semantic briefs and complete operation registry remain open. |
| Review UX and missing-media indicators | Browser/UI/inventory receipts exist; synchronized A/B, spectrogram, history and alternatives remain separate gaps. |
| Cold/warm performance and real human quality | One song run is not a benchmark corpus. Collect peak memory, failure/recovery, runtime factor and held-out human labels. |
| Repository and native release acceptance | Three test repairs verified; remaining failures, native smoke, broad checks and focused commit remain open. |

[Machine-readable acceptance](substitute-acceptance-matrix.json) contains all56
cards and every exact numbered criterion from the authorized gap plan. Each starts
`not-accepted`: this artifact does not supersede current board reviews or grant
acceptance. Proof links are pointers, not inferred passes. A verifier checked
one-to-one card/criterion coverage, dependency references, hashes and local links.

## Recovery and continuation

The missing implementation pack cannot be recovered from the supplied folder or
these two archives. If an additional source is later supplied, compare its exact
revision and append a discrepancy review before changing requirements. Do not
silently replace this matrix or claim the original suite was run. The existing
56-card objective stays intact; unavailable specialist outputs stay explicit.
The original example validator can be retried in an already-qualified environment
with `jsonschema`; that is separate from recovering the absent36tests.

Reflection / Lesson candidate: an archive checksum confirms identity, not that it
contains the package described by adjacent launch instructions. Preserve the
mismatch as input provenance and maintain requirement-to-proof traceability.
No app code, models, media, review authority or runtime services changed in this
checkpoint. The focused completion commit remains behind owner verification gates.
