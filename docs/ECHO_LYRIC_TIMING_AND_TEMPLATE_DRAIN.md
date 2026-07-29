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
