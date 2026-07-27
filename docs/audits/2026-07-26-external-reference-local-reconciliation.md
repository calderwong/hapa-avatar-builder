# External Reference local reconciliation — 2026-07-26

## Objective

Reduce unnecessary external research by reconciling queued lyric clues against
already attributable Reference Cards, while preserving exact lyric evidence,
non-canon custody, and the same cycle/recheck path used by new research.

## Evidence inspected

- 234 queued clue-level research jobs across 180 normalized clusters.
- 89 current source Reference Cards and their titles, aliases, literal signals,
  citations, claims, interpretations, themes, mechanics, and occurrences.
- The current projected research run containing the four earlier sourced
  overlays.

## Applied result

- Queue jobs examined: **234**
- Jobs closed locally: **14**
- Missing attributable occurrences integrated: **6**
- Duplicate jobs resolved against existing occurrences: **8**
- Remaining queued jobs: **220**
- Remaining normalized research clusters: **171**
- Integration cycles added: **1**
- External-reference deficit: **249 → 246**
- Authority violations: **0**
- Average result diagnostic: **4 / 4**
- Recommended quality stop: **false**

The integrated source reuse involved existing Cards such as Marvel's Thor and
The Great Gatsby. Duplicate closures included already present Charlie Brown,
Batman, Gatsby/Carraway, Thor, and Nintendo 64 / Donkey Kong occurrences.

## What worked

- Exact normalized title, alias, and literal-signal equality produced useful
  deterministic matches.
- Multiword title, alias, and literal signals safely recognized larger lyric
  compounds.
- Existing citations and claims could pass through the same research-result
  validator rather than bypassing evidence policy.
- Existing exact occurrences closed duplicate queue work without modifying the
  Reference Card.
- A second pass found no remaining unambiguous matches, demonstrating
  idempotence.

## Noise rejected

A broad substring experiment incorrectly associated “Fighting to Forge
Familia” with the `Fighting!` signal on *Falling Into Your Smile*. The applied
matcher therefore does not auto-reuse contained single-word signals. Contained
signals must be a title, alias, or multiword literal phrase.

## What changed

- `existing-reference` is now a lineaged terminal research disposition.
- Reseeding preserves that disposition when the exact lyric target is
  unchanged.
- The Codex research runner exposes `reconcile-local`, which creates a backup,
  validates missing occurrences, closes duplicates, emits a normal cycle, and
  writes the resulting projected run atomically.

## Remaining work

After the source-reuse pass, a separate deterministic source-structure triage
closed **10** imported generation annotations and section labels:

- one `Multilingual Masterpiece Version Delivered` annotation;
- three `Climactic Version` labels;
- three `Third Verse` labels;
- three `Final` tokens on those same structural lines.

Each resolution is bound to its exact local lyric pointer; no web search is
claimed. A second triage pass was idempotent.

The final local-only checkpoint is:

- Completed jobs: **24 / 234**
- Remaining queued jobs: **210**
- Remaining normalized research clusters: **167**

Those 167 clusters require actual external research or an
evidence-bearing ambiguous/no-reference resolution. The live worker is
implemented but cannot transmit its minimized lyric packets to external
Codex/web-search sessions until the operator explicitly authorizes that
disclosure.

## Reusable outcome

Flow candidate:

> queued clue → exact local source match → existing occurrence closure or
> validated source reuse → album-wide recheck → refreshed coverage and art
> plan

Guardrail:

> A local source match must be unambiguous and source-backed. Generic
> single-word containment never creates or attaches a Reference Card.
