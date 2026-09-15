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

### Local Qwen continuation

The interrupted GPT-5.2 run intended 290 source connections across 199 songs. It completed 158 connections for 93 songs and left 132 connections across 106 songs without foundations or prompts. Because each connection retains every supportable concept, 132 was the exact missing-opportunity count; the final missing-prompt count is discovered by authoring rather than fixed at one prompt per connection. The separate 51 previously authored `needs-revision` concepts were not counted as missing. The first qualified local pilot finalized three more connections and eleven prompts, leaving 129 unfinalized source opportunities at the local full-run launch checkpoint.

Use the zero-cloud-text-cost oMLX continuation lane only after its quality pilot passes:

```bash
npm run echo:reference-intelligence:local-pilot
npm run echo:reference-intelligence:resume-local
```

The local lane is pinned to `http://127.0.0.1:8001/v1`, the qualified daily `qwen38-flash-next:fast` alias for the local `Qwen3.8-Flash-Next-oQ4e-mtp` model, and qualified concurrency one. Album packets are far below the alias's 128K prompt ceiling, so the long-context alias adds no useful capacity here. The lane reads no OpenAI credential and makes no cloud text request. Each plan records `local-omlx`, the exact model alias, timestamp, and quality profile in its author provenance.

Each source opportunity runs through a two-stage authoring protocol:

1. The concept architect produces two to five distinct causal blueprints. Each blueprint must fuse a peculiar lyric noun/action, the reference's transferable mechanism, the lesson, and the attached Tarot card into one visible operation. Numbered Minor Arcana blueprints retain the exact visible count of suit objects.
2. The prompt author expands every blueprint into a 160–500-word production record. A compact multi-concept request is attempted once. If individual compact concepts miss a mechanical production gate, only those prompts receive a targeted repair while the valid concepts and intelligent blueprint remain untouched. Structural compact failures fall back to one seed per request. A seed whose architecture is sound but whose production prompt fails a mechanical gate receives the same prompt-only repair pass. Accepted connections and accepted fallback seeds are checkpointed independently, so an interruption cannot erase earlier work; a retry with a valid seed checkpoint bypasses the already-failed compact route and resumes at the first missing seed. Request ceilings are sized to the schema and bounded so one malformed response cannot monopolize the single qualified oMLX slot for tens of minutes.

The worker always drains the least-attempted jobs before older repair work. A failed job is admitted automatically at most once per retry-policy version; repeated process restarts do not move the same malformed song back to the head of the queue. A deliberate repair run may still override that bound. This keeps partial and failure provenance intact while preventing one pathological prompt from starving the remaining album.

By default, the local lane supplies the exact JSON schema inside the prompt and validates the returned object in the application instead of enabling oMLX's token-by-token grammar constraint. The qualified service measured roughly 20 tokens/second under the large constrained schemas used here versus roughly 62 tokens/second for its normal MTP decode path. Client validation preserves cardinality, field, quality, Tarot, symbol, and character gates while allowing native MTP throughput. Set `HAPA_ECHO_LOCAL_STRICT_JSON=1` only for a diagnostic strict-grammar run; it is deliberately not the bulk-drain default.

Mechanical blueprint and prompt stabilization is deterministic and provenance-marked. It may restore an exact connection key, an omitted exact Tarot title/count, copy missing named symbols, remove prohibited meta phrases, or restore established Hapa identity markers from the already-authored structured concept; it never invents the concept foundation, lyric/reference/lesson bridge, scene, hero action, or Tarot rationale. If a compact record remains structurally invalid after targeted repair, the default fast drain records the failure and advances to the next song instead of entering an unbounded seed-by-seed fallback. All remaining local failures are stamped with the retry-policy version so an automatic worker restart cannot loop them; set `HAPA_ECHO_LOCAL_FAST_DRAIN=0` only for a deliberate repair session that should spend extra time reconstructing one failed compact record.

Objective gates are applied in addition to the model's self-assessment. They require at least 140 positive renderable words before exclusions, no more than eight excluded items in at most three exclusion sentences, exact attached-Tarot naming, explicit numbered-suit counts, at least two visible named symbols, established Hapa character continuity when a person is used, at least two canonical physical identity markers for named Red/Blue/Green/Bella roles, readable character identity, and rejection of known meta filler, invented generic Hapa roles, and legacy default clusters. An album-wide collision audit runs automatically after a local drain finishes. The UI and status output expose intended, finalized, missing, and checkpointed source-opportunity counts.

The first local attempt is retained as negative evidence: without connection cardinality and production-length constraints, the model duplicated source connections and wrote 52–151-word prompts while assigning overconfident self-scores. A second monolithic attempt developed stronger concept foundations but exhausted the local structured-output ceiling. The qualified two-stage pilot on “Sisyphus on the Climb, Climb.” retained eleven materially different prompts: eight passed the strengthened objective and corpus gates and three remained stored as `needs-revision` for exclusion padding, insufficient positive visual direction, or collision with the old stock visual grammar. A separate three-concept compact checkpoint showed that the fast expansion path preserves the blueprint architecture; it is re-audited under the same objective gates before reuse. These results qualify the pipeline, not every individual output. Do not remove the structural gate or promote local output from self-assessment alone. Human review remains required before image generation.

The first live production calibration on “Between the Beats” exposed and fixed three additional failure modes before the album drain continued: an occupational costume replaced Hapa Green's canonical identity markers, an `Exclude:` prefix evaded the original No/Avoid counter, and an exact Major Arcana title was falsely rejected for lacking the redundant word “Tarot.” The final checkpoint retained three materially distinct Hapa Blue concepts—blank-ledger/key rail gap, barred-hourglass handclasp, and unfinished radio-bridge construction—at 188, 278, and 339 words. All three pass the objective gate; the hourglass prompt was produced by the targeted prompt-only repair path. Subsequent repaired concepts record the exact repaired gate reasons directly on the concept. Superseded bad seeds remain in the manifest as evidence.

The local node produced about 21.8 output tokens/second on these structured calls. Concurrency above one is not qualified for this resident model, so a full missing-opportunity drain is a long-running local job rather than an RPM-bound cloud burst.

## Image-only budget runs

The reference-image runner supports an explicit hard-cap mode:

```bash
npm run echo:reference-images:budget -- 14.42
```

Budget mode makes only GPT Image requests—never Responses/text-model requests. It prioritizes the first approved concept for each available song/reference connection before later variants, dispatches at up to 24 concurrent requests, records actual response usage, and reserves `$0.05` for every in-flight image before admitting it. When the remaining allowance is smaller than the reservation, all undispatched prompts become held rather than silently exceeding the cap.

The 2026-09-13 image-only run completed 336 high-quality 1024×1536 GPT-Image-2.5 Sunburst images in 549.971 seconds for an estimated `$14.370330`. Two prompts were rejected by the safety service without recorded image usage; 301 approved prompts remain held. The final estimated headroom was `$0.049670`.
