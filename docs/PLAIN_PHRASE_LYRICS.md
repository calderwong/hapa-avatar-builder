# Full-phrase lyrics without word highlighting

The Director's **Highlight individual words** checkbox controls the saved cut's
`lyrics.highlightWords` boolean. Uncheck it for the full phrase at a steady
brightness: no active-word glow, underline, dimming, glyph reveal, word motion,
or pagination based on word timestamps. Long phrases wrap and use the existing
safe-area sizing. Position, font, size and color remain editable. Turning the
checkbox on restores the selected template; omitted values preserve legacy behavior.

The shared contract, runtime and presentation implement this mode for native
Preview, recording canvas and generated HyperFrames. The export compiler forwards
the switch. The presentation cache includes it so an in-place toggle updates layout.
No lyric text, timing evidence, audio or historical cut is replaced.

## October 14, 2026 delivery and learning

The initial request referred to American Kings and movement timed to words. A
simple animated Hey Sister child was saved. Calder clarified that unpredictable
word timing should have no visible effect and requested a non-highlighting version
or toggle. Reduce motion was insufficient: it retains active-word paint. The new
explicit toggle reuses the existing owner rather than editing or erasing measured
word timing. Hey Sister was saved and reopened with highlighting disabled through
the normal desktop Save as new cut action.

Verification: 63 focused contract/runtime/presentation/compiler checks pass, as
does the production build. Tests cover all eleven selectable templates, long
phrases, reverse seeks, persistent normalization, offline runtime and legacy word
activation. Native inspection at 22.5 seconds shows the complete white phrase with
no underline or dimmed words. Previous source cuts and Song Card source timing
were hash-checked unchanged. No new final-video render or vocal-alignment accuracy
claim is made. Existing shader preparation notices are separate from this change.

Lesson candidate: reduced movement and absence of karaoke highlighting are distinct
operator choices. Preserve the timing evidence while allowing the presentation to
ignore individual-word boundaries. Task attribution: Codex chat
01a13c32-c137-75e1-a14f-87337a548b11; current user clarification is authority, not
historical notes. Second Brain indexing remains pending.
