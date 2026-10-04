# Local character service

Prototype feature of Avatar Builder. The new route extends native Avatar identity and media without importing the full album server. Its source is `server/writer-room-server.mjs`; the shared protected adapter is `server/writer-characters.mjs`. Second Brain remains the sole owner of the new character layer history.

## Open

The installed Writer’s Room desktop launcher opens the connected room. If the feature service is already healthy it reuses it. Otherwise the launcher starts one foreground service and opens the browser after verifying the exact health identity. Keep that terminal open; Ctrl-C stops the service it owns. No login/startup registration, automatic restart loop or scheduled task is added.

Default local address: `http://127.0.0.1:8795/writers-room/#view=characters`.
The main Builder's selected Avatar Mind includes **Writer’s Room character layers** with an embedded editor and full-room link. Reload Builder after publishing its updated UI build.

The exact installed Writer’s Room HTML is served from `~/Desktop/hapa-writers-room/index.html`, or `HAPA_WRITER_ROOM_INDEX`. The service reads `~/.hapa-second-brain/writers-room-characters/service.json`, or `HAPA_WRITER_ROOM_CONFIG`, containing explicit server-side Python, character-memory script and private access-binding paths. These paths are installation data, not browser configuration. `HAPA_WRITER_ROOM_PORT` overrides 8795; reserved Overcard/operator ports 8794 and 8799 are rejected. An occupied/unresponsive port is preserved, never killed or silently reused.

For direct operator use, run `node server/writer-room-server.mjs`. This remains attached to the terminal. `/health` identifies the limited service; protected `/v1/writer-characters/capabilities` describes supported operations. API clients can set a server-side `HAPA_WRITER_ROOM_ADMIN_TOKEN` and use the dedicated CLI. Browser sessions establish automatically without copying a token. The service fails closed outside literal loopback.

## Data ownership and refresh

Native `data/avatar-store.json` is read only. Its 512 MiB ceiling and 2,000-record ceiling are explicit capacity limits. Reads are coalesced, signature checked before/after parsing, and cached only while the source remains unchanged. Stable exact IDs are required. A source change invalidates the cache; read failure does not serve a supposedly fresh stale copy.

The selected Avatar's recognized `/media/` or `/generated-media/` assets are streamed through authenticated ID-based routes. Real paths must remain within their owner media roots. Arbitrary file paths, remote URLs, symlink escapes and executable file types are refused. Visual files are not copied into Second Brain. Missing media is an unavailable preview, not proof of deletion or identity change.

Canon, Memory, Development and Lore edits go through the finite Second Brain CLI. Scopes and revision conflicts are visible. There is no background subscription: **Save & sync** saves the selected scope; **Refresh** retrieves the latest layer and visual references. Direct owner CLI changes are visible on the next refresh. Existing Mind context remains separately source-attributed.

## Process boundary

The feature server itself has one listener and no startup child, queue recovery or model. Each protected memory operation can own one finite Python child. Concurrent memory requests receive an explicit busy response; no unbounded queue exists. The child uses an absolute executable/script, argument array, no shell, sanitized environment, no Python environment/user-site inheritance, and a worker marker. UTF-8 output and input are bounded. A timeout, disconnect or shutdown terminates the child, escalates to SIGKILL after 750 ms, and waits for close before releasing ownership.

The Writer’s Room launcher uses one Node service child and one finite `/usr/bin/open` child after readiness. Maximum controlled application depth is launcher → service → Python (one memory request). It does not inherit Node preloads. Readiness has one bounded attempt, with no automatic launch retry. SIGINT/SIGTERM forwards shutdown, waits for close, and applies a final bounded kill if necessary. Browser processes opened by the OS remain user-owned.

This isolated entrypoint is deliberate: full Builder startup also owns Phone Card exposure, album transaction recovery and subscriber work. Those operations are outside this feature's launch path. Existing Builder listeners and media work are preserved.

Verification receipts belong in the Writer’s Room `docs/CHARACTER_SYNC_VERIFICATION.md`; source-built, running, saved and human accepted remain distinct states.
