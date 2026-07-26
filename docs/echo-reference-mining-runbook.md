# Echo Album Reference Mining Runbook

This runbook operates the local-first Echo Album reference system in Hapa Avatar Builder. It does not authorize public activation, canon promotion, paid external research, minting, publication, commerce, or ownership transfer.

## Scope policy

- Current production scope is the complete album: every current song is a mining target and a possible reference source.
- The former 25-song pilot is retired by operator decision. Do not use it as a sampling boundary. A historical reproduction may be dry-run for regression only, but it must not replace the all-song result.
- A one-song run means “recompute this target against every other current album source,” not “analyze this song in isolation.”
- Contributions are local or invited, append-only, shared by default, non-canon, and Human-reviewed.

## Status vocabulary

- `proposed`: machine or contributor candidate; not approved.
- `pending-review`: queued for a Human decision.
- `approved`: local Human approval for the exact revision only.
- `challenged`, `rejected`, `superseded`, `withdrawn`: append-only lifecycle states.
- `unresolved`: a preserved evidence gap, not a negative finding.
- `exploratory-draft`: unapproved content explicitly enabled for private/local comparison.
- `canon` and `public`: separate Human-authority gates; neither follows from approval.

## Prepare the corpus

1. Verify each song has a stable ID, title, track number, lyric status, and lyric text in `data/hapa-songs-store.json`.
2. Preserve source text. Corrections create new source/store history; never rewrite a mining receipt.
3. Supply line or word timings when available. Untimed lyrics use line/section fallback.
4. Validate legacy connectors, contextual layers, catalog citations, and graph edges. Unmapped legacy IDs must remain explicit.
5. Keep private clues out of the song source. Submit them through the clue/contribution flow with private visibility.

## Refresh context packs

Reference discovery has three evidence lanes. Do not collapse them:

1. **Curated/source-backed reference activations** load a named work, person, place, history, or technical concept. A distinctive alias or a corroborated reference-specific signal cluster is required.
2. **Album-internal motif routes** compare repeated lyric language across songs. They support navigation and contrast, not a claim that one song cites another.
3. **Unresolved/private clues** retain phonetic, orthographic, personal, or ambiguous leads until better context arrives.

Refresh the layers in this order:

```sh
npm run echo:references:apply
npm run echo:references:hidden:apply
npm run echo:references:context:apply
```

The base refresh preserves catalog entries, connectors, and contextual layers owned by later enrichment packs. The explicit order is still useful because it makes the run receipts and backups easy to audit.

The Expansion UI context pack is source code in `src/domain/echo-expansion-context-pack.js`. Its entries carry:

- distinctive lyric signals;
- public/source context or an explicit conversation-grounded/private source label;
- themes and operational mechanics;
- provenance and source pointers.

The deterministic miner imports that payload into plural proposed interpretations. It records what matched, what context becomes available, what story or mechanic may be imported, and what remains unproven. It never promotes authorial intent, public visibility, approval, or canon.

After occurrence activation, the bounded constellation pass connects source-backed Reference Cards to one another. It does not lower the activation threshold. It requires shared-song evidence plus recurrence, lyric proximity with a shared theme, or a shared mechanic. Every edge retains:

- shared song IDs;
- closest lyric-line pairs and their distance;
- shared themes and mechanics;
- independent evidence-channel count;
- detector reason codes.

Each source Card keeps only its strongest bounded neighborhood. Connected groups of three or more are projected as proposed Reference Constellations for Expansion UI browsing.

## Preview and dry-run

```sh
npm run echo:references:batch -- preview
npm run echo:references:mine
npm run echo:references:mine -- --song=<stable-song-id>
```

Dry-run must not change `latest.json`, card revisions, decisions, graph authority, public state, or canon. Review packet/run/graph digests, pair scope, invalid cards, failures, costs, and custody in the normalized receipt.

## Run one song

```sh
npm run echo:references:mine -- --song=<stable-song-id>
```

The receipt must show the complete album as sources and `album-song-count - 1` eligible pairs for one target. Apply from the local Echos UI only after preview. A selected-song apply recompiles the affected graph region and retains unrelated cards.

## Run the complete album

```sh
npm run echo:references:mine:apply
npm run echo:references:materialize
```

Materialization:

- persists the deterministic all-song run;
- migrates every valid card into the append-only revision ledger;
- emits approved-only director scripts;
- emits explicitly non-canon exploratory director scripts;
- writes observability and a materialization report.

Rerun materialization once. A healthy replay reports zero new revisions and every existing revision as replayed.

## Plan FLUX.2 Reference Card art

Reference artwork is a separate proposal lane. It does not change the lyric, Reference Card, interpretation status, public visibility, canon, mint, or publication state.

```sh
npm run echo:reference-art:plan
npm run echo:reference-art:plan -- --apply
npm run echo:reference-art:status
```

Planning reads the latest Reference Atlas run and includes only source-backed, non-private `reference:*` Cards with lyric occurrences. It compiles:

- the strongest lyric occurrence;
- source context, themes, and mechanics;
- up to four strongest Reference Constellation neighbors;
- a deterministic Hapa NeoBlade palette;
- transformative-use, typography, truth, and review constraints;
- a fixed prompt hash and source run/graph hashes.

The default is the fixed `flux-2-max` endpoint at 1536×2048. A plan performs zero provider calls.

To dispatch a deliberately bounded paid batch:

```sh
BFL_API_KEY=... npm run echo:reference-art:run -- --limit 1 --apply --confirm-cost
```

Both flags are required. The key remains process-local. The adapter accepts only official BFL API hosts, follows the provider-returned polling URL, accepts signed `delivery.*.bfl.ai` image URLs, downloads them immediately, verifies the media boundary, hashes the bytes, and stores only local artifacts plus a provider receipt.

Successful jobs stop at `review-required`. Accept or reject an exact artifact:

```sh
npm run echo:reference-art:review -- \
  --job <job-id> \
  --accept \
  --reviewer <human-id> \
  --rationale "Symbols and mechanics read clearly." \
  --apply
```

Reject with `--reject`. Review never promotes canon or mints the image.

## Queue, pause, resume, and retry

```sh
npm run echo:references:batch -- create
npm run echo:references:batch -- run --queue=<queue-id> --max-songs=20
npm run echo:references:batch -- status --queue=<queue-id>
npm run echo:references:batch -- resume --queue=<queue-id>
npm run echo:references:batch -- retry --queue=<queue-id> --song=<failed-song-id>
```

Budget stops pause new work and preserve completed receipts. A failed song stays isolated. Retry only failed targets; completed jobs must not gain another attempt or duplicate cards/edges.

## Submit and manage clues

In Reference Atlas, select the song/card/unresolved node and choose **Add clue**.

1. Label candidate namespaces.
2. Correct the lyric span if necessary.
3. Preview affected songs, pair count, and local cost.
4. Submit as shared or private.
5. Inspect the post-run created/removed/updated/reweighted/merged/invalidated diff.

A clue is a Human hint—not evidence, approval, public data, or canon. Correct or withdraw it with a new lifecycle event; historical outcomes remain.

## Review Reference Cards

Use Review mode and the evidence inspector. Check:

- lyric observations versus source facts and inference;
- citations, freshness, availability, safe excerpt, and rights;
- competing interpretations, confidence, and caveats;
- prior revisions and decisions;
- affected songs, graph paths, and director packets;
- private-clue and visibility state.

Approve, reject, reweight, defer, merge, split, or request more research with a reason. Bulk review is a plan only until every card passes the same evidence/privacy checks. Never add public or canon fields to a review action.

## Resolve duplicate entities

Classify a match as same entity, related entity, homonym, adaptation, alias, translation, or unresolved possible match. Human merge creates redirects from prior IDs and preserves occurrence counts. Split/reverse creates another event and restores prior entities. Automated clustering cannot override a Human lock.

## Safe downstream use

- Avatar Mind, screenplay, and director projections default to approved exact revisions.
- Unapproved candidates enter only an explicitly labeled exploratory draft.
- Private clues are excluded.
- Packets carry evidence class, caveats, provenance, approval, and revision.
- Director instructions may use thematic, mechanical, and emotional insight but may not claim authorial intent or unsupported canon.
- Withdrawal produces a downstream impact notice.

## Troubleshooting and recovery

- **Missing lyrics:** mark the song failed; correct the source packet; create a new queue/run.
- **Missing timings:** use line fallback; record a Human timing correction instead of rewriting a cue.
- **Unresolved source:** keep the node open with attempted searches; never fabricate a citation.
- **Blocked/stale citation:** quarantine or defer it; do not approve the claim until policy passes.
- **Budget stop:** resume the same queue; confirm completed attempts did not increment.
- **Graph conflict:** inspect the semantic diff and entity-resolution history; reverse with a new event.
- **Bad revision:** rollback by creating a new child revision pointing to the desired historical content.
- **Private-data mistake:** withdraw the contribution, preserve the audit event, and verify public/approved projections are empty.
- **Run interrupted before apply:** repeat dry-run. Deterministic packet/config inputs should produce the same receipt.

## Contributor quickstart

Run the focused contracts and production build:

```sh
node --test \
  tests/echo-reference-mining.test.mjs \
  tests/echo-reference-constellations.test.mjs \
  tests/echo-reference-explorer-ui.test.mjs \
  tests/echo-expansion-context-pack.test.mjs \
  tests/echo-reference-card-art.test.mjs \
  tests/flux2-reference-art-adapter.test.mjs \
  tests/hapa-reference-card.test.mjs
npm run build
```

When adding a detector:

1. Give it a stable detector ID and namespace.
2. Emit matched spans, raw/normalized score, rationale, evidence class, and provenance.
3. Keep low-confidence output unresolved.
4. Add a deterministic fixture, false-positive case, all-song/source-scope test, and no-authority assertion.

Detector hygiene requirements:

- Ignore `[Verse]`, `[Chorus]`, `[Break]`, and similar section labels as lyric evidence while retaining their source line numbers.
- A short or common capitalized word is a motif candidate, not automatically a person, title, or franchise.
- A multilingual route requires different surface-language terms; repeating `light` in two songs is not multilingual evidence.
- Phonetic matching remains unresolved and must reject ordinary inflection/morphology.
- Catalog activation uses the curated signal lexicon, not unrestricted fuzzy matching against every title or traversal term.
- Store the context delta—surface reading, source context, thematic shift, narrative function, and candidate mechanic—not only the matched label.

When adding a source adapter:

1. Enforce URL allow/deny policy before retrieval.
2. Fail closed on blocked, stale, ambiguous, injected, credential-bearing, executable, or private data.
3. Store a retrieval receipt and rights-safe excerpt (maximum 25 words).
4. Add offline/network-failure, privacy, malicious-source, freshness, and citation-pointer fixtures.

## Recovery drill

Quarterly, use a temporary store to:

1. create a three-song queue;
2. pause after one song;
3. inject one isolated failure;
4. resume, retry the failed song, and complete;
5. apply and materialize twice;
6. verify zero duplicated jobs/cards/edges/revisions;
7. withdraw one clue and one card;
8. confirm downstream impact notices and zero private content in metrics.
