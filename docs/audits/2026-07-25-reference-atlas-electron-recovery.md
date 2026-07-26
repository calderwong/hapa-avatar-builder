# Reference Atlas Electron recovery — 2026-07-25

- Objective: restore the Echo Album Reference Atlas in the canonical Electron Builder.
- Evidence inspected: the live `8797` health and reference endpoints, Electron renderer logs and DOM, the current production bundle, the Reference Explorer source, and its focused UI/domain tests.
- What worked: restarting the long-lived launchd API loaded the current reference routes; the renderer then fetched 134 songs and 995 cards.
- What was noise: WebRTC/OpenH264 warnings were unrelated to the Reference Atlas failure.
- What was misunderstood: the visible Atlas tab came from a newer static bundle while the four-day-old server process still held pre-route code in memory.
- What changed: the Lucide `Map` icon import is now aliased to `MapIcon`, preserving the built-in `Map` constructor used by graph layout and timeline grouping. A source regression assertion protects the boundary.
- Reusable outcome: when a desktop tab exists but its API returns `404`, compare the static bundle age with the server process start time before changing routing code.
- Guardrail: icon/component imports must not shadow built-in collection constructors used in the same module.
