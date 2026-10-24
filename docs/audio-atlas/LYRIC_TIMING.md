# Whole-song lyric timing with the Audio Atlas

Status: active protocol (2026-10-09, Calder). The Audio Atlas is the owner of Echo song
understanding and measured lyric timing. It runs local MLX models on Apple Silicon. Do not
regress to the older Hapa Music Viz `enrich_suno_playlist_lyrics.py` / whisper.cpp / ggml path
because it looks simpler; that path is **legacy** and is only kept so previously accepted
timing remains readable.

## Models (local, already configured; nothing is downloaded at run time)

| Purpose | Model | Config |
| --- | --- | --- |
| Transcription with word timestamps | `mlx-community/whisper-large-v3-mlx-4bit` (MLX Whisper) | `data/audio-atlas/local-model.json` |
| Forced alignment of the supplied lyrics | `mlx-community/Qwen3-ForcedAligner-0.6B-8bit` (MLX Audio) | `data/audio-atlas/alignment-model.json` |

Whole-song transcription prefers the song's **isolated Lead Vocals / Vocals stem** from its single current stem set (`src/domain/echo-stem-set.js`). The catalog repair can compare that transcript with a separate transcription of the exact master recording. These are two views through the same recognizer, not independent models. Never analyze duplicate stem files or both formats.

## Procedure (one song)

```sh
# 1. Atlas analysis with transcription (structure, harmony, beats, CLAP, pitch, MLX Whisper words)
node cli/audio-atlas.mjs analyze SONG_ID --transcribe --beats --acoustic --pitch-source=stem-N

# 2. Window the canonical lyrics with the Atlas transcript, then forced-align every window
node scripts/atlas-lyric-timing.mjs plan --song=SONG_ID --out=WORK_DIR
node scripts/atlas-lyric-timing.mjs align --plan=WORK_DIR/plan.json      # resumable; one Atlas job per ≤30 s window
node scripts/atlas-lyric-timing.mjs assemble --plan=WORK_DIR/plan.json --candidates=WORK_DIR/candidates

# 3. Promote through the shared gate (dry run first), then sync Song Card + Director project
HAPA_ECHO_LYRIC_CANDIDATE_DIR=WORK_DIR/candidates \
HAPA_ECHO_LYRIC_TIMING_DESTINATION=$PWD/data/echo-lyric-sources/lyric_timings \
HAPA_ECHO_LYRIC_CANDIDATE_REPORT=WORK_DIR/promotion-report.json \
node scripts/promote-echo-lyric-timing-candidates.mjs            # then repeat with --apply
node scripts/sync-dear-papa-lyric-timings.mjs --registry-track-ids=SUNO_ID   # then repeat with --apply
```

For an album batch, run step 1 through the Atlas album coordinator
(`work/atlas-album-pass-*/batch/atlas-batch.mjs`) and steps 2–3 per song.

## What each step guarantees

- **plan** maps every canonical lyric line (exact Song Card lyric bytes, so `lyricsSha256`
  equals `lyrics.sha256`) onto MLX Whisper word candidates by longest common subsequence,
  interpolates the few unmatched lines between anchored neighbours, and groups lines into
  windows of at most 30 s (the Atlas aligner's excerpt limit) with 1 s padding.
- **align** submits each window to the canonical Atlas owner (`createAudioAtlas().start`) with
  `alignment: {sourceId, startSeconds, endSeconds, text}`, waits, and records the run ID. Alignment-only jobs reuse the transcript run’s exact-source asset measurements (including hash-checked spectral artifacts), so each excerpt does not repeat full stem analysis. Changed source sets or corrupt parent evidence refuse reuse. Prior word candidates and reviews are not inherited. The API accepts `alignmentBaseRunId`; the CLI exposes `--alignment-base-run=RUN`.
  Each window is an ordinary Atlas job: same cache identity, provenance, cancellation and
  review surfaces. Re-running resumes from the first incomplete window.
- **assemble** maps every Qwen3 word interval back to its lyric line by character offset and
  places each unsupported word (`matched: false`) *between its aligned neighbours* by character
  weight with `echoLyricResolvedWordIntervals` (the same resolver the renderer uses). A word the
  aligner skipped between two adjacent matches borrows up to half of each neighbour (≥ 150 ms);
  leading/trailing unmatched words extend the line up to 0.3 s per word into the surrounding
  silence; out-of-order matches lose their anchor. Word intervals never overlap. (Before
  2026-10-09 unmatched words were spread over the whole line and overlapped aligned words —
  Hey Sister had 26 such overlaps.) The October 13 repair resolves crop-prefix conflicts before deriving line bounds; it no longer clips a line after resolving its words. Unexplained cross-line acoustic conflicts stop assembly for review. Consecutive missing lines share their available gap. The step writes a
  `hapa.suno_playlist_lyric_timing.v1` file plus `.stt.json` sidecar with engine `audio-atlas-mlx`.
- **confidence** = aligned-word ratio × agreement ratio, where agreement is the share of aligned
  words whose start lies within ±1 s of their uniquely matched, monotonic transcript occurrence from MLX Whisper. Counts are recomputed after anchor demotion; each line retains disagreement/needs-review evidence. This threshold is a compatibility check, not a promise of sub-second accuracy. It is cross-model machine
  evidence, not human review. `low_match_ratio` (< 0.6) and `many_unmatched_lines` (> 20 %)
  warnings block promotion exactly as before.

## Promotion and supersession

`src/domain/echo-lyric-promotion.js` accepts `audio-atlas-mlx` as a measured engine alongside the
legacy whisper.cpp engines; every other gate (≥ 0.60 confidence, interval validity, sidecars,
audio/lyric hashes) remains required. The gate recomputes line ordering, duplicate starts, word ordering and word containment from actual intervals; clean summary statistics cannot bypass those checks. An accepted Atlas candidate supersedes accepted legacy
whisper.cpp timing for the same lyrics (`audio-atlas-supersedes-legacy-engine`), because the two
engines' confidence scales are not comparable. A re-assembly of the same engine's evidence (same
audio and lyric hashes, no stat regression) that has fewer overlapping word intervals is promoted as
`word-interval-repair`. Promotion backs up the replaced files.

## How timing reaches the screen

`src/domain/echo-lyric-template-runtime.js` never hides a supplied timed lyric line and production frames never
print timing provenance (it stays in `data-timing-mode`, `data-timing-reason` and
`data-timing-label` on the overlay element):

- **word** mode — every word anchored, *or* at least half anchored, *or* first and last words
  anchored with at least a third anchored. Unanchored words animate on their interpolated
  interval (`timingPolicy.interpolatedWords`).
- **phrase** mode — no usable anchors, too few, or synthetic timing. Multi-word templates show the
  line statically (paged by the template's word limit so it never overflows); one-word templates
  (Center Word Focus, Prism Slam, Letterfall Totem) still step through the interpolated words.
- One-word templates hold the last sung word through gaps between words, so they never blink out.

`renderEchoLyricSurface` lays out one box per word in every mode, clamps each panel to the
title-safe width, and shrinks the font until no word is wider than its column and the panel fits
the safe area (vertical included). A token that still cannot fit may break inside itself.

`scripts/sync-dear-papa-lyric-timings.mjs` reads `data/echo-lyric-sources/lyric_timings/` first, so
promoted Atlas timing reaches the Song Card and Director project even for songs that are not yet
in the Suno playlist snapshot.

## Limits

Supplied-text Qwen alignment currently requests `language: 'English'`. The catalog transcription path can auto-detect language and preserves Unicode lyrics, but this does not qualify the Qwen route for every language. Unsupported passages remain held for review. A forced aligner can place supplied words on silence; the
Atlas RMS abstention and the MLX Whisper agreement term are the guards, not proof of performance.
No syllable or phoneme timing. Human review of boundaries remains open.

## Saved cuts and repair scope

A saved cut may own `project_patch.timed_lyrics`, overriding the current base timing. Sync deliberately does not rewrite historical cuts. For an operator repair, append a timing-refreshed child of the intended saved cut, preserve its visual settings, and check manual timing corrections/locks before replacing timing. Reopen the song and choose the corrected cut. A valid timestamp structure is not independent listening acceptance.

The October 13 implementation reuses the existing Atlas owner, worker lifecycle and promotion/sync routes. Its source-bound reuse reduces worker count (one alignment worker, with bounded FFmpeg decoding, per excerpt); it adds no background scheduler, model download or external provider. See [the systemic-repair postmortem](../postmortems/2026-10-13-echo-lyric-timing.md).

## Explicit unsupported-text receipts

When canonical written lyrics contain a passage unsupported by the actual performance, do not force that passage onto a repeated chorus. A reviewed plan may explicitly list `timingOmissions` with unique zero-based `lineIndex`, exact canonical `text`, and a nonempty `reason`. Assembly refuses stale, duplicate or invalid receipts and refuses omitting every line. Preserve the full written lyric file and its hash; retain canonical indexes and the receipt in provenance. The confidence denominator still includes all canonical words, so omissions cannot raise coverage by removing failures. This is a reversible derived-display choice, not permission to alter the source lyrics or a claim of human listening review.

### Correction: transcript absence does not authorize omission

Calder rejected the October13 Wide and Narrows omission. Preserve every written line and hold unresolved passages for root-cause review. The omission mechanism above is not a recommended default: absence from one transcript is insufficient, and a passed whole-song score does not establish performance coverage. Separate non-lexical ad-libs from unsupported lexical passages; compare master/vocal sources, source versions and repeated-section structure. Display omission requires an explicit operator decision for the passage. An unanswered preference question is not that decision. See the amended postmortem for the withdrawn candidate and complete-lyric restoration.


## Catalog repair and passage coverage — October 13

The shared planner now splits punctuation into recognition tokens while retaining the exact display text. A weighted monotonic sequence match gives distinctive words more weight than common words. Each observed occurrence is consumed once; a repeated written chorus cannot reuse one performed occurrence. A few matches such as “go” and “the” cannot establish an entire verse. Consecutive missing lines share a proposed search gap, and a line longer than the forced aligner's 30-second crop limit is held instead of silently truncated.

Prepare a whole-catalog report using existing analyses:

```sh
node scripts/atlas-lyric-mass-heal.mjs --out=WORK_DIR
```

The explicitly requested mass analysis adds `--analyze-missing --compare-master`. These flags run the existing local Atlas worker sequentially, with its source hashing, cache, cancellation, timeout and cleanup. No scheduler, external provider, new runtime or model download is created. Each invocation has a fresh candidate directory recorded in `report.json`; a rejected result cannot accidentally promote an old candidate left in the output folder. `--song=SONG_ID` bounds a diagnostic to one song.

The report separates accepted candidates, held passages, missing written lyrics and protected manual timing. It compares primary, master and per-line combined evidence. If both recordings support a passage but disagree about its occurrence by more than two seconds, the song is held rather than choosing whichever whole-song confidence is larger. Exact source and lyric hashes must agree before comparison. The same written lyrics are preserved in every candidate; absence from a transcript never authorizes omission.

The transcript-timestamp route uses measured MLX Whisper word candidates directly and interpolates only unsupported display words between the accepted anchors. Its confidence is the share of canonical display words with transcript timestamps. The receipt explicitly says **single-model evidence**; it does not claim Qwen validation or independent model agreement. The existing Qwen route remains available for bounded refinement and has independent Whisper agreement evidence. Both routes use the same interval resolver and promotion gate.

V2 promotion requires local passage coverage in addition to the whole-song score and actual interval checks. An unsupported line, implausibly compressed line, omitted written line or contradictory occurrence holds the candidate. A high chorus score cannot conceal a missing verse. These are conservative machine acceptance checks, not a guarantee of audible precision or human listening approval. Unsupported non-lexical ad-libs and authored performance instructions remain reviewable rather than being erased.

Source-selectable transcription is exposed on the shared owner/API as `transcriptionSourceId`, `transcriptionLanguage` (`en` or `auto`), and `transcriptionBaseRunId`. CLI equivalents are `--transcription-source`, `--transcription-language` and `--transcription-base-run`. Reuse is allowed only for a transcription-only request with identical current source hashes and valid parent measurements; it copies asset measurements, not old transcript words or reviews. The existing worker takes the short transcription path and retains the same bounded decoder/process boundary.

Before sync, the owner checks full line preservation and current master/lyric hashes for V2 candidates. Manual timing edits and line/word locks protect the entire song from automatic replacement. Concurrent changes to Song Card or Songbook files abort publication. Promotion still backs up replaced sources; sync backs up changed stores/projects. Saved visual cuts remain append-only: deliver a timing child through the existing fork API, retaining parent visual timelines/settings, and verify that its saved timed lyrics match the synced candidate.

A catalog containing lyrics that were never performed cannot truthfully receive a universal “all words timed” stamp. Keep those songs in the review report with their full source and previous cuts, after checking source identity and both recordings. Do not loosen these rules merely to raise a healed-song count.


### Boundaries and spelling differences found during the full pass

A common recognition error absorbs preceding silence into a phrase's first word. Compare corresponding written-token positions across recordings before calling it a different occurrence: the median residual distinguishes one bad leading timestamp from a shifted phrase. A first-word boundary can use the other source's measured interval only when at least two surrounding token starts (and at least two-thirds of the common tokens) agree within0.7s, the ends agree within0.35s, and the alternative interval is less than half as long. Keep the old/new boundary and source run receipt. A mixed-source overlap of at most0.12s can demote the conflicting prefix anchor for interpolation; larger or unexplained overlaps remain held. Never clip already-resolved measured words just to pass validation.

Small spelling-like differences are recovered only in one-to-one gaps of at most two tokens beside a distinctive exact anchor in the same written line. Words must be at least four letters, share their first letter, differ by exactly one edit, and not be common stopwords; a recorded word interval longer than five seconds is ineligible. Preserve the recognized spelling and source token index alongside the written spelling. This addresses Caro/Cabo/Carol next to Dario without introducing a global fuzzy match that could anchor a missing verse.

Where master and vocal recognition still disagree on an occurrence, existing Qwen runs can corroborate one hypothesis. The run must share the current master/source hashes, supplied line text must match exactly, and one or two recognized tokens (depending on line length) must agree with Qwen within one second. Both supported or neither supported stays unresolved. The timestamp receipt remains recognition-derived; Qwen is recorded separately as occurrence corroboration. Do not recompute a dual-model confidence from this narrow use.

Before labelling an empty lyric field a missing source, inspect its original archive metadata. In this201-song pass, all14 empty lyric sources have `make_instrumental: true` and empty generation prompts in the archived source copies. They are instrumental-labelled source records, not fourteen failed lyric alignments. This is an original generation setting, not a human listening certificate.

### Recording identity before timing publication

Preparation and sync share the canonical Songbook lineage registry ID, with the same legacy fallbacks. An audio projection can retain another take's registry ID even while its URI/local path correctly names the current take. The catalog pass found two such stale fields (Quitting the Moon and I forgot what the mirror said last time). Using the audio field alone caused a candidate filename collision; the master-hash sync guard refused it before any song timing changed. The incorrectly keyed source was preserved and withdrawn, then the affected candidates were rebuilt under distinct canonical IDs. Original audio/lyric records were retained.

A shared canonical registry ID now holds both catalog records before candidate publication, preventing one candidate from overwriting another. Resolve identity rather than matching by title; keep current master/lyric hash checks even when IDs agree. This check does not rewrite the underlying audio projection metadata or claim that unrelated consumers have been migrated.
