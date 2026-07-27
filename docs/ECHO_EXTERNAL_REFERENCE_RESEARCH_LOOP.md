# Echo External Reference Research Loop

This loop turns external-reference discovery into a repeatable, evidence-gated sharpening process:

`research clue → source canon → exact lyric evidence → theme delta → whole-album recheck → graph benchmark → GPT Image Card proposal → repeat`

It never promotes a reference, interpretation, image, or relationship to Human-approved canon automatically.

## Why it exists

The Reference Atlas already had source-backed Cards, internal comparison routes, and a GPT Image benchmark lane. The missing part was a closed loop that could:

1. research a bounded external clue;
2. return symbols, themes, characters, narrative beats, mechanics, emotions, and audio motifs;
3. distinguish source fact from lyric-specific inference;
4. re-run the new signal against every song and existing connection;
5. measure gains and false-positive pressure;
6. make only validated Cards eligible for GPT Image planning;
7. carry the projected graph into the next cycle without mutating Human-approved canon.

## Research contribution contract

Every result must contain:

- an exact research-job identity;
- a public Reference title, aliases, type, and bounded context;
- at least one `http` or `https` source;
- a source class and the specific claim supported by that source;
- an exact song, line number, lyric text, and matched text;
- readings with and without source context;
- a narrative consequence;
- one proposed theme effect:
  - `reinforces`
  - `reframes`
  - `complicates`
  - `contradicts`
  - `extends`
  - `open-question`
- at least one alternative reading;
- at least three populated shared-language channels;
- a caveat;
- explicit non-canon and no-authorial-intent authority state.

Invalid source URLs, lyric mismatches, missing alternatives, weak channel coverage, or authority overclaims hold the result.

## Recheck precision

New signals are re-run across every lyric. Recheck does not treat every lexical hit equally.

- The originally researched lyric occurrence enters the proposal overlay.
- Multiword signals may produce additional proposed occurrences.
- Distinctive single tokens of seven or more characters may produce additional proposed occurrences.
- Shorter single-token matches remain `held-ambiguous-signal`.

This matters for names such as `Thor`, which may indicate Marvel, Norse myth, a Hapa Avatar, an animal, or a person. Held matches remain visible in the quality receipt but do not inflate coverage, theme deltas, or graph connections.

## Quality receipt

Each cycle records:

- external songs meeting the three-reference prior;
- remaining external-reference deficit;
- theme-delta records;
- external-to-internal bridges;
- research-queue size;
- sharpening diagnostic average;
- GPT Image eligibility and new jobs;
- average research-result score;
- exact-line failures;
- authority violations;
- newly found recheck occurrences;
- held ambiguous rechecks;
- a stop recommendation.

The score diagnoses process completeness. It does not measure truth or authorial intent.

## GPT Image boundary

Only validated source-backed Cards are sent to the existing GPT Image benchmark planner.

The prompt:

- uses `publicContext` as authoritative;
- asks for one original symbolic action;
- includes themes and mechanics;
- prohibits text, logos, copied character designs, and celebrity likenesses;
- remains art-only;
- requires deterministic Card assembly and Human review after import.

Generated art is a proposal. It is never evidence.

## Commands

Seed clue-sized jobs from the latest sharpening queue:

```bash
npm run echo:references:research:seed -- --apply
```

Seeding mines the current song store and freezes `source-run.json`. Every later command uses that same snapshot. If the sharpening packet and current store do not match, seeding stops and asks for a sharpening refresh instead of mixing corpus versions.

Claim a bounded batch:

```bash
npm run echo:references:research:claim -- \
  --apply \
  --runner=codex-gpt-5 \
  --limit=3
```

Claim exact jobs when a Human wants a focused pass:

```bash
npm run echo:references:research:claim -- \
  --apply \
  --runner=codex-gpt-5 \
  --limit=2 \
  --job=reference-research:example-song:clue-one \
  --job=reference-research:example-song:clue-two
```

Submit a research result:

```bash
npm run echo:references:research:submit -- \
  --apply \
  --result=/absolute/path/result.json
```

Integrate validated results into the next non-canon projection and rerun the graph:

```bash
npm run echo:references:research:cycle -- \
  --apply \
  --limit=4
```

Get the next evidence-gated GPT Image prompts:

```bash
npm run echo:references:research:art-next -- --limit=4
```

Inspect status:

```bash
npm run echo:references:research:status
```

Runtime state is stored under:

`data/echo-reference-research-loop/`

The generated dashboard is:

`data/echo-reference-research-loop/index.html`

## Continuous sharpening rule

The next cycle uses the previous cycle's projected run. This means new source context can:

- find additional lyric occurrences;
- enrich an existing Reference Card instead of duplicating it;
- create new external-to-internal bridges;
- change coverage and research priority;
- create new visual candidates;
- preserve alternative interpretations and held ambiguity.

The loop ends only when a Human pauses it, quality recommends a stop, or the research queue no longer yields useful source-backed changes.
