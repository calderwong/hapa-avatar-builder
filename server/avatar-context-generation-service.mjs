import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";

export const CONTEXT_PACKET_SCHEMA = "hapa.avatar-builder.context-packet.v1";
export const CONTEXT_PACKET_EVENT_SCHEMA = "hapa.avatar-builder.context-generation-event.v1";
export const CONTEXT_GENERATION_RUN_SCHEMA = "hapa.avatar-builder.context-generation-run.v1";
export const CONTEXT_GENERATION_LIST_SCHEMA = "hapa.avatar-builder.context-generation-list.v1";
export const CONTEXT_GENERATION_RESULT_SCHEMA = "hapa.context-generation-result-card.v1";
export const CONTEXT_SYSTEM_PROMPT = "You are a strict JSON proposal generator. Follow the supplied JSON Schema exactly. Return no markdown or commentary. The output is proposal-only and must not claim source mutation, canon promotion, or mint.";
export const CONTEXT_PROMPT_TEMPLATE = Object.freeze({
  id: "hapa-avatar-builder-context-forge",
  version: "1.0.0",
  digest: sha256("Hapa Avatar Builder Context Forge prompt template v1.0.0: proposal-only, evidence-bound, no source mutation"),
});

const DIGEST = /^[a-f0-9]{64}$/;
const MODES = new Set(["deterministic_scaffold", "ollama_local"]);
const SELECTABLE_FIELDS = new Set(["title", "subtitle", "summary", "description", "prompt", "kind", "cardType", "truthStatus", "keywords", "tags"]);

function clone(value) {
  return structuredClone(value);
}

function typedError(message, { code = "context_generation_rejected", statusCode = 422 } = {}) {
  return Object.assign(new Error(message), { code, statusCode });
}

function requiredText(value, label, max = 2_000) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw typedError(`${label} is required`);
  if (normalized.length > max) throw typedError(`${label} is too long`);
  return normalized;
}

function requiredDigest(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!DIGEST.test(normalized)) throw typedError(`${label} must be a lowercase SHA-256 digest`);
  return normalized;
}

function normalizeActor(value = {}) {
  const actor = {
    actorId: requiredText(value.actorId, "actor.actorId", 160),
    actorType: requiredText(value.actorType || "human", "actor.actorType", 40),
    displayName: requiredText(value.displayName || value.actorId, "actor.displayName", 160),
  };
  if (actor.actorType !== "human") throw typedError("Only a human actor may freeze a Context Packet");
  return actor;
}

function cardIdentity(card = {}) {
  return {
    cardId: requiredText(card.cardId || card.id, "evidenceCard.cardId", 320),
    cardRevisionId: requiredText(card.cardRevisionId || card.revisionId || card.semanticVersion || card.revision, "evidenceCard.cardRevisionId", 160),
    cardCoreKey: requiredDigest(card.cardCoreKey || card.hypercore?.key || card.custody?.cardCoreKey, "evidenceCard.cardCoreKey"),
    cardRecordDigest: requiredDigest(card.cardRecordDigest || card.recordDigest || card.custody?.recordDigest, "evidenceCard.cardRecordDigest"),
  };
}

function selectedValue(card, field) {
  const value = card[field];
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => String(item).slice(0, 240));
  if (typeof value === "object") return canonicalJson(value).slice(0, 2_000);
  return String(value).slice(0, 4_000);
}

function normalizeEvidenceCard(input = {}, index = 0) {
  const card = clone(input.card || input);
  const sourceRef = cardIdentity(card);
  const requested = Array.isArray(input.selectedFields) ? input.selectedFields : ["title", "summary", "keywords"];
  const selectedFields = [...new Set(requested.map((field) => String(field)).filter((field) => SELECTABLE_FIELDS.has(field)))];
  if (!selectedFields.length) throw typedError(`evidenceCards[${index}] must select at least one supported field`);
  const selectedEvidence = Object.fromEntries(selectedFields.map((field) => [field, selectedValue(card, field)]).filter(([, value]) => value !== null));
  if (!Object.keys(selectedEvidence).length) throw typedError(`evidenceCards[${index}] selected fields contain no evidence`);
  const sourceSnapshotDigest = sha256(card);
  return {
    position: index,
    sourceRef,
    sourceSnapshotDigest,
    selectedFields: Object.keys(selectedEvidence),
    selectedEvidence,
    selectedEvidenceDigest: sha256(selectedEvidence),
    truthStatus: "human_selected_source_state",
  };
}

function parseEvents(text = "") {
  return String(text).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Context generation event line ${index + 1} is invalid JSON: ${error.message}`); }
  });
}

function unsignedEvent(event) {
  const { eventHash: _eventHash, ...unsigned } = event;
  return unsigned;
}

export function verifyContextGenerationEvents(events = []) {
  let previousEventHash = null;
  const ids = new Set();
  events.forEach((event, index) => {
    if (event.schemaVersion !== CONTEXT_PACKET_EVENT_SCHEMA) throw new Error(`Context generation event ${index + 1} has an unsupported schema`);
    if (event.sequence !== index + 1) throw new Error(`Context generation event ${index + 1} breaks sequence`);
    if (!event.eventId || ids.has(event.eventId)) throw new Error(`Context generation event ${index + 1} has an invalid eventId`);
    if (event.previousEventHash !== previousEventHash) throw new Error(`Context generation event ${index + 1} breaks append-only history`);
    if (sha256(unsignedEvent(event)) !== event.eventHash) throw new Error(`Context generation event ${index + 1} failed hash verification`);
    previousEventHash = event.eventHash;
    ids.add(event.eventId);
  });
  return true;
}

function projectEvents(events = []) {
  verifyContextGenerationEvents(events);
  const packets = new Map();
  const runs = new Map();
  const cards = new Map();
  for (const event of events) {
    if (event.type === "context.packet.frozen") packets.set(event.packetId, clone(event.payload.packet));
    if (event.type === "context.generation.completed") {
      runs.set(event.runId, clone(event.payload.run));
      cards.set(event.payload.resultCard.cardId, clone(event.payload.resultCard));
    }
  }
  return { packets: [...packets.values()], runs: [...runs.values()], cards: [...cards.values()] };
}

function normalizeGate(value = {}) {
  return {
    formationDigest: requiredDigest(value.formationDigest, "gate.formationDigest"),
    gateCommitment: requiredDigest(value.gateCommitment, "gate.gateCommitment"),
    redactedAddress: requiredText(value.redactedAddress || "withheld", "gate.redactedAddress", 160),
    orderedCardIds: Array.isArray(value.orderedCardIds) ? value.orderedCardIds.map((item) => requiredText(item, "gate.orderedCardIds[]", 320)) : [],
  };
}

function buildPrompt(packet, instruction) {
  const evidence = packet.evidence.map((item) => ({
    position: item.position,
    sourceRef: item.sourceRef,
    selectedEvidence: item.selectedEvidence,
    selectedEvidenceDigest: item.selectedEvidenceDigest,
  }));
  return [
    "You are operating inside Hapa Avatar Builder's Context Forge.",
    "Return only one JSON object with exactly these keys: title (string), summary (string), proposedCardType (string), evidenceUse (array of objects containing position integer and use string).",
    "Do not use markdown. Do not claim that source Cards changed, that the proposal is canon, or that it was minted.",
    `Human instruction: ${instruction}`,
    `Frozen Context Packet: ${packet.packetId}`,
    `Packet digest: ${packet.packetDigest}`,
    `Ordered selected evidence:\n${JSON.stringify(evidence, null, 2)}`,
  ].join("\n\n");
}

function safeOllamaEndpoint(value) {
  let parsed;
  try { parsed = new URL(String(value || "http://127.0.0.1:11434")); }
  catch { throw typedError("Ollama endpoint is invalid", { code: "invalid_provider_endpoint", statusCode: 400 }); }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw typedError("Only a credential-free loopback Ollama origin is allowed", { code: "remote_provider_not_allowed", statusCode: 400 });
  }
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return { endpoint: `${parsed.protocol}//${host.includes(":") ? `[${host}]` : host}:${port}`, display: `${host}:${port}` };
}

async function fetchJson(url, options = {}, timeoutMs = 120_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: "error", headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
    if (!response.ok) throw typedError(`Local provider returned HTTP ${response.status}`, { code: "provider_http_error", statusCode: 502 });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) throw typedError("Local provider did not return JSON", { code: "provider_content_type_invalid", statusCode: 502 });
    return await response.json();
  } catch (error) {
    if (error?.code) throw error;
    if (error?.name === "AbortError") throw typedError("Local provider timed out", { code: "provider_timeout", statusCode: 504 });
    throw typedError("Local provider could not be reached", { code: "provider_offline", statusCode: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

async function invokeOllama({ endpoint, modelId, prompt }) {
  const safe = safeOllamaEndpoint(endpoint);
  const [version, tags] = await Promise.all([
    fetchJson(`${safe.endpoint}/api/version`),
    fetchJson(`${safe.endpoint}/api/tags`),
  ]);
  const providerVersion = requiredText(version.version, "providerVersion", 80);
  const model = Array.isArray(tags.models) ? tags.models.find((item) => item?.name === modelId) : null;
  const modelDigest = String(model?.digest || "").replace(/^sha256:/, "").toLowerCase();
  if (!DIGEST.test(modelDigest)) throw typedError("Selected Ollama model is unavailable or lacks a concrete digest", { code: "model_not_available", statusCode: 400 });
  const format = {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "proposedCardType", "evidenceUse"],
    properties: {
      title: { type: "string" }, summary: { type: "string" }, proposedCardType: { type: "string" },
      evidenceUse: { type: "array", items: { type: "object", additionalProperties: false, required: ["position", "use"], properties: { position: { type: "integer" }, use: { type: "string" } } } },
    },
  };
  const response = await fetchJson(`${safe.endpoint}/api/chat`, {
    method: "POST",
    body: JSON.stringify({ model: modelId, stream: false, format, messages: [{ role: "system", content: CONTEXT_SYSTEM_PROMPT }, { role: "user", content: prompt }], think: false, options: { temperature: 0, seed: 0, num_predict: 1000 } }),
  });
  if (response.done !== true || response.model !== modelId || response.message?.role !== "assistant") throw typedError("Ollama completion did not match the selected model", { code: "provider_model_mismatch", statusCode: 502 });
  let proposal;
  try { proposal = JSON.parse(response.message.content); }
  catch { throw typedError("Ollama returned malformed structured output", { code: "provider_malformed_output", statusCode: 502 }); }
  for (const key of ["title", "summary", "proposedCardType"]) requiredText(proposal[key], `proposal.${key}`, 8_000);
  if (!Array.isArray(proposal.evidenceUse)) throw typedError("Ollama proposal omitted evidenceUse", { code: "provider_malformed_output", statusCode: 502 });
  return {
    proposal,
    responseDigest: sha256(response),
    provider: { providerId: "ollama-local", providerVersion, adapterId: "hapa-avatar-builder-ollama-native", adapterVersion: "1.0.0", endpoint: safe.display, modelId, modelVersion: `sha256:${modelDigest}` },
    usage: { promptEvalCount: response.prompt_eval_count ?? null, evalCount: response.eval_count ?? null, totalDurationNs: response.total_duration ?? null },
  };
}

function deterministicScaffold(packet, instruction) {
  return {
    title: "Context evidence scaffold",
    summary: `${packet.evidence.length} human-selected Card revisions were sealed in order for the instruction: ${instruction}`,
    proposedCardType: "context_evidence_scaffold",
    evidenceUse: packet.evidence.map((item) => ({ position: item.position, use: `Carry exact selected fields from ${item.sourceRef.cardId}; no semantic interpretation performed.` })),
  };
}

function contextResultImage({ title, generated, provider }) {
  const safe = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const mode = generated ? "LOCAL AI PROPOSAL" : "EVIDENCE SCAFFOLD";
  const source = generated ? `${provider?.providerId || "local-provider"} · ${provider?.modelId || "model"}` : "DETERMINISTIC · NO MODEL";
  const accent = generated ? "#ff6df2" : "#45f2c8";
  const titleText = safe(title).slice(0, 38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152"><defs><radialGradient id="a"><stop stop-color="${accent}" stop-opacity=".48"/><stop offset=".45" stop-color="#10253a"/><stop offset="1" stop-color="#020617"/></radialGradient><linearGradient id="b"><stop stop-color="#00f3ff"/><stop offset=".48" stop-color="#f6c96d"/><stop offset="1" stop-color="#ff6df2"/></linearGradient><filter id="g"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="768" height="1152" rx="46" fill="#020617"/><rect x="22" y="22" width="724" height="1108" rx="32" fill="url(#a)" stroke="url(#b)" stroke-width="8"/><g transform="translate(384 408)" fill="none" filter="url(#g)"><circle r="226" stroke="#00f3ff" stroke-width="8" stroke-dasharray="18 12"/><circle r="172" stroke="#f6c96d" stroke-width="6"/><circle r="118" stroke="${accent}" stroke-width="10" stroke-dasharray="9 15"/><path d="M-150 0L0-150L150 0L0 150Z" stroke="#f8f3e7" stroke-width="8"/><path d="M-92 0L0-92L92 0L0 92Z" stroke="${accent}" stroke-width="12"/><circle r="32" fill="${accent}" stroke="#f8f3e7" stroke-width="8"/></g><text x="52" y="82" font-family="monospace" font-size="24" font-weight="900" letter-spacing="5" fill="#f6c96d">HAPA CONTEXT RESULT</text><text x="384" y="742" text-anchor="middle" font-family="monospace" font-size="23" font-weight="900" letter-spacing="4" fill="${accent}">${mode}</text><text x="384" y="858" text-anchor="middle" font-family="system-ui" font-size="38" font-weight="900" fill="#f8f3e7">${titleText}</text><text x="384" y="978" text-anchor="middle" font-family="monospace" font-size="18" fill="#9fb5c9">${safe(source).slice(0, 62)}</text><path d="M112 1024h544" stroke="url(#b)" stroke-width="5"/><text x="384" y="1072" text-anchor="middle" font-family="monospace" font-size="20" font-weight="900" letter-spacing="4" fill="#45f2c8">PROPOSED · UNMINTED</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resultCard({ packet, run }) {
  const identity = sha256({ packetDigest: packet.packetDigest, runDigest: run.runDigest });
  const cardId = `hapa-card:context-generation-result:${identity.slice(0, 40)}`;
  const providerLabel = run.generationPerformed ? `${run.provider.providerId} · ${run.provider.modelId}` : "deterministic scaffold · no model";
  const imageUri = contextResultImage({ title: run.output.title, generated: run.generationPerformed, provider: run.provider });
  const card = {
    id: cardId,
    cardId,
    cardType: "context_generation_result_card",
    tarotMainType: "context_generation_result_card",
    title: run.output.title,
    subtitle: providerLabel,
    summary: run.output.summary,
    imageUri,
    posterUri: imageUri,
    revisionId: "proposed-r1",
    cardRevisionId: "proposed-r1",
    cardCoreKey: sha256(`hapa.context-generation-result.core\0${identity}`),
    truthStatus: run.generationPerformed ? "provider_proposal" : "deterministic_scaffold",
    lifecycleStatus: "proposed_unminted",
    status: "proposed_unminted",
    proposed: true,
    minted: false,
    createdAt: run.completedAt,
    contextGenerationResult: {
      schemaVersion: CONTEXT_GENERATION_RESULT_SCHEMA,
      packetId: packet.packetId,
      packetDigest: packet.packetDigest,
      runId: run.runId,
      runDigest: run.runDigest,
      mode: run.mode,
      generationPerformed: run.generationPerformed,
      semantic: run.semantic,
      providerInvocationVerified: run.providerInvocationVerified,
      provider: clone(run.provider),
      prompt: clone(run.prompt),
      outputDigest: run.outputDigest,
      orderedSourceRefs: packet.evidence.map((item) => clone(item.sourceRef)),
    },
    relationships: packet.evidence.map((item) => ({ relation: "derived_from_selected_evidence", target: clone(item.sourceRef), evidenceDigest: item.selectedEvidenceDigest })),
    authority: { outputDisposition: "proposal_only", sourceMutation: false, canonPromotion: false, autoMint: false, mintMode: "human_explicit" },
    tags: ["context-packet", "proposal-only", "source-unchanged", run.generationPerformed ? "local-provider" : "deterministic-scaffold", "build-week"],
    accent: run.generationPerformed ? "#ff6df2" : "#45f2c8",
    tarotNumber: run.generationPerformed ? "AI" : "CP",
  };
  card.cardRecordDigest = sha256(card);
  card.recordDigest = card.cardRecordDigest;
  return card;
}

export class AvatarContextGenerationService {
  constructor({ root, events = [], now = () => new Date().toISOString(), ollamaEndpoint = "http://127.0.0.1:11434" } = {}) {
    this.root = path.resolve(root);
    this.eventTape = path.join(this.root, "events.ndjson");
    this.events = events.map(clone);
    verifyContextGenerationEvents(this.events);
    this.now = now;
    this.ollamaEndpoint = ollamaEndpoint;
    this.appendQueue = Promise.resolve();
  }

  projection() { return projectEvents(this.events); }
  list() { return { schemaVersion: CONTEXT_GENERATION_LIST_SCHEMA, ...this.projection(), truthBoundary: "Packets are human-selected evidence seals. Deterministic scaffolds are not generation. Provider outputs remain unminted proposals." }; }
  packet(packetId) { return this.projection().packets.find((packet) => packet.packetId === packetId) || null; }

  async appendEvent({ type, packetId = null, runId = null, actor, payload }) {
    let result;
    const operation = async () => {
      const unsigned = { schemaVersion: CONTEXT_PACKET_EVENT_SCHEMA, eventId: `avatar-context:${type}:${randomBytes(12).toString("hex")}`, sequence: this.events.length + 1, previousEventHash: this.events.at(-1)?.eventHash || null, ts: this.now(), type, packetId, runId, actor: clone(actor), payload: clone(payload) };
      result = { ...unsigned, eventHash: sha256(unsigned) };
      await mkdir(this.root, { recursive: true });
      await appendFile(this.eventTape, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
      this.events.push(result);
    };
    this.appendQueue = this.appendQueue.then(operation, operation);
    await this.appendQueue;
    return clone(result);
  }

  async freezePacket({ evidenceCards, actor, purpose, gate }) {
    const human = normalizeActor(actor);
    if (!Array.isArray(evidenceCards) || evidenceCards.length < 1 || evidenceCards.length > 8) throw typedError("Context Packet requires one to eight explicitly selected Cards");
    const evidence = evidenceCards.map(normalizeEvidenceCard);
    const gateBinding = normalizeGate(gate);
    if (gateBinding.orderedCardIds.length && canonicalJson(gateBinding.orderedCardIds) !== canonicalJson(evidence.map((item) => item.sourceRef.cardId))) throw typedError("Context Packet evidence order must match the active Stargate Formation", { code: "context_formation_order_mismatch", statusCode: 409 });
    const frozenAt = this.now();
    const material = { schemaVersion: CONTEXT_PACKET_SCHEMA, frozenAt, frozenBy: human, purpose: requiredText(purpose, "purpose", 2_000), gate: gateBinding, evidence, authority: { selection: "explicit_human", sourceMutation: false, semanticInference: false, providerInvocation: false }, truthBoundary: "This packet freezes selected source evidence and order; it does not evaluate meaning, generate content, mutate Cards, or mint a result." };
    const packetDigest = sha256(material);
    const packet = { ...material, packetId: `hapa-context-packet:${packetDigest.slice(0, 40)}`, packetDigest };
    await this.appendEvent({ type: "context.packet.frozen", packetId: packet.packetId, actor: human, payload: { packet } });
    return clone(packet);
  }

  async generate({ packetId, mode, instruction, modelId = "", endpoint = "", actor = {} }) {
    if (!MODES.has(mode)) throw typedError("Unsupported Context Forge mode");
    const packet = this.packet(requiredText(packetId, "packetId", 320));
    if (!packet) throw typedError("Context Packet was not found", { code: "context_packet_not_found", statusCode: 404 });
    const requester = normalizeActor(actor);
    const boundedInstruction = requiredText(instruction, "instruction", 2_000);
    const promptText = buildPrompt(packet, boundedInstruction);
    const startedAt = this.now();
    let output;
    let provider = null;
    let usage = null;
    let responseDigest = null;
    let generationPerformed = false;
    if (mode === "ollama_local") {
      const invoked = await invokeOllama({ endpoint: endpoint || this.ollamaEndpoint, modelId: requiredText(modelId, "modelId", 240), prompt: promptText });
      output = invoked.proposal;
      provider = invoked.provider;
      usage = invoked.usage;
      responseDigest = invoked.responseDigest;
      generationPerformed = true;
    } else {
      output = deterministicScaffold(packet, boundedInstruction);
    }
    const completedAt = this.now();
    const unsignedRun = {
      schemaVersion: CONTEXT_GENERATION_RUN_SCHEMA,
      runId: `context-run:${randomBytes(16).toString("hex")}`,
      packetId: packet.packetId,
      packetDigest: packet.packetDigest,
      mode,
      generationPerformed,
      semantic: generationPerformed,
      providerInvocationVerified: generationPerformed,
      provider,
      prompt: { template: clone(CONTEXT_PROMPT_TEMPLATE), systemText: CONTEXT_SYSTEM_PROMPT, exactText: promptText, digest: sha256({ systemText: CONTEXT_SYSTEM_PROMPT, exactText: promptText }), instruction: boundedInstruction },
      output: clone(output),
      outputDigest: sha256(output),
      responseDigest,
      usage,
      requestedBy: requester,
      startedAt,
      completedAt,
      authority: { outputDisposition: "proposal_only", acceptedHeadWrite: false, sourceMutation: false, canonPromotion: false, autoMint: false },
      truthBoundary: generationPerformed ? "A concrete local Ollama runtime produced this provider proposal; only a human may accept or mint it." : "No model was invoked. This output is a deterministic evidence scaffold, not generated or semantic content.",
    };
    const run = { ...unsignedRun, runDigest: sha256(unsignedRun) };
    const card = resultCard({ packet, run });
    await this.appendEvent({ type: "context.generation.completed", packetId: packet.packetId, runId: run.runId, actor: requester, payload: { run, resultCard: card } });
    return { packet: clone(packet), run: clone(run), card: clone(card) };
  }
}

export async function openAvatarContextGenerationService(options = {}) {
  const root = path.resolve(options.root);
  let text = "";
  try { text = await readFile(path.join(root, "events.ndjson"), "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return new AvatarContextGenerationService({ ...options, root, events: parseEvents(text) });
}
