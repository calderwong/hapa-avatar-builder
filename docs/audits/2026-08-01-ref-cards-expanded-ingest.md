# Ref Cards expanded Hapa Media and Echo Director ingest

Date: 2026-08-01 America/Los_Angeles  
Source: `/Users/calderwong/Downloads/ref-cards-run-1`  
Canonical Builder: Hapa Avatar Builder

## Outcome

The recursive source scan found 446 valid MP4 paths: 105 in the folder root and
341 in `run2`. Content deduplication produced 429 Hapa Media records; the other
17 paths are exact-content aliases rather than missing assets. Every source uses
H.264/yuv420p on its primary video stream. The six older records whose long
source names prevented thumbnail extraction were healed with bounded,
content-derived frame filenames. The final ingest has zero errors and zero
missing first/mid/last frame sets.

The Director pass created three new append-only cuts for every one of the 157
Echo Album projects (471 cuts total):

- `ref-cards-expanded-5eed901d8f1a-balanced-v1`
- `ref-cards-expanded-5eed901d8f1a-rhythmic-v1`
- `ref-cards-expanded-5eed901d8f1a-cinematic-v1`

The family is bound to batch fingerprint
`sha256:5eed901d8f1a203516af91ca3229d24a26410cc55492124c1fe2aab941008f33`.
Each media contract uses a true full-file SHA-256; the importer's historical
partial fingerprint remains labeled only as ingest lineage. The pass preserves
base shot/lyric timing, stems, audio bindings, camera movement, transitions,
visualizer timing, and existing cut bytes. Album-wide least-used selection used
all 429 unique Ref Cards records 12–13 times, with no immediate media repeats.

The compact Direction-cut index was rebuilt from authoritative per-song files,
recovering 15 later human cuts that had not appeared in the prior index. It now
matches all 1,905 authoritative files exactly. A replay found all 471 new cuts
byte-equivalent and required neither new files nor an index rewrite.

## Verification

- Full album media preflight: 157 projects, 2,068 base/cut checks, 124,996 media
  cues, zero unresolved sources.
- Focused ingest/index/Director/render suite: 135/135 passing.
- Production build and receipt check: passing.
- Two representative new saved cuts reached `ready-no-known-blockers` in the
  render-readiness report. Their immutable base projects still expose a
  pre-existing zero-duration lyric-word blocker; no media or Director-cut
  blocker was found in the new cuts.
- Broad repository suite: all task-related checks passed. Unrelated process
  timing fixtures were confirmed green on isolated replay.

Runtime report:
`data/merge-reports/ref-cards-expanded-2026-08-02T05-37-35-060Z.json`

## Custody note

Hapa Media routes point through bounded `data/media` symlinks to the supplied
source folder. The folder is therefore the current source custody location and
must not be moved or deleted without first materializing those links into a new
approved media root.

## Turn-to-Lore reflection

Two reusable rules emerged. First, a digest-shaped string is not automatically
a content digest: downstream lineage must name the actual hashing algorithm and
whether it covered the full file. Second, compact catalogs are projections, not
authority. Any append-only rebuild must discover the authoritative files first,
then merge compact metadata over that complete inventory. These rules now live
in the repeatable Ref Cards generator and the shared Direction Variant index
helper rather than in a one-off batch script.

## Motion-role correction — 2026-08-02

The content-addressed ingest, media custody, index reconstruction, and 429-video
coverage above remain valid. The correction is editorial: the importer's broad
`loop_video` tag was mistakenly reused as `loop/hold` intent for the entire
collection. That erased the distinction between near-static holds and
action-oriented footage when the Director ranked candidates.

At least 258 filenames explicitly describe a transition. Those names identify
transition review candidates; they do not prove first/last frames or Reference
card endpoints. All 258 currently normalize as scene motion—not as loops or
authored transitions—and cannot become authored bridges until exact from/to
card, frame, asset, and image identity is recovered or approved. The 41 Vibes
transitions that already carry declared endpoint lineage remain the
authoritative bridge set. The complete scoring, sequencing, v5 truth-boundary,
and verification record is in
[the transition-weighting correction](./2026-08-02-echo-transition-weighting-correction.md).
