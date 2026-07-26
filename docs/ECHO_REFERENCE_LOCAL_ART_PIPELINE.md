# Local Reference Atlas Art Pipeline

## Outcome

The Reference Atlas can now produce reviewable Reference Card imagery through the existing local Hapa Media Node.

For the complementary Codex-built-in GPT Image quality-ceiling lane, see [GPT Image Reference Atlas Benchmarks](./ECHO_REFERENCE_GPT_IMAGE_BENCHMARKS.md).

The pipeline deliberately separates two jobs:

1. FLUX.2 Klein generates a full-bleed artistic scene with no names, lyrics, citations, borders, or Card chrome.
2. Avatar Builder deterministically adds the exact Reference title, public semantic thesis, citation host, provenance metadata, and review label in SVG.

This fixes the first quality batch's main failure: prompts containing titles, quoted lyrics, and Card-layout language caused the image model to invent pseudo-text, ornamental borders, and overly literal franchise imagery.

## Ownership

| Concern | Owner |
| --- | --- |
| Reference evidence, connections, eligibility, and privacy | Reference Atlas / Avatar Builder |
| Semantic scene compilation | Avatar Builder |
| Local FLUX.2 execution and raw artifact truth | Hapa MLX Station (`hapa-media-gen-node`) |
| Exact Card frame, title, context, citation, and receipt | Avatar Builder deterministic SVG assembly |
| Candidate acceptance | Human reviewer |
| Optional accepted-image polish | Hapa Krea 2 Identity Node |
| Hosted high-resolution fallback | Existing Black Forest Labs lane |

No generated image becomes identity truth, canon, public media, or a minted Card through this pipeline.

## Semantic scene compiler

Dense Reference Atlas evidence is useful for reasoning but harmful when copied wholesale into an image prompt. The compiler therefore resolves each eligible reference into:

- One visual thesis.
- One original subject.
- One dominant action.
- One environment.
- At most three supporting symbols.
- One controlled palette and composition contract.

Exact source names, quoted lyrics, and constellation evidence remain in the local scene receipt. They are not sent to FLUX.2.

The prompt boundary also forbids:

- Reference Card, Tarot Card, title-plate, or collectible-card layout instructions.
- Lettering, numerals, logos, captions, plaques, borders, or interface panels.
- Celebrity likenesses and copied franchise character designs.
- Treating generated art as source or identity truth.

Five high-value references have explicit pilot recipes because their first generated images exposed distinct semantic failure modes:

- Dylan Thomas / Good Night: demobilization instead of more combat.
- Mary's Room: first encounter with experience instead of generic reading.
- Tacoma Narrows: one present bridge and one historical reflection instead of fantasy bridge geometry.
- Grateful Dead folklore: repayment, burial, and returning guidance instead of band iconography.
- Slivers and Teferi: distinct original lifeforms sharing capabilities instead of copied franchise creatures.

Other eligible references use bounded theme/mechanic recipes until a human promotes a better explicit recipe.

## Candidate and review loop

Each Reference Card defaults to three deterministic candidates. Different seeds explore composition without changing the semantic contract.

```text
Reference Card + graph evidence
        ↓
semantic scene receipt
        ↓
2–3 local full-bleed candidates
        ↓
deterministic SVG Card assembly
        ↓
human accept / reject
        ↓
optional Krea finish handoff
```

Acceptance is per candidate. Rejecting one candidate does not alter the source Reference Card or the other candidates.

## Commands

Plan without calling any model:

```bash
npm run echo:reference-art:local:plan
```

Plan selected references and persist the queue:

```bash
npm run echo:reference-art:local:plan -- \
  --apply \
  --card=reference:dylan-thomas-good-night \
  --card=reference:frank-jackson-marys-room \
  --candidates=3
```

Inspect the queue:

```bash
npm run echo:reference-art:local:status
```

With Hapa MLX Station running on its loopback API, generate two candidates for one queued Card:

```bash
npm run echo:reference-art:local:run -- \
  --apply \
  --limit=1 \
  --candidate-limit=2
```

Accept a completed candidate:

```bash
npm run echo:reference-art:local:review -- \
  --apply \
  --candidate=<candidate-id> \
  --accept \
  --reviewer=<human-reviewer-id> \
  --rationale="Semantic action, composition, and originality passed."
```

Reject a candidate with the same command using `--reject`.

Create—but do not execute—an optional Krea 2 finishing handoff:

```bash
npm run echo:reference-art:local:finish-plan -- \
  --apply \
  --job=<job-id>
```

The Krea handoff uses the node-owned `comic_panel_restyle_quality` preset and remains held for an explicit operator run. It is available only after a candidate has been accepted.

## Runtime paths

The default queue is:

```text
data/echo-reference-local-art/queue.json
```

Default generated artifacts are:

```text
data/media/echo-reference-local-cards/<reference-card-id>/
```

Every candidate produces:

- `*-raw.png`: immutable full-bleed node output.
- `*-reference-card.svg`: deterministic assembled Card carrying exact text and provenance metadata.

For experiments, `--queue`, `--run`, and `--output-root` can point at isolated absolute paths.

## Security and custody

- The media URL must be a literal HTTP loopback origin.
- The runner verifies the service identity is `hapa-media-gen-node`.
- The authenticated capability document must advertise `flux2-klein-9b` text-to-image.
- The bearer token remains in the server-side process and is never written into a queue or request body.
- Asset downloads are size- and media-type checked.
- Existing artifacts are never overwritten when their digests differ.
- Candidate status and task/asset receipts make interrupted generation resumable.
- Private, withheld, unresolved, and non-Reference Atlas cards remain ineligible.
- Raw art and assembled Cards both require human review.

## Model and license boundary

The local route uses FLUX.2 Klein 9B through Hapa MLX Station with the node's default four steps and guidance of one. Its current model license is noncommercial. Generated output must remain reviewable and local until license, originality, safety, and publication policy are explicitly cleared.

The existing hosted FLUX.2 Max pipeline remains an explicit secondary lane for paid, higher-resolution experiments. It is not the default local workflow and requires its own cost confirmation.

## Quality gate

Reviewers should reject a candidate when any of these are true:

- The image contains visible pseudo-text, a fabricated title, or decorative Card chrome.
- The dominant action does not express the recorded thesis.
- A reference is represented only by a copied franchise design or celebrity likeness.
- Historical infrastructure is structurally misleading.
- A vulnerable or omitted participant is reduced to spectacle.
- The composition cannot survive the deterministic crop.
- Anatomy, hands, reflections, or load-bearing geometry visibly fail.

The first question is not “is it beautiful?” It is:

> Does this original scene make the Reference Atlas relationship easier to understand without pretending to be the source?
