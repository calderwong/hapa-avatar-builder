const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const SCHEMA_VERSION = "hapa.echo-reference-intelligence-run.v1";
const PLAN_SCHEMA_VERSION = "hapa.echo-reference-intelligence.v1";
const RUNS_DIRECTORY = "Echo Reference Intelligence Runs";
const CURRENT_FILENAME = "current-run.json";
const MANIFEST_FILENAME = "manifest.json";
const DEFAULT_MODEL = "gpt-5.5";
const MODEL_PREFERENCES = ["gpt-5.5", "gpt-5.4", "gpt-5.2", "gpt-5", "o3", "o4-mini", "gpt-4.1"];
const SCORE_KEYS = [
  "lyricGrounding",
  "referenceGrounding",
  "lessonLegibility",
  "tarotIntegration",
  "visualSpecificity",
  "memorability",
  "playingCardReusability",
  "promptClarity",
];

function clean(value = "", max = 12000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sourceText(value, max) {
  if (typeof value === "string") return clean(value, max);
  if (value && typeof value === "object") return clean(JSON.stringify(value), max);
  return clean(value, max);
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex")}`;
}

function safeError(error) {
  return clean(error?.message || error || "Intelligence pass failed.", 1200)
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]");
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, filePath);
    await fs.chmod(filePath, 0o600);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function entryBodies(entries = [], maxEntries = 6, maxEach = 1800) {
  return list(entries).slice(0, maxEntries).map((entry) => ({
    id: clean(entry.id, 240),
    title: clean(entry.title, 400),
    body: clean(entry.body || entry.lesson, maxEach),
    tags: list(entry.tags).map((tag) => clean(tag, 120)).filter(Boolean),
    authorType: clean(entry.authorType, 60),
    authorName: clean(entry.authorName, 160),
    evidenceClass: clean(entry.evidenceClass, 80),
  }));
}

function songPacket(song = {}) {
  const knowledge = song.knowledge || {};
  const sourcePrompts = list(knowledge.referenceImagePrompts);
  const connections = sourcePrompts.map((item, index) => ({
    connectionKey: clean(item.id, 320) || `${song.id}:connection-${index + 1}`,
    sourceKind: item.referenceId ? "reference" : "lyric-only",
    referenceId: clean(item.referenceId, 80),
    referenceTitle: clean(item.referenceTitle, 600),
    evidenceClass: clean(item.evidenceClass, 80),
    lyricCue: clean(item.lyricCue, 500),
    existingTheme: clean(item.theme, 500),
    existingLesson: clean(item.lesson, 1800),
    existingSymbols: clean(item.symbols, 1800),
    reviewPrompt: clean(item.prompt, 4500),
  }));
  return {
    songId: clean(song.id, 320),
    songTitle: clean(song.title, 500),
    trackNumber: Number(song.trackNumber || 0),
    lyrics: clean(song.canonicalSource?.lyrics, 18000),
    sourceMood: sourceText(song.canonicalSource?.mood, 1600),
    sourceLearning: sourceText(song.canonicalSource?.learningThing, 1800),
    sourceGameMechanic: sourceText(song.canonicalSource?.broadGameMechanic, 1800),
    sourceLore: sourceText(song.canonicalSource?.lore, 4000),
    understandings: entryBodies(knowledge.understandings),
    notes: entryBodies(knowledge.notes),
    anecdotes: entryBodies(knowledge.anecdotes),
    lessons: entryBodies(knowledge.lessons),
    tarotRationales: entryBodies(knowledge.tarotRationales),
    researchReferences: list(knowledge.researchReferences).slice(0, 12).map((item) => ({
      id: clean(item.id, 240),
      label: clean(item.label, 600),
      notes: clean(item.notes, 2200),
      status: clean(item.status, 120),
      tags: list(item.tags).map((tag) => clean(tag, 120)).filter(Boolean),
    })),
    tarotConnections: list(song.tarotConnections).slice(0, 8).map((item) => ({
      cardId: clean(item.cardId || item.id, 240),
      cardTitle: clean(item.cardTitle || item.title, 400),
      logic: clean(item.logic || item.reason || item.contextReason, 2400),
      upright: clean(item.upright, 1000),
      shadow: clean(item.shadow, 1000),
      symbols: clean(item.symbols || item.essentialSymbols, 1200),
    })),
    creativeAnchors: list(song.creativeAnchors).slice(0, 10).map((item) => ({
      id: clean(item.id, 240),
      name: clean(item.name || item.title, 400),
      notes: clean(item.notes || item.toneNotes, 1400),
      tags: list(item.tags).map((tag) => clean(tag, 120)).filter(Boolean),
    })),
    songConnections: list(knowledge.songConnections).slice(0, 10).map((item) => ({
      songId: clean(item.songId, 240),
      songTitle: clean(item.songTitle, 400),
      reason: clean(item.reason, 1000),
      sharedSignals: list(item.sharedSignals).map((tag) => clean(tag, 120)).filter(Boolean),
    })),
    sourceConnections: connections.length ? connections.map(({ existingTheme, existingSymbols, reviewPrompt, ...connection }) => connection) : [{
      connectionKey: `${clean(song.id, 320)}:lyric-only`,
      sourceKind: "lyric-only",
      referenceId: "",
      referenceTitle: "Lyric-only interpretation",
      evidenceClass: "U",
      lyricCue: "",
      existingLesson: clean(knowledge.lessons?.[0]?.body, 1800),
    }],
  };
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["songFoundation", "connections"],
  properties: {
    songFoundation: {
      type: "object",
      additionalProperties: false,
      required: ["literalSituation", "speakerAndAddressee", "emotionalMovement", "centralTension", "lessonSynthesis", "tarotSynthesis", "recognitionTest", "lyricAnchors", "retrievalTags", "uncertainties"],
      properties: {
        literalSituation: { type: "string" },
        speakerAndAddressee: { type: "string" },
        emotionalMovement: { type: "string" },
        centralTension: { type: "string" },
        lessonSynthesis: { type: "string" },
        tarotSynthesis: { type: "string" },
        recognitionTest: { type: "string" },
        lyricAnchors: { type: "array", items: { type: "object", additionalProperties: false, required: ["cue", "meaning", "visualOpportunity"], properties: { cue: { type: "string" }, meaning: { type: "string" }, visualOpportunity: { type: "string" } } } },
        retrievalTags: { type: "array", items: { type: "string" } },
        uncertainties: { type: "array", items: { type: "string" } },
      },
    },
    connections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["connectionKey", "sourceKind", "referenceId", "referenceTitle", "conceptualBridge", "evidenceUsed", "concepts"],
        properties: {
          connectionKey: { type: "string" },
          sourceKind: { type: "string", enum: ["reference", "lyric-only"] },
          referenceId: { type: "string" },
          referenceTitle: { type: "string" },
          conceptualBridge: { type: "string" },
          evidenceUsed: { type: "array", items: { type: "string" } },
          concepts: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "memoryHook", "foundationRationale", "lyricMechanic", "referenceMechanic", "lessonMechanic", "tarotMechanic", "characterUse", "scene", "symbols", "palette", "visualSignature", "retrievalTags", "imagePrompt", "qualityAssessment"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                memoryHook: { type: "string" },
                foundationRationale: { type: "string" },
                lyricMechanic: { type: "string" },
                referenceMechanic: { type: "string" },
                lessonMechanic: { type: "string" },
                tarotMechanic: { type: "string" },
                characterUse: { type: "string" },
                scene: { type: "object", additionalProperties: false, required: ["subject", "action", "setting", "camera", "lightAndWeather", "materialLanguage"], properties: { subject: { type: "string" }, action: { type: "string" }, setting: { type: "string" }, camera: { type: "string" }, lightAndWeather: { type: "string" }, materialLanguage: { type: "string" } } },
                symbols: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["symbol", "source", "meaning", "placement"], properties: { symbol: { type: "string" }, source: { type: "string" }, meaning: { type: "string" }, placement: { type: "string" } } } },
                palette: { type: "array", minItems: 3, items: { type: "object", additionalProperties: false, required: ["color", "role"], properties: { color: { type: "string" }, role: { type: "string" } } } },
                visualSignature: { type: "object", additionalProperties: false, required: ["subjectType", "shotScale", "cameraAngle", "settingType", "dominantGeometry", "lighting", "materialLanguage"], properties: { subjectType: { type: "string" }, shotScale: { type: "string" }, cameraAngle: { type: "string" }, settingType: { type: "string" }, dominantGeometry: { type: "string" }, lighting: { type: "string" }, materialLanguage: { type: "string" } } },
                retrievalTags: { type: "array", minItems: 4, items: { type: "string" } },
                imagePrompt: { type: "string" },
                qualityAssessment: {
                  type: "object",
                  additionalProperties: false,
                  required: [...SCORE_KEYS, "strengths", "risks", "evidenceSummary"],
                  properties: {
                    ...Object.fromEntries(SCORE_KEYS.map((key) => [key, { type: "integer", minimum: 1, maximum: 5 }])),
                    strengths: { type: "array", items: { type: "string" } },
                    risks: { type: "array", items: { type: "string" } },
                    evidenceSummary: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const DEVELOPER_INSTRUCTIONS = `You are the Echo Album visual-intelligence author. Your work will become durable research data and production prompts for memorable playing-card imagery.

Outcome: For the supplied song, author an evidence-aware foundation and preserve EVERY defensible, visually strong concept for every supplied reference connection. Concepts do not compete. Do not rank, eliminate, merge, or choose a winner. Create as many materially distinct concepts as the evidence honestly supports, normally 2-5 per connection and up to 8 when the source is unusually fertile. Never pad the count with cosmetic variants.

Read the complete lyrics as the primary creative source. Treat supplied research, notes, lessons, Tarot rationale, and reference records as attributed evidence or provisional interpretation. The field existingLesson may help, but it is not visual direction and may be revised when the lyrics support a sharper lesson. No legacy generated prompt or stock motif-symbol sentence is supplied or authoritative.

Each concept must lock an observable lyric action to the reference's transferable mechanism, the stated lesson, and a transformed Tarot symbol. The image should remain recognizable as this song even with its title hidden. Prefer concrete verbs, props, spatial consequences, material culture, weather, scale, and surprising but defensible staging. A concept may be character-led, object-led, architectural, landscape-led, creature-led, diagrammatic, domestic, documentary, comedic, frightening, quiet, or surreal. Do not default to fantasy-travel key art.

Hapa continuity: use original Hapa characters when a person materially serves the idea, but not every concept needs a person. Preserve reusable character roles and readable silhouettes. Maintain premium illustrated playing-card usability at 2:3 portrait while allowing radically different visual grammars. Do not imitate a living artist or copyrighted visual style and do not depict an external character or living person.

The completed first run overused: dark-haired woman foregrounded at three-quarter view; a second person reaching; departures along a path; cliffside fantasy cities; golden sunset; teal-and-gold celestial arcs; glowing tables; multicolored trees; harbors; mirrors; radio-wave diagrams; generic backpacks and travel clothing. Use any one only when the source truly demands it, and then transform its function and composition. Never use several as default atmosphere.

Quality is a readiness gate, not a competition. Before returning, refine each concept until its assessment is honest. Score 1-5 for lyric grounding, reference grounding, lesson legibility, Tarot integration, visual specificity, memorability, playing-card reusability, and prompt clarity. A production-ready concept should score at least 4 on every dimension. Keep weaker but supportable concepts and explain their risks; the application will mark them for revision rather than discard them.

Keep the stored reasoning concise and information-dense: foundation fields at most 100 words each, concept rationale/mechanic fields at most 70 words each, memory hooks at most 40 words, and production prompts approximately 250-450 words. Completeness means more supported concepts and traceable details, not repetitive prose.

The imagePrompt must stand alone for an image model. Include the subject, exact action, environment, camera, symbol placement/function, palette roles, character requirements, visual hierarchy, and important exclusions. Do not print lyrics, titles, borders, captions, logos, signatures, UI, or watermarks. Do not mention internal databases or the assessment rubric. Do not claim unsupported biography. Store concise evidence and rationale, never private chain-of-thought.`;

function outputText(payload = {}) {
  if (clean(payload.output_text)) return clean(payload.output_text, 2_000_000);
  return list(payload.output).flatMap((item) => list(item.content)).filter((item) => item.type === "output_text").map((item) => item.text || "").join("");
}

function qualityAssessment(concept = {}) {
  const supplied = concept.qualityAssessment || {};
  const scores = Object.fromEntries(SCORE_KEYS.map((key) => [key, Math.max(0, Math.min(5, Number(supplied[key]) || 0))]));
  const average = SCORE_KEYS.reduce((total, key) => total + scores[key], 0) / SCORE_KEYS.length;
  const missing = [];
  if (!clean(concept.memoryHook)) missing.push("memoryHook");
  if (!clean(concept.foundationRationale)) missing.push("foundationRationale");
  if (!clean(concept.imagePrompt)) missing.push("imagePrompt");
  if (list(concept.symbols).length < 3) missing.push("symbols>=3");
  if (list(concept.retrievalTags).length < 4) missing.push("retrievalTags>=4");
  const promptWords = clean(concept.imagePrompt).split(/\s+/).filter(Boolean).length;
  if (promptWords < 160) missing.push("imagePrompt>=160-words");
  if (promptWords > 650) missing.push("imagePrompt<=650-words");
  const weakScores = SCORE_KEYS.filter((key) => scores[key] < 4);
  const corpusReasons = list(concept.corpusAssessment?.gateReasons);
  const ready = !missing.length && !weakScores.length && !corpusReasons.length && average >= 4.2;
  return { ...supplied, ...scores, average: Number(average.toFixed(2)), ready, status: ready ? "ready-for-image-api" : "needs-revision", gateReasons: [...missing.map((key) => `missing:${key}`), ...weakScores.map((key) => `score-below-4:${key}`), ...(average < 4.2 ? [`average-below-4.2:${average.toFixed(2)}`] : []), ...corpusReasons] };
}

function signatureTokens(value = "") {
  const stop = new Set(["and", "the", "with", "from", "into", "that", "this", "while", "one", "under", "over"]);
  return new Set(clean(value).toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !stop.has(word)) || []);
}

function jaccard(left, right) {
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function applyCorpusQuality(manifest = {}) {
  const concepts = [];
  for (const job of list(manifest.jobs)) for (const connection of list(job.plan?.connections)) for (const concept of list(connection.concepts)) {
    const signature = concept.visualSignature || {};
    const signatureText = [concept.title, concept.memoryHook, signature.subjectType, signature.shotScale, signature.cameraAngle, signature.settingType, signature.dominantGeometry, signature.lighting, signature.materialLanguage].join(" ");
    concepts.push({ job, connection, concept, tokens: signatureTokens(signatureText) });
  }
  const defaults = ["cliffside", "fantasy city", "golden sunset", "celestial arc", "open hand", "glowing table", "multicolored tree", "backpack", "harbor path"];
  for (let index = 0; index < concepts.length; index += 1) {
    const current = concepts[index];
    let nearest = null;
    for (let otherIndex = 0; otherIndex < concepts.length; otherIndex += 1) {
      if (index === otherIndex || concepts[otherIndex].job.songId === current.job.songId) continue;
      const similarity = jaccard(current.tokens, concepts[otherIndex].tokens);
      if (!nearest || similarity > nearest.similarity) nearest = { similarity, item: concepts[otherIndex] };
    }
    const haystack = `${current.concept.memoryHook} ${current.concept.imagePrompt}`.toLowerCase();
    const repeatedDefaults = defaults.filter((phrase) => haystack.includes(phrase));
    const gateReasons = [];
    if (nearest?.similarity >= 0.78) gateReasons.push(`visual-signature-collision:${nearest.item.job.songTitle}:${nearest.similarity.toFixed(2)}`);
    if (repeatedDefaults.length >= 3) gateReasons.push(`legacy-default-cluster:${repeatedDefaults.join("+")}`);
    current.concept.corpusAssessment = {
      nearestSongId: nearest?.item.job.songId || "",
      nearestSongTitle: nearest?.item.job.songTitle || "",
      nearestConceptId: nearest?.item.concept.id || "",
      nearestSimilarity: Number((nearest?.similarity || 0).toFixed(3)),
      repeatedDefaults,
      gateReasons,
    };
    current.concept.qualityAssessment = qualityAssessment(current.concept);
  }
  manifest.corpusQualityAssessedAt = new Date().toISOString();
  manifest.counts = summarize(manifest);
  return manifest;
}

function normalizePlan(raw = {}, job = {}, model = "", response = {}) {
  const expected = new Map(job.packet.sourceConnections.map((item) => [item.connectionKey, item]));
  const seen = new Set();
  const connections = list(raw.connections).map((connection, connectionIndex) => {
    const supplied = expected.get(clean(connection.connectionKey));
    const fallback = job.packet.sourceConnections[connectionIndex] || {};
    const source = supplied || fallback;
    const connectionKey = clean(source.connectionKey || connection.connectionKey) || `${job.songId}:connection-${connectionIndex + 1}`;
    seen.add(connectionKey);
    return {
      ...connection,
      connectionKey,
      sourceKind: source.sourceKind || connection.sourceKind || "lyric-only",
      referenceId: source.referenceId || clean(connection.referenceId, 80),
      referenceTitle: source.referenceTitle || clean(connection.referenceTitle, 600),
      concepts: list(connection.concepts).map((concept, index) => ({
        ...concept,
        id: `${connectionKey}:concept-${String(index + 1).padStart(2, "0")}-${sha256(clean(concept.memoryHook || concept.title)).slice(-8)}`,
        qualityAssessment: qualityAssessment(concept),
      })),
    };
  });
  for (const source of job.packet.sourceConnections) {
    if (!seen.has(source.connectionKey)) connections.push({ ...source, conceptualBridge: "The authoring response omitted this source connection.", evidenceUsed: [], concepts: [] });
  }
  const usage = response.usage || {};
  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    planId: `echo-reference-intelligence:${job.songId}:${sha256(raw).slice(-12)}`,
    songId: job.songId,
    songTitle: job.songTitle,
    trackNumber: job.trackNumber,
    authoredAt: new Date().toISOString(),
    author: { type: "agent", name: "OpenAI reasoning model", model, reasoningEffort: "high" },
    sourceDigest: job.sourceDigest,
    songFoundation: raw.songFoundation || {},
    connections,
    usage: {
      inputTokens: Number(usage.input_tokens || 0),
      cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens || 0),
      outputTokens: Number(usage.output_tokens || 0),
      reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens || 0),
      totalTokens: Number(usage.total_tokens || 0),
    },
  };
}

function summarize(manifest) {
  const counts = { songs: manifest?.jobs?.length || 0, held: 0, queued: 0, running: 0, completed: 0, failed: 0, referenceConnections: 0, lyricOnlyConnections: 0, concepts: 0, prompts: 0, ready: 0, needsRevision: 0 };
  let scoreTotal = 0;
  for (const job of list(manifest?.jobs)) {
    if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
    for (const connection of list(job.plan?.connections)) {
      if (connection.sourceKind === "reference") counts.referenceConnections += 1;
      else counts.lyricOnlyConnections += 1;
      for (const concept of list(connection.concepts)) {
        counts.concepts += 1;
        if (clean(concept.imagePrompt)) counts.prompts += 1;
        const assessment = qualityAssessment(concept);
        scoreTotal += assessment.average;
        if (assessment.ready) counts.ready += 1;
        else counts.needsRevision += 1;
      }
    }
  }
  counts.averageQuality = counts.concepts ? Number((scoreTotal / counts.concepts).toFixed(2)) : 0;
  return counts;
}

function createEchoReferenceIntelligence({ userDataPath, credentialStore, sourceSongbookPath = "", fetchImpl = globalThis.fetch, now = () => new Date(), concurrency = 8, model = DEFAULT_MODEL, maxAttempts = 3 } = {}) {
  if (!userDataPath || !credentialStore?.read || typeof fetchImpl !== "function") throw new Error("Echo reference intelligence requires local app data, encrypted credentials, and fetch.");
  const runsRoot = path.join(path.resolve(userDataPath), RUNS_DIRECTORY);
  const currentPointerPath = path.join(runsRoot, CURRENT_FILENAME);
  let activePromise = null;
  let saveChain = Promise.resolve();
  let pauseRequested = false;

  async function currentManifestPath() {
    try {
      const pointer = await readJson(currentPointerPath);
      const candidate = path.join(runsRoot, pointer.runId, MANIFEST_FILENAME);
      return isInside(runsRoot, candidate) ? candidate : "";
    } catch { return ""; }
  }

  async function loadManifest() {
    const filePath = await currentManifestPath();
    try { return filePath ? await readJson(filePath) : null; } catch { return null; }
  }

  async function saveManifest(manifest) {
    manifest.updatedAt = now().toISOString();
    const work = saveChain.then(async () => {
      await atomicWriteJson(path.join(runsRoot, manifest.runId, MANIFEST_FILENAME), manifest);
      await atomicWriteJson(currentPointerPath, { runId: manifest.runId, updatedAt: manifest.updatedAt });
    });
    saveChain = work.catch(() => {});
    return work;
  }

  async function resolveModel(apiKey) {
    const candidates = [...new Set([model, ...MODEL_PREFERENCES])];
    let lastError = "";
    for (const candidate of candidates) {
      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: candidate, store: false, max_output_tokens: 24, input: "Reply with OK." }),
        });
        if (response.ok) return candidate;
        const payload = await response.json().catch(() => ({}));
        lastError = payload?.error?.message || `${candidate} returned ${response.status}`;
      } catch (error) { lastError = error?.message || String(error); }
    }
    throw new Error(`No configured OpenAI text model passed a live Responses API access check. Last result: ${safeError(lastError)}`);
  }

  async function loadAlbum(apiBase) {
    const response = await fetchImpl(new URL("/api/echos/song-notebook", apiBase), { cache: "no-store" });
    if (!response.ok) throw new Error(`Echo song notebook returned ${response.status}.`);
    const album = await response.json();
    if (!sourceSongbookPath) return album;
    const source = await readJson(sourceSongbookPath);
    const sourceSongs = list(source.songCards || source.songs);
    const byId = new Map();
    for (const item of sourceSongs) for (const key of [item.id, item.songId, item.registryTrackId, clean(item.title).toLowerCase()]) if (key) byId.set(String(key), item);
    album.songs = list(album.songs).map((song) => {
      const item = byId.get(song.id) || byId.get(song.songId) || byId.get(clean(song.title).toLowerCase());
      return item ? { ...song, canonicalSource: { lyrics: item.lyrics?.text || "", mood: item.mood || "", learningThing: item.learningThing || "", broadGameMechanic: item.broadGameMechanic || "", lore: item.lore || "" } } : song;
    });
    return album;
  }

  async function createManifest(apiBase, apiKey, mode = "pilot") {
    const album = await loadAlbum(apiBase);
    const selectedModel = await resolveModel(apiKey);
    const createdAt = now().toISOString();
    const runId = `echo-reference-intelligence-${createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
    const jobs = list(album.songs).map((song) => {
      const packet = songPacket(song);
      return {
        id: `intelligence-job:${sha256(packet.songId).slice(-16)}`,
        songId: packet.songId,
        songTitle: packet.songTitle,
        trackNumber: packet.trackNumber,
        sourceDigest: sha256(packet),
        packet,
        status: "held",
        attempts: 0,
        error: "",
        plan: null,
      };
    }).sort((a, b) => a.trackNumber - b.trackNumber);
    const pilotTitles = new Set(["Brave Tongues", "Miss Infinity", "Orange", "Asuna with the Tea", "Fighting!", "Card Declined", "Lionfire Rhapsody", "Wish Her Well"]);
    const pilotJobs = jobs.filter((job) => pilotTitles.has(job.songTitle));
    for (const job of (pilotJobs.length ? pilotJobs : jobs.slice(0, 8))) job.status = "queued";
    if (mode === "full") for (const job of jobs) job.status = "queued";
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      runId,
      mode,
      state: "queued",
      createdAt,
      updatedAt: createdAt,
      startedAt: "",
      finishedAt: "",
      model: selectedModel,
      reasoningEffort: "high",
      concurrency: Math.max(1, Math.min(12, Number(concurrency) || 1)),
      pilotSongCount: pilotJobs.length || Math.min(8, jobs.length),
      policy: { retainAllSupportedConcepts: true, competition: false, ranking: false, destructiveCritique: false, qualityGate: true, imageApiAutomaticDispatch: false },
      album: { title: clean(album.album?.title, 400) || "Echo Album / Dear Papa", songCount: jobs.length, sourceConnectionCount: jobs.reduce((total, job) => total + job.packet.sourceConnections.length, 0) },
      custody: { storage: "local-app-data", repositoryWrites: false, credentialsStoredInManifest: false, imageGenerationStarted: false },
      jobs,
    };
    await saveManifest(manifest);
    return manifest;
  }

  async function requestPlanChunk(apiKey, manifest, job) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: manifest.model,
            store: false,
            reasoning: { effort: "high" },
            max_output_tokens: 30000,
            prompt_cache_key: "hapa-echo-reference-intelligence-v1",
            input: [
              { role: "developer", content: [{ type: "input_text", text: DEVELOPER_INSTRUCTIONS }] },
              { role: "user", content: [{ type: "input_text", text: `Create and retain the complete visual-intelligence record for this song. Return one connection with the exact connectionKey for every sourceConnections item.\n\n${JSON.stringify(job.packet)}` }] },
            ],
            text: { verbosity: "medium", format: { type: "json_schema", name: "echo_reference_intelligence", strict: true, schema: OUTPUT_SCHEMA } },
          }),
          signal: controller.signal,
        });
        const requestId = response.headers?.get?.("x-request-id") || "";
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload?.error?.message || `OpenAI Responses request failed (${response.status}).`);
          error.status = response.status;
          error.requestId = requestId;
          throw error;
        }
        const rawText = outputText(payload);
        if (!rawText) throw new Error("The reasoning model returned no structured output text.");
        const plan = normalizePlan(JSON.parse(rawText), job, manifest.model, payload);
        if (!plan.connections.some((connection) => connection.concepts.length)) throw new Error("The reasoning model returned no visual concepts.");
        return { plan, requestId };
      } catch (error) {
        lastError = error;
        const retryable = error?.name === "AbortError" || error?.name === "TypeError" || /fetch failed/i.test(String(error?.message || "")) || [408, 409, 429].includes(error?.status) || Number(error?.status || 0) >= 500;
        if (!retryable || attempt >= maxAttempts) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 2000 * (2 ** (attempt - 1)))));
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("The visual-intelligence request failed.");
  }

  async function requestPlan(apiKey, manifest, job) {
    const sources = job.packet.sourceConnections;
    const chunks = [];
    for (let index = 0; index < sources.length; index += 1) chunks.push(sources.slice(index, index + 1));
    const partials = [];
    const requestIds = [];
    for (const sourceConnections of chunks) {
      const packet = { ...job.packet, sourceConnections };
      const partial = await requestPlanChunk(apiKey, manifest, { ...job, packet });
      partials.push(partial.plan);
      requestIds.push(partial.requestId);
    }
    const first = partials[0];
    const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };
    for (const partial of partials) for (const key of Object.keys(usage)) usage[key] += Number(partial.usage?.[key] || 0);
    return {
      requestId: requestIds.filter(Boolean).join(","),
      plan: {
        ...first,
        planId: `echo-reference-intelligence:${job.songId}:${sha256(partials.map((partial) => partial.planId)).slice(-12)}`,
        connections: partials.flatMap((partial) => partial.connections),
        usage,
      },
    };
  }

  async function processQueue() {
    const manifest = await loadManifest();
    if (!manifest) return;
    const apiKey = await credentialStore.read("openai");
    if (!apiKey) { manifest.state = "blocked"; manifest.blocker = { code: "openai_key_missing", message: "Add an OpenAI API key before authoring visual intelligence." }; await saveManifest(manifest); return; }
    pauseRequested = false;
    manifest.state = "running";
    manifest.startedAt ||= now().toISOString();
    manifest.jobs = manifest.jobs.map((job) => job.status === "running" ? { ...job, status: "queued", error: "Recovered after interruption." } : job);
    await saveManifest(manifest);
    async function worker() {
      while (!pauseRequested) {
        const job = manifest.jobs.find((item) => item.status === "queued");
        if (!job) return;
        job.status = "running";
        job.startedAt = now().toISOString();
        job.attempts += 1;
        await saveManifest(manifest);
        try {
          const result = await requestPlan(apiKey, manifest, job);
          job.plan = result.plan;
          job.requestId = result.requestId;
          job.status = "completed";
          job.error = "";
        } catch (error) {
          job.status = "failed";
          job.error = safeError(error);
          job.requestId = error?.requestId || "";
        }
        job.finishedAt = now().toISOString();
        job.durationSeconds = Math.max(0, (Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000);
        await saveManifest(manifest);
      }
    }
    await Promise.all(Array.from({ length: manifest.concurrency }, () => worker()));
    const remaining = manifest.jobs.some((job) => ["queued", "running"].includes(job.status));
    const failures = manifest.jobs.some((job) => job.status === "failed");
    manifest.state = pauseRequested && remaining ? "paused" : manifest.mode === "pilot" ? (failures ? "pilot-complete-with-errors" : "pilot-complete") : (failures ? "complete-with-errors" : "complete");
    if (!remaining) manifest.finishedAt = now().toISOString();
    manifest.counts = summarize(manifest);
    await saveManifest(manifest);
  }

  function launch() {
    if (!activePromise) activePromise = processQueue().finally(() => { activePromise = null; });
  }

  async function start({ apiBase, mode = "pilot" } = {}) {
    if (!apiBase) throw new Error("Choose a valid loopback Echo Album API.");
    const prior = await loadManifest();
    if (prior?.state === "running" || activePromise) return status();
    if (prior) throw new Error(`A visual-intelligence run already exists in state “${prior.state}”. Preserve or archive it before starting another.`);
    const apiKey = await credentialStore.read("openai");
    if (!apiKey) throw new Error("Add an OpenAI API key before starting the visual-intelligence pass.");
    const manifest = await createManifest(apiBase, apiKey, mode === "full" ? "full" : "pilot");
    launch();
    return { ...manifest, counts: summarize(manifest), jobs: [] };
  }

  async function continueFull() {
    if (activePromise) throw new Error("The current visual-intelligence queue is still running.");
    const manifest = await loadManifest();
    if (!manifest || !["pilot-complete", "pilot-complete-with-errors"].includes(manifest.state)) throw new Error(`A completed intelligence pilot is required; current state is “${manifest?.state || "not-started"}”.`);
    manifest.mode = "full";
    manifest.state = "queued";
    manifest.finishedAt = "";
    manifest.concurrency = 12;
    manifest.jobs = manifest.jobs.map((job) => job.status === "held" || job.status === "failed" ? { ...job, status: "queued", error: "" } : job);
    await saveManifest(manifest);
    launch();
    return status();
  }

  async function refreshAll({ apiBase } = {}) {
    if (activePromise) throw new Error("The current visual-intelligence queue is still running.");
    if (!apiBase) throw new Error("Choose a valid loopback Echo Album API.");
    const manifest = await loadManifest();
    if (!manifest) throw new Error("There is no visual-intelligence run to refresh.");
    const album = await loadAlbum(apiBase);
    const latest = new Map(list(album.songs).map((song) => {
      const packet = songPacket(song);
      return [packet.songId, packet];
    }));
    manifest.mode = "full";
    manifest.state = "queued";
    manifest.finishedAt = "";
    manifest.concurrency = 12;
    manifest.jobs = manifest.jobs.map((job) => {
      const packet = latest.get(job.songId) || job.packet;
      return {
        ...job,
        packet,
        sourceDigest: sha256(packet),
        status: "queued",
        error: "",
        supersededPlans: job.plan ? [...list(job.supersededPlans), { ...job.plan, supersededAt: now().toISOString(), supersededReason: "Re-authored from canonical full lyrics without legacy stock visual thesis." }] : list(job.supersededPlans),
        plan: null,
      };
    });
    await saveManifest(manifest);
    launch();
    return status();
  }

  async function resume() {
    const manifest = await loadManifest();
    if (!manifest) throw new Error("There is no visual-intelligence run to resume.");
    const apiKey = await credentialStore.read("openai");
    if (!apiKey) throw new Error("Add an OpenAI API key before resuming the visual-intelligence pass.");
    manifest.model = await resolveModel(apiKey);
    manifest.concurrency = Math.max(1, Math.min(24, Number(concurrency) || Number(manifest.concurrency) || 1));
    manifest.jobs = manifest.jobs.map((job) => job.status === "failed" ? { ...job, status: "queued", error: "" } : job);
    manifest.state = "queued";
    manifest.finishedAt = "";
    await saveManifest(manifest);
    launch();
    return status();
  }

  async function pause() {
    pauseRequested = true;
    const manifest = await loadManifest();
    if (manifest && !manifest.jobs.some((job) => job.status === "running")) { manifest.state = "paused"; await saveManifest(manifest); }
    return status();
  }

  async function audit() {
    if (activePromise) throw new Error("Wait for the current visual-intelligence queue before running the corpus quality audit.");
    const manifest = await loadManifest();
    if (!manifest) throw new Error("There is no visual-intelligence run to audit.");
    applyCorpusQuality(manifest);
    await saveManifest(manifest);
    return status();
  }

  async function status({ songId = "" } = {}) {
    const manifest = await loadManifest();
    if (!manifest) return { ok: true, schemaVersion: SCHEMA_VERSION, state: "not-started", model, counts: summarize(null), jobs: [] };
    const jobs = songId ? manifest.jobs.filter((job) => job.songId === songId) : manifest.jobs;
    return { ok: true, schemaVersion: manifest.schemaVersion, runId: manifest.runId, mode: manifest.mode, state: manifest.state, model: manifest.model, reasoningEffort: manifest.reasoningEffort, policy: manifest.policy, album: manifest.album, pilotSongCount: manifest.pilotSongCount, corpusQualityAssessedAt: manifest.corpusQualityAssessedAt || "", createdAt: manifest.createdAt, startedAt: manifest.startedAt, finishedAt: manifest.finishedAt, concurrency: manifest.concurrency, counts: summarize(manifest), jobs: jobs.map((job) => ({ id: job.id, songId: job.songId, songTitle: job.songTitle, trackNumber: job.trackNumber, status: job.status, attempts: job.attempts, error: job.error, durationSeconds: job.durationSeconds || 0, plan: job.plan })) };
  }

  return Object.freeze({ start, continueFull, refreshAll, resume, pause, audit, status, _active: () => activePromise });
}

module.exports = { SCHEMA_VERSION, PLAN_SCHEMA_VERSION, SCORE_KEYS, OUTPUT_SCHEMA, DEVELOPER_INSTRUCTIONS, songPacket, qualityAssessment, normalizePlan, summarize, applyCorpusQuality, createEchoReferenceIntelligence };
