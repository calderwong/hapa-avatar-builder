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

### L1 — Deterministic visual features (zero LLM cost)

Two files, split by environment:

- `src/domain/media-visual-signature.js` — **pure feature math** (browser-
  safe, operates on pixel arrays; never spawns):
  - **Palette histogram**: 6×6×6 RGB cube (216 bins) → top-K weighted bins.
    Same quantization family as the `dominantColor` precedent. Works
    identically on both sides of the match, which is the whole point.
  - **dHash**: 8×8 grayscale perceptual hash (9×8 source, threshold
    neighbors). Hamming distance over 64 bits is the coarse shape channel;
    an Avatar keeps a small set of distinct hashes and the match uses best.
  - **Tone vector**: mean RGB + saturation — separates dark-moody from
    bright clips.
  - Similarity functions: tolerant histogram intersection, dHash Hamming,
    tone distance, frame-signature merge.
- `server/media-visual-signature-extract.mjs` — **Node frame acquisition**:
  images and videos are decoded through ffmpeg/ffprobe (repo convention:
  `FFMPEG`/`FFPROBE` env, injectable for tests); videos yield First/Mid/Last
  — the same three-frame contract the optical review uses. The Last frame
  seeks with `-sseof` at ≈ two frame periods (from the probed frame rate)
  because an absolute seek at/past the final frame makes ffmpeg exit 0 with
  zero output; a doubling retry ladder (1×/2×/4×) runs before degrading to
  the first frame, which then records the degradation. A zero/omitted time
  emits no seek argument at all (reading from the start is exactly "seek to
  0" without the zero-byte drop `-ss 0` causes on some single-frame images),
  and a near-zero-duration mid-seek degrades to the first frame the same way.
  ffmpeg decoding avoids adding an image npm dependency to the repo.
- No new dependencies; the browser UI never computes features.

### L2 — Avatar likeness profiles (one-time + incremental)

New runtime store `data/avatar-likeness/profiles.json` (gitignored,
documented in `data/README.md`; serialized-write + retention pattern from the
preview-recording store). One profile per Avatar Card:

- Merged feature set across the Avatar's attached media:
  - backgroundless/extracted full-body and close-up images — weight 1.0
    (cleanest identity signal);
  - video First/Mid/Last frames — weight 0.8;
  - dossier/kit/tarot-linked images — weight 0.5 (context, not identity).
- **Per-class sign sample**: Avatars can carry thousands of near-duplicate
  generated clips (the live store measures 6,354 pixel assets, 4,022 of
  them identity-class). The merged palette/tone signal saturates long
  before that, so the builder signs at most `AVATAR_LIKENESS_SAMPLE_CAPS`
  per class (identity 40 / default 40 / context 12 — the sample, never the
  fingerprint set) through a bounded ffmpeg pool. An uncapped rebuild
  measured ~45 minutes; capped it is ~3. Selection is deterministic
  (class priority, then asset id) so a profile stays a pure function of the
  Card; the profile records `sampling { usable, attempted, signed,
  sampledOut }` for honest coverage.
- Text channel assembled from existing intelligence: OCR lines, vision
  labels, tags, symbolic motifs (all already computed by the Character
  Sheet), plus cast-registry identity invariants where present.
- **Content-hash keyed**: a profile is only recomputed when the Avatar's
  asset fingerprints change (every on-disk pixel asset is fingerprinted;
  an added, removed, or changed file invalidates the profile). Re-profiling
  a store this size is a few minutes of work, not seconds — the sample cap
  above is what keeps it bounded.
- Coverage report: Avatars with no usable visual asset get *no* profile and
  are listed as `profileless` (the Character Sheet gap machinery already
  tracks empty media slots; this surfaces the likeness-side consequence).

Wiring: `cli/avatar-builder.mjs` gains a flat `avatar-likeness-profile
[--avatar <id> | --all] [--apply] [--concurrency <n>]` command (the CLI is
flat-command; no subcommand tree). Dry-run by default; `--apply` writes the
store. `GET /api/avatars/likeness` (admin-gated like the other Avatar
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

#### L3 implementation notes (2026-08-24, Phase 3)

- **Stores** live in `data/avatar-likeness/` (`media-signatures.json`,
  `verdicts.json`) beside the L2 `profiles.json` — the feature directory
  owns its runtime state, rather than the sketched top-level
  `data/human-video-likeness-signatures.json`. All three are gitignored.
- **Signature source**: the L1 signer runs over the dashboard video's
  resolved file (sourcePath, then `/media/` uri, then the extracted
  first-frame thumbnail) — *not* the optical campaign's registered frames
  (the campaign has zero completed jobs on the current store).
- **Color words** are derived deterministically from the 6×6×6 palette bins
  on both sides (bin-center → nearest of a fixed ~25-word vocabulary); LLM
  optical words would blend in if they ever exist. `prepareLikenessState`
  derives a side's words from its own palette when the side carries no
  explicit words, so the 0.10 channel is live for profile-vs-media scores.
- **Renormalization**: channels whose either side has no data are excluded
  and their weights redistributed, so textless media (0/3,267 have a
  description) score on pixels alone on the same 0..1 scale.
- **No npm script** (`package.json` is owned by concurrent work); the batch
  is `node scripts/avatar-likeness-match.mjs`.
- **Stale-signature policy**: a media whose file has vanished but carries a
  stored signature is still matched, flagged `staleSignature: true`.
- **Calibration** (`calibrate` mode) self-labels from the Avatars' own
  identity-class media (the plan's "50-media hand-labeled sample" — the
  self-labeling is deterministic and repeatable; 140 labels, all in-profile
  because every Avatar's identity assets sat inside the L2 sample cap, so
  no out-of-profile ground truth exists). 2026-08-24 result: median
  margin 0.016, 13/140 clear 0.10 (all true, zero false), score floor
  outcome-invariant across 0.30–0.90 → the 0.55/0.10 defaults confirmed.
  Report: `artifacts/enrichment/avatar-likeness-match-calibrate-*`.json.

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

| Phase | Scope | Gate | Status |
| --- | --- | --- | --- |
| 1 | L1 feature module + unit tests (synthetic frames; ffmpeg round-trip) | tests + focused commit | **done** — commit `3890b58` (2026-08-23) |
| 2 | L2 profiles store + CLI + API + coverage report | dry-run report over all 74 Avatars; tests + commit | **done** — commit `7af6a4c` (2026-08-23): live run over all 74 Avatars (73 profiled / 1 profileless / 1 corrupt file failing honestly), ~2 min rebuild, ~15 s steady-state freshness pass |
| 3 | L3 signatures + matcher + batch script + verdict store | dry-run over the accepted set; calibration pass on a 50-media hand-labeled sample to set the 0.55/0.10 defaults from observed separation, not vibes; tests + commit | **done** (2026-08-24): calibration over 140 self-labeled identity media confirmed 0.55/0.10 (margin is the separator; floor outcome-invariant); full apply over the 3,267 accepted set — 3,133 signed (134 sources gone, honestly excluded), 22 assigned / 3,111 unresolved (3,110 too_close), ~10 min; the assigned samples are genuine likeness (Mara look-book, Pomeranian for the dog Avatar, Tiny rooftop) and palette-only false positives (nebula, stained glass) sit unresolved — the gate behaves as designed |
| 4 | L4 Likeness lane in the Human Enricher UI + decision receipts | UI smoke via served-bundle markers + API round-trip; tests + commit | **done** — commit `e1bfbbb` (2026-08-24): decision domain + store + dashboard join + API routes + lane layout; 11 new tests green (7 decision + 4 lane, incl. a real-server round-trip with durable receipts); full suite 1883/1874/9 with all 9 failures pre-existing (8 baseline + 1 from the unrelated `6cee844` echos commit, proven on a clean worktree); `npm run build` green with the delivery contract tests passing on the new receipt |
| 5 | Director `avatar-likeness-v1` variant + EDL typing + audit | full-suite baseline (8 known failures), `npm run build`, Director pass report, append-only audit; commit | **done** (2026-08-25): append-only pass `node scripts/append-avatar-likeness-echo-direction-variants.mjs` over the Human-Accepted pool; 15 new tests green (11 domain + 3 script, incl. a full hermetic round trip with append-only/resume semantics); live dry-run: typed pool empty → honest `no-accepted-likeness-decisions-yet` report (0 decisions in the live store); live `--pool all` dry-run over all 176 current songs → 176/176 variants, 9,744 placements, 0 immediate repeats, all 3,133 candidates used, originals untouched |

Every phase: `npm test` + `npm run build` gates, focused commits, no push
(GitHub freeze active), backups under `data/backups/` before any store
mutation.

## Resolved decisions (Calder, 2026-08-23)

1. **Scope: images and video.** Media that passed the enricher are
   signed regardless of type; images get a single-frame signature
   (role `single`), videos get First/Mid/Last.
2. **Primary + secondary.** The likeness verdict may carry a primary Avatar
   plus an optional secondary, gated by the same score+margin rules applied
   to the top-2 candidates; the Director's `castAppearances` (up to 3
   on-screen) consumes them.
3. **Profileless Avatars: exclude + report.** They are never healed as a
   prerequisite; the coverage report lists them as excluded and their media
   stay `untyped` with an honest reason.

## Implementation decisions (agent, 2026-08-23 — flag for review)

1. **Layer split**: pure feature math lives in `src/domain/` (browser-safe);
   ffmpeg acquisition in `server/`; profile assembly is pure and testable
   without any filesystem. (L1 was designed this way; L2 follows it.)
2. **Silent zero-byte seeks** (L1): an absolute `-ss` can make ffmpeg exit
   0 with zero output in two shapes — at/past the final frame of a video
   (fixed with the fps-aware `-sseof` offset + 1×/2×/4× doubling ladder,
   degrading to the first frame marked `degraded`), and at *t=0 of certain
   single-frame images*, where `-ss 0` drops the only frame (found live: 71
   of the real store's images decoded to zero bytes under `-ss 0` but
   decoded fine without any seek). A zero/omitted time now emits no seek
   argument at all; near-zero-duration videos whose mid-seek finds no frame
   degrade to the first frame the same way the last frame does.
   **Signer versioning**: profiles stamp `signerVersion` and freshness
   compares it, so a changed/fixed signer invalidates every profile and
   forces a re-sign — a byte-identical file no longer lets a stale result
   (e.g. `failed` entries left by a broken seek path) cache forever.
3. **CLI is flat-command**: `avatar-likeness-profile` (no `avatars
   likeness:profile` subcommand tree — none exists in this CLI). Deliberately
   no new npm script in `package.json` (that file is owned by concurrent
   worktree activity); the CLI command is the parity vehicle.
4. **Per-class sign sample + ffmpeg pool** (Phase 2): see the L2 sample
   section. Decision recorded because the plan's original "74 cards profile
   in seconds" estimate was wrong for this store (6,354 assets): the sample
   cap is a quality-vs-runtime tradeoff, and the profile records exactly what
   was and was not signed.
5. **Freshness stays maximal**: the profile records the sha256 of *every*
   usable on-disk pixel asset — sampled-in and sampled-out alike; any byte
   change, addition, or removal anywhere re-profiles the Avatar (cheap
   under the sample cap). The sample bounds only the ffmpeg sign work,
   never the invalidation contract. (An early build recorded only the
   sampled assets, which left over-cap Avatars permanently stale and blind
   to new media — fixed by recording the full set.)
6. **Store `upsert` is async** so invalid input rejects rather than throwing
   synchronously — uniform with the other store methods; fail-closed
   behavior is unchanged (`await` callers see the same error either way).
7. File resolution order for Avatar assets: `/media/` uri → `data/media/`,
   `file://` uri, absolute uri, `metadata.storage.path`,
   `metadata.storage.fileName` under the media dir.
8. The asset `metadata.fingerprint` in the Avatar store is a luma grid, not
   a content hash — profiles key on freshly computed file sha256.
9. **No npm script for the batch** (Phase 3): `package.json` is an in-flight
   file of concurrent work, so the batch runs as
   `node scripts/avatar-likeness-match.mjs` (same reasoning as the Phase 2
   CLI decision, applied to a script instead of a CLI command).
10. **L3 stores sit in `data/avatar-likeness/`** beside `profiles.json`
    (feature directory owns its runtime state), documented in
    `data/README.md` like the L2 store.
11. **Color words derive deterministically on both sides** (decision above
    in the L3 notes) because the optical campaign has no completed jobs on
    the current store; the L2 profile persists no words, so
    `prepareLikenessState` derives a side's words from its own palette when
    the side carries no explicit words — this keeps the 0.10 channel live
    in production instead of permanently inactive.
12. **Gate = 0.55 / 0.10 / 0.55, confirmed by calibration, not moved**:
    the 140-label run showed the margin does all the separating (13/140
    clear 0.10, zero false) and the score floor is outcome-invariant
    across 0.30–0.90, so the plan's stated defaults are the calibrated
    choice (the grid's deterministic tie-break to a 0.30 floor is a
    degenerate solution in a floor-invariant regime; 0.55 stays as the
    sanity floor that rejects "barely similar" media in the batch).
13. **Tokenizer digit filter is a Phase 3 change to the L2 module**:
    `tokenizeLikenessText` drops pure-numeric tokens (757 of the old 8,676
    profile terms were all-digit OCR noise displacing real words under the
    128-term bound; the rebuilt store measures 0). Required a one-time
    forced profile rebuild (`rm -rf data/avatar-likeness` +
    `--all --apply`; signerVersion unchanged, so freshness would otherwise
    have said FRESH).
14. **Accepted set = 3,267** videos (all `mediaType: "video"`) as of the
    Phase 3 run — the plan's "3,133" line is the *readable* count and the
    live run confirmed it exactly (3,267 − 134 gone sources).
15. **Separate decision store, same family** (Phase 4): likeness
    decisions live in `data/human-video-likeness-decisions.json` — the
    Quick Sort decision *family* (states, aliases, optimistic revision,
    actor attribution, append-only events) in its own file, because the
    Quick Sort ledger's invariants are one-decision-per-video with a
    media-triage truth boundary, while likeness is a placement authority
    that coexists with triage on the same video. `origin:
    "avatar-likeness"` marks the family member; the Quick Sort ledger is
    never written by this path (the Phase 3 contract test still asserts
    it). The decision carries the full bounded score receipt so the
    Director (L5) consumes a verifiable placement.
16. **Lane is a third layout inside the Human Enricher** (Phase 4):
    `?layout=likeness` beside Detail and Quick Sort, mounted as
    `HumanEnricherLikenessLane` — self-fetching against
    `GET/POST /api/human-enricher/likeness(-decisions)`, browsable and
    non-blocking (the parent's dashboard fetch skips while the lane is
    active). The lane routes mirror the Quick Sort route trust model
    (local loopback UI, `x-hapa-actor-id` attribution, no admin gate);
    the L2 profile route stays admin-gated as before.
17. **The quick-sort fast-path index carries the likeness verdict**
    (Phase 4, found by the round-trip test): the POST route reuses
    `humanVideoQuickSortVideoIndex` as its video-lookup fast path and
    consumes `video.likenessVerdict` as the decision's score receipt — so
    the compact indexed shape must include `likenessVerdict`, or the first
    dashboard build silently turns every accept into a 409
    `likeness_verdict_missing`.
18. **Baseline moved to 9 while Phase 4 was in flight**: the unrelated
    `6cee844` (full-height portrait camera cuts) commit changed
    `scripts/preflight-echo-render-readiness.mjs` without updating the
    source-contract assertion in `tests/echo-project-warmup.test.mjs`, so
    that test fails on clean HEAD too. It is pre-existing, not a Phase 4
    regression, and it belongs to the echo render-readiness work —
    reported, not fixed here.
19. **Pool modes: `--pool typed` (default) vs `--pool all`** (Phase 5): the
    plan's "when present" is honored in both — `typed` restricts the candidate
    pool to media with an accepted likeness decision (maximizing typed cast
    coverage once acceptances exist); `all` runs the full Human-Accepted pool
    and types shots only where an accepted decision covers them. Media without
    a durable accepted receipt is never cast and stays an honest untyped shot
    in both modes.
20. **`safeMediaShotMask` adapts the density mask to the engine's contract**
    (Phase 5): the recast engine's no-immediate-repeat tracker is
    variant-global, so a single-candidate pool can place at most one media
    shot per song; the pass shrinks the density plan's mask accordingly
    (pools of 2+ are provably safe under the least-used-first bag and pass
    through unchanged). The pass never mutates the shared engine
    (`src/domain/echo-media-recast.js`) — it adapts to it.
21. **Cast rides on the shot, injected post-recast** (Phase 5): typed
    `decision_evidence.avatarLikeness` + `media_cast_label`
    ("Avatar Card | <Avatar name>" — the EDL upgrade) are attached after the
    engine runs, so no shared recast code changes. Seed assets are the
    Avatar profile's identity-class signed samples (deterministic stored
    order, capped, resolved against the media library); per-asset pixel
    ranking against the shot's signature is a v2 extension because L2
    profiles store merged media, not per-asset signatures. The post-run
    audit resolves every typed shot back to the accepted receipt (id, state,
    origin, revision) and the pass fails closed on any violation.
