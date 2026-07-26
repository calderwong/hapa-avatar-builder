# Expansion UI Reference Atlas recraft — 2026-07-25

## Objective

Rework the Echo Reference Atlas so it can use conversation-supplied context to find dense public references, import the story/mechanic/emotional payload behind them, connect those payloads across songs, and retain private or uncertain clues without inventing answers.

## Canonical surface reused

- `data/hapa-songs-store.json` remains the song/reference source of truth.
- `hapa.reference-card.v1`, connector semantic effects, append-only review, citation, custody, privacy, and canon gates remain unchanged.
- The existing curated hidden-reference catalog remains the high-value seed.
- The Reference Atlas UI continues to consume the same run/card/graph projection.

No replacement UI, database, or parallel reference contract was created.

## Evidence inspected

- 134-song production corpus.
- 52 prior catalog references, 106 prior song connectors, and the latest deterministic mining run.
- Reference Card schema, miner, source resolver, graph compiler, quality rubric, Explorer tests, and enrichment scripts.
- Conversation context describing Expansion UI, songs as compressed pointers, semantic recompilation, and the requirement to preserve unresolved/private namespaces.

## What worked

- Exact lyric occurrences, citation boundaries, plural interpretations, provenance, review, canon, rights, and custody were already strong.
- Curated connectors already recorded `withoutContext`, `withContext`, thematic shift, exposition function, and traversal edges.
- The graph and UI could accept richer cards without a schema migration.

## What was noise

- Section labels such as `[Break]` entered phonetic and proper-name matching.
- Common capitalized words became entity candidates.
- Identical English words could be labeled multilingual.
- Ordinary inflections became phonetic leads.
- The bulk miner created hundreds of generic two-song motif cards with little imported story or mechanic.
- Normalizing a short title with the generic tokenizer could collapse “Don’t Cha” to “don’t,” causing broad false activations.

## Correction and implementation

- Added a context-conditioned catalog activation pass. It requires a distinctive curated alias or a corroborated reference-specific mechanical cluster.
- Preserved source line numbers while excluding section labels from evidence.
- Added generic-entity/phrase guards, cross-language surface checks, and phonetic morphology rejection.
- Expanded migrated source cards with connector-specific context deltas and automatic activation interpretations.
- Separated source-backed activations from album motifs and unresolved leads through evidence class, provenance, and card type.
- Added a 24-reference Expansion UI pack covering the strongest conversation-derived namespaces, including a conversation-grounded playlist origin that is not mislabeled as a public fact.
- Made the base connector refresh preserve enrichment/context records owned by later layers.

## Resulting guardrail

> A matched word is not yet an expanded reference. Expansion requires a bounded namespace, evidence for activating it, the context that becomes available, a statement of what changes in the reading, and a visible boundary around what remains uncertain.

## Reusable candidates

- **Skill candidate:** Context-conditioned Song Reference Mining.
- **Lesson Card:** Short-title normalization can create catastrophic semantic false positives.
- **Protocol candidate:** Curated source activation → motif comparison → unresolved/private clue lanes.
- **Flow explainer:** Lyric signal → namespace activation → imported story/mechanic/emotion → cross-song traversal → Human review.

The raw Codex turn remains the attributed source for the pack selection and interpretation choices.
