# GPT Image Reference Atlas Benchmarks

The GPT Image lane creates a high-water visual benchmark for each eligible, source-backed Reference Atlas Card. It complements the scalable local Hapa Media Node lane; it does not replace it.

The lane separates three responsibilities:

1. Reference Atlas owns source context, evidence, privacy, occurrences, and eligibility.
2. GPT Image proposes full-bleed artwork from a bounded visual prompt.
3. Avatar Builder deterministically assembles the proposed artwork with the exact Card title, thesis, citation, hash, and review state.

Generated artwork never changes the source Reference Card, interpretation status, public visibility, canon, mint, or publication state.

## Eligibility

Eligibility is deliberately strict. A Card is eligible only when it:

- uses the `reference:*` source-reference namespace;
- has a supported evidence class;
- has public context;
- has at least one lyric occurrence;
- does not contain private clues;
- is not private.

The diagnostic API returns every applicable exclusion reason rather than stopping at the first failure:

- `not-source-reference`
- `unsupported-evidence:<class>`
- `missing-public-context`
- `missing-occurrence`
- `contains-private-clues`
- `private-visibility`

This makes a privacy hold distinguishable from incomplete evidence or a derived motif Card.

## Commands

Plan or refresh the deterministic prompt manifest:

```bash
npm run echo:reference-art:gpt:plan -- \
  --apply \
  --manifest=/absolute/path/manifest.json
```

Fetch the next bounded prompt batch:

```bash
npm run echo:reference-art:gpt:next -- \
  --manifest=/absolute/path/manifest.json \
  --limit=8
```

After Codex built-in image generation produces an image, import it:

```bash
npm run echo:reference-art:gpt:import -- \
  --apply \
  --manifest=/absolute/path/manifest.json \
  --output-root=/absolute/path/output \
  --card=reference:example \
  --image=/absolute/path/generated.png
```

Inspect status and eligibility:

```bash
npm run echo:reference-art:gpt:status -- \
  --manifest=/absolute/path/manifest.json \
  --output-root=/absolute/path/output
```

Build the static review gallery and copy the manifest receipt beside it:

```bash
npm run echo:reference-art:gpt:gallery -- \
  --apply \
  --manifest=/absolute/path/manifest.json \
  --output-root=/absolute/path/output
```

No command in this lane calls a remote image provider directly. Codex performs the explicit image-generation step, and the import command records the resulting bytes, media type, SHA-256, prompt lineage, deterministic assembly, and mandatory review state.

## Prompt contract

The prompt treats `publicContext` as authoritative and asks for:

- one emotionally precise interpretation;
- one concrete action;
- one context-specific environment;
- at most three supporting symbols for generic recipes;
- original subjects, clothing, objects, and environments;
- no text, numerals, logos, title plates, borders, or UI.

Explicit reference recipes may supply a stronger subject/action/environment thesis. Generic recipes must not fall back to a generic archive, harbor, portal, or fantasy traveler.

## Human review rubric

Every imported result is `review-required`. Review must reject or revise an image when:

- it recreates a recognizable franchise character, costume, logo, or celebrity likeness;
- visual polish masks a weak or incorrect semantic reading;
- the image literalizes a contested interpretation;
- it invents text, numerals, insignia, or evidence;
- it leaks or implies withheld private context;
- it centers spectacle while losing the transferable mechanic;
- anatomy, tools, reflections, physical causality, or composition fail;
- the source Card cannot still be understood without treating the image as evidence.

The strongest benchmark is not the closest fan-art reproduction. It is an original image that makes the Card's transferable relationship, dilemma, mechanic, or historical consequence easier to understand.

## Relationship to the local lane

Use GPT Image benchmarks to:

- establish a composition and symbolic-synthesis ceiling;
- discover prompt and review failure modes;
- select difficult Cards that deserve authored scene recipes;
- evaluate local FLUX/MLX output card-for-card.

Use the local Hapa Media Node to:

- iterate cheaply and privately;
- generate multiple candidates;
- preserve local custody;
- scale across the complete eligible set.

Both lanes terminate in deterministic Card assembly and human review.
