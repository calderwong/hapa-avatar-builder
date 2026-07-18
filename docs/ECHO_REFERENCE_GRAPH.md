# Echo Album Reference Graph

The Hapa Songs view treats the Dear Papa song store as the active Echo Album workbench. Lyrics remain source text; interpretation is attached as reviewable graph data.

## Data model

- `referenceCatalog` holds source-backed external works and concepts. Public sources, personal/shared context, and technical standards keep distinct provenance.
- `songs[].referenceConnectors` links one lyric line to one catalog entry. The connector preserves the matched text, line number, relation, confidence, semantic effect, and review status.
- `referenceGraphEdges` links two catalog entries when a source-backed mechanic or theme creates a useful traversal route. These are comparative edges, not claims that one work directly cites the other.
- `songs[].contextualLayers` groups a song's connectors into public story worlds, public music, literature, systems/games, history, myth, or personal shared context.
- `semanticTraversal` records album-wide notes about how readings change as more context becomes available.

Literal alias matches are evidence that a lyric points toward a reference. The attached thematic interpretation is soft context pending human review; it does not promote a reading to hard canon.

### Evidence ladder

1. **Direct:** a title, character, mechanic, or distinctive phrase is present in the lyric. The match is direct; its thematic effect remains reviewable.
2. **Candidate:** phonetic, orthographic, multilingual, mechanical, or clustered signals converge on a possible reference. The UI presents the route as `REVIEWABLE INFERENCE` with a score and caveat.
3. **Comparative:** a lyric uses a mechanic found in a researched work, but there is no work-specific marker. This opens a traversal route without asserting authorial intent.

The normalizer preserves signal channels and the exact clue used. A transformed sound or split spelling therefore remains inspectable instead of becoming an opaque tag.

## Exposition model

1. **Surface:** rhythm, repeated images, emotional movement, and literal language remain readable even when references are unresolved.
2. **Public reference:** a proper name can load an entire film, game, song, novel, mechanic, or biography as compressed exposition.
3. **Shared personal context:** memories such as page 81 and Asante reweight the same words without erasing their public meanings.
4. **Graph-operative:** songs become navigation protocols. New references add interpretive capacity, while hashes and provenance preserve exact source identity.

Names are contextual variables rather than one-time assignments. A name may resolve to a person, role, memory, archetype, or several at once. New context appends or reweights possible routes; it must not silently rewrite the lyric.

## Expanded corpus pass

The hidden-reference enrichment pass adds eighteen source-backed reference nodes, thirty lyric connectors, and nineteen cross-corpus routes. Key junctions include:

- **Robin Hobb:** `Gates at the Mountain` directly braids “Robin Hobb,” Fitz, the Fool, Molly, live ship traders, and “Wood.” The split cue makes Farseer identity/bond mechanics and Liveship sentient-vessel/memory mechanics available at the same lyric junction.
- **Heinlein:** `I Knew a Bella` explicitly clusters “Trooper,” “Starship,” “Space Marines,” “Heinlien fans,” and “Grok.” The connector can traverse service/duty, incorporated understanding, and Halo's soldier system without flattening the works together. `The Moon Is a Harsh Mistress` was already present and gains a source-backed governance/simulation route to Civilization.
- **Final Fantasy:** `Our Anima Am an Ocean` directly names Tidus, Yuna, and Sin, loading pilgrimage, guardianship, sacrifice, and recurrence. `Watermelon Honey, Due` supplies Riku/Tidus, Midgar, Lionheart, PlayStation, and Aeris as a cross-installment braid; Final Fantasy VIII is also available through Garden/SeeD, Guardian Force, memory, succession, and time-compression mechanics where the exact clue remains softer.
- **Strategy and Blizzard:** Civilization's Catherine, Gandhi, research, trade, technologies, turns, and overflow mechanics; StarCraft's Protoss/Zerg/Raynor and rush language; Warcraft/Battle.net/Ancients/guild language; and Diablo's Butcher are attached at lyric level.
- **Halo:** “Halo Two reticules,” trooper/starship/space-marine language, and a separate “Halo-1 spec” cue open military-service, armor, AI-companion, memory, and found-family routes.
- **League and esports drama:** support, jungle, Blitz/hook, top, Ashe, aim assist, Masters, and “League / Fighting” form a gameplay cluster. *Falling Into Your Smile* is connected as an esports-team and social-role lens; its fictional MOBA is not labeled as League canon.
- **LitRPG:** `Save Point (Found You in the Code)` explicitly declares LitRPG inspiration and instantiates stats, quests, party, class, levels, loot, XP, dungeon, build, and cooldown grammar. *Dungeon Crawler Carl*, *The Wandering Inn*, *He Who Fights with Monsters*, and *Defiance of the Fall* are comparative mechanical routes only until a title-specific clue is confirmed.
- **Incarnations of Immortality:** personified Death, War, Night, Day, Time, office succession, and durable-role mechanics are reviewable candidates. They are intentionally not promoted to direct references from theme alone.

### Interpretation change

Without the reference corpus, exposition is carried by recurring water, crew, gates, names, games, and personified forces. With the corpus loaded, those words become executable junctions: a ship may be transport, conscious memory, found family, or an intergenerational carrier; a named force may be metaphor or a transferable office; a party may be social kinship, RPG composition, military formation, or esports team structure. Cross-reference routes preserve these simultaneous readings and let Hapa cards traverse them by sound, spelling, language, mechanic, or theme.

The pass deliberately avoids a “closest title wins” model. A clue can corroborate several routes, and later context can raise or lower confidence without deleting earlier evidence.

## Operator workflow

Dry run:

```bash
npm run echo:references
```

Apply with a pre-write backup and merge report:

```bash
npm run echo:references:apply
```

Expanded hidden-reference pass:

```bash
npm run echo:references:hidden
npm run echo:references:hidden:apply
```

The script writes backups under `data/backups/` and coverage reports under `data/merge-reports/`. Catalog entries with no exact lyric match remain available as album-level context anchors and are never presented as literal matches.

## Research anchors

The catalog favors creator, franchise, publisher, and platform sources. The July 2026 expansion used the Heinlein Society bibliography; Penguin Random House series pages for *Incarnations of Immortality* and Robin Hobb; official Final Fantasy, Civilization, Halo, Blizzard, and Riot materials; Netflix's series record for *Falling Into Your Smile*; and author/publisher pages for the LitRPG comparison set. Each catalog node retains its source URL and source kind so later review can replace or supplement the current anchor without changing the lyric evidence.
