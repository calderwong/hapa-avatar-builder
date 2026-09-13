# Echo Reference Workbench UI audit — 2026-09-13

## Scope

The canonical Hapa Avatar Builder `Reference Atlas` and its embedded durable Song notebook. The audit focuses on rapid song-to-song review, visible reference meaning and Tarot rationale, reversible editing, and motion affordances for existing reference loops.

## Baseline evidence

- `src/components/EchoReferenceExplorer.jsx:1628` owns the current Atlas shell.
- `src/components/EchoReferenceExplorer.jsx:1694` places the complete Song notebook before the only song dropdown at `:1710`, so changing songs requires navigating past album-wide material.
- `src/components/EchoReferenceExplorer.jsx:688` renders Reference Cards with compact summaries, while their lyric evidence, sources, and connection rationale live separately in the inspector beginning at `:728`.
- `src/components/EchoReferenceGptImageLibrary.jsx:152` renders still images only even though `data/echo-reference-animated-media.json` carries revision-bound loop videos.
- `src/components/EchoSongNotebook.jsx:201` exposes useful append controls, but its notes, references, cast, anchors, Tarot rationales, prompt review, and history are one uninterrupted page rather than task-focused views.
- `src/index.css:2122` already supplies a reduced-motion boundary for the Atlas; the redesign must extend it to media-loop behavior, not replace it.

## Baseline scorecard

| Area | Score | Evidence and finding |
|---|---:|---|
| A. Tokens & identity | 2/2 | The Atlas uses the canonical deep-neutral NeonBlade palette, luminous hairlines, mono operator labels, and local-first/authority language. |
| B. Cards & components | 1/2 | Records render as cards and dossiers, but song selection, reference meaning, and notebook controls are not assembled into one resident master/detail workbench. |
| C. Motion | 0/2 | Existing loops autoplay only in a few focused positions; image cards do not consistently reveal loop availability or play on hover/focus. |
| D. Operator functionality | 1/2 | The data and write paths exist, but the dropdown and long document flow make rapid song review and correction unnecessarily expensive. |
| E. Protocol gates | 2/2 | Preview/review/canon/public boundaries, provenance, local persistence, and append-only Reference Card contributions are explicit. |

**Baseline: 6/10 — C.**

## Findings to remediate

1. **P1 — Song context is not resident.** Add a searchable visual song navigator with previous/next controls, coverage readouts, an obvious selected state, and keyboard navigation.
2. **P1 — Meaning is separated from the record.** Put “what it is,” lyric evidence, why it connects, sources, and review state together in reference cards/dossiers.
3. **P1 — Notebook tasks are not scannable.** Introduce an overview plus focused References, Notes & lessons, Tarot logic, and Anchors & cast views; keep quick-add and edit paths beside the material they change.
4. **P2 — Loop availability is visually silent.** Use still-first media that plays its revision-bound loop on hover or keyboard focus, with no layout shift and a static reduced-motion fallback.
5. **P2 — Album-wide material interrupts per-song work.** Keep the corpus available, but move it behind an explicit library action after the song-first work surface.

## Reuse decision

Extend `EchoReferenceExplorer`, `EchoSongNotebook`, the existing Reference Card projection, and the GPT Image library. Do not create a replacement app, a second notebook store, or a new reference authority model. The existing local Song Card write path, Reference Card revision/provenance records, and exact image/loop bindings remain the owners.

## Acceptance gates

- A selected song and the consequence of changing it are visible in the same viewport.
- Mouse hover and keyboard focus play available loops; `prefers-reduced-motion` keeps the still frame.
- Reference title, compact explanation, lyric/source evidence, and rationale are readable without decoding an opaque name.
- Human-authored notes, lessons, research leads, and manual Tarot logic can be added and edited through the existing Song Card save path.
- Focused tests, production build, responsive behavior, and live Electron/browser inspection pass without credential or generated-media changes.

## Re-audit result

| Area | Score | Result |
|---|---:|---|
| A. Tokens & identity | 2/2 | The workbench preserves NeonBlade tokens, local-first wording, and truth-safe authority labels. |
| B. Cards & components | 2/2 | A searchable visual song master rail now drives a task-tabbed Song dossier and explanation-first Reference Card/library details. |
| C. Motion | 2/2 | All 853 available GPT/Codex reference loops are discoverable and play on hover or focus, pause/rewind on exit, and freeze under reduced motion. |
| D. Operator functionality | 2/2 | Previous/next, search, Alt-arrow traversal, selected-state reveal, overview counts, and inline upsert editing support rapid album review. |
| E. Protocol gates | 2/2 | Existing local Song Card persistence, Reference revision binding, provenance, proposal/review/canon boundaries, and source ownership remain intact. |

**Re-audit: 10/10 — A.**

## Verification evidence

- `node --test tests/echo-reference-gpt-image-library.test.mjs tests/echo-reference-explorer-ui.test.mjs tests/echo-song-notebook-ui.test.mjs tests/song-knowledge.test.mjs` — 28/28 pass.
- `npm run build` — pass; delivery receipt `sha256:f90f9eb90a07d18b4c1d7648a8f7fbacd532a95cac7b499bf1ad0ed1d4cd98d3`.
- `npm test` — 2,355/2,356 pass. The sole failure is the pre-existing `tests/hyperframes-runtime-acceptance.test.mjs` expectation that looks for the superseded two-argument `derivedSamples(manifest, timestamps)` call in `scripts/hyperframes-pixel-capture.cjs`; this Reference Workbench change does not touch that path.
- Live canonical Electron at `http://127.0.0.1:8797`: 137 song tiles rendered; Next changed `Dear Papa` to `Foreign Hawties` and updated notebook/Tarot/reference counts together; 853/853 GPT/Codex visuals exposed a bound loop; sampled hover reached media `readyState=4`, advanced playback, then paused and reset to `0` on exit.
- Live explanation dossier exposed “Why it connects,” two lyric moments, “What the Atlas understands,” provenance metadata, and the route back to the Atlas for the sampled Card.
