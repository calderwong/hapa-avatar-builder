import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";

export const WISDOM_COUNCIL_EVENT_SCHEMA = "hapa.avatar-builder.wisdom-council-event.v1";
export const WISDOM_COUNCIL_RUN_SCHEMA = "hapa.avatar-builder.wisdom-council-run.v1";
export const WISDOM_COUNCIL_LIST_SCHEMA = "hapa.avatar-builder.wisdom-council-list.v1";
export const WISDOM_COUNCIL_SEAL_SCHEMA = "hapa.avatar-builder.wisdom-council-seal.v1";
export const WISDOM_DISSENT_SCHEMA = "hapa.card-council-dissent-synthesis.v1";
export const WISDOM_RESULT_CARD_SCHEMA = "hapa.avatar-builder.wisdom-council-result-card.v1";
export const WISDOM_LESSON_CARD_SCHEMA = "hapa.avatar-builder.wisdom-council-lesson-card.v1";
export const WISDOM_COUNCIL_PROMPT_TEMPLATE = Object.freeze({
  id: "hapa-avatar-builder-peer-blind-wisdom-seat",
  version: "1.0.0",
  digest: sha256("Hapa Avatar Builder peer-blind Wisdom seat v1.0.0: one Card, frozen Context Packet, proposal-only"),
});

const ROLES = ["primary", "companion", "sentinel"];
const DISSENT_CLASSES = ["scope", "goal", "evidence", "mechanism", "true-tradeoff"];
const DIGEST = /^[a-f0-9]{64}$/;
export const WISDOM_COUNCIL_SYSTEM_PROMPT = "You are one peer-blind Hapa Wisdom Card advocate. Return only the requested JSON. Fill every required string with a concise, specific answer; never return an empty required string. You may use only the one Wisdom Card and frozen evidence supplied. You cannot see sibling Cards or outputs. Preserve uncertainty, identify guardrail risk, and propose only; never choose for the human, mutate sources, claim canon, or claim mint.";

function clone(value) { return structuredClone(value); }

function publicProvider(value = {}) {
  const { endpointOrigin: _endpointOrigin, ...provider } = value;
  return clone(provider);
}

function typedError(message, { code = "wisdom_council_rejected", statusCode = 422, details = null } = {}) {
  return Object.assign(new Error(message), { code, statusCode, details });
}

function text(value, label, max = 8_000) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw typedError(`${label} is required`);
  if (normalized.length > max) throw typedError(`${label} is too long`);
  return normalized;
}

function digest(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
  if (!DIGEST.test(normalized)) throw typedError(`${label} must be a lowercase SHA-256 digest`);
  return normalized;
}

function humanActor(value = {}) {
  const actor = { actorId: text(value.actorId, "actor.actorId", 160), actorType: text(value.actorType || "human", "actor.actorType", 40), displayName: text(value.displayName || value.actorId, "actor.displayName", 160) };
  if (actor.actorType !== "human") throw typedError("Only a human may initiate a Wisdom Council");
  return actor;
}

function safeEndpoint(value) {
  let parsed;
  try { parsed = new URL(String(value || "http://127.0.0.1:11434")); }
  catch { throw typedError("Ollama endpoint is invalid", { code: "invalid_provider_endpoint", statusCode: 400 }); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw typedError("Only a credential-free loopback Ollama origin is allowed", { code: "remote_provider_not_allowed", statusCode: 400 });
  }
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return { origin: `${parsed.protocol}//${host.includes(":") ? `[${host}]` : host}:${port}`, display: `${host}:${port}` };
}

async function fetchJson(url, options = {}, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: "error", headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
    if (!response.ok) throw typedError(`Local provider returned HTTP ${response.status}`, { code: "provider_http_error", statusCode: 502 });
    if (!(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) throw typedError("Local provider did not return JSON", { code: "provider_content_type_invalid", statusCode: 502 });
    return await response.json();
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === "AbortError") throw typedError("Local provider timed out", { code: "provider_timeout", statusCode: 504 });
    throw typedError("Local provider could not be reached", { code: "provider_offline", statusCode: 503 });
  } finally { clearTimeout(timeout); }
}

async function providerReceipt(endpoint, modelId) {
  const safe = safeEndpoint(endpoint);
  const [version, tags] = await Promise.all([fetchJson(`${safe.origin}/api/version`), fetchJson(`${safe.origin}/api/tags`)]);
  const model = Array.isArray(tags.models) ? tags.models.find((entry) => entry?.name === modelId) : null;
  const modelDigest = digest(model?.digest, "selected model digest");
  return {
    providerId: "ollama-local",
    providerVersion: text(version.version, "provider version", 80),
    adapterId: "hapa-avatar-builder-ollama-wisdom-council",
    adapterVersion: "1.0.0",
    endpoint: safe.display,
    endpointOrigin: safe.origin,
    modelId,
    modelVersion: `sha256:${modelDigest}`,
  };
}

export const WISDOM_COUNCIL_SEAT_FORMAT = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["claim", "scopeTargets", "goals", "evidenceUsed", "evidenceNeeded", "diagnosis", "scoreAnchor", "comparison", "boundedAction", "preserve", "successTest", "confidence", "guardrailRisk"],
  properties: {
    claim: { type: "string", minLength: 1, description: "A concise answer to the human question through this one Card's lens." },
    scopeTargets: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", minLength: 1 }, description: "Concrete targets this one Card evaluates." },
    goals: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", minLength: 1 }, description: "Goals inferred from the human question and frozen evidence." },
    evidenceUsed: { type: "array", minItems: 1, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["position", "observation"], properties: { position: { type: "integer" }, observation: { type: "string", minLength: 1 } } }, description: "Exact frozen evidence positions actually used." },
    evidenceNeeded: { type: "array", maxItems: 6, items: { type: "string", minLength: 1 }, description: "Missing evidence; use an empty array only when none is needed." },
    diagnosis: { type: "string", minLength: 1 },
    scoreAnchor: { type: "string", minLength: 1 },
    comparison: { type: "string", minLength: 1 },
    boundedAction: { type: "string", minLength: 1 },
    preserve: { type: "string", minLength: 1 },
    successTest: { type: "string", minLength: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    guardrailRisk: { type: "object", additionalProperties: false, required: ["present", "guardrail", "explanation"], properties: { present: { type: "boolean" }, guardrail: { type: "string", minLength: 1 }, explanation: { type: "string", minLength: 1 } } },
  },
});

export function buildWisdomCouncilSeatPrompt({ packet, wisdomCard, role, instruction }) {
  const boundedEvidence = packet.evidence.map((item) => ({ position: item.position, sourceRef: item.sourceRef, selectedEvidence: item.selectedEvidence, selectedEvidenceDigest: item.selectedEvidenceDigest }));
  const requiredShape = {
    claim: "one concise answer through this Card lens",
    scopeTargets: ["one concrete target"],
    goals: ["one inferred human goal"],
    evidenceUsed: [{ position: 0, observation: "one exact observation from that frozen position" }],
    evidenceNeeded: ["one missing receipt or an empty array"],
    diagnosis: "specific diagnosis",
    scoreAnchor: "which supplied score anchor applies and why",
    comparison: "what should be compared without seeing any peer",
    boundedAction: "one reversible proposal",
    preserve: "what the proposal must preserve",
    successTest: "one observable success test",
    confidence: 0.7,
    guardrailRisk: { present: true, guardrail: "protected value, or 'none identified'", explanation: "why a human value choice is or is not required" },
  };
  return [
    "Hapa Avatar Builder Wisdom Council seat.",
    `Logical role: ${role}.`,
    "Peer-blind contract: only the one Wisdom Card below is visible. No sibling Card, prompt, or output is available.",
    `Human question: ${instruction}`,
    `Frozen Context Packet: ${packet.packetId}`,
    `Packet digest: ${packet.packetDigest}`,
    `One visible Wisdom Card:\n${JSON.stringify({ cardId: wisdomCard.cardId, revisionId: wisdomCard.cardRevisionId, title: wisdomCard.title, claim: wisdomCard.question, evaluationProtocol: wisdomCard.actions?.[0], evidenceRequirements: wisdomCard.evidenceRequirements, scoreAnchor: wisdomCard.anchors?.[0], advicePattern: wisdomCard.advicePattern, guardrail: wisdomCard.guardrails?.[0], sourceRowSha256: wisdomCard.source?.sourceRowSha256 }, null, 2)}`,
    `Frozen selected evidence:\n${JSON.stringify(boundedEvidence, null, 2)}`,
    "OUTPUT CONTRACT OVERRIDES THE CARD'S OUTPUT-ARTIFACT WORDING. Return exactly one JSON object with the keys and value types in the shape below. Do not rename keys. Do not add proposal, priority_score, recommended_action, preserve_note, success_test, reasoning, or evidence_position keys. Every required string must be non-empty and specific. Evidence positions must point into the frozen selected evidence above.",
    JSON.stringify(requiredShape, null, 2),
    "Return a proposal only. Do not average other views, claim peer visibility, select a final action for the human, or claim any source changed. Return JSON now.",
  ].join("\n\n");
}

async function invokeSeat({ provider, packet, wisdomCard, role, instruction, fetcher = fetchJson }) {
  const exactPrompt = buildWisdomCouncilSeatPrompt({ packet, wisdomCard, role, instruction });
  const invocationId = `wisdom-seat-invocation:${randomBytes(16).toString("hex")}`;
  const response = await fetcher(`${provider.endpointOrigin}/api/chat`, {
    method: "POST",
    body: JSON.stringify({ model: provider.modelId, stream: false, format: WISDOM_COUNCIL_SEAT_FORMAT, messages: [{ role: "system", content: WISDOM_COUNCIL_SYSTEM_PROMPT }, { role: "user", content: exactPrompt }], think: false, options: { temperature: 0, seed: 0, num_predict: 1200 } }),
  });
  if (response.done !== true || response.model !== provider.modelId || response.message?.role !== "assistant") throw typedError("Wisdom seat response did not match the selected model", { code: "provider_model_mismatch", statusCode: 502 });
  let output;
  try { output = JSON.parse(response.message.content); }
  catch { throw typedError("Wisdom seat returned malformed structured output", { code: "provider_malformed_output", statusCode: 502 }); }
  for (const key of ["claim", "diagnosis", "scoreAnchor", "comparison", "boundedAction", "preserve", "successTest"]) text(output[key], `seat.${key}`);
  for (const key of ["scopeTargets", "goals", "evidenceUsed", "evidenceNeeded"]) if (!Array.isArray(output[key])) throw typedError(`Wisdom seat omitted ${key}`, { code: "provider_malformed_output", statusCode: 502 });
  if (!output.guardrailRisk || typeof output.guardrailRisk.present !== "boolean") throw typedError("Wisdom seat omitted guardrailRisk", { code: "provider_malformed_output", statusCode: 502 });
  if (!Number.isFinite(output.confidence) || output.confidence < 0 || output.confidence > 1) throw typedError("Wisdom seat confidence is invalid", { code: "provider_malformed_output", statusCode: 502 });
  const prompt = { template: clone(WISDOM_COUNCIL_PROMPT_TEMPLATE), systemText: WISDOM_COUNCIL_SYSTEM_PROMPT, exactText: exactPrompt, digest: sha256({ systemText: WISDOM_COUNCIL_SYSTEM_PROMPT, exactText: exactPrompt }) };
  const participant = { participantType: "provider-model", advocateId: "system:hapa-wisdom-card-executor", avatarParticipation: "not-invoked", registryResolution: null, executorProof: null, truthBoundary: "This seat records one local provider-model invocation. No Avatar, Registry actor, or Hermes executor participated." };
  const unsigned = {
    seatId: `wisdom-seat:${role}:${randomBytes(8).toString("hex")}`,
    ordinal: ROLES.indexOf(role) + 1,
    role,
    status: "completed",
    cardId: wisdomCard.cardId,
    cardRevisionId: wisdomCard.cardRevisionId,
    cardRecordDigest: wisdomCard.cardRecordDigest,
    invocationId,
    provider: publicProvider(provider),
    participant,
    prompt,
    output,
    outputDigest: sha256(output),
    responseDigest: sha256(response),
    usage: { promptEvalCount: response.prompt_eval_count ?? null, evalCount: response.eval_count ?? null, totalDurationNs: response.total_duration ?? null },
    peerBlindness: { schemaVersion: "hapa.card-advocate-peer-blind.v1", visibleCardIds: [wisdomCard.cardId], peerOutputDigestsVisible: [], inputDigest: sha256({ packetDigest: packet.packetDigest, cardId: wisdomCard.cardId, cardRevisionId: wisdomCard.cardRevisionId, role, promptDigest: prompt.digest }), disclosure: "one-card-input-only-no-peer-output-before-council-seal" },
    authority: { proposalOnly: true, sourceMutation: false, acceptanceAuthority: false, canonMutation: false, autoMint: false },
  };
  return { ...unsigned, recordDigest: sha256(unsigned) };
}

function normalized(value) { return canonicalJson(value); }

function seatRef(seat) { return { protocolRunId: seat.invocationId, cardId: seat.cardId, cardRevisionId: seat.cardRevisionId, role: seat.role, recordDigest: seat.recordDigest }; }

function experimentFor(category, cardA, cardB) {
  if (category === "true-tradeoff") return { kind: "creative-director-decision", estimatedCostRank: 1, question: "Which protected value governs this conflict?", procedure: ["Inspect both sealed guardrail risks", "Choose the governing protected value, defer, or request one narrower reversible experiment"], decisionSignal: "An accountable human records the protected value and why it governs.", proposalOnly: true };
  const shapes = {
    scope: ["inspect-scope", "Which stable target actually contains the decision?", "Inspect the smallest stable target named by each seat."],
    goal: ["success-test-trial", "Which success criterion best matches the human's stated intent?", "Run the smallest reversible trial against both success criteria."],
    evidence: ["collect-counterevidence", "What exact evidence would distinguish these interpretations?", "Collect one exact quote or observed receipt requested by one seat but absent from the other."],
    mechanism: ["bounded-variant-blind-test", "Which mechanism better produces the intended effect?", "Compare the smallest reversible variants in an audience-matched blind test."],
  };
  const [kind, question, step] = shapes[category];
  return { kind, estimatedCostRank: category === "scope" ? 1 : category === "evidence" ? 2 : 3, question, procedure: [step, `Preserve both sealed positions from ${cardA} and ${cardB}.`], decisionSignal: "The bounded observation discriminates between the two positions without averaging them.", proposalOnly: true };
}

function synthesizeDissent({ councilId, packet, seats, now }) {
  const disagreements = [];
  const countsByCategory = Object.fromEntries(DISSENT_CLASSES.map((key) => [key, 0]));
  for (let left = 0; left < seats.length; left += 1) {
    for (let right = left + 1; right < seats.length; right += 1) {
      const a = seats[left];
      const b = seats[right];
      const comparisons = {
        scope: [["scopeTargets", a.output.scopeTargets, b.output.scopeTargets]],
        goal: [["goals", a.output.goals, b.output.goals], ["successTest", a.output.successTest, b.output.successTest]],
        evidence: [["evidenceUsed", a.output.evidenceUsed, b.output.evidenceUsed], ["evidenceNeeded", a.output.evidenceNeeded, b.output.evidenceNeeded]],
        mechanism: [["diagnosis", a.output.diagnosis, b.output.diagnosis], ["scoreAnchor", a.output.scoreAnchor, b.output.scoreAnchor], ["comparison", a.output.comparison, b.output.comparison], ["boundedAction", a.output.boundedAction, b.output.boundedAction]],
        "true-tradeoff": [["guardrailRisk", a.output.guardrailRisk, b.output.guardrailRisk]],
      };
      for (const category of DISSENT_CLASSES) {
        const observations = comparisons[category].filter(([, valueA, valueB]) => category === "true-tradeoff" ? (a.output.guardrailRisk.present || b.output.guardrailRisk.present) : normalized(valueA) !== normalized(valueB));
        if (!observations.length) continue;
        const baseExperiment = experimentFor(category, a.cardId, b.cardId);
        const disagreementSeed = { councilId, category, seatA: a.recordDigest, seatB: b.recordDigest, observations };
        const disagreementId = `wisdom-dissent:${sha256(disagreementSeed).slice(0, 32)}`;
        disagreements.push({
          category,
          seatA: seatRef(a),
          seatB: seatRef(b),
          observations: observations.map(([field, seatA, seatB]) => ({ field, seatA, seatB })),
          classificationRationale: category === "true-tradeoff" ? "At least one independently sealed seat explicitly marked a guardrail risk; value choice remains human." : `The independently sealed seats differ in ${category} and remain co-equal.`,
          resolutionRoute: category === "true-tradeoff" ? "human:creative-director" : "bounded-discriminating-experiment",
          averagingForbidden: true,
          experiment: { ...baseExperiment, experimentId: `wisdom-experiment:${sha256({ disagreementId, ...baseExperiment }).slice(0, 32)}` },
          truthStatus: "provider-hypothesis-structure",
          disagreementId,
        });
        countsByCategory[category] += 1;
      }
    }
  }
  const creativeDirectorQueue = disagreements.filter((item) => item.category === "true-tradeoff").map((item) => ({ disagreementId: item.disagreementId, route: "human:creative-director", reason: item.experiment.question, requiredDecision: "choose-protected-value-or-defer" }));
  const unsigned = {
    schemaVersion: WISDOM_DISSENT_SCHEMA,
    storeVersion: "hapa-avatar-builder-wisdom-council/1.0.0",
    synthesisId: `wisdom-synthesis:${sha256({ councilId, seatDigests: seats.map((seat) => seat.recordDigest) }).slice(0, 40)}`,
    councilId,
    packetId: packet.packetId,
    packetDigest: packet.packetDigest,
    disagreements,
    summary: { pairCount: (seats.length * (seats.length - 1)) / 2, disagreementCount: disagreements.length, countsByCategory, unresolvedCount: disagreements.length, averagedVerdictProduced: false, preferredActionSelected: false },
    creativeDirectorQueue,
    authority: { proposalOnly: true, conflictsClassifiedNotAveraged: true, preferredActionSelected: false, acceptanceAuthority: false, sourceMutationPerformed: false, canonMutationPerformed: false, externalMutationPerformed: false, autoMint: false },
    truthStatus: "provider-hypothesis-structure",
    truthBoundary: "Structural comparisons are deterministic; seat diagnoses and actions remain local provider hypotheses. No preference, acceptance, source change, canon change, or mint is produced.",
    createdAt: now,
  };
  return { ...unsigned, recordDigest: sha256(unsigned) };
}

function cardSvg({ kind, title, seatCount, dissentCount, humanQueue }) {
  const lesson = kind === "lesson";
  const accent = lesson ? "#45f2c8" : "#a472ff";
  const safe = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").slice(0, 44);
  const glyphs = Array.from({ length: seatCount }, (_, index) => `<g transform="translate(${250 + index * 134} 350)"><circle r="58" fill="none" stroke="${["#00f3ff", "#f6c96d", "#ff6df2"][index]}" stroke-width="10"/><rect x="-28" y="-44" width="56" height="88" rx="8" fill="#071425" stroke="#f8f3e7" stroke-width="4"/></g>`).join("");
  const fractures = Array.from({ length: Math.min(5, dissentCount) }, (_, index) => `<path d="M384 520 L${160 + index * 112} ${660 + (index % 2) * 42}" stroke="${["#00f3ff", "#f6c96d", "#ff6df2", "#45f2c8", "#ff8a55"][index]}" stroke-width="9"/>`).join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152"><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".38"/><stop offset=".55" stop-color="#0b2137"/><stop offset="1" stop-color="#020617"/></radialGradient><linearGradient id="b"><stop stop-color="#00f3ff"/><stop offset=".5" stop-color="#f6c96d"/><stop offset="1" stop-color="#ff6df2"/></linearGradient></defs><rect width="768" height="1152" rx="46" fill="#020617"/><rect x="22" y="22" width="724" height="1108" rx="32" fill="url(#g)" stroke="url(#b)" stroke-width="8"/><text x="52" y="82" font-family="monospace" font-size="24" font-weight="900" letter-spacing="5" fill="#f6c96d">${lesson ? "COUNCIL LESSON" : "COUNCIL RESULT"}</text><circle cx="384" cy="470" r="220" fill="none" stroke="${accent}" stroke-width="8" stroke-dasharray="18 12"/>${glyphs}<circle cx="384" cy="520" r="52" fill="${accent}" stroke="#f8f3e7" stroke-width="8"/>${fractures}${humanQueue ? '<path d="M300 758h168l-30 86H330Z" fill="none" stroke="#f6c96d" stroke-width="12"/><circle cx="384" cy="716" r="30" fill="#f6c96d"/>' : ""}<text x="384" y="894" text-anchor="middle" font-family="system-ui" font-size="36" font-weight="900" fill="#f8f3e7">${safe(title)}</text><text x="384" y="982" text-anchor="middle" font-family="monospace" font-size="19" fill="#9fb5c9">${seatCount} PEER-BLIND SEATS · ${dissentCount} UNRESOLVED</text><text x="384" y="1072" text-anchor="middle" font-family="monospace" font-size="20" font-weight="900" letter-spacing="4" fill="#45f2c8">PROPOSED · UNMINTED</text></svg>`)}`;
}

function buildCards({ packet, run }) {
  const base = { revisionId: "proposed-r1", cardRevisionId: "proposed-r1", lifecycleStatus: "proposed_unminted", status: "proposed_unminted", proposed: true, minted: false, createdAt: run.completedAt, truthStatus: "provider_hypothesis_structure", authority: { outputDisposition: "proposal_only", sourceMutation: false, canonPromotion: false, preferredActionSelected: false, autoMint: false, mintMode: "human_explicit" }, relationships: [...packet.evidence.map((item) => ({ relation: "evaluates_frozen_evidence", target: clone(item.sourceRef), evidenceDigest: item.selectedEvidenceDigest })), ...run.seats.map((seat) => ({ relation: "preserves_peer_blind_position", target: { cardId: seat.cardId, cardRevisionId: seat.cardRevisionId, recordDigest: seat.recordDigest } }))] };
  const lessonIdentity = sha256({ runDigest: run.runDigest, kind: "lesson" });
  const resultIdentity = sha256({ runDigest: run.runDigest, kind: "result" });
  const commonResult = { councilId: run.councilId, runId: run.runId, runDigest: run.runDigest, packetId: packet.packetId, packetDigest: packet.packetDigest, sealDigest: run.seal.sealDigest, provider: clone(run.provider), seatCount: run.seats.length, seatDigests: run.seats.map((seat) => seat.recordDigest), dissentDigest: run.dissent.recordDigest, countsByCategory: clone(run.dissent.summary.countsByCategory), unresolvedCount: run.dissent.summary.unresolvedCount, creativeDirectorQueue: clone(run.dissent.creativeDirectorQueue), noPreference: true };
  const lesson = { ...base, id: `hapa-card:wisdom-council-lesson:${lessonIdentity.slice(0, 40)}`, cardId: `hapa-card:wisdom-council-lesson:${lessonIdentity.slice(0, 40)}`, cardType: "lesson_demo", tarotMainType: "wisdom_council_lesson_card", title: "Dissent is a feature", subtitle: "Peer-blind Wisdom Council", summary: "Independent Wisdom Cards stay separate; five disagreement classes become experiments or explicit human value choices, never an averaged verdict.", cardCoreKey: sha256(`hapa.wisdom-council.lesson.core\0${lessonIdentity}`), wisdomCouncilLesson: { schemaVersion: WISDOM_LESSON_CARD_SCHEMA, ...commonResult, lesson: "Keep exact sources, independent positions, unresolved conflict, and human authority visible." }, tags: ["wisdom-council", "lesson", "peer-blind", "dissent-preserved", "proposal-only", "build-week"], accent: "#45f2c8", tarotNumber: "WL" };
  lesson.imageUri = cardSvg({ kind: "lesson", title: lesson.title, seatCount: run.seats.length, dissentCount: run.dissent.summary.disagreementCount, humanQueue: run.dissent.creativeDirectorQueue.length > 0 });
  lesson.posterUri = lesson.imageUri;
  lesson.cardRecordDigest = sha256(lesson); lesson.recordDigest = lesson.cardRecordDigest;
  const result = { ...base, id: `hapa-card:wisdom-council-result:${resultIdentity.slice(0, 40)}`, cardId: `hapa-card:wisdom-council-result:${resultIdentity.slice(0, 40)}`, cardType: "result_experience", tarotMainType: "wisdom_council_result_card", title: "Three voices, no false consensus", subtitle: `${run.seats.length} local provider seats · ${run.dissent.summary.unresolvedCount} unresolved`, summary: run.dissent.creativeDirectorQueue.length ? `${run.dissent.summary.unresolvedCount} structural disagreements remain visible; ${run.dissent.creativeDirectorQueue.length} value conflict${run.dissent.creativeDirectorQueue.length === 1 ? " routes" : "s route"} to accountable human judgment.` : `${run.dissent.summary.unresolvedCount} structural disagreements remain visible with bounded experiment proposals.`, cardCoreKey: sha256(`hapa.wisdom-council.result.core\0${resultIdentity}`), wisdomCouncilResult: { schemaVersion: WISDOM_RESULT_CARD_SCHEMA, ...commonResult, seatPositions: run.seats.map((seat) => ({ role: seat.role, cardId: seat.cardId, output: clone(seat.output), recordDigest: seat.recordDigest })) }, tags: ["wisdom-council", "result", "peer-blind", "unresolved", "proposal-only", "build-week"], accent: "#a472ff", tarotNumber: "WR" };
  result.imageUri = cardSvg({ kind: "result", title: result.title, seatCount: run.seats.length, dissentCount: run.dissent.summary.disagreementCount, humanQueue: run.dissent.creativeDirectorQueue.length > 0 });
  result.posterUri = result.imageUri;
  result.cardRecordDigest = sha256(result); result.recordDigest = result.cardRecordDigest;
  return { lesson, result };
}

function parseEvents(raw = "") {
  return String(raw).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Wisdom Council event line ${index + 1} is invalid JSON: ${error.message}`); }
  });
}

function unsignedEvent(event) { const { eventHash: _eventHash, ...unsigned } = event; return unsigned; }

export function verifyWisdomCouncilEvents(events = []) {
  let previousEventHash = null;
  events.forEach((event, index) => {
    if (event.schemaVersion !== WISDOM_COUNCIL_EVENT_SCHEMA || event.sequence !== index + 1 || event.previousEventHash !== previousEventHash || sha256(unsignedEvent(event)) !== event.eventHash) throw new Error(`Wisdom Council event ${index + 1} failed append-only verification`);
    previousEventHash = event.eventHash;
  });
  return true;
}

function project(events = []) {
  verifyWisdomCouncilEvents(events);
  const runs = [];
  const failures = [];
  const cards = [];
  for (const event of events) {
    if (event.type === "wisdom.council.completed") { runs.push(clone(event.payload.run)); cards.push(clone(event.payload.cards.lesson), clone(event.payload.cards.result)); }
    if (event.type === "wisdom.council.failed") failures.push(clone(event.payload.failure));
  }
  return { runs, failures, cards };
}

function foundationCards(foundation) {
  const source = { sourceNode: foundation.sourceNode, sourceCommit: foundation.sourceCommit, sourceCatalogSha256: foundation.sourceCatalogSha256, catalogVersion: foundation.catalogVersion, truthBoundary: foundation.truthBoundary };
  return foundation.cards.map((row) => {
    const identity = { cardId: row["Card ID"], version: row.Version, sourceRowSha256: row.sourceRowSha256, source };
    const card = {
      id: `hapa-card:foundation:wisdom:${row["Card ID"]}`,
      cardId: `hapa-card:foundation:wisdom:${row["Card ID"]}`,
      cardType: "wisdom",
      tarotMainType: "wisdom",
      title: row["Card Name"],
      subtitle: `${row["Card ID"]} · Hapa Wisdom Studio`,
      summary: row["Wisdom / Claim"],
      question: row["Wisdom / Claim"],
      evidenceRequirements: row["Evidence to Extract"].split(";").map((item) => item.trim()).filter(Boolean),
      anchors: [row["Score Anchors (0 / 2 / 4)"]],
      actions: [row["Evaluation Protocol"]],
      advicePattern: row["Advice Pattern"],
      preserve: [row["Guardrails / Misuse"]],
      successTests: [row["Output Artifact"]],
      guardrails: [row["Guardrails / Misuse"]],
      revisionId: `${row.Version}@${foundation.sourceCommit}`,
      cardRevisionId: `${row.Version}@${foundation.sourceCommit}`,
      cardCoreKey: sha256(`hapa.wisdom.foundation.core\0${canonicalJson(identity)}`),
      source: { ...source, sourceRowSha256: row.sourceRowSha256, locator: `hapa-wisdom-studio://catalog/hapa_card_catalog.csv?card=${row["Card ID"]}&catalogSha256=${foundation.sourceCatalogSha256}` },
      truthStatus: "imported_foundation",
      lifecycleStatus: "active_foundation_projection",
      tags: ["wisdom", "foundation", row["Card ID"].toLowerCase(), "hapa-wisdom-studio"],
      accent: row["Card ID"] === "NAR-001" ? "#00f3ff" : row["Card ID"] === "REV-032" ? "#f6c96d" : "#ff6df2",
      tarotNumber: row["Card ID"],
    };
    card.cardRecordDigest = sha256(card); card.recordDigest = card.cardRecordDigest;
    return card;
  });
}

export class AvatarWisdomCouncilService {
  constructor({ root, events = [], foundation, now = () => new Date().toISOString(), ollamaEndpoint = "http://127.0.0.1:11434", receiptResolver = providerReceipt, seatInvoker = invokeSeat } = {}) {
    this.root = path.resolve(root);
    this.eventTape = path.join(this.root, "events.ndjson");
    this.events = events.map(clone);
    verifyWisdomCouncilEvents(this.events);
    this.foundation = clone(foundation);
    this.cards = foundationCards(this.foundation);
    this.now = now;
    this.ollamaEndpoint = ollamaEndpoint;
    this.receiptResolver = receiptResolver;
    this.seatInvoker = seatInvoker;
    this.appendQueue = Promise.resolve();
  }

  list() { return { schemaVersion: WISDOM_COUNCIL_LIST_SCHEMA, foundation: { ...clone(this.foundation), cards: this.cards.map(clone) }, ...project(this.events), dissentClasses: [...DISSENT_CLASSES], truthBoundary: "Council seats are peer-blind local provider-model proposals. Dissent is classified, not averaged. No Avatar participation, source mutation, acceptance, canon change, or mint is inferred." }; }

  async appendEvent({ type, councilId = null, actor, payload }) {
    let result;
    const operation = async () => {
      const unsigned = { schemaVersion: WISDOM_COUNCIL_EVENT_SCHEMA, eventId: `avatar-wisdom:${type}:${randomBytes(12).toString("hex")}`, sequence: this.events.length + 1, previousEventHash: this.events.at(-1)?.eventHash || null, ts: this.now(), type, councilId, actor: clone(actor), payload: clone(payload) };
      result = { ...unsigned, eventHash: sha256(unsigned) };
      await mkdir(this.root, { recursive: true });
      await appendFile(this.eventTape, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
      this.events.push(result);
    };
    this.appendQueue = this.appendQueue.then(operation, operation);
    await this.appendQueue;
    return clone(result);
  }

  async run({ packet, wisdomCardIds, instruction, modelId, endpoint = "", actor = {} }) {
    const requester = humanActor(actor);
    if (!packet?.packetId || !DIGEST.test(String(packet.packetDigest || ""))) throw typedError("A verified frozen Context Packet is required", { code: "context_packet_not_found", statusCode: 404 });
    if (!Array.isArray(wisdomCardIds) || wisdomCardIds.length < 1 || wisdomCardIds.length > 3) throw typedError("A Wisdom Council requires one to three selected foundation Cards");
    const ids = wisdomCardIds.map((id) => text(id, "wisdomCardIds[]", 320));
    if (new Set(ids).size !== ids.length) throw typedError("Wisdom Council Cards must be unique");
    const selected = ids.map((id) => this.cards.find((card) => card.cardId === id));
    if (selected.some((card) => !card)) throw typedError("Every selected Wisdom Card must resolve to the pinned foundation subset", { code: "wisdom_card_not_found", statusCode: 404 });
    const boundedInstruction = text(instruction, "instruction", 2_000);
    const concreteModelId = text(modelId, "modelId", 240);
    const councilId = `wisdom-council:${randomBytes(16).toString("hex")}`;
    const startedAt = this.now();
    try {
      const provider = await this.receiptResolver(endpoint || this.ollamaEndpoint, concreteModelId);
      const providerSnapshotDigest = sha256(publicProvider(provider));
      let release;
      const barrier = new Promise((resolve) => { release = resolve; });
      let activeSeats = 0;
      let observedMaximumConcurrentSeats = 0;
      const tasks = selected.map((wisdomCard, index) => (async () => {
        activeSeats += 1;
        observedMaximumConcurrentSeats = Math.max(observedMaximumConcurrentSeats, activeSeats);
        await barrier;
        try { return await this.seatInvoker({ provider, packet, wisdomCard, role: ROLES[index], instruction: boundedInstruction }); }
        finally { activeSeats -= 1; }
      })());
      release();
      const settled = await Promise.allSettled(tasks);
      const failed = settled.map((outcome, index) => ({ outcome, index })).filter(({ outcome }) => outcome.status === "rejected");
      if (failed.length) throw typedError("Wisdom Council failed atomically; no partial seat output, synthesis, Lesson Card, or Result Card was appended", { code: "wisdom_council_incomplete", statusCode: 502, details: { failedSeats: failed.map(({ index, outcome }) => ({ role: ROLES[index], cardId: selected[index].cardId, code: outcome.reason?.code || "seat_failed", message: outcome.reason?.message || "Wisdom seat failed" })) } });
      const seats = settled.map((outcome) => outcome.value);
      const peerBlind = seats.every((seat) => seat.peerBlindness.visibleCardIds.length === 1 && seat.peerBlindness.visibleCardIds[0] === seat.cardId && seat.peerBlindness.peerOutputDigestsVisible.length === 0);
      const distinct = new Set(seats.flatMap((seat) => [seat.invocationId, seat.recordDigest])).size === seats.length * 2;
      if (!peerBlind || !distinct) throw typedError("Wisdom Council independence proof failed", { code: "wisdom_council_independence_failed", statusCode: 409 });
      const sealedAt = this.now();
      const sealMaterial = { schemaVersion: WISDOM_COUNCIL_SEAL_SCHEMA, councilId, packetId: packet.packetId, packetDigest: packet.packetDigest, sealed: true, sealedAt, seatCount: seats.length, allSeatsCompleted: true, partialResultsAccepted: false, peerBlindnessAttested: true, providerSnapshotDigest, orderedInvocationIds: seats.map((seat) => seat.invocationId), orderedRecordDigests: seats.map((seat) => seat.recordDigest) };
      const seal = { ...sealMaterial, sealDigest: sha256(sealMaterial) };
      const dissent = synthesizeDissent({ councilId, packet, seats, now: sealedAt });
      const completedAt = this.now();
      const runMaterial = { schemaVersion: WISDOM_COUNCIL_RUN_SCHEMA, runId: `wisdom-council-run:${randomBytes(16).toString("hex")}`, councilId, packetId: packet.packetId, packetDigest: packet.packetDigest, instruction: boundedInstruction, requestedBy: requester, provider: publicProvider(provider), providerSnapshotDigest, startedAt, completedAt, seatCount: seats.length, roles: ROLES.slice(0, seats.length), concurrency: { mode: "promise-start-barrier", maxParallelism: seats.length, observedMaximumConcurrentSeats, allSeatsDispatchedBeforeRelease: true, peerOutputsSharedPreSeal: false }, seats, seal, dissent, truthStatus: "mixed-provider-hypotheses", authority: { proposalOnly: true, partialResultsAccepted: false, preferredActionSelected: false, acceptanceAuthority: false, sourceMutation: false, canonMutation: false, externalMutation: false, autoMint: false }, truthBoundary: "One to three independently prompted local provider-model seats were sealed atomically. Structural dissent is deterministic; semantic positions remain hypotheses. No Avatar participated and no source, canon, accepted state, or mint changed." };
      const run = { ...runMaterial, runDigest: sha256(runMaterial) };
      const cards = buildCards({ packet, run });
      await this.appendEvent({ type: "wisdom.council.completed", councilId, actor: requester, payload: { run, cards } });
      return { run: clone(run), cards: clone(cards) };
    } catch (error) {
      const failure = { councilId, packetId: packet.packetId, packetDigest: packet.packetDigest, startedAt, failedAt: this.now(), code: error?.code || "wisdom_council_failed", message: error?.message || String(error), details: clone(error?.details || null), partialSeatOutputsAppended: false, synthesisAppended: false, resultCardsAppended: false, truthBoundary: "Failure evidence records no partial semantic seat output and grants no Council verdict, Lesson Card, Result Card, or authority." };
      await this.appendEvent({ type: "wisdom.council.failed", councilId, actor: requester, payload: { failure } });
      throw error;
    }
  }
}

export async function openAvatarWisdomCouncilService(options = {}) {
  const root = path.resolve(options.root);
  const foundation = options.foundation || JSON.parse(await readFile(path.resolve(options.foundationPath), "utf8"));
  let raw = "";
  try { raw = await readFile(path.join(root, "events.ndjson"), "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return new AvatarWisdomCouncilService({ ...options, root, foundation, events: parseEvents(raw) });
}
