# Echo lyric corrections

Status: implemented and locally verified correction controls within open ECHO-05/06. Source task: `01a072d3-d593-74f2-8c89-2470c2ee1a40`.

Open Echo → Director Workbench → choose the saved cut → Start editable copy (if protected) → Lyrics. Select a line or word from the menus, or seek a phrase using its timeline marker. The source waveform shows the prepared master audio around the selected word or phrase. The live audio signal remains a separate oscilloscope.

- Nudge the selected line or word, set line boundaries, or apply a whole-song offset. The editor reports applied movement when a requested nudge stops at a neighboring cue or song boundary. Locks reject conflicting changes with a visible explanation; a global offset requires all affected lines and words unlocked.
- Split a word using two explicit text values and a chosen song time inside its interval. Use playhead copies the current song time; the editor does not invent a measured split. Merge joins the selected and next word.
- Split a line before the selected word or merge it with the following line. Existing word intervals remain intact.
- Apply text correction commits the text deliberately and clears obsolete word alignment. Undo recovers the previous text and word intervals.
- Undo lyric correction restores the last retained edit, including locks. The last 64 edits are undoable; the complete journal retains up to 2,000 actions, then rejects additional edits without deleting history. Source intervals and original lyric/audio identity metadata stay in the journal. Missing hashes remain unknown.

Changes remain in the current working cut until saved through the existing fork flow. The fork payload now retains `timed_lyrics` and `lyric_timing_manual_edit`, and the working identity includes those edits. Reloaded projection and compiled cues preserve the correction result. Source songs and parent cuts are not rewritten by these controls.

An edit does not verify alignment. Changed words have unknown current confidence, with their original confidence and intervals retained as provenance; phrase fallback remains explicit. Source lyric confidence is never raised by a nudge or text edit. Stale edit revisions, source identity changes and conflicting undo targets are rejected.

## Waveform and onset references

Choose word or phrase zoom; use the window buttons for long phrases. Click the waveform or use its keyboard-accessible slider to seek. The yellow marker follows playback; vertical word markers show existing timing. The waveform represents all master channels, not isolated lead vocals. It cannot identify a vocal onset automatically.

To record an observation, expand “Record a vocal-onset reference,” enter the annotator, song time and uncertainty, then record it. This leaves timing and confidence unchanged and works on locked words because it records evidence without moving them. References carry the prepared audio source hash and exact word text. Mismatched source declarations are rejected; stale, invalid or changed-text references are excluded from summaries. Splitting/merging words removes their direct references; the correction journal retains history and undo.

The report separates imported-candidate error from corrected error against the entered references. Editing cannot make the current timing its own ground truth. Split tokens without an identical original word have unknown imported-candidate error. Download onset review exports the observations, counts, uncertainty and median/p95 errors for this cut. Operator-entered identity is not authenticated independent review; no report automatically passes album acceptance.

The existing prepared float32 WAV route supplies bounded byte ranges: at most 64 KiB for the header plus 4 MiB of PCM per window, 12 seconds maximum and 2,000 compact peaks. The editor normally requests at most eight seconds, adjusted for sample rate/channels. Selection changes abort old work; a 15-second request timeout offers retry. Format, exact range length and receipt dimensions must agree. No second whole-song audio decode or analysis service is created.

Six new review scenarios and ten existing correction/editor cases pass. The actual React component also passes synthetic waveform/reference controls at desktop, narrow and 200% zoom. The synthetic reference is explicitly labeled and is not human acoustic evidence. Full-app save/reload verification is recorded in the [waveform review postmortem](postmortems/2026-09-08-echo-vocal-review.md). ECHO-05/06 remain open for manual onset acceptance and complete presentation coverage. Earlier [correction verification](postmortems/2026-09-08-echo-lyric-corrections.md) remains reusable.
