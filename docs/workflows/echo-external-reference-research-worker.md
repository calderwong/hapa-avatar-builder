# Echo external-reference research worker

## Purpose

Run the Reference Atlas research queue through attributable web research,
convert supported external canon into proposed Reference Cards, record honest
no-match or ambiguous outcomes, recheck the complete album after every bounded
cycle, and pass only evidence-eligible additions to the existing GPT Image
lane.

This extends the existing research loop. It does not replace the miner,
sharpening metrics, result validator, Card projector, lyric recheck, or art
eligibility gate.

## Why the earlier queue did not run

The original loop implemented:

`seed → claim → submit → validate → cycle → lyric recheck → art plan`

It did not contain a worker that searched public sources and produced the
required structured result. Seeding therefore created work but never executed
it.

## Worker route

1. Cluster queued jobs by normalized candidate phrase.
2. Lease one bounded cluster.
3. Build a minimized research packet.
4. Invoke a read-only, ephemeral Codex session with live web search and a
   strict output schema.
5. Require direct URLs and prefer primary, official, scholarly, government,
   museum, archive, or authoritative sources.
6. Validate every exact lyric line and every source URL.
7. Either:
   - create a `validated` sourced contribution;
   - record `resolved-no-reference`; or
   - record `resolved-ambiguous`.
8. Integrate validated contributions as one cycle.
9. Re-run the complete album sharpening and connection pass.
10. Plan GPT Image work only for Cards that cross the existing evidence gate.

## Minimized external packet

The worker receives only:

- the candidate phrase;
- the song title and stable song ID;
- the exact lyric line and at most one neighboring line on either side;
- compact internal-song relationship types and shared-language terms;
- potentially matching existing Reference Card titles and aliases;
- the research question.

It does not receive the full song corpus, local files, private stores, Card
media, credentials, or mutation authority. The worker runs in an empty
temporary directory under a read-only sandbox and can only return the
schema-bound research candidate.

Running the live worker transmits this minimized packet to an external
Codex/web-search session. The operator explicitly authorized that disclosure
for the 2026-07-26 research run. Future runs still require their own operator
authorization unless a broader standing policy is adopted.

## Commands

Inspect current execution state:

```bash
npm run echo:references:research:worker:status
```

Preview the next clusters without external calls:

```bash
npm run echo:references:research:worker:plan -- --limit 10
```

Close only deterministic generation metadata and section-label noise:

```bash
npm run echo:references:research:worker:triage-local -- --apply
```

This pass is deliberately narrow. It recognizes exact delivery annotations and
the imported `Final Chorus (Climactic Version)` /
`Third Verse (for reference)` labels. It records the exact local lyric pointer
as evidence and does not pretend that a web search occurred.

Reuse already attributable local Reference Cards before making external calls:

```bash
npm run echo:references:research:worker:reconcile-local -- --apply
```

This deterministic pass only accepts one unambiguous title, alias, or
distinctive literal-signal match. If the exact occurrence already exists, it
closes the duplicate queue job with a lineaged `existing-reference` receipt.
If the occurrence is missing, it reuses the Card's citations, claims, context,
themes, mechanics, and signal vocabulary to propose the exact lyric
connection through the same validator and cycle path.

Run one bounded live cluster after disclosure approval:

```bash
npm run echo:references:research:worker:run -- --limit 1 --apply
```

Run a specific normalized cluster:

```bash
npm run echo:references:research:worker:run -- \
  --cluster coin-to-your-thor-met-him-at-the-gala \
  --limit 1 \
  --apply
```

Every applied run creates a pre-run backup in `data/backups/`, writes raw
schema-bound worker candidates under
`data/echo-reference-research-loop/worker-candidates/`, updates the loop
atomically, and emits a cycle whenever it has newly validated results.

## Quality and stop rules

- Capitalization alone is never sufficient evidence.
- Generic language, section headings, generation notes, and internal Hapa
  terms should resolve as no supported external reference unless sources
  establish otherwise.
- A supported result must include exact lyric evidence, a without-context
  reading, a with-context reading, narrative consequence, theme delta,
  alternative reading, and at least three shared-language channels.
- Source facts establish external canon, not exclusive songwriter intent.
- Low-quality results, invalid lyric text, invalid URLs, and authority
  overclaims fail closed.
- `resolved-no-reference` and `resolved-ambiguous` are preserved across
  reseeding when the exact lyric target has not changed, preventing detector
  noise from returning forever.
- New Cards remain pending human review, non-canon, unminted, and inactive.

## Completion condition

The research goal completes when every lyric-eligible song either:

- has at least three supported external Reference occurrences; or
- has an evidence-bearing unresolved exception explaining why the minimum
  could not be reached without inventing references.

Only after that coverage audit should the resulting new Cards be considered a
complete research population for the image and Adaptive Loop pipelines.

## Completed reference run

The authorized 2026-07-26/27 run closed all **234** queued jobs:

- **82** integrated, source-backed proposals;
- **8** resolved against existing Reference Cards;
- **97** evidence-bearing no-reference resolutions;
- **47** evidence-bearing ambiguous resolutions;
- **0** queued clusters remaining.

The supported proposals contain **59** distinct public references and **202**
distinct source URLs. Every integrated result has at least one source, and no
resolution is missing its research query or local evidence pointer.

The album-wide recheck leaves **47** songs meeting the three-external-reference
target and an external-reference deficit of **151**. That deficit is preserved
honestly: exhausted clues remain explicit no-reference or ambiguous results
instead of being converted into invented references.

The resulting media population contains **144** GPT Image-eligible Cards. Each
has a Reference image and a `model-depth-vertical-combined-adaptive-v1` loop;
all remain non-canon, inactive, unminted, and pending human review.
