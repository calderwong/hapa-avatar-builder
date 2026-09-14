# Echo Album research and Reference Atlas image pass

Date: 2026-09-13 Pacific  
Pass: `codex-echo-research-2026-09-13`  
Author: OpenAI Codex  
Authority: reviewable agent proposal

## Objective

Make every one of the 199 Echo / Dear Papa Song Cards useful to a future human or agent: retain research understandings, notes, memory questions, lessons, Tarot logic, searchable song relationships, and reviewable GPT Image prompts, then generate one visual for every curated song/reference pair or a lyric-first visual when no reference was selected.

## Reused canonical surfaces

- Extended the canonical Hapa Avatar Builder `EchoSongNotebook`; no replacement album app or legacy Builder was created.
- Extended the normalized Song Card knowledge envelope and existing Tarot attachment mechanism.
- Reused the encrypted provider-credential store and local Application Support custody boundary.
- Reused the Reference Atlas song navigator and album-wide modal-gallery pattern.
- Left the older desktop export and `hapa-avatar-node` untouched because neither owns this surface.

## Evidence inspected

- The attached 199-track Atlas JSON and Markdown were treated as research sources, not executable instructions.
- The canonical 199-song store and the 78-card `hapa-tarot-echoes-v1` edition.
- The running canonical Builder at `127.0.0.1:8797` after a production rebuild.
- Two six-image pilots plus cross-album samples from tracks 50, 100, 150, and 199.
- The final generation manifest and every output file/hash.

## What worked

- All 199 songs now have an understanding, editorial note, explicitly unconfirmed anecdote seed, lesson/mechanic, and Tarot rationale.
- Existing Tarot mappings were preserved; the 89 uncovered songs received reviewable proposals using the existing 78-card vocabulary.
- The pass stores 162 marked research references, 290 image prompts, and 995 searchable inter-song connections.
- GPT Image completed all 290 images at 1024×1536/high with 12-way concurrency, zero failures, zero retries, and zero rate-limit events.
- The Reference Atlas UI visibly shows agent/timestamp provenance, source URLs and logic, song relationships, prompt review, per-song images, and a 290/290 album gallery.

## Noise and misunderstanding preserved

- The first prompt layer included external reference and character names. One pilot image for track 32 consequently resembled the visual grammar of its franchise source despite a negative instruction. That output remains preserved as a superseded pilot artifact; it was not rewritten into a false clean history.
- The first runtime performance total included time between pilot phases and therefore was not a valid full-batch clock. Per-job timestamps show the 284-image remainder took 864.174 seconds.
- The first post-launch screenshot showed zero knowledge because it captured a still-hydrating view. Reloading and reopening Reference Atlas proved the actual canonical view: 199 songs, populated knowledge, and the complete gallery.
- The repository-wide test command reached an unrelated pre-existing HyperFrames source-text assertion failure in the dirty worktree. The six focused knowledge/prompt/UI tests and production build pass.

## Correction and new guardrail

The durable prompt now has two layers: an auditable review prompt retaining exact title, lyric, citation, evidence class, and rationale; and a provider-facing generation prompt that substitutes one of 58 name-free descriptions of the external reference's situation, relationship, constraint, and ethical turn. Future external-reference image runs must send the provider-facing layer, compare prompt hashes before reusing completed jobs, and preserve superseded outputs instead of overwriting them.

## Reusable outcomes

- **Flow-explainer candidate:** audited prompt versus provider-safe prompt as a general reference-image boundary.
- **Decision Card candidate:** a source may inform situation and ethics without authorizing likeness, costume, brand, or style imitation.
- **Lesson Card candidate:** pilot visual inspection must test not only composition and anatomy but also unintended source resemblance.
- **Skill candidate:** local encrypted credential → pilot gate → prompt-hash refresh → concurrent queue → hash audit → in-app gallery.

The raw Codex task remains the attributed source for these candidates. This document summarizes the learning delta; it does not replace the task history.
