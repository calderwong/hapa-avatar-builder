# Avatar Builder Overwind Card Origin

Avatar Builder remains the authoring owner of `avatar-store.json` and `item-manager-store.json`. Their writer boundary now stages canonical Card events and a mutation journal in `data/overwind/origin-outbox.sqlite3` using SQLite/WAL, writes the source file, and only then makes those events publishable. A failed source write leaves an explicit repair mutation; its staged events cannot upload.

Create, revise, comment, relationship, and tombstone events use one monotonic origin sequence and authenticated Overwind batch ingress. Queued never means replicated. Source head and acknowledged head are exposed at `/api/overwind/card-origin/status`; `/sync` advances acknowledgements only from durable Overwind receipts.

The previous fan-out copied every aggregate registration event into separate Atlas, Second Brain, and Wiki NDJSON files with permanent `queued` status. New writes retain one central legacy audit file while canonical Card delivery uses Overwind's acknowledged outbox/stream. `/migrate-legacy` assigns stable sequences and line digests to the central file and reports duplicate target rows without importing them as distinct history.

`/api/service-identity` separates canonical Avatar and Item counts from the read-only Dev Proto projection. Ports 8787 and 8797 expose API and desktop/static roles of the same service identity. Stale shell signatures are rejected rather than served, the launcher binds loopback by default, browser origins are allowlisted, privileged origin operations require bearer auth, and request bodies are bounded.

Maintenance must not truncate `card.history`. Consumers page history at presentation time. The roughly 50 MB bootstrap remains a deprecated compatibility snapshot, not a replication receipt or source of immutable history.
