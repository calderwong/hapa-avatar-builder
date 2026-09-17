# Echo Lyric Visual Fusion Director

This local-first Director pass creates three append-only cuts for every Echo
song by combining two bounded media families:

- locally readable videos explicitly accepted in Human Enricher, with an
  enriched visual description and palette, and normally a 720 px minimum short
  edge;
- completed Reference Card video loops from the retained FAL H3 and local
  MiniMax H3 run manifests.

It preserves the source project's timing, sections, stems, camera direction,
transitions, and audio bindings. It does not rewrite the canonical song project
or imply that a generated cut has received human aesthetic approval.

## Variations

| Variant | Media pattern | Target media density |
|---|---|---:|
| `lyric-visual-cinema-v1` | Human accepted, then Reference | 72% |
| `lyric-visual-reference-v1` | Reference, then Human accepted | 84% |
| `lyric-visual-performance-v1` | Human accepted, then Reference | 94% |

Every variation must use both source families and must not repeat the same
technical media identity in adjacent media-bearing shots.

## Lyric-to-visual alignment

For each inherited shot, the compiler intersects the shot interval with
`song_edit_map.timedLyrics`. The resulting lyric text, line IDs, source, and
confidence are attached to the shot. Candidates are then ranked with a bounded,
measured token overlap between that lyric window and either:

- the Human Enricher visual description; or
- the Reference Card generation prompt, reference summary, memory hook,
  connection rationale, review prompt, and retrieval tags.

The overlap is a soft selection weight. It is not an embedding score, a claim
of semantic understanding, or proof that the visual is aesthetically correct.
Each selected shot records its lyric excerpt, line IDs, enriched source class,
and measured affinity in `decision_evidence.lyricVisualAlignment`.

Reference loops are scoped to the same song when available. If a song has
Reference Card images but no completed loops, the pass uses a deterministic
album-wide enriched-prompt shortlist and records
`album-reference-semantic-fallback`; it never describes that fallback as a
same-song match.

## Runbook

Run the non-writing album plan first:

```bash
npm run echo:director:lyric-visual-fusion
```

Apply the exact append-only pass:

```bash
npm run echo:director:lyric-visual-fusion:apply
```

Useful bounded forms:

```bash
node scripts/append-lyric-visual-fusion-director-variants.mjs --song-id dear-papa-song-gnow-her
node scripts/append-lyric-visual-fusion-director-variants.mjs --variation-id lyric-visual-reference-v1
node scripts/append-lyric-visual-fusion-director-variants.mjs --apply --resume
```

`--resume` accepts only existing variants owned by
`echo-lyric-visual-fusion-v1`; it rejects a path occupied by another pass. The
optional `--minimum-short-edge` changes the normal 720 px Human-video floor.

Outputs are local runtime state:

- cuts: `data/music-video-project-variants/<song-id>/<variant-id>.json`
- index: `data/music-video-project-variants/index.json`
- run report: `artifacts/lyric-visual-fusion-director/`
- pre-apply index backup: `data/backups/`

The Builder reads the shared variant index, so the new cuts appear through the
existing Director-cut surface without a second import step.

## September 16, 2026 album run

The first full run wrote 600 cuts: three for each of 200 projects. Its admitted
pools contained 2,781 high-resolution enriched Human-accepted videos and 954
completed Reference loops (769 FAL, 185 local MiniMax H3). Same-song Reference
loops were available for 163 projects; 37 used the explicitly labeled album
fallback. All 600 persisted files were found, all used both source families,
the Human acceptance boundary had zero violations, and immediate media repeats
were zero.

Across the saved cuts, 25,154 selections carried timed lyric windows and 15,056
had positive measured overlap. These counts demonstrate that the evidence and
ranking path ran; they are not a human quality score.

Gnow Her currently has six completed Reference Card images but zero completed
loops for those exact cards. Its three cuts therefore use the album fallback
until the existing loop queue finishes those six cards. Re-run with `--apply
--resume` after completing a new variation ID or deliberately replace this
version through a separately designed migration; append-only ownership prevents
silently overwriting the current cuts.

## Acceptance boundary

The pass proves deterministic compilation, source eligibility, provenance,
coverage, and locally persisted Director artifacts. Human review is still
required for narrative taste, lyric interpretation, clip framing, and final
cut acceptance. A completed H3/FAL render is available media, not accepted
canon, publication, endorsement, or a transfer of rights.
