# Avatar Likeness Assignment — Plan

Status: design (proposed, not yet implemented)
Date: 2026-08-23 (Pacific)

## Objective

For every media record that **passed the Human Enricher** (durable Quick Sort
state `accepted`), automatically determine which Avatar Card it most closely
resembles, assign that Avatar with full evidence, and let the Echo Album
Director consume the assignment — so shots stop landing as
`Avatar Card | untyped` and get typed cast attribution instead.

The whole system is local-first, deterministic where it can be, evidence-bound
where it can't, and human-gated before the Director may use it.

## Nearest existing surfaces (Turn-to-Lore)

| Surface | What it already does | Reuse / adapt / leave alone |
| --- | --- | --- |
| Quick Sort decision ledger (`data/human-video-quick-sort-decisions.json`) | Durable `accepted` boundary with videoKey/videoId/aliases/actor/origin | **Reuse** — likeness verdicts append a new decision type to this family |
| Optical campaign jobs (`data/human-video-optical-campaign.json`, 1,121 jobs) | Attested First/Mid/Last frame receipts with 3–8 color palettes (label + explanation) per frame | **Reuse** — frame paths + palette words feed the signature without new vision calls |
| Enrichment records (`data/human-video-enrichments.json`, 204) | `description`, `categories`, `tags`, `quality`, `directorNotes`, `avatarMentions` | **Reuse** — text channel inputs |
| Character Sheet media intelligence (`summarizeAvatarMediaIntelligence`) | Per-avatar OCR lines, vision labels, tags, symbolic motifs | **Reuse** — the avatar-side text channel |
| `candidateScore` in `human-video-reference-review.js` | Tokenized weighted text-overlap similarity | **Adapt** — same technique, different operands |
| `dominantColor(pixels, bucketSize)` in `scripts/create-backgroundless-closeup-videos.mjs` | Quantized-bucket color extraction precedent | **Adapt** — generalize into the shared feature module |
| `heal-dossier-avatar-mismatches.mjs` | Text-phrase identity recovery from dossier media | **Leave alone** — it recovers Avatar identities, not visual likeness; motivator only |
| Reference review (`MATCH_TYPES` already includes `"palette"`) | Matches media → external Hapa references | **Leave alone** — different objective (references, not Avatar identity) |
| Echo Avatar Cast Registry + screenplay `avatarContinuity` | Human-curated Red/Blue/Green directors; `castAppearances` with `evidenceBasis` | **Leave curation alone**; the Director *consumes* accepted likeness into these structures |
| Preview-recording runtime store pattern | index.json + blobs, serialized writes, retention, gitignored runtime data | **Adapt** — shape of the two new runtime stores |
| Record Garden / Quick Sort review UI | Human accept/reject/edit lanes that never block other work | **Adapt** — the Likeness review lane |

Nothing here is replaced. The reference loop and dossier healing keep their
jobs; this plan adds the one missing axis: **media → Avatar identity**.

## What is missing today

- Avatars carry no pixel-level likeness fingerprint (intelligence is
  OCR/vision-label/tag text only).
- Accepted enricher media has rich *descriptive* signals and LLM palette
  words, but no deterministic pixel signature, and nothing connects it to
  any Avatar.
- The Director has no principled way to type a shot's Avatar; `flowType`
  falls through to `untyped` in the EDL.

## Architecture (four layers)

### L1 — Deterministic visual features (zero LLM cost, pure Node)

New module `src/domain/media-visual-signature.js`:

- **Palette histogram**: downscale → quantize into a 6×6×6 RGB cube (216
  bins) → keep top-K weighted bins. Same quantization family as the
  `dominantColor` precedent. Works identically on both sides of the match,
  which is the whole point.
- **dHash**: 8×8 grayscale perceptual hash (downscale to 9×8, threshold
  neighbors). Hamming distance over 64 bits is the coarse identity/shape
  channel; an Avatar keeps a small set of its distinct hashes and the match
  uses the best.
- **Luma/chroma vector**: mean RGB + saturation — cheap global tone signal
  that separates dark-moody from bright clips.
- **Frame acquisition**: images pass through directly; videos yield
  First/Mid/Last via ffmpeg (`/opt/homebrew/bin/ffmpeg` confirmed present),
  PNG output — the same three-frame contract the optical review uses, and
  ffmpeg decoding avoids adding an image npm dependency to the repo.
- No new dependencies. Node-only (server/scripts); the browser UI never
  computes features.

### L2 — Avatar likeness profiles (one-time + incremental)

New runtime store `data/avatar-likeness/profiles.json` (gitignored,
documented in `data/README.md`; serialized-write + retention pattern from the
preview-recording store). One profile per Avatar Card:

- Merged feature set across the Avatar's attached media:
  - backgroundless/extracted full-body and close-up images — weight 1.0
    (cleanest identity signal);
  - video First/Mid/Last frames — weight 0.8;
  - dossier/kit/tarot-linked images — weight 0.5 (context, not identity).
- Text channel assembled from existing intelligence: OCR lines, vision
  labels, tags, symbolic motifs (all already computed by the Character
  Sheet), plus cast-registry identity invariants where present.
- **Content-hash keyed**: a profile is only recomputed when the Avatar's
  asset fingerprints change; 74 cards profile in seconds.
- Coverage report: Avatars with no usable visual asset get *no* profile and
  are listed as `profileless` (the Character Sheet gap machinery already
  tracks empty media slots; this surfaces the likeness-side consequence).

Wiring: `cli/avatar-builder.mjs` gains `avatars likeness:profile
[--all | --avatar <id>]` (dry-run default, `--apply` writes the store);
API `GET /api/avatars/likeness` (admin-gated like the other Avatar
surfaces) serves profile summaries for the UI.

### L3 — Media signatures + matcher (over accepted media only)

New runtime store `data/human-video-likeness-signatures.json`, keyed by the
same `videoId`/`contentFingerprint` identities the enricher ledger uses:

- Signature = L1 features over the optical review's registered frames +
  the enrichment text fields + the LLM palette color-words.
- `truthBoundary`: *"claims deterministic pixel measurements and text
  overlap only; never identity."*

New module `src/domain/avatar-likeness-match.js`:

```
score(media, avatar) =
    0.45 × paletteHistogramSimilarity      (Bhattacharyya over 216 bins)
  + 0.25 × dHashSimilarity                 (best over the Avatar's hash set)
  + 0.20 × textOverlap                     (candidateScore-style tokens:
                                           media description/categories/tags
                                           vs Avatar OCR/labels/tags/motifs)
  + 0.10 × colorWordOverlap                (optical palette labels/explanations
                                           vs Avatar profile color words)
```

- Weights are module constants, explicitly tunable, deliberately
  pixel-majority: a likeness that "looks like" the Avatar matters more than
  one that talks like it.
- Per media: top-5 candidate table with every component score persisted.
- Verdict gate: **`assigned` only when best ≥ 0.55 AND margin over runner-up
  ≥ 0.10**; otherwise `unresolved` with reasons (too close / nothing above
  floor / Avatar profileless). Both verdicts are honest states.

Batch pass: `scripts/avatar-likeness-match.mjs` —
`npm run likeness:match` (dry-run report) / `--apply`. Scope is exactly the
durable `accepted` set (3,133 readable per the Human-Accepted Director Pass
evidence); 3,133 × 74 ≈ 232k cheap vector compares = a few minutes.
Report lands in `artifacts/enrichment/` + `data/merge-reports/` with
backup/recovery pointers per repo convention.

### L4 — Human acceptance gate + Director consumption

- Verdicts are **proposals**, not truth. The Human Enricher UI grows a
  **Likeness lane** (Record Garden / Quick Sort pattern: preview the top-5
  table, accept / edit to a different Avatar / reject). Accepted decisions
  append to the Quick Sort decision family as a new decision type
  (`origin: "avatar-likeness"`, carrying the full score receipt). The lane
  is browsable and non-blocking — nothing else waits on it.
- **Director integration** (final phase): the Human-Accepted Director Pass
  consults accepted likeness decisions for each placed media and, when
  present, sets typed `castAttribution` / `castAppearances` with
  `evidenceBasis: "likeness-accepted-v1"` and selects the Avatar's
  best-matching media as the shot's seed asset. The EDL label upgrades from
  `Avatar Card | untyped` to `Avatar Card | <Avatar name>`.
- Delivered as an **append-only Director variant** (`avatar-likeness-v1`);
  legacy projects stay immutable, exactly as the Human-Accepted pass did.

### Standing guardrail (carried from the acceptance-boundary lesson)

**Acceptance is the boundary; likeness is the placement.** The Director
never infers Avatar identity from a raw likeness score, a description, a
palette, or a prior selection. Consumption requires the durable human
decision receipt, and a post-run audit resolves every typed shot back to the
accepted likeness set — same audit shape the Human-Accepted pass records.

## Explicit non-goals and known limits

- **v1 is appearance similarity, not face identification.** Palette + dHash
  will confuse same-costume or same-scene Avatars. The margin gate, the
  top-5 transparency, and the human lane absorb that; nothing auto-applies.
- Optional phase 4: a local face-embedding channel (heavier model, cost-
  benchmarked the way the enricher benchmarks are) as a weight-adjusted
  fifth term behind a flag. Only after the deterministic channels are in
  production and their error profile is observed.
- Media with empty descriptions (common in the current ledger) rely on the
  pixel channels alone — that is a supported, scored case, not an error.
- Profileless Avatars stay out of matching; their media stays `untyped`
  with an honest reason, and the coverage report says so.

## Phasing and verification

| Phase | Scope | Gate |
| --- | --- | --- |
| 1 | L1 feature module + unit tests (synthetic frames; ffmpeg round-trip) | tests + focused commit |
| 2 | L2 profiles store + CLI + API + coverage report | dry-run report over all 74 Avatars; tests + commit |
| 3 | L3 signatures + matcher + batch script + verdict store | dry-run over the accepted set; calibration pass on a 50-media hand-labeled sample to set the 0.55/0.10 defaults from observed separation, not vibes; tests + commit |
| 4 | L4 Likeness lane in the Human Enricher UI + decision receipts | UI smoke via served-bundle markers + API round-trip; tests + commit |
| 5 | Director `avatar-likeness-v1` variant + EDL typing + audit | full-suite baseline (8 known failures), `npm run build`, Director pass report, append-only audit; commit |

Every phase: `npm test` + `npm run build` gates, focused commits, no push
(GitHub freeze active), backups under `data/backups/` before any store
mutation.

## Open questions for Calder

1. Should the likeness lane also cover *images* that passed the enricher,
   or video-only in v1 (the optical 3-frame contract is video-shaped;
   images get a single-frame signature, which L1 handles either way)?
2. One assigned Avatar per media, or allow a primary + secondary pair
   (the Director's `castAppearances` already supports up to 3 on-screen)?
3. Should `profileless` Avatars be healed by the existing healing-queue
   machinery as a prerequisite, or simply reported as excluded?
