# Hapa Avatar Agent Contract

The local agent contract lives at:

```txt
data/avatar-agent-contract.json
```

It defines two Hapa Avatar agents:

- `hapa-avatar-genesis`
- `hapa-avatar-journal-maintenance`

Both agents declare Codex and Hermes harness bindings, persistence targets, output expectations, and the shared Avatar Mind classification vocabulary.

## Red Benchmark Gate

Before a Genesis agent establishes a new avatar, it must review Red's completed Mind:

```bash
node cli/avatar-builder.mjs mind red-reaper --json
```

The agent must inspect:

- `personaAnchor`
- `selfKnowledge`
- `relationships`
- `contextMap`
- `memoryLedger`
- `journal`
- disputed/source-integrity entries

Red is the local quality bar for how a generated avatar should separate hard canon, soft canon, perspective, generated synthesis, and disputed source material.

## Blue Benchmark Run

Blue is the first Genesis follow-up benchmark after Red. The expected workflow is:

1. Read Red's Mind benchmark.
2. Read Blue's Character Sheet and media intelligence evidence.
3. Generate a classified Blue Mind patch.
4. Preserve source uncertainty and media gaps.
5. Verify through UI, API, and CLI.

## Persistence

Avatar Builder remains the local source writer for `data/avatar-store.json`. Subscriber/projection targets are:

- `hapa-second-brain`
- `hapa-wiki`
- `hapa-atlas`
- `hapa-overwind`

The contract uses Overwind-compatible entity names: `agent_archetype`, `prompt_contract`, `schema`, `harness`, and `persistence_target`.
