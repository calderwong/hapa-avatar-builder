# Avatar Builder Overwind Card Origin

Avatar Builder remains the authoring owner of `avatar-store.json` and `item-manager-store.json`. Their writer boundary now stages canonical Card events and a mutation journal in `data/overwind/origin-outbox.sqlite3` using SQLite/WAL, writes the source file, and only then makes those events publishable. A failed source write leaves an explicit repair mutation; its staged events cannot upload.

Create, revise, comment, relationship, and tombstone events use one monotonic origin sequence and authenticated Overwind batch ingress. Queued never means replicated. Source head and acknowledged head are exposed at `/api/overwind/card-origin/status`; `/sync` advances acknowledgements only from durable Overwind receipts.

The previous fan-out copied every aggregate registration event into separate Atlas, Second Brain, and Wiki NDJSON files with permanent `queued` status. New writes retain one central legacy audit file while canonical Card delivery uses Overwind's acknowledged outbox/stream. `/migrate-legacy` assigns stable sequences and line digests to the central file and reports duplicate target rows without importing them as distinct history.

`/api/service-identity` separates canonical Avatar and Item counts from the read-only Dev Proto projection. Ports 8787 and 8797 expose API and desktop/static roles of the same service identity. Stale shell signatures are rejected rather than served, the launcher binds loopback by default, browser origins are allowlisted, privileged origin operations require bearer auth, and request bodies are bounded.

Maintenance must not truncate `card.history`. Consumers page history at presentation time. The roughly 50 MB bootstrap remains a deprecated compatibility snapshot, not a replication receipt or source of immutable history.

## Exact reviewed-design delivery — November 5, 2026

The native origin adapter now offers `stageCustodiedDesign(record)`,
`selectedDelivery(eventId,eventDigest)` and `uploadExact(eventId,eventDigest)`.
A private reviewed design with an existing native origin can stage one immutable
publication candidate without artwork, minting or replacing the mutable Items
store. Identical retries reuse its event; a different Card revision conflicts.
The caller must obtain and verify the actual native custody receipt before staging;
the adapter's structural checks do not themselves authenticate a supplied core.

Exact upload selects by event ID/digest, including beyond the old first250 pending
window. It sends at most one event and holds if any earlier origin sequence remains
unacknowledged or the event is not publishable. It does not drain unrelated work.
Acknowledgement requires exactly one matching durable receipt, a positive integral
ledger cursor and accepted/idempotent-duplicate outcome. Lost responses retain the
same event; only an explicit subsequent exact send reconciles it. No automatic
retry. Transport10s, streamed response32KiB, selected event512KiB. All existing
store paths remain native-owned; this is no quota retrofit or recovery migration.

Event visibility now follows the originating record (default fleet unchanged),
so private design payloads remain private in both the envelope and event.

Qualification: synthetic native SQLite staging/reuse/conflict, lost receipt and a second HTTP failure, exact
acknowledgement, no acknowledged replay, and251 preceding unrelated events with no
network call. Current live inspection found1,435 pending Builder events, earliest
unacknowledged sequence1514. This is a delivery dependency, not permission to upload
the backlog. These new writer methods are source/fixture-qualified; the running API
was not restarted or given a new mutation route. Live staging and selected upload
still require the supported caller, current source/privacy authority and the owner's
pre-change recovery gate. No live outbox mutation or fleet publication is claimed.

Reuse/learning: extend the existing outbox transaction and event identity instead
of a Dreamer-owned Card store. The global sequence dependency invalidated the idea
that a selected new Card could be acknowledged independently of older native events.
Keep the blocker visible and avoid broad sync as a hidden prerequisite. This is an
attributed Flow/Decision candidate from the current Codex Dreamer build; exact raw
Turn identifier is unavailable, not invented. Existing custody and queue evidence
remain reusable.
