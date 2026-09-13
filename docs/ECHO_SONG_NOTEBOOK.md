# Echo Album song notebook

Status: local-first prototype. Canonical owner: Hapa Avatar Builder.

The References surface now extends the existing normalized Song Card rather than creating a parallel notebook store. Each song can retain:

- free-text notes;
- anecdotes;
- lessons with an explicit future-use and feature/content connection;
- human-marked research references and URLs;
- Avatar links selected from the current Builder pool;
- image/video media marked as creative visual anchors with tone notes; and
- Tarot Card links whose human-authored pairing logic is required.

The fields are normalized under `song.knowledge`; Avatars and Tarot Cards remain typed links in `song.attachments`; visual anchors remain ordinary Song media with `role: "creative-visual-anchor"` and a `creativeAnchor` context object. This preserves existing Song Card ownership, media lineage, subscriber writeback, and context-packet invalidation behavior.

## Tarot source

The supplied `Hapa_Tarot_Echoes_v1` structured source is captured byte-for-byte at `resources/echo-album/hapa-tarot-echoes-v1.json`. It contains all 78 cards, 199 source track entries, 167 card/song assignments, pairing arguments, lyric evidence, symbol bridges, reading mechanics, scene direction, and editorial guardrails.

The source says these mappings are editorial proposals. The Builder preserves that status and never treats import, display, or attachment as automatic canon. Stable edition Card IDs are namespaced as `echo-tarot:<source-card-id>` so they cannot collide with mutable Tarot Library records.

## API and agent access

`GET /api/echos/song-notebook?songId=<id>` returns one Song Card, the compact Avatar pool, imported Tarot connections, and the card picker catalog. Omitting `songId` returns an album-wide agent-readable projection containing every song's durable knowledge, links, creative anchors, and imported Tarot logic.

Human changes persist through the existing Song Card routes:

- `PUT /api/hapa-songs/:songId`
- `POST /api/hapa-songs/:songId/media`

Song context packets include the knowledge family, explicitly attached Avatars/Cards, and Song media. Notes and anchors guide future work but do not establish external facts, rights, publication authority, or canon.

## GPT Image 2.5 Tarot prompt review

Every unique Tarot Card + Song pairing is projected through `src/domain/echo-tarot-image-prompts.js` as `hapa.echo-tarot-image-prompts.v1`. The compiler produces three deterministic, review-only variants:

- `default-man` uses the replaceable `Hapa Main Man` cast slot;
- `default-woman` uses the replaceable `Hapa Main Woman` cast slot; and
- `default-couple` places both adult variables as an equal, mutually agentic couple.

Each prompt keeps inherited Tarot fields distinct from editorial additions: card identity, Arcana/suit/rank grammar, upright and shadow meanings, essential symbols, composition, song assignment argument, lyric evidence, song-specific symbol bridges, reading mechanics, color direction, human pairing logic, notes, lessons, research labels, and creative-anchor tone notes. The prompt tells the image model to render the variables as characters rather than print their variable names.

The supplied 167 editorial pairings therefore expose 501 prompt variants. A later human-added Tarot link receives the same three variants; when a human attaches a card already present in the supplied mapping, the human logic is merged into that pairing instead of creating a duplicate Card + Song prompt set.

Both album-wide and single-song `GET /api/echos/song-notebook` responses include `tarotImagePrompts`. The References UI shows a collapsed review panel under each Tarot connection with cast-variant tabs and a copy action. The panel has no generation action: every prompt remains `draft-for-human-review`, `generationStatus: not-started`, and `canGenerate: false` until a separate, explicitly authorized image-run workflow is connected.
