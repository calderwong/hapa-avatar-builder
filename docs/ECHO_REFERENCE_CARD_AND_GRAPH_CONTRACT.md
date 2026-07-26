# Echo Reference Card and Graph Contract

Status: First Pass / Prototype contract  
Owning node: Hapa Avatar Builder  
Source module: `src/domain/hapa-reference-card.js`  
Machine contract: `docs/contracts/hapa-reference-card.v1.schema.json`

## Purpose

A Hapa Reference Card is a versioned interpretation record. It connects exact lyric spans to external references, album-internal motifs, mechanics, emotions, media, people, places, and unresolved namespaces without changing the lyric or declaring authorial intent.

The current `song-reference-graph.js` catalog, connectors, context layers, and comparative edges remain the source-compatible jump-off surface. Reference Cards add explicit revision, evidence, interpretation, authority, rights/privacy, contribution, and custody boundaries. This contract does not migrate the song store or activate a new UI.

## Authority separation

These states are independent:

| Dimension | Values | Meaning |
|---|---|---|
| Evidence | direct, source-backed candidate, comparative, unresolved | What the available evidence can support |
| Review | proposed, pending review, approved, challenged, rejected, superseded, withdrawn | What a reviewer has decided about this revision |
| Canon | non-canon, soft-canon, canon | A separate Human-controlled story authority |
| Visibility | private, shared, public | Who may see the projection |
| Custody | uncommitted or origin receipt | Where append-only revision history begins |

Approval does not imply canon. Custody does not imply approval, publication, mint, commerce, or canon. Public visibility requires a rights/privacy-safe projection.

## Card identity and revision

- `id` is the stable entity identity.
- `revisionId` identifies one immutable revision.
- `parentRevisionId` links the prior revision.
- New evidence or a decision creates a new revision or append-only decision. It never rewrites old evidence.
- Merge and split operations preserve redirects and contributor attribution.

## Evidence structure

A claim is exactly one of:

1. `source-fact` — supported by a cited external source;
2. `lyric-observation` — directly visible in an identified lyric span;
3. `inference` — an interpretation that joins lyric and context;
4. `human-decision` — an approval, challenge resolution, or canon action.

Claims point to citation and occurrence IDs. Interpretations point to claims. Edges point to claims and citations. The UI can therefore answer “why this connection?” without presenting synthesis as source fact.

## Plural interpretation

`interpretations[]` keeps multiple readings side by side. Each reading may express:

- surface meaning;
- contextual contribution;
- thematic shift;
- emotional charge;
- narrative effect;
- imported operational mechanic.

Confidence and review status belong to each interpretation. One approved reading does not delete a proposed alternative.

## Node ontology

| Node | Purpose |
|---|---|
| song | Stable song/card identity |
| lyric-span | Exact line/time occurrence |
| reference-card | Revisioned reference entity |
| context-layer | Public or permissioned context grouping |
| external-work | Film, game, book, song, standard, or other work |
| person / place / media | Named external entity |
| mechanic | Operational rule imported by a reference |
| motif | Album-internal recurring symbol or phrase |
| emotion | Emotional route or transformation |
| unresolved-namespace | High-leverage unknown retained for later clues |

## Edge ontology

Every edge declares endpoints and types, relation, direction, weight, confidence, evidence class, review status, rationale, structured support, claim/citation pointers, derivation, Human approval, and provenance. Structured support keeps the shared songs, themes, mechanics, lyric-line distances, and detector reason codes that answer “why did these two references connect?”

Relation families:

- evidence: `supports`, `corroborates`, `challenges`;
- identity: `same-entity-as`, `alias-of`, `adaptation-of`;
- lyric/reference: `occurs-in`, `alludes-to`;
- bounded source constellation: `co-activated-with`;
- album recurrence: `recurs-with`, `contrasts-with`, `transforms`, `narrative-continuation`;
- imported meaning: `imports-mechanic`, `imports-emotion`, `thematic-resonance`;
- interpretation lifecycle: `alternative-to`, `supersedes`.

Derived and Human-approved are separate booleans. An edge may be machine-derived and later Human-approved without losing how it was created.

`co-activated-with` is deliberately stricter than a generic similarity edge. A shared song alone is insufficient. The current prototype requires at least one of:

- recurrence in multiple shared songs;
- a tight lyric neighborhood plus a shared semantic theme;
- an explicitly shared imported mechanic.

The pass is capped per source Card. Its connected components are projected as proposed Reference Constellations; neither membership nor generated artwork promotes a reading to approval, canon, or public truth.

## Example three-song subgraph

```text
song:save-point
  --imports-mechanic--> reference:litrpg-save-point
  --recurs-with-------> song:our-anima

song:our-anima
  --imports-emotion---> emotion:return-after-loss
  --contrasts-with----> song:gates-at-the-mountain

song:gates-at-the-mountain
  --alludes-to--------> reference:robin-hobb
  --imports-mechanic--> mechanic:memory-bearing-vessel

reference:litrpg-save-point
  --thematic-resonance--> mechanic:memory-bearing-vessel
```

This graph says the traversal is useful and evidenced at its declared class. It does not say the songs intentionally cite one another.

## Required traversal queries

The storage implementation must answer:

1. Where else does this reference occur?
2. Which exact lyric spans support this card?
3. Why does this edge exist?
4. Which songs share a motif, mechanic, emotion, or external entity?
5. Which edges are proposed, approved, challenged, rejected, or superseded?
6. Which public projection excludes private clues or sources?
7. What changed between revisions and which downstream packets are affected?

## Validity invariants

- A card has a stable ID, revision, title, and at least one song occurrence.
- Claim pointers resolve to existing citations and occurrences.
- Interpretation and edge pointers resolve to existing claims/citations.
- Self-edges and duplicate IDs are invalid.
- Canon requires approved review plus an explicit canon actor.
- Approved review requires an approving actor.
- Public cards reject private clues and private citations.
- Public projection fails closed when the card violates its authority or rights/privacy contract.

## Migration boundary

Current catalog entries can become card identities; connectors can become occurrences and lyric observations; context layers can become graph nodes; comparative graph edges can become `hapa.reference-edge.v1` records. Migration must preserve original IDs, evidence classifications, review state, source URLs, and caveats. No migration may raise confidence, approval, visibility, publication, or canon.
