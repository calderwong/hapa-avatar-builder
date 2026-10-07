# Living Light in Avatar Builder

Status: active implementation / foundation batch, October 6, 2026. Calder authorized execution after the planning pass. The earlier planning-only scope is historical. Canonical work remains in Avatar Builder; no duplicate app registration or renderer rewrite.

Board: http://127.0.0.1:5181/?project=hapa-living-light-avatar-builder

Portable execution criteria: [requirements](living-light/REQUIREMENTS.md), [contracts](living-light/CONTRACTS.md), [acceptance](living-light/ACCEPTANCE.md).

The board owns 40 cards and the detailed requirements, contracts, acceptance matrix and Sol 6.1 handoff. Its initial source inventory was revised after Calder supplied the source ZIP. This batch addresses LL-001/002/003/004/033. Source arrival removes the recovery/search step; it does not establish compatible canonical audio.

## Implemented foundation boundary

- `src/living-light/vendor/`: all 97 original named source modules, hash pinned by `resources/living-light-109/manifest.json`.
- `scripts/build-living-light-native.mjs`: reproducible private ESM namespace containing 72 native kernel/visual modules. Generated file is ignored and produced before build/tests/dev. No eval, host global exports, embedded songs, standalone UI or prototype transport.
- `src/living-light/registry.js`: 50 accounted source definitions: six continuous family presets, 21 bridge styles and 23 destination IDs, including the explicit Halo Vault → Lumen Arcade alias. Golden Loom `breathline-weave` remains a shared corridor dependency. Catalogued does not mean ready.
- `src/domain/living-light-contracts.js`: shared Thing/Journey/parameter/note validation with immutable pinned references and microsecond schedules. Server actor authentication, persistence and Card custody remain later cards; a validated client actor is not authenticated attribution.
- `living-light-source-binding.js`: exact-ID catalog projection and source/feature admission. FX-to-other is explicit; unknown roles remain unmapped. Missing/alignment-unverified never becomes synchronized silence.
- `server/living-light-catalog.mjs`: read-only Song owner + existing Audio Atlas inventory adapter. `GET /api/echos/living-light/catalog` reports exact identities/header evidence without decoding, feature preparation, paths or media bytes. No source-store mutation.
- `src/components/LivingLightWorkspace.jsx`: lazy Echo workbench entry with one native canvas, one host frame loop and the existing audible element/source clock. The visible initial preview is an authored neutral study; measured features, tours, real figure assets, persisted recipes and durable discussion are pending.

## Qualification and limits

The reviewed supplied build reproduced the original player byte for byte; supplied pure checks passed 113/113. They do not prove GPU rendering or canonical audio. Original repository history and the sibling 108.1 historical pixel baseline were not supplied. Current native GPU checks are tracked independently; historical comparison is explicitly unavailable, never a pass. The supplied Linux browser tools are reference QA; Builder's current host is qualified using the Mac's actual browser.

`scripts/prepare-living-light-reference-qa.py` accepts explicit source, output, browser executable and optional baseline paths. It prepares a hash-checked derivative without launching a browser, defaults to native rendering, and retains every current109 check when the historical108.1 artifact is unavailable. The configured Mac runner passed syntax validation; its full standalone browser suite has not been run. The actual Builder host was inspected separately on native WebGL2.

Never join the 183.024-second prototype Dear Papa reconstruction to the canonical roughly 258.44-second song by title or stretch its features. Songs enumerate through the existing store, including local ingest, and retain exact IDs. Existing Atlas owns alignment receipts and missing-media remediation. The existing limit of six silent live analyser decoders remains unchanged; all-role prepared signals are a separate later integration. Phase 1 audible scope is one master or one real stem audition.

Native scene color/emission/depth and the original final optical transform remain in one GL context. The foundation installs Passage → Geometry Dance → Journey visual hooks in explicit order. No Three scene or shared-depth Avatar support is claimed. Resting motion is evaluated at absolute source time; the host holds the last visual time when requested. Canvas cleanup removes listeners and disposes its renderer. Performance, context-loss restoration and all-family visual coverage require real evidence.

The catalog tiles are discussable definitions, not durable Hapa Cards. Card birth uses the existing root custody service in LL-009; authored revisions and notes use the separate native owner service in LL-016. No remote publication, final Song Card mint or final encoding is enabled here. All media slots stay disabled until qualified. The Tarot cockpit and Record Garden are inherited surfaces.

## Verification and continuation

Run `node scripts/build-living-light-native.mjs --check` and `node --test tests/living-light-foundations.test.mjs` after generation. At the coherent batch boundary run the owner build and affected/full regressions, preserving known baseline failures. Attach actual source, browser, coverage and cleanup evidence to the board. Do not close cards because a catalog enum or pure test exists.

The next batch connects exact source-bound prepared signals and role/time-map admission, then tours/persistence/Card discussion. The user’s goal is to drain the board; human artistic review remains Calder’s and later immersive video/export work retains its separate scope.

## Reuse decision and learning delta

Objective: bring Living Light into Builder as modular creative material. Reused the Echo workbench, audible element, source receipt and Atlas inventory. Adapted native 109 modules through a private host namespace. Earlier source uncertainty was corrected by Calder's supplied ZIP; source code reproduced the player exactly. The useful guardrail is to keep source recovery, audio identity, schema validation, real GPU evidence and human acceptance separate. Pure native tests were valuable; an initial mock attempted to mutate a frozen namespace and was corrected to inject a copied test facade. This is a Decision/Flow-explainer candidate derived from Codex chat `01a1146f-fe68-76b3-a736-473042c3818c`, not an adopted agent identity or proven general protocol.

## October 6 acceptance checkpoint

49 affected tests, 54 Overcard regressions, production build and native Tarot smoke pass. The full suite recorded 2,605 passes, nine failures and one skip; the new obsolete workbench-tab assertion was repaired and verified. Eight failures match the documented pre-existing baseline gaps. Source remains uncommitted under the owner completion gate; source cards remain In Progress. Requirements documentation is recorded separately; existing tracked registration edits remain uncommitted. The catalog route is implemented in source; the existing API process has not reloaded it.

Per-role availability is now distinct from per-asset availability: each registered declaration receives a bounded Atlas header check. Readable role peers do not certify placeholders or missing same-role assets. No new analysis or source-store writes occur. See the [batch postmortem](postmortems/2026-10-06-living-light-foundations.md).
