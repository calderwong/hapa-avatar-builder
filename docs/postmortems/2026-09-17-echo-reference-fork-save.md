# Echo Reference-loop fork save repair — 2026-09-17

Status: repaired and verified locally; human retry in the Builder remains the
final interaction check.

## Intended and actual outcome

Restore append-only `Save as new cut` for Director cuts containing completed
Reference Card loops without weakening the current-byte eligibility gate.

The save preparation owner now resolves
`/api/echos/reference-media/assets/{image|loop}/{run}/{job}` through the same
immutable local run-manifest binding used by playback and preflight, then stats
the resolved file. Ordinary media, local-file, file URI, absolute path, and Song
Registry handling remain unchanged.

## Evidence

- The failing A Name on the Horizon Reference Forward cut contained 65 media
  shots: 33 Reference and 32 Human-accepted.
- Before repair, all 33 Reference shots failed `missing-source-bytes`; all 32
  Human shots passed.
- A sampled rejected Reference loop existed as a 6,107,052-byte MP4. The save
  validator had treated its `/api/echos/...` URL as a literal filesystem path.
- After repair, the exact saved cut passes: 65 media shots, 44 unique sources,
  verified local bytes, and zero pending evidence.
- Fifty-six focused save, evidence, Reference-library, preflight, preview, and
  API checks pass. Production build and receipt verification pass.

## Learning and guardrail

Playback availability does not prove save-time resolvability. Every durable
API-backed local-media route must share an immutable route-to-file binding with
save, preparation, preflight, and rendering. Never bypass the byte gate or
trust request-supplied availability to repair a resolver mismatch.

The reusable guardrail is a fork-save regression that injects a manifest-bound
Reference resolver, verifies decoded run/job identity, and requires a fresh
filesystem byte receipt before the child cut can be written.

## Remaining scope

The repair validates custody and current bytes; it does not decode the media,
approve the generated loop aesthetically, or certify a final render. The
operator should retry the preserved working cut after the Builder API restarts.
