# Krea-2 Alternative Run — Critique Pass v1 (2026-09-11)

Recovered and completed the interrupted alt-run review. Song: "I Knew a Bella" (Dear Papa / Echo Album).
Engine: Krea-2 Turbo bf16 on Comfy h3 (:8188), 1344×768, cfg 1.0, euler/simple, seed 31337.
Graded by vision critic against exact brief, anchor-by-anchor. Text hygiene graded separately.

## Batch 2 — five prompting strategies (`hapa-echo-alt/`, ledger: data/echo-keyframe-prompt-baseline-v3/RENDER_LEDGER.jsonl, frame_ids alt-altA..alt-altE)

| Strategy | Fidelity | Text | Aesthetic | Emotion | Key defect |
|---|---|---|---|---|---|
| A · Minimal style-tag | 8 | 10 | 8 | 9 | hair→starlings only implied; pose reads standing, not running |
| B · Symbol-dense poem | 8 | 10 | 8 | 8 | seed in palm soil, not planted IN the concrete crack; shield tiny/ambiguous |
| C · Lyric-anchored emotion | 7 | 9 | 8 | 8 | cage bars do NOT shatter into notes (primary miss); figure in front of closed bars |
| D · Comic-panel composition | 7 | 10 | 8 | 8 | two lightning bolts (brief: one); rain is line-based not halftone; templated sparrow poses |
| E · Protest-poster halftone | 9 | 10 | 9 | 9 | crest not closed (wheat/olive never meet at top); flat horizon band |

## Batch 1 — "I Knew a Bella" symbol exploration, no characters (`hapa-alt/krea2-alt_00001..00007`, alt-ledger.json)
All 7 variants rendered ok (A-symbolic-stilllife-max … G-symbolic-max-8steps). 5-step ≈ 36 s/frame, 8-step ≈ 51 s. No critic pass was run on this batch yet — pending.

## Universal findings (feed into next pass prompts)
1. **Transformation beats under-deliver** — "X dissolving into Y / shattering into Z" is Krea-2's systematic weak spot (A: hair→starlings, C: bars→notes). Fix: describe the *result state* plus mid-transition fragments explicitly ("each broken bar tip has already become a treble clef mid-fall").
2. **"Brushed-pixel" tag is weak** — output reads halftone/vector comic, not pixel drag. Keep "halftone-dot shading, screen-print grain"; drop or downweight "pixel".
3. **Text hygiene is 10/10 across the board** — confirms skill rule: Krea-2 is the text-safe engine for signage-heavy frames.
4. **Count constraints leak** (D: "one lightning bolt" → two). Restate counts verbatim or avoid numeric constraints in prompt.
5. **Single-symbol emblem compositions (E) beat multi-symbol scenes (B, C)** on every axis. Prefer one strong symbol per frame; split symbol-dense lyrics across consecutive 4-count frames instead.

## v2 hybrid pass results (2026-09-11 15:19, `hapa-echo-alt-v2/`, RENDER_LEDGER_V2.jsonl)
| Frame | Fix-check | Scores |
|---|---|---|
| H1 dawn-leap-crest | running pose FIXED, distinct starlings FIXED, crest tied at top FIXED, text clean | 9/10/9/9 — **approved candidate** |
| H2 shatter-result-state | bars still INTACT (transformation beat failed 2nd time); sun/river/aesthetic ok | 8/10/9/9 — **quarantined** (bars→notes beat) |
| H3 plant-in-crack | seed-in-crack FIXED, single dove FIXED; base reads coin not shield (minor) | 8/10/9/9 |

Lesson hardened: even result-state language did not recover bars→notes in one frame. Route that beat to a split (frame N: intact cage mid-shockwave; frame N+1: field of clef-debris, no cage) or to Klein+refs. Do not burn more Krea-2 seeds on mid-transformation scenes.

## Recommendation (Conviction)
Winner: **E · Protest-poster halftone** (9/10/9/9) as the album's graphic spine; **A · Minimal style-tag** as the emotional-figure template. Adopt hybrid recipe: E's composition discipline + A's single-figure motion, with fix #1 applied to any transformation beat.
Awaiting Calder's pick before scaling to full Dear Papa/Echo Album rollout.
