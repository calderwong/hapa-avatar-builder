import { randomBytes } from "node:crypto";

export const STARGATE_PASS_REQUEST_RECEIPT_SCHEMA = "hapa.stargate-pass-request-receipt.v1";

function text(value) { return String(value || "").trim(); }

export class StargateGatePassBroker {
  constructor({ ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(30_000, Number(ttlMs || 0));
    this.now = now;
    this.requests = new Map();
  }

  prune() {
    const now = this.now();
    for (const [id, request] of this.requests) if (request.expiresAtMs <= now) this.requests.delete(id);
  }

  request({ cardId = "", revision = 0, actorId = "", consent = false, formationCommitment = "", contextCommitment = "" } = {}) {
    if (consent !== true) throw Object.assign(new Error("Explicit receiving-node consent is required to request a fresh Gate Pass."), { code: "stargate_pass_consent_required", statusCode: 422 });
    const expectedRevision = Number(revision || 0);
    if (!text(cardId).startsWith("hapa-card:v1:") || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw Object.assign(new Error("A stable Return Card identity and pinned revision are required."), { code: "invalid_stargate_pass_request", statusCode: 422 });
    if (!text(actorId)) throw Object.assign(new Error("A locally asserted requesting actor is required."), { code: "stargate_pass_actor_required", statusCode: 422 });
    this.prune();
    const requestedAtMs = this.now();
    const requestId = `hapa-gate-pass-request:v1:${randomBytes(16).toString("base64url")}`;
    const receipt = {
      ok: true,
      schemaVersion: STARGATE_PASS_REQUEST_RECEIPT_SCHEMA,
      requestId,
      state: "awaiting_direct_peer_pass",
      sourceCard: { globalCardId: text(cardId), pinnedRevision: expectedRevision },
      commitments: { formation: text(formationCommitment) || null, context: text(contextCommitment) || null },
      authority: { requestedBy: text(actorId), identityAssurance: "locally-asserted-not-remotely-verified", explicitConsent: true },
      requestedAt: new Date(requestedAtMs).toISOString(),
      expiresAt: new Date(requestedAtMs + this.ttlMs).toISOString(),
      delivery: { route: "direct-card-p2p", catalogRequired: false, transportStarted: false },
      pass: { present: false, verified: false, persisted: false },
      join: { allowed: false, attempted: false, reason: "A fresh peer-issued Pass has not been received and verified." },
      effects: { catalog_contacted: false, p2p_joined: false, external_writes: 0 }
    };
    this.requests.set(requestId, { receipt, expiresAtMs: requestedAtMs + this.ttlMs });
    return receipt;
  }

  status(requestId = "") {
    this.prune();
    const row = this.requests.get(text(requestId));
    if (!row) throw Object.assign(new Error("Gate Pass request is unavailable or expired."), { code: "stargate_pass_request_unavailable", statusCode: 404 });
    return row.receipt;
  }
}
