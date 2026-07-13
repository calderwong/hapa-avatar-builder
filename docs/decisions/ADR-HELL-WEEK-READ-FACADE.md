# ADR: Hell Week read facade

Status: superseded for canonical Card reads by the implemented Overwind subscriber cutover. Retained as historical rationale for the Hell Week compatibility adapter.

Decision: keep `hapa-dev-proto` as authoring owner and use a maintained read-only local adapter only as bounded offline/compatibility state. Overwind Postgres is the acknowledged Card subscriber truth; Redis and Elasticsearch are rebuildable serving projections.

## Why

- Preserves local-first/offline behavior.
- Avoids making a rebuildable projection the source of truth.
- Requires no credential or service-start authority.
- Keeps the migration surface small while the Dev Proto export API is not versioned.

## Consequences

- The adapter must have a versioned envelope, explicit errors, caching, incremental cursors, and contract tests.
- Direct SQLite coupling remains visible technical debt.
- A future Dev Proto API can replace the adapter only if it preserves IDs, lineage, tombstones, failure semantics, and offline rollback.

## Rejected for now

- Historical rejection — Overwind-only reads: this concern was retired by durable ingress receipts, fixed-watermark subscriptions, drift observability, and bounded `local-stale` fallback.
- Consumer writes into Dev Proto SQLite: violates record ownership.
- Silent empty fallbacks: confuses runtime failure with legitimate absence.
