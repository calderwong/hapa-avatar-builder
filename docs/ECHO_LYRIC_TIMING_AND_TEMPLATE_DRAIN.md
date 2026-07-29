# Echo Album Lyric Timing And Template Drain

Status: board-ready implementation program  
Created: 2026-07-29  
Board project: `hapa-echo-music-video-direction`

## Objective

Repair lyric text and word timing across all 157 live Echo Director projects,
starting with the songs added after the older 79-project audit. Lyrics must be
optional per Director cut, offer several deterministic animated templates, and
render identically in Preview and the MP4 frozen into a minted Song Card
edition.

## Evidence And Reuse Decision

- Reuse the canonical `timed_lyrics`, `lyric_variant`, shared Echo playback
  clock, `HapaLyricViz`, Native Show Graph lyric overlay, HyperFrames compiler,
  and Song Card mint fingerprint/render-freeze paths.
- The prior completed lyric cards prove an older 79-project state. They do not
  prove the current 157-project album, so the new pass supersedes their coverage
  claim without rewriting their historical evidence.
- Adapt Anime.js `animate()`, `splitText()`, keyframes, and stagger concepts for
  interactive template choreography. Keep the template description
  renderer-neutral so HyperFrames can deterministically reproduce the same
  word states and poses during offline export.
- Do not introduce Remotion in the first pass. HyperFrames already owns the
  deterministic mint render path; a second exporter would increase parity risk
  before timing truth is repaired.

Reference: <https://animejs.com/documentation/animation/>

## Canonical Lyric Contract

Each saved Director cut must carry:

- `lyrics.enabled`: explicit boolean, defaulting to `true` for backward
  compatibility.
- `lyrics.templateId`: a stable template identifier.
- `lyrics.timingSource`, `timingHash`, `audioHash`, and confidence/QA state.
- canonical line and word intervals in seconds, plus explicit operator
  correction receipts rather than destructive source rewrites.
- safe-area, reduced-motion, placement, and style settings that participate in
  the semantic mint fingerprint.

Turning lyrics off must preserve the selected template and timing data. It must
remove the overlay from Preview and exported/minted video while retaining
captions and provenance as separate package artifacts.

## Initial Template Set

1. `kinetic-word-burst-v1` — split-word entrances, staggered impact, restrained
   bounce, and active-word scale/weight.
2. `scanline-phrase-ribbon-v1` — readable phrase window with a precise active
   word scan and underline.
3. `stacked-hook-echo-v1` — hook phrases stack, echo, and decay without obscuring
   the active word.
4. `orbit-caption-v1` — words follow a bounded arc or side rail around protected
   face/product regions.

Every template consumes the same canonical word intervals. Animation may add
lead-in or decay frames, but it may not move the spoken-word highlight outside
its source interval.

## Timing Truth Gate

- Verify exact audio identity before alignment.
- Prefer an isolated lead-vocal stem; otherwise use the verified master mix and
  label the fallback.
- Compare lyric text to the canonical source before forced alignment.
- Store word-level start/end, source hashes, confidence, and repair lineage.
- Fail closed on overlap, negative duration, word-outside-line bounds, large
  drift, audio mismatch, missing provenance, or unreviewed low-confidence spans.
- Prioritize recent songs, then drain the remaining album by worst measured
  confidence/drift.

## 157-Project Baseline

The read-only v4 audit replaced the older completion assumption with current
evidence:

- 157 live Director projects; 78 are absent from the preserved 79-project
  baseline and therefore form the recent-song cohort.
- 143 vocal projects began with synthetic weighted timing rather than
  source-linked audible alignment.
- The other 14 projects are source-declared Suno instrumentals, not missing
  lyric records. Their intentionally empty lyric files are preserved and
  Lyrics now defaults off for those Director cuts.
- 52 projects include metadata/stage-direction rows in the active overlay.
- One project has a measured canonical-text mismatch.
- The first promotion pilot has verified two recent vocal projects plus all 14
  intentional instrumentals. The remaining vocal projects stay in the drain.
- Every vocal project has local audio for repair: 82 have an isolated
  lead-vocal stem and 61 have a verified master-mix fallback.

Evidence:

- `artifacts/echo-lyric-quality-v4/baseline.json`
- `artifacts/echo-lyric-quality-v4/baseline.md`
- `tests/echo-lyric-quality.test.mjs`

This baseline is intentionally stricter than structural JSON validation.
Synthetic timing can be monotonic and still be visibly or audibly wrong.

## Preview-To-Mint Rule

Preview, HyperFrames export, and Song Card mint must evaluate one lyric overlay
contract at identical timestamps. Mint preflight must compare fixed lyric
boundary frames and reject an edition when:

- enabled state differs;
- template or settings differ;
- timing/content hashes differ;
- the burned-in MP4 does not contain the expected overlay;
- the disabled case unexpectedly contains lyric pixels.

Captions may still be packaged when burned-in lyrics are disabled, but the
distinction must be explicit in the edition manifest.

## Learning Delta

What worked: existing word-aware Hapa lyric templates and deterministic
HyperFrames compilation provide a strong base.

What was noise: treating schema validity and an older album-wide audit as proof
that humans see correct lyrics at the correct moments.

What changed: lyric completion now requires text truth, measured timing quality,
operator-review state, and Preview/MP4/mint pixel parity across the live
157-project album.

Reusable guardrail: never mark a lyric pass complete from field presence or
compiler success alone; require source hashes, timing metrics, visible fixed-time
evidence, and mint artifact verification.

## 2026-07-29 Measured-Alignment Checkpoint

Objective: replace synthetic timings safely, recent songs first.

Evidence inspected: the current Suno export, its enriched stem projection,
canonical lyric files, Whisper word sidecars, the 157-project Director audit,
and full-album compile output.

What worked: the existing Music Viz Whisper/forced-alignment path produced
0.871 confidence from an isolated vocal stem and 0.756 from a verified master
mix. Both promoted cleanly after source hashing and structural validation.

What was noise: empty lyric files initially appeared to be missing data, but
their Suno metadata explicitly declares all 14 songs instrumental.

What was misunderstood: a base playlist manifest can lag the enriched stem
projection. Using only the base entry silently selected a full mix even when an
isolated vocal stem already existed.

What changed:

- enriched stem paths are preferred without transferring canonical ownership;
- exported title rows are excluded from sung-text alignment;
- audio and lyric SHA-256 hashes travel with each timing sidecar;
- every word is guaranteed a positive interval inside its line;
- a 0.60 measured-timing promotion gate rejects weak, synthetic, unprovenanced,
  overlapping, or duplicate-start results;
- 14 instrumentals now default Lyrics off;
- two recent vocal projects have measured timing, while the 0.586
  source/performance-divergent pilot remains unpromoted.

Reusable guardrail: playlist timing generation and Director promotion are
separate steps. A generated sidecar is evidence to evaluate, never permission
to replace the live cut.

## 2026-07-29 Template-Runtime Checkpoint

Objective: make the four lyric delivery choices deterministic and portable
across Preview and HyperFrames.

Evidence inspected: the existing five legacy preview variants, the normalized
four-template contract, Native Show Graph lyric overlays, the executable
HyperFrames compiler, and a real bounded offline package.

What worked: the existing preview styles supplied useful visual direction, and
the lyric contract already carried a stable template ID into the Show Graph.

What was noise: five legacy dropdown entries implied five templates even though
Phrase Window and Scanline Ribbon mapped to the same normalized choice.

What changed:

- the picker now exposes exactly Kinetic Word Burst, Scanline Phrase Ribbon,
  Stacked Hook Echo, and Orbit Caption;
- one frame-quantized, side-effect-free runtime computes visibility, active-word
  state, progress, opacity, translation, rotation, scale, and underline state;
- the browser-exported runtime is generated from the same functions and has a
  fixed-time equality test against Preview;
- HyperFrames preserves the selected contract instead of hardcoding Phrase
  Window, emits no lyric instance when Lyrics is off, and burns deterministic
  per-word spans into the offline composition;
- a real 10-second HyperFrames package passed lint, inspection, media preflight,
  and offline validation with zero network dependencies.

Reusable guardrail: a template name in a manifest is not renderer parity.
Preview and export must evaluate the same fixed-frame state and retain that
state in the render receipt.

## 2026-07-29 Recent-Song Drain And Mint Checkpoint

Objective: finish the safe automatic pass for recent songs, cover preserved
non-playlist Director sources, and make the mint renderer fail closed on lyric
drift.

What worked:

- three bounded recent-song batches plus the preserved `Tide You Go Low` master
  raised the verified project count from 25 to 71;
- the remaining recent queue contains no missing automatic alignments: eight
  low-confidence or source/performance disagreements are isolated for review;
- a generated read-only alignment manifest resolves 139 unique vocal songs
  across all 157 Director projects without claiming Suno playlist membership;
- the production HyperFrames compiler records the enabled state, template,
  line count, runtime schema, frame quantization, and canonical lyric contract
  hash;
- the Song Card renderer compares that receipt to the exact saved Preview
  contract before MP4 work and refuses mismatched text, timing, template, or
  Lyrics on/off state.

Evidence:

- `artifacts/echo-lyric-quality-v4/alignment-manifest.json`
- `artifacts/echo-lyric-quality-v4/drain-plan.json`
- `data/song-sync-reports/latest-dear-papa-lyric-timing-sync.json`
- `/private/tmp/hapa-echo-lyric-parity-proof-20260729-1/compiler-report.json`
- `tests/song-card-local-workflow.test.mjs`

Reusable guardrail: external/local masters belong in an explicitly
non-membership alignment projection. Never add them to a playlist merely to
make a pipeline accept them, and never mint when the compiled lyric contract
receipt differs from the saved Preview contract.
