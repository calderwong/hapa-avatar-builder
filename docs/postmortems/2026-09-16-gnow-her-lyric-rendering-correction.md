# Gnow Her lyric rendering correction — September 16, 2026

Status: implemented and locally verified. Source checkpoint: `89acd3b`.

## Objective and outcome

Correct missing word endings and improve the remaining Gnow Her lyric drift
without promoting guessed syllable precision. The renderer now uses exact
authored token surfaces, preserves compound-word joins, prevents glyph clipping,
and suppresses a canonical duplicate that has no direct performance anchor. A
new lead-plus-backing vocal alignment improved direct anchors from 574 to 583 of
618 words and confidence from 0.836 to 0.846.

## Evidence inspected

The accepted isolated-vocal sidecar, raw STT, canonical lyrics, live Builder
contracts, word compositor geometry, and promotion/sync gates were inspected.
Two bounded alternatives were measured on CPU. The full master produced 353
direct anchors (57.1%), confidence 0.497, seven unanchored lines, and a low-match
warning, so it was rejected. The derived vocal mix produced 583 direct anchors
(94.3%), confidence 0.846, one unanchored canonical row, and no structural
warnings. Its exact ffmpeg recipe and both stem hashes are retained in
provenance.

## What changed

Normalized alignment tokens remain the matching substrate, but display text is
now restored only when authored and aligned tokens prove a one-to-one identity.
Final bold typography is measured before absolute layout; animated words have a
small ink gutter, visible overflow, no mid-word wrapping, and automatic height.
Rows with no direct acoustic anchor are hidden instead of receiving a synthetic
flash. The improved candidate passed the automatic promotion gate and was synced
to the Gnow Her song, songbook card, and Director project.

## Noise, misunderstanding, and guardrail

The first visual hypothesis focused on normal-versus-bold measurement, but the
panel already inherited a bold font. The stronger defect was display-token
normalization plus exact frozen geometry. The master mix was also not a useful
alignment source despite containing all vocals. Keep source comparisons bounded,
retain failed candidates as evidence, promote only a strictly stronger gated
candidate, and never show a fully unanchored canonical row as if it were sung.

## Reusable boundary

This remains word-level STT timing, not syllable-exact forced alignment. The
same authored-surface restoration and unanchored-row policy apply to all Echo
songs. Singing-aware syllable/phoneme alignment and human onset review remain
the path to exact count-level animation.

## Verification

- 76 lyric-specific tests pass.
- Production build passes.
- Production receipt check passes.
- Album audit: 200 projects, 196 pipeline-verified, no new structural issue.
