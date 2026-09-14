#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const RUNS_ROOT = path.join(homedir(), "Library", "Application Support", "hapa-avatar-builder", "Echo Reference Image Runs");
const AVATAR_STORE_PATH = path.join(APP_ROOT, "data", "avatar-store.json");
const DEFAULT_SOURCE_RUN_ID = "echo-reference-images-2026-09-14T03-19-23-465Z-e94c0e2a";
const AVATAR_IDS = {
  Red: "red-reaper",
  Blue: "avatar-2",
  Green: "avatar-3",
  Bella: "pinokio-bella",
  Domina: "avatar-13",
  Falka: "avatar-8",
};
const AVATAR_ORDER = Object.keys(AVATAR_IDS);
const SAFE_REPAIR_PROMPTS = {
  "codex:bdde4ee8d7bf1703": "Portrait 2:3 premium illustrated playing-card scene. Red, clearly an adult, walks a wet coastal road in a backwards cap and matte-black clothing with yellow accents. A tiny original round-eared companion made of folded yellow raincoat fabric and faint static light walks beside him by choice. They share a translucent poncho with visible space between them. Ahead is a public water-training area with lane ropes, cones, and an adult instructor holding a stopwatch. Add a practice baton with a sprouting-leaf engraving and a white flower pin. Overcast fog, silver puddles, tactile rain. No text, logos, franchise designs, combat, or injury.",
  "codex:558219153089f526": "Portrait 2:3 premium illustrated playing-card scene inside an adult community conservatory with plants, card-catalog drawers, and a central aisle. Bella stands centered and places a minimal four-suit metal circlet on her own head. Another fully clothed adult kneels at a respectful distance holding a tea tray, witnessing rather than directing. Exactly ten differently glazed teacups hang in an arch above Bella. Diffuse daylight, glass reflections, quiet self-authorship, symmetrical card-ready composition. No text, school setting, minors, fantasy armor, or copied designs.",
  "codex:fee3045c8bf91e1f": "Portrait 2:3 premium illustrated playing-card still life at a damp seaside stone threshold. Bella, fully clothed in a practical dark coat, kneels beside a handmade shell-shaped mailbox spilling ivory envelopes and translucent duplicate sheets. She presses a simple geometric seal into warm wax. Water-darkened twine passes through the envelopes and branches across the stone like roots, making a visible network of care. Sea-glass gray-green atmosphere, crimson-brown wax, condensation and salt texture. No readable writing, logos, weapons, or ominous imagery.",
  "codex:12bff5ad805841b2": "Portrait 2:3 premium illustrated playing-card scene on a broad paddle platform at night. Bella and three fully clothed adult crew members work around a steady gimbaled lantern shaped like a lidded cup. One mends a safety strap, one passes a bowl of water, one checks a buckle, and Bella secures a buoy line. The warm, perfectly level center contrasts with cold ink-navy spray at the perimeter. Distinct personal tokens and knot styles preserve individuality. Cooperative ordinary care, no peril, text, logos, or heroic poses.",
  "codex:1a0b26877a4e17d3": "Portrait 2:3 premium illustrated playing-card scene in a theatrical medieval-themed kitchen. Bella, an adult cook in a practical apron with one decorative costume gauntlet set aside, polishes a ceramic plate at a round wooden prep table. Twelve plates form a ring; exactly eight contain small pentacle inlays at different stages of cleaning. A sleeping housecat on a flour sack casts a playful lion-shaped shadow. Crown, helmet, and ladle hang as interchangeable theater props. Warm practical light, soap foam and wood texture. No violence, text, royal glamour, or copied characters.",
  "codex:5776928e84aa33cc": "Portrait 2:3 premium illustrated playing-card underwater scene. Domina wears a complete modest diving suit and floats calmly in clear deep-blue water. A trail of pearl-white bubbles forms a dotted route beside her back without touching her, continuing toward the bright surface like an optional map. A gentle sea lion remains far in the soft-focus background. A small kelp shoot with one ember-orange node marks another possible direction. Emphasize consent, choice, patience, caustic light, and suspended particles. No exposed body, contact, peril, text, or logos.",
  "codex:79a3131a02541c86": "Portrait 2:3 premium illustrated playing-card scene beneath a rain-slick market awning at night. Green works alone at a narrow wooden craft table, fully clothed in a practical deep-green coat. He presses a small square of white cotton onto a vivid crimson watercolor spill on a separate loose piece of pale fabric laid flat on the table. The pigment visibly wicks into the cotton fibers in a flower-like bloom. A clean paintbrush rests horizontally beside the fabric, deliberately set aside. Rain streams from the gutter beyond; a fragment of thick white curb paint and silver puddle reflections create a quiet line motif. Warm amber task light illuminates Green's calm hands, cotton weave, wet wood grain, watercolor granulation, and coat texture against cool blue-gray rain. His posture conveys patience, restraint, and careful repair. Strong card-ready silhouette and immediate visual hierarchy: white cotton and crimson pigment first, Green's calm craft action second, rain line third. No typography, logos, borders, uniforms, or dramatic spectacle.",
  "codex:2ce5a0fef93010de": "Portrait 2:3 premium illustrated playing-card scene from a low floor-level camera. Bella, fully clothed, taps one stone tile with the toe of a sturdy boot. A mineral-cyan ripple travels through a short geometric tile sequence. In the background, exactly nine weathered wooden bars lift like a musical portcullis, opening a route through rhythm rather than force. Slate-blue darkness, chipped stone and wood grain, strong lower-to-upper geometry. No bare feet, injury, combat, text, game UI, logos, or copied character design.",
  "codex:9ab778b1432ee7cb": "Portrait 2:3 premium illustrated playing-card scene viewed from above. Bella, fully clothed in a carmine coat, crosses a shallow rectangular garden pond using evenly spaced brass pentacle stepping disks toward a simple gate. Her last step creates crisp concentric ripples that combine behind her into an unmistakable mountain-ridgeline reflection. Bright overcast light, water tension, coin patina, stone grit, and one clean route. No peril, text, logos, cosmic arcs, or fantasy skyline.",
  "codex:49f6d0e5234401d5": "Portrait 2:3 premium illustrated playing-card still life. Bella sets down a tall glass of tomato-red botanical tonic with heavy condensation and smooth polished reflective cubes. A wooden coaster beneath it carries six evenly spaced brass rings. Three condensation trails descend the glass. A small tabletop mirror repeats the welcoming drink and warm lamplight; rain cools the window beyond. Hospitality transforms apprehension into invitation. No alcohol branding, sharp glass, blood references, text, logos, or faces other than Bella's calm profile.",
  "codex:d4fea75164a52062": "Portrait 2:3 premium illustrated playing-card scene at a tiled hallway threshold opening toward a gray ocean. Bella, fully clothed in a sharply tailored suit with subtle abstract card-pattern fabric, offers a ceramic cup from the dry side. Two ace-corner motifs peek from a breast pocket. A crisp wet-dry tide line reflects her grounded stance; a small carved horse clasp transforms the Knight of Cups symbol. Elegant, calm, consent-forward invitation. No text, logos, exposed body, combat, or recognizable costume.",
  "codex:c86258dfcc669f43": "Portrait 2:3 premium illustrated playing-card scene beneath a low tarp on a broad paddle platform during rough night weather. Bella, fully clothed in practical sailing gear, braces safely while tightening ropes that secure several empty translucent sea-glass hammocks and life vests. A sealed lidded-cup lantern holds a steady amber center. Different knots and small personal tokens show belonging without sameness. Cold moonlit spray outside, warm protected workspace inside. No ghosts, peril, weapons, text, logos, or recognizable characters.",
  "codex:9a475a4bd8c7bd2f": "Portrait 2:3 premium illustrated playing-card high-angle diorama. A kitchen sink becomes a miniature dark lake with foam islands. At its center floats a small carved wooden passenger figurine on a cork disk. Bella's adult hands guide a yellow sponge as a rescue raft while a dish towel forms a lifeline. Exactly eight pentacle-inlaid plates ring the sink in stages of washing. Warm overhead light, macro sponge pores, towel weave, and water meniscus. No children, danger, death, body imagery, text, or logos.",
  "codex:25e3e2e3ac7e9b0f": "Portrait 2:3 premium illustrated playing-card scene in a quiet living room. Bella sits fully clothed at a respectful distance from a couch where a wool blanket forms a curled housecat-shaped cocoon. The blanket seam opens by itself and original butterflies rise into warm lamplight. A matte-black pillow carries a simple white rose embroidery, and a covered dinner tray waits on a side table. The image conveys self-protection ending only when safety returns. No franchise creatures, transformation of a body, death references, text, or logos.",
  "codex:8b213a37520206eb": "Portrait 2:3 premium illustrated playing-card scene in a stone backstage washroom beneath a historical theater arena. Bella is an adult stage performer in a modest sleeveless rehearsal tunic, washing soot and stage makeup from her hands at a carved basin. Six wooden pegs hold linen strips behind her. A sealed vial contains one blue glass droplet, and four abstract ace cards rest nearby as performance props. Warm lamp light, water reflections, calm preparation before applause. No combat, weapons, blood, injury, text, or logos.",
  "codex:378cd6889ed52cc9": "Portrait 2:3 premium illustrated playing-card scene on a worn kitchen table. Bella's hand lifts a dark chess pawn and places a queen on the same final square, making the promotion visibly her own choice. A slim unopened letter opener lies parallel to the board as a boundary symbol, and a switched-off handheld microphone rests nearby. Add an espresso cup, purple napkin, crumbs, and a seed packet. Cool morning window light with one narrow gold horizon. No politics, violence, text, logos, or directing second hand.",
  "codex:f8928a134093bbc1": "Portrait 2:3 premium illustrated playing-card craft scene under a damp seaside arcade at night. Bella and another fully clothed adult reshape a bent piece of scrap metal on an overturned carved stone block, turning it into a clear lantern-key: a key-shaped tip joined to a small green-glass lamp ring. A simplified ram-shaped clamp steadies the harmless workpiece. Steam rises as warm sparks meet humid air. Ember orange against wet gray and sea-glass green. No weapon, blade, throne, combat, text, logos, or triumphant pose.",
  "codex:3becc1b5c0a7894a": "Portrait 2:3 premium illustrated playing-card still life on a craft conservator's tray. An ivory seed-shaped bead rests on deep navy velvet. Two blunt stainless-steel sculpting tools cross around it in a precise X without touching it. Bella's gloved hand places folded white cotton beside the velvet, signaling a deliberate pause before restoration. A clear cup of dark rinse water catches a crescent reflection. Tender, clean, quiet materials and crisp hierarchy. No anatomy, medical setting, sharp instruments, injury, text, logos, or horror.",
  "codex:9a291be75278719a": "Portrait 2:3 premium illustrated playing-card scene in a compact apartment entryway at morning. Bella, fully clothed in a work suit, steps through a half-open front door carrying one upright coffee cup. Three cups remain grouped on a shelf and a fourth sits alone near the unobstructed threshold. A spare suit jacket draped over a chair suggests retired armor through silhouette only. Keys, scuffed wood, and brass hardware ground the choice to move forward. No pleading figure, combat, text, logos, or fantasy imagery.",
  "codex:9dfbe512d7e9455e": "Portrait 2:3 premium illustrated playing-card scene in a lighthouse entry hall. Domina, fully clothed as the adult lightkeeper, adds a sixth white chalk tally to the edge of a salt-speckled wall mirror while steadying an oil lamp. The open door reveals cold fog and one green buoy light. Wet bootprints stop neatly on a coir mat; a clean towel, work boots, brass latch, and hinges establish structured hospitality. The mirror reflects only warm interior light. No apparition, folklore name, blood, text, logos, or ominous figure.",
  "codex:b3b459e3c8e9dd49": "Portrait 2:3 premium illustrated playing-card macro scene on a salt-worn ship deck. Bella, fully clothed, watches a metal coin frozen mid-flip above a braided circular landing wreath. One coin face contains a small patch of pale faux fur; the other has a smooth curved handle motif. Two symmetric brass latches beside the wreath are already half-open, proving either result permits the same reversible exit. Four abstract animal medallions mark the cardinal points. Crisp ship-lamp highlights and shallow focus. No body parts, wagering, weapons, text, logos, or UI.",
};
const FINAL_GREEN_CRAFT_GENERATION_PROMPT = `Create one finished portrait 2:3 premium illustrated playing-card image for the Echo Album visual-reference deck.

The attached image is the authoritative identity reference for the adult Hapa Avatar Green. Preserve Green's recognizable face, dark shaggy hair, beard, warm complexion, and forest-toned design language. Render a new coherent scene, not a dossier or character sheet.

Scene: Beneath a rain-slick market awning at night, Green works alone at a narrow wooden craft table, fully clothed in a practical deep-green coat. He presses a small square of white cotton onto a vivid crimson watercolor spill on a separate loose piece of pale fabric laid flat on the table. The pigment visibly wicks into the cotton fibers in a flower-like bloom. A clean paintbrush rests horizontally beside the fabric, deliberately set aside. Rain streams from the gutter beyond; a fragment of thick white curb paint and silver puddle reflections create a quiet line motif. Warm amber task light illuminates Green's calm hands, cotton weave, wet wood grain, watercolor granulation, and coat texture against cool blue-gray rain. His posture conveys patience, restraint, and careful repair. Strong card-ready silhouette and immediate visual hierarchy: white cotton and crimson pigment first, Green's calm craft action second, rain line third. No typography, logos, borders, uniforms, or dramatic spectacle.`;

function option(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function safeName(value) {
  return String(value || "image").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "image";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function scoreAvatar(prompt, name) {
  const text = String(prompt || "").toLowerCase();
  const patterns = {
    Red: [" fire", "flame", "hazard", "urgent", "battle", "signal flare", "red archetype"],
    Blue: [" ocean", "water", "river", "rain", "navigation", "pilot", "system", "blue archetype"],
    Green: ["forest", "garden", "vine", "moss", "leaf", "root", "animal", "wild", "green archetype"],
    Bella: ["intimacy", "elegan", "social", "coastal", "dress", "bella"],
    Domina: ["discipline", "power", "arena", "teacher", "mentor", "authority", "domina"],
    Falka: ["engineer", "code", "machine", "circuit", "star", "space", "vector", "falka"],
  };
  return patterns[name].reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);
}

function chooseAvatars(job) {
  const prompt = `${job.prompt || ""}\n${job.reviewPrompt || ""}\n${job.referenceTitle || ""}`;
  const explicitPatterns = {
    Red: /\b(?:Hapa Red|Red archetype|Red (?:stands|walks|holds|wears|faces|kneels|runs|looks|reaches))\b/i,
    Blue: /\b(?:Hapa Blue|Blue archetype|Blue (?:stands|walks|holds|wears|faces|kneels|runs|looks|reaches))\b/i,
    Green: /\b(?:Hapa Green|Green archetype|Green (?:stands|walks|holds|wears|faces|kneels|runs|looks|reaches))\b/i,
    Bella: /\bBella\b/i,
    Domina: /\bDomina\b/i,
    Falka: /\bFalka\b/i,
  };
  const named = AVATAR_ORDER.filter((name) => explicitPatterns[name].test(prompt));
  if (named.length) return named.slice(0, 2);
  const scored = AVATAR_ORDER.map((name) => ({ name, score: scoreAvatar(prompt, name) })).sort((a, b) => b.score - a.score || AVATAR_ORDER.indexOf(a.name) - AVATAR_ORDER.indexOf(b.name));
  if (scored[0].score >= 3) return [scored[0].name];
  return [AVATAR_ORDER[Number.parseInt(hash(job.promptId || job.id).slice(0, 8), 16) % AVATAR_ORDER.length]];
}

async function resolveAvatarAnchors(requirementOverrides = {}) {
  const store = await readJson(AVATAR_STORE_PATH);
  const result = {};
  for (const [name, avatarId] of Object.entries(AVATAR_IDS)) {
    const avatar = store.avatars.find((candidate) => candidate.id === avatarId);
    if (!avatar) throw new Error(`Avatar ${name} (${avatarId}) is missing.`);
    const assets = new Map((avatar.assets || []).map((asset) => [asset.id, asset]));
    const requirementId = requirementOverrides[name] || "character_dossier";
    const slot = Object.values(avatar.slots || {}).find((candidate) => candidate.requirementId === requirementId && candidate.assetId);
    const asset = assets.get(slot?.assetId);
    const sourcePath = asset?.metadata?.storage?.path || asset?.localPath || asset?.path;
    if (!sourcePath) throw new Error(`Avatar ${name} has no durable ${requirementId} source path.`);
    await stat(sourcePath);
    result[name] = { avatarId, assetId: asset.id, requirementId: slot.requirementId, sourcePath };
  }
  return result;
}

function assemblePrompt(job) {
  const names = job.avatarReferences.map((reference) => reference.name);
  const identity = names.length === 1
    ? `The attached image is the authoritative visual reference for the Hapa Avatar named ${names[0]}. Preserve that character's recognizable face, body type, complexion, hair, and defining wardrobe language while adapting clothing only when the scene requires it.`
    : `The attached images are authoritative visual references for ${names.join(" and ")}. Preserve each character's distinct recognizable face, body type, complexion, hair, and defining wardrobe language. Do not merge their identities.`;
  return [
    "Create one finished portrait 2:3 premium illustrated playing-card image for the Echo Album visual-reference deck.",
    "",
    `IDENTITY ANCHOR: ${identity} Do not copy dossier layouts, labels, typography, UI, or source backgrounds. Render one coherent new scene, not a character sheet. Keep the referenced avatar visibly present and compositionally meaningful.`,
    "",
    "SOURCE PROMPT — preserve its lyric/reference logic, specific action, material causality, composition, symbols, palette, and exclusions:",
    job.sourcePrompt,
    "",
    `MEMORY HOOK: ${job.memoryHook || "Preserve the prompt's most distinctive lyric-to-image mnemonic."}`,
    `REFERENCE LOGIC: ${job.reviewPrompt || job.qualityAssessment?.evidenceSummary || "Make the source reference's transferable mechanic legible without copying protected character designs."}`,
    "QUALITY PRIORITIES: recognizable Hapa Avatar identity; immediate lyric-to-lesson legibility; one coherent physical scene; clean card-ready silhouette; distinctive context-specific materials; no generic cosmic filler; no readable text, logos, or copied franchise character designs. If the source prompt asks for a non-specific face, this identity-anchor instruction supersedes only that phrase.",
  ].join("\n");
}

async function prepare() {
  const sourceRunId = option("source-run", DEFAULT_SOURCE_RUN_ID);
  const source = await readJson(path.join(RUNS_ROOT, sourceRunId, "manifest.json"));
  const anchors = await resolveAvatarAnchors();
  const now = new Date().toISOString();
  const runId = option("run-id", `echo-reference-codex-images-${now.replaceAll(":", "-").replaceAll(".", "-")}`);
  const runDir = path.join(RUNS_ROOT, runId);
  const sourceJobs = (source.jobs || []).filter((job) => job.status !== "completed" || !job.outputPath);
  const jobs = sourceJobs.map((sourceJob) => {
    const names = chooseAvatars(sourceJob);
    return {
      ...sourceJob,
      id: `codex:${hash(sourceJob.promptId || sourceJob.id).slice(0, 16)}`,
      sourceJobId: sourceJob.id,
      sourceImageRunId: sourceRunId,
      sourceStatus: sourceJob.status,
      sourcePrompt: sourceJob.prompt,
      avatarReferences: names.map((name) => ({ name, ...anchors[name] })),
      generationPrompt: "",
      generationPromptHash: "",
      status: "queued",
      attemptCount: 0,
      outputPath: "",
      outputHash: "",
      usage: { provider: "codex-built-in-imagegen", apiKeyUsed: false },
      feedback: null,
      startedAt: null,
      finishedAt: null,
      error: "",
    };
  });
  const manifest = {
    schemaVersion: "hapa.echo-reference-image-generation.v1",
    runId,
    passId: source.passId,
    mode: "codex-built-in-gpt-image-remainder",
    state: "running",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
    model: "Codex built-in GPT Image",
    provider: "codex-image-generation-tool",
    apiKeyUsed: false,
    size: "1024x1536",
    quality: "high",
    concurrency: 8,
    sourceImageRunId: sourceRunId,
    custody: { root: runDir, outputs: path.join(runDir, "outputs"), visibility: "local-only", reviewState: "review-required" },
    jobs,
  };
  await mkdir(path.join(runDir, "outputs"), { recursive: true });
  await writeJsonAtomic(path.join(runDir, "manifest.json"), manifest);
  await writeJsonAtomic(path.join(RUNS_ROOT, "current-run.json"), { runId, updatedAt: now });
  console.log(JSON.stringify({ runId, manifestPath: path.join(runDir, "manifest.json"), queued: jobs.length }, null, 2));
}

async function loadCurrent() {
  const runId = option("run-id") || (await readJson(path.join(RUNS_ROOT, "current-run.json"))).runId;
  const manifestPath = path.join(RUNS_ROOT, runId, "manifest.json");
  return { runId, manifestPath, manifest: await readJson(manifestPath) };
}

async function claim() {
  const limit = Math.max(1, Math.min(8, Number(option("limit", "8")) || 8));
  const { manifestPath, manifest } = await loadCurrent();
  const claimed = manifest.jobs.filter((job) => job.status === "queued").slice(0, limit);
  const now = new Date().toISOString();
  for (const job of claimed) {
    job.status = "running";
    job.startedAt = now;
    job.attemptCount = Number(job.attemptCount || 0) + 1;
    job.generationPrompt = assemblePrompt(job);
    job.generationPromptHash = `sha256:${hash(job.generationPrompt)}`;
  }
  manifest.updatedAt = now;
  await writeJsonAtomic(manifestPath, manifest);
  console.log(JSON.stringify(claimed.map((job) => ({
    id: job.id,
    songTitle: job.songTitle,
    referenceTitle: job.referenceTitle,
    avatarNames: job.avatarReferences.map((reference) => reference.name),
    referencedImagePaths: job.avatarReferences.map((reference) => reference.sourcePath),
    prompt: job.generationPrompt,
  }))));
}

async function complete() {
  const jobId = option("job");
  const imageOption = option("image");
  if (!jobId || !imageOption) throw new Error("complete requires --job=<id> and --image=<absolute-path>.");
  const imagePath = path.resolve(imageOption);
  const { runId, manifestPath, manifest } = await loadCurrent();
  const job = manifest.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Unknown job ${jobId}.`);
  const bytes = await readFile(imagePath);
  const outputName = `${String(job.trackNumber || "00").padStart(3, "0")}-${safeName(job.songTitle)}-${safeName(job.referenceId || job.promptId)}-${job.id.split(":").at(-1)}.png`;
  const outputPath = path.join(RUNS_ROOT, runId, "outputs", outputName);
  await copyFile(imagePath, outputPath);
  const now = new Date().toISOString();
  if (!job.generationPrompt) {
    job.generationPrompt = assemblePrompt(job);
    job.generationPromptHash = `sha256:${hash(job.generationPrompt)}`;
  }
  job.startedAt ||= now;
  job.status = "completed";
  job.outputPath = outputPath;
  job.outputHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  job.finishedAt = now;
  job.error = "";
  manifest.updatedAt = now;
  const pending = manifest.jobs.filter((candidate) => !["completed", "failed"].includes(candidate.status)).length;
  if (pending === 0) {
    manifest.state = manifest.jobs.some((candidate) => candidate.status === "failed") ? "complete-with-errors" : "completed";
    manifest.finishedAt = now;
  }
  await writeJsonAtomic(manifestPath, manifest);
  console.log(JSON.stringify({ jobId, outputPath, outputHash: job.outputHash, remaining: pending }));
}

async function fail() {
  const jobId = option("job");
  const error = option("error", "Codex image generation failed.");
  const { manifestPath, manifest } = await loadCurrent();
  const job = manifest.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Unknown job ${jobId}.`);
  job.status = "failed";
  job.error = error;
  job.finishedAt = new Date().toISOString();
  manifest.updatedAt = job.finishedAt;
  await writeJsonAtomic(manifestPath, manifest);
  console.log(JSON.stringify({ jobId, status: job.status, error }));
}

async function status() {
  const { runId, manifestPath, manifest } = await loadCurrent();
  const counts = manifest.jobs.reduce((result, job) => ({ ...result, [job.status]: Number(result[job.status] || 0) + 1 }), {});
  console.log(JSON.stringify({ runId, manifestPath, state: manifest.state, counts }, null, 2));
}

async function refreshQueuedAnchors() {
  const { manifestPath, manifest } = await loadCurrent();
  const anchors = await resolveAvatarAnchors();
  let refreshed = 0;
  for (const job of manifest.jobs) {
    if (job.status !== "queued") continue;
    job.avatarReferences = chooseAvatars(job).map((name) => ({ name, ...anchors[name] }));
    job.generationPrompt = "";
    job.generationPromptHash = "";
    refreshed += 1;
  }
  manifest.concurrency = 8;
  manifest.updatedAt = new Date().toISOString();
  await writeJsonAtomic(manifestPath, manifest);
  console.log(JSON.stringify({ refreshed }));
}

async function requeueRunning() {
  const { manifestPath, manifest } = await loadCurrent();
  let requeued = 0;
  for (const job of manifest.jobs) {
    if (job.status !== "running") continue;
    job.status = "queued";
    job.startedAt = null;
    job.error = "Recovered after interrupted Codex image-generation host cell; no durable output was registered.";
    requeued += 1;
  }
  manifest.updatedAt = new Date().toISOString();
  await writeJsonAtomic(manifestPath, manifest);
  console.log(JSON.stringify({ requeued }));
}

async function prepareFailedRepairs() {
  const { manifestPath, manifest } = await loadCurrent();
  const anchors = await resolveAvatarAnchors({ Bella: "closeup_emotions", Green: "closeup_emotions" });
  const now = new Date().toISOString();
  let queued = 0;
  for (const job of manifest.jobs) {
    if (job.status !== "failed") continue;
    const repairedPrompt = SAFE_REPAIR_PROMPTS[job.id];
    if (!repairedPrompt) continue;
    job.originalPrompt ||= job.prompt;
    job.originalPromptHash ||= job.promptHash;
    job.originalSourcePrompt ||= job.sourcePrompt;
    job.originalReviewPrompt ||= job.reviewPrompt;
    job.originalMemoryHook ||= job.memoryHook;
    job.prompt = repairedPrompt;
    job.promptHash = `sha256:${hash(repairedPrompt)}`;
    job.sourcePrompt = repairedPrompt;
    job.reviewPrompt = `Safety repair preserves the authored ${job.visualConceptTitle || "visual concept"} through an adult, fully clothed, nonviolent scene and retains its card-ready material mnemonic.`;
    job.memoryHook = `Safe visual reconstruction: ${job.visualConceptTitle || job.songTitle}.`;
    job.avatarReferences = job.avatarReferences.map((reference) => ({ name: reference.name, ...anchors[reference.name] }));
    job.generationPrompt = job.id === "codex:79a3131a02541c86" ? FINAL_GREEN_CRAFT_GENERATION_PROMPT : "";
    job.generationPromptHash = job.generationPrompt ? `sha256:${hash(job.generationPrompt)}` : "";
    job.status = "queued";
    job.startedAt = null;
    job.finishedAt = null;
    job.error = "";
    job.repairHistory ||= [];
    job.repairHistory.push({ at: now, reason: "codex-image-safety-rejection", strategy: "adult-clothed-nonviolent-symbolic-reconstruction", originalPromptHash: job.originalPromptHash });
    queued += 1;
  }
  manifest.state = "running";
  manifest.finishedAt = null;
  manifest.updatedAt = now;
  await writeJsonAtomic(manifestPath, manifest);
  console.log(JSON.stringify({ queued }));
}

const command = process.argv[2] || "status";
if (command === "prepare") await prepare();
else if (command === "claim") await claim();
else if (command === "complete") await complete();
else if (command === "fail") await fail();
else if (command === "refresh-queued-anchors") await refreshQueuedAnchors();
else if (command === "requeue-running") await requeueRunning();
else if (command === "prepare-failed-repairs") await prepareFailedRepairs();
else if (command === "status") await status();
else throw new Error(`Unknown command ${command}.`);
