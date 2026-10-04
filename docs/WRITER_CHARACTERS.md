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

The route family is `/v1/writer-characters`:

| Operation | Route |
| --- | --- |
| Capabilities | `GET /capabilities` beneath the route family |
| List | `GET` with `q`, `offset`, and `limit` (maximum 100) |
| Read one | `GET /:avatarId` with explicit scope query fields |
| Save | `PUT /:avatarId` |
| Refresh | `POST /:avatarId/sync` with `{scope}`; this does not write |
| History | `GET /:avatarId/history` |
| Owned asset | `GET /:avatarId/assets/:assetId` |

Save supplies `operationId`, `scope`, `expectedOwnerRevision`,
`expectedMemoryRevision`, `expectedMemoryDigest`, and exactly four `layers`.
Each layer allows 16,384 UTF-8 bytes, with 65,536 bytes total. A stale owner or
memory revision returns 409. The draft is preserved for comparison; there is
no automatic merge. `dryRun: true` validates without saving.

Unavailable Second Brain returns `memoryStatus: unavailable` and `memory:
null`, never an empty successful head. An authorized uninitialized scope is
explicitly revision zero with null digest. Both apps read the same owner head,
so an authorized Second Brain edit appears on refresh. A save response reports
`saved` separately from the returned character view.

The parity client is `node cli/writer-characters.mjs`. It supports `list`,
`read`, `history`, `sync`, `capabilities`, and `save --file request.json
--dry-run`. The default service is literal loopback port 8795. The CLI loads
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
Input is capped at 256 KiB, output at 2 MiB, diagnostics at 64 KiB, and execution
at 15 seconds. Disconnect, timeout, and shutdown terminate the owned child,
escalating to SIGKILL after 750 ms and awaiting exit. There is no retry loop,
new background worker, or network call in the Python owner path.

## Verification and learning delta

Source: [Codex character-sync implementation lane](codex://threads/01a10529-6842-7d41-841a-5561960bdc01),
coordinated within Calder’s Avatar Builder / Writer’s Room / Second Brain task.
This derived note preserves the implementation lane’s source identity; it is
not an adoption of another agent or a replacement for the raw turns.

`tests/writer-characters.test.mjs` covers identity/classification preservation,
UTF-8 limits, strict bootstrap and LAN denial, bounded lists, revision conflicts,
read-only refresh, unavailable memory, expiry, child configuration and cleanup,
split UTF-8 output, and distinct caller attribution. The runtime wrapper and
Writer’s Room frontend carry separate integration checks. Source checks are
not presented as a live runtime receipt.

The installed Builder’s existing full-library hydration stalled its outer
renderer during the live acceptance attempt, including native clicks. The new
panel was visible before that workload, but an end-to-end click through that
outer renderer remains unverified. The connected room is independently
usable. The cross-port iframe boundary can be verified through a temporary,
clearly labeled test fixture on Builder’s real origin without loading the
legacy application; that is transport evidence, not a replacement product UI.
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
