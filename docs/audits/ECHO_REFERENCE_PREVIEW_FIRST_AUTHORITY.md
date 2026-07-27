# Echo Reference Preview-First Authority Decision

Status: local-first prototype policy and Human-owner batch decision  
Owner: Hapa Avatar Builder / Reference Atlas  
Authority receipt: `data/echo-reference-governance/preview-first-authority.json`

## Objective

Remove the circular review gate in which a person had to approve a Reference Card or generated visual before the UI would show enough evidence to review it.

## Decision

**Preview is not promotion.** Every valid local Reference Card proposal, graph connection, still image, and loop video may be displayed before approval. Approval controls trusted downstream use, not visibility.

The 2026-07-27 Human-owner decision approved the current supported exact Card revisions for local Reference Atlas, Tarot Draw, and Echo Director candidate use. It did not grant public activation, canon, minting, publication, commerce, or identity truth.

Current batch:

- 853 supported Reference Cards approved for scoped local use.
- 2,595 supported graph connections approved for scoped local use.
- 82 completed research updates resolved.
- 144 exact-revision image and adaptive-loop pairs approved.
- 250 unresolved Reference Cards, 285 unresolved lead records, and 750 unresolved edges closed as `resolved-without-promotion`; they remain visible and retriable.

## Route

1. Research projection -> preview-first authority receipt `[DATA]`
2. Human-owner decision -> exact Card/media revision lists `[HUMAN -> DATA]`
3. Authority receipt + research projection + media catalog -> governed runtime projection `[DATA]`
4. Governed runtime projection -> Reference Atlas evidence, images, loops, and graph `[UI]`
5. Governed runtime projection -> Tarot Draw reference Cards `[UI]`
6. Approved media projection -> Echo Director candidate lane `[DATA]`
7. Public/canon/mint/commerce -> unchanged separate gates `[HUMAN]`

## Dependencies

- `data/echo-reference-research-loop/projected-run.json`
- `data/echo-reference-animated-media.json`
- exact Reference Card ID and revision matches
- locally available content-hashed stills and H.264/yuv420p loops
- `src/domain/echo-reference-runtime.js`
- `server/echo-reference-mining-store.mjs`

## Subscribers

- Echo Album Reference Atlas
- Tarot Draw Reference Card browser and playback rail
- Echo Director reference-media candidate builder
- future Reference Atlas search, graph, and sharpening passes

## Guardrails

- A media preview remains visible while pending.
- A stale Card revision does not inherit an older visual approval.
- Unsupported leads are not converted into invented references.
- Generated media is not identity truth.
- Approval is local and exact-revision scoped.
- Public activation, canon, minting, publication, and commerce remain false.
- The repeatable batch command is idempotent for unchanged source and policy inputs.

## Sharpening reflection

- Useful evidence: all 144 existing image/loop pairs already passed the Director technical audit and were selected at least once across the album proof.
- Noise removed: a generic `humanReviewRequired` flag had been used as both an authority boundary and a rendering gate.
- Misunderstanding corrected: hiding a candidate does not make review safer when the hidden artifact is the evidence the reviewer needs.
- Reusable result: `visible-before-review` is now an explicit media and UI policy; exact-revision approval remains separate.
- New guardrail: future generators must label preview visibility at creation time, before a review decision exists.

Candidate artifact types: Decision Card, Protocol Card, Continuous Sharpening lesson.
