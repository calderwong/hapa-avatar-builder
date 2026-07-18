# Echo Album Reference Graph

The Hapa Songs view treats the Dear Papa song store as the active Echo Album workbench. Lyrics remain source text; interpretation is attached as reviewable graph data.

## Data model

- `referenceCatalog` holds source-backed external works and concepts. Public sources, personal/shared context, and technical standards keep distinct provenance.
- `songs[].referenceConnectors` links one lyric line to one catalog entry. The connector preserves the matched text, line number, relation, confidence, semantic effect, and review status.
- `songs[].contextualLayers` groups a song's connectors into public story worlds, public music, literature, systems/games, history, myth, or personal shared context.
- `semanticTraversal` records album-wide notes about how readings change as more context becomes available.

Literal alias matches are evidence that a lyric points toward a reference. The attached thematic interpretation is soft context pending human review; it does not promote a reading to hard canon.

## Exposition model

1. **Surface:** rhythm, repeated images, emotional movement, and literal language remain readable even when references are unresolved.
2. **Public reference:** a proper name can load an entire film, game, song, novel, mechanic, or biography as compressed exposition.
3. **Shared personal context:** memories such as page 81 and Asante reweight the same words without erasing their public meanings.
4. **Graph-operative:** songs become navigation protocols. New references add interpretive capacity, while hashes and provenance preserve exact source identity.

Names are contextual variables rather than one-time assignments. A name may resolve to a person, role, memory, archetype, or several at once. New context appends or reweights possible routes; it must not silently rewrite the lyric.

## Operator workflow

Dry run:

```bash
npm run echo:references
```

Apply with a pre-write backup and merge report:

```bash
npm run echo:references:apply
```

The script writes backups under `data/backups/` and coverage reports under `data/merge-reports/`. Catalog entries with no exact lyric match remain available as album-level context anchors and are never presented as literal matches.
