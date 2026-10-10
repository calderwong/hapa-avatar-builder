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
const OPENAI_PROVIDER = "openai";
const LOCAL_OMLX_PROVIDER = "local-omlx";
const LOCAL_OMLX_MODEL = "qwen38-flash-next:fast";
const LOCAL_OMLX_BASE_URL = "http://127.0.0.1:8001/v1";
const LOCAL_RETRY_POLICY_VERSION = "fast-targeted-repair-v1";
const LOCAL_STRICT_JSON = process.env.HAPA_ECHO_LOCAL_STRICT_JSON === "1";
const LOCAL_FAST_DRAIN = process.env.HAPA_ECHO_LOCAL_FAST_DRAIN !== "0";
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
      minItems: 1,
      maxItems: 1,
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
                imagePrompt: { type: "string", minLength: 1100, maxLength: 4000 },
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

const LOCAL_BLUEPRINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["connectionKey", "sourceMechanism", "songSpecificRecognition", "seeds"],
  properties: {
    connectionKey: { type: "string" },
    sourceMechanism: { type: "string" },
    songSpecificRecognition: { type: "string" },
    seeds: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "lyricAnchor", "centralAction", "referenceMechanism", "lessonPayoff", "tarotTransformation", "heroObject", "avatarRole", "symbolNames", "antiGeneric", "distinctFromOtherSeeds"],
        properties: {
          title: { type: "string" },
          lyricAnchor: { type: "string" },
          centralAction: { type: "string" },
          referenceMechanism: { type: "string" },
          lessonPayoff: { type: "string" },
          tarotTransformation: { type: "string" },
          heroObject: { type: "string" },
          avatarRole: { type: "string" },
          symbolNames: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
          antiGeneric: { type: "string" },
          distinctFromOtherSeeds: { type: "string" },
        },
      },
    },
  },
};

const LOCAL_SINGLE_CONCEPT_SCHEMA = JSON.parse(JSON.stringify(OUTPUT_SCHEMA));
LOCAL_SINGLE_CONCEPT_SCHEMA.properties.connections.items.properties.concepts.minItems = 1;
LOCAL_SINGLE_CONCEPT_SCHEMA.properties.connections.items.properties.concepts.maxItems = 1;

const LOCAL_PROMPT_REPAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["imagePrompt"],
  properties: { imagePrompt: { type: "string", minLength: 1100, maxLength: 4000 } },
};

const FULL_CONCEPT_PROPERTIES = OUTPUT_SCHEMA.properties.connections.items.properties.concepts.items.properties;
const LOCAL_COMPACT_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["songFoundation", "connection"],
  properties: {
    songFoundation: OUTPUT_SCHEMA.properties.songFoundation,
    connection: {
      type: "object",
      additionalProperties: false,
      required: ["connectionKey", "conceptualBridge", "evidenceUsed", "concepts"],
      properties: {
        connectionKey: { type: "string" },
        conceptualBridge: { type: "string" },
        evidenceUsed: { type: "array", items: { type: "string" } },
        concepts: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["blueprintSeedTitle", "title", "memoryHook", "scene", "symbols", "palette", "visualSignature", "retrievalTags", "imagePrompt", "qualityAssessment"],
            properties: {
              blueprintSeedTitle: { type: "string" },
              title: FULL_CONCEPT_PROPERTIES.title,
              memoryHook: FULL_CONCEPT_PROPERTIES.memoryHook,
              scene: FULL_CONCEPT_PROPERTIES.scene,
              symbols: FULL_CONCEPT_PROPERTIES.symbols,
              palette: FULL_CONCEPT_PROPERTIES.palette,
              visualSignature: FULL_CONCEPT_PROPERTIES.visualSignature,
              retrievalTags: FULL_CONCEPT_PROPERTIES.retrievalTags,
              imagePrompt: FULL_CONCEPT_PROPERTIES.imagePrompt,
              qualityAssessment: FULL_CONCEPT_PROPERTIES.qualityAssessment,
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

const LOCAL_DEVELOPER_INSTRUCTIONS = `Local structured-output requirements:
- This request contains exactly ONE sourceConnections item. Return exactly ONE connection and copy its connectionKey byte-for-byte. Never add, duplicate, split, or reinterpret the connection as another record.
- Keep every materially distinct concept supported by that one connection, normally 2-5. Do not create cosmetic variants. Each concept needs a different central action or playable mechanic, not merely another camera, location, animal, or costume.
- Build each concept as one causal visual equation: an exact lyric noun or action visibly operates the reference's transferable mechanism, that operation teaches the stated lesson, and the attached Tarot card supplies the countable prop, spatial rule, or consequence. The four inputs must change one another. Do not make a collage of callbacks.
- Give the card one unmistakable hero action and one memory hook that could identify this song with its title hidden. Prefer a strange concrete consequence from the lyric over a generic emblem of burden, hope, choice, love, ascent, or danger.
- Every imagePrompt should be a dense 180-300 words. Put the complete subject, exact action, environment, camera, at least three named symbols with placement and function, exact palette colors with roles, visual hierarchy, character constraints, Tarot transformation, and exclusions inside imagePrompt—not only in adjacent fields.
- Literally name the attached Tarot card or archetype inside every imagePrompt and make its suit/count/symbol visible through a transformed prop, action, or geometry. A numbered Minor Arcana card must show the exact count as individually readable objects. Merely implying burden, hope, love, or another meaning fails. Never say that a Tarot symbol is "implied." Copy at least two exact symbol names from the concept's symbols array into the imagePrompt.
- Do not explain the design with phrases such as "the burden is," "the Wands are," or "is transformed." Directly describe the altered Tarot object doing the lyric action so an image model can render the synthesis rather than receiving an art-history caption.
- Every sentence must change a visible choice or state an important exclusion. Never write meta filler such as "the image is complete," "the image is ready for a playing card," "a study in," or "memorable for its." Mention the 2:3 playing-card composition once at most.
- Use at most three concise exclusion sentences in imagePrompt. Do not copy the long legacy-default list into a prompt; spend the prompt on positive, renderable decisions.
- Put at least 140 words of positive, renderable description before any exclusion sentence, and list no more than eight excluded items total. Exclusions never count toward prompt completeness.
- If a person materially serves the concept, use an established reusable Hapa role when evidence supports it: Red (protective strategist, worn red cap, black-red armor), Blue (navigator/archivist, navy-cyan Orion flight suit, red earbud cable), Green (repair/cultivation ranger, dark beard, hood, living-wood bow), or Bella (self-possessed dancer, long dark hair, warm olive/tan skin, red-cream fabric, gold jewelry). Domina and Falka may be named only when the supplied song evidence names or clearly supports them. Otherwise make the concept object-, creature-, architecture-, or landscape-led. Never invent a capitalized character nickname such as "The Fox-Protector" as a substitute for character design.
- A named Hapa Red, Blue, Green, or Bella must retain at least two of that role's listed physical identity markers inside imagePrompt, even when their occupational costume changes. Keep their face readable; do not hide or obscure it to avoid character design.
- Avoid generic lone-climber, path, fog, moon, and fantasy-tower staging unless an exact lyric object visibly transforms it. Do not use a merely resting animal, distant watcher, reaching hand, or heroic stance as the central action.
- Transfer the reference's underlying mechanism without recreating copyrighted characters, signature locations, costumes, or franchise compositions.
- Score against the returned production prompt as written. A short, generic, weakly referenced, or weakly Tarot-integrated prompt must not receive a 4 or 5 in that dimension.
- Return only the schema-valid JSON object.`;

function outputText(payload = {}) {
  if (clean(payload.output_text)) return clean(payload.output_text, 2_000_000);
  return list(payload.output).flatMap((item) => list(item.content)).filter((item) => item.type === "output_text").map((item) => item.text || "").join("");
}

function parseLocalJson(value) {
  const source = clean(value, 2_000_000);
  if (!source) throw new SyntaxError("The local model returned an empty JSON response.");
  try { return JSON.parse(source); } catch {}
  const unfenced = source.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(unfenced); } catch {}
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
  throw new SyntaxError("The local model did not return a complete JSON object.");
}

function localTextContract(name, schema) {
  return LOCAL_STRICT_JSON
    ? { verbosity: "medium", format: { type: "json_schema", name, strict: true, schema } }
    : { verbosity: "medium" };
}

function localSchemaInstruction(schema) {
  return LOCAL_STRICT_JSON ? "" : `\nReturn one raw JSON object matching this exact schema; no Markdown or surrounding prose:\n${JSON.stringify(schema)}`;
}

function stabilizeLocalBlueprint(value = {}, job = {}) {
  const expectedKey = clean(job.packet?.sourceConnections?.[0]?.connectionKey);
  const minor = list(job.packet?.tarotConnections)
    .map((item) => clean(item.cardTitle, 120).match(/^(Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten) of (Wands|Cups|Swords|Pentacles)$/i))
    .find(Boolean);
  const actions = [];
  const blueprint = { ...value, connectionKey: expectedKey || clean(value.connectionKey) };
  if (expectedKey && clean(value.connectionKey) !== expectedKey) actions.push("restore-connection-key");
  if (minor) {
    blueprint.seeds = list(value.seeds).map((seed) => {
      if (new RegExp(`\\b${minor[2].replace(/s$/, "")}s?\\b`, "i").test(`${seed.heroObject} ${seed.tarotTransformation}`)) return seed;
      actions.push(`insert-${minor[1]}-${minor[2]}-seed-objects`);
      return {
        ...seed,
        heroObject: `${clean(seed.heroObject)} with ${minor[1].toLowerCase()} separately readable ${minor[2].toLowerCase()}`.trim(),
        tarotTransformation: `${clean(seed.tarotTransformation)} Exactly ${minor[1].toLowerCase()} separately readable ${minor[2].toLowerCase()} remain individual physical objects and perform the seed's central action.`.trim(),
      };
    });
  }
  if (actions.length) blueprint.localBlueprintStabilization = { applied: true, actions: [...new Set(actions)] };
  return blueprint;
}

async function responsePayload(response) {
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  if (!contentType.includes("text/event-stream") || !response.body?.getReader) return response.json().catch(() => ({}));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let completed = null;
  function acceptData(data) {
    if (!data) return;
    if (data === "[DONE]") {
      if (output) completed ||= { status: "completed", output_text: output };
      return;
    }
    const event = JSON.parse(data);
    if (event.type === "response.output_text.delta") {
      output += event.delta || "";
      try {
        const structured = JSON.parse(output);
        if (structured && typeof structured === "object") completed ||= { status: "completed", output_text: output };
      } catch {}
    }
    if (event.type === "response.completed") completed = event.response || {};
    if (event.type === "response.incomplete") completed = event.response || { status: "incomplete", output_text: output };
    if (event.type === "response.failed") throw new Error(event.response?.error?.message || "Local oMLX streaming response failed.");
  }
  while (!completed) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      acceptData(data);
    }
    if (!completed && buffer.startsWith("data:")) {
      try {
        acceptData(buffer.slice(5).trim());
        buffer = "";
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
  }
  reader.cancel().catch(() => {});
  if (!completed) throw new Error("Local oMLX stream ended without response.completed.");
  if (output && !outputText(completed)) completed.output_text = output;
  return completed;
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
  const objectiveReasons = [...list(concept.localPromptAssessment?.gateReasons), ...list(concept.corpusAssessment?.gateReasons)];
  const ready = !missing.length && !weakScores.length && !objectiveReasons.length && average >= 4.2;
  return { ...supplied, ...scores, average: Number(average.toFixed(2)), ready, status: ready ? "ready-for-image-api" : "needs-revision", gateReasons: [...missing.map((key) => `missing:${key}`), ...weakScores.map((key) => `score-below-4:${key}`), ...(average < 4.2 ? [`average-below-4.2:${average.toFixed(2)}`] : []), ...objectiveReasons] };
}

function localPromptAssessment(concept = {}, context = {}) {
  const prompt = clean(concept.imagePrompt, 20000);
  const lower = prompt.toLowerCase();
  const gateReasons = [];
  const boilerplate = ["the image is complete", "ready for a playing card", "a study in", "memorable for its", "the image must convey", "the burden is", "the wands are", "is transformed", "are implied", "is implied"].filter((phrase) => lower.includes(phrase));
  if (boilerplate.length) gateReasons.push(`local-boilerplate:${boilerplate.join("+")}`);
  const exclusionSentences = prompt.split(/(?<=[.!?])\s+/).filter((sentence) => /^(No|Avoid|Exclude)\b/i.test(sentence.trim()));
  if (exclusionSentences.length > 3) gateReasons.push(`exclusion-bloat:${exclusionSentences.length}`);
  const firstExclusion = prompt.search(/(?:^|(?<=[.!?])\s+)(?:No|Avoid|Exclude)\b/i);
  const positivePrompt = firstExclusion >= 0 ? prompt.slice(0, firstExclusion) : prompt;
  const positiveWords = positivePrompt.split(/\s+/).filter(Boolean).length;
  if (positiveWords < 140) gateReasons.push(`positive-prompt-words:${positiveWords}`);
  const exclusionClauses = exclusionSentences.reduce((count, sentence) => count + sentence.split(/,|;/).filter((part) => part.trim()).length, 0);
  if (exclusionClauses > 8) gateReasons.push(`exclusion-items:${exclusionClauses}`);
  const characterUse = clean(concept.characterUse).toLowerCase();
  const personExpected = characterUse && !/(no person|no character|none|object-led|no addressee visible|disembodied hands|no full bod)/.test(characterUse);
  if (personExpected && !/\bhapa\b/i.test(prompt)) gateReasons.push("missing-hapa-character-continuity");
  if (/original Hapa character\s*,?\s*[‘'\"]The\s+/i.test(prompt)) gateReasons.push("invented-generic-hapa-role");
  const hapaMarkers = {
    red: [/red cap/i, /black[- ]red/i, /armor/i],
    blue: [/navy/i, /cyan/i, /red (?:earbud|audio) cable/i, /orion flight suit/i],
    green: [/(?:dark[- ]?)?beard/i, /hood/i, /living[- ]wood bow/i, /wood(?:en)? bow/i],
    bella: [/long dark hair/i, /(?:olive|tan) skin/i, /red[- ]cream/i, /gold (?:jewelry|jewellery)/i],
  };
  for (const [role, markers] of Object.entries(hapaMarkers)) {
    if (!new RegExp(`\\bhapa ${role}\\b`, "i").test(prompt)) continue;
    const markerCount = markers.filter((pattern) => pattern.test(prompt)).length;
    if (markerCount < 2) gateReasons.push(`hapa-identity-markers:${role}:${markerCount}/2`);
    if (/(?:face|features?|identity) (?:is |are )?(?:obscured|hidden|unseen)|no face visible/i.test(prompt)) gateReasons.push(`hapa-identity-obscured:${role}`);
  }
  const tarotTitles = list(context.packet?.tarotConnections).map((item) => clean(item.cardTitle, 120)).filter(Boolean);
  const hasAttachedTarotTitle = tarotTitles.some((title) => lower.includes(title.toLowerCase()));
  if (!hasAttachedTarotTitle && !/(tarot|arcana|wand|cup|sword|pentacle)/i.test(prompt)) gateReasons.push("missing-visible-tarot-language");
  if (tarotTitles.length && !hasAttachedTarotTitle) gateReasons.push(`missing-attached-tarot-title:${tarotTitles.join("|")}`);
  const numberedMinor = tarotTitles.map((title) => title.match(/^(Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten) of (Wands|Cups|Swords|Pentacles)$/i)).find(Boolean);
  if (numberedMinor) {
    const countWord = numberedMinor[1].toLowerCase();
    const suitWord = numberedMinor[2].toLowerCase();
    const countHits = (lower.match(new RegExp(`\\b${countWord}\\b`, "g")) || []).length;
    if (countHits < 2) gateReasons.push(`missing-explicit-minor-count:${numberedMinor[1]}-${numberedMinor[2]}`);
  }
  const namedSymbols = list(concept.symbols).map((item) => clean(item.symbol, 120).toLowerCase()).filter((symbol) => symbol.length >= 3);
  const promptTokens = new Set((lower.match(/[a-z0-9]+/g) || []).map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
  const visibleSymbols = namedSymbols.filter((symbol) => {
    if (lower.includes(symbol)) return true;
    const tokens = (symbol.match(/[a-z0-9]+/g) || []).map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token);
    return tokens.length > 0 && tokens.every((token) => promptTokens.has(token));
  });
  if (visibleSymbols.length < Math.min(2, namedSymbols.length)) gateReasons.push(`symbol-coverage:${visibleSymbols.length}/${namedSymbols.length}`);
  return { gateReasons, boilerplate, visibleSymbols, assessedAt: new Date().toISOString() };
}

function sanitizeLocalPrompt(value = "") {
  const banned = ["the image is complete", "ready for a playing card", "a study in", "memorable for its", "the image must convey", "the burden is", "the wands are", "is transformed", "are implied", "is implied"];
  const removed = [];
  const sentences = clean(value, 20000).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const kept = sentences.filter((sentence) => {
    const match = banned.find((phrase) => sentence.toLowerCase().includes(phrase));
    if (match) removed.push(match);
    return !match;
  });
  return { prompt: kept.join(" ").replace(/\s+/g, " ").trim(), removed: [...new Set(removed)] };
}

function stabilizeLocalPrompt(concept = {}, context = {}) {
  const actions = [];
  const sanitized = sanitizeLocalPrompt(concept.imagePrompt);
  let prompt = sanitized.prompt
    .replace(/(?:the )?(?:face|features?|identity) (?:is |are )?(?:obscured|hidden|unseen)/gi, "the face remains fully readable")
    .replace(/no face visible/gi, "the face remains fully readable");
  if (prompt !== sanitized.prompt) actions.push("restore-readable-face-language");
  const packet = context.packet || {};
  const tarotTitle = list(packet.tarotConnections).map((item) => clean(item.cardTitle, 120)).find(Boolean) || "";
  const lower = () => prompt.toLowerCase();
  const prefix = [];
  if (tarotTitle && !lower().includes(tarotTitle.toLowerCase())) {
    prefix.push(`The Tarot card ${tarotTitle} governs this tableau.`);
    actions.push("insert-exact-tarot-title");
  }
  const minor = list(packet.tarotConnections)
    .map((item) => clean(item.cardTitle, 120).match(/^(Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten) of (Wands|Cups|Swords|Pentacles)$/i))
    .find(Boolean);
  if (minor) {
    const minorTitle = `${minor[1]} of ${minor[2]}`;
    if (!lower().includes(minorTitle.toLowerCase())) {
      prefix.push(`The Tarot card ${minorTitle} also governs the countable suit mechanism.`);
      actions.push("insert-numbered-minor-title");
    }
    const countHits = (lower().match(new RegExp(`\\b${minor[1]}\\b`, "gi")) || []).length;
    if (countHits < 2) {
      prefix.push(`Exactly ${minor[1].toLowerCase()} separately readable ${minor[2].toLowerCase()} remain visible as individual physical objects and perform the central action.`);
      actions.push("insert-explicit-minor-count");
    }
  }
  const namedSymbols = list(concept.symbols).map((item) => clean(item.symbol, 120)).filter(Boolean);
  const missingSymbols = namedSymbols.filter((symbol) => !lower().includes(symbol.toLowerCase())).slice(0, 2);
  if (missingSymbols.length) {
    prefix.push(`Keep ${missingSymbols.join(" and ")} separately visible at their specified placements, each performing its stated symbolic function.`);
    actions.push("insert-named-symbols");
  }
  const characterUse = clean(concept.characterUse).toLowerCase();
  const personExpected = characterUse && !/(no person|no character|none|object-led|no addressee visible|disembodied hands|no full bod)/.test(characterUse);
  if (personExpected && !/\bhapa\b/i.test(prompt)) {
    prefix.push("The visible person is an original Hapa character with a clear, reusable silhouette and a fully readable face.");
    actions.push("insert-hapa-continuity");
  }
  const identity = {
    red: "Hapa Red retains a worn red cap and black-red armor.",
    blue: "Hapa Blue retains a navy-cyan Orion flight suit and red earbud cable.",
    green: "Hapa Green retains a dark beard, hood, and living-wood bow.",
    bella: "Hapa Bella retains long dark hair, warm olive skin, red-cream fabric, and gold jewelry.",
  };
  for (const [role, sentence] of Object.entries(identity)) {
    if (new RegExp(`\\bhapa ${role}\\b`, "i").test(prompt) && localPromptAssessment({ ...concept, imagePrompt: `${prefix.join(" ")} ${prompt}` }, context).gateReasons.some((reason) => reason.startsWith(`hapa-identity-markers:${role}`))) {
      prefix.push(sentence);
      actions.push(`insert-${role}-identity-markers`);
    }
  }
  if (prefix.length) prompt = `${prefix.join(" ")} ${prompt}`.trim();
  let assessment = localPromptAssessment({ ...concept, imagePrompt: prompt }, context);
  if (assessment.gateReasons.some((reason) => reason.startsWith("exclusion-bloat:") || reason.startsWith("exclusion-items:"))) {
    prompt = prompt.split(/(?<=[.!?])\s+/).filter((sentence) => !/^(No|Avoid|Exclude)\b/i.test(sentence.trim())).join(" ").trim();
    actions.push("remove-exclusion-padding");
    assessment = localPromptAssessment({ ...concept, imagePrompt: prompt }, context);
  }
  if (assessment.gateReasons.some((reason) => reason.startsWith("positive-prompt-words:")) || prompt.split(/\s+/).filter(Boolean).length < 160) {
    const scene = concept.scene || {};
    const palette = list(concept.palette).map((item) => `${clean(item.color)} for ${clean(item.role)}`).filter((item) => item !== " for ").join(", ");
    const symbols = list(concept.symbols).map((item) => `${clean(item.symbol)} at ${clean(item.placement)} visibly ${clean(item.meaning)}`).filter(Boolean).join("; ");
    prompt = `${prompt} Render ${clean(scene.subject) || "the hero subject"} ${clean(scene.action) || "performing the central action"} in ${clean(scene.setting) || "the specified setting"}, framed ${clean(scene.camera) || "for a clear 2:3 composition"} under ${clean(scene.lightAndWeather) || "directional story light"}. Use ${clean(scene.materialLanguage) || "tactile, materially distinct surfaces"}; keep each physical consequence legible from foreground through background. Place ${symbols || "every named symbol at its specified placement with an observable function"}. Assign ${palette || "each palette color a distinct narrative role"}. Keep the hero action, causal lesson, and transformed Tarot mechanism readable at thumbnail scale without explanatory text.`.replace(/\s+/g, " ").trim();
    actions.push("expand-positive-renderable-detail");
  }
  const words = prompt.split(/\s+/).filter(Boolean);
  if (words.length > 500) {
    prompt = words.slice(0, 500).join(" ").replace(/[,;:]?$/, ".");
    actions.push(`trim-prompt-words:${words.length}->500`);
  }
  return {
    ...concept,
    imagePrompt: prompt,
    localSanitization: { removedPhrases: [...new Set([...list(concept.localSanitization?.removedPhrases), ...sanitized.removed])] },
    ...(actions.length ? { localPromptStabilization: { applied: true, actions } } : {}),
  };
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
  for (const job of list(manifest.jobs)) {
    const finalizedKeys = new Set(list(job.plan?.connections).map((connection) => connection.connectionKey));
    const plans = [job.plan, ...list(job.partialPlans).filter((partial) => !finalizedKeys.has(partial?.connectionKey)).map((partial) => partial?.plan)].filter(Boolean);
    for (const plan of plans) for (const connection of list(plan.connections)) for (const concept of list(connection.concepts)) {
      const signature = concept.visualSignature || {};
      const signatureText = [concept.title, concept.memoryHook, signature.subjectType, signature.shotScale, signature.cameraAngle, signature.settingType, signature.dominantGeometry, signature.lighting, signature.materialLanguage].join(" ");
      concepts.push({ job, plan, connection, concept, tokens: signatureTokens(signatureText) });
    }
  }
  const defaults = ["cliffside", "fantasy city", "golden sunset", "celestial arc", "open hand", "glowing table", "multicolored tree", "backpack", "harbor path"];
  for (let index = 0; index < concepts.length; index += 1) {
    const current = concepts[index];
    if (current.plan?.author?.provider === LOCAL_OMLX_PROVIDER) current.concept.localPromptAssessment = localPromptAssessment(current.concept, { packet: current.job.packet });
    let nearest = null;
    for (let otherIndex = 0; otherIndex < concepts.length; otherIndex += 1) {
      if (index === otherIndex) continue;
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

function normalizePlan(raw = {}, job = {}, model = "", response = {}, author = {}) {
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
      concepts: list(connection.concepts).map((concept, index) => {
        const normalized = {
          ...concept,
          id: `${connectionKey}:concept-${String(index + 1).padStart(2, "0")}-${sha256(clean(concept.memoryHook || concept.title)).slice(-8)}`,
          ...(author.provider === LOCAL_OMLX_PROVIDER ? { localPromptAssessment: localPromptAssessment(concept, { packet: job.packet }) } : {}),
        };
        normalized.qualityAssessment = qualityAssessment(normalized);
        return normalized;
      }),
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
    author: {
      type: "agent",
      name: clean(author.name, 160) || "OpenAI reasoning model",
      provider: clean(author.provider, 80) || OPENAI_PROVIDER,
      model,
      reasoningEffort: clean(author.reasoningEffort, 80) || "high",
    },
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
  const counts = { songs: manifest?.jobs?.length || 0, held: 0, queued: 0, running: 0, completed: 0, failed: 0, sourceConnections: 0, referenceConnections: 0, lyricOnlyConnections: 0, missingConnections: 0, checkpointConnections: 0, checkpointConcepts: 0, concepts: 0, prompts: 0, ready: 0, needsRevision: 0 };
  let scoreTotal = 0;
  for (const job of list(manifest?.jobs)) {
    if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
    counts.sourceConnections += list(job.packet?.sourceConnections).length;
    const finalizedKeys = new Set(list(job.plan?.connections).map((connection) => connection.connectionKey));
    counts.missingConnections += Math.max(0, list(job.packet?.sourceConnections).length - finalizedKeys.size);
    for (const partial of list(job.partialPlans)) {
      if (finalizedKeys.has(partial?.connectionKey)) continue;
      counts.checkpointConnections += 1;
      counts.checkpointConcepts += list(partial?.plan?.connections).flatMap((connection) => list(connection.concepts)).length;
    }
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

  function localOmlxUrl(pathname = "") {
    const base = new URL(LOCAL_OMLX_BASE_URL);
    if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.port !== "8001") throw new Error("Local prompt authoring is restricted to the qualified oMLX loopback endpoint on 127.0.0.1:8001.");
    return new URL(pathname.replace(/^\//, ""), `${base.toString().replace(/\/$/, "")}/`);
  }

  async function resolveModel(apiKey, provider = OPENAI_PROVIDER) {
    if (provider === LOCAL_OMLX_PROVIDER) {
      const response = await fetchImpl(localOmlxUrl("models"), {
        headers: { Authorization: "Bearer local-no-key" },
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Local oMLX model check failed (${response.status}).`);
      const available = list(payload.data).map((item) => clean(item.id, 160));
      if (!available.includes(LOCAL_OMLX_MODEL)) throw new Error(`Local oMLX does not advertise ${LOCAL_OMLX_MODEL}.`);
      return LOCAL_OMLX_MODEL;
    }
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

  async function requestLocalBlueprint(manifest, job) {
    const controller = new AbortController();
    // The qualified :fast profile can legitimately need well over eight
    // minutes for dense late-album packets. Shorter deadlines repeatedly
    // aborted otherwise healthy local authoring for Catch the Rabbit and Pipa
    // Card Garden before the structured blueprint response completed.
    const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);
    try {
      const source = job.packet.sourceConnections[0] || {};
      const response = await fetchImpl(localOmlxUrl("responses"), {
        method: "POST",
        headers: { Authorization: "Bearer local-no-key", "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({
          model: manifest.model,
          store: false,
          stream: true,
          max_output_tokens: 2400,
          input: [
            { role: "developer", content: [{ type: "input_text", text: `You are a demanding visual-concept architect. Discover multiple defensible ideas, but reject cosmetic variants and generic mood illustration. Each seed must fuse one peculiar lyric object/action, the supplied reference's transferable relationship or system mechanism, the song lesson, and the attached Tarot card into one causal playing-card tableau. A numbered Minor Arcana seed must give its exact number of suit objects a concrete job in that tableau. Use established Hapa roles only when materially justified. Return only schema-valid JSON.${localSchemaInstruction(LOCAL_BLUEPRINT_SCHEMA)}` }] },
            { role: "user", content: [{ type: "input_text", text: `Design 2-5 genuinely different visual foundations for this one source connection. Different means a different central action, teaching mechanism, hero object, and Tarot operation—not a camera/location/animal/costume swap. State how each avoids generic album art and how it differs from every other seed. Copy connectionKey exactly: ${clean(source.connectionKey)}.\n\n${JSON.stringify(job.packet)}\n\nFINAL CHECK: every seed must be recognizable from this song with the title hidden; each must make the reference mechanism observable without recreating copyrighted surface imagery; no two seeds may share the same basic tableau. For a numbered Minor Arcana card, heroObject and tarotTransformation must literally retain the exact number of visible physical suit objects. Transform what those objects DO, not what they ARE: Ten of Wands means ten separately readable wand objects may brace, braid, hinge, measure, cage, bridge, or lever something, but knots, ropes, shadows, textures, or gestures cannot substitute for the wands.` }] },
          ],
          text: localTextContract("echo_reference_blueprint", LOCAL_BLUEPRINT_SCHEMA),
        }),
        signal: controller.signal,
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(payload?.error?.message || `Local oMLX blueprint request failed (${response.status}).`);
      const rawText = outputText(payload);
      if (!rawText) throw new Error("The local concept architect returned no blueprint.");
      const blueprint = stabilizeLocalBlueprint(parseLocalJson(rawText), job);
      if (clean(blueprint.connectionKey) !== clean(source.connectionKey)) throw new Error(`Local blueprint must copy connectionKey ${clean(source.connectionKey)}.`);
      const seeds = list(blueprint.seeds);
      if (seeds.length < 2) throw new Error("Local blueprint returned fewer than two distinct concept seeds.");
      // stabilizeLocalBlueprint is the authoritative local repair boundary for
      // countable Minor Arcana objects. Re-rejecting the already-stabilized
      // blueprint here caused valid repaired seeds to enter an endless retry
      // loop in long-running local drains. Downstream prompt stabilization and
      // objective prompt gates still verify the exact visible suit count.
      return { blueprint, usage: payload.usage || {} };
    } finally { clearTimeout(timeout); }
  }

  async function requestLocalCompactPlan(manifest, job, architecture) {
    let lastError;
    for (let attempt = 1; attempt <= 1; attempt += 1) {
      const controller = new AbortController();
      // Dense multi-concept expansions on the qualified local model can be
      // slower than the blueprint itself; keep this bounded but long enough
      // to finish instead of discarding a completed architecture pass.
      const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);
      try {
        const expectedKey = clean(job.packet.sourceConnections[0]?.connectionKey);
        const response = await fetchImpl(localOmlxUrl("responses"), {
          method: "POST",
          headers: { Authorization: "Bearer local-no-key", "Content-Type": "application/json", Connection: "close" },
          body: JSON.stringify({
            model: manifest.model,
            store: false,
            stream: true,
            max_output_tokens: 7000,
            input: [
              { role: "developer", content: [{ type: "input_text", text: `${DEVELOPER_INSTRUCTIONS}\n\n${LOCAL_DEVELOPER_INSTRUCTIONS}\nReturn one compact production concept for EVERY supplied blueprint seed. Copy blueprintSeedTitle exactly so the application can restore the seed's already-authored rationale fields.${localSchemaInstruction(LOCAL_COMPACT_PLAN_SCHEMA)}` }] },
              { role: "user", content: [{ type: "input_text", text: `Expand every blueprint seed into one compact production concept. Do not omit, merge, rank, or add seeds.\n\nSONG AND SOURCE:\n${JSON.stringify(job.packet)}\n\nCOMPLETE BLUEPRINT:\n${JSON.stringify(architecture.blueprint)}\n\nFINAL ACCEPTANCE CHECK: copy connectionKey ${expectedKey}; return exactly ${architecture.blueprint.seeds.length} concepts and copy every blueprintSeedTitle byte-for-byte. Preserve each seed's distinct action and hero object. A human-led prompt must literally say Hapa and use an established role. Literally name the attached Tarot card and separately describe its exact countable transformed suit objects. Copy at least two symbol-array names into each prompt. Write at least 140 positive, renderable words before exclusions. Across the entire prompt include no more than eight excluded items, in at most three concise No/Avoid sentences; exclusions do not count toward length, and you must never paste the legacy-default list. Never write "the Wands are," "is implied," "is transformed," "the burden is," "a study in," or "the image must convey."${lastError ? ` This is a corrective retry. The prior output was rejected for: ${safeError(lastError)} Fix every named failure.` : ""}` }] },
            ],
            text: localTextContract("echo_reference_compact_plan", LOCAL_COMPACT_PLAN_SCHEMA),
          }),
          signal: controller.signal,
        });
        const payload = await responsePayload(response);
        if (!response.ok) throw new Error(payload?.error?.message || `Local oMLX compact-plan request failed (${response.status}).`);
        const compact = parseLocalJson(outputText(payload));
        const connection = compact.connection || {};
        if (clean(connection.connectionKey) !== expectedKey) throw new Error(`Local compact output must copy connectionKey ${expectedKey}.`);
        const seeds = new Map(architecture.blueprint.seeds.map((seed) => [clean(seed.title), seed]));
        if (list(connection.concepts).length !== seeds.size) throw new Error(`Local compact output returned ${list(connection.concepts).length}/${seeds.size} blueprint concepts.`);
        const seen = new Set();
        let concepts = list(connection.concepts).map((concept) => {
          const seed = seeds.get(clean(concept.blueprintSeedTitle));
          if (!seed || seen.has(clean(seed.title))) throw new Error(`Local compact output omitted or duplicated blueprintSeedTitle ${clean(concept.blueprintSeedTitle)}.`);
          seen.add(clean(seed.title));
          const sanitized = sanitizeLocalPrompt(concept.imagePrompt);
          return stabilizeLocalPrompt({
            ...concept,
            imagePrompt: sanitized.prompt,
            localSanitization: { removedPhrases: sanitized.removed },
            localBlueprintSeed: seed,
            foundationRationale: `${seed.lyricAnchor} operates ${seed.referenceMechanism} so that ${seed.lessonPayoff}`,
            lyricMechanic: `${seed.lyricAnchor}: ${seed.centralAction}`,
            referenceMechanic: seed.referenceMechanism,
            lessonMechanic: seed.lessonPayoff,
            tarotMechanic: seed.tarotTransformation,
            characterUse: seed.avatarRole,
          }, { packet: job.packet });
        });
        const promptRepairs = [];
        for (let index = 0; index < concepts.length; index += 1) {
          const concept = concepts[index];
          const words = clean(concept.imagePrompt).split(/\s+/).filter(Boolean).length;
          const reasons = [...(words < 160 || words > 500 ? [`prompt-words:${words}`] : []), ...localPromptAssessment(concept, { packet: job.packet }).gateReasons];
          if (!reasons.length) continue;
          const seed = concept.localBlueprintSeed;
          const repaired = await requestLocalPromptRepair(manifest, job, seed, concept, reasons);
          concepts[index] = stabilizeLocalPrompt({
            ...repaired.concept,
            localPromptRepair: { applied: true, repairedAt: now().toISOString(), repairedReasons: repaired.repairedReasons },
          }, { packet: job.packet });
          promptRepairs.push({ conceptId: clean(concept.id), repairedReasons: repaired.repairedReasons, usage: repaired.usage || {} });
        }
        const raw = {
          songFoundation: compact.songFoundation,
          connections: [{
            connectionKey: expectedKey,
            sourceKind: job.packet.sourceConnections[0]?.sourceKind || "lyric-only",
            referenceId: job.packet.sourceConnections[0]?.referenceId || "",
            referenceTitle: job.packet.sourceConnections[0]?.referenceTitle || "Lyric-only opportunity",
            conceptualBridge: connection.conceptualBridge,
            evidenceUsed: connection.evidenceUsed,
            concepts,
          }],
        };
        const plan = normalizePlan(raw, job, manifest.model, payload, { name: "Local Qwen visual-intelligence model", provider: LOCAL_OMLX_PROVIDER, reasoningEffort: "qualified-fast-profile" });
        plan.localBlueprint = architecture.blueprint;
        if (promptRepairs.length) {
          plan.localPromptRepairs = promptRepairs.map(({ conceptId, repairedReasons }) => ({ conceptId, repairedReasons }));
          for (const repair of promptRepairs) {
            plan.usage.inputTokens += Number(repair.usage.input_tokens || 0);
            plan.usage.cachedInputTokens += Number(repair.usage.input_tokens_details?.cached_tokens || 0);
            plan.usage.outputTokens += Number(repair.usage.output_tokens || 0);
            plan.usage.reasoningTokens += Number(repair.usage.output_tokens_details?.reasoning_tokens || 0);
            plan.usage.totalTokens += Number(repair.usage.total_tokens || 0);
          }
        }
        return { plan, requestId: response.headers?.get?.("x-request-id") || "" };
      } catch (error) {
        lastError = error;
        const retryable = error?.name === "AbortError" || error?.name === "TimeoutError" || error?.name === "TypeError" || /fetch failed|Unexpected end of JSON|Unterminated string|compact output|objective prompt gates|connectionKey|blueprintSeedTitle|prompt-words/i.test(String(error?.message || ""));
        if (!retryable || attempt >= 1) break;
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("The local compact prompt request failed.");
  }

  async function requestLocalPromptRepair(manifest, job, seed, concept, gateReasons) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);
      try {
        const response = await fetchImpl(localOmlxUrl("responses"), {
          method: "POST",
          headers: { Authorization: "Bearer local-no-key", "Content-Type": "application/json", Connection: "close" },
          body: JSON.stringify({
            model: manifest.model,
            store: false,
            stream: true,
            max_output_tokens: 2600,
            input: [
              { role: "developer", content: [{ type: "input_text", text: `You are a production-prompt repair editor. Rewrite only the imagePrompt. Preserve the supplied concept's peculiar action, reference mechanism, lesson payoff, hero object, symbols, and composition. Correct every named gate failure with positive renderable detail; do not replace the concept or add a new concept. Return only schema-valid JSON.${localSchemaInstruction(LOCAL_PROMPT_REPAIR_SCHEMA)}` }] },
              { role: "user", content: [{ type: "input_text", text: `Repair this one rejected Echo playing-card prompt.\n\nGATE FAILURES TO FIX:\n${gateReasons.join("\n")}\n\nATTACHED TAROT DATA:\n${JSON.stringify(job.packet.tarotConnections)}\n\nCONCEPT BLUEPRINT:\n${JSON.stringify(seed)}\n\nSTRUCTURED CONCEPT:\n${JSON.stringify({ title: concept.title, memoryHook: concept.memoryHook, characterUse: concept.characterUse, symbols: concept.symbols, palette: concept.palette, visualSignature: concept.visualSignature })}\n\nREJECTED PROMPT:\n${clean(concept.imagePrompt, 8000)}\n\nWrite 180-300 words with at least 140 positive, visible words before exclusions. Literally name at least one attached Tarot card, and for a numbered Minor Arcana show its exact count of separately readable suit objects. Copy at least two supplied symbol names verbatim. Use no more than eight excluded items in at most three sentences. If naming Hapa Red, retain red cap and black-red armor; Blue, navy-cyan Orion flight suit and red earbud cable; Green, dark beard, hood, and living-wood bow; Bella, long dark hair, warm olive/tan skin, red-cream fabric, and gold jewelry. Keep the face readable. Never use “is implied,” “is transformed,” “the burden is,” “the Wands are,” “a study in,” or “the image must convey.”${lastError ? ` The prior repair was rejected for ${safeError(lastError)}.` : ""}` }] },
            ],
            text: localTextContract("echo_reference_prompt_repair", LOCAL_PROMPT_REPAIR_SCHEMA),
          }),
          signal: controller.signal,
        });
        const payload = await responsePayload(response);
        if (!response.ok) throw new Error(payload?.error?.message || `Local oMLX prompt repair failed (${response.status}).`);
        const raw = parseLocalJson(outputText(payload));
        const sanitized = sanitizeLocalPrompt(raw.imagePrompt);
        const repaired = stabilizeLocalPrompt({ ...concept, imagePrompt: sanitized.prompt, localSanitization: { removedPhrases: [...new Set([...list(concept.localSanitization?.removedPhrases), ...sanitized.removed])] } }, { packet: job.packet });
        const words = clean(repaired.imagePrompt).split(/\s+/).filter(Boolean).length;
        const assessment = localPromptAssessment(repaired, { packet: job.packet });
        const reasons = [...(words < 160 || words > 500 ? [`prompt-words:${words}`] : []), ...assessment.gateReasons];
        if (reasons.length) throw new Error(`Local prompt repair still failed: ${[...new Set(reasons)].join(", ")}.`);
        return { concept: repaired, usage: payload.usage || {}, repairedReasons: gateReasons };
      } catch (error) {
        lastError = error;
        if (attempt >= 2) break;
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("The local prompt repair failed.");
  }

  async function requestLocalSeedPlan(manifest, job, blueprint, seed) {
    let lastError;
    for (let attempt = 1; attempt <= Math.min(2, maxAttempts); attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);
      try {
        const expectedKey = clean(job.packet.sourceConnections[0]?.connectionKey);
        const response = await fetchImpl(localOmlxUrl("responses"), {
          method: "POST",
          headers: { Authorization: "Bearer local-no-key", "Content-Type": "application/json", Connection: "close" },
          body: JSON.stringify({
            model: manifest.model,
            store: false,
            stream: true,
            max_output_tokens: 3200,
            input: [
              { role: "developer", content: [{ type: "input_text", text: `${DEVELOPER_INSTRUCTIONS}\n\n${LOCAL_DEVELOPER_INSTRUCTIONS}\n- Expand exactly ONE supplied blueprint seed into exactly ONE concept. Do not add an alternate or a variation.${localSchemaInstruction(LOCAL_SINGLE_CONCEPT_SCHEMA)}` }] },
              { role: "user", content: [{ type: "input_text", text: `Create one complete visual-intelligence concept from the supplied seed. Return exactly one connection and exactly one concept.\n\nSONG AND SOURCE:\n${JSON.stringify(job.packet)}\n\nCONNECTION BLUEPRINT CONTEXT:\n${JSON.stringify({ connectionKey: blueprint.connectionKey, sourceMechanism: blueprint.sourceMechanism, songSpecificRecognition: blueprint.songSpecificRecognition })}\n\nONLY SEED TO EXPAND:\n${JSON.stringify(seed)}\n\nFINAL ACCEPTANCE CHECK: copy connectionKey ${expectedKey}. Preserve this seed's central action, hero object, reference mechanism, lesson payoff, and Tarot operation. Every human-led production prompt must literally say Hapa and use an established role rather than inventing a title. Literally name the attached Tarot card, then separately describe its exact countable suit objects performing the lyric action. Write at least 140 positive, renderable words before exclusions and include no more than eight excluded items total, whether introduced by No, Avoid, Exclude, or similar language. Never write "the Wands are," "is implied," "is transformed," "the burden is," "a study in," or "the image must convey." Copy at least two symbol-array names verbatim into the prompt.${lastError ? ` This is a corrective retry. The prior output was rejected for: ${safeError(lastError)} Fix every named failure.` : ""}` }] },
            ],
            text: localTextContract("echo_reference_seed_plan", LOCAL_SINGLE_CONCEPT_SCHEMA),
          }),
          signal: controller.signal,
        });
        const payload = await responsePayload(response);
        if (!response.ok) throw new Error(payload?.error?.message || `Local oMLX seed request failed (${response.status}).`);
        const rawText = outputText(payload);
        if (!rawText) throw new Error("The local prompt author returned no structured seed output.");
        const raw = parseLocalJson(rawText);
        const returned = list(raw.connections);
        if (returned.length !== 1 || clean(returned[0]?.connectionKey) !== expectedKey || list(returned[0]?.concepts).length !== 1) throw new Error(`Local seed output must return exactly one concept for connectionKey ${expectedKey}.`);
        returned[0].concepts = returned[0].concepts.map((concept) => {
          const sanitized = sanitizeLocalPrompt(concept.imagePrompt);
          return stabilizeLocalPrompt({ ...concept, imagePrompt: sanitized.prompt, localSanitization: { removedPhrases: sanitized.removed }, localBlueprintSeed: seed }, { packet: job.packet });
        });
        let concept = returned[0].concepts[0];
        const wordCount = clean(concept.imagePrompt).split(/\s+/).filter(Boolean).length;
        const assessment = localPromptAssessment(concept, { packet: job.packet });
        const initialGateReasons = [...(wordCount < 160 || wordCount > 500 ? [`prompt-words:${wordCount}`] : []), ...assessment.gateReasons];
        let promptRepair = null;
        if (initialGateReasons.length) {
          promptRepair = await requestLocalPromptRepair(manifest, job, seed, concept, initialGateReasons);
          concept = {
            ...promptRepair.concept,
            localPromptRepair: { applied: true, repairedAt: now().toISOString(), repairedReasons: promptRepair.repairedReasons },
          };
          returned[0].concepts[0] = concept;
        }
        const plan = normalizePlan(raw, job, manifest.model, payload, { name: "Local Qwen visual-intelligence model", provider: LOCAL_OMLX_PROVIDER, reasoningEffort: "qualified-fast-profile" });
        if (promptRepair) {
          plan.localPromptRepair = { applied: true, repairedReasons: promptRepair.repairedReasons };
          plan.usage.inputTokens += Number(promptRepair.usage.input_tokens || 0);
          plan.usage.cachedInputTokens += Number(promptRepair.usage.input_tokens_details?.cached_tokens || 0);
          plan.usage.outputTokens += Number(promptRepair.usage.output_tokens || 0);
          plan.usage.reasoningTokens += Number(promptRepair.usage.output_tokens_details?.reasoning_tokens || 0);
          plan.usage.totalTokens += Number(promptRepair.usage.total_tokens || 0);
        }
        return { plan, requestId: response.headers?.get?.("x-request-id") || "" };
      } catch (error) {
        lastError = error;
        const retryable = error?.name === "AbortError" || error?.name === "TimeoutError" || error?.name === "TypeError" || /fetch failed|Unexpected end of JSON|Unterminated string|structured output|seed output|production gate|objective prompt gates|prompt repair|connectionKey/i.test(String(error?.message || ""));
        if (!retryable || attempt >= Math.min(2, maxAttempts)) break;
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("The local seed prompt request failed.");
  }

  async function requestLocalPlanChunk(manifest, job, onPartial = async () => {}) {
    const parentJob = job.parentJob || job;
    const architecture = await requestLocalBlueprint(manifest, job);
    const blueprintDigest = sha256(architecture.blueprint);
    const reusable = new Map(list(parentJob.localSeedPartials).filter((partial) => {
      if (partial.connectionKey !== job.packet.sourceConnections[0]?.connectionKey || partial.blueprintDigest !== blueprintDigest || !partial.seedDigest || !partial.result?.plan) return false;
      return list(partial.result.plan.connections).flatMap((connection) => list(connection.concepts)).every((concept) => {
        const assessment = localPromptAssessment(concept, { packet: job.packet });
        return !assessment.gateReasons.length && qualityAssessment({ ...concept, localPromptAssessment: assessment }).ready;
      });
    }).map((partial) => [partial.seedDigest, partial]));
    if (!reusable.size) {
      try {
        const compact = await requestLocalCompactPlan(manifest, job, architecture);
        compact.plan.usage.inputTokens += Number(architecture.usage.input_tokens || 0);
        compact.plan.usage.cachedInputTokens += Number(architecture.usage.input_tokens_details?.cached_tokens || 0);
        compact.plan.usage.outputTokens += Number(architecture.usage.output_tokens || 0);
        compact.plan.usage.reasoningTokens += Number(architecture.usage.output_tokens_details?.reasoning_tokens || 0);
        compact.plan.usage.totalTokens += Number(architecture.usage.total_tokens || 0);
        return compact;
      } catch (error) {
        parentJob.localCompactFailure = { connectionKey: job.packet.sourceConnections[0]?.connectionKey || "", blueprintDigest, failedAt: now().toISOString(), error: safeError(error), candidate: error?.localCandidate || null };
        await onPartial();
        if (LOCAL_FAST_DRAIN && !reusable.size) {
          error.localFastDrainDeferred = true;
          throw error;
        }
      }
    }
    const results = [];
    for (const seed of architecture.blueprint.seeds) {
      const seedDigest = sha256(seed);
      let partial = reusable.get(seedDigest);
      if (!partial) {
        const result = await requestLocalSeedPlan(manifest, job, architecture.blueprint, seed);
        partial = { connectionKey: job.packet.sourceConnections[0]?.connectionKey || "", sourceDigest: job.sourceDigest, blueprintDigest, seedDigest, completedAt: now().toISOString(), result };
        reusable.set(seedDigest, partial);
        parentJob.localSeedPartials = [...list(parentJob.localSeedPartials).filter((item) => item.connectionKey !== partial.connectionKey || item.blueprintDigest !== blueprintDigest || item.seedDigest !== seedDigest), partial];
        await onPartial();
      }
      results.push(partial.result);
    }
    const first = results[0].plan;
    const usage = { inputTokens: Number(architecture.usage.input_tokens || 0), cachedInputTokens: Number(architecture.usage.input_tokens_details?.cached_tokens || 0), outputTokens: Number(architecture.usage.output_tokens || 0), reasoningTokens: Number(architecture.usage.output_tokens_details?.reasoning_tokens || 0), totalTokens: Number(architecture.usage.total_tokens || 0) };
    for (const result of results) for (const key of Object.keys(usage)) usage[key] += Number(result.plan.usage?.[key] || 0);
    return {
      requestId: results.map((result) => result.requestId).filter(Boolean).join(","),
      plan: {
        ...first,
        planId: `echo-reference-intelligence:${job.songId}:${sha256(results.map((result) => result.plan.planId)).slice(-12)}`,
        localBlueprint: architecture.blueprint,
        connections: [{ ...first.connections[0], concepts: results.flatMap((result) => result.plan.connections[0].concepts) }],
        usage,
      },
    };
  }

  async function requestPlanChunk(apiKey, manifest, job, onPartial = async () => {}) {
    const provider = manifest.authoringProvider || OPENAI_PROVIDER;
    const local = provider === LOCAL_OMLX_PROVIDER;
    if (local) return requestLocalPlanChunk(manifest, job, onPartial);
    const localBlueprint = local ? await requestLocalBlueprint(manifest, job) : null;
    const attemptLimit = local ? Math.min(2, maxAttempts) : maxAttempts;
    let lastError;
    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (local ? 7 : 10) * 60 * 1000);
      try {
        const response = await fetchImpl(local ? localOmlxUrl("responses") : "https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: local ? "Bearer local-no-key" : `Bearer ${apiKey}`, "Content-Type": "application/json", ...(local ? { Connection: "close" } : {}) },
          body: JSON.stringify({
            model: manifest.model,
            store: false,
            ...(local ? { stream: true } : {}),
            ...(local ? {} : { reasoning: { effort: "high" }, prompt_cache_key: "hapa-echo-reference-intelligence-v1" }),
            max_output_tokens: local ? 8192 : 30000,
            input: [
              { role: "developer", content: [{ type: "input_text", text: local ? `${DEVELOPER_INSTRUCTIONS}\n\n${LOCAL_DEVELOPER_INSTRUCTIONS}` : DEVELOPER_INSTRUCTIONS }] },
              { role: "user", content: [{ type: "input_text", text: `Create and retain the complete visual-intelligence record for this song. Return one connection with the exact connectionKey for every sourceConnections item. Return only schema-valid JSON; do not wrap it in Markdown.\n\n${JSON.stringify(job.packet)}${local ? `\n\nLOCAL CONCEPT BLUEPRINT — preserve its distinct causal actions while expanding them into complete evidence fields and production prompts:\n${JSON.stringify(localBlueprint.blueprint)}\n\nFINAL ACCEPTANCE CHECK — apply this after reading the song: return exactly one connection with connectionKey ${clean(job.packet.sourceConnections[0]?.connectionKey)}. Every human-led production prompt must literally say Hapa and use an established role rather than inventing a title. Every prompt must literally name the attached Tarot card, then separately describe its exact countable suit objects performing the lyric action. Never write "the Wands are," "is implied," "is transformed," "the burden is," "a study in," or "the image must convey." Use the lyric's peculiar concrete objects and the reference's relationship or system mechanic to create one causal tableau, not a generic mood illustration. Copy at least two symbol-array names verbatim into each prompt. Before returning JSON, silently search every imagePrompt for these failures and rewrite them.${lastError ? ` This is a corrective retry. The prior output was rejected for: ${safeError(lastError)} Fix every named failure.` : ""}` : ""}` }] },
            ],
            text: { verbosity: "medium", format: { type: "json_schema", name: "echo_reference_intelligence", strict: true, schema: OUTPUT_SCHEMA } },
          }),
          signal: controller.signal,
        });
        const requestId = response.headers?.get?.("x-request-id") || "";
        const payload = local ? await responsePayload(response) : await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload?.error?.message || `${local ? "Local oMLX" : "OpenAI"} Responses request failed (${response.status}).`);
          error.status = response.status;
          error.requestId = requestId;
          throw error;
        }
        const rawText = outputText(payload);
        if (!rawText) throw new Error("The reasoning model returned no structured output text.");
        const raw = parseLocalJson(rawText);
        if (local) {
          const expectedKey = clean(job.packet.sourceConnections[0]?.connectionKey);
          const returned = list(raw.connections);
          if (returned.length !== 1 || clean(returned[0]?.connectionKey) !== expectedKey) throw new Error(`Local structured output must return exactly connectionKey ${expectedKey}.`);
          returned[0].concepts = list(returned[0]?.concepts).map((concept) => {
            const sanitized = sanitizeLocalPrompt(concept.imagePrompt);
            return { ...concept, imagePrompt: sanitized.prompt, localSanitization: { removedPhrases: sanitized.removed } };
          });
          const invalidPromptLengths = list(returned[0]?.concepts).map((concept) => clean(concept.imagePrompt).split(/\s+/).filter(Boolean).length).filter((wordCount) => wordCount < 160 || wordCount > 500);
          if (invalidPromptLengths.length) throw new Error(`Local structured output returned ${invalidPromptLengths.length} image prompt(s) outside the 160-500 word production gate.`);
          const failedObjectiveGates = list(returned[0]?.concepts).map((concept) => localPromptAssessment(concept, { packet: job.packet })).filter((assessment) => assessment.gateReasons.length);
          if (failedObjectiveGates.length) {
            const error = new Error(`Local structured output failed objective prompt gates: ${[...new Set(failedObjectiveGates.flatMap((assessment) => assessment.gateReasons))].join(", ")}.`);
            error.localCandidate = raw;
            throw error;
          }
        }
        const plan = normalizePlan(raw, job, manifest.model, payload, local
          ? { name: "Local Qwen visual-intelligence model", provider: LOCAL_OMLX_PROVIDER, reasoningEffort: "qualified-fast-profile" }
          : { name: "OpenAI reasoning model", provider: OPENAI_PROVIDER, reasoningEffort: "high" });
        if (localBlueprint) {
          plan.localBlueprint = localBlueprint.blueprint;
          plan.usage.inputTokens += Number(localBlueprint.usage.input_tokens || 0);
          plan.usage.cachedInputTokens += Number(localBlueprint.usage.input_tokens_details?.cached_tokens || 0);
          plan.usage.outputTokens += Number(localBlueprint.usage.output_tokens || 0);
          plan.usage.reasoningTokens += Number(localBlueprint.usage.output_tokens_details?.reasoning_tokens || 0);
          plan.usage.totalTokens += Number(localBlueprint.usage.total_tokens || 0);
        }
        if (!plan.connections.some((connection) => connection.concepts.length)) throw new Error("The reasoning model returned no visual concepts.");
        return { plan, requestId };
      } catch (error) {
        lastError = error;
        const retryable = error?.name === "AbortError" || error?.name === "TimeoutError" || error?.name === "TypeError" || /fetch failed|Unexpected end of JSON|structured output|production gate|objective prompt gates|connectionKey|no visual concepts/i.test(String(error?.message || "")) || [408, 409, 429].includes(error?.status) || Number(error?.status || 0) >= 500;
        if (!retryable || attempt >= attemptLimit) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 2000 * (2 ** (attempt - 1)))));
      } finally { clearTimeout(timeout); }
    }
    throw lastError || new Error("The visual-intelligence request failed.");
  }

  async function requestPlan(apiKey, manifest, job, onPartial = async () => {}) {
    const sources = job.packet.sourceConnections;
    const partialsByKey = new Map(list(job.partialPlans).filter((partial) => partial?.sourceDigest === job.sourceDigest && partial?.connectionKey && partial?.plan).map((partial) => [partial.connectionKey, partial]));
    const partials = [];
    const requestIds = [];
    const chunks = sources.map((source) => [source]);
    for (const sourceConnections of chunks) {
      const connectionKey = sourceConnections[0].connectionKey;
      let partial = partialsByKey.get(connectionKey);
      if (!partial) {
        const packet = { ...job.packet, sourceConnections };
        const result = await requestPlanChunk(apiKey, manifest, { ...job, packet, parentJob: job }, onPartial);
        partial = { connectionKey, sourceDigest: job.sourceDigest, requestId: result.requestId, completedAt: now().toISOString(), plan: result.plan };
        partialsByKey.set(connectionKey, partial);
        job.partialPlans = [...partialsByKey.values()];
        job.localSeedPartials = list(job.localSeedPartials).filter((item) => item.connectionKey !== connectionKey);
        await onPartial();
      }
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
    const provider = manifest.authoringProvider || OPENAI_PROVIDER;
    const apiKey = provider === OPENAI_PROVIDER ? await credentialStore.read("openai") : "";
    if (provider === OPENAI_PROVIDER && !apiKey) { manifest.state = "blocked"; manifest.blocker = { code: "openai_key_missing", message: "Add an OpenAI API key before authoring visual intelligence." }; await saveManifest(manifest); return; }
    pauseRequested = false;
    manifest.state = "running";
    manifest.startedAt ||= now().toISOString();
    manifest.jobs = manifest.jobs.map((job) => job.status === "running" ? { ...job, status: "queued", error: "Recovered after interruption." } : job);
    await saveManifest(manifest);
    async function worker() {
      while (!pauseRequested) {
        const job = manifest.jobs
          .filter((item) => item.status === "queued")
          .sort((a, b) => Number(a.attempts || 0) - Number(b.attempts || 0) || Number(a.trackNumber || 0) - Number(b.trackNumber || 0))[0];
        if (!job) return;
        job.status = "running";
        job.startedAt = now().toISOString();
        job.attempts += 1;
        await saveManifest(manifest);
        try {
          const result = await requestPlan(apiKey, manifest, job, () => saveManifest(manifest));
          job.plan = result.plan;
          delete job.partialPlans;
          job.requestId = result.requestId;
          job.status = "completed";
          job.error = "";
        } catch (error) {
          job.status = "failed";
          job.error = safeError(error);
          if (provider === LOCAL_OMLX_PROVIDER) job.localRetryPolicyVersion = LOCAL_RETRY_POLICY_VERSION;
          if (error?.localCandidate) job.lastRejectedLocalCandidate = { rejectedAt: now().toISOString(), error: job.error, output: error.localCandidate };
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
    if (provider === LOCAL_OMLX_PROVIDER && !remaining) applyCorpusQuality(manifest);
    else manifest.counts = summarize(manifest);
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
    manifest.model = await resolveModel(apiKey, OPENAI_PROVIDER);
    manifest.authoringProvider = OPENAI_PROVIDER;
    manifest.reasoningEffort = "high";
    manifest.concurrency = Math.max(1, Math.min(24, Number(concurrency) || Number(manifest.concurrency) || 1));
    manifest.jobs = manifest.jobs.map((job) => job.status === "failed" ? { ...job, status: "queued", error: "" } : job);
    manifest.state = "queued";
    manifest.finishedAt = "";
    await saveManifest(manifest);
    launch();
    return status();
  }

  async function resumeLocal({ limit = 0, repair = false } = {}) {
    if (activePromise) throw new Error("The current visual-intelligence queue is still running.");
    const manifest = await loadManifest();
    if (!manifest) throw new Error("There is no visual-intelligence run to resume.");
    manifest.model = await resolveModel("", LOCAL_OMLX_PROVIDER);
    manifest.authoringProvider = LOCAL_OMLX_PROVIDER;
    manifest.reasoningEffort = "qualified-fast-profile";
    manifest.concurrency = 1;
    manifest.blocker = null;
    const candidates = manifest.jobs.filter((job) => {
      if (["queued", "running"].includes(job.status)) return true;
      if (job.status === "failed") return repair || job.localRetryPolicyVersion !== LOCAL_RETRY_POLICY_VERSION;
      if (!repair) return false;
      if (job.status !== "completed" || job.plan?.author?.provider !== LOCAL_OMLX_PROVIDER) return false;
      const concepts = list(job.plan?.connections).flatMap((connection) => list(connection.concepts));
      return list(job.plan?.connections).length !== list(job.packet?.sourceConnections).length || !concepts.length || concepts.some((concept) => !qualityAssessment(concept).ready);
    });
    const selected = new Set((Number(limit) > 0 ? candidates.slice(0, Number(limit)) : candidates).map((job) => job.id));
    manifest.jobs = manifest.jobs.map((job) => {
      if (selected.has(job.id)) {
        const retainedPartials = list(job.partialPlans).filter((partial) => {
          const concepts = list(partial?.plan?.connections).flatMap((connection) => list(connection.concepts));
          return concepts.length > 0 && concepts.every((concept) => !localPromptAssessment(concept, { packet: job.packet }).gateReasons.length && qualityAssessment({ ...concept, localPromptAssessment: localPromptAssessment(concept, { packet: job.packet }) }).ready);
        });
        const rejectedPartials = list(job.partialPlans).filter((partial) => !retainedPartials.includes(partial));
        const retainedSeeds = list(job.localSeedPartials).filter((partial) => {
          const concepts = list(partial?.result?.plan?.connections).flatMap((connection) => list(connection.concepts));
          return concepts.length > 0 && concepts.every((concept) => !localPromptAssessment(concept, { packet: job.packet }).gateReasons.length && qualityAssessment({ ...concept, localPromptAssessment: localPromptAssessment(concept, { packet: job.packet }) }).ready);
        });
        const rejectedSeeds = list(job.localSeedPartials).filter((partial) => !retainedSeeds.includes(partial));
        return {
          ...job,
          status: "queued",
          error: "",
          ...(job.status === "failed" ? { localRetryPolicyVersion: LOCAL_RETRY_POLICY_VERSION } : {}),
          supersededPlans: job.plan ? [...list(job.supersededPlans), { ...job.plan, supersededAt: now().toISOString(), supersededReason: "Local quality pilot failed objective connection-count or production-prompt gates." }] : list(job.supersededPlans),
          supersededPartialPlans: rejectedPartials.length ? [...list(job.supersededPartialPlans), ...rejectedPartials.map((partial) => ({ ...partial, supersededAt: now().toISOString(), supersededReason: "Local partial failed objective Hapa, Tarot, symbol, or prompt-language gates." }))] : list(job.supersededPartialPlans),
          supersededLocalSeedPartials: rejectedSeeds.length ? [...list(job.supersededLocalSeedPartials), ...rejectedSeeds.map((partial) => ({ ...partial, supersededAt: now().toISOString(), supersededReason: "Local seed partial failed current Hapa identity, Tarot, symbol, or prompt-language gates." }))] : list(job.supersededLocalSeedPartials),
          partialPlans: retainedPartials,
          localSeedPartials: retainedSeeds,
          plan: null,
        };
      }
      if (["queued", "running"].includes(job.status)) return { ...job, status: "failed", error: "Held after an interrupted local quality pilot." };
      return job;
    });
    manifest.state = "queued";
    manifest.finishedAt = "";
    manifest.providerHistory = [...list(manifest.providerHistory), {
      provider: LOCAL_OMLX_PROVIDER,
      model: LOCAL_OMLX_MODEL,
      startedAt: now().toISOString(),
      selectedFailedSongs: selected.size,
      purpose: Number(limit) > 0 ? "quality-pilot" : "complete-missing-prompts",
    }];
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
    return { ok: true, schemaVersion: manifest.schemaVersion, runId: manifest.runId, mode: manifest.mode, state: manifest.state, model: manifest.model, authoringProvider: manifest.authoringProvider || OPENAI_PROVIDER, reasoningEffort: manifest.reasoningEffort, providerHistory: list(manifest.providerHistory), policy: manifest.policy, album: manifest.album, pilotSongCount: manifest.pilotSongCount, corpusQualityAssessedAt: manifest.corpusQualityAssessedAt || "", createdAt: manifest.createdAt, startedAt: manifest.startedAt, finishedAt: manifest.finishedAt, concurrency: manifest.concurrency, counts: summarize(manifest), jobs: jobs.map((job) => ({ id: job.id, songId: job.songId, songTitle: job.songTitle, trackNumber: job.trackNumber, status: job.status, attempts: job.attempts, error: job.error, durationSeconds: job.durationSeconds || 0, plan: job.plan })) };
  }

  return Object.freeze({ start, continueFull, refreshAll, resume, resumeLocal, pause, audit, status, _active: () => activePromise });
}

module.exports = { SCHEMA_VERSION, PLAN_SCHEMA_VERSION, SCORE_KEYS, OUTPUT_SCHEMA, DEVELOPER_INSTRUCTIONS, LOCAL_DEVELOPER_INSTRUCTIONS, OPENAI_PROVIDER, LOCAL_OMLX_PROVIDER, LOCAL_OMLX_MODEL, LOCAL_OMLX_BASE_URL, LOCAL_RETRY_POLICY_VERSION, outputText, parseLocalJson, responsePayload, songPacket, qualityAssessment, localPromptAssessment, sanitizeLocalPrompt, stabilizeLocalBlueprint, stabilizeLocalPrompt, normalizePlan, summarize, applyCorpusQuality, createEchoReferenceIntelligence };
