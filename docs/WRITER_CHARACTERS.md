# Shared character layers

Status: local prototype. Avatar Builder owns this integration and its source
projection; Second Brain owns the new character-layer revision history.

The Builder and Avatar Mind screens offer **Open shared layers** for the selected Avatar.
It embeds the connected Writer’s Room character editor and links to the full
room. The frame loads only after the operator opens it. The exact Avatar ID
crosses that boundary; its name is a label, never a join key.

The reused surfaces are the existing `hapa.avatar-card.v1` record,
`hapa.avatar-mind.v1`, Builder media assets, Writer’s Room, and Second Brain’s
owner CLI. No replacement Avatar store, model worker, or duplicate mutable
layer copy is introduced. See [Writer’s Room service](WRITER_ROOM_SERVICE.md)
for the focused loopback entrypoint.

## Ownership and scope

- Builder retains identity, existing Mind, appearances, source/rights metadata,
  and generated assets. Rumor, disputed, and generated classifications remain
  source context; reading does not promote them into canon.
- Second Brain stores four editable text layers: Canon, Memory, Development,
  and Lore. Revisions append under exact `owner: hapa-avatar-builder`,
  `avatarId`, and `{projectId, branchId, sceneId}`. Global is an explicit scope.
- A fictional character’s Memory layer is independent of an Agent Writer’s
  private `agent:*` history. Private agent memory is not copied into characters.
- Builder `soulSeed.avatarId` references its Avatar. Its consciousness `copyId`
  and Writer’s Room Soul/Self IDs remain distinct. The adapter never infers an
  identity mapping from a name, appearance, generated image, or similarity.

`ownerRevision` is a SHA-256 digest of the displayed Builder projection plus
native update and asset identity commitments. It is not a Card custody
revision or Overwind acknowledgement. `memory.revision` and `memory.digest`
identify the separate authoritative Second Brain head.

The native Mind preview is bounded. Shortened or omitted records are listed
explicitly; the complete native Mind remains available in Builder. Appearance
links resolve owned asset IDs through authenticated routes. Filesystem paths
and arbitrary URLs never become browser asset capabilities.

## API and CLI

The response contract is `hapa.writer-characters/v2`; the route family remains
`/v1/writer-characters`:

| Operation | Route |
| --- | --- |
| Capabilities | `GET /capabilities` beneath the route family |
| List | `GET` with `q`, `offset`, and `limit` (maximum 100) |
| Read one | `GET /:avatarId` with explicit scope query fields; optional UTC `asOf` |
| Exact past revision | `GET /:avatarId/revisions/:revision` with the same scope |
| Save | `PUT /:avatarId` |
| Refresh | `POST /:avatarId/sync` with `{scope}`; this does not write |
| History | `GET /:avatarId/history?limit=20&beforeRevision=N`; metadata only |
| Verify history page | `GET /:avatarId/verify?limit=20&beforeRevision=N` |
| Checkpoint history | `GET /checkpoints?projectId=ID&branchId=ID&limit=20&beforeRevision=N` |
| Read checkpoint | `GET /checkpoints/current` or `/checkpoints/:revision`; project/branch query, optional `asOf` on current |
| Append checkpoint | `POST /checkpoints` |
| Owned asset | `GET /:avatarId/assets/:assetId` |

Save supplies `operationId`, `scope`, `expectedOwnerRevision`,
`expectedMemoryRevision`, `expectedMemoryDigest`, exactly four `layers`,
nonempty structured `sources`, and `provenance`. There is no per-layer
character or byte length limit. A stale owner or memory revision returns 409.
The draft is preserved for comparison; there is no automatic merge.
`dryRun: true` validates without saving.

Each caller source has `owner`, `id`, and `revision`, with optional `digest`,
`kind`, and `uri`. An explicitly unversioned authored note can use the honest
revision value `unversioned`. The adapter appends its own exact Builder
projection ID, revision, and SHA-256 digest. Caller source claims are
attribution, not independently authenticated evidence. Up to 127 caller
references plus the Builder reference fit the owner source envelope; source
IDs are bounded metadata (240 characters each, URI 4096). No text is silently
shortened on this authoring route.

Normal provenance is `{changeType: "edit", reason: "…"}`. An exact restore
uses `changeType: "restore"` and `restoreFrom: {revision, digest}`, with the
historical layers and current compare-and-save revision/digest. The owner
checks the historical hash and content, then appends a new revision. It never
rewinds, updates, or deletes a stored revision. Reasons are bounded provenance
metadata (16000 characters); longer discussion belongs in the authored layers
or an attributed source.

New owner records contain a UTC timestamp, operation ID, derived caller and
runtime instance, structured sources, change reason/type, previous digest,
record version, hash algorithm, and canonicalization identifier. Existing v1
records keep their original bytes and hashes. Historical reads expose
`historical` and `currentMemoryHead` separately. History lists are metadata
pages (maximum 100), with an exclusive `beforeRevision` cursor. Reading a
revision verifies its payload and parent link; the verify route verifies the
selected page. Listing metadata alone is not a full payload integrity check.

**Historical scope:** stored four-layer text is available exactly by revision
or timestamp. `sourceContextState: current-owner-projection` labels native
Builder Mind/context and appearance links as the current owner projection.
Their recorded source digest is a commitment, not a saved historical asset or
Mind body. The editor must not present current images as reconstructed past
visuals.

Project checkpoints belong to `hapa-writers-room`, keyed by exact project ID
and optional branch ID. They preserve the exact `snapshotJson` string plus
its UTF-8 SHA-256, exact scoped character revision/digest references, and song
references with owner ID/revision/digest and pinned excerpt metadata. The
owner checks character references against actual permitted records and checks
pinned excerpt hashes. A checkpoint has its own current revision/digest CAS,
operation, sources, and provenance. Initial checkpoint provenance uses
`changeType: "checkpoint"`; exact restoration appends with `restoreFrom`.
Project permission is explicit in the private grant. Unknown projects are
refused instead of acquiring access through a character name or draft.


Unavailable Second Brain returns `memoryStatus: unavailable` and `memory:
null`, never an empty successful head. An authorized uninitialized scope is
explicitly revision zero with null digest. Both apps read the same owner head,
so an authorized Second Brain edit appears on refresh. A save response reports
`saved` separately from the returned character view.

The parity client is `node cli/writer-characters.mjs`. It supports `list`,
`read`, `history`, `verify`, `sync`, `capabilities`, `save --file request.json
--dry-run`, `checkpoint-read`, `checkpoint-history`, and `checkpoint-save`.
Historical reads use `--revision N` or `--as-of UTC-ISO`; pages use
`--before N --limit N`. The default service is literal loopback port 8795. The CLI loads
its owner-only API credential through the private service configuration, with
an optional `HAPA_WRITER_ROOM_ADMIN_TOKEN` environment override. Credentials
never enter argv or the browser. Private configuration and token files must
be bounded, owner-only regular files, not symbolic links. JSON output and a
nonzero failure exit are provided. CLI writes record `api-client`; browser
writes record `local-operator`. These are caller attribution labels, not proof
of an authenticated human identity.

## Browser session and process boundary

The first-party UI makes an empty POST to `/v1/writer-characters/session`
with `X-Hapa-First-Party: writers-room`. The server checks literal loopback
bind and peer, exact Host/Origin, and `Sec-Fetch-Site: same-origin`. Its opaque
20-minute cookie is HttpOnly and SameSite Strict. Protected mutations repeat
origin and intent checks. Asset elements use same-origin fetch metadata and
referrer alongside the cookie. A typed `writer_session_required` rejection is
marked `preDispatch`; a client may refresh the session once. An ambiguous
transport failure must never trigger automatic save replay.

The adapter invokes only Second Brain’s file-based `character_memory.py` CLI.
One child may run at a time; concurrent requests receive an explicit busy
state. Arguments are fixed, shell use is disabled, Python environment and
user-site preload are disabled, and a role marker prevents server recursion.
Default input/output transfer resource budgets are 32 MiB and 64 MiB,
configurable as `requestLimitBytes`/`outputLimitBytes` in the owner service
configuration. These are finite transfer budgets, not field-authoring limits;
the current capabilities report them. The output budget applies to the
Second Brain reply; the HTTP detail adds a bounded Builder display projection.
An oversized input is rejected before writing, and the owner checks its exact
serialized output budget inside the transaction before commit. Oversized
responses roll back. Text is never truncated, and a failed transfer is never
reported as saved. Diagnostics remain bounded at 64 KiB and execution at
15 seconds. Disconnect, timeout, and shutdown terminate the owned child,
escalating to SIGKILL after 750 ms and awaiting exit. There is no retry loop,
new background worker, or network call in the Python owner path.

## Verification and learning delta

Source: [Codex character-sync implementation lane](codex://threads/01a10529-6842-7d41-841a-5561960bdc01),
coordinated within Calder’s Avatar Builder / Writer’s Room / Second Brain task.
This derived note preserves the implementation lane’s source identity; it is
not an adoption of another agent or a replacement for the raw turns.

`tests/writer-characters.test.mjs` covers identity/classification preservation,
lossless long UTF-8 text, transfer rejection, strict bootstrap and LAN denial, bounded lists, revision conflicts,
read-only refresh, unavailable memory, expiry, child configuration and cleanup,
split UTF-8 output, and distinct caller attribution. The runtime wrapper and
Writer’s Room frontend carry separate integration checks. Source checks are
not presented as a live runtime receipt.

The installed Builder’s existing full-library hydration stalled its outer
renderer during the live acceptance attempt, including native clicks. The new
panel was visible before that workload, but an end-to-end click through that
outer renderer remains unverified. The connected room is independently
usable. The cross-port iframe boundary passed a browser proof through a
temporary, clearly labeled fixture on Builder’s real origin (8797), loading
the installed editor on 8795. It read the exact Red global head at revision 3,
then saved the unchanged empty layers as revision 4. The screenshot is retained
with the coordinated Writer’s Room verification receipt. The temporary fixture
was removed after capture. This proves the iframe transport and editing
boundary; it does not replace verification of the outer legacy product UI.
The unrelated hydration behavior was not changed in this task. Full legacy
`npm test` and the expanded Echo/Tarot Electron smoke were not run because
their native-store and process isolation was not established for this scoped
change. Targeted adapter tests, the application build, and Overcard tests are
reported separately in the integration receipt.

Objective: edit character layers across writing and embodiment surfaces.
The native Mind already contains rich classified context, but its legacy PUT
is not a cross-owner revision protocol. Reuse succeeded at stable Avatar
identity and source presentation. An early proposal to store new layers in
both Mind and Second Brain would have introduced two mutable heads; the
implemented design gives Second Brain the sole layer history. The full
Builder server also has LAN and unrelated recovery behavior, so this feature
uses a focused loopback entrypoint within the same owner. Guardrail:
connection is not identity adoption, source-class promotion, or permission to
start unrelated workers. This is a Flow-explainer and Decision Card candidate,
derived from the character-sync task; it does not replace raw conversation
provenance.

### Additional live UI proof — current status

The later live check supersedes the initial outer-renderer **unverified**
status above, which is retained as the history of that acceptance attempt.
After several minutes of the existing full-library hydration, the delayed
native **Open shared layers** click completed in the actual Builder at
`8797/?view=builder`. Its panel changed to **Close shared layers**, and the
embedded Red dossier loaded the current global memory head at revision 4,
with the owner revision and editable Canon field visible. The real Builder
panel’s open-and-read workflow is therefore verified. The save proof remains
the separate real-origin fixture test recorded above; this later check did
not perform another save.

Evidence: `builder-character-panel.jpg`, SHA-256
`dab27151536cb35696f92e5a727302fdbc602461db907a9674423a25f47a86a3`,
retained with the coordinated Writer’s Room verification receipt. The long
legacy hydration delay and high renderer memory use remain material usability
limits. This additional proof changes the acceptance evidence, not the native
loading implementation or the scope of the completed test suites.

### History and checkpoint extension — source verification

The v2 extension removes the former 16 KiB authoring restriction, adds exact
historical reads and append-only restores, requires caller sources/reasons,
and provides project checkpoints. The authenticated extension callback lets
the source-owned Echo read adapter share this session boundary; it runs only
after authentication and origin checks. It does not gain a new public route
or a second browser credential.

The focused adapter suite has 15 tests covering these boundaries. The opt-in
`tests/writer-characters-owner.test.mjs` invokes the actual finite Python owner
against a temporary fixture database and private fixture grant. It verifies
large non-Latin text round-trip, two edits, exact historical read, paginated
metadata, restore as a third revision, output-limit rollback, checkpoint pins,
and a verified history page. The fixture is deleted and child shutdown is
awaited. It never reads or writes the native private character store. Run it
with explicit absolute `HAPA_WRITER_CHARACTER_TEST_OWNER` and, if needed,
`HAPA_WRITER_CHARACTER_TEST_DEPENDENCIES` paths. The owner integration fixture
is skipped unless explicitly selected. Live installation and UI acceptance
for this extension are recorded by the coordinated Writer’s Room receipt;
these source tests do not claim that separate acceptance.
