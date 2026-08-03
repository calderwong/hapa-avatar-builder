# Human Enricher implementation reflection

## Checkpoint 1 — canonical scope and reuse decision

- **Objective:** add a top-level Human Enricher where a person can inspect every video known to Hapa Avatar Builder, grade quality, attach `@Avatar` relationships, leave Echo State director notes, and add Echo State song or other references.
- **Evidence inspected:** canonical `AGENTS.md`, `README.md`, `hapa-node.json`, `src/App.jsx`, `src/overcard/hostTargets.js`, `src/domain/systemMedia.js`, the `/api/system-media` routes in `server/api.mjs`, Echo State director project hydration, and the local runtime-data boundary in `data/README.md`.
- **What worked:** the existing System Media dashboard already deduplicates and relates media from the local media library, Avatar Cards, Tarot Cards, scenes, and source metadata. The host-target registry already owns top-level Builder navigation. Echo director project hydration is the bounded place to expose matching human notes to the director.
- **What was noise:** the separate `hapa-avatar-dashboard` indexes `/Desktop/Avatars`, but it is not the canonical Hapa Avatar Builder and must remain untouched.
- **What was misunderstood:** “Hapa Avatar Builder” initially appeared adjacent to the older Avatar Dashboard; repository name-resolution proved the Builder checkout is the owner.
- **What changed:** the implementation target is `/Users/calderwong/Desktop/hapa-avatar-builder`. Human input will be stored as a revisioned overlay instead of rewriting source media, Avatar, Tarot, scene, or Echo project records.
- **What remains reusable:** System Media collection/relationship normalization, Builder host-target navigation, local-file media routes, Hapa song and Avatar stores, and Echo project response hydration.
- **New guardrail:** a quality grade or human note is human-authored direction, not canon, ownership, rights clearance, publication approval, or permission to render. Source identity and relationships remain intact.

**Candidate:** Decision Card / Flow explainer — “Human-authored media direction as a non-destructive overlay.” The originating Codex turn remains the attributed source.

## Checkpoint 2 — implementation and verification

- **What shipped:** an eighteenth top-level HostTarget and local process adapter; a paginated Human Enricher workbench; a canonical overlay domain/store; read/write API and CLI parity; append-only update receipts; and bounded Echo State director projection onto matching timeline shots.
- **Live catalog evidence:** the canonical runtime indexed 10,884 videos, 74 Avatar choices, and 157 Echo State/song reference choices. The read endpoint returns bounded pages while the CLI can request the complete catalog.
- **Contract evidence:** focused Human Enricher, Overcard, Echo payload/detail, and process-adapter suites pass. The production build passes. The full repository run reports 1,646 passes and two failures confined to pre-existing concurrent Echo transition-validation and Record Garden verification-ledger edits.
- **Visual evidence boundary:** both controlled browsers rejected the local loopback page with `ERR_BLOCKED_BY_CLIENT`. The required Electron smoke reached the app shell but the pre-existing stale Record Garden ledger prevented navigation to its unrelated Tarot target. No screenshot is claimed.
- **What was corrected during verification:** omitted Echo variant timelines were initially converted to empty arrays by a default argument. The projector now preserves `undefined`, so compact director responses remain compact. The new HostTarget is also registered in the canonical process-adapter manifest and all fixed host-count contracts now describe eighteen routes.
- **What remains reusable:** identity matching works across fingerprint, media/asset ID, path, local-file URI, and runtime URI. The enrichment overlay and Echo projection are UI-independent and can be consumed by future director tooling without transferring source ownership.
- **New guardrail:** every new runtime-bearing top-level HostTarget must update the HostTarget registry, process-adapter registry, static discovery manifest, route-count contracts, and canonical Overcard documentation together.

## Checkpoint 3 — optical sub-agent proposals and human validation

- **Objective:** seed Quality, description, categorization, Avatar relationships, Hapa references, and Director Notes through real vision-capable sub-agent inspection, then let humans validate/edit/append/reject without promoting agent guesses to truth.
- **Evidence inspected:** the Media / Embodiment capability page; Avatar/video node profiles; current Human Enricher identity and persistence contracts; System Media frame manifests; Avatar, song, scene, item, Tarot, and media stores; Echo claim/review patterns; four sub-agent packets covering 16 videos and 48 inspected keyframes.
- **What worked:** two vision-capable sub-agents used `view_image` on every assigned frame across four bounded waves and authored timestamp-specific observations. Their pass caught a probable duplicate pair, challenged an incorrect Calder link, found high-confidence Blue identity matches, retained uncertainty where identity was weak, rejected an incoherent sushi/fire/eye transition, and held real-person footage for consent/privacy review.
- **What was noise:** existing OCR, filenames, similarity scores, document kinds, and semantic rankers can help navigation but cannot count as optical review or author grades. They are excluded from completion evidence.
- **What was misunderstood:** three representative frames are the minimum, not a universal maximum. Every registered frame must be delivered and addressed; records with incomplete frame evidence remain unfinished.
- **What changed:** agent proposals now live in a separate revisioned store with hash-bound frame observations, explicit reviewer/task/model receipt, confidence, source-labeled inferences, and append-only events. The Human Enricher exposes filmstrips and editable Use/Append/Reject actions. Only a saved human revision projects to Echo.
- **What remains reusable:** stable Human Enricher video keys, System Media frame manifests, local atomic/event stores, existing human optimistic revisions, and exact Hapa source paths. The queue is resumable across the 10,884-record catalog.
- **New guardrail:** automation may prepare evidence but never make semantic judgments. Report exact reviewed/pending/blocked/remaining counts and never imply the full catalog was seen from queue enumeration.

**Candidate:** Flow explainer / Lesson Card — “Frames delivered and addressed: optical agent proposal to human-authored direction.” The originating Codex turn and sub-agent task receipts remain the attributed evidence.

## Checkpoint 4 — reviewed-set visibility

- **Objective:** make the 16 genuinely inspected videos directly viewable instead of merely ranking them near the top of a much larger paginated catalog.
- **Evidence inspected:** the current Human Enricher client filters, server pagination order, optical-review summary counts, and the separate agent-review authority boundary.
- **What changed:** added server-backed All, Optically reviewed, Needs human validation, Human validated, and Not optically reviewed views with exact catalog counts. The Optically reviewed view filters before pagination, so it returns the complete reviewed set rather than only matches from the current 120 loaded rows.
- **What remains reusable:** the existing review records, evidence filmstrip, grade sort, and human editing controls are unchanged; the Builder remains the owning review surface and Echo remains a downstream consumer of saved human direction only.
- **New guardrail:** catalog-status views must filter before pagination whenever their counts describe the full catalog.

## Checkpoint 5 — calibrated defaults, autosave, and explicit visual references

- **Objective:** use human Quality edits to calibrate later agent guidance, remove unnecessary save friction, begin untouched records at the agent grade, require explicit visible Hapa/Echo reference comparison, and measure the full-catalog campaign.
- **Evidence inspected:** 15 paired human/agent Quality grades from the local enrichment and proposal stores; two fresh three-frame, vision-model review packets; the queue/API contract; and the Human Enricher editing lifecycle.
- **What worked:** the human sample produced a 66.7% exact-match rate, 93.3% within one grade, 0.4 mean absolute error, and a +0.133 average human-minus-agent delta. Agent grade 4 was confirmed exactly in all seven paired cases; smaller lower-grade groups remain weak evidence and are exposed with their sample counts.
- **What was noise:** filenames, OCR, similarity scores, and a pre-existing reference label are not proof of a visual Hapa/Echo match. They remain retrieval aids only.
- **What was misunderstood:** the previous “References” list did not guarantee that an agent looked for visible Echo/Hapa similarities. A dedicated completed pass with observed signals, match types, citations, and negative findings is now required for new proposals.
- **What changed:** Quality now starts at the agent proposal without creating human truth; edits autosave after 350 ms and flush before row navigation; the UI and API expose aggregate calibration; new proposals require `visualReferenceAnalysis`; and the workbench renders that analysis separately from manually editable references.
- **Measured campaign evidence:** two fresh optical reviews took 302.000 and 214.738 seconds, averaging 258.369 seconds per video. Projected across 10,884 logical records, this is 781.1 serial agent-hours or 10.85 continuous days with three agents; a 20% operations allowance produces a 13.0-day plan. Exact token telemetry was unavailable, so the documented planning envelope is 130.6–272.1 million total tokens (195.9 million midpoint), with about 47.3 million output tokens implied by the measured packet sizes.
- **Verification:** the focused Human Enricher suites pass, the production build passes, and the live 8797 UI renders all 16 reviewed rows, 15 calibration pairs, the agent-started unscored Q4 record, Autosave On, no manual Save button, and the dedicated reference panel. The repository-wide run reports 1,655 passes and two unrelated known failures: a stale Echo transition visual digest and stale Record Garden verification ledger. The Tarot desktop smoke aborted at Electron launch; this checkout does not define a `smoke:overcard` package script.
- **What remains reusable:** revisioned human overlays, append-only receipts, the resumable evidence queue, registered frame manifests, per-grade calibration bins, and explicit Hapa source citations.
- **New guardrail:** human calibration is a bounded prior, not a score rewrite. Sample counts travel with every aggregate, direct frame inspection remains mandatory, and no dedicated reference scan is represented as “no match.”

**Candidate:** Lesson Card — “Agent-default, human-delta media review with explicit visual-reference evidence.” The originating Codex turn and timed sub-agent receipts remain the attributed evidence.
