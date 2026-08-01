# Echo Record Garden Operator Acceptance

Status: awaiting current-revision human observation  
Program: `echo-record-garden-2026-07-30`  
Implementation revision: `c0e6ede51e541f012077d74843b18ea6152fc245`  
Route: `http://127.0.0.1:8797/?view=echo-records`

This is the final human-observed gate for board task 13. Do not mark a row as
passed from source code, automated tests, or an older screenshot. Record the
song and time when a failure appears so it can be reproduced exactly.

## Preflight

- [ ] Use **Reload Builder** or `Cmd+Shift+R` so the page loads the current
  hashed bundle.
- [ ] Confirm the Record Garden opens without the recovery/error screen.
- [ ] Confirm the page shows a record crate, outdoor table, turntable, three
  physical displays, and listening controls.

## Desktop Journey

- [ ] Search for a record, change the perspective filter, and return to all
  records without losing the selected song.
- [ ] Select a sleeve, place it with the semantic **Place on player** control,
  then repeat once with pointer drag-and-drop.
- [ ] Confirm audio starts only for the placed record and its title remains the
  same across the crate, player, and playback readout.
- [ ] Confirm the visible record rotates with a calm vinyl feel and stops on
  pause. Resume, seek, and resume again; the angle must not jump backward from
  accumulated frame drift.
- [ ] Confirm the active cut is a recent non-Legacy Director cut.
- [ ] Play for at least two minutes. At three noted timecodes, confirm the
  record face and all default Director displays show the same current cue. A
  labeled animated **Director Visualizer** is acceptable where the selected cut
  explicitly declares a visualizer interval; a black or unrelated frame is not.
- [ ] Seek across at least four Director boundaries. Confirm there is no
  persistent black screen, top-left-only frame, stale previous-song frame,
  rewind loop, or rapid play/pause twitch.
- [ ] Page through every surface group. Confirm Director, Reference, character,
  and scene surfaces are visibly typed; a genuinely missing family stays
  labeled instead of borrowing unrelated media.
- [ ] Click one available visual. Confirm its attached Hapa Card result keeps
  the exact source identity. If the source attachment is confirmed missing,
  the fallback must say `LOCAL · UNMINTED`; it must never claim a mint.

## Recovery And Lifecycle

- [ ] Pause, hide/refocus the tab, and resume. Confirm only one song plays and
  the current visual remains aligned.
- [ ] Change records at least ten times. Confirm old audio and old video do not
  continue in the background and the displays never show the previous song as
  the current cue. Confirm project opening does not become progressively slower
  during the sequence.
- [ ] Trigger **Reset arrangement**, then reload. Confirm the saved arrangement
  recovers paused and does not replay a Card action or autoplay audio.
- [ ] If a recoverable media or component error is visible, use its retry once
  and confirm the Garden returns without a full application reset.

## Keyboard, Reduced Motion, And Compact Layout

- [ ] Navigate the record list with the keyboard, place a record, play/pause,
  page surfaces, focus a visual, and invoke its Card action without a pointer.
- [ ] Enable reduced motion. Confirm decorative movement softens or stops while
  audio timing, Director identity, labels, and controls remain correct.
- [ ] Repeat selection, placement, play/pause, seek, surface paging, and Card
  action at a compact/phone-width window. Confirm controls stay reachable,
  focus is visible, text does not overlap, and no gesture requires hover or
  right-click.

## Acceptance Record

Fill this only after the checks above are observed on the named revision.

- Operator:
- Observed at:
- Browser/device and window size:
- Songs tested:
- Director timecodes sampled:
- Desktop result: `pending`
- Compact result: `pending`
- Keyboard/reduced-motion result: `pending`
- Two-minute playback and repeated-record result: `pending`
- Card result and source ID:
- Screenshots or recording paths:
- Console/page/network errors, if any:
- Overall result: `pending`
- Notes or exact reproduction steps:

## Board Closeout Rule

If every required row passes, append a new task-13 review/done event with this
record and the current screenshot/recording paths. Then append task 14 only
after the release, lineage, rights, rollback, limitations, board receipt, and
Turn-to-Lore sections have been rechecked. Preserve all earlier done, blocked,
and correction events; never rewrite the append-only history.
