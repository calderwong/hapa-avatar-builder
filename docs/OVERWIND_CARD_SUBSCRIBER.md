# Avatar Builder Overwind Card Subscriber

Avatar Builder retains authoring custody of `avatar-store.json` and `item-manager-store.json`. Overwind at `127.0.0.1:8788` is the acknowledged subscriber truth for canonical Card identity, current revision, history, comments, and lineage.

Normal canonical Card hydration uses Overwind's Redis/Postgres point-read plane. Search, sort, and facets use Elasticsearch at an explicit ledger watermark. Avatar Builder then attaches locally owned avatar/item media and presentation facts. Snapshot rebuilds and ordered deltas use the durable subscriber identity `hapa-avatar-builder`; checkpoints advance only after the local projection commit.

When Overwind is unavailable, the last acknowledged local projection is explicitly `local-stale`, includes its cursor, age, and reason, is bounded by policy, and is never described as current truth. Redis and Elasticsearch remain rebuildable accelerators; immutable history and subscriber checkpoints live in Overwind Postgres.

This subscriber contract complements, and does not replace, `OVERWIND_CARD_ORIGIN.md`: local source writes stage immutable origin events, while subscriber reads consume fleet-acknowledged state.
