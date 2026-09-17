# Echo stylized lyric templates — September 16, 2026

## Outcome

Echo gained four selectable lyric presentation modes without splitting Preview,
recording, and HyperFrames into separate render paths: Square Word Mosaic,
Letter Wave, Kinetic Typewriter, and Vertical Poster Stack. The modes reuse the
existing per-cut lyric contract, authoritative word intervals, typography
controls, safe-area placement, phrase fallback, and reduced-motion policy.

## Implementation

- Square Word Mosaic prepares a square grid for the visible word window and
  animates each word inside its stable cell.
- Vertical Poster Stack prepares a single-column editorial stack with a visible
  accent rail and bounded alternating entrances.
- Letter Wave and Kinetic Typewriter split authored display words into glyph
  spans. Character motion derives deterministically from the containing word's
  measured progress; no synthetic speech timing or independent clock is added.
- Glyph geometry is cached with the phrase/window layout. Preview animation and
  recording consume those same cached boxes, while the browser-packaged
  HyperFrames owner receives the same pure functions.
- Reduced motion preserves the full text and layout while removing glyph motion
  and progressive opacity.

## Verification and retained limits

Focused contract, runtime, presentation, render-safety, director, and recording
tests cover all nine lyric templates and the per-glyph recording path. The
production build and delivery-tree check are the release gates for this change.

A live local Builder check on Gnow Her confirmed all nine selector choices, a
visible six-word square using three grid columns, and glyph nodes in both letter
templates. That check caught a first-pass coordinate error: DOM glyph offsets
were container-relative while the motion clamp expected word-local coordinates.
Subtracting the containing word offset fixed the issue; a pure regression test
now locks that conversion.

The local Gnow Her playback route returned `not_found`, so live temporal motion,
human lyric taste, managed MP4 output, and acoustic synchronization are not
accepted by this checkpoint. Existing encoded typography limits remain open.

## Reuse guidance

Add future lyric looks to the registered template contract, derive animation
from `word.progress`, and keep layout measurement outside the frame loop. A
template that needs glyph motion should use word-local cached glyph boxes and
must provide a reduced-motion result. Do not create another lyric clock or a
recording-only renderer.
