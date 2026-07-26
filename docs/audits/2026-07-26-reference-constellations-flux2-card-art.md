# Turn-to-Lore Audit — Reference Constellations and FLUX.2 Card Art

Date: 2026-07-26

## Objective

Make Echo's reference expansion less dependent on isolated phrase matches, connect references only when evidence supports the relationship, rerun the full local corpus, and prepare high-quality artistic Reference Card generation without leaking private context or silently changing canon.

## Evidence inspected

- Current Echo song corpus and prior Reference Atlas outputs.
- Reference Card and graph contracts.
- Expansion-context pack and source provenance.
- Existing image-proposal custody patterns.
- Official FLUX.2 model, generation, editing, polling, and delivery documentation.
- Existing privacy, confidence, human-review, minting, and publication boundaries.

## What worked

- Reference-to-reference connections became useful when shared-song evidence was combined with at least one stronger signal: multiple shared songs, close lyric-line proximity plus shared theme, or a shared mechanic.
- Storing structured support on each edge made the connection inspectable rather than merely plausible.
- Connected components produced a compact constellation view without introducing a second truth system.
- Re-running the corpus after adding the conversation-derived context pack found materially more activations and preserved unresolved nodes.
- Compiling FLUX prompts from Cards, occurrences, and supported neighbors created denser art direction than prompting from a reference label alone.
- Separating provider submission, temporary provider delivery, local artifact custody, and human review preserved the existing governance model.
- A provider-free planning stage exposed the entire proposed art batch before any cost was incurred.

## Noise and rejected approaches

- Connecting every pair that shared a broad theme created dense but semantically weak clusters.
- Allowing generic Motif Cards to seed external art jobs produced prompts too abstract to justify provider disclosure.
- Treating co-occurrence alone as proof of a semantic relationship over-connected chorus vocabulary and repeated structural words.
- Adding a negative-prompt field would have invented a provider contract the selected FLUX.2 API does not expose.
- Automatically accepting an attractive generated image would conflate aesthetic quality with reference accuracy.

## What was initially misunderstood

The missing layer was not simply “more references.” The Atlas needed a distinction between:

- A detected reference.
- The evidence that supports it.
- The evidence that connects it to another reference.
- A projection of that relationship for navigation.
- A visual interpretation proposed from the graph.

Without those distinctions, density becomes confidence inflation. With them, the system can expand aggressively while keeping each inference reviewable.

## What changed

- Reference edges can now carry shared songs, shared themes, shared mechanics, reason codes, line proximity, and channel count.
- A bounded constellation pass connects only source Reference Cards under explicit evidence rules.
- The mining artifact now includes constellation components and audit counts.
- Nine additional conversation-derived public-context references were added, while the private Wesco/Snohomish clue remains explicitly private.
- A FLUX.2 Card-art planner, queue, secure provider adapter, resumable runner, and explicit human-review action were added.
- The entire local corpus and context pack were recompiled.

## Reusable method

For future dense semantic expansion:

1. Detect candidate references at the lyric-span level.
2. Preserve multiple interpretations and confidence.
3. Attach public sources or explicitly mark private context.
4. Connect two references only when co-activation has additional support.
5. Store the support, not only the edge label.
6. Project connected components as navigation aids, not new canon.
7. Compile downstream media from the source Cards and supported edges.
8. Keep provider artifacts unminted and require human acceptance.
9. Re-run the graph when context changes rather than overwriting old meaning.

## Guardrail

Semantic density must never erase provenance. A graph can suggest that two references belong together; it cannot convert a private clue into public context, a model interpretation into fact, or attractive generated art into canonical truth.

## Result

The current run produced 1,020 Cards, 65 supported source-reference connections, two constellations, and 82 provider-ready art proposals. Planning made no paid calls, exposed no private clues, and created no public or canonical state.
