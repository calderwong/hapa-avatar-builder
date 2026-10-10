# Workflow reference

The canonical operating document is `docs/ECHO_SONG_INGEST_PIPELINE.md` in Hapa Avatar Builder. It defines source requirements, CLI commands, the image and H3 handoff, timing truth, data boundaries, and verification.

Stage states are `waiting`, `ready`, `queued`, `running`, `complete`, or `failed`. A later stage may be ready while a human-review gate remains open; readiness is not acceptance.

Useful joins:

- Song identity: Suno registry UUID.
- Builder Song Card: `dear-papa-song-<slug>`.
- Image prompts: `knowledge.referenceImagePrompts`.
- Card-to-loop attachment: immutable `sourceImageRunId + sourceJobId`.
- Ingest UI status: `GET /api/echos/song-ingest` from the trusted local Builder UI.

If the local H3 queue script is not yet in the station's canonical checkout, point `HAPA_H3_BUILDER_QUEUE_SCRIPT` at the verified queue implementation rather than duplicating it. Use the station's own Python environment so its H3 contract dependencies resolve.
