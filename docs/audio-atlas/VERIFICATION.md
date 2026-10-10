# Verification — 2026-09-27

Status: scoped prototype exercised; repository acceptance blocked. Changes remain uncommitted under the Builder completion protocol. No GitHub mutation occurred.

## Real Echo song

Song: **Brave Tongues**, `dear-papa-song-brave-tongues`. Final run: `6d1f3264-e7f3-46ef-a6d1-0d3eb0c8e9c8`. Master plus 12 stems: Vocals, Backing Vocals, Drums, Bass, Guitar, Keyboard, Percussion, Strings, Synth, FX, Brass, Woodwinds.

- All 13 assets stereo, 48 kHz. Master 11,685,128 samples / 243.4401667 s; each stem 11,687,040 samples.
- Analysis with optional local ASR completed in 33.9568533 s on this workstation. Single observed warm run, not a general benchmark.
- 7,211 energy transients and 489 unreviewed word candidates. Transcription contains audible-text errors and has no human accuracy qualification.
- Summed-stem reconstruction lag was −0.018 s in 8/8 sampled windows, correlation 0.912–0.985. This proposes moving the group earlier; no correction was applied. Individual stem origins remain unverified. The 8 kHz diagnostic's sample precision is not a timing-accuracy claim.
- Result SHA-256: `4c25bddc0dc5849fa7ab98ba4ee844a4dfa37b3598e1eef75cb05792fb4cb82b`.
- MLX Whisper 0.4.3, local 4-bit large-v3 revision `d12b5d0043a6fe0c59af321617fba041d4e8e0c8`; weights SHA-256 `3bfa3c4e42344ea87a5b81a73992a867088ae076d377042e384b657adea81db9`. Original supplied lyrics were not rewritten.
- Live API report: 11/11 pass (auth, origin rejection, source measurements, word/evidence queries, all original/preserved hashes, exact-byte HTTP206 playback, stereo curves, cache reuse, export and worker exit).
- Browser: Brave Tongues selected, both vocal waveform channels visible, word candidates and source evidence displayed, seek window reached 2.8 s, vocal playback advanced and paused. No observation was falsely accepted as human reviewed.

## Automated checks

| Check | Result |
| --- | --- |
| `node --test tests/audio-atlas.test.mjs` | 10 pass |
| `python3 -B scripts/test_audio_atlas_worker.py` | 4 pass |
| `node --test tests/overcard-*.test.mjs` | 54 pass |
| production delivery build (`npm run build` implementation) | pass |
| `node scripts/check-production-build.mjs` | pass, receipt-presence |
| `npm test` | 2,418 pass / 11 fail, 2,429 total at that run |

Two additional focused tests were added after the broad run: original replacement versus preserved-source tampering, and invalid observation bounds/duplicates. No second broad-run claim is made. Final semantic build hash: `sha256:f2c3b8f350c3a4071e13b297c17659fb1d62beaf41f2aa2c688bcb21daed3fb2`.

The 11 broad failures are in avatar-echo-genesis-update, echo-album-navigation, echo-hyperframe-output-profile, echo-isf-album-handoff, echo-isf-frame-intent, echo-playback-media-v2, echo-reference-explorer-ui, hyperframes-runtime-acceptance, hyperframes-show-compiler, semantic-media-ranker-v2 and tarot-isf-playback-pool. Examples include current Gnow Her album coverage, avatar count and existing renderer expectations. They are outside changed Atlas paths; a clean pre-change replay was not performed, so they are not asserted proven pre-existing. Unrelated working changes were preserved.

The existing Tarot Draw tab rendered a nonblank 3D table, deck rail and controls in the CUA browser; its screenshot is retained. The repository's Electron `smoke:tarot` harness is not claimed run; browser verification uses the available CUA interface. That harness and full-suite repair remain acceptance gaps. No full desktop release, full design-pack completion or human musical/timing approval is claimed.

Private raw logs, live-verification JSON and screenshot are retained in the originating task's `work/audio-atlas-2026-09-27/` evidence folder. Runtime media, transcripts and absolute workstation configuration remain outside source control. Shared desktop service was not restarted; the updated API/UI were exercised on a task-owned loopback server at port 19873 with publication/mint paths isolated. The existing desktop needs a normal relaunch to load new server code.

## Continuation — full music profile and inventory

This section supersedes earlier unsupported-Beat/CLAP and pending-index statements while preserving their history. Latest full profile `af324ed0-1e0e-40e3-abd2-92f68c5c95b0`:61.5496117 seconds,489 words,486 beats,122 downbeats,120medianBPM,25 CLAP windows. All13 original/preserved source hashes match. ResultSHA `90a4557ddfa56583bd2588e2c99e492774b68efefa2c14c8ea0401835a0e5904`. Beat This final0SHA `8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331`; CLAP model revision `8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a`. Qualified versions are recorded separately. This is one observed local execution, not a general performance claim.

Current checks:18/18 focused Atlas/inventory,4/4 DSP,14/14 liveAPI,54/54 Overcard,build and build-receipt pass. The supervised full repository run completed in 223.11 seconds with 2428 pass/11 fail (2439 total), in the same 11 named areas above. No clean pre-change replay establishes their origin; no out-of-scope repairs were made. A preceding sandboxed run stalled in existing service-test cleanup; its exact process group was terminated and verified absent before the one bounded rerun. Supervisor cap 600 seconds, no automatic retries. The owned suite and model-worker PIDs were absent afterward.

Final frontend semanticSHA `sha256:0fcec1e8dd12870259535aebe76212e8d292dab808f2dc8de75858a187c445ce`. A later CLI-only correction-JSON parser and help update passes syntax checking; service correction behavior retains focused coverage. Lexical results point to the separate acoustic query, rather than claiming no acoustic support.

Inventory:200 songs,61readableWAV,199readableMP3,137completeMP3stemrole sets,0 partial. Brave Tongues: WAVmissing,MP3available,12/12MP3roles. Gnow Her: allthreeavailable,9/9roles despite differing numeric filename prefixes. Missing means absent in the explicitly bounded path search, not a whole-disk absence claim. Full decode/quality/losslessness is not certified by badges.

Browser: both song examples and totals verified; legacy completeness-report omissions filled by canonical song IDs without fabricated scores. Full Atlas coverage/rhythm summary and stereo vocal waveform rendered; the source sought to27.24 seconds, playback advanced to39 seconds and paused. The real form appended a single attributed text-comparison needs_review event for word16, preserving original output. CLAP spoken-voice search visibly returned30,60and70 second windows with cosine0.364/0.343/0.343. No model observation was accepted as human reviewed.

Second Brain recovered for bounded health/read operations. Owner protocol_catalog dry-run/apply/check indexed the README and test-song review; exact README API readback equals source. Grounding/Agent Start epoch3 presentation/acknowledgement receipts were saved through their owner and read back. No global refresh, model rerun, publication, service-fleet restart or Canon promotion.

Remaining: required native Electron smoke and repository-wide failures block the completion commit; the broader pack still lacks phonemes, syllables, notes, diarization and open-ended semantic narration. Human musical/timing review remains pending. The local preview is a review surface, not a desktop release.
