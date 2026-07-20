# Generated Media / Build Boundary Correction — 2026-07-19

## Objective

Restore fast, repeatable Hapa Avatar Builder build and launch behavior without deleting generated Echo work or weakening source/build truth.

## Evidence inspected

- `public/generated/media-queue` had grown to approximately 2.0 GiB across 852 generated files.
- Vite copied that runtime queue into an approximately 2.1 GiB `dist` tree.
- the certified Echo build then content-hashed the whole served `dist` twice;
- launcher health probes repeatedly requested a freshness calculation on their hot path;
- the Tarot source grew during Build Week, but its approximately 18% source-size increase could not explain minutes of disk-bound preparation.

## Correction

- Generated media custody moves to the external Avatar Builder application-support root; the existing local application URL remains compatible through an API route.
- Vite deploys only `public-static/`, which is restricted to curated source-controlled assets.
- delivery identity covers `dist/index.html` and `dist/assets/**`, not runtime media or optional samples;
- the build receipt verifies post-hash stability with file metadata instead of rereading all bundle bytes;
- ordinary health is a constant-time liveness response, while deep server-source verification is deferred until a certified Echo operation requests it;
- the launcher performs a constant-time receipt check and reuses an existing certified build when the server is absent. Source authors publish intentional changes with one explicit build instead of making every end-user launch walk the source tree.

## Learning delta

What worked: the existing local media server, certified build receipt, and non-destructive launcher are the correct owners to extend. What was noise: repeatedly cold-launching Electron while the filesystem was processing gigabytes. What was misunderstood: placing ignored output below `public/` still makes it deployable input; Git custody and build custody are separate boundaries.

Guardrail: **runtime media must never live beneath a bundler public root, and a liveness probe must never perform deep artifact verification.** Deep verification remains explicit; ordinary launch reuses a certified artifact until deployable source changes.

Candidate Lesson Card: **Keep the Paint Beside the Easel** — Cards may reference large local media while the application bundle contains only the tools and a curated teaching sample.
