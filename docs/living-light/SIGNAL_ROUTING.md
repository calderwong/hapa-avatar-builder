# Exact audio choices for Journey uses

Status: local source checkpoint, October 7, 2026. LL-006/008/021 remain in progress. Owner: Hapa Avatar Builder. Source chat: `01a1146f-fe68-76b3-a736-473042c3818c`, Calder's authorized board drain. Extends [prepared signals](SIGNALS_HOST.md) and [real-song measurements](REAL_SONG_SIGNALS.md).

## Behavior and ownership

The existing Journey editor now exposes **Audio choices for this use**. Each instance independently selects exact sources for its loudness and attack ports, chooses strongest/average/weighted-sum aggregation, and saves an explicit unavailable policy. Apply commits one undo snapshot; the existing recipe owner saves immutable revisions with its existing custody, attribution, concurrency and idempotency boundaries. Duplicate copies choices into an independent use; replace clears them. Locks protect choices as well as parameters and intervals. Audible selection stays with the existing Echo transport and is independent of visual participation.

Choices are authoring intent, not source or timing approval. Prepared source bindings still have no applied album stem maps. The new renderer consumes the selected bank's validated maps when present, and otherwise reports unavailable timing. It does not adopt Atlas proposals, create human acceptance, infer zero offset or join sources by role/title. The October 7 Atlas full-library checkpoint concerns editorial video selection and remains separate from applied stem timing.

The signal binding has its own nested version while the enclosing Journey remains v1:

```json
{
  "schemaVersion": "hapa.living-light.signal-binding.v1",
  "sourceRefs": [
    {"kind": "stem", "assetId": "Guitar / texture #2"},
    {"kind": "stem", "assetId": "master"}
  ],
  "feature": "energy",
  "aggregation": "weighted-sum",
  "weights": [0.25, 0.75],
  "onUnavailable": "neutral"
}
```

The song master is `{kind:"master"}`; a stem literally named `master` is `{kind:"stem",assetId:"master"}`. Asset IDs retain arbitrary bounded text rather than Card identifier syntax. Up to 33 unique refs address the master plus the existing maximum 32 stem declarations. Duplicate refs, unsupported fields/version, port-feature mismatch, mismatched/negative/nonfinite weights and totals above one reject before a save. Weighted sum requires an explicit weight per ref; zero-weight unknown contributions do not poison the result. Other aggregations reject weights. An unknown or removed saved asset remains visible intent and unavailable in the selected source, never a role-based substitute.

The `energy` port accepts energy; `onset` accepts the named transformed positive loudness-change envelope. Master provides energy only. Existing unversioned `source` bindings remain readable authoring metadata; they must be re-selected as exact refs before signal execution. No automatic migration interprets a legacy role string as an asset.

## Runtime policies

Evaluation is stateless in source time. The active instance changes at authored half-open interval boundaries, with the terminal sample attached to the final instance. Backward seeks reproduce the same routing result. No new decoder, AudioContext, audible mixer or animation loop is created.

An explicit energy binding replaces the global basic-master offsets for that instance. Unbound energy retains the existing basic-master default. The versioned host transformation adds energy × 0.4 to emission and energy × 0.05 to structural breath; onset adds its normalized value × 0.25 to the existing light-impulse control. All offsets are applied after inherited evaluation and clamped to native parameter limits. These are bounded display responses, not complete prototype feature equivalence, certified beats, physical simulation or full geometric articulation.

| Unavailable policy | Result |
| --- | --- |
| `neutral` | Selected response offsets are zero; missing/unverified evidence remains unknown. No master substitution. |
| `master` | Energy only: explicitly sample the verified prepared master and expose the fallback separately from the unavailable stem selection. |
| `block` | Skip GPU painting while the selected signal is unavailable. Keep the editor and driver recoverable; this does not pause the audible song. With no prior picture, the canvas may remain empty. |

The existing host mode selector enables prepared response explicitly. Neutral study leaves saved audio choices inactive. Runtime and visible status distinguish measured, neutral-unavailable, explicit-master-fallback and blocked. The renderer checks its own router before painting rather than trusting the packet's public diagnostic flag. Continuous multi-instance schedules and figures remain outside the current renderer boundary; authored native Location/passage tours are supported.

## API, CLI and portable parity

The same Journey validation/service used by UI handles bindings through the existing protected create/revise/get/history routes, existing `save --kind journey --file REQUEST.json` CLI input, and portable export/reviewed import. Capabilities expose `schemas.signalBinding`. There is no new side database, timing-write endpoint or source-path client field. Imported choices retain intent; imports do not adopt source qualification or human authority. Fork-to-another-song behavior continues resetting source-specific bindings through the existing reviewed fork owner. The focused restart fixture exercises actual CLI parsing/transport through the protected route and native service (mock HTTP transport), including dry-run, save and exact get; the separate complete API and browser probes use real HTTP.

## Verification and limits

`routing-final.log` passes 140/140 across all 24 Living Light test files, including the actual isolated authenticated API, analysis/publication, authoring, notes, custody, imports/forks, CLI, transport and cleanup paths. Its SHA-256 is `6f02585ad82ac772d05412ee803000d9f0e3f989d3a027ba8886ac169e43c494`. After adding one native tour-boundary case, `routing-tour-final.log` passes 7/7 routing tests (six overlap the 140, so 141 distinct checks); SHA-256 `21361d94e7151032050a2d895f8b9dfa9bae19328db5c3028ab66036bc79aa86`. The later CLI/route parity extension passes the same 7/7 in `routing-parity-final.log`, SHA-256 `5e1e5644a355e298d997fa99ee792eea9e113e57c99c7ce5268184d04703b84b`; it adds coverage within an existing check rather than a new count. These are affected integration tests, not a fresh repository-wide suite or board acceptance.

An isolated actual Chrome 154 / WebGL2 / ANGLE Metal M3 Ultra probe prepared real synthetic WAV measurements, selected two Guitar peers including a stem named `master`, saved weights 0.25/0.75, reloaded and reopened the owner-saved recipe, then exercised neutral, explicit master and block policies. Diagnostics showed one canvas, zero additional audible contexts, 3,800 resident feature bytes, 14 programs and zero paused frame handles. Blocking produced zero GPU draws without a failed driver. At 390×844, document width was 375 pixels; choices and weights remained visible without horizontal overflow. The screenshot was observed inline; no durable screenshot export is claimed. Evidence: task-local `routing-native-observations.json`, `routing-ui-proof-receipt.json` and `routing-ui.log.receipt.json`.

The native probe precedes a wording clarification and the final internal-router paint guard; the final integration run and build cover those changes. The production delivery build is recorded in `routing-delivery-final.log.receipt.json`. It passed in 1.385 seconds; log SHA-256 `682ffd6f7d7917ce454e7122dafb5f7a6176bb1e743e86577b0b7294c67d3741`. Temporary sources/stores remained unchanged; proof servers, ports, roots and process groups were released. Actual album maps, synchronized album stem painting, full catalog/GPU scale, complete parent/Hand parity, running Desktop delivery, final encoding and Calder's creative acceptance remain open. Prior two-song source-local amplitude evidence is reused; it does not become synchronized visualization evidence here.

## Process boundary and learning delta

No new process path was introduced. The file-based UI proof reused the existing bounded Vite/API/preparation owners: one API; sequential Python analyzer → FFmpeg and Node publisher → FFprobe; one Vite build. The outer owner bounded 32 observed descendants and 510 seconds, with zero retries; normal cleanup was requested through the proof's existing SIGTERM handler after the tab closed. It exited in 129.677 seconds with no lingering descendants, released ports and absent temporary root. The integration runner used one test file at a time; the deepest preparation path is wrapper → Node test runner → fixture → API → analyzer → decoder. Worker arguments are explicit files, parent `NODE_OPTIONS` is stripped, temporary stores are scoped, and shutdown retains bounded TERM/KILL fallbacks.

Objective: preserve reusable per-use audio intent while timing remains unresolved. Reuse: existing Journey actions/persistence/custody, bank/cache, source clock and inherited native parameter controls. Useful correction: string `master` addressing was ambiguous with a real stem ID; typed refs preserve both identities. The first documentation patch used an incomplete whole-line context and was rejected atomically; it was reapplied with scoped exact contexts, without partial file changes. A loopback board read failed because the UI endpoint was unavailable; the existing board owner read path returned the authoritative state without starting a replacement store. No global refresh or new analysis campaign was needed.

Reusable Decision/Flow-explainer candidate, attributed to this chat: save intent independently of qualification, and preserve the original selection when an explicit fallback is used. Next consume the real applied-map owner boundary, extend articulation/catalog acceptance and complete the running Desktop/Hand delivery path. Keep the original board criteria intact.
