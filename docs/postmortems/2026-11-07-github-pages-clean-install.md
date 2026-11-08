# GitHub Pages clean-install failure — November 7, 2026

Calder reported the failed Pages notification after local Builder source was
published at `fe75453`. The affected run was
[42430737507](https://github.com/calderwong/hapa-avatar-builder/actions/runs/42430737507).

## Confirmed cause

The Ubuntu runner completed checkout and Node setup, then failed at `npm ci`.
The build, artifact upload and deployment steps never ran. npm 10.9.9 reported
`Missing: @emnapi/runtime@1.11.3 from lock file`.

The lock contained `@napi-rs/wasm-runtime` with a peer dependency on
`@emnapi/runtime` but lacked the corresponding top-level package entry. An
existing nested runtime for the Rolldown WASM binding did not satisfy that
location. This is an incomplete dependency lock, not an Audio Atlas analysis
failure or a failure of the Pages deploy permission.

The preceding local Vite build reused already-installed dependencies. Its
successful compilation was valid but did not verify a fresh checkout's install.
Reporting that build without following the remote run left the deployment
failure undiscovered until Calder supplied the notification.

## Repair and evidence

Regenerated the lock with npm 10.9.9 in an isolated manifest-only workspace using
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.
The missing runtime is the sole added package; existing package versions and
root dependency declarations are unchanged. npm also normalized peer flags.

A fresh `npm ci --ignore-scripts --no-audit --no-fund` installed 272 packages
successfully with npm 10.9.9. Lifecycle scripts were disabled for this local
lock-resolution check; the existing GitHub workflow runs the full `npm ci`,
build and deploy sequence on Ubuntu/Node 22. No installed application packages,
private stores, model runtimes or running services were replaced.

## Reuse and remaining verification boundary

Reuse the existing strict clean-install workflow; do not replace `npm ci` with
an install that silently repairs the lock in CI. Compilation with an existing
dependency directory is not clean-install evidence. After a deployment fix,
verify the exact new run's install, build and deployment outcomes separately.
The original failed run remains historical evidence; it is not relabeled a pass.
