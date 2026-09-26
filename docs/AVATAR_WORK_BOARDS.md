# Per-Avatar work boards — v1 prototype

The **Kanban** view now links the selected Avatar to its own persistent work
board. Choose **Open …'s board** or opt into **Show board here**. The existing
Build Board, Healing Board and healing queue remain separate and unchanged.

Task truth belongs to Hapa Overwatch Kanban, not avatar-store.json. The link
passes the exact Builder Avatar ID; a display-name change does not create a
different identity. Only Linden has an explicit agent:linden namespace join;
other Avatars are not automatically declared autonomous agents.

- Entry: http://127.0.0.1:5181/avatars.html?avatar=linden
- Owner protocol / API / CLI: http://127.0.0.1:5181/docs/avatar-boards
- Owner discovery: GET http://127.0.0.1:5181/v1/avatar-boards
- Registration: owner UI **Register new Avatars**, or its CLI
  `node bin/avatar-boards.mjs sync --apply` (reads Builder's compact index).

New Avatars require this explicit sync; opening a record is read-only. Existing
boards survive roster removal and registration retries. No owner sync/export,
model work, agent launch, network binding change or background schedule is added.
The owner server must be running on loopback port 5181. The iframe is the real
owner UI, not a duplicated cache or falsely healthy placeholder.

Linden's first 78 ranked proposals have unique **design assignments**, not
minted Cards. Upon evidence-backed completion, the board exposes a separate
generation packet and artifact ledger. Image failure cannot erase completed
work. Art generation uses an authorized in-session tool, not this component.

Reuse / learning: a derived healing board was not a durable Avatar task board.
Extending the existing Kanban owner avoids another store or synchronizer. The
new guardrail is to keep identity, task history, generated art and Card custody
as separate records joined by explicit IDs. UI behavior is covered by a focused
link/integration test and a live owner/Builder smoke check, not a claim of
whole-application production readiness.
