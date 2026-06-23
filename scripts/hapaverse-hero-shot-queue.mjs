#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const QUEUE_DIR = path.join(DATA_DIR, "media-generation");
const QUEUE_PATH = path.join(QUEUE_DIR, "hapaverse-card-hero-shot-queue.json");
const CLAIM_DIR = path.join(QUEUE_DIR, "hero-shot-claims");
const OUTPUT_DIR = path.join(MEDIA_DIR, "hapa-card-hero-shots");
const ROLLOUT_EXTRACT_DIR = path.join(QUEUE_DIR, "extracted-rollout");

const QUEUE_SCHEMA_VERSION = "hapa.card-hero-shot-queue.v1";
const CLAIM_SCHEMA_VERSION = "hapa.card-hero-shot-claim.v1";
const TARGET_KINDS = ["garden", "protocol", "node"];
const ACTIVE_STATUSES = new Set(["queued", "claimed", "generated", "failed", "skipped"]);

const DESIGN_SYSTEM_ROOT = "/Users/calderwong/Desktop/hapa-design-system";
const DESIGN_GUIDE_REFERENCES = [
  {
    id: "hapa-design-system",
    title: "Hapa Design System - Hapa Neoblade / NeonBlade Operator",
    localPath: path.join(DESIGN_SYSTEM_ROOT, "docs/HAPA_DESIGN_SYSTEM.md"),
    role: "canonical style guide",
    extractedRules: [
      "Design philosophy: a futuristic cyber card game played on a mission-control console.",
      "Cards are the atomic unit for protocols, skills, avatars, nodes, media, tasks, and lore.",
      "Light is language: hue communicates type, motion communicates behavior, intensity communicates importance.",
      "Base surfaces use deep black-blue glass panels, hairline luminous borders, scanlines, and restrained grain.",
      "Protocol cards use cyan; skill cards use green; node cards use blue; resource/Garden production uses gold; lore uses rose.",
      "No unreadable baked-in text inside art windows; use symbolic glyphs, plates, ports, and live overlay-safe spaces."
    ]
  },
  {
    id: "hapa-card-component-contract",
    title: "Hapa Card Component - Agent Documentation",
    localPath: path.join(DESIGN_SYSTEM_ROOT, "components/cards/CARDS.md"),
    role: "card anatomy contract",
    extractedRules: [
      "Generate art that can fit chip, mini, standard, detail, and hero card granularities.",
      "Leave clean title/type/stat/provenance zones where the UI can overlay live text.",
      "Use the card type to drive the accent color; do not invent arbitrary accent palettes per card.",
      "The art window should express the record's utility, lore, and state without relying on small text."
    ]
  },
  {
    id: "hapa-neon-tokens",
    title: "Hapa Neon Tokens",
    localPath: path.join(DESIGN_SYSTEM_ROOT, "tokens/hapa-neon.tokens.json"),
    role: "machine token palette",
    extractedRules: [
      "Base: #02040a, #050914, #09111f.",
      "Neon accents: cyan #00f3ff, magenta #ff00ff, green #39ff14, gold #f6c96d, violet #9d74ff, blue #4facfe, red #ff4d6d, rose #ff6d9a.",
      "Use glow, beam edges, luminous hairlines, and glass depth instead of thick cartoon outlines."
    ]
  },
  {
    id: "local-neonblade-plus-app-style",
    title: "Avatar Builder Neonblade+ Style Notes",
    localPath: path.join(ROOT, "docs/STYLE_GUIDE_NEONBLADE_PLUS.md"),
    role: "local app style guide",
    extractedRules: [
      "Dense operator panels, index/detail layouts, inspector surfaces, and kanban lanes are the local app language.",
      "Motion should imply hover glow, scan sweeps, and drop feedback; image prompts should imply these as static visual traces.",
      "Image previews preserve aspect ratio and need enough detail for close inspection."
    ]
  }
];

const AESTHETIC_REFERENCES = [
  {
    id: "hapa-card-primitive-forge",
    title: "The Card Primitive",
    role: "aesthetic anchor",
    mediaUri: "/media/the-card-primitive-2025-12-25t13-46-13-card-1765163699006-q0wvm3-no-did-1781242140392-1307644.png",
    promptUse: "Neon holographic card-forge table, circuit-board ritual surface, colored seals, operator-card production language."
  },
  {
    id: "hapa-sovereign-memory-engine",
    title: "Sovereign Memory Engine",
    role: "aesthetic anchor",
    mediaUri: "/media/sovereign-memory-engine-2025-12-25t13-43-44-card-1764986509751-j6tdhi-no-did-1781242067255-1605371.png",
    promptUse: "Isometric memory engine, luminous data streams, small operators, sovereign provenance and retrieval machinery."
  },
  {
    id: "hapa-distributed-knowledge-evolution",
    title: "Distributed Knowledge Evolution Protocol",
    role: "aesthetic anchor",
    mediaUri: "/media/distributed-knowledge-evolution-protocol-2025-12-25t13-44-32-card-1765031157603-00tj1p-no-did-1781241830653-1833271.png",
    promptUse: "Luminous data tree, grid/library environment, embodied discipline, knowledge growing through networked circuitry."
  }
];

const TAROT_REFERENCE_TITLES = ["The Artifact", "The Ferry", "The Edge"];

const SHOT_TYPES = [
  {
    id: "hapa_tarot_card",
    title: "Hapa Tarot Card Hero",
    targetAspect: "vertical 5:7, useful for standard card art and hero portrait crops",
    shotGoal: "Make the card feel like a major Hapa Tarot artifact while teaching what the Garden, Protocol, or Node means.",
    compositionRules: [
      "Use a vertical trading-card frame language inspired by Hapa Tarot Ship Cards.",
      "Use a strong central icon, place, vessel, console, or ritual object that instantly identifies the card.",
      "Leave clean titleplate/stat/provenance zones for live UI overlays instead of baking tiny text into the image.",
      "Use the target kind's hue as the primary light language."
    ]
  },
  {
    id: "mechanic_teaching",
    title: "Mechanic Teaching Shot",
    targetAspect: "wide 16:9 or 4:3, useful for explainers, wiki entries, and builder detail panes",
    shotGoal: "Show the reusable game mechanic or operating principle as a readable visual system.",
    compositionRules: [
      "Show inputs, gates, transformations, outputs, rollback loops, resource flows, or training paths as visible geometry.",
      "Use symbolic arrows, ports, orbital paths, gauges, and state lights instead of paragraphs of text.",
      "For Gardens, show production, time dilation, fleet copying, or educational-node mapping.",
      "For Protocols, show rule enforcement, decision thresholds, authority, repair, provenance, and rollback.",
      "For Nodes, show service boundaries, request flow, memory/media/data surfaces, and user/avatar interaction."
    ]
  },
  {
    id: "in_world_action",
    title: "In-World Action Scene",
    targetAspect: "cinematic 16:9, useful for comic panels, videos, and feature-film worldbuilding",
    shotGoal: "Place the card in the Black Horizon / Hapaverse world as something avatars can use, visit, invoke, or operate.",
    compositionRules: [
      "Show the card's function embodied in a place, ship, Garden, console, command room, colony, arena, or artifact-world scene.",
      "Keep Hapa's Black Horizon scale visible when relevant: orbital Gardens, gravity, time dilation, Proto-Fleet echoes, and luminous infrastructure.",
      "Use avatar silhouettes only when they clarify scale or usage; avoid inventing identity details for a specific avatar unless the card says so.",
      "Make it cinematic, inspectable, and useful for later comics or video loops."
    ]
  }
];

const KIND_STYLE = {
  garden: {
    cardType: "resource",
    hue: "gold #f6c96d with cyan system edges",
    worldLens: "Black Horizon Garden: a massive stationary habitat or orbital production/training node under extreme time dilation.",
    teachingLens: "Show what the Garden produces, trains, filters, or coordinates, and how it maps fantasy production to local Hapa network function."
  },
  protocol: {
    cardType: "protocol",
    hue: "cyan #00f3ff with blue truth traces and gold authority plates when needed",
    worldLens: "Hapa Protocol: an executable doctrine, rule envelope, or ritual command that governs safe action.",
    teachingLens: "Show source, target, purpose, authority, audit trail, rollback, repair, and decision gates as visible mechanics."
  },
  node: {
    cardType: "node",
    hue: "blue #4facfe with cyan live-system edges and violet memory traces when needed",
    worldLens: "Hapa Node: a service, ship, station, room, garden function, or network endpoint that avatars can operate.",
    teachingLens: "Show inputs, processing space, outputs, owners, services, media/data flows, and the boundary between local and shared systems."
  }
};

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "seed") return seedQueue(flags);
  if (command === "status") return printStatus(flags);
  if (command === "claim") return claimJobs(flags);
  if (command === "complete") return completeJob(flags);
  if (command === "recover") return recoverFromRollout(flags);
  if (command === "fail") return failJob(flags);
  if (command === "help" || command === "--help" || command === "-h") return printHelp();
  throw new Error(`Unknown command "${command}". Run: npm run hero-shots:status`);
}

function seedQueue(flags = {}) {
  ensureDirs();
  const store = readJson(STORE_PATH, { cards: [] });
  const existingQueue = readQueue();
  const existingById = new Map(existingQueue.jobs.map((job) => [job.id, job]));
  const targetCards = (Array.isArray(store.cards) ? store.cards : [])
    .filter((card) => TARGET_KINDS.includes(card.kind))
    .sort((a, b) => `${a.kind}:${a.title || a.name}`.localeCompare(`${b.kind}:${b.title || b.name}`));

  const tarotReferences = resolveTarotReferences(store);
  const referenceBundle = buildReferenceBundle(tarotReferences);
  const now = new Date().toISOString();
  const nextJobs = [];
  let created = 0;
  let refreshed = 0;

  for (const card of targetCards) {
    for (const shot of SHOT_TYPES) {
      const job = createJob(card, shot, referenceBundle, now);
      const existing = existingById.get(job.id);
      if (existing) {
        refreshed += 1;
        nextJobs.push({
          ...job,
          status: ACTIVE_STATUSES.has(existing.status) ? existing.status : "queued",
          createdAt: existing.createdAt || job.createdAt,
          updatedAt: existing.status === "generated" ? existing.updatedAt || job.updatedAt : now,
          claimedAt: existing.claimedAt || "",
          completedAt: existing.completedAt || "",
          failedAt: existing.failedAt || "",
          failureReason: existing.failureReason || "",
          output: existing.output || null,
          claims: Array.isArray(existing.claims) ? existing.claims : []
        });
      } else {
        created += 1;
        nextJobs.push(job);
      }
    }
  }

  const queue = {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    title: "Hapaverse Garden / Protocol / Node Hero Shot Queue",
    purpose: "Repeatable GPT Image production queue for three hero shots per Garden, Protocol, and Node card.",
    processNote: "Claim jobs, use the reference images and design guide paths in the claim packet, generate through Codex GPT Image, then complete the job with the generated local file path.",
    targetKinds: TARGET_KINDS,
    shotTypes: SHOT_TYPES,
    styleGuides: DESIGN_GUIDE_REFERENCES.map(withPathStatus),
    aestheticReferences: AESTHETIC_REFERENCES.map(withMediaLocalPath),
    tarotReferences,
    tarotFrameRules: [
      "Use Hapa Tarot Cards specifically as the frame and ritual-card grammar reference.",
      "Reference the vertical ornamental border, titleplate/stat compartments, ship/card silhouette staging, and major-arcana feeling.",
      "Do not copy card names, exact ship silhouettes, or OCR text from a reference card unless the target card itself requires it.",
      "Avoid tiny fake text. Favor large readable glyphs, empty UI-safe plates, and symbolic stat blocks."
    ],
    counts: countJobs(nextJobs),
    jobs: nextJobs,
    createdAt: existingQueue.createdAt || now,
    updatedAt: now
  };

  if (flags.reset === true) {
    queue.jobs = queue.jobs.map((job) => ({
      ...job,
      status: "queued",
      claimedAt: "",
      completedAt: "",
      failedAt: "",
      failureReason: "",
      output: null,
      claims: [],
      updatedAt: now
    }));
    queue.counts = countJobs(queue.jobs);
  }

  writeJson(QUEUE_PATH, queue);
  console.log(`Seeded ${queue.jobs.length} hero-shot jobs for ${targetCards.length} cards.`);
  console.log(`Created ${created}; refreshed ${refreshed}; generated preserved ${queue.counts.byStatus.generated || 0}.`);
  console.log(`Queue: ${QUEUE_PATH}`);
  console.log(formatCounts(queue.counts));
}

function printStatus(flags = {}) {
  const queue = readQueue();
  console.log(`${queue.title || "Hero Shot Queue"} (${queue.schemaVersion || "unversioned"})`);
  console.log(`Queue: ${QUEUE_PATH}`);
  console.log(formatCounts(countJobs(queue.jobs)));
  if (flags.next) {
    const next = filterJobs(queue.jobs, flags).find((job) => job.status === "queued");
    if (!next) {
      console.log("No queued job matches the requested filters.");
      return;
    }
    console.log("");
    printJob(next);
  }
}

function claimJobs(flags = {}) {
  ensureDirs();
  const queue = readQueue();
  const limit = Math.max(1, Number(flags.limit || 1));
  const now = new Date().toISOString();
  const claimant = flags.claimant || process.env.USER || "codex";
  const matching = filterJobs(queue.jobs, flags).filter((job) => job.status === "queued").slice(0, limit);
  if (!matching.length) {
    console.log("No queued jobs match those filters.");
    return;
  }

  const claimId = `claim-${compactTimestamp(now)}-${slugify(claimant)}`;
  const claimPacket = {
    schemaVersion: CLAIM_SCHEMA_VERSION,
    claimId,
    claimedAt: now,
    claimant,
    dryRun: Boolean(flags.peek || flags.dryRun),
    instructions: [
      "Open or attach every localPath listed in styleReferences and tarotReferences as visual references when using GPT Image.",
      "Use the prompt exactly as the main instruction, then use the negativePrompt as guardrails.",
      "Generate one image per job. Save the image to a local file.",
      "Run: npm run hero-shots:complete -- --job-id <job id> --local-path <generated image path>",
      "If Codex renders the image inline but does not create a file, run: npm run hero-shots:recover -- --claim-path <claim packet> --rollout-path <Codex rollout jsonl> --complete",
      "If the result misses the card's utility or Hapa style, regenerate before completing."
    ],
    styleGuides: queue.styleGuides,
    aestheticReferences: queue.aestheticReferences,
    tarotReferences: queue.tarotReferences,
    jobs: matching.map((job) => buildClaimJob(job))
  };

  const claimPath = path.join(CLAIM_DIR, `${claimId}.json`);
  writeJson(claimPath, claimPacket);

  if (!claimPacket.dryRun) {
    const ids = new Set(matching.map((job) => job.id));
    queue.jobs = queue.jobs.map((job) => {
      if (!ids.has(job.id)) return job;
      return {
        ...job,
        status: "claimed",
        claimedAt: now,
        updatedAt: now,
        claims: [
          ...(Array.isArray(job.claims) ? job.claims : []),
          { claimId, claimant, claimedAt: now, claimPath: toRelativePath(claimPath) }
        ]
      };
    });
    queue.counts = countJobs(queue.jobs);
    queue.updatedAt = now;
    writeJson(QUEUE_PATH, queue);
  }

  console.log(`${claimPacket.dryRun ? "Prepared dry-run claim" : "Claimed"} ${matching.length} hero-shot job(s).`);
  console.log(`Claim packet: ${claimPath}`);
  for (const job of matching) {
    console.log(`- ${job.id} :: ${job.cardTitle} :: ${job.shotTitle}`);
  }
}

function completeJob(flags = {}) {
  ensureDirs();
  const jobId = requiredFlag(flags, "job-id", "jobId");
  const localPath = path.resolve(requiredFlag(flags, "local-path", "localPath"));
  if (!fs.existsSync(localPath)) throw new Error(`Generated file not found: ${localPath}`);

  const queue = readQueue();
  const job = queue.jobs.find((item) => item.id === jobId);
  if (!job) throw new Error(`Unknown hero-shot job: ${jobId}`);

  const ext = normalizeImageExt(path.extname(localPath));
  const cardSlug = slugify(job.cardTitle || job.cardId);
  const outDir = path.join(OUTPUT_DIR, job.kind, cardSlug);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = `${job.shotId}-${compactTimestamp(new Date().toISOString())}${ext}`;
  const outPath = path.join(outDir, outFile);
  fs.copyFileSync(localPath, outPath);
  const uri = toMediaUri(outPath);
  const now = new Date().toISOString();

  queue.jobs = queue.jobs.map((item) => item.id === jobId
    ? {
      ...item,
      status: "generated",
      completedAt: now,
      updatedAt: now,
      output: {
        localPath: outPath,
        mediaUri: uri,
        sourceLocalPath: localPath,
        completedAt: now
      }
    }
    : item);
  queue.counts = countJobs(queue.jobs);
  queue.updatedAt = now;
  writeJson(QUEUE_PATH, queue);

  attachOutputToCard(job, uri, now, flags.title);
  console.log(`Completed ${job.id}`);
  console.log(`Output: ${outPath}`);
  console.log(`Media URI: ${uri}`);
}

async function recoverFromRollout(flags = {}) {
  ensureDirs();
  const claimPath = resolveInputPath(flags.claimPath || flags["claim-path"] || latestClaimPath());
  if (!claimPath || !fs.existsSync(claimPath)) throw new Error("Missing required flag --claim-path, and no claim packet was found.");
  const rolloutPath = resolveInputPath(requiredFlag(flags, "rollout-path", "rolloutPath"));
  if (!fs.existsSync(rolloutPath)) throw new Error(`Rollout file not found: ${rolloutPath}`);

  const claim = readJson(claimPath, { jobs: [] });
  const claimJobs = Array.isArray(claim.jobs) ? claim.jobs : [];
  const queue = readQueue();
  const force = Boolean(flags.force);
  const pendingJobs = claimJobs.filter((job) => {
    if (force) return true;
    const queued = queue.jobs.find((item) => item.id === job.id);
    return queued?.status !== "generated";
  });
  const limit = Math.max(1, Number(flags.limit || pendingJobs.length || claimJobs.length || 1));
  const jobs = pendingJobs.slice(0, limit);
  if (!jobs.length) {
    console.log("No claim jobs need recovery. Use --force to extract already-generated jobs again.");
    return;
  }

  const since = flags.since || claim.claimedAt || "";
  const skip = Math.max(0, Number(flags.skip || 0));
  const selectedIndexes = parseIndexList(flags.select || flags["select-indexes"] || flags.selectIndexes);
  const extractLimit = selectedIndexes.length
    ? Math.max(...selectedIndexes) + 1
    : jobs.length;
  const extracted = await extractGeneratedImagesFromRollout(rolloutPath, { since, skip, limit: extractLimit });
  const selectedImages = selectedIndexes.length
    ? selectedIndexes.map((index) => extracted[index]).filter(Boolean)
    : extracted;
  if (selectedImages.length < jobs.length) {
    throw new Error(`Only found ${selectedImages.length} selected generated image result(s), but ${jobs.length} claim job(s) need recovery.`);
  }

  const recoveredAt = new Date().toISOString();
  const outDir = path.join(ROLLOUT_EXTRACT_DIR, compactTimestamp(recoveredAt));
  fs.mkdirSync(outDir, { recursive: true });

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const image = selectedImages[index];
    const outPath = path.join(outDir, `${slugify(job.id)}.png`);
    fs.writeFileSync(outPath, image.buffer);
    console.log(`Recovered ${job.id}`);
    console.log(`Source: ${image.timestamp} ${image.id}`);
    console.log(`File: ${outPath}`);
    if (flags.complete) {
      completeJob({ jobId: job.id, localPath: outPath, title: job.shotTitle });
    }
  }
}

function failJob(flags = {}) {
  const jobId = requiredFlag(flags, "job-id", "jobId");
  const reason = flags.reason || "Generation failed or needs regeneration.";
  const queue = readQueue();
  const now = new Date().toISOString();
  let found = false;
  queue.jobs = queue.jobs.map((job) => {
    if (job.id !== jobId) return job;
    found = true;
    return {
      ...job,
      status: "failed",
      failedAt: now,
      updatedAt: now,
      failureReason: reason
    };
  });
  if (!found) throw new Error(`Unknown hero-shot job: ${jobId}`);
  queue.counts = countJobs(queue.jobs);
  queue.updatedAt = now;
  writeJson(QUEUE_PATH, queue);
  console.log(`Marked failed: ${jobId}`);
  console.log(reason);
}

function createJob(card, shot, referenceBundle, now) {
  const kindStyle = KIND_STYLE[card.kind] || KIND_STYLE.node;
  const cardId = card.id || `${card.kind}-${slugify(card.title || card.name || "card")}`;
  const cardTitle = card.title || card.name || cardId;
  const prompt = buildPrompt(card, shot, referenceBundle);
  return {
    id: `hero-shot-${card.kind}-${slugify(cardId)}-${shot.id}`,
    schemaVersion: "hapa.card-hero-shot-job.v1",
    status: "queued",
    priority: card.kind === "garden" ? 1 : card.kind === "protocol" ? 2 : 3,
    kind: card.kind,
    cardType: kindStyle.cardType,
    cardId,
    cardTitle,
    canonStatus: card.canonStatus || "scaffold",
    shotId: shot.id,
    shotTitle: shot.title,
    shotGoal: shot.shotGoal,
    targetAspect: shot.targetAspect,
    accentHue: kindStyle.hue,
    prompt,
    negativePrompt: [
      "No watermarks, no external brand logos, no random UI chrome from unrelated products.",
      "No paragraphs of tiny fake text, malformed labels, or unreadable stat blocks inside the art.",
      "No generic corporate dashboard, flat stock illustration, beige-only fantasy parchment, or blurry atmospheric-only scene.",
      "Do not copy the exact Hapa Tarot Ship Card reference composition or ship silhouette; use it as style and framing grammar.",
      "Do not invent canon claims, avatar identities, or place names that are not implied by the card."
    ].join(" "),
    referenceBundle,
    sourceCard: summarizeCard(card),
    output: null,
    claims: [],
    createdAt: now,
    updatedAt: now,
    claimedAt: "",
    completedAt: "",
    failedAt: "",
    failureReason: ""
  };
}

function buildPrompt(card, shot, referenceBundle) {
  const kindStyle = KIND_STYLE[card.kind] || KIND_STYLE.node;
  const cardTitle = card.title || card.name || card.id;
  const mechanics = summarizeMechanics(card);
  const lore = firstUsefulText([card.lore, card.description, card.summary], 900);
  const summary = firstUsefulText([card.summary, card.description, card.lore], 700);
  const tags = normalizeList(card.tags).slice(0, 14).join(", ");
  const connections = summarizeConnections(card);
  const tarotTitles = referenceBundle.tarotReferences.map((ref) => ref.title).join(", ");
  const aestheticTitles = referenceBundle.aestheticReferences.map((ref) => ref.title).join(", ");

  return [
    `Create one high-production GPT Image hero shot for this Hapa ${card.kind} card: "${cardTitle}".`,
    "",
    "Use the provided visual references as style references, not exact copies.",
    `Aesthetic anchors: ${aestheticTitles}.`,
    `Hapa Tarot Cards specifically: ${tarotTitles}. Use their vertical tarot-card framing, ornamental border language, major-arcana staging, stat/title plate zones, and ritual-card feeling.`,
    "",
    "Required style guide:",
    "Hapa Neoblade / NeonBlade Operator. Make it feel like a futuristic cyber card game played on a mission-control console: deep black-blue glass, neon hairline borders, scanline/grain discipline, card-as-record composition, and glow used as semantic language.",
    `Kind hue: ${kindStyle.hue}. Card type lens: ${kindStyle.cardType}.`,
    `World lens: ${kindStyle.worldLens}`,
    `Teaching lens: ${kindStyle.teachingLens}`,
    "",
    `Shot type: ${shot.title}. ${shot.shotGoal}`,
    `Target aspect: ${shot.targetAspect}.`,
    `Shot composition rules: ${shot.compositionRules.join(" ")}`,
    "",
    "Card content to teach:",
    `Summary: ${summary || "No summary supplied; infer only from title, kind, tags, and mechanics."}`,
    `Mechanics: ${mechanics || "Represent the card's operational role as readable visual flow."}`,
    `Lore: ${lore || "Keep lore atmospheric but do not invent hard canon beyond the card's obvious role."}`,
    `Tags: ${tags || "none"}.`,
    `Connections: ${connections || "none visible"}.`,
    "",
    "Visual teaching requirements:",
    "Show the learned thing as an object, place, path, gate, interface, vessel, or ritual that a viewer can understand at a glance.",
    "Use arrows, ports, state lights, orbital paths, energy conduits, resource streams, shields, provenance trails, or training loops as appropriate.",
    "Leave clear negative space for live UI overlays: title, typeline, stats, provenance, and rank should be added by the Hapa card renderer, not baked into the art.",
    "The image should be inspectable at close zoom, with crisp materials, readable silhouettes, and layered depth."
  ].join("\n");
}

function summarizeCard(card) {
  return {
    id: card.id || "",
    kind: card.kind || "",
    title: card.title || card.name || "",
    canonStatus: card.canonStatus || "",
    rank: card.rank || "",
    summary: firstUsefulText([card.summary], 500),
    utility: normalizeList(card.utility),
    broadGameMechanics: normalizeList(card.broadGameMechanics),
    tags: normalizeList(card.tags),
    connections: card.connections || {},
    mediaPrompts: card.mediaPrompts || {}
  };
}

function summarizeMechanics(card) {
  const utility = normalizeList(card.utility);
  const game = normalizeList(card.broadGameMechanics);
  const promptBits = [
    card.mediaPrompts?.heroImage,
    card.mediaPrompts?.twoD,
    card.mediaPrompts?.comicPanel,
    card.mediaPrompts?.explainerVideo
  ].filter(Boolean);
  return [...utility, ...game, ...promptBits].join("; ").slice(0, 1100);
}

function summarizeConnections(card) {
  const connections = card.connections || {};
  const bits = [];
  for (const key of ["avatarIds", "teamIds", "placeIds", "nodeIds", "shipIds", "itemIds"]) {
    const value = normalizeList(connections[key]);
    if (value.length) bits.push(`${key}: ${value.slice(0, 8).join(", ")}`);
  }
  return bits.join("; ");
}

function resolveTarotReferences(store) {
  const cards = Array.isArray(store.cards) ? store.cards : [];
  const shipCards = cards.filter((card) => card.kind === "ship" && normalizeList(card.tags).includes("tarot-card"));
  const refs = [];
  for (const title of TAROT_REFERENCE_TITLES) {
    const found = shipCards.find((card) => sameTitle(card.title, title) || sameTitle(card.shipCard?.title, title));
    if (!found) continue;
    const asset = pickBestImageAsset(found);
    refs.push({
      id: `hapa-tarot-${slugify(title)}`,
      cardId: found.id,
      title: found.shipCard?.title || found.title || title,
      subtitle: found.shipCard?.subtitle || found.shipCard?.archetype || found.summary || "",
      role: "hapa tarot card reference",
      keywords: normalizeList(found.shipCard?.keywords).slice(0, 8),
      mediaUri: asset?.thumbnailUri || asset?.uri || "",
      localPath: mediaUriToLocalPath(asset?.thumbnailUri || asset?.uri || ""),
      promptUse: "Reference Hapa Tarot card frame grammar, title/stat plate structure, vertical major-arcana staging, and ship-card aura. Do not copy exact text or silhouette."
    });
  }
  return refs.map(withPathStatus);
}

function buildReferenceBundle(tarotReferences) {
  return {
    styleGuideIds: DESIGN_GUIDE_REFERENCES.map((ref) => ref.id),
    aestheticReferenceIds: AESTHETIC_REFERENCES.map((ref) => ref.id),
    tarotReferenceIds: tarotReferences.map((ref) => ref.id),
    styleGuides: DESIGN_GUIDE_REFERENCES.map(withPathStatus),
    aestheticReferences: AESTHETIC_REFERENCES.map(withMediaLocalPath),
    tarotReferences
  };
}

function buildClaimJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    cardType: job.cardType,
    cardId: job.cardId,
    cardTitle: job.cardTitle,
    shotId: job.shotId,
    shotTitle: job.shotTitle,
    targetAspect: job.targetAspect,
    accentHue: job.accentHue,
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    sourceCard: job.sourceCard,
    referenceImages: [
      ...job.referenceBundle.aestheticReferences,
      ...job.referenceBundle.tarotReferences
    ].filter((ref) => ref.localPath),
    styleGuides: job.referenceBundle.styleGuides
  };
}

function filterJobs(jobs, flags = {}) {
  return jobs.filter((job) => {
    if (flags.kind && job.kind !== flags.kind) return false;
    if (flags.shot && job.shotId !== flags.shot) return false;
    if (flags.status && job.status !== flags.status) return false;
    if (flags.card && !`${job.cardId} ${job.cardTitle}`.toLowerCase().includes(String(flags.card).toLowerCase())) return false;
    return true;
  });
}

function attachOutputToCard(job, uri, now, titleOverride = "") {
  const store = readJson(STORE_PATH, { cards: [] });
  const cards = Array.isArray(store.cards) ? store.cards : [];
  const asset = {
    id: `media-${job.id}`,
    title: titleOverride || `${job.cardTitle} - ${job.shotTitle}`,
    type: "image",
    uri,
    thumbnailUri: uri,
    sourceAssetId: job.id,
    mimeType: inferMimeType(uri),
    tags: [
      "hero-shot",
      "gpt-image",
      "hapa-neoblade",
      "hapa-tarot-reference",
      job.kind,
      job.shotId
    ],
    confidence: "generated",
    notes: `Generated from ${QUEUE_SCHEMA_VERSION}; references include Hapa aesthetic anchors, Hapa Tarot Cards, and existing Hapa style guides.`
  };
  let found = false;
  store.cards = cards.map((card) => {
    if (card.id !== job.cardId) return card;
    found = true;
    const existingAssets = Array.isArray(card.mediaAssets) ? card.mediaAssets : [];
    const nextAssets = existingAssets.filter((item) => item.id !== asset.id && item.uri !== asset.uri);
    return {
      ...card,
      mediaAssets: [...nextAssets, asset],
      updatedAt: now
    };
  });
  if (!found) throw new Error(`Card not found for completed job: ${job.cardId}`);
  store.updatedAt = now;
  writeJson(STORE_PATH, store);
}

function readQueue() {
  const fallback = {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    title: "Hapaverse Garden / Protocol / Node Hero Shot Queue",
    jobs: [],
    createdAt: "",
    updatedAt: ""
  };
  return readJson(QUEUE_PATH, fallback);
}

function countJobs(jobs = []) {
  const counts = {
    total: jobs.length,
    byStatus: {},
    byKind: {},
    byShot: {}
  };
  for (const job of jobs) {
    counts.byStatus[job.status || "unknown"] = (counts.byStatus[job.status || "unknown"] || 0) + 1;
    counts.byKind[job.kind || "unknown"] = (counts.byKind[job.kind || "unknown"] || 0) + 1;
    counts.byShot[job.shotId || "unknown"] = (counts.byShot[job.shotId || "unknown"] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts) {
  return [
    `Total: ${counts.total}`,
    `Status: ${formatBucket(counts.byStatus)}`,
    `Kind: ${formatBucket(counts.byKind)}`,
    `Shot: ${formatBucket(counts.byShot)}`
  ].join("\n");
}

function formatBucket(bucket = {}) {
  return Object.entries(bucket)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key} ${value}`)
    .join(", ") || "none";
}

function printJob(job) {
  console.log(`${job.id}`);
  console.log(`${job.kind.toUpperCase()} :: ${job.cardTitle} :: ${job.shotTitle}`);
  console.log(`Status: ${job.status}`);
  console.log(`Prompt:\n${job.prompt}`);
  console.log(`Negative:\n${job.negativePrompt}`);
}

function printHelp() {
  console.log(`
Hapaverse hero-shot queue

Commands:
  seed                         Create/update 3 GPT Image jobs for each Garden, Protocol, and Node.
  status [--next]              Show queue counts, optionally the next matching job.
  claim [--limit 3]            Claim queued jobs and write a claim packet.
  claim --peek                 Write a dry-run claim packet without changing job status.
  complete --job-id ID --local-path PATH
                               Copy generated image into media storage and attach it to the source card.
  recover --claim-path PATH --rollout-path PATH [--complete]
                               Extract Codex inline image_generation_call PNG results from a rollout JSONL.
  fail --job-id ID --reason TEXT
                               Mark a job failed.

Filters:
  --kind garden|protocol|node
  --shot hapa_tarot_card|mechanic_teaching|in_world_action
  --status queued|claimed|generated|failed|skipped
  --card TEXT
  --select 0,2,3               For recover: choose image result indexes after --skip when rejecting a bad generation.

Examples:
  npm run hero-shots:seed
  npm run hero-shots:claim -- --kind garden --limit 1
  npm run hero-shots:complete -- --job-id hero-shot-garden-example-hapa_tarot_card --local-path /tmp/result.png
  npm run hero-shots:recover -- --claim-path data/media-generation/hero-shot-claims/claim-example.json --rollout-path ~/.codex/sessions/2026/06/18/rollout-example.jsonl --complete
`);
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "status";
  const rest = command === "status" && argv[0]?.startsWith("-") ? argv : argv.slice(1);
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=");
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      flags[key] = parseFlagValue(inlineValue);
      flags[rawKey] = flags[key];
      continue;
    }
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      flags[rawKey] = true;
      continue;
    }
    flags[key] = parseFlagValue(next);
    flags[rawKey] = flags[key];
    index += 1;
  }
  return { command, flags };
}

function parseFlagValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseIndexList(value = "") {
  return normalizeList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0);
}

function requiredFlag(flags, dashed, camel) {
  const value = flags[dashed] || flags[camel];
  if (!value) throw new Error(`Missing required flag --${dashed}`);
  return value;
}

function ensureDirs() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  fs.mkdirSync(CLAIM_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(ROLLOUT_EXTRACT_DIR, { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function extractGeneratedImagesFromRollout(rolloutPath, options = {}) {
  const since = options.since || "";
  const skip = Math.max(0, Number(options.skip || 0));
  const limit = Math.max(1, Number(options.limit || 1));
  const seen = new Set();
  const extracted = [];
  const targetCount = skip + limit;
  const lines = createInterface({
    input: fs.createReadStream(rolloutPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (since && (record.timestamp || "") < since) continue;
    const payload = record.payload || {};
    if (payload.type !== "image_generation_call") continue;
    if (!payload.id || seen.has(payload.id)) continue;
    if (typeof payload.result !== "string" || !payload.result.startsWith("iVBOR")) continue;
    seen.add(payload.id);
    const buffer = Buffer.from(payload.result, "base64");
    if (!isPngBuffer(buffer)) continue;
    extracted.push({
      id: payload.id,
      timestamp: record.timestamp || "",
      revisedPrompt: payload.revised_prompt || "",
      buffer
    });
    if (extracted.length >= targetCount) {
      lines.close();
      break;
    }
  }
  return extracted.slice(skip, skip + limit);
}

function isPngBuffer(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length > 8
    && buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
}

function latestClaimPath() {
  if (!fs.existsSync(CLAIM_DIR)) return "";
  const files = fs.readdirSync(CLAIM_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(CLAIM_DIR, file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || "";
}

function resolveInputPath(input = "") {
  if (!input) return "";
  const expanded = String(input).replace(/^~(?=$|\/)/, process.env.HOME || "");
  if (path.isAbsolute(expanded)) return expanded;
  return path.resolve(ROOT, expanded);
}

function pickBestImageAsset(card) {
  const assets = Array.isArray(card.mediaAssets) ? card.mediaAssets : [];
  return assets.find((asset) => asset.thumbnailUri && isImageUri(asset.thumbnailUri))
    || assets.find((asset) => asset.uri && isImageUri(asset.uri))
    || assets.find((asset) => asset.thumbnailUri)
    || assets.find((asset) => asset.uri)
    || null;
}

function withMediaLocalPath(ref) {
  const localPath = mediaUriToLocalPath(ref.mediaUri || "");
  return withPathStatus({
    ...ref,
    localPath
  });
}

function withPathStatus(ref) {
  return {
    ...ref,
    exists: Boolean(ref.localPath && fs.existsSync(ref.localPath))
  };
}

function mediaUriToLocalPath(uri = "") {
  if (!uri) return "";
  if (uri.startsWith("/media/")) return path.join(MEDIA_DIR, uri.replace(/^\/media\//, ""));
  if (uri.startsWith("media/")) return path.join(DATA_DIR, uri);
  if (path.isAbsolute(uri)) return uri;
  return "";
}

function toMediaUri(filePath) {
  const resolved = path.resolve(filePath);
  const rel = path.relative(MEDIA_DIR, resolved);
  if (rel.startsWith("..")) throw new Error(`File is outside media dir: ${filePath}`);
  return `/media/${rel.split(path.sep).join("/")}`;
}

function toRelativePath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function normalizeImageExt(ext) {
  const normalized = String(ext || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp"].includes(normalized)) return normalized;
  return ".png";
}

function inferMimeType(uri) {
  if (/\.jpe?g$/i.test(uri)) return "image/jpeg";
  if (/\.webp$/i.test(uri)) return "image/webp";
  return "image/png";
}

function isImageUri(uri = "") {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(uri).split("?")[0] || "");
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function firstUsefulText(values = [], maxLength = 800) {
  const found = values.find((value) => String(value || "").trim());
  return String(found || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sameTitle(a = "", b = "") {
  return slugify(a) === slugify(b);
}

function slugify(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

function compactTimestamp(iso) {
  return String(iso).replace(/[-:.TZ]/g, "").slice(0, 14);
}

try {
  await main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
