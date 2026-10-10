# Correction-aware queries — 2026-09-27

Card: `atlas-gap-correction-query`; epic: `audio-atlas-gap-closure-20260927`.
Status: scoped implementation verified; broader acceptance and completion commit pending.

Reused the existing Atlas query/review owner, CLI argument forwarding and review
panel. Added original/effective modes with projection before search, interval
matching, sorting and pagination. The latest explicit decision is independent
of later proposals. Rejected evidence is still directly addressable.

27 focused tests pass (Atlas owner, UI/session helpers and song inventory),
including new correction matching/pagination, revision progression, rejection,
restoration after owner reconstruction, original-result byte preservation,
HTTP-route parity and invalid-mode checks. Accepted reviews in these tests are
synthetic fixtures, not human evaluations of real songs. Production build passes;
delivery receipt: `sha256:b45235045c726f443721157eb314d8998e59f8392b0c3506c3465a6d9d6a339b`.

Actual Brave Tongues run `af324ed0-1e0e-40e3-abd2-92f68c5c95b0`
loads in the browser. Vocals / Words / 26-second window shows the saved flagged
word at 27.24 seconds. Both query modes are selectable, the original text and
review note remain visible, and the form distinguishes Accept original from
Accept corrected text & timing. Both require reviewer and note. No real review,
model analysis or human acceptance was created during this verification.
The real CLI effective evidence query returns the same unaccepted original word.

Evidence folder: current task's `work/audio-atlas-2026-09-27/correction-query/`
contains tests.log, build.log, build-final.log, real-cli.json and browser screenshot.
The first added tests omitted `op=timeline` and consequently read the default
brief response; corrected the test calls, retained the cause here, and reran.

The prior broad suite remains 2433 passing / 11 failing. It was not repeated at
this intermediate batch checkpoint. Native Electron smoke and the focused
completion commit remain outstanding. This check does not qualify lyric timing,
model accuracy, cross-run reconciliation or the full Audio Atlas requirements.

Browser inspection caught a clipped mode label; widened its field and rebuilt.
The scoped Second Brain guide was indexed through its owner. HTTP readback was
unavailable (connection refused at port8767); owner-side catalog freshness checking
is the available verification. No HTTP readback success is claimed.
