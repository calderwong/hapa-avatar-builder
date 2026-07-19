# Echo full-song direct-LLM screenplay authoring task

Author one integrated visual screenplay for every source-backed four-count in the supplied song packet.

## Required inputs

- Read the complete song packet, including the full lyrics, all timed counts, Director context, visual affordances, current media continuity, approved Avatar seed assets, resolved song-reference connectors, and the explicitly non-inherited album context reservoir.
- Read the full-song screenplay contract and production standard.
- Use the accepted direct-LLM phrase pilot as a quality floor, not as a scene template.
- Read the independent pilot audit and correct its two identified risks throughout the full song.

## Authoring method

- Perform direct LLM analysis of the complete song before writing count prompts.
- First design the song thesis, emotional movement, recurring material vocabulary, reference mechanics, and phrase-sized cinematic sequences across the entire song.
- Then author every count individually from its exact timed lyric evidence, local nouns, verbs, action, concepts, teaching, symbols, wordplay, and evidence-bounded reference mechanics. Make at least two mined lyric elements materially visible in every lyric-bearing frame: normally a concrete noun/symbol and a verb/state change.
- Carry material and narrative consequences between adjacent counts. Each count must visibly inherit something from the prior count and cause or prepare something in the next count.
- Use references for their mechanics and thematic pressure, not literal franchise imitation. Read their plots, systems, character dynamics, transformations, spatial rules, and recurring symbols as possible cinematic grammar. Hidden or uncertain reference candidates must retain their evidence status.
- The album context reservoir is optional inspiration, never evidence that the song contains a reference. If used, identify the non-inherited mechanic and make its effect materially legible as an action, material behavior, camera rule, spatial relationship, or consequence—not as a decorative title or theme label.
- If a reference mechanic recurs, evolve it. Change its consequence, scale, material, relationship, or viewpoint so the graph visibly accumulates meaning rather than repeating a franchise-adjacent tableau.
- Bind every count to the exact approved Red, Blue, and/or Green Avatar seed assets selected by the packet. Preserve identity while varying pose, action, scale, lens, environment, lighting, and cinematic grammar.
- Read the packet's cast-attribution ledger before authoring. Keep Red/Blue/Green as the primary director anchor. When an explicitly bound referenced Avatar (for example Bella) matters to a count, bring that Avatar on top of the primary cast with a distinct seed, visible action, evidence basis, and bounded relationship. Do not embody a same-sounding name without an explicit Avatar binding.
- Treat Thorsun, Little Toe, Calder, and Bo as optional evergreen styling variants of the shared RGB human base. Treat Thor as a cat, Leo as a dog, and Falka/Mimi as her registered cyber-engineer/captain Avatar. Use this pool to broaden cast and staging only where the lyric, energy, action, symbol, reference mechanic, or teaching gives the character something specific to do. Do not rotate them mechanically or add them as decoration.
- Emit `castAppearances` for every enhanced count. Only `on_screen` entries may list seed assets; additional on-screen cast requires the primary Avatar on-screen too. Prefer the smallest useful cast and never exceed primary plus three additions.
- Preserve existing prompt/image/keyframe/video facts with `preserve_existing_media`; author missing counts as `candidate_direction_only` and keep every new prompt `stage_only` with image activation `not_requested`.

## Prohibited shortcuts

- Do not write or run a deterministic scene generator, loop, template expander, catalog rotation, modulo selector, or phrase substitution system.
- This prohibition covers every authored surface: `semanticExtraction`, `shot`, `sceneText`, `gptImagePrompt`, `justification`, `metaphor`, reference mechanics, and cast actions. Writing distinct nouns/actions into a shared sentence constructor is deterministic assembly, not direct LLM analysis, even when every rendered sentence is technically unique.
- Do not assign locations, cameras, actions, energy labels, compositions, references, or motifs by index rotation.
- Do not stamp the same Beginning/Pressure/Release wording or any other sentence scaffold into every GPT Image prompt.
- Do not use an external provider or generate images or videos.
- Do not invent lyrics, private facts, absent people, or unsupported references.
- Do not conflate Avatar identities that share aliases: resolve Bella, Thor, Leo, and every referenced Avatar by exact registry ID.
- Do not default to the same standing Avatar, forest/corridor, portrait scale, or atmospheric lighting merely because the identity seed contains those elements. The seed preserves identity; the song chooses the world.

Shared seed-identity and negative-safety clauses may repeat where operationally necessary. The cinematic body, scene causality, semantic extraction, and justification must be individually reasoned for each count.

The validator removes count-specific slots—including shot fields, lyric excerpts, semantic terms, and cast evidence—and compares the remaining prose scaffolds. Repeated scene, justification, metaphor, or prompt skeletons above the album-scaled limit are unimportable unless they are explicitly justified intentional holds.

For enhanced cast-aware screenplays, do not begin most prompts with the same production-label sentence (for example, a repeated “Cinematic 16:9 key frame for exact four-count…” lead). Open directly on the count's distinctive image, action, material, or camera event. The validator treats heavily repeated prompt leads as templated authoring even when later nouns are different.

## Image-worthy frame test

Before emitting a count, verify all of the following:

- A viewer can point to the local lyric noun/symbol and the local verb/state change in the image.
- The frame has a specific location, affected object/material, composition, lens/camera position, light source, palette, and energy.
- Its justification explains why this frame belongs at this exact four-count and how a contextual/reference layer changes the reading.
- It remains distinct from adjacent frames even if the Avatar is mentally removed.
- Incidental seed-derived animals or figures are not automatic failures. Keep them when they support the Avatar ecology or lyric; remove them when they replace the lyric action, create unsupported relationships, or homogenize the sequence.

## Output

- Produce exactly one JSON document using schema `hapa.echo.full-song-visual-screenplay.v1` and covering all packet counts in exact source order.
- Leave mechanically derived hashes as the literal string `pending`; the trusted finalizer will calculate hashes without changing scene content.
- Set schema-valid `review.status` to `staged` and add the review note `candidate-awaiting-independent-review; not approved and not activated`.
- Do not claim that the candidate is approved and do not activate any image quest.
