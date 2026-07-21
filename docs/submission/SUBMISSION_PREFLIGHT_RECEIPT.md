# Submission preflight receipt

Status date: 2026-07-21

The release bundle contains the machine-readable receipt with final source commit, package archive hash, video hash, and validation timestamps. `JUDGE_PACKAGE_MANIFEST.json` inside the generated judge source directory pins every included source file.

## Required release checks

| Check | Required result |
| --- | --- |
| Clean install from copied judge source | pass |
| `npm audit` | 0 known vulnerabilities |
| Production build | pass |
| Production build semantic receipt | `ok: true` |
| Focused judge suite | 24 passed, 0 failed |
| Judge package preflight | `ok: true`, 0 failures |
| Bounded HTTP health check | 200 / healthy |
| Public-safe Tarot route | 200 / Hapa Avatar Builder HTML |

The release process must stop rather than publish a package if any required result changes. This receipt is deliberately bounded; it does not imply internet-scale peer reachability, a full historical test rerun, or inclusion of the operator's private Hapa world.

The silent HyperFrames artifact, script, lint report, and layout inspection are retained as production evidence only. They are not the uploaded YouTube demo and are not required to build, run, test, or submit the project.
