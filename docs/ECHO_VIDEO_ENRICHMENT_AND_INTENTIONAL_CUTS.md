# Echo Video Enrichment and Intentional Director Cuts

Status: local-first prototype workflow. This contract does not publish, mint,
canonize, or grant reuse rights to any media.

## Objective

Create one content-addressed enrichment record for every unique video known to
the Hapa Avatar Builder's Echo surfaces, then use those records to author one
append-only, story-aware Director cut for every canonical Echo song.

The workflow extends, rather than replaces, the existing media library,
technical-affordance cache, Reference Atlas, song store, saved Director cuts,
compiler, and render-readiness preflight.

## Canonical corpus boundary

The input manifest is the union of:

- video records in `data/media-library.json`;
- video attachments in the Avatar, Item, Scene, and Tarot stores;
- media used by immutable base projects and saved Direction variants;
- approved and review-pending animated Reference Atlas media; and
- authored Vibes transition links.

Physical proxies, symlinks, and repeated renditions are not separate works.
Every readable source is full-file SHA-256 hashed and deduplicated under
`hapa-media:sha256:<digest>`. Legacy sampled fingerprints and record IDs remain
aliases only.

## Resumable enrichment stages

1. **Prepare** resolves paths, records full content identity and custody, and
   creates an immutable manifest plus SQLite run ledger.
2. **Recognize** samples first, middle, and last frames. Existing verified
   frames and Vision results are reused; missing samples are extracted locally
   with FFmpeg, classified with the existing macOS Vision tool, and may use the
   installed local-only Ollama vision model when richer structured description
   or an Apple Vision fallback is needed. No frame is uploaded to a cloud API.
   Raw Vision labels remain in the evidence ledger. Semantic, canon, flow,
   chain, quality, and Director scoring use at most twelve labels per frame that
   clear `max(0.05, 25% of that frame's strongest label confidence)`. A lone
   lower-confidence fallback remains explicitly provisional and cannot score.
   A container that contains only one still frame is classified as a static hold:
   its sole frame is recognized and the repeated middle/last fallback samples
   remain tied to that same hold rather than represented as temporal motion.
3. **Synthesize** creates a visible first-state → middle-action → final-state
   synopsis, normalized tags, Reference and Hapa-context matches, intrinsic
   quality, and loop/transition classifications. Inferences retain confidence
   and supporting frame IDs.
4. **Connect** buckets perceptual hashes before evaluating candidate last-frame
   → first-frame edges. This avoids an unbounded all-pairs graph while keeping
   rejected and accepted evidence reviewable. These edges are directed and are
   never silently mirrored from B→A when only A→B was measured.
5. **Direct** freezes the most recent eligible non-Legacy parent for each song,
   ranks candidates against its exact shot and lyric windows, and appends one
   deterministic enrichment-backed cut.
6. **Verify** checks corpus completeness, one cut per song, evidence on every
   shot, immutable prior cuts, index parity, media readiness, and source-bias
   feedback.

Each stage can replay without duplicating records. Batch workers write separate
receipts; only the merge stage writes the canonical export.
An unchanged full apply reuses probes, frames, recognition, enrichments, quality
percentiles, and chain rows without refreshing semantic row clocks; the compact
manifest, enrichment, graph, and report artifacts remain byte- and mtime-stable.

The repeatable local commands are:

```sh
npm run echo:enrichment:apply
npm run echo:variants:intentional-enrichment:apply
npm run echo:variants:intentional-enrichment:preflight:apply
npm run echo:enrichment:audit:apply
```

Large enrichment rebuilds may run `--finalize` in deterministic
`--batch-index/--batch-count` shards, followed by one unsharded consolidation
without `--force` to compute global percentiles and the chain graph.

SQLite is the canonical full-evidence ledger. `enrichments.ndjson` is a bounded
Director/audit projection: it retains identities, three-frame observations,
synopses, tags, quality, source policy, and compact cited lore matches while
the larger rights, custody, relationship, and alternate-match evidence remains
queryable in SQLite. This prevents the album compiler from loading duplicated
multi-gigabyte evidence into memory.

## Enrichment truth contract

Each `hapa.echo.video-enrichment.v1` record retains:

- full SHA-256 identity, source aliases, runtime URI, rights, custody, generator
  and source lineage;
- measured dimensions, duration, codec, sample timestamps, and decode status;
- first/middle/last observations for people, candidate characters, places,
  objects, actions, text, palette, lighting, composition, camera, and motion;
- a content synopsis and a directed three-state synopsis;
- namespaced tags such as `char:`, `place:`, `object:`, `action:`, `motif:`,
  `emotion:`, `camera:`, `motion:`, `palette:`, `light:`, `weather:`,
  `reference:`, and `quality-tier:`;
- Reference matches with card and revision IDs, evidence class, review status,
  caveats, rights, confidence, and the distinction between adapting a mechanic
  and copying protected imagery; and
- loop, transition, quality, percentile, source-prior, and chain evidence.

Reference Atlas interpretation is evidence, not canon. A visual character match
is either an exact attached identity, a reviewable appearance candidate, or an
archetype/role. Recognition never silently changes a Card's identity.

## Intrinsic quality rubric

Source reputation is excluded from intrinsic quality:

| Dimension | Points |
| --- | ---: |
| Visual craft and technical fidelity | 20 |
| Temporal coherence and motion quality | 15 |
| Hapa aesthetic and world alignment | 25 |
| Narrative and semantic legibility | 15 |
| Character and canon integrity | 10 |
| Composition and editorial utility | 10 |
| Library distinctiveness | 5 |

The record stores the absolute score, global percentile, within-source
percentile, tier, confidence, evidence, and reviewer disagreement. This lets the
source-bias report test whether subjective quality corroborates or contradicts
the requested source policy.

## Flow classification

Loop score:

- endpoint appearance 35%;
- subject/ROI continuity 20%;
- palette and luma continuity 15%;
- seam motion continuity 15%; and
- semantic-state continuity 15%.

`0.78` is a loop and `0.65–0.779` is a loop candidate. An irreversible state
change rejects a full-range loop even when its endpoints look similar.

Transition score:

- directed state change 25%;
- entry/exit keyframe legibility 20%;
- motion coherence 20%;
- semantic bridge utility 20%; and
- endpoint distinctness 15%.

A clip may be both a useful loop and a transition over different ranges.
Static single-frame holds are neither temporal loops nor transitions and are
excluded from the playable Director and chain candidate sets.

Authored first-frame → last-frame transition lineage is preserved independently
from the visual classifier. A Vibes transition can therefore be a
`declared-transition` awaiting visual validation, or a visually validated
`transition`; its source card/frame, target card/frame, provider link, and truth
boundary remain in both the enrichment projection and transition map. Declared
intent never masquerades as measured visual success.

Chain edges combine endpoint appearance (20%), subject/ROI (15%), palette
(10%), motion direction (15%), aspect/crop safety (5%), entity/action (15%),
character/canon (10%), and motif/story continuity (10%).
Only a measured directed edge can support a continuity claim. A missing or
zero-weight edge means continuity was not measured or was unavailable; it does
not prove that two clips are incompatible.

## Source reputation policy

Only explicit provenance can change the source multiplier. Filenames, titles,
OCR, lyrics, tags, descriptions, and visible text cannot trigger it.

| Explicit source evidence | Multiplier |
| --- | ---: |
| Verified exact Song/Avatar/Scene attachment | 1.10 |
| Approved adaptive Reference Atlas media | 1.05 |
| Other verified Builder media | 1.00 |
| Unknown provenance | 0.70 |
| Explicit LTX 2.3 lineage | 0.15 |
| Explicit `hapa-dev-proto` lineage | 0.10 |
| Explicit Hell Week lineage | 0.10 |

Multiple low-priority flags use the minimum multiplier rather than multiplying
penalties. These sources remain eligible unless an independent technical,
rights, safety, or operator rule blocks them. A human pin can override the
ranking and must be logged.

The auditable overlay at `data/echo-video-source-prior-overrides.json` records
operator-confirmed collection lineage when legacy card/proxy records do not
carry it forward. Every row must name one unique full
`hapa-media:sha256:<64 hex>` identity; invalid and duplicate identities fail
closed, and a production finalize also fails closed when this overlay is
missing or unreadable. Derived proxies are affected only when their own content
identity is listed with its `derivedFromMediaId`. Review titles are retained for inspection
but never enter classification. The overlay injects explicit provenance into
the enrichment input fingerprint and changes selection prior only—it cannot
change any of the seven intrinsic-quality dimensions.

## Intentional cut evidence

Candidate base utility weights are lyric/moment/section/stem fit (22%),
character/canon/reference fit (18%), object/action specificity (15%), emotional
arc (12%), intrinsic quality (13%), chain continuity (8%), camera/aspect (5%),
technical truth (4%), and novelty/repetition control (3%).

The Director score is:

`eligibility gate × base utility × source multiplier × fatigue multiplier`

Quality percentiles and source-bias counterfactuals are comparative ranking
diagnostics. They are not aesthetic ground truth, canon, human approval, rights
clearance, causal proof, or authorization to publish or mint.

For each shot the compiler also persists the source-neutral winner from its
complete bounded search set before the source multiplier is applied. That set
includes semantic matches, directed graph neighbors, the previous visual, and
explicit intrinsic-quality and post-prior fallbacks. The feedback audit consumes
this direct winner and evaluated-candidate count; it never reconstructs the
counterfactual from only the three displayed alternatives.

Lyric, canon, object/action, and emotion affinities are computed separately.
Observed visual language comes only from the frame synopsis, OCR, and Vision
labels that clear the confidence gate; raw/provisional labels, provenance IDs,
source tags, and foreign-song metadata cannot inflate those visual-fit scores.
Graph neighbors are admitted into the shortlist before
continuity is scored, so a strong measured chain is not lost behind a global
fallback cap.

A human canonical story-beat match requires affinity `>= 0.10` plus at least
two distinctive overlapping tokens. Lorekeeper/agent rows, `kit-combination`
rows, and anything tagged `soft-canon` remain explicitly soft associations; a
soft association requires affinity `>= 0.15` and is never labeled canonical.
Only the narrative body is compared—IDs, authors, timestamps, and protocol
metadata are excluded. Unmatched story context contributes no story summary to
candidate scoring.

Every selected shot carries `hapa.echo.shot-decision-evidence.v4` with:

- exact time window and lyric citation, or an explicit lyrics-unavailable
  status without claiming the song is instrumental;
- story beat, lore, motif, emotion, character, and Reference evidence used;
- selected enrichment/content identity and intrinsic quality;
- source multiplier and provenance reason;
- intended camera, framing, transition, shader, and neighbor-chain logic;
- alternatives considered; and
- a concise Director rationale.

The rationale names the selected visual and its observed synopsis, distinguishes
timed lyric overlap from nearest-line context, reports zero chain affinity as
unavailable rather than “stable,” discloses cross-song reuse, and gives score
deltas for rejected alternatives.

The compiler preserves the frozen parent's timing, audio, stems, shaders,
visualizers, and runtime media contracts unless the evidence explicitly changes
that field. Existing base projects and saved cuts are immutable.

## Acceptance gates

- Every unique manifest video has three explicit frame-evidence slots, synopsis,
  tags, quality, source prior, and flow classifications. A source that cannot
  decode a requested sample records `unavailable` evidence instead of a
  fabricated observation.
- Malformed non-video payloads keep their content identity and prompt lineage,
  but are quarantined from playback, chains, and Director selection. Static
  single-frame assets remain cataloged as recognized holds, not videos.
- The chain graph only references manifest identities and records confidence.
- Declared transition records retain exact first/last Reference frame lineage
  and distinguish provider intent from three-frame visual validation.
- Exactly one new deterministic cut exists for each of 157 canonical songs.
- Every shot has valid v4 evidence and references an enriched media identity.
- The fourteen songs with unavailable lyrics make no invented lyric or
  instrumental claim.
- Existing project and variant byte hashes remain unchanged.
- Variant index reconstruction matches authoritative files.
- The report must be complete and its declared batch fingerprint, manifest row
  count, enrichment row count, and edge count must match the exact persisted
  NDJSON and graph projection before any cut is compiled.
- Every project-derived song identity is validated as one path segment and
  every variant path is lexically contained beneath the configured root.
- Exact-cut media and render-readiness preflights pass.
- The feedback report compares each source group's median percentile,
  top-decile rate, pre/post selection share, and quality `>=85` rescue cases.

## Completed pass — 2026-08-02

- The authoritative union resolved 200,165 references into 12,906 readable
  source paths and 11,551 unique SHA-256 video identities.
- 11,549 videos decoded. Two retained explicit `decode-failed` status; 34,647
  first/middle/last observations are locally recognized and their six
  non-decodable sample slots are explicitly unavailable. The playable Director
  set contains 8,847 temporal videos; two corrupt payloads and three static
  single-frame holds remain cataloged but quarantined from selection.
- The canon-aware mapper produced 2,475 cited Reference matches across 1,196
  videos, 11,880 cited song/story candidates across 3,107 videos, and 875
  reviewable character matches across 779 videos. Interpretive matches remain
  non-canon.
- Global quality scores span 0–86.10, with p25 63.37, median 67.56, and p75
  72.51 across all 11,551 identities. Source identity never contributes to
  this intrinsic score.
- The flow pass classified 7,252 loops or loop candidates, 58 transition
  records (17 visually validated plus 41 declared and awaiting visual
  validation), and 3,187 directed chain edges from 1,185 videos.
- The Director pass appended 157 ready cuts containing 9,565 fully explained
  shot decisions. It replaced 9,563 inherited media selections and
  intentionally retained the already-winning source on two shots while
  preserving timing, camera, transition, stem, shader, visualizer, and playback
  contracts. Fourteen songs account for 467 explicitly lyric-unavailable shots;
  none claims invented lyrics or an instrumental status. The final variation
  set is `echo-video-enrichment-569df5b64c674126`, tied to catalog fingerprint
  `sha256:569df5b64c674126e6ae8bfd5f51e62b14076757e7e39565fb6fc5a40479c59a`.
- Source classes are 855 approved References, 2,236 verified ordinary, 8,216
  unknown, 236 explicit `hapa-dev-proto`, and eight content-addressed Hell Week
  records confirmed from the Hapa card lineage and playback proxy cache. The
  latter two classes receive the 0.10 selection prior; no LTX 2.3 record is
  present. No low-prior asset was selected, and the source-feedback diagnostic
  found zero rescue cases.
- Every shot stores its direct source-neutral counterfactual over 384 evaluated
  candidates from a 7,555–8,475 eligible pool. Source policy changed 8,240 of
  9,565 winners. Without the prior, selections were 85.64% unknown, 11.11%
  verified ordinary, 3.18% approved Reference, and 0.07% `hapa-dev-proto`;
  after the prior they were 68.10% verified ordinary and 31.90% approved
  Reference, with zero unknown, LTX 2.3, `hapa-dev-proto`, or Hell Week picks.
  This quantifies the policy's effect separately from intrinsic visual quality
  rather than presenting the source label as an aesthetic judgment.
- An exact renderer preflight resolved all 9,565 cues in all 157 new cuts with
  zero unresolved or ambiguous media aliases. The catalog and Director audits
  both finish with zero blockers. The catalog retains 2,704 non-blocking,
  explicit warnings: 2,699 missing-runtime-URI identities excluded from the
  Director set, two corrupt payloads, and three static holds.

## Turn-to-Lore reflection

- **Objective:** turn a large, duplicate-heavy media pool into reviewable Hapa
  story evidence and safer Director choices.
- **Evidence inspected:** the canonical media library, technical cache, all
  current Direction variants, song/lyric/story fields, Reference Atlas policy,
  the existing macOS Vision ingest, and the Hapa Video Flow protocol.
- **Reusable work:** content-addressed catalog identity, existing representative
  frames and Vision results, exact saved-cut hydration, append-only variant
  storage, and render preflight.
- **Noise corrected:** physical file counts include proxies and derivatives;
  OCR containing “Hell Week” is not Hell Week provenance; and current variants
  are technically balanced rather than lyric/story-authored.
- **New guardrail:** quality and source reputation remain separate, and no
  Reference interpretation or inferred character label becomes canon.
- **Candidate:** this workflow is a Flow-explainer and Lesson Card source for
  later Turn Miner extraction; this document links the reusable decision back
  to the attributed implementation turn rather than replacing it.

## Portrait-framing repair pass — 2026-08-02

The enrichment catalog was normalized again after source dimensions and
orientation became part of the selected-media contract. The repair appended a
new 157-cut set, `echo-video-enrichment-e9ef7e04563b36a5-camera-v2`, tied to catalog
fingerprint
`sha256:e9ef7e04563b36a5f7f7bf42a2a999ced218ed6c2726a2fa683a125b9e125f56`.
All 9,565 media references resolve in render preflight. The set contains 6,797
portrait, 2,658 landscape, and 110 square shots with zero unknown dimensions.
No portrait shot keeps a static or automatic legacy camera: 5,891 selections
carry an explicit asset-aware reframe, including 3,623 orientation changes and
2,268 replacements of no-media or generated-visualizer cues.

Camera V2 also makes the subject ROI coordinate convention explicit: Y is
top-origin from recognition through Preview, Canvas, shaders, and export. Its
timestamp deterministically supersedes Camera V1 by one millisecond, while the
prior 157 files remain byte-immutable. The Direction variant index grew from
2,219 to 2,376 rows and exact-media preflight again resolved 9,565 of 9,565
references.

Preview, Record Garden, exact browser shader input, and HyperFrames export now
share the same source-orientation and camera-crop contract. The editor rebuilds
camera paths after a selected media identity changes, and repeated use of the
same media receives per-card path identities so keyframes cannot collide.

### Turn-to-Lore reflection

- **Objective:** preserve vertical-video reality in every horizontal Director
  surface without black bars, stretching, or losing the intended pan.
- **Evidence inspected:** source dimensions, saved shot contracts, decoded
  fallback dimensions, multitrack cards and camera keyframes, Preview/Garden
  frame resolution, exact shader inputs, and HyperFrames export composition.
- **Reusable work:** the shared `echo-camera-framing` crop resolver, saved-cut
  hydration, and existing media-role camera planner were extended rather than
  replaced.
- **What worked:** classifying orientation from source media, rebinding camera
  paths after media replacement, and presenting the camera-framed frame to
  downstream shaders made Preview and render follow one visual contract.
- **Noise corrected:** output-canvas aspect is not source orientation; CSS
  sizing cannot repair a wrong source crop; and an inherited camera path is not
  valid merely because its time window still matches.
- **New guardrail:** any media identity or source-aspect change must rebuild and
  validate its camera corridor, card binding, and keyframes before a cut is
  considered render-ready.
- **Candidate:** extract a reusable Lesson/Flow named “Media Replacement
  Requires Framing Rebinding” for other card-to-video compilation paths.
