# Echo Center Word Focus — September 16, 2026

Status: implemented and locally verified. Source checkpoint: `5a9d48b`.

## Objective

Add a selectable lyric display with larger text, no visible box or background,
and exactly one sung word at the center of the video.

## Evidence inspected

The existing lyric contract, template runtime, shared Preview/HyperFrames DOM
owner, output-profile sizing, safety audit, Director projection, and per-cut
template selector were inspected. The existing surface already owns timing,
layout, seek determinism, export parity, and authored word endings, so it was
extended instead of replaced.

## What changed

`center-word-focus-v1` is now the fifth template and appears as **Center Word
Focus** in the existing selector. It uses an 800-weight font sized to 11% of the
shorter output edge, locks the glyph to geometric center, and removes panel
fill, border, padding, radius, box shadow, scanline, and word underline. Runtime
state exposes exactly one display word only while that word is active.

Measured word or reviewed syllable timing drives visibility. On a partially
aligned line, direct STT anchors can render while interpolated words remain
blank. Lines with synthetic, low-confidence, overlapping, or otherwise
unverified timing remain blank rather than receiving guessed per-word cadence.

## Learning and guardrail

The request described a visual mode, but implementing it only as CSS would have
left complete phrase windows in the DOM and would have fabricated a one-word
experience for phrase fallback. Template visibility therefore belongs in the
shared deterministic timing runtime; presentation owns only center placement
and transparent styling. Future single-token modes must fail closed when no
trusted active token exists.

## Reuse boundary

This is a reusable Lyric Template and Lesson Card candidate. It shares the
existing contract, timing truth, Preview painter, HyperFrames browser runtime,
output profiles, and Director persistence. It does not change any song's saved
template automatically and does not claim syllable-exact timing where the
source has only word anchors.

## Verification

- 97 lyric and Director checks pass.
- Preview and exported browser runtimes return identical fixed-frame state.
- Landscape, square, and vertical safety fixtures pass for all five templates.
- Production build and delivery-receipt verification pass.
