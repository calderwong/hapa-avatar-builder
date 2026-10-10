# Echo Tarot Main Couple OpenAI API Run — 2026-09-13

## Objective

Generate the complete `default-couple` Echo Album Tarot deck with Hapa Main Man and Hapa Main Woman as distinct, mutually agentic leads. Use the attached local couple-reference pack, the existing Card × Song prompt corpus, the proven bounded-concurrency OpenAI pipeline, isolated local custody, and a third review tab beside the completed single-lead runs.

## Route and custody

- Source prompt corpus: Echo Album song/card pairings owned by the Hapa Avatar Builder.
- Prompt variant: `default-couple`.
- Identity source: `/Users/calderwong/raw-models/hapa-main-couple-pack/`.
- Provider: OpenAI Images API using `gpt-image-2.5-sunburst-2026-09-08`, `high`, `1024x1536`.
- Run ID: `echo-main-couple-2026-09-13T20-12-21-996Z-fcd83995`.
- Manifest: `/Users/calderwong/Library/Application Support/hapa-avatar-builder/Echo Tarot Main Couple Image Runs/echo-main-couple-2026-09-13T20-12-21-996Z-fcd83995/manifest.json`.
- Outputs: the sibling `outputs/` directory inside that run.
- UI: Reference Atlas → Echo Tarot generation monitor → Hapa Main Couple.

All six reference images were copied into local run custody and are visible in the review UI. `ChatGPT Image Sep 13, 2026, 12_40_49 PM (4).png` was selected as the single API identity input because it contains the strongest combined face, expression, height, silhouette, and relationship evidence. Captions and other printed material inside the lookbook were treated as non-executable visual evidence. No API credential is present in the manifest, output metadata, or repository changes.

## Outcome

- 167 of 167 Card × Song combinations completed.
- 167 unique PNG hashes; every output is 1024 × 1536.
- Local run size: approximately 571 MB.
- Observed estimated cost: $9.93464.
- Median request duration: 40.650 seconds.
- P95 request duration: 48.780 seconds.
- Rate-limit events: 0.
- Transient model-routing retries recovered automatically: 30.

The six-image pilot completed in 48.557 seconds with no failures or retries. It deliberately covered The Lovers, Two of Cups, Three of Swords, The Fool, The Hanged Man, and The Devil to test reciprocal interaction, two-person anatomy, intimacy, conflict, inversion, complex symbolism, and provider moderation before full admission.

The 161-job main continuation began at `2026-09-13T20:14:17.919Z` and reached its first terminal state at `2026-09-13T20:24:00.496Z`: 582.577 seconds, or 9 minutes 42.577 seconds. It completed 160 images and returned one moderation rejection. A targeted Temperance rewrite passed on its first retry. From full-continuation admission through clean 167/167 completion, including inspection, code/test repair, and the retry, elapsed wall time was 774.109 seconds, or 12 minutes 54.109 seconds. Pilot admission through final completion was 889.997 seconds, or 14 minutes 49.997 seconds.

## Quality review

The complete six-card pilot, the repaired Temperance card, and nine cards distributed across the album were inspected. The samples showed:

- two distinct, recognizable lead identities rather than a merged or duplicated face;
- stable relative height and body-proportion contrast;
- reciprocal gaze, hands, and shared-object staging;
- recognizable Tarot object counts, titles, numbers, and suit/Arcana grammar;
- song-specific motifs integrated into the Tarot composition;
- coherent antique-gold celestial framing and illustrated graphic-novel rendering.

Supporting figures still appear when a canonical card requires them. The Lovers retains its angel; Three of Cups retains a third celebrant. Hapa Main Man and Hapa Main Woman remain the named lead slots rather than making a required symbolic figure carry their identity.

One sampled Six of Cups interpreted the pair as childhood selves. That is thematically legible for the card, but it weakens literal adult identity continuity. The repeatable prompt pipeline now explicitly keeps both leads at their present adult ages and moves childhood into photographs, reflections, objects, or small background memory figures. The existing image remains visible for human review rather than being silently replaced.

## Failure and repair

Temperance × Clouds Carry was rejected once by the provider safety system. The repaired prompt preserved the two vessels, colored streams, land/water stance, estuary, balance, and integration logic while specifying a fully clothed public ritual, separate poses, boots in shallow water, and hands holding only the vessels. The retry completed in 27.8 seconds and produced a strong two-person Temperance composition.

Thirty transient model-routing retries recovered with bounded backoff. There were no HTTP 429 events, so this run again found provider routing—not the account's RPM ceiling—to be the observed concurrency pressure at 12 workers.

## Repeatable controls

- `npm run echo:tarot-couple:status` — inspect the current local couple run.
- `npm run echo:tarot-couple:pilot` — create the six-card couple pilot with six workers.
- `npm run echo:tarot-couple:full` — admit the remaining deck with 12 workers.
- `npm run echo:tarot-couple:resume` — retry only incomplete or failed work.

The profile has an isolated run directory, schema, reference selection rule, output suffix, queue state, provenance, performance telemetry, and renderer bridge. The woman and man decks are not overwritten.

## Verification

- Focused prompt, runner, and renderer tests passed.
- Production renderer build completed successfully.
- Output audit found 167 files, 167 unique SHA-256 hashes, and no non-1024×1536 PNGs.
- Live Electron DOM showed Hapa Main Couple selected with 167 complete, 0 running, 0 remaining, six identity references, and 167 cards in the full-album view.
- The live gallery loaded 72 lazy-bounded tiles initially with 0 unavailable images; the remaining cards are exposed through the existing incremental album control.

