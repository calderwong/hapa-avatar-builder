# Builder view-context adapters

Active context-only attachments are projected by `src/overcard/viewContext.js`. The adapter maps only safe, native selection operations: avatar, item, scene, loop/media, song, Tarot card/Deck/Set, and Creator Set focus. Builder, Mind, Look Book, Lore, Kanban, Avatar Card, Bank, Items, Scenes, Loops, Songs, Echos, Tarot Library, and Creator Sets are covered.

When a host first receives active context, App captures its prior selection. Detaching the final active attachment restores that exact selection. Paused, staged, degraded, revoked, or detached records do not shape the view. Missing native source records and unsupported entity/host combinations remain attached but are visibly labeled context-only and inert; no process execution or authority is inferred.

The fixed context badge names the mode, host, applied attachments, and inert reasons. The slot inspector exposes the same effective context. Hell Week responsibility and Tarot Draw process execution are intentionally excluded from this view-only adapter and handled by their typed runtime paths.
