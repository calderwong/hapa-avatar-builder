# October 23 — incremental Echo Album intake

Status: seven-song intake and Living Light coverage delivered; new Card motion
loop production in progress. Human creative acceptance and lyric-passage review
remain separate. Attribution: Codex in the Echo Album/Living Light continuation,
at Calder's request; local prototype, no publication or mint.

## Scope and result

Compare exact recording UUIDs and hashes with the existing 202-song catalog.
Seven new recordings bring the catalog to 209. A duplicate Hey Sister MP3 is
one recording; its new UUID is distinct from the older Hey Sister take.

| Track | Recording | Preferred WAV stems | Codex story images |
| --- | --- | ---: | ---: |
| 203 | Between an Ocean and the Sea | 11 | 2 |
| 204 | From the Calder to the Sea | 12 | 2 |
| 205 | Hey Sister (new take, 4800cf43) | 11 | 2 |
| 206 | Miss Spelling’s Pride | 12 | 2 |
| 207 | Thirsty in the Dark | 10 | 2 |
| 208 | Walker’s Nation | 10 | 2 |
| 209 | Write Home | 10 | 2 |

Each has its local master, preserved MP3 and stem archive, lyrics, attributable
reference proposals, base Director project, Scroll/Balanced and three Wide
Coverage passes, Living Light Album Pass and Music Response cut. Existing
owners performed this as exact-song batches; no parallel album store was made.

The seven Music Response cuts add 42 cues: 41 use qualified stems and one uses
master-only response. The shared audit now covers 209 songs / 1,247 cues, with
863 stem cues, 384 master-only cues and no unavailable, unbound, off or flat
cue. All cues select Dance. This is technical input coverage, not aesthetic
acceptance. Fifty-six of 76 source stems qualified for Living Light timing;
other roles retain explicit measured-master fallback.

Selected-cut song timing is prepared for all seven: 76/76 declared stems are
usable and every bundle matches the exact registered WAV hash. This generic
analysis retains unverified stem-origin/beat labels; it does not replace the
separately qualified Living Light mappings. All 419 selected video previews
prepared successfully. An actual Director playback sample showed a nonblank
painted tunnel with seven measured stem roles and explicit fallback labels.

All 14 images were generated using **Codex built-in GPT Image**, imported into
the existing immutable Reference Media contract, and verified through the
Builder image routes by exact SHA-256. Run:
`echo-reference-codex-images-incremental-20261023`.
No API image retry follows Calder's provider correction.

Local H3 run `local-h3-echo-incremental-20261023` produced a first five-second
sample that passed technical/motion/seam gates and agent first/middle/last
inspection. The remaining 13 were deliberately admitted to the same serialized
queue. Never label queued output complete or create the Reference-loop recast
from a partial immutable run. Human semantic/aesthetic review remains open.

## Verification and preservation

- All seven WAV routes support byte ranges and return exact source bytes.
- All 14 image routes return the expected image hashes.
- Seven saved Living Light recipes resolve their 14 painted media uses.
- The original 202 song rows and 8,215 historical project/variant files are
  unchanged except the intentionally extended variant index. Its original
  7,454 entries are unchanged; the new total is 7,489.
- Ingest/image/reference-loop/runtime/performance/selected-preview checks:
  28 passing. Final focused timing/ingest/media/response checks: 13 passing.
  The five timing checks include the rounded endpoint regression. Build passes.
- Full source lyrics remain intact. Atlas analyses and master/vocal comparisons
  are retained; all seven timing candidates are held for passage review, with
  no forced promotion. Provisional interpolation remains labelled.

Evidence is retained in the local `execution/echo-incremental-20261023` task
directory: inventory and baseline, owner operation receipts, image hashes,
audio and preview API reports, selected performance verification, response and
painted-media audits, preservation reports, UI screenshot, tests and build.
Generated media, private payloads and runtime receipts are not Git content.
No final export or human acceptance is claimed. Ordinary legacy shader route
diagnostics remain outside this intake; they must not block album coverage.

## Corrections and reusable lessons

The first approved API image run failed all 14 jobs because that account had
no credits; the owner's 42 automatic transport attempts produced no images.
The later user instruction explicitly selected Codex generation. Preserve both
outcomes rather than erase failure or invent a successful API billing receipt.
The ingest projection also incorrectly treated any successful image as complete
and zero successes as queued. It now requires full success and preserves
failed/partial state. Regression checks cover all four cases.

Thirsty exposed a 25-microsecond endpoint mismatch between exact decoded audio
and rounded prepared duration. The shared timing qualifier now intersects both
boundaries, including signed offsets; the consumer's safety check is unchanged.
Previously successful preparation was reused; only affected qualification was
repeated. This is a shared fix, not a per-song exception.

The H3 service existed but its worker had crashed days earlier. Owner logs,
readable databases and terminal queue records established an idle crash before
one existing-supervisor recovery. No models, alternate services or competing
GPU workers were introduced.

Lesson Card candidate: verify the selected cut through real master, timing,
preview and media routes; registration and a green metadata audit alone do not
prove playback. Skill refinement candidate: make Codex image-provider choice
explicit and preserve immutable image-to-loop joins across provider changes.
Wall time includes generation and local model waits; active time and any speedup
are unmeasured. Remaining work stays visible rather than redefining parity.
