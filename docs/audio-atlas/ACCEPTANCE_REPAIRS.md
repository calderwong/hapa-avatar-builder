# Repository acceptance repair checkpoint — 2026-09-27

Status: three original failing checks repaired; remaining acceptance still open.
Source: Audio Atlas gap goal, epic `audio-atlas-gap-closure-20260927`.

The planned correction-lineage card was not started. Automatic approval review
rejected moving it to In Progress while correction-query remains in Review.
The dependency exception question is pending with Calder; no indirect bypass
was attempted. Work continued on independent acceptance cards.

## Repairs and evidence

- `atlas-gap-test-genesis`: a hard-coded74-Avatar count was stale; the canonical
  store has75. The test now checks the actual unique Avatar IDs, requires the
  canonical populated store, accounts for every ID exactly once, and verifies
  both authoritative stores remain byte-identical in dry run. Existing lineage,
  unresolved-selection and existing-choice preservation assertions remain.
  One real dry-run integration test passes.
- `atlas-gap-test-reference-ui`: the shared human/agent proposal editor now says
  Edit rationale. The test used obsolete wording. It now checks the current
  action plus the selected Card ID, existing rationale, controlled field and save
  action; no source UI was changed.
- `atlas-gap-test-tarot-hold`: a blanket ban on black fill also rejected the valid
  opacity underlay of a successful composition. The repaired check executes the
  actual draw function against instrumented contexts for compilation wait, media
  wait, draw exception, held result and success. Failure paths draw the previous
  canvas without clearing; success retains the intentional underlay and new frame.
  This is a function-level proof, not a native pixel-capture claim. Existing
  three-surface pool/handoff checks remain.
- `atlas-gap-test-hf-offline`: the source assertion now recognizes the supplied
  admission-aware expectation function. Continuing that test exposed another
  actual prerequisite: the local HyperFrames CLI is absent. The test still fails.
  No mock, skip, network install or replacement renderer was substituted.

The combined Reference/Tarot/HyperFrames/pixel-acceptance run has39passes/1failure;
with the Genesis test,40 distinct checks pass and1fails. Only tests changed.
The prior application build remains applicable; no broad suite, native smoke or
new render was repeated. Do not report that all repository failures are closed.

## Runtime prerequisite

The owner resolver checks HYPERFRAMES_CLI, canonical node_modules and the existing
npm execution cache. No usable installation was found there or on PATH; checked
Music Viz, Design System and Hapa Video sibling roots also had no installation.
The prior deferred-media-export postmortem records HyperFrames0.7.66. Restoring
a qualified local runtime is required before the offline acceptance check can
pass. The original phone-package and shader-packaging failures may share that
prerequisite, but that has not been independently proven in this checkpoint.

## Process and preservation boundary

Genesis uses the existing file-based dry-run script, never --apply; inspected
imports have no further process creation. Its direct child has a60-second
timeout. The HyperFrames --print-path probe exits before its renderer spawn path.
No Electron/browser capture script ran. Targeted tests used one Node test worker
at a time with NODE_OPTIONS removed. Both probe child handles are terminal and
matching processes are absent. Source media and Avatar/Song stores were unchanged.

Evidence folder: current task's `work/audio-atlas-2026-09-27/acceptance-repairs/`.
Full repository acceptance, native smoke and the required focused completion
commit remain open; code remains uncommitted under the owning completion gate.
