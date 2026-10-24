# Motion Avatar Sources — prototype intake

## Operator flow

Open an Avatar in **Builder**, then use **Motion Avatar Sources → Add source images**, or drop images into that section. It appears above **3D Avatar Rig** and is separate from dossier, concept art, existing videos and finished 3D models. Clear front-facing art with an unobstructed face is a useful first candidate. Transparent backgrounds can help but are not required for intake.

Wait for the Avatar save queue to finish syncing, then give the agent the Avatar name (or exact ID). Multiple sources are supported; drag to reorder the preferred source first. Existing inspector, preview and deletion controls apply. This optional section does not change completeness or generate healing tasks.

This is intake only: adding an image does not start generation, spend money, approve a rig, or certify audio control.

## Shared contract and pickup

The file remains `type: image`; its distinct media role is `requirementId: motion_avatar_source`. Builder remains the source owner. The existing domain attachment and move paths reject non-image inputs for this role. Legacy or externally supplied malformed records are excluded from the motion-source export if their type is not image.

UI attach-pack preview, API, and CLI share `createAttachPack` in `src/domain/avatar.js`. The additive `motionAvatarSources` array contains `hapa.motion-avatar-source.v1` entries with exact `avatarCardId`, `assetId`, `slotId`, source URI/URI information, original filename, source metadata/provenance, section order, and preferred/default flag. Each entry has status `awaiting-rig-review`. No rig state is inferred from filenames or generic motion tags.

```sh
node cli/avatar-builder.mjs list --json
node cli/avatar-builder.mjs attach '<avatar-id>' --target motion-avatar --json
```

API: `GET /api/avatars/<avatar-id>/attach?target=motion-avatar` on the running Builder origin. Read `motionAvatarSources`, not generic `baseReferences`. The API must be restarted after domain changes; the web bundle must be rebuilt after UI changes.

Resolve `/media/...` against the Builder origin. Confirm the original bytes are retrievable before rigging. `uriInfo` explicitly distinguishes local media from compacted inline data; a compacted placeholder is not a downloadable image. Recover inline bytes through the owning Avatar read interface if necessary, or ask the operator to retry upload/sync. Preserve original bytes and metadata; do not replace the source with a prepared crop or a derived rig.

The downstream rigging manifest should bind the exact Avatar ID + source asset ID + source-byte digest, preparation decisions, rig recipe/version, derived files and test evidence. Visual review, rig validation, motion tests and audio tests remain separate later stages. No background pickup worker is installed by this change.

## Implementation reflection and evidence

Source: Calder's 2026-10-15 Codex request in the Hapa Avatar Player takeover chat (task 01a141eb-6f00-7b21-8fd3-98c1c2425f3c). Actor: current Codex instance, no borrowed Avatar identity. Context epoch 2 freshly read Shared Grounding, Agent Start, Hapa Protocol Standards and the canonical Builder instructions before the write batch.

Reused the existing upload, persistence, section ordering, inspector and attach-pack paths. Extended the shared requirement model with an optional role instead of creating another store or rigging service. The distinction that matters is purpose, not file format: images remain images while the role makes them discoverable for a specific pipeline.

Initial UI inspection exposed two issues corrected before handoff: the large 3D panel buried the new intake, and a broad text replacement had changed a similar scene-panel label instead of the Avatar label. The source panel now precedes 3D, and scene code is unchanged. Guardrail: scope component edits and verify the actual rendered panel, rather than relying on a successful bundle alone.

Reusable Lesson Card / Flow-explainer candidate: carry source identity through optional workflow-specific media roles; review and readiness are separate from an asset merely being attached. Second Brain indexing remains pending because its owner service was unavailable during this pickup; the owning repository document is the durable current record.

Verification results are recorded below after the final checks.

### Verification outcome — 2026-10-15

- Production build passed; existing bundle-size advisory remains.
- Avatar domain + motion-source checks: 36 passed, including a real CLI read of an isolated saved fixture.
- Overcard checks: 54 passed.
- Live UI: new section visible above 3D, image-only picker enabled and successfully opened with multiple-file support; existing completed Red/Reaper still shows 43/43. No source image was added to the user's Avatars during this check.
- Live API after refreshing the existing canonical service: Red/Reaper attach pack contains `motionAvatarSources: []` and the exact Avatar ID. The empty list is expected until a source is added.
- Browser Tarot smoke: existing 3D scene and controls rendered. The old Electron automation smoke was not run; browser interactions used the supported CUA path. A subsequent Tarot navigation timed out; a fresh Builder tab was verified and left available. This is not a claim of full Tarot interaction acceptance.
- Full repository suite: 2,936 passed, 10 failed, 1 skipped. Nine failures are in separate Echo data/UI/API checks (project durations, missing director cuts, editing-lock source assertion, shader/catalog/frame contracts, missing manifests/rankings, and summary payload size). No clean-baseline rerun was performed. The tenth is the album-wide hydration compiler, explicitly terminated after six minutes; it is incomplete evidence, not a feature regression.
- First broad attempt was sandbox-restricted and several existing test cleanup paths stalled after server startup failure. Its exact workers were stopped before the local-access retry. No new process-spawning implementation was added. Build uses one Vite child; scoped CLI fixture uses one timeout-bounded child; the repository suite uses four test workers plus existing owned children.
- Because broad verification did not pass, the repository's completion-commit gate remains unmet: scoped changes are intentionally uncommitted. The built local intake is available for the operator's requested source-image trial. No GitHub mutation was made.
