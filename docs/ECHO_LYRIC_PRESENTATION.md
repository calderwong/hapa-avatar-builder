# Echo lyric presentation

The existing Preview overlay, HyperFrames composition and Song Card compiler use one caption DOM owner in`src/domain/echo-lyric-presentation.js`. Word motion follows measured intervals; vocal intensity must not invent word timing. Missing confidence, overlapping/out-of-phrase intervals and explicitly unaligned words use a labeled phrase fallback that preserves the selected source text.

The renderer prepares phrase/window wrapping and glyph geometry once, retains at most128 layouts per surface, and performs no DOM geometry reads during unchanged-window animation. Motion is bounded to the prepared panel. Safe-area edits invalidate the lyric execution identity. Normal, half-intensity and reduced-motion modes share the same output geometry contract.

Protected face/bubble metadata must match the original source hash. Constant-size protected camera corridors are projected and unioned conservatively across the phrase (including incoming media). The renderer tries alternate positions and bounded font reduction. Unsupported geometry stays unverified, and an impossible placement stays a collision. This does not detect faces or synthesize protection evidence. Automatic placement is intentionally stable across a phrase.

Output profiles are1920×1080,1080×1920 and1080×1080 at30fps. The Song Card owner translates these to HyperFrames landscape, portrait and square respectively.

Current status and evidence: [lyric layout postmortem](postmortems/2026-09-08-echo-lyric-layout.md). Native layout/motion parity is verified on synthetic fixtures; stricter encoded glyph fidelity and managed Song Card acceptance remain open. For source waveform/onset review and correction controls, see [lyric corrections](ECHO_LYRIC_CORRECTIONS.md).

Caption text uses`text-rendering: geometricPrecision` in Preview as well as final output, matching the compiler-injected typography. Current evidence and limits: [encoded typography](postmortems/2026-09-08-echo-encoded-typography.md).

## Stylized lyric templates

Six additional templates extend the same source-timed lyric contract rather
than creating a second animation clock:

- **Square Word Mosaic** (`square-word-mosaic-v1`) arranges the active lyric
  window into a centered transparent bento grid. Each cell receives adaptive
  type scale and alternating geometry, so both short words and long words fit
  without clipping while motion stays inside stable cells.
- **Letter Wave** (`letter-wave-v1`) applies a bounded traveling wave and
  chromatic split to each glyph of the active word. The phase comes from that
  word's measured progress and the presentation has no opaque caption pill.
- **Kinetic Typewriter** (`kinetic-typewriter-v1`) reveals each glyph across the
  word's measured interval, with a small rise, settle, and deterministic caret
  instead of an invented character clock.
- **Vertical Poster Stack** (`vertical-poster-stack-v1`) turns the lyric window
  into a compact editorial stack with alternating scale, alignment, tracking,
  word entrances, and a colored accent rail.
- **Prism Slam** (`prism-slam-v1`) isolates one trustworthy active word at a
  time as oversized uppercase display type. Per-glyph red/cyan separation,
  impact scale, and splay are derived from that word's measured progress.
- **Letterfall Totem** (`letterfall-totem-v1`) isolates one trustworthy active
  word and stacks its glyphs vertically. Alternating horizontal drift and a
  top-down fall resolve into a centered typographic totem.

All six are available in the existing per-cut **Lyric template** selector and
honor the same Font, Size, Color, safe-area, source-confidence, reduced-motion,
Preview, recording, and HyperFrames export behavior as the original templates.
Letter animation uses cached word-local glyph boxes; after the lyric window is
prepared, animation does not read layout geometry on every frame. Reduced
motion removes glyph transforms and progressive opacity while preserving the
words and layout.

The art-directed templates deliberately keep their outer panel transparent so
the selected video, persistent shaders, and revolving shader remain visible.
Square cells and the Typewriter editorial strip may add local contrast, but do
not replace the full video frame with a caption background. Template-specific
theme fonts are used only while **Font** remains set to Theme; an explicit Font
selection continues to override the art direction.

## Center Word Focus

`center-word-focus-v1` is the large, one-word performance mode. It forces the
active word to the geometric center at roughly 11% of the shorter output edge
and removes the panel fill, border, padding, radius, box shadow, scanline and
underline. The internal DOM owner remains for deterministic measurement, but it
has no visible container treatment.

The mode appears as **Center Word Focus** in the existing per-cut Lyric template
selector and reaches Preview and HyperFrames through the same contract. It is
visible only during a trustworthy active word or reviewed syllable interval.
Within a mixed line, directly matched STT words can render while interpolated
words remain blank. Synthetic, low-confidence, overlapping and otherwise
unverified timing never receives an invented one-word cadence.

## Per-cut typography controls

The Director toolbar exposes **Font**, **Size**, and **Color** beside the lyric
template/style controls. Font is a portable allowlist: theme default, sans,
serif, mono, or display. Size scales the template's profile-relative base from
50–200%, so the value remains consistent across landscape, square, vertical,
Preview, and HyperFrames output. Color accepts a six-digit hex value and applies
to both ordinary and active lyric text; **Theme Color** clears the override and
returns color choice to the selected lyric style.

These values live in the saved per-cut `lyrics` contract as `fontFamily`,
`fontScale`, and `textColor`. Normalization rejects arbitrary font/CSS values,
clamps size, and rejects malformed colors. All three participate in layout-cache
and export execution identity, while legacy cuts default to their prior theme
font, 100% size, and theme color.
