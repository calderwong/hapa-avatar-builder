# Reference Atlas Adaptive Default loops — 2026-07-26

## Objective

Give every currently eligible new Reference Card a repeatable still + looping
video package using the selected combined depth treatment and Adaptive Default
light, then expose those loops to Echo Album Director runs without changing
Reference Card canon, approval, privacy, or custody.

## Evidence inspected

- The 82-job GPT Image Reference Atlas benchmark manifest and its three
  privacy/evidence exclusions.
- Echo's current eligible-media floor: local nonzero video, minimum 512 px
  short edge, minimum 2.5 seconds, content hash, valid Card revision, verified
  technical record, and browser-safe H.264/yuv420p.
- The existing Builder media candidate and balanced Director recast contracts.
- The prior DepthFlow benchmark receipts for model-only depth, vertical camera,
  five depth bands, five particle planes, and Adaptive Default light.

## Result

- Eligible Reference Cards: **82**
- Still images packaged: **82**
- Adaptive looping videos packaged: **82**
- Unique loop hashes: **82**
- Director candidates registered: **82**
- Minimum dimensions: **540 × 720**
- Duration: **4.8 seconds**
- Frame rate: **20 fps**
- Encoding: **H.264 / yuv420p**
- Current Echo Album projects exercised in-memory: **137**
- Replacement-shot selections validated: **6,333**
- Reference candidates selected at least once: **82 / 82**

The records live in:

- `data/echo-reference-animated-media.json`
- `data/media/echo-reference-animated-cards/`
- `artifacts/reference-atlas-adaptive-loops/director-eligibility-audit.json`

The reusable source family is `reference`. Reference media is not relabeled as
Avatar, Scene, Item, or Tarot media.

## What worked

- One model-depth pass amortized depth estimation across the full batch.
- The vertical camera profile remained readable across all reference domains.
- Five soft depth bands avoided the cutout errors seen in foreground-mask
  experiments.
- Depth-aware particles remained occluded by nearer geometry.
- Adaptive Default light stayed restrained on ordinary daylight imagery while
  still finding existing candles, neon, highlights, and electricity.
- Content-addressed intermediate checks made the batch safely restartable.
- A dedicated catalog and source family preserved Card and media provenance.

## Noise and correction

The first atmosphere router inspected the complete image-generation prompt.
Generic scene language caused it to over-select one particle family. Routing
was narrowed to the Reference title and locally retained public context, then
only affected finishing passes were regenerated.

The corrected distribution is:

- Sea spray: 28
- Golden runes: 15
- Neutral Atlas motes: 12
- Snow / ash: 8
- Yew pollen: 7
- Lunar dust: 7
- Arcane sparks: 5

## Truth and custody

- Source Reference Cards remain unchanged.
- Generated images and loops remain proposals, not identity truth.
- Human review is still required.
- Public activation, canon promotion, and minting remain false.
- The three private/unresolved Reference Cards remain excluded:
  `reference:asante-page-81`,
  `reference:fray-i-found-you-playlist-origin`, and
  `reference:westco-snohomish-origin`.

## Verification

- Focused candidate and balanced-recast tests: **10 passed**
- Full repository tests: **1,170 passed**
- Production build: **passed**
- Director eligibility audit: **passed**

The standalone Tarot smoke script did not complete in this environment. Port
8787 was serving an API-only surface; a temporary static UI origin reached the
app but its hard-coded 8787 fetch was rejected by CORS, so it could not lock a
Song Card into the Music Zone. This is an environment/launcher boundary and not
a media eligibility failure; no claim of Tarot visual smoke success is made.

## Reusable outcome

Skill/Flow candidate:

> Reference Card image → model depth → vertical loop → five depth planes →
> five occluded particle planes → Adaptive Default light → technical receipt →
> dedicated Reference Director candidate.

Guardrail:

> Atmosphere selection may use public Reference context, but must not use
> private clues or generic prompt boilerplate, and media eligibility must never
> silently promote semantic approval.
