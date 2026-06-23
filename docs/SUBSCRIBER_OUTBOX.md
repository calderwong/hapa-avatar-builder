# Hapa Subscriber Outbox

Avatar Builder registers avatar cards, media assets, and attach packs for downstream Hapa systems through an append-only local outbox.

Avatar Builder also stores the Hapa Avatar Agent contract at `data/avatar-agent-contract.json`.
That contract defines the Genesis and Journal Maintenance agents, their Codex/Hermes harness bindings, and the Red Mind Benchmark Gate used before new avatar generation.

## Targets

- `hapa-atlas`
- `hapa-second-brain`

## Files

Default directory:

```txt
data/subscribers/
```

Streams:

```txt
events.ndjson
hapa-atlas.ndjson
hapa-second-brain.ndjson
latest.json
```

Each event uses `hapa.subscriber-registration.v1` and includes the source action, avatar entity, media entity, attach-pack summary, Atlas entity ids, Second Brain path hints, and avatar-to-media relationships.

## API

```http
GET /api/subscribers/status
GET /api/subscribers/events?limit=50
```

Writes are queued after:

- `POST /api/media`
- `POST /api/avatars`
- `PUT /api/avatars/:id`
- `POST /api/avatars/:id/assets`

This keeps Avatar Builder local-first while giving Atlas and Second Brain a stable queue to consume.
