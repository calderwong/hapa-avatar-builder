# Audio upload batch verification

September 27, 2026. Status: feature verified in loopback browser; repository/native acceptance incomplete; uncommitted under AGENTS completion gate.

- 50 focused upload/inventory/Atlas tests passed.
- Production build passed; existing bundle-size warning remains.
- 54 Overcard tests passed.
- Full repository suite: 2,467 passed, 8 failed, 2,475 total (209.92 seconds).
- Remaining failure names match the pre-existing gap list: protected cuts, HyperFrames phone package, album ISF handoff, catalog frame contracts, typed playback manifests, offline HyperFrames runtime, packaged shader sources, semantic rankings. No new failing test names.
- Native Electron smoke remains unverified from the earlier inconclusive native interaction attempt; the browser test is not a native substitute. Physical external file dragging was not automated; file chooser and shared staging handler were exercised.
- Gnow Her isolated browser test saved actual master WAV/MP3 and backing-vocal WAV/MP3. SHA-256 readback matched each original. Reload showed both masters available and both stem sets 1/9, with eight missing roles listed.
- Duplicate upload Save was disabled until explicit replacement consent; selecting a WAV for an MP3 slot produced an actionable error.
- Canonical 200-song store SHA unchanged. No original media or saved analysis changed. Test uploads remain in the isolated temporary store, not the canonical album.
- CLI inspection succeeded; CLI and authenticated binary routes share the tested owner service. API origin/auth rejection and raw-stream transport have focused tests.
- Regression runner and its album compiler exited; no retry or unowned descendants remained. Task preview serves the new UI on port 19873. The isolated verification preview is stopped after evidence capture.

Reuse and correction: source upload extends canonical Atlas inventory and same-origin session. It preserves raw store fields instead of using full-album normalization. Actual browser validation caught a stale initial song ID/visible-select mismatch; the panel now verifies selection membership. Service tests caught/pin legacy MP3 preservation when adding a preferred WAV. Initial API restart exposed import placement before a shebang; corrected and syntax-checked before successful startup. Build alone does not validate the server entry point.

No human musical acceptance, analysis prerequisite exception, external publication or catalog download is inferred from this upload request. Board card atlas-song-audio-uploads is Review; analysis priority and prior holds remain unchanged.

Final UI follow-up: always refresh parent availability after an ambiguous save failure, use unique role-list IDs when both entry points are open, and label a completed queue “All files saved.” The 50 focused tests and build passed again; unchanged broad failure evidence was reused.
