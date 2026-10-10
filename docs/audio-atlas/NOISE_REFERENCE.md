# Audio Atlas noise-reference measurements

Status: local prototype, numerical/owner/browser preview verified. This completes the method-qualified reference-noise path for `atlas-gap-technical-features`; broad/native acceptance, a focused completion commit and real human acoustic qualification remain open.

## Operator workflow

In **Audio measurements → Measure a noise reference**, enter up to 30 seconds on the selected source and choose **Measure selected range**. The preview reports per-channel broadband RMS and the exact measured boundaries. Stored ~100 ms source windows are used; partial selection expands outward, and expansion beyond 30 seconds is refused. Review and cue the displayed range before making a noise-only assertion. Merely measuring or viewing it does not save a reference.

Saving requires a name, explanation and explicit listening assertion. The server records the exact previewed frame boundaries, source file hash and decoded timeline in the existing append-only review owner. Replacements and retractions preserve prior history. A revision conflict or ambiguous save disables further saving until references are reloaded. Human, agent and synthetic declarations remain separate. Attribution is operator entered, not authenticated independent listening verification.

No automatic isolated-noise claim is made. Music, reverberation and faint stem residue may be present in a selected interval. The result estimates noise only when that interval contains representative noise alone; it is not source separation, denoising, a stationary whole-song noise-floor assertion or SNR. Digital silence yields null dBFS with a zero-energy explanation.

## Shared interfaces

- Read current references/history: `GET /api/echos/audio-atlas/jobs/RUN/query?op=noise&asset=ID`.
- Preview levels only: same query with `op=noise-preview&start=START_SAMPLE&end=END_SAMPLE`.
- Save or retract: authenticated `POST /api/echos/audio-atlas/jobs/RUN/noise-reference`.
- CLI: `query RUN --op=noise`, `query RUN --op=noise-preview --asset=ID --start=N --end=N`, or `noise-reference RUN --file=REFERENCE.json`.
- Export retains `reviews.noise_reference_events`; immutable analysis bytes are unchanged. Each origin has its own latest declaration per source. Retraction is scoped to that origin/source, not an erasure.

Save payload: current `revision`, `asset_id`, `source_sha256`, `timeline_id`, `label_origin` (`human`, `agent`, `synthetic`), `label` (`noise_only`, `retracted`), attributed `reviewer` and `note`. `noise_only` also requires exact previewed `start_sample`/`end_sample`; retractions omit ranges. Unpreviewed off-grid boundaries fail closed on save.

`server/audio-atlas-noise.mjs` owns validation and projection. It aggregates squared RMS times actual frame sample counts, divides by total selected samples and returns `10 log10(mean power)`. This is exact for the saved full-frame support apart from floating-point representation. Channel order, amplitude-1 full scale, DC, non-centered windows, rational identity source map and no-normalization convention are retained. The final partial source frame is weighted by its actual length.

## Verification — September 28, 2026

86 distinct Atlas JavaScript checks have passing evidence: one complete 85-test run, then eight focused noise checks after adding the duration-expansion case and strengthening preservation assertions. Production build passes. Owner tests exercise persistence/reopening, API save/retraction, revision conflicts, preservation of earlier correction/timing-reference history and unchanged analysis bytes. Pure checks cover unequal frame lengths, outward snapping, silence/null, origins, stale source exclusion and invalid ranges. No additional audio process, model or decoder is launched.

Brave Tongues run `668f53ed-8a18-49cf-848e-6c3140c862c7`: a requested 0.123–1.087 s range expands explicitly to 0.100–1.100 s. Channel RMS is −58.3115721938 and −57.5572859712 dBFS. Independent direct computation from the hash-verified original-channel `reference.f32` differs by at most **1.35e-13 dB**. Saved analysis hash is unchanged. These are measured content levels, **not** an assertion that the real passage is noise only. Zero human, agent or synthetic declarations were added to the real song. Browser preview displays the same range/values, source cue and disabled save without listening/name/explanation; actual human assertion save was intentionally not performed. Persistence was verified through the isolated owner/API fixture.

Evidence: source task `work/audio-atlas-2026-09-27/noise-reference/`, including CLI previews, `verification.json`, browser screenshot and test/build logs. The initial connected suite caught an outdated timing-reference fixture missing two newly hashed worker helpers; correcting its fixture resolved the failure without changing measurement or review behavior.

## Reuse and learning delta

Reused the existing technical frame evidence, selected-source player, authenticated Atlas query spine and append-only review revision/lock. This avoids decoding again just to calculate a reference level and preserves source integrity. No duplicate persistence service or human-reference store was introduced.

Lesson Card candidate, derived from Codex task `01a0e4d5-31d6-74f0-ab17-f838cf3f0992`: distinguish the measured energy of a selected interval from the assertion that its content is noise. Show expanded support before saving, preserve declaration origins, and never silently promote an agent or synthetic selection into human truth. Automatic noise separation and broader acoustic qualification remain possible future work, not implied completion claims.
