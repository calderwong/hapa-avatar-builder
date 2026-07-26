# Local Reference Art Semantic Scene Pipeline — Learning Delta

## Objective

Turn dense Reference Atlas connections into high-quality local visual proposals without leaking private context, prompting pseudo-text, copying outside properties, or allowing generated imagery to replace source truth.

## Evidence inspected

- The current 1,020-Card Reference Atlas and its source-backed constellation graph.
- The existing hosted FLUX.2 queue, custody rules, and provider adapter.
- Five locally generated FLUX.2 Klein 9B quality probes.
- Hapa MLX Station's loopback identity, capabilities, task, and asset contracts.
- The existing Krea 2 node-owned preset and server credential boundary.

## What worked

- Local FLUX.2 Klein produced strong painterly lighting, palette, atmosphere, and vertical composition.
- The Reference Atlas supplied enough semantic structure to choose distinct visual theses.
- Hapa MLX Station already owned local generation, model discovery, task receipts, and immutable asset delivery.
- Deterministic seeds and multi-candidate planning made visual exploration reproducible.

## Noise and failure modes

- Passing exact titles, quoted lyrics, and “Reference Card” language caused pseudo-text and ornate generated borders.
- Asking one image to render an entire constellation produced symbolic collage rather than a legible action.
- Familiar franchise names pulled outputs toward copied visual identity.
- Historical references became atmospheric fantasy when structural geometry was not explicit.
- A beautiful image could still express the wrong doctrine: combat instead of demobilization, reading instead of direct experience, death spectacle instead of reciprocal care.

## What changed

- Added a semantic scene compiler that resolves dense evidence into one thesis, one subject, one action, one environment, and three symbols.
- Kept exact names, lyrics, public context, and graph neighbors in a local evidence receipt while excluding them from generation prompts.
- Made Hapa MLX Station the default generation owner and verified its identity/capability before dispatch.
- Added two or more deterministic candidate slots per Card.
- Added deterministic SVG assembly so exact title, citation, review state, and Hapa Card framing are never model-generated.
- Added explicit accept/reject review and an optional post-acceptance Krea 2 handoff.
- Kept the hosted BFL route available as a separate cost-confirmed fallback.

## Reusable principle

Dense context should drive the compiler, not appear verbatim in the render prompt.

```text
large evidence graph
        ↓
small visual contract
        ↓
several original proposals
        ↓
deterministic truth-bearing frame
        ↓
human selection
```

## New guardrail

The image model may propose pixels, but it may not author the Reference title, citation, provenance, review state, Card border, canon claim, or identity truth.

## Verification target

- Contract tests for scene boundaries, deterministic candidates, SVG assembly, review, Krea handoff, loopback identity, capability checks, and bearer-token custody.
- A live local candidate batch comparing raw output against the prior five-image failure pattern.
- Production build and focused regression suite.
