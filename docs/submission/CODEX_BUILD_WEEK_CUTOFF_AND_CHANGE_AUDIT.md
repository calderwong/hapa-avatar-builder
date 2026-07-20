# Codex Build Week cutoff and change audit

Audit date: 2026-07-19 (America/Los_Angeles)

## Official event boundary

The official rules define the submission period as:

- **Start:** July 13, 2026 at 9:00 AM Pacific Time
- **End:** July 21, 2026 at 5:00 PM Pacific Time

Sources: [official rules](https://openai.devpost.com/rules), [official schedule](https://openai.devpost.com/details/dates), and [OpenAI Build Week](https://openai.com/build-week/).

The rules permit an existing project only when it is meaningfully extended after the start. Only the new work is eligible for evaluation, so the submission must show the pre-existing foundation and the post-start extension separately.

## Pre-existing foundation

Before the cutoff, Hapa Avatar Builder already included the broader Card system, Avatar construction, media surfaces, the Electron application, and the 3D Tarot Draw experience. The last tracked pre-cutoff commit is:

```text
158fbf30d0e683a2a8498e884fdbd73385b93233
2026-07-04T13:31:19-07:00
chore: remove temporary video ingestion script
```

The first commit after the event started is:

```text
cd393e2873fae80ce2019d9c69012fecb348a0ba
2026-07-13T16:49:33-07:00
Package current Hapa Avatar Builder release for Paramation
```

That commit changes 354 files with 51,014 insertions and 932 deletions, but its own message and tree shape show that it packages a current, already-existing release. It is **not** counted as software created during Build Week.

## Conservative new-work measurement

The cleanest auditable Build Week claim is the focused Stargate line beginning immediately before its first hero commit:

```text
base: 0b793a9aa2b02d7f989735921d83140f37ffc7f2
first: bb93294370bc2d7bf449de7613b6fa6b0e0f6525
head: f10c2f821959efe679c2c3b675438e8082a1d3fd
```

Measured range: `0b793a9..f10c2f8`

| Measure | Audited value |
| --- | ---: |
| Commits | 22 |
| Files changed | 124 |
| Insertions | 19,136 |
| Deletions | 326 |
| Production-code insertions/deletions | 12,525 / 297 |
| Test and proof insertions/deletions | 4,832 / 14 |
| Documentation insertions/deletions | 1,326 / 10 |
| Data and manifest insertions/deletions | 449 / 5 |

This is a **conservative attributable minimum**, not a claim that every eligible change made after July 13 is inside this slice. It deliberately excludes:

- the large post-cutoff package snapshot;
- other post-start Echo/Avatar work outside the focused Stargate lineage;
- uncommitted local work;
- generated media assets stored outside normal repository deployment.

Lines changed are supporting evidence, not a quality metric. The demo should lead with working behavior, provenance, and explicit claim boundaries.

## What the focused line added

1. A high-impact Stargate activation inside the existing Tarot Draw shell.
2. Real, lazy per-Card Hypercore custody with a `card.created` receipt and exact Card ID, core, revision, and digest.
3. Ordered Card formations that derive deterministic private namespaces; order is material, transient camera/phone state is not.
4. A portable Context Card that restores the exact formation while remaining disconnected and withholding secrets and join capability.
5. Human review and mint authority, Overwind acknowledgement, a source-only `.hapaCatalog` projection, and pinned-revision return.
6. Expiring Gate Passes and a signed two-profile local P2P proof over Hyperswarm, Noise, and Protomux.
7. Consented Camera Comment Cards and a Truth Constellation of verification receipts.
8. Context Forge using a real local Ollama model to propose an unminted Card from frozen evidence.
9. A peer-blind Wisdom Council using three independent local-model calls, retaining dissent and returning tradeoffs to the human.
10. Accessibility, launch, asset-boundary, recursive-worker, and Gate Pass proof hardening with incident documentation.

## Claim language

Use:

> Hapa Avatar Builder and Tarot Draw existed before Build Week. During Build Week, Codex and an operator-selected GPT-5.6 Sol session extended that foundation with the 22-commit Stargate reference path.

Do not say that the entire Avatar Builder was built during the competition. Do not turn local proof into an internet-scale claim, custody into canon or ownership, or a local model proposal into an autonomous mint.
