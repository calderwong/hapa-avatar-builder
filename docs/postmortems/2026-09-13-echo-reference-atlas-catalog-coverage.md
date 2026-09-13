# Echo Reference Atlas catalog coverage correction — 2026-09-13

Status: verified local implementation. Authority remains local-first and human-gated.

## Objective

Make the Reference Atlas represent the complete canonical Dear Papa / Echo Album song catalog. The visible 137-song workbench omitted known tracks including **Miss Infinity** and **Orange**.

## Evidence inspected

- `data/hapa-songs-store.json`: 199 canonical Song Cards; Miss Infinity is track 4, Orange is track 65, and Zerbini is track 22.
- `data/echo-reference-research-loop/projected-run.json`: the selected July research projection contained 137 songs and 1,103 Cards.
- `data/echo-reference-mining/latest.json`: the newer local snapshot contained 198 songs before refresh; it already contained Miss Infinity and Orange but predated Zerbini.
- `data/echo-reference-governance/preview-first-authority.json` and `data/echo-reference-animated-media.json`: 853 exact-revision approved visual/loop records were bound to the research projection.
- Live API and Electron Reference Atlas after correction.

## What worked

The 137-song projection was not corrupt; it was a valuable research-enriched and human-reviewed historical head. Keeping that projection as the authority/media-first layer preserves all 853 approved GPT/Codex visual and loop bindings. A deterministic runtime coverage merge can then add every current canonical song and every non-overlapping local Card before rebuilding the graph and views.

The canonical local miner was refreshed after backing up the prior local run, research projection, and authority receipt under `data/backups/echo-reference-catalog-coverage-2026-09-13/`. Its receipt covers 199 songs, 19,701 pairs, 1,506 local Cards, and zero paid or external calls.

## Noise and misunderstanding corrected

The workbench count looked like a UI pagination or filtering problem. It was not. `selectEchoReferenceRuntimeRun` intentionally preferred any research-bearing projection, even when that projection covered fewer songs than a newer local snapshot. Replacing the research head outright would have restored song names but discarded reviewed media and authority context. Rebasing exact revisions destructively would also have broken the 853 approved media bindings.

The first complete runtime merge was correct but took about 17.7 seconds because `buildEchoReferenceViews` scanned every Card for every possible song pair. Indexing actual multi-song Card occurrences preserves deterministic matrix output and reduced a cold runtime status check to about 1.7 seconds. The store also caches the composed runtime until an input hash or receipt changes.

## Result

- Live Reference Atlas: 199 / 199 songs.
- Miss Infinity: visible as track 4 with 16 Reference Cards.
- Orange: visible as track 65 with 14 Reference Cards.
- Zerbini: visible as track 22.
- Research/authority layer preserved: 853 approved Cards and 853 image + loop pairs.
- Runtime composite: 2,195 Cards across the current 199-song catalog.
- Focused reference tests: 83 / 83 pass; production build passes.
- Broad suite: 2,356 / 2,357 pass. The sole failure is the already documented unrelated HyperFrames source-regex assertion expecting `derivedSamples(manifest, timestamps)` while the current capture path supplies the executable-show expectation adapter as a third argument.
- The supporting-edge correction was followed by the affected 83-test reference suite and build rather than another redundant three-minute broad run.

## Reusable guardrail

Treat the canonical Song Card store as the minimum membership boundary and a research projection as an enrichment/authority layer, never as permission to hide newer catalog members. When packet hashes diverge, build or reuse the current local catalog run, preserve the research version for overlapping Card identities, add missing local Cards and songs, and regenerate derived graph/views. A stale mining artifact may affect reference coverage, but it must not make a canonical song disappear from the operator workbench.

This is a Lesson Card / Flow-explainer candidate: **canonical catalog floor → authority/media-preserving enrichment → regenerated Atlas projections**.
