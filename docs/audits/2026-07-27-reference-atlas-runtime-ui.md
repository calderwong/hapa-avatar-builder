# Reference Atlas runtime UI sharpening — 2026-07-27

## Objective

Make the completed external-reference research and its revision-bound image/loop media visible in the Echo Album Reference Atlas, keep the view current when research changes, and make the same Cards available during Tarot Draw Song playback.

## Source evidence

- Local mining snapshot: `data/echo-reference-mining/latest.json`
  - 1,044 Cards
  - run `fnv1a:b9abf6e6`
- External research projection: `data/echo-reference-research-loop/projected-run.json`
  - 1,103 Cards
  - 82 pending Human-review research proposals
  - run `fnv1a:13ae2982`
- Animated media catalog: `data/echo-reference-animated-media.json`
  - 853 exact Card-revision bindings
  - 853 images
  - 853 adaptive looping videos
  - 853 technically Director-eligible pairs
  - 709 new Codex GPT Image records plus the 144 existing source-reference records

## What changed

1. Runtime selection now prefers the richer research projection when it contains the completed external-research proposals.
2. Animated media is joined in memory only when both Card ID and Card revision match.
3. The Atlas summary endpoint returns a compact projection rather than serializing the full research run.
4. The Atlas defaults to visible review candidates, labels their non-canonical authority, polls for a new run hash, and refreshes the selected Song when the graph changes.
5. Card rail, evidence inspector, and graph nodes show Reference Card images and the focused adaptive loop.
6. Tarot receives compact media-backed Reference Cards, exposes a References browser filter, makes their evidence readable in Card details, and provides an explicit route back to the Atlas.
7. During Song playback Tarot requests that Song’s reference neighborhood. Timed cues are shown as live; untimed references are explicitly labeled as a line-timed fallback.
8. Tarot Draw now builds a playable preview-first deck from approved Reference Cards and compact local data while full avatar/Tarot stores hydrate. Reference imagery no longer waits on an unrelated 333 MB avatar authoring store.

## Turn-to-Lore reflection

### Worked

- Treating the research projection as a sharpening layer over the miner snapshot fixed the missing-data problem without rewriting the source Cards.
- Exact revision binding kept media useful without letting generated imagery silently become identity or canon truth.
- Reusing `EchoReferenceExplorer` and `TarotDraw3DView` preserved the established product surfaces and made the graph portable across authoring and runtime.
- Browser verification found a media-backed Song neighborhood with 25 Cards, 9 still thumbnails, one focused loop, 10 graph thumbnails, and a moving inspector hero.
- Tarot browser verification found both the static and animated Guardians of the Galaxy Reference Card assets.
- The completed Atlas now reports 853 image/loop pairs and 853 local approvals. Tarot built an 869-Card deck, exposed the generated Reference loops in its Card Browser, and placed a selected Reference Card into the 3D scene with its readable rationale intact.

### Noise or misunderstanding

- The original Atlas count came from the older graph count even after the richer run loaded. Runtime Card count is now the visible primary metric.
- `summary=1` previously still returned a multi-megabyte projection. The API now returns only the fields the Atlas summary actually consumes.
- A different-port smoke run reached the nonblank Tarot canvas but the legacy hard-coded `127.0.0.1:8787` media origin produced unrelated CORS console failures. The focused source/runtime tests and browser checks remain authoritative for this change.
- Requiring the full avatar store before deriving any Tarot deck made a preview-safe Reference Card path look blocked even though the Reference media and compact Avatar shell were already sufficient. Full avatar hydration is now enrichment, not a prerequisite.

### Changed understanding

The Reference Atlas is not only a report. It is the shared semantic runtime index:

`research proposal → revision-bound Reference Card → image/loop presentation → Song timeline cue → Tarot runtime Card → Atlas traversal`

The same authority labels must survive every transition. Media eligibility and Director eligibility do not imply approval, canon, publication, mint, or identity truth.

### Reusable lesson

Any future research worker should write a new projected run and media receipt, not patch UI data directly. The running Builder detects the new run hash, reprojects the current Song, and only adopts media whose revision receipt still matches.

For runtime assembly, treat approved Reference Cards as an independently usable source family. Build the first playable deck from revision-bound reference media and compact local records, then refresh in place when larger authoring stores arrive.

## Verification

- `node --test tests/echo-reference-runtime.test.mjs tests/echo-reference-explorer-ui.test.mjs tests/tarot-echo-overlay.test.mjs`
- `npm test`
- `npm run build`
- Live API projection: 1,103 Cards, 82 research proposals, 853 images, 853 loops, 0 stale media bindings.
- Browser: Atlas rendered research/media counters and media-backed Card rail, inspector, and mind map.
- Browser: Atlas rendered 853 approved visual pairs; sampled image and video assets reached ready state 4.
- Browser: Tarot rendered a nonblank 3D canvas, built an 869-Card deck without waiting for full avatar hydration, filtered the media browser to References, opened a readable rationale, and added the animated Reference Card to the 3D details flow.
- Director contract: all 853 pairs retain `technical.directorEligible=true`; the complete 1,205-test suite includes the Reference Atlas Director source-family and adaptive-loop eligibility gates.
