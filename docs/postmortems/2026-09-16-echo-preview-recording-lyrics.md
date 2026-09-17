# Echo Preview recording lyric parity

Date: 2026-09-16

## Objective

Include the lyric presentation in Director Preview recordings whenever the
operator-visible Lyrics control is on, while continuing to exclude the Preview
telemetry HUD.

## Cause

The visible preview was layered: media and shaders were canvases, but lyrics
were a DOM overlay. MediaRecorder captured a separate offscreen canvas that
painted media and shaders only. The capture contract explicitly excluded lyrics.

## Resolution

The lyric DOM owner now exposes its already-evaluated frame and measured layout
to the recording compositor. After media and shaders, the compositor paints the
same visible words, template placement, font family, font size, text color,
motion, panel, and timing label into the recording canvas. It does not run a
second lyric clock or re-wrap the text independently.

Lyrics remain absent when the Lyrics control is off, when Clean Preview hides
them, between timed lyric intervals, or when the timing policy suppresses an
unaligned line. The HUD remains excluded.

## Guardrail

Recording lyric parity is tested at both integration and painter levels: the
compositor must invoke the shared lyric painter after the shader layer, a visible
surface must emit its authored text, and a hidden surface must be a no-op.
