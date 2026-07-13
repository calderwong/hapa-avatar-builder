# Builder Overcard Runtime Context

`POST /api/overcard/runtime-context/preview` compiles a preview-only RuntimeContext for a proposed ResponsibilityBinding. It never executes a process and never treats visual placement as authority.

## Inputs and precedence

The request supplies the canonical binding and process definition, operator policy, process allowance, registered runtime capability, satisfied gates, optional trusted card constraints, provider/model, estimated tool calls, and settings layers.

Settings merge deterministically in this order, with later layers winning:

1. avatar runtime defaults;
2. process settings;
3. operator settings;
4. binding-specific settings.

Credential-shaped, raw-memory, private-fact, non-JSON, over-depth, and over-size values are removed. The preview reports rejected field paths but never their values. Secret references are handled separately by the least-privilege policy compiler.

## Source composition

The server resolves the principal Avatar Card and Mind, collection/deck membership, inventory, items/cards, Tarot, world scenes, songs, teams, process definition, binding, and registered runtime. The response includes exact source revisions and resolver routes plus counts and safe labels only. It does not copy Mind text, journal bodies, lyrics, scene timelines, credentials, or full source records.

Memory entries must pass both visibility and classification filters. The RuntimeContext receives bounded stable result references, not memory content. Read-only/projected source records can contribute references without gaining source mutation rights.

## Separate status axes

`status.avatarContext` says whether the avatar source exists and whether filtered context may be included. `status.executableRuntime` separately reports installed, running, trusted, authorized, and executable/context-only/denied state. An available avatar never implies an executable agent runtime.

## Preview contents

The response makes the following reviewable before activation:

- sources, owners, revisions, and resolver endpoints;
- allowed memory scopes and result references;
- deck/collection identities, revisions, and member keys;
- tool EntityRefs;
- provider, model, and sanitized settings;
- effective permissions and secret references;
- fallback behavior;
- estimated token, cost, concurrency, timeout, and tool-call limits;
- writeback allowance and approval requirement;
- redaction evidence.

Only a later explicit activation flow may persist an approved binding or submit this immutable context to a process adapter.
