# Campfire direction extension

Status: prototype implementation, unaccepted. Echo owns the song, score and
append-only direction revisions; Campfire owns interpretation and rendering.
The optional `campfire` extension binds its schema, song ID, master SHA-256,
parent direction revision and composed score fingerprint. It carries bounded
stage defaults and cue-ID overrides, including open-ring motif and ending times.
It does not alter the score, lyric timing or master audio.

The direction save path validates extension structure, exact song/master/score
identity, known cue IDs and ending bounds before append. Optimistic concurrency
remains enforced by the direction ledger. When an Echo edit leaves both the
composed score and the previously saved extension unchanged, the owner updates
only the parent revision in the new copy. Older rows remain intact. A changed
extension must bind the current parent. If an edit changes the score, the owner
requires Campfire to be reauthored for that score or removed from the draft;
Score Dust offers an explicit draft removal action and keeps previous revisions.

`tests/echo-campfire-direction.test.mjs` exercises an isolated synthetic ledger,
including round-trip, stale and foreign binding rejection, changed score and
revision carry-forward. It does not by itself prove a real-song write, a running service refresh, or
Campfire rendering. Subsequently, the owner appended Thirsty in the Dark's
Campfire direction as revision 3 from revision 2; its score fingerprint is
`fnv1a:50752167`. The standalone stage played that saved direction through the
complete song in a sampled visual review. This is not human creative acceptance.

At the original checkpoint, the Echo preview integration remained uncommitted
and the shared server reported that it needed a restart. That statement records
the checkpoint, not today's service state. Later interface and playback evidence
is recorded in [the November 5 systemic review](postmortems/2026-11-05-campfire-systemic-review.md)
and [layout/layer review](postmortems/2026-11-05-campfire-layout-and-layers.md).

## Source packaging — November 7, 2026

Calder requested that GitHub catch up with local Builder. The previously
uncommitted integration, renderer dependencies, licenses and tests are now
included with the existing committed scene changes. The separate Audio Atlas
documentation revision explains analysis ownership and current interfaces.
This publishes the existing local implementation; it does not introduce a new
Campfire behavior or claim human creative acceptance.

Verification: 79 focused checks passed across Campfire direction, preview,
choreography, layers, lifecycle, spectrum, recording, stage assembly/frame export,
Score Dust performance, visual score and preview recording. The one recording
CLI check initially could not open a temporary loopback socket under restricted
execution, then passed when rerun with that access. The GitHub Pages-mode Vite
build passed using existing dependencies; it reported large-chunk warnings.
All 36 vendor source hashes matched their provenance manifest before packaging.
No full repository test-suite or new real-song playback acceptance is claimed.

Private song stores, audio, generated media, saved directions and local runtime
configuration remain outside Git. The unused local campfire-anvil image is not
part of this source package. No Builder service, queue or subscriber was started
or restarted for publication. A GitHub source update is separate from refreshing
an already-running local application.
