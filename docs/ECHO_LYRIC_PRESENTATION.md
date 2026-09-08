# Echo lyric presentation

The existing Preview overlay, HyperFrames composition and Song Card compiler use one caption DOM owner in`src/domain/echo-lyric-presentation.js`. Word motion follows measured intervals; vocal intensity must not invent word timing. Missing confidence, overlapping/out-of-phrase intervals and explicitly unaligned words use a labeled phrase fallback that preserves the selected source text.

The renderer prepares phrase/window wrapping and glyph geometry once, retains at most128 layouts per surface, and performs no DOM geometry reads during unchanged-window animation. Motion is bounded to the prepared panel. Safe-area edits invalidate the lyric execution identity. Normal, half-intensity and reduced-motion modes share the same output geometry contract.

Protected face/bubble metadata must match the original source hash. Constant-size protected camera corridors are projected and unioned conservatively across the phrase (including incoming media). The renderer tries alternate positions and bounded font reduction. Unsupported geometry stays unverified, and an impossible placement stays a collision. This does not detect faces or synthesize protection evidence. Automatic placement is intentionally stable across a phrase.

Output profiles are1920×1080,1080×1920 and1080×1080 at30fps. The Song Card owner translates these to HyperFrames landscape, portrait and square respectively.

Current status and evidence: [lyric layout postmortem](postmortems/2026-09-08-echo-lyric-layout.md). Native layout/motion parity is verified on synthetic fixtures; stricter encoded glyph fidelity and managed Song Card acceptance remain open. For source waveform/onset review and correction controls, see [lyric corrections](ECHO_LYRIC_CORRECTIONS.md).

Caption text uses`text-rendering: geometricPrecision` in Preview as well as final output, matching the compiler-injected typography. Current evidence and limits: [encoded typography](postmortems/2026-09-08-echo-encoded-typography.md).
