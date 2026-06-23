# Kanban Board

The app includes two boards.

## Delivery Board

Stored at `data/kanban.json`.

Filled lanes:

- Intake
- Contract
- Build
- Verify

Cards are marked `done` for implemented surfaces and `ready` for the final demo smoke.

## Avatar Healing Board

Generated from the selected Avatar Card audit.

Lanes:

- Ready
- Needs Sorting
- Healing Queue

The healing queue is generated from missing required slots. It is not hand-curated, which keeps it useful for bulk repair workflows.
