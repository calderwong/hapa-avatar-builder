# GitHub Pages RGB demo

## Objective

Publish the Hapa Avatar Builder as a GitHub Pages project site with the bounded Red, Blue, and Green public fixtures, then link the live site from the repository README.

## Evidence inspected

- Canonical Avatar Builder ownership and safe-edit guidance in `AGENTS.md`.
- The existing public fixture boundary and Red/Blue/Green records under `fixtures/build-week/judge-data/`.
- The repository-authored portraits and public Wisdom Set assets under `public-static/demo/`.
- The existing `stargateDemo=1` static-data bootstrap in `src/App.jsx` and `src/main.jsx`.
- GitHub's current Pages custom-workflow requirements and Vite's project-site base-path guidance.

## Reuse decision

Reuse the existing Builder UI, public demo bootstrap, RGB fixture records, and curated demo assets. Adapt only the hosting boundary: force public-demo mode in the Pages build, resolve curated assets beneath the project-site base path, and deploy a demo-only static artifact. Leave the local API, private stores, generated media, third-party reference media, desktop shell, and authoring write paths out of the hosted artifact.

## What worked

- The existing public demo data already contained Red (`red-reaper`), Blue (`avatar-2`), Green (`avatar-3`), their public loadouts, and repository-authored portraits.
- A dedicated Vite build flag preserved normal local behavior while producing a project-site-safe bundle.
- Disabling Vite's normal public directory for the Pages build and copying only `public-static/demo/` kept the artifact inside the documented public-safe boundary.

## Noise and correction

- The canonical checkout contained unrelated Echo keyframe edits and tracked GitLab rather than GitHub. The Pages work was isolated in a clean worktree based on `github/main`; none of those unrelated changes were included.
- A general `npm run build` would copy all of `public-static/`, including assets outside the bounded demo. The Pages build now uses an explicit demo-only preparation step.

## Learning delta and guardrail

GitHub project sites need both bundle URLs and data-authored media URLs to honor the repository base path. Future hosted Hapa surfaces should treat static-data URIs as part of deployment configuration, not just Vite's generated asset paths. Pages artifacts must continue to exclude `public-static/media/`, `public-static/sample/`, runtime data, and generated media.

## Verification checkpoint

- `npm run build:pages` produced a 5.1 MB artifact with the repository base path, all three RGB portraits, the complete curated demo directory, and none of `media/`, `sample/`, or `generated/`.
- The Pages-style Electron smoke found Red, Blue, and Green in the expanded public rail, loaded every portrait beneath `/hapa-avatar-builder/demo/`, mounted a nonblank 1096×860 Tarot canvas, and reported 59 Cards with active WebGL draw calls.
- The focused public-demo/runtime suite passed 8 tests; the Overcard suite passed 54 tests; the normal production build and receipt check passed.
- The broader `npm test` was also attempted from the clean public checkout. Tests that require ignored operator stores and generated Echo work failed with missing `data/avatar-store.json`, `data/music-video-projects/`, and other local-only evidence. Two idle Echo subtests were stopped after their child commands and process count were inspected. Private runtime data was deliberately not copied into this public worktree to make unrelated tests pass.
- The full Stargate interaction smoke mounted the hosted scene but its real Card-click assertion did not lift the first Formation Card. The deployment-specific smoke separately proved the public deck and nonblank 3D render; the flaky interaction assertion remains outside this hosting change.

## Reusable candidates

- Decision Card: **Pages Artifact Is a Publication Boundary**.
- Skill Card: **Project-Site-Safe Fixture Assets**.
- Protocol Card: **Demo-Only Public Directory**.

Source lineage: this 2026-07-21 Codex implementation turn; derived notes do not replace the attributed turn.
