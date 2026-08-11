# Echo Director Track Selection Repair

## Objective

Keep the operator's chosen Echo Album track authoritative while its Director timeline and newest saved cut hydrate.

## Evidence inspected

- The live canonical Builder at `http://127.0.0.1:5178/` and its 157-project Director Workbench roster.
- `HapaEchosView` selection, detail hydration, roster refresh, and newest-cut effects.
- The bounded Director detail API for Blue and Watermelon Honey, Due.
- Existing Echo album navigation and Director preview runtime tests.

## Learning delta

- What worked: the existing roster, bounded detail endpoint, saved-cut selector, and preview runtime all returned valid track-scoped data.
- What was noise: the project media and cut payloads were not missing; replacing the player or regenerating cuts would not address the navigation failure.
- What was misunderstood: track identity was treated as the result of a heavy detail request instead of immediate operator intent. A timeout or superseded request therefore left the first roster entry authoritative.
- What changed: clicks now commit track identity before hydration, stale completions cannot overwrite a newer click, background roster refresh preserves the current valid identity, and newest-cut hydration waits for base track detail.
- Reusable guardrail: selection identity must remain independent from payload readiness. Loading and failure states may change available detail, but may not silently change the operator's selected track.

## Reuse candidate

This is a Lesson Card candidate for async collection/detail workbenches: **commit intent first; hydrate detail second; never use load success as selection authority**. The attributed source is the Codex repair turn dated 2026-08-10.

## Verification

- Focused navigation, Director preview runtime, and Echo API payload suites: 31/31 passed.
- Production delivery build: passed.
- Live canonical UI: after a cold reload, switching from the initial track to `90s Nerd` selected the new row immediately, kept it selected through hydration, and opened `90s Nerd Blueprint`.
- Repository-wide suite: 1,710 passed and 2 unrelated known release-evidence failures remained. The same stale transition-validation digest and stale Record Garden verification ledger are documented in the 2026-08-03 Human Enricher audit; neither failure exercises Echo track navigation.
