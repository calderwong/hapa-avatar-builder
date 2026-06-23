# Hapa Design Audit - Avatar Builder (2026-06-11)

Auditor: Codex  
Standard: HAPA_DESIGN_SYSTEM.md v1.2, DESIGN_AUDIT_CHECKLIST.md, NeonBlade UI component CSS  
Scope: Hapa Avatar Builder web/Electron UI, media-slot workflow, Hapa Card inspector, kanban board

## Source Of Truth

- `/Users/calderwong/Desktop/hapa-design-system/docs/HAPA_DESIGN_SYSTEM.md`
- `/Users/calderwong/Desktop/hapa-design-system/docs/DESIGN_AUDIT_CHECKLIST.md`
- `/Users/calderwong/Desktop/hapa-design-system/tokens/hapa-neon.css`
- `/Users/calderwong/Desktop/hapa-design-system/components/cards/hapa-card.css`
- `/Users/calderwong/Desktop/hapa-design-system/components/controls/controls.css`
- `/Users/calderwong/Desktop/hapa-design-system/components/panels/panels.css`
- `/Users/calderwong/.codex/skills/hapa-astros-design/SKILL.md`

## Scorecard

| Area | Before | After | Notes |
| --- | ---: | ---: | --- |
| A. Tokens & Identity | 1/2 | 2/2 | Added canonical `--hapa-*` tokens and mapped local aliases to them. |
| B. Cards & Components | 1/2 | 2/2 | Added `hapa-card`, `hapa-panel`, `hapa-btn`, `hapa-readout`, `hapa-tabs`, and `hapa-progress` grammar. |
| C. Motion | 1/2 | 2/2 | Added card beam/state-light vocabulary and preserved reduced-motion support. |
| D. Operator Functionality | 2/2 | 2/2 | Existing builder-first layout, counts, drag/drop, tags, preview, board, and video branches remained intact. |
| E. Protocol Gates | 2/2 | 2/2 | Avatar media targets, attach packs, CLI/API surfaces, and docs remain reachable. |

Grade before: B, 7/10  
Grade after: A, 10/10

## Findings And Fixes

### P2 - Token Drift

Evidence: `src/index.css` previously used app-local neon aliases as the primary palette.  
Fix: `src/index.css:1` now defines canonical Hapa tokens such as `--hapa-bg-deep`, `--hapa-neon-cyan`, `--hapa-neon-magenta`, semantic type colors, motion timings, glow levels, and geometry settings, then maps existing app aliases to those values.

### P2 - Missing Hapa Card Grammar

Evidence: avatar rows, media tiles, slots, and kanban cards were styled by local classes only.  
Fix: `src/App.jsx:436`, `src/App.jsx:721`, `src/App.jsx:782`, and `src/App.jsx:1100` now apply `hapa-card` with `data-card-type`, `data-granularity`, `data-state`, and priority metadata where appropriate.

### P2 - Panel And Control Drift

Evidence: panels, buttons, telemetry chips, tabs, and progress bars had no shared NeonBlade component grammar.  
Fix: `src/App.jsx:399`, `src/App.jsx:427`, `src/App.jsx:474`, `src/App.jsx:500`, `src/App.jsx:1151`, `src/App.jsx:1160`, and `src/App.jsx:1168` now use `hapa-panel`, `hapa-tabs`, `hapa-btn`, `hapa-readout`, and `hapa-progress`.

### P3 - Motion Vocabulary Calibration

Evidence: the app had local hover/sweep motion but not the design-system state vocabulary.  
Fix: `src/index.css:1432` adds a NeonBlade adoption layer with idle/active/selected/error card states, beam speed variables, state lights, priority glow levels, and reduced-motion behavior.

### P3 - Provenance Depth

Evidence: detail modal and attach pack data expose asset metadata, but a dedicated provenance footer is still split across UI elements.  
Recommendation: add a standardized detail-card provenance footer for asset source, dimensions, branch count, generated-from image, attached process, and last validation run.

## Adoption Notes

- This pass layers standard design classes on top of the working app instead of rewriting the component tree, matching the updated Hapa/Astros skill guidance.
- The app keeps its dense operator layout: no landing page, no marketing hero, no decorative blob/orb background.
- Media rendering continues to preserve original image/video aspect ratio.
- The first screen remains usable as the builder workspace, with kanban and Hapa Card views as operational modes.

## Verification

- `npm test`: pass, 10/10.
- `npm run build`: pass.
- `npm run smoke:electron`: pass.
- Browser DOM audit at `http://127.0.0.1:8787/`: 51 `.hapa-card`, 16 `.hapa-panel`, 3 `.hapa-btn`, 5 `.hapa-readout`, 10 `.hapa-progress`, 1 `.hapa-tabs`.
- Browser token audit: `--hapa-neon-cyan` resolved to `#00f3ff`, `--hapa-bg-deep` resolved to `#02040a`, `--hapa-label-tracking` resolved to `.12em`.
- Browser console: no warnings or errors observed during the audit pass.

## Follow-Up Queue

1. Import canonical component CSS directly from `hapa-design-system` once the app is packaged with a stable shared stylesheet path.
2. Add a reusable `HapaCardShell` React component for media, avatar, kanban, and protocol records.
3. Add a detail-card provenance footer and lineage mini-map for image-to-video branches.
4. Add a design audit board lane or event log so future design drift appears in the app's own kanban workflow.
5. Add visual regression screenshots for builder, board, card, modal, and drag-hover states.
