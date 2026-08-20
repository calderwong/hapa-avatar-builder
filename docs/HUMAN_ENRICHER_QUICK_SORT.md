# Human Enricher quick sort

## Operator surface

The Human Enricher now offers two layouts on the same local-first review route:

- **Detail** preserves the catalog, optical telemetry, proposal evidence, and full human enrichment editor.
- **Quick Sort** requests up to 240 optically reviewed videos at a time and presents only dense video tiles. Hovering or focusing a tile starts muted loop playback inside the thumbnail; leaving the tile resets it.

Quick Sort reuses the existing append-only optical-review decision endpoint. A thumbs-up records `accepted` and leaves the tile visible with a green accepted state. A thumbs-down records `rejected`; rejected and blocked candidates are omitted from the tile view. The decision is not canon, publication approval, rights clearance, or source-media mutation.

The toolbar telemetry reports five full-catalog totals: known videos, seen, not seen, Quick Sort accepts, and Quick Sort rejects. These counts are rebuilt by the API from the canonical media projection and durable review ledger on every load; they are not inferred from the current 240-video page or browser session. A video is **seen** after any final human decision (`accepted`, `accepted-edited`, or `rejected`) and **not seen** while its eligible proposal remains `pending-human`. Accept/reject totals remain scoped to decisions attributed to `human-enricher-quick-sort`, so decisions made in the detailed review surface stay separately attributable.

Quick Sort defaults to **Not seen yet** and filters that state on the server before pagination. A completed decision disappears from this view and advances the next-page offset without skipping newly shifted candidates. Operators may switch to all eligible candidates or filter by the media's existing source ownership and attachment types, such as System Media, Avatar Cards, Tarot Cards, or Scenes. The Detail layout adds a separate **Accepted** review filter, which includes `accepted` and `accepted-edited` proposals but excludes rejected proposals.

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

## Telemetry correction checkpoint

- Objective: make completed Quick Sort work countable after refresh and across paginated batches.
- Evidence inspected: the Quick Sort request limit, rejected-tile filtering, decision endpoint, persisted `humanDecision.actorId`, current review ledger, and dashboard summary construction.
- What worked: all inspected Quick Sort decisions were already durably recorded with accepted/rejected status and actor attribution.
- What was misleading: the toolbar counted only records in the loaded page, and rejected records were intentionally absent from that page.
- Changed: the dashboard now reconstructs full-catalog known/accepted/rejected telemetry from canonical stores, and the toolbar renders those server totals.
- Guardrail: Quick Sort totals are actor-scoped and never use page length as historical telemetry.

## Seen/source filtering checkpoint

- Objective: stop recycling already decided tiles, expose seen/not-seen progress, filter Quick Sort by source, and isolate accepted videos for detailed enrichment.
- Evidence inspected: durable review statuses, the 240-record pagination boundary, System Media owner/relationship facets, Detail review filters, and the optimistic decision update.
- Reused: the canonical review status, owner/relationship source vocabulary, dashboard summary, and server pagination route.
- Changed: unseen filtering now runs before pagination and defaults on; source filtering is server-backed; decision updates correct the shrinking unseen-page offset; Detail exposes accepted-only filtering.
- Guardrail: seen state is derived from durable final decisions, never from hover events or browser-local history.
- Reusable candidate: a `decision-derived-unseen-queue` pattern for paginated human-review surfaces whose membership changes as decisions are recorded.
