# Neonblade+ Style Notes

This app follows the Hapa/Astros operator aesthetic and the local neonblade component language from the existing Hapa avatar sorter.

## Tokens

- Base: `#020617`, `#030712`, `#09111f`
- Live/system: cyan `#22d3ee`
- Creative/media: fuchsia `#e879f9`
- Pipeline/cost/rarity: gold `#facc15`, orange `#fb923c`
- Healthy/saved: green `#4ade80`
- Error/danger: rose `#fb7185`

## UI Rules

- First screen is the working app, not a landing page.
- Dense operator panels, index/detail layout, inspector surfaces, and kanban lanes.
- No nested decorative cards; repeated cards are reserved for assets, slots, and kanban work items.
- Motion is short and functional: hover glow, scan sweeps, and drop feedback.
- Sound is opt-in and persisted.
- Text uses stable sizes and does not scale with viewport width.
- Controls are keyboard-focusable native buttons/inputs.

## Hapa-Specific Behaviors

- Completion is deterministic and visible as percent, XP, level, and grade.
- Slot buckets mirror the Red/Reaper board structure exactly.
- The Avatar Card JSON is always accessible for agents and processes.
- The kanban board separates product build work from avatar healing work.
- Attach packs make avatar media portable to comics, videos, and other pipelines.
- Image previews preserve aspect ratio and can be expanded for detail inspection.
