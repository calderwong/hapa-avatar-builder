# Avatar Card Showcase Audit

Date: 2026-06-19
Surface: Avatar Builder `Avatar Card` view
Standard basis: Hapa NeonBlade Operator, adapted for immersive character display rather than admin management.

## Design Intent

The Avatar Card view is now a showcase-grade character sheet. It keeps the NeonBlade vocabulary of glass panels, cyan/fuchsia edge light, clipped controls, monospaced telemetry, and interactive media states, but shifts the density toward a video-game RPG dossier:

- A hero video loop/background anchors the selected avatar immediately.
- Portrait/video media are given large presentation space.
- Image tiles expose hover video loops where branches exist.
- Magnify controls open the existing asset detail modal for close inspection.
- Dossier, soul/personality notes, facts, inventory, hardpoints, relationships, phrases, songs, consciousness copies, and the raw manifest are presented as distinct character-card regions.

## Scorecard

| Category | Score | Notes |
| --- | ---: | --- |
| Tokens and NeonBlade identity | 2/2 | Reuses app tokens, NeonBlade glow, clipped panels, telemetry labels, and cybernetic button language. |
| Card/component structure | 2/2 | Adds clear hero, gallery, dossier, loadout, relationship, voice/copy, and manifest zones. |
| Motion and media behavior | 2/2 | Supports background hero loops, hover video loops, poster thumbnails, media carousels, and close-up magnification. |
| Character readability | 2/2 | Converts raw Avatar Card data into RPG-style summary, stats, facts, equipment, duties, and relationships. |
| Protocol/debug access | 1/1 | Keeps the full manifest available for agents and protocol review without making it the primary experience. |

Total: 9/9, Grade A.

## Verification

- `npm test` passes 41/41 tests.
- `npm run build` passes.
- Browser smoke on `http://127.0.0.1:5178/` confirms:
  - `Avatar Card` tab renders the showcase view.
  - Hero video/background media is present.
  - Gallery tabs update the carousel.
  - Magnify opens and closes the existing asset modal.
  - Console logs are clean aside from Vite/React development info.

## Residual Notes

The manifest panel intentionally remains provenance-dense JSON. It is useful for agents, but a later pass could add a friendlier contract inspector on top of the same data.

## Interaction Addendum

The asset detail modal now supports carousel navigation and close inspection:

- Magnified assets open with the local media lane as carousel context.
- Left/right controls advance through the current media set.
- Image assets expose in-modal zoom controls from 100% up to 600%.
- Clicking the image punches in further, and zoomed stages become scrollable for detail inspection.

Verification on `kit-poses-image-1` confirmed a 17-item carousel, 200%+ zoom with scrollable overflow, next/previous navigation, and no fresh browser console errors during interaction.

## Archive And Dossier Addendum

The Dossier and Visual Archive sections now use stronger NeonBlade bucketing:

- Dossier soul/fact cards use colored accent rails, glints, scan motion, and semantic neon grouping.
- Visual Archive buckets use distinct accent colors and animated active-state beams.
- Media tiles are now media-first, with visible filenames/type labels removed from the tile body.
- The Visual Archive renders as a wrapped vertical media wall instead of a single horizontal strip.
- The archive container is focusable and supports keyboard scrolling with ArrowUp/ArrowDown, PageUp/PageDown, Home, and End.

Verification confirmed 48 Identity media items render without horizontal overflow, the media wall scrolls vertically, later assets become visible after PageDown, the first tile is enlarged, visible tile labels are hidden, and no fresh browser console errors appear during archive scrolling.

## Dossier Card Frame Addendum

The Dossier cards now render closer to collectible card frames:

- Each Dossier title band includes a Lucide icon.
- The title band uses a solid dark/card header background with an accent underline.
- Neon glow now wraps the entire card frame with outer and inset glow, instead of reading as only a bottom/edge treatment.
- Dossier spacing was increased and clipping was removed so the lower cards clear the next section.

Verification confirmed the last Dossier card clears the Dossier panel and the Inventory section, full-card glow is applied through border/box-shadow/clip-path, title icons render, and no fresh browser console errors appear during interaction.
