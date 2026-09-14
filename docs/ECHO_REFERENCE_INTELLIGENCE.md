# Echo Reference visual-intelligence pass

Status: local-first prototype. Human review remains required. This pipeline authors prompt foundations and image prompts; it does not canonize interpretations or automatically generate images.

## Purpose

The original September 13 Reference Atlas image pass expanded twelve deterministic motifs into 290 prompts. It preserved provenance and produced consistent images, but the repeated visual grammar made the results too uniform. The visual-intelligence pass replaces that creative authority with a reasoning-model stage while retaining the existing Song Card corpus, encrypted provider credential store, Reference Atlas image runner, and review UI.

For every song and every staged reference or lyric-only connection, the pass stores:

- a song foundation and recognition test;
- all materially distinct concepts supported by the evidence (normally two to five; no ranking or winner selection);
- a lyric → reference → lesson → Tarot meaning chain;
- concrete scene, character, symbol, palette, and visual-signature data;
- retrieval tags and provenance;
- one standalone production image prompt per concept;
- eight 1–5 quality dimensions, strengths, risks, and an API-readiness decision.

Concepts are never removed because another concept scores higher. A prompt becomes eligible for the subsequent image queue only when every quality dimension is at least 4/5, the average is at least 4.2/5, and required rationale, symbols, retrieval tags, and prompt fields exist. Weaker concepts remain stored as `needs-revision`.

## Local operation

The OpenAI key remains in the existing OS-encrypted provider store. The reasoning manifest is written with owner-only permissions under:

`~/Library/Application Support/hapa-avatar-builder/Echo Reference Intelligence Runs/`

The album context is necessarily sent to the configured OpenAI API when the operator starts a pass. No image request is made by these commands.

```bash
npm run echo:reference-intelligence:status
npm run echo:reference-intelligence:pilot
npm run echo:reference-intelligence:full
npm run echo:reference-intelligence:refresh
npm run echo:reference-intelligence:resume
```

The eight-song pilot is a required quality checkpoint. `full` expands only after the pilot completes. A future Reference Atlas image run prefers the completed intelligence manifest and admits only `ready-for-image-api` prompts; it falls back to the legacy 290-prompt corpus while the intelligence pass is incomplete.

`refresh` re-authors the full album from the current canonical songbook and preserves prior plans as superseded evidence. It is intended for material source or protocol corrections, not routine retries.

## UI and security boundary

The Song Workbench Reference Atlas panel shows the current album count, model, reasoning effort, per-song foundation, recognition test, retained concepts, meaning chain, symbols, production prompt, assessment score, and revision reasons.

Complete prompt plans are available only through the trusted Electron preload bridge. They are intentionally not exposed through the network-bound Builder HTTP server.

## Current evidence

Focused contracts:

```bash
node --test tests/echo-reference-intelligence.test.mjs tests/echo-tarot-generation-ui.test.mjs
npm run build
```

The first live pilot used `gpt-5.2` with high reasoning after real Responses API probes showed that the configured OpenAI project advertised but could not invoke `gpt-5.5`. The live-access probe is now the authority for model selection.

The first corrected expansion produced 690 additive concepts across 158 processed connections before the OpenAI project reached its enforced spend limit. A corpus audit retained all concepts, marked 639 ready and 51 needs revision, and recorded an overall authored average of 4.54/5. The manifest remains resumable; no incomplete or weaker concept was discarded.

## Image-only budget runs

The reference-image runner supports an explicit hard-cap mode:

```bash
npm run echo:reference-images:budget -- 14.42
```

Budget mode makes only GPT Image requests—never Responses/text-model requests. It prioritizes the first approved concept for each available song/reference connection before later variants, dispatches at up to 24 concurrent requests, records actual response usage, and reserves `$0.05` for every in-flight image before admitting it. When the remaining allowance is smaller than the reservation, all undispatched prompts become held rather than silently exceeding the cap.

The 2026-09-13 image-only run completed 336 high-quality 1024×1536 GPT-Image-2.5 Sunburst images in 549.971 seconds for an estimated `$14.370330`. Two prompts were rejected by the safety service without recorded image usage; 301 approved prompts remain held. The final estimated headroom was `$0.049670`.
