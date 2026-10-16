# Prepared audio in managed Living Light renders

Status: source integration verified; actual album bound-scene render and running
API delivery pending. Full integration goal and human creative acceptance remain
open. Source: Codex /root, chat 01a137cc-de1d-7511-ab65-227c92d5bca0.

## Intended behavior and owner reuse

An exact saved Journey with audio choices must carry those measurements through
readiness certification and managed Song Card rendering. The offline snapshot
already supported them, but both callers omitted prepared input and consequently
refused every bound recipe. Neutral pilot renders did not establish this path.

Reuse the existing Living Light performance port and prepared store for current
Song/asset identity, and the existing Echo playback owner for sample-preserving
PCM evidence. No alternate analyzer, queue, alignment map, saved binding or
audio store was introduced. The render job supervises the playback receipt
operation; its existing cache lock serializes cache access.

## Change and verification

- Read measurements once per package, only when at least one saved recipe has
  audio choices. Neutral recipes retain their previous identity and do no audio
  preparation. Missing measurements fail before decoding; no analysis is started.
- Compare exact Song, source policy and measured master hash with the renderer's
  current master proof. Then obtain the existing playback owner's decoded PCM
  receipt and compare its source hash. Export only portable measurement fields.
- Preserve saved binding revision, sample rate, decoded duration, feature
  semantics and final soundtrack checks. Unknown stem alignment stays unknown.
- Readiness and managed rendering use the same reader and snapshot validator.
  The new reader and its source/playback dependencies participate in renderer
  identity, so their changes invalidate existing certificates.
- The render job reports its input-verification stage while preparation runs.

54 distinct affected checks pass: 53 source/package/readiness/identity tests and
one managed bridge test covering both neutral and bound recipes. The actual
two-second owner fixture analyzes separate same-role stems plus a missing asset,
prepares PCM, saves a bound Journey, and produces identical readiness/render
snapshots. Its exported master curve remains measured, its unaligned stem
remains unavailable, original audio hashes match, and no local paths escape.
The managed bridge also refuses a changed snapshot before successful persistence.
Syntax and diff checks pass. All owned processes returned to baseline.

Evidence is retained in this chat's `execution/living-light/prepared-render-source/`:
initial36-check log, final53-check log, bridge log, bounded cleanup receipts and
read-only pilot inspection. No new production UI build was needed for this
server-only source change; the previously tested Hand candidate bundle remains.

## Remaining work and correction

Read-only inspection found that the real 11:23 pilot master has **no prepared
Living Light performance bundle**. Prepare that exact song through the existing
owner, explicitly save its audio choices in a new Journey revision, select the
revision in a new cut, then qualify actual encoded output. Do not present the
synthetic owner fixture as real-album or native-pixel acceptance. Current API
process reload and final certification for the changed renderer are pending.

The initial plan was permanent Hand package adoption. Source review showed its
promotion changes both consumers and requires two-app gates; the verified local
candidate is still unpromoted. This remains an open delivery task, not a blocker
to the independent audio integration. Two mistaken source paths and one command
with the task directory instead of the app directory were corrected before edits;
they supplied no verification evidence.

Lesson / Flow-explainer candidate: qualify the same exact prepared source at
both certification and execution. A format's ability to carry a bank does not
prove its live callers supply one. Keep neutral-scene evidence separate from
bound-source evidence and preserve refusal until all identities agree.

No requirement status changed, production data was rewritten, paid generation
started, Card minted, or GitHub action performed. Recovery is a local source
revert followed by normal API delivery; saved cuts, Journeys and audio remain
unchanged. Existing accepted neutral output retains its historical evidence,
while any new render must obtain a fresh certificate for the current renderer.
