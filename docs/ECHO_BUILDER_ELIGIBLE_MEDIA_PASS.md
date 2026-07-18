# Echo Builder Eligible Media Pass

This pass appends a new Echo Album director cut for every album project. It does not replace or delete an original project or an existing cut.

## Cut family

- Variant ID: `builder-deevid-tarot-scene-eligible-v1`
- Title: `Builder + Deevid + Tarot + Scene · Eligible Recast`
- Eligible source rotation: Avatar Builder, Deevid, Tarot, Scene
- Explicit origin exclusions: `hapa-dev-proto`, `hell-week`
- Exclusion scope: explicit origin/provenance lineage only; incidental words in titles or descriptions do not disqualify media

## Eligibility

All candidates must have a usable local video, a short edge of at least 512 pixels, and a duration of at least 2.5 seconds. Deevid, Tarot, and Scene media additionally require the verified technical-video record and a browser-safe pixel format. Avatar Builder media use the Builder's local-file and media-metadata contract.

The pass deduplicates by content hash, validates card references, then distributes the eligible library across the album using least-used clip and card fairness. Its fixed source rotation is Avatar, Deevid, Tarot, Scene. The resulting cut records source, card, hash, motion role, and album-usage evidence for every replacement shot.

## Repeatable operation

Preview without writing:

```sh
npm run echo:variants:builder-media-eligible
```

Append cuts and write a receipt:

```sh
npm run echo:variants:builder-media-eligible:apply
```

Resume an interrupted run by creating only absent cuts:

```sh
node scripts/append-eligible-builder-media-direction-variants.mjs --apply --missing-only
```

Before an apply run, the script hashes existing projects and cuts. It refuses conflicting output, backs up the variant index, appends only the new family, verifies that prior files were not changed, and writes a merge report under `data/merge-reports/`.

## Release checks

Run the normal Builder test, production build, Tarot smoke, Echo player-pool smoke, and overcard suites. Review the merge report for zero excluded origins, zero existing-file mutations, and complete cut coverage before treating the pass as delivered.
