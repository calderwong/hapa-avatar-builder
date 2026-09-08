# Echo lyric corrections

Status: implemented and locally verified correction controls within open ECHO-05/06. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

Open Echo → Director Workbench → choose the saved cut → Lyrics. Select a line or word from the menus, or seek a phrase using its timeline marker. The live audio signal is separate from the song-time phrase strip; it is not a recorded alignment waveform.

- Nudge the selected line or word, set line boundaries, or apply a whole-song offset. Locks reject conflicting changes with a visible explanation; a global offset requires all affected lines and words unlocked.
- Split a word using two explicit text values and a chosen song time inside its interval. Use playhead copies the current song time; the editor does not invent a measured split. Merge joins the selected and next word.
- Split a line before the selected word or merge it with the following line. Existing word intervals remain intact.
- Apply text correction commits the text deliberately and clears obsolete word alignment. Undo recovers the previous text and word intervals.
- Undo lyric correction restores the last retained edit, including locks. The last 64 edits are undoable; the complete journal retains up to 2,000 actions, then rejects additional edits without deleting history. Source intervals and original lyric/audio identity metadata stay in the journal. Missing hashes remain unknown.

Changes remain in the current working cut until saved through the existing fork flow. The fork payload now retains `timed_lyrics` and `lyric_timing_manual_edit`, and the working identity includes those edits. Reloaded projection and compiled cues preserve the correction result. Source songs and parent cuts are not rewritten by these controls.

An edit does not verify alignment. Changed words have unknown current confidence, with their original confidence and intervals retained as provenance; phrase fallback remains explicit. Source lyric confidence is never raised by a nudge or text edit. Stale edit revisions, source identity changes and conflicting undo targets are rejected.

Verification uses six transaction scenarios, 50 unchanged affected checks, the actual React component in native Electron at 1280 px, 760 px and 200% zoom, and the current delivery build. It is not a claim of manual acoustic annotation, actual full-app/API save acceptance, all-template rendered readability or human preference. ECHO-05/06 remain open. See [postmortem](postmortems/2026-09-08-echo-lyric-corrections.md).
