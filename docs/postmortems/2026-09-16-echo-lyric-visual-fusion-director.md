# Echo Lyric Visual Fusion Director — 2026-09-16

Status: verified local checkpoint; human cut acceptance pending.

## Intended and actual outcome

Create several Director cuts for every Echo song that mix high-quality,
Human-accepted footage with completed H3/FAL Reference Card loops, using timed
lyrics and enriched visual text to improve shot choice.

The run produced three append-only variants for all 200 projects (600 cuts).
All cuts contain both media families and preserve the inherited song direction.
The Builder's existing variant index is the delivery surface.

## Evidence and cost

- Applied report:
  `artifacts/lyric-visual-fusion-director/lyric-visual-fusion-2026-09-17T04-33-29-235Z-apply.json`
- Human pool: 3,267 accepted, 3,133 readable and enriched, 2,781 at the 720 px
  short-edge floor.
- Reference pool: 954 completed loops; 769 FAL and 185 local MiniMax H3.
- Coverage: 163 songs with same-song loops; 37 truthfully labeled album
  fallbacks.
- Lyric evidence: 25,154 selected lyric windows; 15,056 positive measured
  overlaps; average positive affinity 0.2329.
- Persisted audit: 600 index rows, 600 expected files, zero missing files, zero
  variants missing a source family, zero Human-acceptance violations, and zero
  adjacent media repeats.
- Focused Director/media tests: 53 passed after the album run. The production
  build and delivery-receipt check pass. The repository-wide test gate reached
  its terminal result with an unrelated pre-existing failure in
  `tests/tarot-isf-playback-pool.test.mjs`: the already-dirty Tarot renderer
  contains a black underlay that this test forbids. Its isolated result is 5/6;
  no Tarot code or expectation was changed as part of this Director pass.
- Active implementation, verification, and provider cost: not measured. This
  task consumed existing local media and did not submit new provider jobs.

## Learning

The first dry run ranked all 3,133 Human videos for every shot and was stopped
without writes after roughly five minutes. The cause was repeated full-pool
lexical scoring, not the number of saved variants. A deterministic per-song
shortlist—320 Human candidates and a maximum 160 Reference fallback
candidates—made the 600-variant pass complete in about ninety seconds while
retaining enriched-text evidence.

The existing accepted-video and Reference-loop passes were useful owners, but
running them separately could not express a combined source policy or timed
lyric evidence. The reusable result is the composition layer: retain those
source adapters, attach authoritative lyric windows to inherited shots, and
make the soft ranking evidence inspectable.

One important correction remains visible: Gnow Her has six generated card
images but no completed same-song loops. The compiler did not pretend
otherwise; its current cuts use the album fallback. Availability, same-song
relevance, and human aesthetic approval are separate states.

## Actions and next decision

- Use `docs/ECHO_LYRIC_VISUAL_FUSION_DIRECTOR.md` as the repeatable runbook.
- Let the existing loop queue complete Gnow Her's six cards, then design a new
  append-only variation set (or explicit migration) if same-song replacement is
  desired.
- Review the three cuts per song in the Builder before promoting one as a saved
  creative choice or final render.
- Consider embeddings or an explicit LLM shot-ranking pass only as a future,
  separately evidenced enhancement; current lexical overlap is intentionally a
  soft signal and makes no semantic-truth claim.

The requirement-completion method remains active-pilot. This checkpoint adds a
reusable Director flow but does not close lyric, aesthetic, or final-render
acceptance requirements.
