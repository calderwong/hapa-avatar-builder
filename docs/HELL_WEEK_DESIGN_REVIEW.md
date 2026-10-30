# Hell Week design and verification review — 2026-10-29

Auditor: Codex, Calder's Hell Week integration task. Standard: Neonblade Operator and the owner's CMS collection design guidance. State: locally implemented first pass; broader verification remains red. The October 30 operator-authorized commit policy permits a scoped development commit with those failures recorded; see the final policy correction below.

## Design scorecard

| Surface | A Tokens | B Cards | C Motion | D Operation | E Protocol | Total | Grade |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Builder Hell Week Create lane | 2 | 1 | 1 | 1 | 2 | 7/10 | B — further live qualification needed |

Evidence: `src/components/HellWeekForge.jsx`, `src/components/HellWeekForge.css`, `src/components/HellWeekView.jsx`; browser inspection of the built empty state; separately inspected real generated portrait and owner registration. The existing Dev Proto library remained available. The open operator desktop was not restarted, so this report does not claim a complete native-window interaction acceptance.

- Tokens: uses shared `hapa-panel`, `hapa-card`, `hapa-btn`, semantic token variables, deep neutral backgrounds, gold micro-labels and cyan action accents. CSS derives from the owner palette with fallback values.
- Cards: each planned slot remains visible as waiting, designed, illustrated or saved. Images use a 2:3 uncropped window. Card details expose lore, skills, source quotes, uncertainties and image direction. Semantic claim/desire distinctions are visible. Per-Card updated/owner metadata could be more prominent.
- Motion: no new infinite animation; reduced-motion rule disables animation and transitions. The pipeline uses truthful stage labels rather than pretending every operational state maps onto a visual animation state. Animated motion vocabulary is not fully qualified.
- Operation: document drop/picker, text paste, model controls, free preparation, explicit paid start, pause/resume, counters, errors and saved runs. Inputs/buttons have a minimum 38px height. Selecting/preparing a run reveals its output. Native complete/error/keyboard/mobile interaction coverage still needs a dedicated desktop pass.
- Protocol: in-place workflow/recovery help; separate raw source and generated candidate semantics; explicit desktop-only generation boundary; same engine for IPC and CLI. Browser creation is explicitly disabled when the saved-key bridge is absent.

## Verification

| Check | Result |
| --- | --- |
| Focused generation, registration, existing handoff and responsibility tests | **22 passed**. Includes exact source coverage, branch preservation, binary rejection, raw text retention, one-worker ownership, pause across two resumes, bounded rejection retry, ambiguous-result no-replay, source tamper quarantine, receipt/cursor recovery, owner preflight, custody-before-save and registration reconciliation. |
| Existing Overcard suite | **54 passed**. |
| Production build | **Passed**; existing bundle-size warning retained. |
| Real OpenAI/custody acceptance | **Passed**, one synthetic source, one Card, three paid calls total. No paid retry. Saved Card and illustration inspected. |
| Full repository `npm test` | **3,258 passed / 11 failed / 1 skipped**, 3,270 total. Finished naturally in about 12.8 minutes. The whole-album compiler completed; an attempted bounded-stop inspection found no remaining processes and sent no signals. |
| Existing `smoke:tarot` against the canonical host | **Failed** in Echo preview readiness. It reported a request from local UI port 8807 to API port 8787 rejected by CORS, with no Director project loaded. This is outside the new Hell Week code path. |
| Second Brain scoped protocol index | **Applied and exact readback current** for `hapa-avatar-builder-hell-week-native-v1`; source body SHA-256 `673ec2b591a266c8b3364a81f6a776625882f0882dd72495b1931594b0202e71`. No corpus refresh, inference or sync. |

The full-suite failures occur in `director-plans`, `echo-album-navigation`, `echo-direction-variant-ui`, `echo-isf-album-handoff`, `echo-isf-frame-intent`, `echo-media-api-origin`, `echo-media-preflight`, `echo-playback-media-v2`, `echo-preview-recording`, `echos-api-payload`, and `semantic-media-ranker-v2`. These touch existing Echo/Director source or runtime-data expectations. No clean-baseline rerun was performed; they are outside this change, not a claim that every failure was independently proven pre-existing. Existing uncommitted Campfire/Score Dust changes were preserved.

## Follow-up findings

- **P2:** native full/partial/error and keyboard/mobile acceptance still pending. The already-open desktop shell needs reopening to load the new preload/main handlers; it was left open because it had an existing operator workspace. Evidence: new bridge registrations in `electron/main.cjs`, bridge in `electron/preload.cjs`, browser's explicit bridge-unavailable state.
- **P3:** expose owner/date more prominently in expanded Card details; qualify the complete state in the native shell. Evidence: `HellWeekForge.jsx`, Card copy/detail markup.
- Design Guild board filing remains pending; this owner report is the local review record, not an asserted board event or human acceptance.

## Reuse and learning delta

Reused: Dev Proto's two-pass roles, Builder's existing Hell Week navigation/library, encrypted provider credentials, media owner, Items normalization, origin custody and outbox. Added: complete source-span preparation, OpenAI structured agents, Hapa-directed artwork and resumable native runs.

The live quote mismatch showed why provider receipts should be durable before application validation. A narrow wrapper-normalization correction recovered useful work while retaining an ellipsized quotation as unverified. The local owner timeout also preserved paid results. A second-runner test exposed the need to acquire worker ownership before changing retry state; that guard is now in the shared engine. These are reusable Lesson/Flow candidates grounded in the original Codex task; no Avatar identity or canon adoption is implied.

## Addendum — operator connection-failure recovery

The operator's larger run saved one LEO window before a connection failure with no recorded HTTP response. The old generic error lost the underlying cause. Ten later unauthenticated reachability checks passed. New code persists bounded transport diagnostics and exposes an explicitly acknowledged one-request recovery that archives the original attempt, retains completed work, and pauses before continuing the batch.

The operator approved exactly one uncertain-request retry, then pause. Live recovery returned HTTP 200, saved the second LEO window, retained the first request receipt unchanged and paused. One additional paid request was sent; no Thor or image call ran. The original failed receipt/request remain archived in that private run. The failure is consistent with a transient connection problem; the exact original cause and whether the first uncertain request was billed remain unknown.

Recovery verification: 18 generation/registration tests passed, including explicit billing acknowledgement, duplicate-charge warning, original-attempt preservation, single retry ceiling and post-recovery pause. Production build passed. This does not clear the previously recorded broader release gate or imply the full 85-Card run completed. The existing desktop process needs reopening to load the new main-process diagnostics and recovery handling.

## Addendum — required LEO chunk coverage

A later LEO window returned one preparation for four input chunks. Root cause: the prior array schema permitted omissions even though the prompt requested complete coverage. The validator stopped correctly, but ordinary resumption could not fill missing entries. New requests use required fields keyed by exact chunk IDs. Existing complete arrays remain compatible; duplicate or foreign IDs still block.

A separate, bounded repair requested only three omitted chunks, retained the original prepared chunk and response, and paused. The affected run now has three complete LEO windows; it has not reached Thor or image generation. Twenty generation/registration tests passed, including exact schema requirements, missing-only repair, unchanged original receipts, and no repeated repair of an already completed window. Production build passed. Previously recorded broader release gates remain unresolved.

### Newly received storage requirement

The October 29 Storage Placement and Bounded Working Sets protocol was read after this text-only repair. No media was generated, copied, moved or deleted in this recovery. Full migration/adoption is **pending**: this first-pass engine's private-run PNG retention plus Builder media registration must be reconciled with one authoritative payload reference, owner placement, shared byte reservations and retention rules before claiming compliance for large image batches. Existing artifacts and recovery records remain intact. No external-store migration, storage enforcement, reclaimed capacity or resumed worker is claimed by this note.


### Full-run corrections in progress

The operator subsequently authorized completing the entire saved 85-Card run. All 22 LEO windows completed. New artwork now uses the registered external object store and direct Items references described in HELL_WEEK_BUILDER.md; earlier legacy artwork remains intact. A real external image was visually inspected and registered with custody. New native previews are bounded and visibility-driven.

The third saved Thor design paraphrased all proposed quotations. An evidence-only repair retains that design and selects literal source excerpts. An enum of raw quote strings was rejected by OpenAI because quote characters are not allowed in its strict enum literals. One bounded known-rejection retry established the exact error; the revised excerpt-ID schema succeeded. The rejected requests and original design remain in private receipts. Future Thor responses choose source IDs directly.

26 targeted generation/registration/storage tests pass, including external deduplication, cap/missing-drive/corruption holds, no-copy owner registration, two resumes without image replay, and evidence repair without overwriting the original provider response. Production build passed after bounded previews. The previously documented full-suite/smoke failures still prevent the scoped completion commit; no clean full-repository result is claimed. The full 85-Card acceptance is still in progress at this checkpoint.


### Items attachment correction

A direct owner-store audit found that the first external-image references were silently dropped by the Item normalizer: it recognized media filenames but not the local-file API query route. The earlier mock accepted payloads unchanged and did not catch this. The run paused after image19. Existing image bytes and Card identities/custody were preserved; all existing links were repaired through the owner API, and generation resumed.

The adapter now stores a standard external file URI with a media extension and the external descriptor in preserved metadata. Registration verifies the returned attachment before marking success. Reconciliation preserves operator Card edits and never calls OpenAI. Tests use the actual owner normalizer and cover attachment-loss repair.28 focused tests and the production build pass. Native gallery artwork was visually available after reopening only the desktop shell; the API and separate generation worker were preserved. The 85-Card run continues; previously recorded broad release gates remain unresolved.


### Bounded preview and external-read hold checkpoint

Owner thumbnail delivery passed a live HTTP200/JPEG/hash check. The run reached38 registered Cards and39 committed artwork receipts, with22 LEO windows covering all 85 source chunks exactly once. A local audit verified all 38 saved Card custody records, literal source quotes, external-object references and small preview hashes. Full-run completion remains pending.

External file reads subsequently stalled even in the generation worker and independent bounded probes. The exact OS/drive cause is unresolved. A read timeout now produces a clear held state before paid dispatch; a live retry retained 105 dispatched attempts, buying no replacement response.29 targeted tests pass. The existing broader full-suite/smoke failures still block a completion commit. No full-media SSD fallback, drive repair, security permission expansion or accepted-result deletion occurred.

**Lesson candidate:** an owner-normalized attachment and a matching file reference are not proof of deliverable pixels. Verify the real owner response and the delivered preview separately; preserve original media placement when repairing display. Drive identity/free-space checks likewise do not prove content reads are responsive. These corrections and the initially incomplete mock are retained as learning evidence from Calder's October 29 task, authored by Codex without an adopted Avatar identity.


### Completed large-run acceptance — October 29, 2026

The operator's authorized run finished at 2026-10-30T01:20:11Z (October 29 local time): **85/85 Cards**, all 22 LEO windows, all 85 source chunks prepared exactly once. Final acceptance freshly read and hashed every external original, checked 1024×1536 dimensions, verified every owner attachment/custody record and exact source quote, and verified all local preview digests/source links. There are 85 distinct external PNG objects totaling249,161,467 bytes and 4,362,914 bytes of owner JPEG previews. No internal full-size copy was created for this run. The review gallery reuses existing owner previews; its previously retained 770,162 bytes of preview derivatives remain intact.

The earlier external-read hold recovered without a disk repair or permission change; the saved 39th image was verified and reused. Subsequent local health-check timeouts interrupted Card 61/62 registration. Route-specific diagnostics isolated a read-only owner health probe; independent Node/Electron/curl checks later passed. The registrar now consumes health response bodies and allows one bounded retry of that read-only probe, refusing persistent failure after two reads. Owner mismatch still fails immediately; mutations and paid requests do not inherit automatic retry. The precise transient OS/network cause remains unknown. Registration resumed from saved images, and the run completed without image regeneration.

Final recorded usage estimate: **$4.1668732** (LEO $0.4962, Thor $0.1019082, images $3.568765), based on saved usage and official model prices checkedOctober 29. This is not account billing/credit balance and excludes the archived earlier unknown-outcome LEO attempt.197 dispatches include 194 successful responses, two rejected evidence-schema attempts and one earlier uncertain attempt; 192 was the original plan. All original attempts/repair lineage remain retained.

The final 31 focused recovery/registration/storage tests pass. The production build and 54 Overcard tests passed earlier in this same task; subsequent changes are in the main-process storage/registration modules and their focused tests. The native shell was reopened with the final code and confirmed **Ready for review  / 85 of 85 saved**. The existing API service was retained. Artwork samples from early, middle and later sections were visually inspected; this does not imply human review of every Card.

The earlier recorded 11 full-suite failures and Tarot smoke failure remain outside the Hell Week path; source changes remain uncommitted under the owner's completion rule. Completing this operator run does not clear that broader release gate. Full-resolution delivery through the headless local-file HTTP route also remains unqualified; verified external originals and native/owner previews are usable. No external publication, mint, canon adoption or broad runtime/storage-compliance claim is made.


Final delivery follow-up: after external access recovered, a bounded live GET through the existing headless `/api/local-file` route returned HTTP 200 and the final original's 3,131,806 bytes in 0.03 seconds with the exact saved SHA-256. This supersedes the earlier currently-unqualified delivery checkpoint for that tested route/file. All 85 originals had already passed direct full-byte verification. The earlier transient failure's underlying cause remains unresolved; no restart of the API, disk repair or permission change was required.


## Avatar foundations acceptance — 2026-10-30

The existing intake now exposes an optional searchable roster (77 live owner Avatars), a maximum of eight choices, per-Avatar image preview/selection and explicit text-only mode. Empty selection preserves the original workflow. Native acceptance exercised empty, single and multiple selections, search/removal, Red image + Blue text-only preparation, saved-run snapshots and restart persistence. Editing draft selections did not alter the prepared run. The exact reviewed default asset is retained by ID. No paid generation was launched; existing 85-Card results remained unchanged.

Run foundations and per-Card used-reference roles/reasons are visible alongside existing source evidence. The new controls reuse existing panels, inputs, buttons, colors and the bounded scrolling roster; no new motion or independent generation service was added. 38 focused checks, production build and 54 Overcard checks passed. The required smoke test reached the verified UI endpoint but failed Echo preview readiness; broad suite outcome is recorded in the final owner protocol acceptance note. A first shell launch crashed before feature interaction; reopening directly to the existing Hell Week route recovered. No claim of a resolved OS/Electron root cause or new live image-quality acceptance.

Final full suite: 3,285 pass / 11 fail / one skip (3,297 total, 820.5 s). Broader Echo/Director failures and the Echo preview smoke failure block the owner-required completion commit. No unrelated repairs were attempted.


## Semantic v2 checkpoint — October 30, 2026

User authorization: implement content-driven Card counts and harden the large-document process. Reuse: the existing native Hell Week surface, Avatar selection/snapshots, paid-request transport, registered external object store and custody registrar. V1 remains the owner of existing saved runs; no Card IDs or accepted results were migrated.

Changed: incremental file indexing; semantic preparation; zero/many Card discovery with continuation pages and repeated-source evidence; discovery-only review before artwork; optional image allowance per continuation; bounded Card pages and local cursors; replay-safe accepted-page/image recovery; physical storage accounting. The 96-Card and 600,000-byte limits remain historical v1 behavior only.

Native acceptance: a 1,309,344-byte UTF-8 Markdown file prepared as 108 sections with Red as a frozen foundation, zero provider calls, original file retained in place and no fixed Card count. Both discovery-only and discovery-plus-artwork controls were visible. The optional image input states that it does not limit discovery. Saved-run counts explicitly remain open until discovery finishes. CLI reported the same prepared state. Legacy 85-Card completion remains intact.

Final focused suite: 55 passed, including 105 designs from one section without images, two import/discovery/image recovery boundaries, semantic Avatar pixels and lineage, unknown-call recovery, repeated concepts, non-advancing-page hold, source change, lease, offline/full-store and physical/local-control budgets. Build and 54 shared Overcard checks passed. No live API generation/spend occurred. Broader full-suite and Tarot smoke results are reported separately below; no clean release is implied.

Learning delta: inherited text still said “Forge one useful Hapa Card” while the new page contract allowed many. The v2 prompt now removes that conflicting instruction, and continuity includes the bounded yarn explicitly. UI inspection also found an unstyled image input and a misleading 0/0 saved count before discovery; both were corrected. Physical measurement exposed coarse external allocation/sidecars, now counted instead of describing only text bytes. Lesson/Flow candidate: separate source coverage, semantic concepts, artwork allowances and physical footprint, and test each using the real interface or filesystem where possible.


Final broader verification for semantic v2: `npm test` finished naturally in 790.8 seconds: 3,308 tests, 3,296 passed, 11 failed, one skipped. The same previously observed Echo/Director areas remain red (project structure/cuts, editing hydration, shader handoff, frame/media defaults, static-API routing, reference-loop binding, typed playback, recording readiness, compact summary and semantic ranking). A clean baseline was not established. The final late prompt/control-budget/allocated-block changes were covered by the subsequent 55-test focused pass; the full suite was not repeatedly restarted. Tarot smoke loaded the target with no collected renderer errors but failed Echo preview readiness with no project. Owner-required broader verification is therefore not green: source remains uncommitted, and no push/publication occurred.

The final registered-store preflight passed with 296,484,864 accounted bytes under the existing 2,147,483,648-byte ceiling; the no-spend sample accounted for 29,229,056 bytes including directory/sidecar allocation. The earlier restricted shell could not access Disk Management; the approved read-only check verified the drive without changing mounts, permissions or storage placement. These are measured local results, not a fleet compliance or independent-backup claim.


## Commit policy correction — October 30, 2026

After the implementation handoff, Calder explicitly requested committing this work and changing the repository rules to fix failing tests or commit new work with failures recorded. AGENTS.md now permits scoped development commits despite remaining failures, requires honest verification/causality/follow-up notes, and preserves separate publication/release gates. This supersedes the earlier completion-commit blocker statements above without rewriting their historical evidence.

This Hell Week checkpoint includes the native LEO/Thor pipeline, Avatar foundations, semantic discovery, external storage and recovery hardening, tests and owner documentation. The current evidence remains: 55 focused Hell Week checks and 54 Overcard checks passed; production build and no-spend native/CLI acceptance passed; full suite 3,296 passed / 11 failed / one skipped; Tarot smoke fails Echo preview readiness. The 11 failures are the previously observed Echo/Director checks listed above; no clean-baseline causality proof is claimed. Follow-up: repair those Echo/Director assertions/runtime contracts and Echo preview readiness in their owning scope, then rerun affected broad gates before claiming a clean release. No tests were weakened, unrelated dirty changes were included, or paid calls made for this commit.
