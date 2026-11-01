# One complete rollback generation

Adopted requirement, 2026-11-01. Source: Calder's direct instruction to measure
duplicates, preserve a full reversible backup before a change, and keep only one
full backup after confirmation instead of accumulating snapshots.

## Required behavior

1. Declare the recovery scope before the change: all affected stores, related
   records, schema/code compatibility, and referenced objects needed to restore
   the coherent pre-change state. Default to the owning project, not one scope
   per job, retry, file, or timestamp. Independently recoverable applications may
   have separate scopes; related stores must share a consistent boundary.
2. Prepare a complete pre-change recovery point before mutation. Use one manifest
   and reuse immutable content by digest; a complete backup need not copy every
   unchanged payload again. Hash and read back new objects, validate the manifest
   and prove the scoped restoration path. Copying some JSON files is insufficient
   if their media, related stores, or restore dependencies are absent.
3. Preserve the previous retained point while the candidate/change is pending.
   Serialize overlapping changes or bind them to one explicit transaction; no
   independent writers racing to replace the recovery pointer. Failed,
   interrupted, uncertain or rejected changes keep their required rollback data.
4. Confirm the exact change with owner-specific validation and durable readback.
   Record the pre/post revisions, checks and accepting actor. Process exit zero,
   age, a new filename, or a file-write success alone is not confirmation.
5. Atomically select the verified **pre-change** candidate as the single retained
   full rollback generation after confirmation. This is the state that undoes the
   latest confirmed change, not merely another copy of its resulting state.
   Preserve unchanged members in the complete manifest.
6. Retire superseded backup payloads in the same operation's completion phase,
   after rechecking the retained point, current references and pins under the
   owner lock. Only objects unreachable from current data, the retained manifest,
   unresolved changes and active readers are eligible. Shared objects stay once.
   Preserve small receipts of revisions, hashes, acceptance and retirement, not
   full copies inside those receipts.
7. A crash between promotion and cleanup leaves a resumable cleanup receipt.
   Reconcile that receipt before admitting another backup-producing change;
   never stack more full snapshots while cleanup is failing. Report blocked
   cleanup explicitly. Never prune the sole valid recovery point first.

Steady state is current data plus **one** complete rollback generation. A
transition may temporarily retain the previous point and one pending candidate,
within a declared aggregate byte reservation. An unresolved incident may retain
its needed evidence, but must block further accumulation in the affected scope;
it is not an indefinite retention exemption. No automatic periodic full snapshot
schedule is introduced.

Full media and retained full-size evidence follow the registered external store
policy. Local JSON/catalog recovery is byte bounded. Account for manifests,
database journals, receipts and temporary writes as well as payloads. A missing
external drive holds the operation; it never triggers an SSD mirror. A same-disk
rollback copy is not independent protection against disk failure. Independently
required disaster-recovery replicas must be named separately, not multiplied
silently under this rollback policy.

## Existing data and runtime adoption

This policy replaces the former unqualified instruction to create another
timestamped store backup. It is adopted for future agent work and new/changed
writers. It does **not** claim that all existing runtime writers already enforce
it. Historical backup consolidation must map snapshots to recovery scopes and
unresolved work, verify a complete retained point and references, then retire
qualified superseded payloads through that owner. Age, extension and exact
duplicate bytes alone are not deletion authority or proof of safe restoration.

Observed legacy paths requiring adoption include `server/song-audio-upload.mjs`,
`server/avatar-voice.mjs`, and `scripts/generate-music-video-plans.mjs`; they create
full snapshots without a shared confirmation/retirement owner. This is a bounded
source survey, not a complete writer inventory. No live service was restarted or
rewired by this documentation/audit change. Raw Library's running backup/index
queue and its existing recovery evidence remain untouched.

Do not classify minted editions, distinct source recordings, accepted analysis,
creative cuts, or required incident evidence as backup generations merely because
their bytes match something else. Preserve their logical identities and history
when qualifying shared physical storage.

## Exact duplicate measurement

`scripts/audit-storage-duplicates.py` inventories one explicit project without
following symlinks or crossing devices. It hashes complete same-size candidates
with SHA-256, distinguishes inode aliases, checks identities before/after reads,
and excludes changed files from the duplicate result. Its resumable journal is
bound to the root and file identities. Partial runs report incomplete coverage.

Run from the project root with an output directory outside it:

```sh
python3 -B scripts/audit-storage-duplicates.py --root . --output /tmp/builder-duplicate-audit --seconds 900
python3 -B -m unittest discover -s tests -p test_storage_duplicates.py
```

One process/reader, no children, 4 MiB streaming buffer, at most 1,800 seconds per
invocation. This audit writes only metadata: a journal capped at 128 MiB with a
verified 4 KiB SQLite page size, two reports capped at 16 MiB each, plus atomic
replacement/journal overhead; budget 192 MiB total for the measured project.
It makes no media copies and deletes no source files. Measured logical duplicate
bytes are not guaranteed reclaimable physical space: APFS clones, hardlinks,
snapshots and retained references require separate accounting. Do not silently
resume an incomplete audit; inspect its progress and reuse its exact journal.

## Learning and acceptance record

The reused surface is the existing Builder backup/merge-report convention;
the new rule supplies its missing confirmation and retirement lifecycle. The
original label “Older Avatar Builder Project” was misleading: the canonical
checkout happens to live in a dated folder and remains active. File sizes and
dates established the storage concentration, not duplicate identity; complete
hashes establish exact byte equality. This is a reusable Decision/Lesson candidate
derived from the November 1 storage conversation, with no invented message ID.

The audit tests cover exact duplicates versus equal-size different contents,
hardlink/symlink handling, stale source refusal, resumable hashes, scope refusal
and deadline enforcement. No legacy payload deletion or fleet-wide retention
enforcement is claimed. Private audit results stay outside Git.
