# Echo Reference Visual Interaction Specification

Status: First Pass / Prototype specification  
Scope: visual/navigation contract only; product implementation remains review-gated

## Reused surface

The current Hapa Songs reference panel remains the compact evidence list. The new experience composes around it; it does not replace playback, lyrics, current connectors, or the Echos director.

## Shared interaction state

One state projection coordinates:

```text
active song
playback time
selected lyric span
focused Reference Card/revision
active semantic lenses
focused graph neighborhood and path history
open evidence/comparison/contribution surface
visibility mode (approved-only or candidate)
```

Deep links may restore this projection but never embed private evidence or authority tokens.

## Progressive modes

| Mode | Primary user | Visible layers |
|---|---|---|
| Listen | Casual listener | Player, lyrics, one active approved card, compact cue markers |
| Explore | Album researcher | Timeline heatmap, card rail, semantic lenses, focused graph, evidence drawer |
| Compare | Reviewer/contributor | Competing interpretations, source/claim diff, challenge state, affected paths |
| Review | Authorized reviewer | Queue, complete provenance, private-safe evidence, decision and impact preview |

Candidate content is opt-in outside Review mode.

## Layer precedence

1. Playback controls and essential song state remain reachable.
2. Lyrics and current cue remain readable.
3. Active card may overlay unused space but cannot cover controls or lyric focus.
4. Timeline and semantic lenses are collapsible.
5. Graph/atlas use a dedicated workspace or split view.
6. Evidence, compare, Add, and Challenge surfaces open as drawers/modals with focus trapping and a clear return path.
7. Safety/privacy alerts outrank ordinary contribution state.

## Visual layers

### Playback card rail

- Shows approved public-safe cards by default.
- One primary card follows the active lyric cue; overlapping cards group.
- Pinning a card pauses automatic replacement, not song playback.
- Opening evidence retains playback time and graph focus.

### Lyric timeline and heatmap

- Marks density, exact cue spans, unresolved leads, proposals, and challenges.
- Selecting a marker seeks or previews that moment.
- Untimed lyrics use section markers and disclose reduced precision.
- Status is encoded with label/icon/pattern as well as color.

### Semantic lenses

Available lenses:

- evidence and confidence;
- review/canon state;
- people, places, media, and external works;
- motifs and recurring phrases;
- mechanics and narrative rules;
- emotions and transformations;
- unresolved namespaces;
- proposals and challenged claims.

Filters never mutate graph data. Hidden items explain which lens excluded them.

### Album atlas

Provides song×reference-family and song×song matrices plus small multiples. Sparse cells mean “coverage incomplete or no current connection,” not “no meaning.”

### Relational mind map

- Highlights the current song, cue, card, and active path.
- Search resolves aliases and exact lyric phrases.
- Minimap, breadcrumbs, back/forward history, focus mode, and stable layout preserve orientation.
- Every edge opens “why this connection?” evidence.

### Evidence inspector

Separates:

- source fact;
- lyric observation;
- model/agent inference;
- Human decision;
- canon action.

It shows citation health, rights/privacy projection, revision history, derivation, caveats, and downstream impact.

### Interpretation comparison

Displays alternative, complementary, contradictory, challenged, rejected, and superseded readings without forcing a winner. Each reading keeps its own claims, confidence, authority, and album path.

## Add and Challenge entry points

Users may invoke **Add reference** or **Challenge / counterinterpret** from:

- active playback card;
- lyric line or timeline marker;
- graph node/edge;
- evidence inspector;
- comparison canvas;
- album atlas cell.

The composer inherits current song, time, lyric span, card revision, and graph path. Before submission it displays attribution, visibility, rights, privacy, evidence requirements, and the fact that submission does not edit or canonize the target.

## Responsive behavior

### Desktop

Player/lyrics remain left or top; rail/timeline remain adjacent; graph/atlas may use split or full workspace; evidence and compare open in a resizable drawer.

### Phone

Player stays sticky; active card becomes a compact sheet; timeline scrolls horizontally; graph defaults to focused neighborhood/list traversal; drawers become full-height sheets with return-to-playing control.

## Accessibility

- Complete keyboard order and shortcuts for playback, cue navigation, card focus, graph traversal, and return.
- Screen-reader graph represented as an ordered relationship list with source/target/relation/reason.
- Reduced motion replaces animated edge/cue transitions with stable selection changes.
- High-contrast and non-color encodings for evidence, confidence, review, challenge, and canon.
- Touch targets meet platform guidance.
- Live regions announce cue/card changes only at a bounded rate and pause when a card is pinned.

## State and failure handling

- Missing timings: section fallback.
- Missing citation: unsupported state; no verified badge.
- Stale citation: freshness warning and review action.
- Offline: cached approved projection only; external research/add/challenge submission is queued or disabled explicitly.
- Dense graph: clustering and focused neighborhood.
- Deep-link target withdrawn/private: explain unavailable state without revealing content.
- Contribution rejected or superseded: preserve status and attribution, but do not show it as current guidance.

## Verification scenarios

1. Play, seek, pause, resume, and change rate through overlapping cues.
2. Pin a card, traverse three songs, and return to the original playback moment.
3. Switch semantic lenses during playback without losing focus.
4. Compare two interpretations with different evidence classes.
5. Open Add from a lyric moment and Challenge from a graph edge; confirm neither mutates approved state.
6. Complete the same journey with keyboard, screen reader, reduced motion, and phone layout.
7. Open a public deep link and prove private clues/citations are absent.
