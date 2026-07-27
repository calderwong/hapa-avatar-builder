# Echo Reference Sharpening Protocol

## Purpose

The Reference Atlas should assume that every lyric-bearing Echo Album song is worth testing for:

- at least three distinct external canon activations; and
- at least three evidence-bearing internal routes to other album songs.

These minima are **coverage priors**, not claims that three references are already known. A deficit creates a research obligation. It never permits the miner or an LLM to invent a source, force a motif match, silently infer authorial intent, or promote a proposed reading into Hapa canon.

The protocol adds a deterministic sharpening overlay to the existing Reference Card graph. It preserves the source graph and produces reviewable enrichment records, research packets, benchmarks, and proposed bridges.

## The repeatable three-pass loop

### Pass 1 — Inventory and coverage truth

For every song:

1. Confirm that provenance-bound lyric lines exist.
2. Count distinct source-backed external Reference Cards.
3. Count distinct album peers reachable through qualified internal routes.
4. Separate:
   - `coverage-prior-satisfied`;
   - `research-required`; and
   - `blocked-missing-lyrics`.
5. Record the exact deficit without filling it.

An internal route qualifies only when it:

- connects at least two distinct songs;
- is not classified as unresolved evidence;
- clears the configured confidence floor;
- retains exact lyric spans and pointers; and
- has an explainable song-to-song relationship.

### Pass 2 — Context expansion and research packets

For every current external activation, create a theme-delta record containing:

- lyric spans;
- the reading without external context;
- what the external canon contributes;
- a candidate theme or takeaway after loading that context;
- the possible effect:
  - reinforces;
  - reframes;
  - complicates;
  - contradicts;
  - extends; or
  - remains an open question;
- competing interpretation IDs;
- evidence and citation pointers;
- visual, spoken/audio, verbal/multilingual, and symbolic/mechanical language seeds; and
- an explicit Human decision gate.

The effect remains proposed. External canon may modify interpretation while remaining external to Hapa canon.

For every external coverage gap, create a bounded research packet:

- candidate lyric clues;
- exact lyric pointers;
- strongest internal song context;
- source requirements;
- theme-delta questions;
- alternative-reading requirements;
- cross-language channel requirements; and
- a prohibition on automatic canon promotion.

Candidate clues are not references. They become external Reference Cards only after source review and lyric-specific interpretation work.

### Pass 3 — Adversarial verification and integration

1. Hold unresolved or weak internal routes rather than counting them.
2. Keep continuation and contrast readings side by side.
3. Propose external-to-internal bridges only when:
   - both records co-activate in the same song; and
   - exact lyric proximity or shared semantic language supports the bridge.
4. Keep every derived bridge:
   - proposed;
   - non-canon; and
   - Human-unapproved.
5. Recompute benchmarks and stop if authority or evidence invariants fail.

## LLM/web research handoff

An LLM with source access should consume one research item at a time and return:

1. candidate external entity and namespace;
2. exact lyric span;
3. primary or authoritative source when available;
4. concise external canon summary;
5. reading without the canon;
6. reading with the canon;
7. proposed theme effect and takeaway change;
8. at least one competing reading;
9. reusable visual/audio/verbal/symbolic language seeds;
10. confidence and caveats; and
11. a proposed Reference Card revision or new Card.

The validator should reject:

- search-result-only citations;
- references supported only by a common word;
- copied answers without lyric-specific context;
- a single asserted “true meaning”;
- private-context exposure;
- copyrighted media replication instructions;
- and any automatic Human approval or canon claim.

## Cross-language shared media language

Each external activation exposes candidate channels:

| Channel | Purpose | Boundary |
| --- | --- | --- |
| Visual | themes, mechanics, emotions, and abstract motifs for Card art | Do not reproduce protected character designs |
| Audio/spoken | names, aliases, and phonetic cues | Do not copy recordings or lyrics |
| Verbal/multilingual | literal and multilingual signals | Preserve proper nouns; translate concepts and caveats |
| Symbolic/mechanical | actions, constraints, transformations, and recurring symbols | A shared mechanic is not proof of intended reference |

These channels let different languages converge on a relationship or mechanic even when the exact words differ.

## Benchmarks after every pass

The pipeline records:

- lyric-bearing versus blocked songs;
- songs meeting the external 3-reference prior;
- remaining source-backed external deficit;
- songs meeting the qualified internal 3-peer prior;
- theme-delta record count;
- research queue count;
- qualified versus held internal routes;
- external-to-internal bridge count;
- authority violations; and
- ten 0–4 diagnostics:
  - evidence;
  - precision;
  - plurality;
  - imported meaning;
  - connectivity;
  - uncertainty;
  - provenance;
  - safety;
  - navigability;
  - actionability.

The diagnostic average measures process completeness. It does not measure truth, artistic value, or authorial intent.

## Running it

Dry run:

```bash
npm run echo:references:sharpen
```

Write the three snapshots, comparison, enrichment database, and local HTML benchmark:

```bash
npm run echo:references:sharpen:apply
```

Useful options:

```bash
node scripts/sharpen-echo-reference-atlas.mjs \
  --apply \
  --minimum-external 3 \
  --minimum-internal 3 \
  --internal-confidence-floor 0.55 \
  --max-bridges-per-activation 3 \
  --bridge-line-distance 8 \
  --output artifacts/echo-reference-sharpening
```

## Interpretation and authority boundary

The protocol deliberately separates:

1. a lyric signal;
2. a candidate external source;
3. source-backed external canon;
4. a proposed context expansion;
5. a proposed change to theme or takeaway;
6. a Human review decision; and
7. Hapa canon.

No earlier stage silently implies a later one.

## Post-pass reflection

Every completed run must state:

- what became clearer;
- what remained uncertain; and
- what the next pass needs.

That reflection is included in the machine-readable benchmark comparison so a later LLM, Human reviewer, or UI does not mistake a dense graph for a complete one.

