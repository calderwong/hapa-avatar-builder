# Echo Tarot prompt review — 2026-09-12

## Objective

Give every Tarot Card + Song pairing three GPT Image 2.5 prompt drafts using replaceable Hapa Main Man / Hapa Main Woman cast slots, and make the drafts reviewable before generation.

## Evidence inspected

- The running canonical Echo Album References surface and its durable Song notebook.
- `resources/echo-album/hapa-tarot-echoes-v1.json`: 78 cards, 167 assignments, inherited meanings, song arguments, lyric evidence, symbol bridges, scene notes, reading mechanics, and editorial boundaries.
- The existing `echo-tarot-song-links` projection, Song Card knowledge/media schema, card picker, and agent-readable notebook endpoint.

## What worked

The existing Song notebook was already the correct owner. A pure deterministic prompt compiler can use the same normalized connection and Song Card context for the API and UI, so prompts do not require a parallel mutable store. Three cast variables can share one card/song specification without prematurely assigning a named avatar.

## Noise and misunderstanding avoided

The card edition’s `artist_scene` is not the original Tarot meaning, and the song argument is not inherited Tarot canon. They remain separate prompt sections. A “couple” variant cannot blindly add a passive second figure to a solo archetype; it must preserve equal agency and translate the original action into complementary roles.

## Change and reusable guardrail

The Tarot connection projection now carries inherited meaning and grammar needed by the compiler. The notebook API exposes review-only prompt sets, and the UI can inspect/copy them without starting an image request. Human logic merges with an existing card/song set rather than duplicating it.

Lesson Card candidate: generative prompts should be compiled views of attributed source layers—inheritance, interpretation, evidence, and human direction—not flattened prose that silently turns editorial synthesis into canon.
