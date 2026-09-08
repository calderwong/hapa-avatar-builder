# Echo caption typography across the actual encoder — September 8, 2026

Status: **verified implementation progress; ECHO-06/18 remain open**. Source: Codex task`01a072d3-d593-74f2-8c89-2470c2ee1a40`. A2 is active; nine requirements done/nine in progress. Workflow effectiveness remains unevaluated.

## Objective and owning surface

Resolve retained encoded-text differences and exercise managed Song Card output. Reused the shared caption presentation owner, installed HyperFrames CLI, actual headless browser, existing encoded fixtures and real Builder plan/approval/render-start APIs. The only product change sets`textRendering: geometricPrecision` on the existing caption panel. HyperFrames already inserts`html,body,*{text-rendering:geometricPrecision}` into its compiled output; Preview and standalone generated pages previously used the browser default. No renderer replacement or upstream dependency mutation was needed.

## Evidence and result

The actual native matrix passes429 observations over39 cases: four templates, three aspects, full/half/reduced motion, disabled text, dense passages, sustained words, fallback and reverse seeks. Maximum native full-frame mean difference0.0268/255; cached animation performs zero geometry reads and synchronous p95<=0.1001ms, excluding browser paint/GPU. All measured glyph boxes remain inside their panels and supplied protected regions stay clear.

The15 MP4s from the preceding checkpoint are reused unchanged. Their actual HyperFrames compilation already applied geometric precision, so the product change corrects Preview to that existing encoded behavior. Comparison-only sRGB copies honor native PNG ICC profiles. With unchanged thresholds, the strict gate improves from35/60 to55/60 samples; all36 active-caption samples have bright-glyph retention>=99.9827%, up from88.6024%. Five samples still exceed the3/255 full-frame mean threshold (maximum3.4531/255): vertical Stacked Hook at1.3/2.5s, square Scanline at2.5s, and square Stacked Hook at1.3/2.5s. Glyph-retention checks pass; retain global color/encoding differences under the final fidelity work instead of silently relaxing the gate.

Six affected presentation/layout checks and the current delivery build pass.55 protected source/cut and12 authoring hashes remain unchanged. No broad suite or already-accepted resource test was repeated.14 supervised stages including the two isolated APIs are terminal/absent; two temporary browser profiles were removed.

## Managed Song Card attempt

The actual API accepts a derived eight-second Dear Papa plan into a separate mint store, followed by agent-attributed technical approval and enqueue. It returns409 during real render-start certification before encoding: the authoritative master is258.44seconds, and four stem inputs from the old pilot project are unreadable. This is a rejected verification input, not a product duration bug. No edition was minted, no canonical source was changed, and no managed-render completion is claimed.

Next attempt must use the **current prepared full-song selected project**, with verified stems and full authoritative duration, through the unchanged certification path. Do not truncate the graph to fit a smaller test or use the old pilot input as current prepared truth. The isolated failed candidate and response are retained for inspection; do not retry it unchanged.

## Experiments, mistakes and learning

- Turning off experimental drawElement capture did not resolve the glyph loss. An independent capture using the exact installed HeadlessChrome152 engine matched native caption geometry and had less than0.4/255 mean difference before encoding.
- Debug streaming renders do not retain frame files. A bounded non-streaming diagnostic retained actual JPEG frames, revealing both capture and encode differences. This diagnostic did not change production mode.
- Source inspection found a separate quality issue in HyperFrames0.7.66: the initial probe session uses JPEG80 while the later non-draft capture options request95. A guarded task-only in-memory quality correction gave a small improvement but did not solve the main mismatch. Keep it as upstream compatibility evidence; do not ship a private-bundle patch based on that experiment.
- A task-only PNG capture substitution changed the encoder declaration but left the reused probe session emitting JPEG; FFmpeg rejected mixed signatures. The failed process was terminated and verified absent before proceeding. No installed CLI bytes or production capture settings were changed.
- Inspection of actual compiled HTML found the missing geometric-precision rule. Putting that rule into the shared caption owner resolved the major text-shape mismatch without changing fonts, timing, thresholds or existing movies.
- The managed test used a short show with a full authoritative master and stale pilot stems. Its refusal is useful contract evidence, but preparing that inappropriate input cost time. Use the verified current preparation owner and match the real delivery scope before starting a service.

Evidence root:`$ECHO_REVIEW_WORKSPACE/encoded-fidelity-proof`. Start with`checkpoint-report.json`, `shared-typography/{native/report.json,encoded-comparison.json}`, `managed-start.json` and`cleanup-receipt.json`. Diagnostic captures are synthetic except for the unrendered Dear Papa plan. These results do not establish word-onset accuracy or human preference.

## Method and next action

The small code change addresses a shared discrepancy exposed by the complete cross-output batch. Verification reused all15 encoded outputs and avoided a new broad suite. Conviction was not invoked: there was no useful packet within its qualified literal-fact scope. Continue with current prepared full-song managed Song Card output, retain the five color failures, and consolidate ECHO-06 only when its full criteria are proven. Real200-onset annotations, later direction/comic/editor work, final pilot delivery and human preference remain open.

Reusable **Lesson Card candidate**: inspect compiler-injected CSS when native and standalone pages agree but actual encoded typography differs. Reusable **Decision Card candidate**: preserve failed prototype evidence, but ship the smallest owning-layer repair that restores the intended end-to-end behavior; do not mutate dependency bundles or weaken certification to make a fixture pass.
