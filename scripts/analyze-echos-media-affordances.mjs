import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const SCRIPT_NAME = "scripts/analyze-echos-media-affordances.mjs";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const GENERATED_AT = new Date().toISOString();
const args = new Set(process.argv.slice(2));
const APPLY_MUTATIONS = args.has("--apply") || process.env.HAPA_ECHOS_APPLY === "1";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;
const ffprobeBin = process.env.FFPROBE || "/opt/homebrew/bin/ffprobe";

const PLACEHOLDER_TAGS = new Set([
  "digital-isolation",
  "cyber-operator",
  "simulation-framework",
  "camera-push-in",
  "glitch-lines",
  "browser-playback",
  "video",
  "scene",
  "scene-card",
  "episode-card",
  "episodes",
  "tarot-card",
]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "video", "scene", "card", "asset", "media", "generated", "hapa", "loop", "clip",
]);

function shouldApplyMutations() {
  return APPLY_MUTATIONS;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function copyIfExists(sourcePath, destPath) {
  const exists = await fs.access(sourcePath).then(() => true).catch(() => false);
  if (exists) await fs.copyFile(sourcePath, destPath);
}

async function createBackup() {
  const backupDir = path.join(DATA_DIR, "backups", `echos-media-affordances-${RUN_ID}`);
  await fs.mkdir(backupDir, { recursive: true });
  await Promise.all([
    copyIfExists(ITEM_STORE_PATH, path.join(backupDir, "item-manager-store.json")),
    copyIfExists(SCENE_STORE_PATH, path.join(backupDir, "scene-store.json")),
  ]);
  return backupDir;
}

function resolveMediaPath(uri = "") {
  if (!uri.startsWith("/media/")) return "";
  const relative = decodeURIComponent(uri.replace(/^\/media\/?/, ""));
  const resolved = path.resolve(MEDIA_DIR, relative);
  const root = path.resolve(MEDIA_DIR);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) return "";
  return resolved;
}

function parseRate(rate = "") {
  const [num, den] = String(rate).split("/").map(Number);
  if (!num || !den) return null;
  return Number((num / den).toFixed(3));
}

function probeVideo(filePath) {
  const result = spawnSync(ffprobeBin, [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    filePath,
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 4 });

  if (result.status !== 0) {
    return { ok: false, error: result.stderr || result.stdout || `ffprobe exited ${result.status}` };
  }

  const payload = JSON.parse(result.stdout || "{}");
  const videoStream = (payload.streams || []).find((stream) => stream.codec_type === "video") || {};
  const audioStream = (payload.streams || []).find((stream) => stream.codec_type === "audio") || null;
  const duration = Number(videoStream.duration || payload.format?.duration || 0);
  const width = Number(videoStream.width || 0);
  const height = Number(videoStream.height || 0);
  const frameRate = parseRate(videoStream.avg_frame_rate || videoStream.r_frame_rate);

  return {
    ok: true,
    durationSec: duration ? Number(duration.toFixed(3)) : null,
    width: width || null,
    height: height || null,
    aspectRatio: width && height ? Number((width / height).toFixed(4)) : null,
    frameRate,
    codec: videoStream.codec_name || "",
    pixelFormat: videoStream.pix_fmt || "",
    bitRate: Number(videoStream.bit_rate || payload.format?.bit_rate || 0) || null,
    hasAudio: Boolean(audioStream),
    audioCodec: audioStream?.codec_name || "",
    streamCount: (payload.streams || []).length,
  };
}

function cleanToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsFrom(...values) {
  return values
    .flatMap((value) => cleanToken(value).split(/\s+/))
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function inferObjects(asset, parentObj, sourceKind) {
  const titleWords = wordsFrom(asset.title || asset.name, parentObj.title || parentObj.name);
  const tagWords = (asset.tags || parentObj.tags || [])
    .filter((tag) => !PLACEHOLDER_TAGS.has(String(tag).toLowerCase()))
    .flatMap((tag) => wordsFrom(tag));
  return [...new Set([...titleWords, ...tagWords, sourceKind === "scene" ? "scene-source" : "avatar-card-source"])].slice(0, 10);
}

function inferActions(asset, sourceKind, probe) {
  const duration = Number(probe.durationSec || asset.metadata?.duration || asset.duration || 0);
  const actions = [
    duration && duration <= 6 ? "short-loop-playback" : "progression-playback",
    probe.width && probe.height && probe.height > probe.width ? "portrait-framing" : "landscape-framing",
    sourceKind === "scene" ? "scene-placement" : "card-reveal",
    probe.hasAudio ? "audio-bearing" : "muted-visual",
  ];
  return [...new Set(actions.filter(Boolean))];
}

function classifyFlow(probe, asset) {
  const duration = Number(probe.durationSec || asset.metadata?.duration || asset.duration || 0);
  if (duration && duration <= 6.5) return "loop";
  return "progression";
}

function classifyShotGrammar(probe, sourceKind) {
  if (probe.height && probe.width && probe.height > probe.width) {
    return sourceKind === "scene" ? "vertical_scene_plate" : "vertical_card_reveal";
  }
  return sourceKind === "scene" ? "wide_scene_plate" : "horizontal_card_reveal";
}

function classifyMotion(probe, flowType) {
  if (flowType === "loop") return "short-loop-motion";
  if (probe.frameRate && probe.frameRate >= 30) return "continuous-progressive-motion";
  return "progressive-motion";
}

function updateAsset(asset, parentObj, sourceKind, probe, filePath) {
  const metadata = asset.metadata || {};
  const flowType = classifyFlow(probe, asset);
  const shotGrammar = classifyShotGrammar(probe, sourceKind);
  const motion = classifyMotion(probe, flowType);
  const duration = probe.durationSec || metadata.duration || asset.duration || null;
  const objects = inferObjects(asset, parentObj, sourceKind);
  const actions = inferActions(asset, sourceKind, probe);
  const aspectTag = probe.width && probe.height && probe.height > probe.width ? "aspect-portrait" : "aspect-landscape";
  const sourceTag = sourceKind === "scene" ? "source-scene-store" : "source-avatar-card";

  asset.width = probe.width || asset.width;
  asset.height = probe.height || asset.height;
  asset.duration = duration || asset.duration;
  asset.tags = [...new Set([...(asset.tags || []), "technical-ffprobe-verified", aspectTag, sourceTag])];
  asset.metadata = {
    ...metadata,
    duration,
    length: duration,
    width: probe.width || metadata.width || asset.width,
    height: probe.height || metadata.height || asset.height,
    aspectRatio: probe.aspectRatio || metadata.aspectRatio || null,
    frameRate: probe.frameRate || metadata.frameRate || null,
    shotGrammar,
    shotType: shotGrammar,
    motion,
    motionAffordance: motion,
    motionAffordances: motion,
    flowType,
    objects,
    nouns: objects,
    actions,
    verbs: actions,
    echosTechnicalAffordance: {
      status: "verified",
      source: "ffprobe",
      script: SCRIPT_NAME,
      runId: RUN_ID,
      probedAt: GENERATED_AT,
      filePath,
      durationSec: probe.durationSec,
      width: probe.width,
      height: probe.height,
      aspectRatio: probe.aspectRatio,
      frameRate: probe.frameRate,
      codec: probe.codec,
      pixelFormat: probe.pixelFormat,
      bitRate: probe.bitRate,
      hasAudio: probe.hasAudio,
      audioCodec: probe.audioCodec,
      streamCount: probe.streamCount,
    },
    echosTruth: {
      status: "technical_verified_source_inferred",
      source: SCRIPT_NAME,
      runId: RUN_ID,
      generatedAt: GENERATED_AT,
      fields: {
        duration: "verified",
        dimensions: "verified",
        shotGrammar: "inferred",
        motionAffordances: "inferred",
        objects: "source_inferred",
        actions: "source_inferred",
        flowType: "inferred",
      },
    },
  };
  return asset;
}

async function fileSize(filePath) {
  try {
    const info = await fs.stat(filePath);
    return info.size;
  } catch {
    return null;
  }
}

async function markInvalidAsset(asset, filePath, error) {
  const metadata = asset.metadata || {};
  asset.tags = [...new Set([...(asset.tags || []), "technical-ffprobe-failed", "media-file-invalid"])];
  asset.metadata = {
    ...metadata,
    echosTechnicalAffordance: {
      status: "invalid_file",
      source: "ffprobe",
      script: SCRIPT_NAME,
      runId: RUN_ID,
      probedAt: GENERATED_AT,
      filePath,
      fileSizeBytes: await fileSize(filePath),
      error: String(error || "ffprobe failed").slice(0, 500),
    },
    echosTruth: {
      status: "invalid_media_file",
      source: SCRIPT_NAME,
      runId: RUN_ID,
      generatedAt: GENERATED_AT,
      fields: {
        duration: "missing",
        dimensions: "missing",
        shotGrammar: "missing",
        motionAffordances: "missing",
        objects: "source_inferred",
        actions: "source_inferred",
        flowType: "missing",
      },
    },
  };
  return asset;
}

async function main() {
  const applyMutations = shouldApplyMutations();
  console.log(`Starting Echo media affordance analysis in ${applyMutations ? "apply" : "dry-run"} mode...`);
  if (!applyMutations) console.log("Dry run only. Use --apply or HAPA_ECHOS_APPLY=1 to write stores.");

  if (applyMutations) {
    const backupDir = await createBackup();
    console.log(`Created timestamped backup in ${path.relative(ROOT, backupDir)}`);
  }

  const [itemStore, sceneStore] = await Promise.all([
    readJson(ITEM_STORE_PATH),
    readJson(SCENE_STORE_PATH),
  ]);
  const probeCache = new Map();
  const stats = {
    seen: 0,
    probed: 0,
    updated: 0,
    missingFiles: 0,
    probeFailures: 0,
    skippedByLimit: 0,
  };

  const analyze = async (asset, parentObj, sourceKind) => {
    if (asset.type !== "video") return asset;
    stats.seen++;
    if (stats.updated >= LIMIT) {
      stats.skippedByLimit++;
      return asset;
    }
    const filePath = resolveMediaPath(asset.uri || "");
    if (!filePath) {
      stats.missingFiles++;
      return asset;
    }
    let probe = probeCache.get(filePath);
    if (!probe) {
      probe = probeVideo(filePath);
      probeCache.set(filePath, probe);
      stats.probed++;
    }
    if (!probe.ok) {
      stats.probeFailures++;
      stats.updated++;
      return markInvalidAsset(asset, filePath, probe.error);
    }
    stats.updated++;
    return updateAsset(asset, parentObj, sourceKind, probe, filePath);
  };

  for (const card of itemStore.cards || []) {
    card.mediaAssets = await Promise.all((card.mediaAssets || []).map((asset) => analyze(asset, card, "avatar_card")));
  }

  for (const scene of sceneStore.scenes || []) {
    scene.assets = await Promise.all((scene.assets || []).map((asset) => analyze(asset, scene, "scene")));
  }

  if (applyMutations) {
    await Promise.all([
      writeJson(ITEM_STORE_PATH, itemStore),
      writeJson(SCENE_STORE_PATH, sceneStore),
    ]);
  }

  console.log(JSON.stringify({
    schemaVersion: "hapa.echos-media-affordance-analysis.v1",
    mode: applyMutations ? "apply" : "dry-run",
    runId: RUN_ID,
    stats,
  }, null, 2));
}

main().catch((error) => {
  console.error("Media affordance analysis failed:", error);
  process.exitCode = 1;
});
