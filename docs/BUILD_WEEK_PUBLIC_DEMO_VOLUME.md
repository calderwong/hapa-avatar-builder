# Build Week public demo volume

## Objective

Ship enough attributable Hapa Avatar Builder material for a public reviewer to understand the product without publishing the complete local roster.

## Evidence inspected

- The canonical Avatar, Item, Inventory, Tarot, and Song store schemas.
- The Red, Blue, and Green profile loadout summaries.
- The canonical `codex-build-week-2026` Tarot Set and all 16 member Cards.
- The existing public-package exclusions and Build Week claim boundary.

## Reuse decision

- Reuse the exact 16-card Build Week Wisdom Set, its public custody receipts, Turn lineage metadata, and generated proposal images.
- Reuse compact versions of the 18 Protocol/Skill Cards required by the RGB profiles.
- Adapt Red, Blue, and Green into small public Avatar records with repository-authored abstract portraits and one Echo State preview Song Card each.
- Leave the complete local Avatar, Tarot, Item, Song, media, journal, relationship, and lore stores alone.

## Learning delta

An empty compile fixture proved package safety but made the product look uninhabited. A useful public seed needs three separate boundaries: a small sampled catalog, exact complete sets that are part of the submission, and dependency Cards required for visible profiles. Counting these separately prevents a `4–6 per family` sampling rule from accidentally truncating a complete Set or breaking profile references.

## Guardrails

- Sample counts never truncate a named complete Set.
- Profile-required Cards may exceed the sample count, but each must be referenced by a shipped public profile.
- Tracked demo stores contain no absolute paths, credentials, private keys, source audio, private lyrics, or unrelated roster records.
- Generated Wisdom Set images remain visibly marked as review-stage proposals: not identity truth, mint, canon, or commerce eligibility.
- Clean checkouts read the tracked seed only when ignored local runtime stores are absent; writes still target `data/`.

## Reusable candidates

- Decision Card: **Complete Set Beats Sample Limit**.
- Protocol Card: **Public Demo Dependency Closure**.
- Skill Card: **Bounded Fixture Extraction**.
