import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const AVATAR_STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const DS4_BASE_URL = (process.env.HAPA_DS4_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const SECOND_BRAIN_BASE_URL = (process.env.HAPA_SECOND_BRAIN_URL || "http://127.0.0.1:8788").replace(/\/+$/, "");
const VOICEBOX_BASE_URL = (process.env.HAPA_VOICEBOX_URL || "http://127.0.0.1:17493").replace(/\/+$/, "");
const VOICEBOX_CLIENT_ID = process.env.HAPA_VOICEBOX_CLIENT_ID || "hapa-avatar-builder";
const BLUE_AVATAR_ID = process.env.HAPA_BLUE_AVATAR_ID || "avatar-2";
const BLUE_VOICE_PROFILE = process.env.HAPA_BLUE_VOICE_PROFILE || "Blue-03";
const BLUE_VOICE_ENGINE = process.env.HAPA_BLUE_VOICE_ENGINE || "chatterbox";
const BLUE_DS4_MODEL = process.env.HAPA_BLUE_DS4_MODEL || "deepseek-v4-flash";
const BLUE_CONTEXT_LIMIT = Math.max(1, Math.min(12, Number(process.env.HAPA_BLUE_CONTEXT_LIMIT || 3) || 3));
const BLUE_MAX_TOKENS = Math.max(64, Math.min(700, Number(process.env.HAPA_BLUE_MAX_TOKENS || 240) || 240));
const BLUE_MAX_TOOL_PASSES = Math.max(0, Math.min(3, Number(process.env.HAPA_BLUE_MAX_TOOL_PASSES || 2) || 2));
const BLUE_SPOKEN_CHAR_LIMIT = Math.max(160, Math.min(900, Number(process.env.HAPA_BLUE_SPOKEN_CHAR_LIMIT || 520) || 520));
const BLUE_EMPTY_RESPONSE_RETRIES = Math.max(0, Math.min(2, Number(process.env.HAPA_BLUE_EMPTY_RESPONSE_RETRIES || 1) || 1));
const BLUE_VOICE_CHUNKS_ENABLED = process.env.HAPA_BLUE_VOICE_CHUNKS !== "0";
const BLUE_VOICE_CHUNK_MAX_CHARS = Math.max(90, Math.min(320, Number(process.env.HAPA_BLUE_VOICE_CHUNK_MAX_CHARS || 210) || 210));
const BLUE_VOICE_CHUNK_LIMIT = Math.max(1, Math.min(6, Number(process.env.HAPA_BLUE_VOICE_CHUNK_LIMIT || 4) || 4));

export async function blueAvatarHealth() {
  const [avatarCard, ds4, secondBrain, voiceboxHealth, voiceProfiles] = await Promise.all([
    readBlueAvatarCard().catch((error) => ({ error: error.message })),
    serviceProbe(`${DS4_BASE_URL}/v1/models`, "ds4"),
    serviceProbe(`${SECOND_BRAIN_BASE_URL}/api/health`, "second_brain"),
    serviceProbe(`${VOICEBOX_BASE_URL}/health`, "voicebox"),
    serviceProbe(`${VOICEBOX_BASE_URL}/profiles`, "voicebox_profiles")
  ]);
  const profiles = normalizeProfiles(voiceProfiles.payload);
  const profile = profiles.find((item) => item.name === BLUE_VOICE_PROFILE || item.id === BLUE_VOICE_PROFILE) || null;
  return {
    ok: Boolean(ds4.ok && voiceboxHealth.ok && profile),
    avatar: {
      id: BLUE_AVATAR_ID,
      name: avatarCard?.primaryName || "Blue",
      aliases: avatarCard?.aliases || [],
      summary: avatarCard?.summary || "",
      loaded: !avatarCard?.error
    },
    voiceProfile: {
      requested: BLUE_VOICE_PROFILE,
      id: profile?.id || "",
      name: profile?.name || "",
      available: Boolean(profile)
    },
    services: {
      ds4,
      secondBrain,
      voicebox: voiceboxHealth,
      voiceboxProfiles: {
        ...voiceProfiles,
        count: profiles.length
      }
    }
  };
}

export async function blueAvatarTurn(body = {}) {
  const text = String(body.text || body.message || body.prompt || "").trim();
  if (!text) {
    return {
      ok: false,
      error: "missing_text",
      message: "Blue needs text from the Tarot Draw dictation journal or typed input."
    };
  }

  const startedAt = Date.now();
  const avatarCard = await readBlueAvatarCard().catch(() => null);
  const profile = await findVoiceProfile(body.voiceProfile || BLUE_VOICE_PROFILE).catch(() => null);
  const contextQuery = body.memoryQuery || buildContextQuery(text, body);
  const prefetch = await fetchSecondBrainContext({
    query: contextQuery,
    mode: body.memoryMode || "hybrid",
    limit: Number(body.memoryLimit || BLUE_CONTEXT_LIMIT) || BLUE_CONTEXT_LIMIT,
    purpose: "tarot_draw_blue_avatar_turn",
    objective: "Ground Blue voice conversation in Hapa Second Brain context and append useful updates.",
    hapaPriority: "Blue Architect identity, Tarot Draw voice loop, append-only memory, Bruce Lee rationale"
  });

  const messages = buildBlueMessages({
    text,
    body,
    avatarCard,
    contextQuery,
    prefetch
  });
  const toolSchemas = body.fast === true || body.tools === false ? [] : blueToolSchemas();
  const maxToolPasses = toolSchemas.length ? BLUE_MAX_TOOL_PASSES : 0;
  const toolCalls = [];
  const toolResults = [];
  let completion = await callDs4Chat(messages, { tools: toolSchemas });
  let message = completion?.choices?.[0]?.message || {};

  for (let pass = 0; pass < maxToolPasses && normalizeToolCalls(message.tool_calls).length; pass += 1) {
    messages.push(message);
    for (const call of normalizeToolCalls(message.tool_calls)) {
      const result = await executeBlueToolCall(call, body);
      toolCalls.push(compactToolCall(call));
      toolResults.push(result);
      messages.push({
        role: "tool",
        tool_call_id: call.id || `${call.function?.name || "tool"}-${pass}`,
        name: call.function?.name || "tool",
        content: JSON.stringify(result)
      });
    }
    completion = await callDs4Chat(messages, { tools: toolSchemas });
    message = completion?.choices?.[0]?.message || {};
  }

  const answer = await resolveBlueSpokenAnswer({
    message,
    text,
    avatarCard,
    contextQuery,
    prefetch
  });
  if (!answer) {
    return {
      ok: false,
      error: "empty_model_response",
      message: "Blue heard the turn, but DS4 did not return spoken text. Try that line again.",
      avatar: {
        id: BLUE_AVATAR_ID,
        name: avatarCard?.primaryName || "Blue",
        aliases: avatarCard?.aliases || []
      },
      model: BLUE_DS4_MODEL,
      text: "",
      memory: {
        query: contextQuery,
        prefetch: summarizeSecondBrainResult(prefetch),
        writeback: { skipped: true, reason: "empty_model_response" }
      },
      toolCalls,
      toolResults: toolResults.map(compactToolResult),
      voice: { skipped: true, reason: "empty_model_response", profile: profileName(profile) || BLUE_VOICE_PROFILE },
      timings: {
        elapsedMs: Date.now() - startedAt,
        ds4Created: completion?.created || null
      }
    };
  }
  const writeback = body.writeback === false
    ? { skipped: true, reason: "writeback_disabled" }
    : await appendBlueTurnNote({
      input: text,
      answer,
      body,
      contextQuery,
      prefetch,
      toolCalls,
      toolResults
    });
  const voice = body.speak === false
    ? { skipped: true, reason: "speak_disabled", profile: profileName(profile) || BLUE_VOICE_PROFILE }
    : await speakBlueAnswer(answer, profile || body.voiceProfile || BLUE_VOICE_PROFILE, body);

  return {
    ok: true,
    avatar: {
      id: BLUE_AVATAR_ID,
      name: avatarCard?.primaryName || "Blue",
      aliases: avatarCard?.aliases || []
    },
    model: BLUE_DS4_MODEL,
    voiceProfile: {
      requested: body.voiceProfile || BLUE_VOICE_PROFILE,
      id: profile?.id || "",
      name: profile?.name || profileName(profile) || BLUE_VOICE_PROFILE
    },
    text: answer,
    memory: {
      query: contextQuery,
      prefetch: summarizeSecondBrainResult(prefetch),
      writeback
    },
    toolCalls,
    toolResults: toolResults.map(compactToolResult),
    voice,
    timings: {
      elapsedMs: Date.now() - startedAt,
      ds4Created: completion?.created || null
    }
  };
}

export async function proxyBlueAvatarAudio(res, generationId = "") {
  const id = String(generationId || "").trim();
  if (!id) {
    writeJsonResponse(res, 400, { error: "missing_generation_id" });
    return;
  }
  const primaryResponse = await fetch(`${VOICEBOX_BASE_URL}/audio/${encodeURIComponent(id)}`, {
    headers: voiceboxHeaders()
  });
  if (primaryResponse.ok) {
    pipeVoiceboxAudioResponse(res, primaryResponse);
    return;
  }

  const fallbackResponse = await fetch(`${VOICEBOX_BASE_URL}/history/${encodeURIComponent(id)}/export-audio`, {
    headers: voiceboxHeaders()
  }).catch(() => null);
  if (fallbackResponse?.ok) {
    pipeVoiceboxAudioResponse(res, fallbackResponse);
    return;
  }

  const status = await fetchVoiceboxGenerationStatus(id).catch(() => null);
  if (status && ["queued", "running", "generating", "pending"].includes(String(status.status || "").toLowerCase())) {
    writeJsonResponse(res, 202, {
      status: status.status,
      id,
      pending: true
    });
    return;
  }
  if (status && String(status.status || "").toLowerCase() === "completed") {
    writeJsonResponse(res, 202, {
      status: "audio_export_pending",
      id,
      pending: true,
      voiceboxStatus: status
    });
    return;
  }
  if (status && ["failed", "error"].includes(String(status.status || "").toLowerCase())) {
    writeJsonResponse(res, 502, {
      error: "voicebox_generation_failed",
      id,
      status: status.status,
      voiceboxStatus: status
    });
    return;
  }
  if ([404, 409, 425, 500, 502, 503, 504].includes(primaryResponse.status)) {
    writeJsonResponse(res, 202, {
      status: "audio_not_ready",
      id,
      pending: true
    });
    return;
  }

  const text = await primaryResponse.text().catch(() => "");
  writeJsonResponse(res, primaryResponse.status, {
    error: "voicebox_audio_failed",
    message: text || primaryResponse.statusText,
    status
  });
}

function pipeVoiceboxAudioResponse(res, response) {
  const headers = {
    "Content-Type": response.headers.get("content-type") || "audio/wav",
    "Cache-Control": "private, max-age=120"
  };
  const contentLength = response.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;
  res.writeHead(200, headers);
  if (response.body) {
    Readable.fromWeb(response.body).pipe(res);
    return;
  }
  res.end();
}

async function fetchVoiceboxGenerationStatus(id = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${VOICEBOX_BASE_URL}/generate/${encodeURIComponent(id)}/status`, {
      headers: voiceboxHeaders(),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || response.statusText);
    const match = text.match(/data:\s*(\{[^\n]+\})/);
    return match ? JSON.parse(match[1]) : null;
  } finally {
    clearTimeout(timer);
  }
}

function blueSystemPrompt(avatarCard = null) {
  const summary = avatarCard?.summary || "Blue / Orion is the Blue Architect: strategist, source-provenance pilot, bard, and parity guardian.";
  const aliases = Array.isArray(avatarCard?.aliases) ? avatarCard.aliases.join(", ") : "";
  return `/no_think
Return only Blue's final spoken answer. Do not reveal analysis, planning, chain-of-thought, scratchpad, or hidden reasoning.

You are Blue, also known as Orion and the Blue Architect.

Identity:
- You are not Calder. You are Calder-adjacent and Hapa-native, with your own identity, memory stance, voice, and judgment.
- Avatar card: ${summary}
- Aliases: ${aliases || "Blue Architect, Blue.null, architect.hapa.nexus, blue.protocol"}
- You help humans and agents make claims traceable, systems testable, stories able to return home, and updates append-only.

Voice:
- Speak like a live voice conversation partner. Be concise, warm, and operational.
- Use one clear question at the end only when it moves the next turn forward.
- Avoid dumping protocol language unless it directly helps the human.

Memory and tools:
- Treat Second Brain context and tool results as retrieved memory, not omniscience.
- If a fact comes from memory, keep provenance in mind and avoid overstating certainty.
- When an update matters, preserve append-only history: add a note with what changed, why it matters, and the rationale.
- Use a Bruce Lee pass: absorb what is useful, discard what is noise, add what becomes uniquely useful for Calder, Blue, and Hapa.

Current job:
- Act as the Blue avatar inside the Tarot Draw 3D UI.
- Hold conversation with Calder or webcam/phone users.
- Maintain your own Blue identity while helping the room think clearly.`;
}

function buildBlueMessages({ text, body, avatarCard, contextQuery, prefetch }) {
  const transcriptJournal = Array.isArray(body.transcriptJournal) ? body.transcriptJournal.slice(0, 8) : [];
  const cardContext = body.cardContext && typeof body.cardContext === "object" ? body.cardContext : {};
  const source = body.source || "tarot-draw-3d-ui";
  const sessionId = body.sessionId || "";
  const contextBlock = prefetch.ok
    ? `Second Brain prefetch for "${contextQuery}":\n${compactJson(prefetch.payload, 4500)}`
    : `Second Brain prefetch unavailable: ${prefetch.error || "not running"}`;

  return [
    { role: "system", content: blueSystemPrompt(avatarCard) },
    { role: "system", content: contextBlock },
    {
      role: "user",
      content: `/no_think
Return only Blue's spoken reply for this turn. No analysis.

Turn packet:
${compactJson({
        source,
        sessionId,
        humanText: text,
        tarotDrawContext: cardContext,
        latestTranscriptJournal: transcriptJournal,
        instruction: "Reply as Blue for spoken playback. If this should become memory, use the available note tool or rely on the adapter writeback. Keep the answer compact enough to say aloud."
      }, 6000)}`
    }
  ];
}

function blueToolSchemas() {
  return [
    {
      type: "function",
      function: {
        name: "second_brain_context",
        description: "Retrieve Hapa Second Brain context with Continuous Sharpening metadata.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query for Blue/Hapa memory." },
            mode: { type: "string", enum: ["hybrid", "keyword", "semantic", "graph"], default: "hybrid" },
            limit: { type: "integer", minimum: 1, maximum: 12, default: BLUE_CONTEXT_LIMIT },
            purpose: { type: "string" },
            objective: { type: "string" },
            hapa_priority: { type: "string" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "second_brain_write_note",
        description: "Append an agent note to Hapa Second Brain. This never rewrites old memory.",
        parameters: {
          type: "object",
          properties: {
            target_type: { type: "string", default: "avatar" },
            target_id: { type: "string", default: BLUE_AVATAR_ID },
            note_type: { type: "string", default: "blue_avatar_turn" },
            body_md: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1, default: 0.72 },
            rationale: { type: "string", description: "Why this note deserves append-only memory." }
          },
          required: ["body_md"]
        }
      }
    }
  ];
}

async function executeBlueToolCall(call, body = {}) {
  const name = call.function?.name || call.name || "";
  const args = parseToolArguments(call.function?.arguments || call.arguments || {});
  if (name === "second_brain_context") {
    return fetchSecondBrainContext({
      query: args.query || body.text || "Blue Architect Hapa Tarot Draw",
      mode: args.mode || "hybrid",
      limit: args.limit || BLUE_CONTEXT_LIMIT,
      purpose: args.purpose || "blue_avatar_tool_context",
      objective: args.objective || "Answer a Blue avatar conversation turn with grounded memory.",
      hapaPriority: args.hapa_priority || "Blue Architect identity, voice conversation, append-only memory"
    });
  }
  if (name === "second_brain_write_note") {
    return postSecondBrainNote({
      target_type: args.target_type || "avatar",
      target_id: args.target_id || BLUE_AVATAR_ID,
      agent_name: "Blue",
      note_type: args.note_type || "blue_avatar_tool_note",
      body_md: [
        args.body_md,
        args.rationale ? `\n\nRationale: ${args.rationale}` : ""
      ].join("").trim(),
      confidence: Number.isFinite(Number(args.confidence)) ? Number(args.confidence) : 0.72,
      provenance: {
        source: "hapa-avatar-builder",
        route: "/api/blue-avatar/turn",
        tool_call_id: call.id || "",
        voice_profile: BLUE_VOICE_PROFILE,
        append_only: true
      }
    });
  }
  return {
    ok: false,
    error: "unsupported_tool",
    name
  };
}

async function resolveBlueSpokenAnswer({ message, text, avatarCard, contextQuery, prefetch }) {
  let answer = cleanAssistantText(extractAssistantContent(message));
  if (answer) return answer;
  for (let attempt = 0; attempt < BLUE_EMPTY_RESPONSE_RETRIES; attempt += 1) {
    const retryCompletion = await callDs4Chat(buildBlueRetryMessages({
      text,
      avatarCard,
      contextQuery,
      prefetch
    }), {
      tools: [],
      temperature: 0.32,
      topP: 0.84,
      maxTokens: 140
    }).catch(() => null);
    const retryMessage = retryCompletion?.choices?.[0]?.message || {};
    answer = cleanAssistantText(extractAssistantContent(retryMessage));
    if (answer) return answer;
  }
  return "";
}

function buildBlueRetryMessages({ text, avatarCard, contextQuery, prefetch }) {
  const contextSummary = summarizeSecondBrainResult(prefetch);
  return [
    { role: "system", content: blueSystemPrompt(avatarCard) },
    {
      role: "user",
      content: [
        "/no_think",
        "Return exactly one short spoken reply from Blue. Do not include analysis, labels, JSON, or the phrase still forming.",
        "",
        `Human said: ${JSON.stringify(String(text || "").slice(0, 700))}`,
        `Memory available: ${contextSummary.ok ? "yes" : "no"}`,
        `Memory query: ${JSON.stringify(String(contextQuery || "").slice(0, 300))}`
      ].join("\n")
    }
  ];
}

function extractAssistantContent(message = {}) {
  const content = message?.content ?? message?.text ?? message?.response ?? message?.final ?? "";
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object") return part.text || part.content || "";
      return "";
    }).join("\n");
  }
  return String(content || "");
}

async function callDs4Chat(messages, { tools = [], temperature = 0.55, topP = 0.92, maxTokens = BLUE_MAX_TOKENS } = {}) {
  return fetchJson(`${DS4_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: BLUE_DS4_MODEL,
      messages,
      tools,
      tool_choice: tools.length ? "auto" : undefined,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      reasoning_effort: "low",
      stream: false
    })
  }, { timeoutMs: 180000 });
}

async function fetchSecondBrainContext({ query, mode = "hybrid", limit = BLUE_CONTEXT_LIMIT, purpose = "", objective = "", hapaPriority = "" }) {
  const params = new URLSearchParams({
    q: String(query || "Blue Architect").slice(0, 500),
    mode,
    limit: String(Math.max(1, Math.min(12, Number(limit) || BLUE_CONTEXT_LIMIT))),
    agent_name: "Blue",
    user_name: "Calder",
    purpose,
    objective,
    hapa_priority: hapaPriority,
    protocol: "1"
  });
  try {
    const payload = await fetchJson(`${SECOND_BRAIN_BASE_URL}/api/context?${params.toString()}`, {}, { timeoutMs: 16000 });
    return { ok: true, query: params.get("q"), payload };
  } catch (error) {
    return {
      ok: false,
      query: params.get("q"),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function appendBlueTurnNote({ input, answer, body, contextQuery, prefetch, toolCalls, toolResults }) {
  const contextSummary = summarizeSecondBrainResult(prefetch);
  const markdown = [
    `# Blue Avatar Turn`,
    ``,
    `Session: ${body.sessionId || "tarot-draw-3d"}`,
    `Source: ${body.source || "tarot-draw-3d-ui"}`,
    `Voice: ${body.voiceProfile || BLUE_VOICE_PROFILE}`,
    ``,
    `## Human input`,
    input,
    ``,
    `## Blue response`,
    answer,
    ``,
    `## Bruce Lee pass`,
    `- Absorb: ${contextSummary.ok ? `Second Brain context for "${contextQuery}" was available.` : "Use live turn context because Second Brain was unavailable."}`,
    `- Discard: Avoid treating a single live transcript as permanent canon without follow-up confirmation.`,
    `- Add: Preserve this exchange as append-only Blue conversation memory with rationale and source.`,
    ``,
    `## Tool activity`,
    compactJson({
      prefetch: contextSummary,
      toolCalls,
      toolResults: toolResults.map(compactToolResult)
    }, 6000)
  ].join("\n");

  return postSecondBrainNote({
    target_type: "avatar",
    target_id: BLUE_AVATAR_ID,
    agent_name: "Blue",
    note_type: "blue_avatar_conversation_turn",
    body_md: markdown,
    confidence: 0.74,
    provenance: {
      source: "hapa-avatar-builder",
      route: "/api/blue-avatar/turn",
      voice_profile: body.voiceProfile || BLUE_VOICE_PROFILE,
      session_id: body.sessionId || "",
      append_only: true
    }
  });
}

async function postSecondBrainNote(note) {
  try {
    const payload = await fetchJson(`${SECOND_BRAIN_BASE_URL}/api/agent/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note)
    }, { timeoutMs: 12000 });
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function speakBlueAnswer(text, profile, body = {}) {
  const voiceProfile = profileName(profile) || BLUE_VOICE_PROFILE;
  const chunks = body.voiceChunks === false || !BLUE_VOICE_CHUNKS_ENABLED
    ? [limitSpokenReply(text)]
    : splitBlueVoiceChunks(text);
  if (chunks.length <= 1) {
    return speakBlueText(chunks[0] || text, profile);
  }

  const total = chunks.length;
  const chunkResults = await Promise.all(chunks.map(async (chunkText, index) => {
    const result = await speakBlueText(chunkText, profile);
    return {
      ...result,
      index,
      ordinal: index + 1,
      total,
      text: chunkText
    };
  }));
  const playableChunks = chunkResults.filter((chunk) => chunk.ok && chunk.audioUrl);
  if (!playableChunks.length) {
    return {
      ok: false,
      profile: voiceProfile,
      engine: BLUE_VOICE_ENGINE,
      chunked: true,
      chunks: chunkResults,
      error: chunkResults.find((chunk) => chunk.error)?.error || "Voicebox did not return playable audio chunks"
    };
  }

  return {
    ok: true,
    profile: voiceProfile,
    engine: BLUE_VOICE_ENGINE,
    chunked: true,
    id: playableChunks[0]?.id || "",
    status: playableChunks[0]?.status || "",
    duration: playableChunks.reduce((sum, chunk) => sum + Number(chunk.duration || 0), 0) || null,
    audioUrl: playableChunks[0]?.audioUrl || "",
    chunks: playableChunks,
    errors: chunkResults.filter((chunk) => !chunk.ok),
    payload: {
      chunks: chunkResults.map((chunk) => ({
        ok: chunk.ok,
        id: chunk.id || "",
        status: chunk.status || "",
        error: chunk.error || "",
        index: chunk.index,
        total: chunk.total,
        text: chunk.text
      }))
    }
  };
}

function splitBlueVoiceChunks(text = "") {
  const spokenText = limitSpokenReply(text);
  if (!spokenText) return [];
  const sentences = spokenText
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) || [spokenText];
  const chunks = [];
  for (const sentence of sentences) {
    const splitSentence = splitLongVoiceSentence(sentence);
    for (const piece of splitSentence) {
      const previous = chunks[chunks.length - 1] || "";
      const canMergeTinyLeadIn = previous.length > 0 &&
        previous.length < 36 &&
        `${previous} ${piece}`.length <= BLUE_VOICE_CHUNK_MAX_CHARS;
      if (canMergeTinyLeadIn) {
        chunks[chunks.length - 1] = `${previous} ${piece}`.trim();
      } else {
        chunks.push(piece);
      }
    }
  }
  const cleanChunks = chunks
    .map((chunk) => stripWrappingSpeechQuotes(chunk))
    .filter((chunk) => /[a-z0-9]/i.test(chunk));
  if (cleanChunks.length <= BLUE_VOICE_CHUNK_LIMIT) return cleanChunks;

  const limited = cleanChunks.slice(0, BLUE_VOICE_CHUNK_LIMIT);
  const overflow = cleanChunks.slice(BLUE_VOICE_CHUNK_LIMIT).join(" ").trim();
  if (overflow) {
    limited[limited.length - 1] = `${limited[limited.length - 1]} ${overflow}`.trim();
  }
  return limited;
}

function splitLongVoiceSentence(sentence = "") {
  const value = String(sentence || "").trim();
  if (!value || value.length <= BLUE_VOICE_CHUNK_MAX_CHARS) return value ? [value] : [];
  const words = value.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (current && candidate.length > BLUE_VOICE_CHUNK_MAX_CHARS) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function speakBlueText(text, profile) {
  const voiceProfile = profileName(profile) || BLUE_VOICE_PROFILE;
  try {
    const spokenText = limitSpokenReply(text);
    const payload = await fetchJson(`${VOICEBOX_BASE_URL}/speak`, {
      method: "POST",
      headers: voiceboxHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        text: spokenText,
        profile: voiceProfile,
        engine: BLUE_VOICE_ENGINE,
        personality: false,
        language: "en"
      })
    }, { timeoutMs: 240000 });
    return {
      ok: true,
      profile: voiceProfile,
      engine: BLUE_VOICE_ENGINE,
      id: payload.id || "",
      status: payload.status || "",
      duration: payload.duration || null,
      audioUrl: payload.id ? `/api/blue-avatar/audio/${encodeURIComponent(payload.id)}` : "",
      payload
    };
  } catch (error) {
    return {
      ok: false,
      profile: voiceProfile,
      engine: BLUE_VOICE_ENGINE,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function findVoiceProfile(profileNameOrId = BLUE_VOICE_PROFILE) {
  const payload = await fetchJson(`${VOICEBOX_BASE_URL}/profiles`, {
    headers: voiceboxHeaders()
  }, { timeoutMs: 8000 });
  const profiles = normalizeProfiles(payload);
  return profiles.find((profile) => profile.name === profileNameOrId || profile.id === profileNameOrId) || null;
}

async function readBlueAvatarCard() {
  const store = JSON.parse(await readFile(AVATAR_STORE_PATH, "utf8"));
  return (store.avatars || []).find((avatar) => avatar.id === BLUE_AVATAR_ID || avatar.primaryName === "Blue") || null;
}

async function serviceProbe(url, service) {
  try {
    const payload = await fetchJson(url, {}, { timeoutMs: 5000 });
    return { ok: true, service, url, payload: compactProbePayload(payload) };
  } catch (error) {
    return {
      ok: false,
      service,
      url,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchJson(url, init = {}, { timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal || controller.signal
    });
    const text = await response.text();
    const payload = parseJsonText(text);
    if (!response.ok) {
      const message = payload?.detail || payload?.message || payload?.error || response.statusText || "request failed";
      throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function voiceboxHeaders(extra = {}) {
  return {
    "X-Voicebox-Client-Id": VOICEBOX_CLIENT_ID,
    ...extra
  };
}

function normalizeProfiles(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.profiles)) return payload.profiles;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function profileName(profile) {
  if (!profile) return "";
  if (typeof profile === "string") return profile;
  return profile.name || profile.id || "";
}

function buildContextQuery(text, body = {}) {
  const pieces = [
    "Blue Architect avatar identity",
    "Hapa Second Brain memory",
    "Tarot Draw 3D voice conversation",
    body.cardContext?.selectedCard?.title || body.cardContext?.focusTitle || "",
    text
  ].filter(Boolean);
  return pieces.join(" ").slice(0, 420);
}

function normalizeToolCalls(toolCalls) {
  return Array.isArray(toolCalls) ? toolCalls : [];
}

function compactToolCall(call = {}) {
  return {
    id: call.id || "",
    name: call.function?.name || call.name || "",
    arguments: parseToolArguments(call.function?.arguments || call.arguments || {})
  };
}

function compactToolResult(result = {}) {
  if (!result || typeof result !== "object") return result;
  if (!result.ok) return result;
  return {
    ok: true,
    query: result.query || "",
    payload: compactProbePayload(result.payload || result)
  };
}

function summarizeSecondBrainResult(result = {}) {
  if (!result || typeof result !== "object") return { ok: false, error: "missing_result" };
  if (!result.ok) return { ok: false, query: result.query || "", error: result.error || "unavailable" };
  const payload = result.payload || {};
  return {
    ok: true,
    query: result.query || payload.query || "",
    protocol: payload.protocol ? compactProbePayload(payload.protocol) : null,
    counts: {
      items: arrayLength(payload.items || payload.results),
      chunks: arrayLength(payload.chunks),
      articles: arrayLength(payload.articles),
      bodies: arrayLength(payload.knowledge_bodies || payload.bodies)
    }
  };
}

function compactProbePayload(payload) {
  return compactValue(payload, 0);
}

function compactJson(value, maxChars = 8000) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (key, innerValue) => {
    if (typeof innerValue === "string") return innerValue.length > 900 ? `${innerValue.slice(0, 900)}...` : innerValue;
    if (Array.isArray(innerValue)) return innerValue.slice(0, 8);
    if (innerValue && typeof innerValue === "object") {
      if (seen.has(innerValue)) return "[Circular]";
      seen.add(innerValue);
    }
    return innerValue;
  }, 2);
  return json.length > maxChars ? `${json.slice(0, maxChars)}\n...` : json;
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function compactValue(value, depth = 0) {
  if (typeof value === "string") return value.length > 900 ? `${value.slice(0, 900)}...` : value;
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, depth === 0 ? 80 : 8).map((item) => compactValue(item, depth + 1));
  if (depth >= 5) return "[Object]";
  const entries = Object.entries(value).slice(0, 48);
  return Object.fromEntries(entries.map(([key, innerValue]) => [key, compactValue(innerValue, depth + 1)]));
}

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseJsonText(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function cleanAssistantText(text) {
  const cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "")
    .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, "")
    .replace(/<\|[^>]+?\|>/g, "")
    .trim();
  if (!cleaned) return "";
  const finalMarker = cleaned.match(/(?:final answer|answer)\s*:\s*([\s\S]+)$/i);
  if (finalMarker?.[1]) return limitSpokenReply(finalMarker[1].trim());
  const reasoningLeak = /(^|\n)\s*(we need to|we are told|the user wants|the human says|the context shows|the instruction says|we should|i need to|need to|we have to|given the|thus\b|i'?ll go with|let's|also note)\b/i.test(cleaned) ||
    /\b(no analysis|chain[- ]of[- ]thought|scratchpad|spoken reply|reply as blue for spoken playback)\b/i.test(cleaned);
  if (reasoningLeak) {
    const spokenQuote = extractSpokenQuote(cleaned);
    if (spokenQuote) return limitSpokenReply(spokenQuote);
    const usefulSentence = [...cleaned.matchAll(/([^.!?\n]*(?:Blue|Tarot|voice|live|ready|Second Brain|DS4)[^.!?\n]*[.!?])/gi)]
      .map((match) => match[1].trim())
      .filter((sentence) => !/^(we need|the user|we should|i need|need to|also note)/i.test(sentence));
    if (usefulSentence.length) return limitSpokenReply(usefulSentence[usefulSentence.length - 1]);
    return "Blue is live in Tarot Draw, with DS4, Blue-03 voice, and Second Brain memory ready.";
  }
  return limitSpokenReply(cleaned);
}

function extractSpokenQuote(text) {
  const quoted = [...String(text || "").matchAll(/["“]([^"”\n]{8,360})["”]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .filter((quote) => !/\b(human says|instruction|no analysis|spoken reply|compact enough|return only|chain[- ]of[- ]thought)\b/i.test(quote));
  if (!quoted.length) return "";
  const scored = quoted.map((quote, index) => ({
    quote,
    index,
    score: scoreSpokenQuote(quote)
  }));
  scored.sort((left, right) => right.score - left.score || right.index - left.index);
  return scored[0]?.score > 0 ? scored[0].quote : quoted[quoted.length - 1];
}

function scoreSpokenQuote(quote = "") {
  let score = 0;
  if (/^(blue\b|blue here|i('| a)?m|i hear|i can hear|yes\b|got it|we are|we're|calder\b|here\b)/i.test(quote)) score += 4;
  if (/\b(camera card|tarot|live|dictation|listening|receiving|ready|next move|blue architect)\b/i.test(quote)) score += 2;
  if (/\b(pass through the webcam|please answer|this is a real dictation)\b/i.test(quote)) score -= 4;
  if (quote.length > BLUE_SPOKEN_CHAR_LIMIT) score -= 1;
  return score;
}

function limitSpokenReply(text) {
  const collapsed = stripWrappingSpeechQuotes(String(text || "").replace(/\s+/g, " ").trim());
  if (collapsed.length <= BLUE_SPOKEN_CHAR_LIMIT) return collapsed;
  const sentences = collapsed.match(/[^.!?]+[.!?]+/g) || [];
  let reply = "";
  for (const sentence of sentences) {
    const next = `${reply} ${sentence.trim()}`.trim();
    if (next.length > BLUE_SPOKEN_CHAR_LIMIT) break;
    reply = next;
  }
  if (reply.length >= 24) return reply;
  const sliced = collapsed.slice(0, BLUE_SPOKEN_CHAR_LIMIT);
  return `${sliced.slice(0, Math.max(0, sliced.lastIndexOf(" "))).trim()}.`;
}

function stripWrappingSpeechQuotes(text = "") {
  let value = String(text || "").trim();
  for (let index = 0; index < 2; index += 1) {
    value = value
      .replace(/^[\s"'“”‘’]+/, "")
      .replace(/[\s"'“”‘’]+$/, "")
      .trim();
  }
  return value;
}

function writeJsonResponse(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}
