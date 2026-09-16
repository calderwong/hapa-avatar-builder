# Echo lyric typography controls — September 16, 2026

Status: implemented and locally verified. Source checkpoint: `87b450f`.

## Objective

Add per-cut Font, Size, and Color controls for Echo lyrics without breaking
Preview/export parity or allowing arbitrary stored CSS.

## Evidence inspected

The existing per-cut lyric selector, normalized lyric contract, shared caption
presentation owner, HyperFrames execution hash, Director recipe/lock projection,
saved-cut patch path, and mint identity were inspected. The existing `lyrics`
object already crosses these boundaries, so the new controls extend that owner
instead of adding top-level presentation state.

## What changed

The Echo toolbar now provides an allowlisted font selector, a 50–200% size
slider, a six-digit color picker, and a Theme Color reset. The contract stores
`fontFamily`, `fontScale`, and `textColor`. Preview and generated output resolve
the same portable font stacks, profile-relative size, and color; a custom color
also drives the active-word color so Center Word Focus responds visibly.

Typography values now participate in layout-cache and HyperFrames execution
identity. Whole-song recipe projection and lyric-style locks preserve them.
Legacy projects normalize to theme font, 100% size, and theme color.

## Learning and guardrail

A UI-only color picker would appear ineffective in Center Word Focus because
that template renders only the active accent color. One custom color therefore
overrides both normal and active lyric colors. Font values are stable IDs rather
than raw CSS; size is a clamped scalar rather than device pixels. Future lyric
appearance controls must be normalized before persistence and added to both the
layout key and export identity.

## Reuse boundary

This is a reusable Lyric Contract and Lesson Card candidate. It applies to every
existing template and output profile but does not modify already saved cuts
until an operator changes and saves their controls. Human typography/taste
acceptance remains separate from deterministic technical parity.

## Verification

- 150 lyric, Director, recipe, and HyperFrames checks pass.
- Preview and exported browser typography resolve identically.
- Production build and delivery-receipt verification pass.
