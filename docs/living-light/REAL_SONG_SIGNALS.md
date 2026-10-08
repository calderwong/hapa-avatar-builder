# Living Light real-song measurements and CLI access

Status: bounded local checkpoint, October 7, 2026. LL-006/007/008/021 remain in progress. Canonical owner: Hapa Avatar Builder. Source chat: `01a1146f-fe68-76b3-a736-473042c3818c`, Calder's authorized board drain. Builds upon [exact signals](EXACT_ASSET_SIGNALS.md) and [native Workspace adoption](SIGNALS_HOST.md), source commits `bb6b1b3` / `f63d538`.

## Real album proof

Two exact canonical Songs were prepared serially through the existing Echo queue, analyzer, publication store and audible-master decoder. Every output/cache/job root was temporary. The proof did not open Echo's saved-cut UI, edit source files, publish a Card, apply alignment or run an album-wide campaign.

| Exact Song | Available / declared assets | Decoded master duration | Owned feature bytes | Preparation and comparison time |
| --- | --- | --- | --- | --- |
| `dear-papa-song-brave-tongues` | 12 / 24; 12 declarations lack measurements | 243.440167 seconds | 752,415 | 8.662 seconds |
| `dear-papa-song-gnow-her` | 9 / 9 | 219.56 seconds | 513,414 | 7.014 seconds |

These declaration counts include exact format-specific source records; they do not mean Brave Tongues has 24 audible instruments. Empty declarations remain distinct from measured silence. FX retains its exact asset ID while the transient binding explicitly maps its declared role to `other`.

For each Song, the master and one actual Drums asset were independently decoded to mono float32 at 8 kHz. Direct 800-sample-window RMS/peak were compared with prepared measurements at **0, 10, 30, 60 and 120 source seconds**, ten observations per Song. Maximum RMS difference was `2.13196447163e-8` for Brave Tongues and `9.48671882717e-9` for Gnow Her; all peak differences were below `1e-8`. Stem analysis PCM digests matched that direct decode. This corroborates source-local amplitude calculations, not independent acoustic timing, prototype feature equivalence, beat semantics or native per-stem painting.

Both exact source banks admitted the complete selected declarations. Master energy sampled successfully. Every available stem returned `alignment-unverified` for song-time sampling and every empty declaration returned missing. No zero-offset assumption or master substitution was introduced. Publication reads rechecked 13 / 10 source records without running analysis again. Source audio, canonical Song store and Songbook hashes matched before/after; all temporary outputs were removed.

Private task evidence: `execution/living-light/real-album-signals.json`, its file-based proof and `real-album-signals.log.receipt.json`. Total bounded owner time: 16.435 seconds; output SHA-256 `d3c68b1046b5e1c20d0cb14f53942d05b1e0bb05b6d039b726490fa296a6212f`. Process matching pre/post baselines were empty, no descendants remained, and temporary-root removal was verified. Private source paths/raw receipts remain outside the source commit.

## Protected agent interface

The existing `cli/living-light.mjs` adds these commands over the same protected preparation port used by the UI:

```text
signals --song EXACT_SONG_ID
prepare-signals --song EXACT_SONG_ID --request-id RETAINED_REQUEST_ID
signals-status --song EXACT_SONG_ID [--request-id ID | --job-id ID]
cancel-signals --song EXACT_SONG_ID --request-id ID
cancel-signals --song EXACT_SONG_ID --job-id ID
```

Keep the same request ID after an ambiguous preparation outcome, then query its status. The CLI never retries an ambiguous mutation automatically or writes stores directly. It requires environment-only `HAPA_AVATAR_ADMIN_TOKEN`; URL/argument credentials remain prohibited. Cancellation needs explicit request/job identity. A write requested with `--dry-run` is refused before dispatch; use the status command for inspection. Prepared reads allow a bounded 32 MiB response because real per-asset signals can exceed the existing 4 MiB metadata limit. Other commands retain that smaller bound and the ten-second transport timeout.

Protected capabilities now report the attached preparation adapter's policy, four operations, 32-asset limit, owner-resolved sources and unqualified stem visualization. If the port is absent, capabilities report owner unavailable. This capability is independent of authoring/Card custody, Atlas proposal review and actual Desktop delivery.

## Verification, reuse and remaining work

Thirteen targeted CLI/portable/port checks pass (1.391 seconds; output SHA-256 `dd02d6046cb76cfdf56e11e89fd48561c51e0aaeed0da20bbe57734477aef8c4`), including same-key job reuse, read/status/cancel, another Song's cancellation rejection, malformed/ambiguous options, no write for unsupported dry runs, one attempt on transport failure and separate signal/metadata response limits. The isolated full Builder API fixture additionally passes CLI exact-asset readback, source-path omission, ready-job status and attached capabilities through real authenticated HTTP (one fixture, 2.897 seconds; output SHA-256 `b47fb18cb090b77ade4bda6b3891a59afe94fa7f19dc6bf3c00e9be8f90a7278`). Both owned process baselines returned with no residual descendants. That fixture and shared server mount remain working-tree evidence outside this focused CLI/port commit. The canonical production build passes; see the task's `signals-cli-delivery-build.log.receipt.json`. No browser/native rerun is needed for these CLI/capability changes; the prior source/native proof remains bounded to its recorded inputs.

Reuse decision: keep Echo's queue and analyzer plus one protected preparation spine for UI and agents. Useful outcome: real twelve-/nine-stem inputs admit without role merging or source edits. Missing assumption corrected: the metadata CLI's 4 MiB ceiling cannot be assumed adequate for full per-asset publications; the larger bound applies only to prepared-signal reads. Reusable Lesson/Flow-explainer candidate, attributed to this chat: measured source-local signals can be verified while their relation to the song clock remains unresolved.

Audio Atlas currently publishes per-stem proposed maps, with no applied alignment map for Living Light to consume. Its existing immutable evidence and review owners must be extended or qualified through that owner; this checkpoint does not create a competing alignment store or label proposals verified. Per-instance signal controls, validated applied timing, full source-switch/runtime/Hand parity, actual Desktop reload, broad-current-revision and Calder's creative acceptance remain open. The board cards stay In Progress.

## Bounded process graph

One foreground Node proof owns one existing queue. For each of two Songs it runs a serial Python analyzer → Node publisher, with serial FFprobe/FFmpeg; then the existing audible decoder and two independent serial PCM decodes. The proof owns a 480-second abort deadline and finally releases banks/playback leases, closes the queue and removes its exact temporary root. An outer supervisor has a 520-second deadline, zero retries, sanitized NODE_OPTIONS, explicit file-based arguments, a worker-role guard, a 32-observed-descendant cap and bounded TERM/KILL cleanup. Maximum topology is outer Python → proof Node → analyzer Python → decoder, depth three edges. CLI tests introduce no worker; the existing API fixture owns two sequential isolated servers with ports/root/process cleanup. No service fleet, provider/model call, installs, global sync or background work is started.
