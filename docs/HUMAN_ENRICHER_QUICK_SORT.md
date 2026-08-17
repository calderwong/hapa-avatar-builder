# Human Enricher quick sort

## Operator surface

The Human Enricher now offers two layouts on the same local-first review route:

- **Detail** preserves the catalog, optical telemetry, proposal evidence, and full human enrichment editor.
- **Quick Sort** requests up to 240 optically reviewed videos at a time and presents only dense video tiles. Hovering or focusing a tile starts muted loop playback inside the thumbnail; leaving the tile resets it.

Quick Sort reuses the existing append-only optical-review decision endpoint. A thumbs-up records `accepted` and leaves the tile visible with a green accepted state. A thumbs-down records `rejected`; rejected and blocked candidates are omitted from the tile view. The decision is not canon, publication approval, rights clearance, or source-media mutation.

The view can be deep-linked with `?view=human-enricher&layout=tiles`. Video bodies use `preload="none"` so a large page does not eagerly load every clip before the operator hovers it.

## Turn-to-Lore checkpoint

- Objective: enable a human to perform a fast accept/reject first pass across many videos.
- Evidence inspected: the running checkout's Human Enricher component, pagination contract, optical proposal statuses, decision endpoint, and agent-review ledger tests.
- Reused: the canonical catalog projection, stable `humanVideoKey`, thumbnail/local-file routing, `accepted`/`rejected` status vocabulary, actor attribution, and append-only event store.
- Adapted: the existing 120-row loader becomes a 240-candidate request only in tile mode; accepted tiles remain visible while rejects leave the rapid-review surface.
- Left alone: detailed enrichment autosave, quality grades, Avatar mentions, director notes, references, optical telemetry, campaign scheduling, and source media.
- Noise avoided: a second decision store or a new accept/reject schema would split human authority and make parity harder to audit.
- Learning delta: the durable review status already contained the exact first-pass semantics; the missing capability was a high-density interaction layer, not a new backend.
- Guardrail: tile actions are enabled only for `pending-human` proposals and update the UI only after the local API confirms the append-only decision.
- Reusable candidate: a `rapid-human-triage` interaction pattern for other Hapa pending-human queues—poster-first tiles, hover preview, existing-ledger decisions, asymmetric accepted/rejected presentation.
