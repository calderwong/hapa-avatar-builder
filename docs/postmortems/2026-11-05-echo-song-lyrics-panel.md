# Echo readable song lyrics panel

Codex /root, November 5, 2026. Calder requested exposed song lyrics and clarified
that a readable full-song panel was not visible beside the preview.

Reused the selected project's existing written source and timed lyric lines,
the lyric-boundary helper, seek handler and timing editor. Added a read-only,
scrollable Song lyrics panel at the top of the normal Preview/Lyrics right
column. It starts open, can collapse, and preserves the transport position.
Written source text is preferred; otherwise the selected cut's lines are labeled
as such, with timestamps and current-line highlighting. Missing text stays
explicit. Reading never edits lyrics, timings, overlay settings or saved cuts.
Timing changes remain in the existing editor. Seek controls are omitted during
recording/preparation/saving. No new transcription or storage path was added.

Verified the built UI on Luna and Write Home, including selection changes.
Luna's sixth line seeks to its existing 20.7-second start and is highlighted.
The panel was left open in a separate browser tab. The user's original Electron
window was not reloaded because of its unsaved cut; it needs the new build loaded
before that window can show the panel. Expanded cinema view remains dedicated
to picture/playback; the reading panel is in the normal Preview/Lyrics view.

Nine existing lyric clock/contract checks pass. Build and production receipt
check pass (semantic SHA-256 2e3a5f151b7923fa3a07a178c4fa0000c77f00a0491d6938f5332d84d58ddb66).
No song-health/timing qualification is claimed; source stores were not changed.

Lesson Card candidate: a timing editor is not a readable lyric sheet. Expose
existing content in a simple bounded reading surface, and distinguish a new
build from the older window the user is actually looking at. The initial
ambiguous request prompted one optional question; the user's reply confirmed
the discoverability gap. This note preserves the decision, not a raw transcript.
