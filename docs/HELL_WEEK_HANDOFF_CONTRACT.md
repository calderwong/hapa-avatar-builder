# Hell Week Card Handoff Contract

Status: compatibility adapter; canonical Card reads cut over to Overwind  
Source owner: `hapa-dev-proto`  
Consumer: `hapa-avatar-builder`

## Architecture decision

Avatar Builder uses a maintained, read-only adapter over the `hapa-dev-proto` SQLite projection for live local population. This is the conservative source-owner path: it works offline, does not make Overwind a writer, and does not require a new authenticated service.

For canonical Card identity, current revision, history, comments, and lineage, Overwind is now the acknowledged subscriber truth. This direct SQLite adapter remains a labeled compatibility/offline projection for Hell Week source-specific behavior. It must report `local-stale` when disconnected and may never overwrite Dev Proto authoring data or outrank Overwind's acknowledged ledger.

Revisit this decision when `hapa-dev-proto` publishes a versioned export/search API with equivalent offline behavior. Migration must preserve the v1 envelope and include a direct-source rollback.

## Ownership

- `hapa-dev-proto` owns Hell Week Hypercore records, the card-library index, and `persistence.db` rows.
- Avatar Builder owns only the read-only projection, UI state, and append-only feedback proposals.
- `data/avatar-store.json` owns canonical Avatar Builder avatars and must never contain Hell Week projections.
- Second Brain owns raw turn/evidence retrieval and enrichment. Overwind Postgres owns acknowledged Card history; Redis and Elasticsearch are rebuildable serving projections.

## Read surfaces

### Full compatibility list

`GET /api/hell-week/cards`

Returns the legacy array shape for existing consumers. A source failure returns HTTP `503`; it never returns a successful empty array for dependency failure.

### Versioned envelope

`GET /api/hell-week/cards?envelope=1`

Returns `hapa.hell-week-handoff.v1` with cards, tombstones, source metadata, counts, and cursor state. Each card carries `handoff.schemaVersion = hapa.card-envelope.v1`.

### Incremental sync

`GET /api/hell-week/sync?cursor=<ISO timestamp>&runId=<optional run id>`

The response selects cards and tombstones updated after the cursor. A request without cursor/run ID is an explicit full rebuild. The adapter caches the normalized projection against the SQLite DB/WAL signature, so routine reads do not rescan an unchanged database.

### Full card detail

`GET /api/hell-week/cards/:id`

Returns one projected card and lazily hydrates its complete Narrative from the source Hell Week Hypercore when the compact SQLite projection contains shortened lore. The list remains SQLite-backed and fast; selecting a card requests its canonical ledger detail. If the source core is unavailable, the route safely returns the compact projection.

## Write boundary

Projected cards are marked:

```json
{
  "isExternalProjection": true,
  "projection": {
    "readOnly": true,
    "sourceSystem": "hapa-dev-proto"
  }
}
```

Avatar Builder read and write routes use the canonical store by default. Hell Week cards load through their dedicated view/API; callers must explicitly request `/api/avatars?mode=projected` to receive a merged compatibility projection. `writeStore()` removes read-only projections and virtual Hell Week teams before serialization. Direct projected-card mutation returns `409 external_projection_read_only`.

## Feedback path

`POST /api/hell-week/cards/:id/feedback`

The route appends a `hapa.card-feedback.v1` proposal to `data/subscribers/hapa-dev-proto.ndjson`. It never writes the Dev Proto database or Hypercore. Source-owner review is required before promotion.

## Failure contract

Dependency failures use HTTP `503` with:

- dependency name and error code;
- retryability;
- last successful projection count and cursor when available;
- no credentials or authorization values.

The Hell Week UI retains the last loaded cards, labels the source degraded, and exposes refresh without claiming a legitimate zero-card state.

## Runtime contract

`GET /api/health` reports process owner, build signature, PID, uptime, memory, open file count, active file-stream telemetry, and Hell Week handoff freshness.

The canonical dedicated desktop service is the launchd-owned port `8797` process. The desktop launcher may reuse it only when UI, API, process owner, and build signature match the current checkout. Otherwise it must restart the canonical job or use a clearly labeled fallback process.

## Verification gates

- Contract fixture covers source cards, child media, tombstones, cursor filtering, and feedback events.
- A merged `/api/avatars` payload can be PUT without increasing the canonical persisted avatar count.
- Repeated aborted media range requests return active stream count to zero.
- Missing/unavailable Dev Proto DB returns `503` and a degraded UI contract.
