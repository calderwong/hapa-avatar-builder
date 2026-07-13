# Red manages the next Hell Week run

Hell Week is owned and executed by `hapa-dev-proto`. Avatar Builder owns Red's Avatar/Mind source and the visual responsibility controls. Attaching Red to the Hell Week Manager slot and choosing **Request authority** writes an active canonical `ResponsibilityBinding`; it does not run Hell Week or copy Red's private memory.

The Hell Week view distinguishes:

- Avatar context available in Builder;
- remote executable runtime discovered and explicitly trusted/authorized;
- a context queued for the next run;
- process-default fallback.

**Prepare next run** requires an explicit confirmation, an authenticated Dev Proto debug endpoint configured through `HAPA_DEV_PROTO_DEBUG_URL` and `HAPA_DEV_PROTO_DEBUG_TOKEN`, a compatible canonical capability envelope, and node-matched trust/authorization grants. Builder reloads current source records, compiles least privilege, freezes `hapa.runtime-context.v1`, and sends it to Dev Proto's durable next-run inbox. Credentials remain server-side; telemetry and receipts contain only principal, binding, Formation, collection, source-revision, snapshot, and trace references.

Dev Proto consumes the inbox exactly once when the next Hell Week pipeline begins without an explicit context. The run keeps its immutable snapshot. Pause asks the current run to stop at its declared checkpoint and makes the next run use defaults. Revoke/remove do not rewrite an in-flight snapshot; they remove next-run authority and restore process defaults.

If Dev Proto is offline, untrusted, unauthorized, incompatible, or not configured, preparation fails visibly and Hell Week keeps its existing Leo/Thor/provider defaults. Visual attachment never impersonates Red.
