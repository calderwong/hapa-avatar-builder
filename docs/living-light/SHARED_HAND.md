# Living Light Cards in the shared Hand

Status: source checkpoint, 2026-10-07. LL-017/018 and R11 original acceptance remain open. Source task: Calder's execution and pickup in chat `01a1146f-fe68-76b3-a736-473042c3818c`.

The existing native Thing/Journey service owns identity, revisions, notes and Card custody. Builder consumes the installed Overcard package and its existing shared host for pickup and placement. No copied Hand contract, replacement ledger or per-tile renderer is introduced.

From a Thing or saved Journey inspector, **Pick up Card** verifies that exact revision and its Card origin before making it the transient held Card. **Add to Hand** verifies the same source, then uses the package's collection command and the Header's existing `shared` collection-ledger record. Duplicate identity, capacity, missing active Hand and offline state reject visibly. A saved Card and its notes stay with their original owner. Placement is not minting, acknowledged publication or human approval.

**Open held Living Light Card** in the persistent Header returns to its exact native inspector. It does not switch songs, replace the editor draft or start playback. A Journey for another song can be inspected but cannot open into the current song's editor. Echo and its visited Living Light session remain mounted while hidden; their existing power lifecycle pauses audio and disposes the preview driver/runtime. This checkpoint does not prove full App/Tarot round trips, nonzero clock preservation or actual running Desktop delivery.

## API and CLI

Protected `GET /api/echos/living-light/shared-card?kind=thing|journey&id=ID&revision=REV` reads an exact reference and custody state. It creates no Card or authoring database while browsing the source catalog. Protected `POST /api/echos/living-light/shared-card/prepare` accepts only `{kind,id,revision}`; it lazily materializes/verifies only the chosen identity and returns the exact reference. Actor comes from the trusted server context. Notes, local paths and full source parameters are absent from the shared EntityRef.

`node cli/living-light.mjs shared-card --kind thing --id ID --revision REV` uses the protected read. `prepare-shared-card` uses the same custody owner; `--dry-run` only reads. Credentials remain server/CLI environment authority. The shared UI operation has a 30-second bound, aborts when its inspector unmounts, checks connection/Hand again after preparation, and never automatically replays an ambiguous mutation.

The canonical API mount and loopback companion remain working-tree verified. Their source consolidation is still open: catalog/source-evidence adapters import the separate, uncommitted Audio Atlas owner's modules. The prepared Living Light-only API patch is retained in the source task workspace, rather than committing a mount with absent dependencies or sweeping another owner's source into this checkpoint. Electron integration and the running Desktop were not reloaded.

## Verification and corrections

Final affected suite: 113/113 checks, including all 54 existing Overcard checks, seven new shared Card cases, authoring/discussion/library/driver and exact source-local audition/client coverage. Final protected-host suite: 28/28 API/loopback/source-evidence/preparation/CLI checks. Canonical production build passes. These are scoped checks, not a fresh full repository pass or completed album acceptance.

Actual Chrome/WebGL2 with the real isolated shared host verifies Halo Vault pickup/placement, visible duplicate refusal, durable independent note, saved Journey placement/pickup and cross-song editor refusal. Returning from another synthetic work surface preserves the unsaved recipe title and saved note. Final compiled 390×844 proof verifies keyboard return and no horizontal overflow (390/390 hidden surface; 375/375 with the workspace scrollbar); audio stays paused. The fixture mounts the genuine Header, Workspace, package provider and host adapter, not the full App/Tarot surface. No durable screenshot artifact is claimed.

Three native proof owners exited cleanly. API child exit, all three ports, temporary roots, playback leases and process baseline were checked. The final narrow proof took 49.871 seconds; earlier repaired functional proof took 297.978 seconds. Final regression owners took 6.491 and 6.644 seconds; build took 1.383 seconds. Task-local logs and machine receipts retain exact commands and hashes; no generated media, stores or private source payloads enter Git.

The initial test Hand used revision 0, and a preset revision omitted required ancestry. Those fixture errors were repaired without relaxing the contracts. Actual Hand return then exposed a selection race: clearing the old selected ID invalidated the pending exact-read ticket. The Library now leaves the old ID during loading, retains the selection epoch and applies the completed exact response only if still current. The failed probe is retained. The narrow fixture also revealed a four-pixel Header overflow; the dedicated consumer CSS now gives the open action its own bounded row. A failed read used a generic-role selector unsupported by the rendered element; the successful pickup was reconciled from visible DOM state without repeating the mutation.

Reusable Lesson/Decision candidate: owner identity and revision must survive the whole custody → placement → return path, and a helper test cannot establish native selection behavior. Inspect the existing Header ledger ID before adding a consumer; distinguish source birth, placement and publication truth. The original user chat remains the attributed source; this derived lesson is not a fabricated raw Turn or creative acceptance.

Next acceptance work: actual full-App Echo → Preview/Tarot → Hand return, final catalog/parent criteria and dependency closure; separately, applied album stem timing and synchronized painting, Desktop delivery, later immersive work and Calder's creative review.


## Full-app persistent Journey round trip — October 15

The actual 11:23 pilot now completes Add to Hand → reload → Header pickup →
Open held Living Light Card → exact native inspector → saved recipe study.
Journey revision ending f08f7bd4 retains verified custody and the new portal
video; the other two Director cues remain on revision4bce3258. All40 prior
cuts and eight prior revision payloads are unchanged. The old shared journal
prefix and local-operator Hand remain unchanged. No mint or publication.

The test exposed a canonical bootstrap defect: the Header displayed another
operator's Hand but Builder had no eligible active Hand, and the manager hid
Create Personal Hand while any Hand existed. Overcard661c9dd exposes existing
creation for the current operator without merging identities or changing
other collections.106 package checks and7 consumer checks pass. A local
consumer candidate built the tested UI; the original installed package and
release locks were restored. Permanent package adoption remains open, so this
is not a promoted release. See the [evidence, limits and recovery](../postmortems/2026-10-15-living-light-hand-roundtrip.md).

The created Calder Hand uses the unchanged shared schema and remains readable
by the old package. Keep full-App/Tarot/nonzero bookmark and remaining LL-917
criteria separate from this verified same-Echo persisted return.
