# Codex Build Week Tarot Set

`Codex Build Week` is a 16-Card judge/demo Set in the Avatar Builder Tarot Library and 3D Tarot Draw. It distills attributed Codex Turns from July 13 through July 20, 2026 into four equal Card families:

| Family | Cards |
| --- | --- |
| Turn | The Wisdom Studio Opens; The Echo Album Forge; The Language Garden; The Identity Forge |
| Skill | Card-Guided Distillation; Render Truth Preflight; Four-Count Scene Reading; The Heuristic Lantern |
| Capability | Novel-Scale Wisdom; Pocket Cinema; The Endless Keyframe Loom; Local Identity Restage |
| Protocol | Bootstrap Without Burden; Pause, Resume, Complete; Proposal Is Not Truth; Raw Turn, Derived Card |

## Mining and curation

The Hapa Turn Miner imported the local Codex corpus before curation. For the local July 13–20 window, the resulting Second Brain projection contains 3,071 attributed Codex Turns across 449 tasks. The current active rollout was intentionally skipped by the miner because it was still mutable.

The Set is a human-curated derived layer, not a replacement for raw Turns. Every Card records one or more `ai_turn:*` IDs, preserves the raw Turn as authoritative, and is registered downstream to `Calder.agents()` in the Second Brain creation graph. The checked-in source manifest is `config/codex-build-week-set.json`.

## Krea 2 / Flux artwork

All 16 primary images were produced through the production `hapa-krea2-identity-node` using its node-owned `build_week_fast` preset, a fixed per-Card seed, and synthetic non-human CC0 fixture inputs. The run reused Calder Wong's existing Build Week operator attestation (`community_noncommercial`); it did not invent a new license decision.

Generated files and the private task receipt remain under ignored runtime storage:

```text
data/media/codex-build-week/cards/
data/media/codex-build-week/krea2-generation-receipt.json
```

The Cards explicitly label each image as an unminted proposal requiring human review. Generated output is not identity truth, publication authorization, canon, or commerce approval.

To reproduce a generation run against an already-running local node:

```bash
node scripts/generate-codex-build-week-card-art.mjs
```

The generator is digest-verifying and idempotent. It refuses to replace an existing divergent result unless the operator explicitly supplies `--force`.

## Durable Card install

Install is separate from generation:

```bash
node scripts/install-codex-build-week-tarot-set.mjs --dry-run
node scripts/install-codex-build-week-tarot-set.mjs
```

Before mutating `data/tarot-store.json`, the installer writes a timestamped copy under `data/backups/`. It then creates or verifies one real append-only Hypercore custody origin per Card, attaches digest-verified media, and writes a merge report under `data/merge-reports/`. Custody does not imply mint, catalog publication, commerce eligibility, or canon.

## Tarot Draw behavior

Tarot Draw now lazy-loads the Tarot store when the 3D experience opens. Only image Cards carrying the explicit `tarot-draw-ready` enrichment tag enter this additional lane, so the existing production-media audit remains strict for all other projections. The Set's curated order is preserved with Turn Cards first, followed by Skill, Capability, and Protocol Cards. Each 3D Card exposes its category, source Turn count, generated image, review state, and custody/provenance fields.

The Card Browser exposes the Set as a first-class **Featured Set**. Selecting **Codex Build Week** loads all 16 Cards, while **Add All 16** places the complete ordered Set on the 3D table. Spaced and hyphenated searches are normalized, so both `Codex Build Week` and `codex-build-week` resolve the Set. Every Browser tile has an explicit **Details** affordance; selecting it populates the Browser detail pane with Set, family, and mined-Turn lineage. **Add & Open 3D Details** then places that Card and opens its in-field detail panel.

The existing in-field **Krea Edit** workflow remains available, allowing judges to select one of these Cards and create a new bounded edit proposal without mutating the mined source Card.

## Verification

The focused contract suite covers manifest balance, source lineage, bounded generation inputs, custody preservation, adapter behavior, and Tarot Krea request semantics. A live demo should additionally verify:

1. Tarot Draw Card Browser's Featured Set control loads all 16 ordered Build Week Cards, and `Add All 16` is available.
2. All 16 generated images return HTTP 200 from `/media/codex-build-week/cards/`.
3. Selecting a Browser tile populates Details with its Set, Turn/Skill/Capability/Protocol label, mined Turn lineage, and summary.
4. Krea Edit shows node-owned presets when the local Krea node is available.
5. No Card is presented as minted, canonical, published, or identity truth.
6. Clearing the Build Week search restores the complete Card Browser library.

## Turn-to-Lore reflection

- **Objective:** turn one bounded week of Codex work into an explorable, attributed Hapa Card Set without replacing the existing 3D cockpit or raw Turn evidence.
- **Evidence inspected:** the refreshed Second Brain Turn corpus, the canonical Tarot store/domain, the running Tarot Draw, the production Krea preset contract, generation digests, Card custody receipts, and the live browser projection.
- **What worked:** extending the existing Tarot projection with one explicit `tarot-draw-ready` lane preserved the cockpit, media audit, and Krea credential boundary. Fixed seeds plus synthetic fixtures produced a coherent visual family quickly.
- **What was noise:** broad media-library counts and title-independent tags were not useful proof that the complete Set was reachable. Set-level result count, explicit Details, and a reversible clear-search check are authoritative UI evidence.
- **What was misunderstood:** the first install created Hypercore origins correctly, but `createTarotCard` stripped their receipts while rebuilding the normalized record. The custody service was not the problem; the Tarot creation projection was. The creation path now preserves the verified receipt, with a regression test.
- **What changed:** Tarot Draw lazy-loads durable Tarot Cards; the Card Browser now exposes the Set as one 16-Card Featured Set with normalized search, Add All, and explicit Details; the Cards retain digest-verified images, ordered priorities, source Turn lineage, and custody; the Krea request builder accepts the truthful `synthetic_nonhuman` basis used for this run.
- **What remains reusable:** the manifest-driven generator and installer can support later mined Sets without copying the 3D UI, node credentials, or Krea preset definitions.
- **New guardrail:** a durable Card install is not complete until the serialized consumer store still contains the custody receipt after every normalization boundary and the consumer UI can recover the whole Set without title-by-title searching. Generation prompts that say “no text” also remain human-review claims, not proof that a diffusion result contains no pseudo-lettering.
- **Promotion candidates:** Skill Card — **Card-Guided Distillation**; Lesson Card — **Receipts Must Survive Projection**; Flow explainer — **Raw Turn → Curated Card → Generated Proposal → Tarot Draw**.

### 3D Details correction

- **Objective:** make every settled Build Week Card open the existing in-field Details panel directly from the 3D table.
- **Evidence inspected:** the live 17-Card scene, the browser-spawn adapter, the shared Details target, and the selected/hovered Card eligibility check.
- **What worked:** the existing target projection and `openDetailTarget` handler already opened the correct panel; they did not need a replacement interaction.
- **What was noise:** image, lineage, and Card normalization were intact and did not explain the missing target.
- **What was misunderstood:** selected-card fallback had been restricted to Forge Cards, so a newly spawned Build Week Card could be selected and settled while exposing no Details target.
- **What changed:** hovered settled Cards still take precedence, then any settled selected Card exposes the same 3D Details target; held, animating, and already-open Cards remain excluded.
- **What remains reusable:** one shared target and panel now cover Browser, Build Week, Forge, and ordinary Tarot Cards.
- **New guardrail:** every new 3D Card ingress must pass the same settled selected/hovered Details-target contract; Card family must not gate basic inspection.
