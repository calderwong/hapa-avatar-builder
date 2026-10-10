# Echo Tarot Main Man OpenAI API Run — 2026-09-13

## Objective

Generate the complete Echo Album Tarot deck with Hapa Main Man as the lead, using the existing song/card prompt corpus and the attached local identity-reference pack. Exercise a bounded-concurrency OpenAI image pipeline, preserve durable local provenance, and expose the run beside the existing Hapa Main Woman deck in the Electron review UI.

## Route and custody

- Source prompt corpus: the Echo Album song/card pairings already owned by the Hapa Avatar Builder.
- Identity source: `/Users/calderwong/raw-models/hapa-main-man-pack/`.
- Provider: OpenAI Images API using `gpt-image-2.5-sunburst-2026-09-08`, `high`, `1024x1536`.
- Local run ID: `echo-main-man-2026-09-13T19-20-17-632Z-7ccad9e9`.
- Durable manifest: `/Users/calderwong/Library/Application Support/hapa-avatar-builder/Echo Tarot Main Man Image Runs/echo-main-man-2026-09-13T19-20-17-632Z-7ccad9e9/manifest.json`.
- Outputs: the sibling `outputs/` directory under that run root.
- UI: Reference Atlas → Echo Tarot generation monitor → Hapa Main Man.

Five reference images were copied into the run's local custody. The canonical multi-view identity sheet, `ChatGPT Image Sep 13, 2026, 11_59_33 AM (2).png`, was the only identity image transmitted with each request. The other four images remain visible in the UI as local supporting references. No API credential is present in the manifest, output metadata, or repository changes.

## Outcome

- 167 of 167 song/card combinations completed.
- 167 unique PNG hashes; every output is 1024 × 1536.
- Local run size: approximately 557 MB.
- Observed estimated cost: $9.80578.
- Median request duration: 38.553 seconds.
- P95 request duration: 47.289 seconds.
- Minimum/maximum request duration: 33.954 / 53.214 seconds.
- Rate-limit events: 0.
- Transient routing retries recovered automatically: 32.

The six-image pilot exercised Major and Minor Arcana, emotional and architectural scenes, and difficult song symbolism. Five requests completed in the first 41.409-second wave; one Hanged Man request was rejected by provider safety checks and passed after a provider-safe symbolic rewrite.

After pilot review, 161 remaining jobs were admitted with 12 workers. The main concurrent pass took 545.981 seconds (9 minutes 5.981 seconds), producing 158 images and three actionable moderation failures. That pass handled 161 provider decisions at 17.692 decisions per minute. Targeted rewrites for the two Devil scenes and one Wheel of Fortune scene then completed all three in a concurrent cleanup pass of approximately 47 seconds.

From full-queue admission to a clean 167/167 manifest, including diagnosis, prompt edits, verification, and the cleanup pass, elapsed wall time was approximately 690.5 seconds (11 minutes 30.5 seconds). From initial pilot admission through final completion, including human/agent review and code-adjustment gaps, elapsed time was 898.217 seconds (14 minutes 58.217 seconds).

## Comparison with the Hapa Main Woman run

The earlier serial woman continuation processed 163 provider decisions in 6,106.048 seconds, approximately 1.602 decisions per minute. The male main pass processed 161 decisions in 545.981 seconds, 17.692 decisions per minute. On these bounded local observations, the concurrent pipeline delivered approximately 11.04× the decision throughput of the serial baseline.

This is not a general provider benchmark. It compares two specific local runs with different dates, queue conditions, retry patterns, and prompt repair needs.

## Quality review

All six pilot outputs, the three repaired moderation outputs, and nine outputs sampled across the completed album were inspected. The samples showed:

- consistent Hapa Main Man facial identity and silhouette;
- readable card titles and Roman numerals;
- recognizable Tarot composition and core card symbolism;
- visible integration of song-specific motifs rather than generic Tarot restaging;
- coherent borders, palettes, and presentation quality across Major and Minor Arcana.

The Devil cards retain secondary symbolic figures required by the traditional composition, while keeping Hapa Main Man visually dominant. The male-only prompt contract permits small supporting figures when a card's canonical structure requires them.

## Failures and repairs

Three full-pass prompts were rejected by moderation:

- The Devil × Dear Papa;
- Wheel of Fortune × Bok, Bok;
- The Devil × Bread, Conviction, and Poop in the Tub.

The repair preserved card and song meaning while replacing moderation-prone literal language with fully clothed public tableaux, open ceremonial link-bracelets, stone guardians, lanterns, and distant witnesses. All three repaired prompts completed without weakening the core visual logic.

Transient provider routing failures were retried with bounded backoff. There were no HTTP 429/rate-limit events, so increasing beyond 12 workers was not justified by this run alone; model routing, not the account's RPM ceiling, was the observed source of retry pressure.

## Repeatable controls

- `npm run echo:tarot-man:status` — inspect the current local run.
- `npm run echo:tarot-man:pilot` — create a six-card pilot with six workers.
- `npm run echo:tarot-man:full` — admit the remaining deck with 12 workers.
- `npm run echo:tarot-man:resume` — retry only incomplete or failed work.

The runner persists claims and results to the manifest, isolates male and female run custody, serializes manifest writes, exposes worker/rate/retry telemetry, and never exposes credential reads through the renderer bridge.

## Verification

- Focused Node tests: 16 passed, 0 failed.
- Production renderer build completed successfully.
- Live Electron DOM showed the Hapa Main Man tab at 167 complete, 0 running, 0 remaining, with five identity images and a 167-card full-album gallery.
- Switching to Hapa Main Woman preserved the pre-existing 165-card gallery; the male run did not overwrite it.

