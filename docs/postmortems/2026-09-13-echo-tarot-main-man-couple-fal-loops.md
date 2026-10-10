# Echo Tarot Main Man + Couple FAL Loop Run — 2026-09-13

## Outcome

The profile-aware H3 Max Turbo card-loop pipeline produced both requested decks in one concurrent production window:

- Hapa Main Man: 167/167 complete, 0 failed, 1,213,066,390 bytes
- Hapa Main Couple: 167/167 complete, 0 failed, 1,269,241,170 bytes
- media contract: 768 × 1152, 5.000 seconds, 24 fps, 120 frames, video-only H.264 MP4
- combined manifest-estimated spend: USD 16.70; FAL billing is authoritative
- simultaneous pilot-to-finish wall time: approximately 11 minutes 10 seconds

## Run identities

- Man source: `echo-main-man-2026-09-13T19-20-17-632Z-7ccad9e9`
- Man loops: `echo-main-man-tarot-loops-2026-09-13T20-56-41-741Z-00a6adec`
- Couple source: `echo-main-couple-2026-09-13T20-12-21-996Z-fcd83995`
- Couple loops: `echo-main-couple-tarot-loops-2026-09-13T20-56-41-739Z-f46b3782`

## Quality gate

The man pilot exercised Five of Cups, The Devil, and Knight of Swords. The couple pilot exercised The Lovers, The Hanged Man, and The Devil. All six completed without errors. Midpoint inspection preserved identities, relationship staging, composition, typography, borders, and symbols. Conformed-video start-frame SSIM measured 0.9894–0.9905 and final encoded-frame SSIM measured 0.9809–0.9821 against resized source stills.

A distributed midpoint sample at jobs 0, 33, 66, 99, 132, and 166 of each complete deck showed no lead swaps, couple merges, broken titles, or card-frame drift. Human approval remains pending in the Builder.

## Performance and recovery

Each profile used six local workers, for twelve concurrent workers total. Neither deck needed an adaptive recovery wave. Man inference averaged 1.339 seconds (median 1.386, p95 1.404); couple inference averaged 1.333 seconds (median 1.383, p95 1.404). The man run finished in 668.49 seconds and the couple run in 669.84 seconds from pilot start.

The man manifest records 156 jobs with one attempt and 11 with two. The couple manifest records 157 with one and 10 with two. These extra attempts resolved inside the durable request/download path and did not become terminal failures or cause a recovery wave.

## Verification

- 334 completed outputs and 334 unique SHA-256 hashes
- every manifest hash matches its local file
- every file passes FFprobe checks for 768 × 1152, 5.000 seconds, 120 frames, and zero audio streams
- no credential/API-key field or authorization token appears in either manifest
- focused loop and UI tests pass
- production build passes

## Reusable lesson

Six workers per isolated deck is a strong concurrency point for this provider path. Running two profiles concurrently reached nearly 15 completed loops per minute per manifest while avoiding the retry waves seen in the earlier 12-workers-on-one-deck run. Keep profile roots, source manifests, prompts, and IPC bridges isolated even when the provider work is intentionally concurrent.
