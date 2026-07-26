# Comic Song Ingest

`comic:ingest` is the canonical repeatable path for bringing a completed
multi-page song comic into Hapa Avatar Builder. It does not invent a parallel
store. It adapts the package into the Builder-owned contracts already used by
the Scene, Hapa Songs / Echo Album, Avatar Mind, and System Media surfaces.

## Result

One package produces:

- one Hapa Song Card in `data/dear-papa-songbook.json`;
- one normalized Echo Album song projection in `data/hapa-songs-store.json`;
- one Episode and one Scene per comic page in `data/scene-store.json`;
- page, PDF, contact-sheet, storyboard, and optional audio records in
  `data/media-library.json` and managed copies under `data/media/comic-song/`;
- `avatarTags` on every Scene and page asset;
- `avatarLinks`, `sceneLinks`, media, and story beats on the Song Card;
- a selected Song Card and Scene context entries in every associated Avatar
  Mind in `data/avatar-store.json`.

The Scene and Song IDs derive from the manifest package ID, so rerunning the
same manifest updates records instead of duplicating them.

## Operator and Codex workflow

1. Finish the comic and keep the final page PNGs, PDF, contact sheet, storyboard,
   and optional audio together.
2. Copy `docs/examples/comic-song-ingest.example.json` and fill in the source
   paths, exact lyrics, Avatar IDs, and page beats.
3. Validate with a dry run:

   ```bash
   npm run comic:ingest -- --manifest /absolute/path/to/manifest.json
   ```

4. Review the JSON plan, especially Avatar IDs and source paths.
5. Apply:

   ```bash
   npm run comic:ingest -- --manifest /absolute/path/to/manifest.json --apply
   ```

6. Open or refresh Avatar Builder. Review the Scenes, Echo Album song, System
   Media records, and each linked Avatar Mind.

7. When the song should also appear in the Echo Director, fill only missing
   derived projects and their protected cut families:

   ```bash
   npm run echo:director:plans:missing:apply
   npm run echo:variants:parity:missing:apply
   node scripts/build-echo-playback-media-v2.mjs --apply
   node scripts/build-echo-semantic-rankings-v2.mjs --apply
   node scripts/compile-echo-director-v2-album.mjs
   ```

   The first two commands are missing-only/idempotent catalog refreshes and
   preserve existing Director projects and variants. The final three rebuild
   derived playback, semantic-casting, and executable show-graph projections
   from the canonical project catalog.

Every applied run copies all five touched stores into
`data/backups/comic-song-ingest-<timestamp>/` before writing and records the
result in `data/merge-reports/comic-song-ingest-<timestamp>.json`. Mutable
stores and imported media remain local runtime state and are not Git source.

## Manifest contract

The current version is `hapa.comic-song-ingest-manifest.v1`.

- `packages[].id` and `song.id` are stable lowercase identifiers.
- Exact lyrics may be embedded as `song.lyrics` or referenced from a UTF-8
  `song.lyricsPath` relative to the manifest.
- `avatars[].id` must already exist in the canonical Avatar store.
- `pages[].pageNumber` controls scene order.
- Each page becomes a separate Scene and `scene_comics` asset.
- `performancePerspective: true` selects the in-universe song perspective;
  authorship remains the manifest/song author.
- The source album stays `Dear Papa`; `Echo Album` is the active projection.
- Comic interpretation defaults to soft canon and remains attributable to its
  source package and Codex generation workflow.

Use absolute source paths in workstation manifests. The importer copies files
into Builder-managed media and replaces those workstation paths with `/media/`
URIs for the UI. The original path and SHA-256 remain in lineage metadata.

## Reuse guardrail

Future Codex runs should extend or rerun this manifest flow. Do not directly
append anonymous objects to the JSON stores and do not create a second comic
registry. If a schema needs to grow, preserve the v1 fields, add validation and
tests, and keep dry-run/apply, backup, idempotency, and merge-report behavior.
Because Scene data is shared with older story passes, the importer also merges
back extension fields it does not own instead of letting Scene normalization
erase them.
