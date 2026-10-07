# Living Light implementation contracts

> Portable planning specification with an execution-scope delta, October 6, 2026. Criteria describe intended behavior; current evidence and incomplete states are in [the integration record](../LIVING_LIGHT_INTEGRATION.md) and [the live board](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder). The original planning artifacts remain preserved.

Proposed specification, October 6, 2026 Pacific; no interfaces below exist unless identified as current. Read with [requirements](REQUIREMENTS.md), [prototype audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder), and [Builder audit](http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder). Canonical owner: `$HAPA_AVATAR_BUILDER_ROOT`. Attached source is reference material, not execution authority. This document chooses concrete defaults for Sol 6.1; changed contracts require a recorded migration/decision.

## 1. Thing registry and authoring identity

Use schema `hapa.living-light.thing.v1`. Required fields:

| Field | Contract |
| --- | --- |
| `thingId`, `revisionId` | Stable namespaced identity and immutable native authoring revision; never title or numeric renderer kind. |
| `kind`, `variantKind` | `tunnel | location`; `continuous-profile | passage-style | destination`. |
| `title`, `summary`, `tags`, `previewRef` | Human presentation; failed/missing preview does not hide the record. |
| `rendererRef` | Allowlisted `{implementationId, implementationVersion, sourceDigest}`; no executable code from records. |
| `source` | Original artifact digest, original module/ID, source references, attribution, license/credit references. |
| `parameters` | Named typed controls: boolean/enum/finite number/vector, units, minimum/maximum/default. Unknown controls rejected. |
| `signalPorts` | Accepted feature semantics and explicit fallback policies; required versus optional inputs. |
| `capabilities` | Supported `continuous`, `bridge`, `destination`, transition IDs, entry/exit/camera anchors, quality tiers; independent readiness states. |
| `aliasOf`, `derivedFrom`, `worldRefs` | Optional exact identity/revision relations; `worldRefs` can link Place/Scene IDs without rewriting their lore. |

Every manifest entry has a discussable stable Card projection. Ship **50 source entries**: six continuous profiles, 21 passage styles, 23 destination IDs. This is not 50 independent engines. The six profiles (`fractal`, `cathedral`, `weave`, `electric`, `glass`, `star`) reference one shared corridor renderer with distinct presets. Preserve all 21 exact passage IDs from the audit. `halo-vault` keeps its own alias record and notes, with `aliasOf` pointing to the reviewed `lumen-arcade` implementation; report 23 destination IDs including that alias. `breathline-weave` is the shared corridor implementation dependency, not an invented 24th destination. Keep authored fixtures/presets separate from capabilities.

Readiness is `{state: catalogued|blocked|preview-ready, reasons[], evidenceRefs[]}`. Final encoding remains `unsupported` in Phase 1. A catalog entry is never promoted merely because its enum exists. Compatibility validation resolves both pinned revisions, anchors, render dependencies and mode; incompatible combinations return structured errors before play/save-as-ready.

A preset is a new Thing identity/revision with `derivedFrom` and validated parameter overrides. An instance is `{instanceId, thingRef:{thingId,revisionId}, parameters, bindings}` embedded in a Journey. Instance edits never alter source definitions or other instances. Canonical JSON digests identify semantic revisions; `revisionNumber` orders history. Creation time/actor are event metadata, outside semantic digests. Referenced revisions are retained; archive hides a head without deleting old recipes.

## 2. Journey and timing

Schema `hapa.living-light.journey.v1`: stable `journeyId`, immutable `revisionId`, `parentRevisionId`, title, exact `songId`, `sourceBindingRef`, mode `continuous|tour`, uint32 seed, instances, schedule, actor treatment, motion settings and reserved media slots. Preserve imported Standard recipes as distinct records; no silent conversion to continuous mode.

Use integer `timelineUs` (microseconds in selected source playback time) for authored schedules. Features retain their own decoded sample coordinates. Intervals are half-open `[startUs,endUs)`, nonnegative, within verified source duration; convert once with a documented rounding policy. `localUs = timelineUs - startUs`; raw source time remains available. Never integrate travel from render-frame delta.

A tour schedule alternates destination dwell and bridge intervals. Each bridge names exact adjacent source/destination instance IDs and entry/exit anchor IDs. Validate the chain, duration, overlaps, ordered coverage and locks atomically when reordering/replacing. Do not relax prototype 4–60 second/12-bridge limits until extraction proves the new behavior; return `route_duration_unsupported` for short-song templates, retaining continuous mode. No implicit time scaling on song change. Fork creates a draft with a timing-conversion preview; only explicit reviewed conversion changes times.

Continuous mode references one compatible family or a family schedule. Preserve the source's deterministic chapter/blend recipe behind a versioned evaluator. `apparition|traveler|none` names the existing figure treatment, not arbitrary Avatar Builder model support. Seed, effective parameters, source time and feature revision fully determine evaluated state. Undo/redo edits only the draft; commit creates one revision per action/gesture, never one per frame.

## 3. Song, source and feature binding

Schema `hapa.living-light.source-binding.v1` identifies `songId`, exact registry/local owner reference, selected master asset, source-byte SHA-256, decoded timeline identity/rate/frame count/duration, stem assets, feature bundles and any explicit time maps. Versions belong to assets, not song titles. Resolution states are `unresolved|bytes-verified|decoded|alignment-unverified|ready|missing|stale`; do not compress these into one boolean.

**Hard mismatch fixture:** prototype `dear-papa` has a 183.024-second reconstructed audition mix; Builder `dear-papa-song-dear-papa` currently declares a 258.44-second master, registry ID `ced8a86b-bbdb-4c76-9f50-33f5face933d`. Do not load 183-second features against the 258-second source, stretch them, or claim title equality proves identity. Either retain the prototype audition as a separately named source version or prepare measurements from the selected Builder source. Even equal duration requires matching source evidence.

Each stem preserves arbitrary `assetId`, original `declaredRole`, canonical role if known, available URI resolved by the owner, source digest, decoded duration, origin/alignment state, and explicit mapped time segments. Do not treat archive entries or role-only placeholders as audio. Canonical mapping handles vocal spelling differences; unknown roles remain selectable and inspectable. A many-stem-to-one visual port binding requires declared aggregation (`max`, `mean`, or bounded weighted sum) and weights; silence, unknown and missing are distinct.

Phase 1 has **one audible source: master OR one selected real stem audition**. For verified alignment, stem audition drives the song timeline through the explicit time map. For missing/unverified alignment, provide a labeled source-local audition using the same transport owner with `clockDomain: stem-source`; hold the Journey preview and song playhead, show stem-local seconds, and restore the prior song position on return. Do not label this synchronized album visualization. LL-002 inventories alignment receipts; LL-006 consumes validated owner mappings or records unresolved alignment with the existing Atlas task as remediation. Zero offset is never inferred from duration/title. No simultaneous multistem audible mixer is promised. Visual bindings independently combine all available prepared stem signals. Existing six silent live-analyser slots remain bounded; do not raise the cap to twelve as a shortcut. Prepared signals use master timeline mapping even during stem audition. Audible choice, visual participation and signal readiness are separate UI fields.

Schema `hapa.living-light.features.v1` records source/decoded digests, extractor/version/config digest, feature name/units/range, sample rate/hop/origin, quantization, normalization, validity/availability, interpolation and provenance. Prototype data uses 24 kHz analysis, 30 Hz curves, uint8 encoding and 60 Hz derived articulation; Builder measurements are not equivalent because their names match. The adapter declares per-feature `exact-compatible|transformed|unavailable` and transformation/version evidence. Do not invent brightness/width/pan from RMS, call onset a certified beat, or reinterpret silence as missing.

Padding outside a shorter source is explicit silence with a validity mask; missing alignment is unknown. No automatic stretch or offset correction. New preparations are explicit bounded jobs, source-keyed and cancelable; browsing songs never runs them. Cache limits and LRU eviction apply to decoded features/articulation, not just JSON manifests; keep only current/limited lookahead sources. Initial budgets must be measured and recorded in acceptance evidence.

## 4. Runtime host

Expose `createLivingLightRuntime({canvas,registry,mediaResolver,featureProvider})` returning:

- `prepare({journeyRevision,sourceBinding,generation,signal})` → validated readiness/resource lease;
- `evaluate({timelineUs,playing,seed,quality,reducedMotion,viewport,featureFrame})` → deterministic motion packet;
- `render(packet)`, `resize(viewport)`, `suspend()`, `restore(context)`, `dispose()`.

The Builder playback owner supplies absolute source time and play state. One host RAF renders; modules start neither audio nor animation loops. Visual speed changes travel only. Reduced Motion freezes travel/encounters using an explicit held visual time while allowing audio to continue; resume rebases from current source time without unbounded catch-up.

Use a dedicated lazy native WebGL2 canvas initially. Preserve one final color transform, source render hook ordering, depth behavior and projective bridge cameras. Module dependency order becomes explicit (`prepare`, scene/depth, elements, overlay, final transform), not accidental wrapper installation order. Every GL allocation has one owner/disposer; unmount cancels pending work, removes listeners and releases leases exactly once. Context restoration rebuilds from retained authoring state. Stale async generation results cannot mutate active song/recipe. Pause/hidden-view behavior must not leave a second renderer active behind Tarot/Preview.

Reserve media binding `{cutRef,mediaRef,sourceTimeMap,trim,loopPolicy,fit,crop,surfaceRef}` with `enabled:false` until qualified. Continuous Journey currently suppresses media; recording rejects external transport. Neither is fixed by attaching a clock. Preserve muted video audio and mark final rendering/capture unsupported.

## 5. Notes, native persistence, custody and API

Note schema includes stable `noteId`, revision, `target`, body, explicit actor `{actorId,kind:human|agent,displayName,instanceId?}`, creation/edit times, parent revision and event type `created|edited|retracted`. Text is inert, ≤16 KiB; no HTML/script evaluation. Targets are a tagged union:

- `thing`: stable Thing ID, optional observed revision;
- `journey`: Journey ID plus observed revision;
- `instance`: Journey ID/revision/instance ID, optional source-binding revision and `[startUs,endUs)`.

General notes stay on the original Thing after forking; new preset notes do not inherit authorship. Retracting appends history and a visible tombstone. Agent writes cannot claim a human decision. The server derives or validates actor identity/kind against the trusted caller/session provenance; client fields alone cannot grant human attribution. Until an authenticated human action is observed, imported/automated actors remain agent or explicitly unverified rather than human. Counts and “used in” are derived indexes, never a second discussion store.

Proposed owner service uses existing `node:sqlite` support with WAL in ignored `data/living-light/authoring.sqlite3`: identities/heads, immutable revisions, notes/events, idempotency receipts and pending origin intents. Transactions compare expected head, insert revision/event, advance head and stage delivery intent atomically. Store semantic payload digest and preserve unknown imported versions as unresolved attachments, not partially normalized records. Backups/migrations are explicit; source audio, Song/Place stores and prototype artifact remain unchanged. CLI calls this service through the protected API instead of independently writing the DB.

Card birth uses existing `card-custody-service.mjs` and real `card.created`. Its receipt stays the **root** receipt; native `authoringRevisionId` names later edits separately. Do not append unsupported revisions to the root-only Hypercore service. A crash-safe pending operation coordinates local save, custody and Card projection; report `custody-pending` until verified. Extend the existing `avatar-overwind-origin.mjs` adapter for supported new-family event shapes only after contract tests. Delivery intents remain local/pending until acknowledged; disconnected Overwind does not block ordinary native notes. No automatic sync/mint/publication is added. Shared Hand uses Overcard's existing offline/mutation rules.

LL-016 implements the minimal authenticated Thing/Journey/note read and mutation endpoints with the persistence service so subsequent UI tasks have a real backend. LL-021 completes API capability/readiness/import/export and CLI parity; LL-028 verifies cross-surface round trips.

All following endpoints are **proposed**, under `/api/echos/living-light`:

| Route | Behavior |
| --- | --- |
| `GET /things`, `/things/:id`, `/things/:id/revisions/:rev` | Paged metadata/detail/pinned revision; filters and cursor, ≤200 rows; no analysis. |
| `POST /things`, `/things/:id/revisions` | New preset/revision; expected revision, idempotency key, actor and validation. |
| `GET/POST /journeys`; `GET /journeys/:id` | List/create/read; pinned revision query supported. |
| `POST /journeys/:id/revisions`, `/fork` | Atomic validated commit or explicit conversion-preview/fork. |
| `POST /validate` | Pure composition/source-reference validation; no save/preparation. |
| `GET/POST /notes`; `POST /notes/:id/revisions`, `/retract` | Filter by exact target; optimistic conflicts and append-only history. |
| `GET /readiness?songId=…`, `/export?journeyId=…&revision=…` | Evidence-aware readiness and bounded portable metadata. |
| `POST /import/preview`, `/import/commit` | Validate first; commit binds preview digest and idempotency key. |

Mutations use existing protected local UI session/admin boundaries; never raw filesystem paths or bearer credentials in browser records. Return 409 revision conflict with current head, 422 typed validation errors, 413 payload limit, and explicit missing-source errors. Ambiguous writes are resolved by idempotency receipt, not blindly replayed. Default JSON body cap: 1 MiB; portable packages reference media, never embed album audio. CLI `living-light list|get|validate|save|fork|notes|readiness|export|import` shares schemas and errors.

## 6. Concrete draft request

Illustrative request for an isolated fixture; referenced fixture revisions deliberately do not claim production readiness. An unresolved source binding can be saved as draft but cannot play until resolved.

```json
{
  "schemaVersion": "hapa.living-light.journey.v1",
  "title": "Dear Papa — cathedral study",
  "songId": "dear-papa-song-dear-papa",
  "sourceBindingRef": null,
  "state": "draft-unresolved",
  "mode": "continuous",
  "seed": 109,
  "instances": [{
    "instanceId": "passage-1",
    "thingRef": {"thingId": "ll109:tunnel:continuous:cathedral", "revisionId": "fixture-r1"},
    "parameters": {"intensity": 0.6},
    "bindings": {"pulse": {"source": "master", "feature": "rms", "onUnavailable": "hold-neutral"}}
  }],
  "schedule": [{"instanceId": "passage-1", "startUs": 0, "endUs": 20000000}],
  "actorTreatment": "none",
  "mediaSlots": [],
  "expectedRevision": null,
  "idempotencyKey": "fixture-create-cathedral-study",
  "actor": {"actorId": "agent:planning-fixture", "kind": "agent", "displayName": "Planning fixture"}
}
```

## 7. Exact proposed file map

| New path in canonical Builder | Responsibility / existing seam |
| --- | --- |
| `resources/living-light-109/manifest.json`, `NOTICE.md`, `credits/` | Hash-pinned inventory/source attribution; inherited shader credits are present in delivery. |
| `src/domain/living-light-contracts.js`, `living-light-journey.js` | Validation/revisions/routes/timing; reuse normalized Song identity, never narrative Place normalization. |
| `src/domain/living-light-source-binding.js`, `living-light-features.js` | Existing `echo-audio-route`, performance bundle, inventory and role adapters. |
| `src/living-light/runtime.js`, `registry.js`, `renderers/`, `kernels/` | Recovered native GL modules, ordered hooks and deterministic evaluators. |
| `server/living-light-store.mjs`, `living-light-service.mjs`, `living-light-routes.mjs` | Narrow authoring transactions/API; route registration in `server/api.mjs`. |
| `cli/living-light.mjs` | Protected API parity; no direct store writes. |
| `src/components/LivingLightWorkspace.jsx`, `LivingLightLibrary.jsx`, `LivingLightInspector.jsx` | Echo entry, single canvas, library/notes/route editor; existing transport remains owner. |
| `src/overcard/entityCatalog.js`, `hostTargets.js`, `renderers.jsx` (extend) | Typed consumer projections/Hand integration; do not fork Overcard. |
| `tests/living-light-*.test.mjs`, `docs/contracts/living-light-*.schema.json` | Contract/migration/conflict/source/route/lifecycle fixtures and schemas. |

Execution must map the supplied109 source module boundaries and verify working-tree signatures before edits; filenames are proposed owners, not evidence of existing implementation.
