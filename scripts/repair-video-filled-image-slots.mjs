import { appendFile, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignAssetToSlot,
  createAttachPack,
  slugify
} from "../src/domain/avatar.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const SUBSCRIBER_DIR = process.env.HAPA_SUBSCRIBER_DIR || path.join(ROOT, "data/subscribers");
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain"];

const IMAGE_REQUIREMENTS = new Set([
  "character_dossier",
  "kit_sheet",
  "kit_poses",
  "kit_items",
  "closeup_emotions",
  "closeup_backgrounds",
  "fullbody_backgroundless",
  "backgroundless_two_thirds",
  "fullbody_concept_art"
]);

const MARKER_BY_REQUIREMENT = {
  closeup_emotions: ["first", "mid", "last"],
  closeup_backgrounds: ["first", "mid", "last"],
  kit_poses: ["first", "mid", "last"],
  fullbody_concept_art: ["first", "mid", "last"],
  character_dossier: ["first", "mid", "last"],
  kit_sheet: ["first", "mid", "last"],
  kit_items: ["first", "mid", "last"],
  fullbody_backgroundless: ["first", "mid", "last"],
  backgroundless_two_thirds: ["first", "mid", "last"]
};

const opts = parseArgs(process.argv.slice(2));
const dryRun = Boolean(opts["dry-run"] || opts.dryRun);
const avatarFilter = opts.avatar || opts["avatar-id"] || null;
const limit = opts.limit ? Number(opts.limit) : Infinity;

const store = JSON.parse(await readFile(STORE_PATH, "utf8"));
const repairs = [];
let repaired = 0;
const targetSlots = collectRepairTargets(store)
  .slice(0, Number.isFinite(limit) ? limit : undefined);

for (const target of targetSlots) {
  const avatar = (store.avatars || []).find((candidate) => candidate.id === target.avatarId);
  const slot = (avatar?.slots || []).find((candidate) => candidate.id === target.slotId);
  if (!avatar || !slot?.assetId || !IMAGE_REQUIREMENTS.has(slot.requirementId)) continue;
  const existingAsset = (avatar.assets || []).find((asset) => asset.id === slot.assetId);
  if (!existingAsset || assetKind(existingAsset) !== "video") continue;

  const frame = chooseFrame(existingAsset, slot.requirementId);
  if (!frame?.storage?.path) {
    repairs.push({
      avatarId: avatar.id,
      avatarName: avatar.name || avatar.primaryName,
      slotId: slot.id,
      sourceAssetId: existingAsset.id,
      status: "skipped",
      reason: "video-has-no-extracted-frame"
    });
    continue;
  }

  const sourceFramePath = path.resolve(ROOT, frame.storage.path);
  const sourceStat = await stat(sourceFramePath).catch(() => null);
  if (!sourceStat) {
    repairs.push({
      avatarId: avatar.id,
      avatarName: avatar.name || avatar.primaryName,
      slotId: slot.id,
      sourceAssetId: existingAsset.id,
      status: "skipped",
      reason: "frame-file-missing",
      sourceFramePath
    });
    continue;
  }

  const extension = path.extname(sourceFramePath).toLowerCase() || ".jpg";
  const slotLabel = slot.id.replace(/_/g, "-");
  const destName = `${slugify(`${avatar.id}-${slot.requirementId}-${slotLabel}-video-frame-repair`)}-${Date.now()}-${repaired + 1}${extension}`;
  const destPath = path.join(MEDIA_DIR, destName);
  const now = new Date().toISOString();
  const repairedAsset = {
    id: `repaired-${avatar.id}-${slot.id}-${Date.now()}-${repaired + 1}`,
    name: `${slotLabel}-image-repair`,
    uri: `/media/${destName}`,
    type: "image",
    requirementId: slot.requirementId,
    tags: Array.from(new Set([
      "healed",
      "needs-review",
      "reference",
      "video-frame",
      "frame-repair",
      frame.marker,
      slot.requirementId,
      ...(Array.isArray(existingAsset.tags) ? existingAsset.tags.filter((tag) => !["video", "motion"].includes(tag)) : [])
    ].filter(Boolean))),
    source: "hapa-avatar-library-healer.repair-video-filled-image-slots",
    notes: `Repaired image requirement slot ${slot.id} by attaching the ${frame.marker || "selected"} frame from video asset ${existingAsset.id}. Source video was preserved.`,
    parentAssetId: existingAsset.id,
    metadata: {
      originalFileName: path.basename(destPath),
      sourceVideoAssetId: existingAsset.id,
      sourceVideoName: existingAsset.name,
      sourceFrameId: frame.id || null,
      sourceFrameMarker: frame.marker || null,
      sourceFrameRole: frame.role || null,
      sourceFrameTime: frame.time ?? null,
      sourceFramePath,
      storagePath: destPath,
      sizeBytes: sourceStat.size,
      storage: {
        kind: "local-file",
        fileName: destName,
        path: destPath
      }
    },
    processing: {
      status: "healed",
      attachedToCard: true,
      healingJobId: `video-frame-repair-${avatar.id}-${slot.id}`,
      needsHumanReview: true,
      processedAt: now
    },
    state: {
      kind: "video-frame-repair",
      sourceAssetId: existingAsset.id,
      marker: frame.marker || null,
      sourceSlotId: slot.id
    },
    createdAt: now
  };

  repairs.push({
    avatarId: avatar.id,
    avatarName: avatar.name || avatar.primaryName,
    slotId: slot.id,
    requirementId: slot.requirementId,
    sourceAssetId: existingAsset.id,
    sourceAssetName: existingAsset.name,
    frameMarker: frame.marker || null,
    framePath: sourceFramePath,
    repairedAssetId: repairedAsset.id,
    repairedPath: destPath,
    status: dryRun ? "would-repair" : "repaired"
  });

  if (!dryRun) {
    await mkdir(MEDIA_DIR, { recursive: true });
    await copyFile(sourceFramePath, destPath);
    const nextAvatar = assignAssetToSlot(avatar, repairedAsset, slot.id);
    Object.assign(avatar, nextAvatar);
    await appendSubscriberRegistration("avatar.image-slot-video-frame-repaired", {
      avatar,
      media: repairedAsset
    });
  }
  repaired += 1;
}

if (!dryRun && repairs.some((repair) => repair.status === "repaired")) {
  await backupStore();
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  schemaVersion: "hapa.avatar-video-slot-repair.v1",
  dryRun,
  avatarFilter,
  totalRepairs: repairs.filter((repair) => repair.status === "repaired" || repair.status === "would-repair").length,
  skipped: repairs.filter((repair) => repair.status === "skipped").length,
  repairs
}, null, 2));

function chooseFrame(asset, requirementId) {
  const frames = Array.isArray(asset.metadata?.frames)
    ? asset.metadata.frames
    : Array.isArray(asset.frames)
      ? asset.frames
      : [];
  const markerPreference = MARKER_BY_REQUIREMENT[requirementId] || ["first", "mid", "last"];
  for (const marker of markerPreference) {
    const match = frames.find((frame) => frame.marker === marker && frame.storage?.path);
    if (match) return match;
  }
  return frames.find((frame) => frame.storage?.path) || null;
}

function collectRepairTargets(inputStore) {
  const targets = [];
  for (const avatar of inputStore.avatars || []) {
    if (avatarFilter && avatar.id !== avatarFilter) continue;
    for (const slot of avatar.slots || []) {
      if (slot.required === false || !slot.assetId || !IMAGE_REQUIREMENTS.has(slot.requirementId)) continue;
      const asset = (avatar.assets || []).find((candidate) => candidate.id === slot.assetId);
      if (asset && assetKind(asset) === "video") targets.push({ avatarId: avatar.id, slotId: slot.id });
    }
  }
  return targets;
}

function assetKind(asset) {
  if (asset.type) return asset.type;
  const value = `${asset.name || ""} ${asset.uri || ""} ${asset.metadata?.storage?.path || ""}`.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)\b/.test(value)) return "video";
  if (/\.(png|jpe?g|webp)\b/.test(value)) return "image";
  return "unknown";
}

async function backupStore() {
  const backupDir = path.join(ROOT, "data/backups");
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await copyFile(STORE_PATH, path.join(backupDir, `avatar-store.video-slot-repair-${timestamp}.json`));
}

async function appendSubscriberRegistration(action, { avatar = null, media = null } = {}) {
  await mkdir(SUBSCRIBER_DIR, { recursive: true });
  const normalizedAvatar = avatar ? { ...avatar, attachPack: createAttachPack(avatar, "hapa-subscriber") } : null;
  const event = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    createdAt: new Date().toISOString(),
    subscribers: SUBSCRIBERS,
    avatar: normalizedAvatar ? summarizeAvatar(normalizedAvatar) : null,
    media: media ? summarizeMedia(media) : null
  };
  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await Promise.all(SUBSCRIBERS.map((subscriber) => appendFile(
    path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`),
    `${JSON.stringify({ ...event, subscriber, status: "queued" })}\n`,
    "utf8"
  )));
  await writeFile(path.join(SUBSCRIBER_DIR, "latest.json"), `${JSON.stringify(event, null, 2)}\n`, "utf8");
  await writeFile(path.join(SUBSCRIBER_DIR, "latest-summary.json"), `${JSON.stringify({
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action: event.action,
    createdAt: event.createdAt,
    avatarId: event.avatar?.id || null,
    avatarName: event.avatar?.primaryName || null,
    mediaId: event.media?.id || null,
    mediaName: event.media?.name || null,
    subscribers: event.subscribers
  }, null, 2)}\n`, "utf8");
}

function summarizeAvatar(avatar) {
  return {
    id: avatar.id,
    primaryName: avatar.name || avatar.primaryName,
    aliases: avatar.aliases || [],
    completion: avatar.completion || null,
    attachPack: avatar.attachPack || null,
    updatedAt: avatar.updatedAt || null
  };
}

function summarizeMedia(media) {
  return {
    id: media.id,
    name: media.name,
    uri: media.uri,
    type: media.type,
    requirementId: media.requirementId,
    tags: media.tags || [],
    parentAssetId: media.parentAssetId || null
  };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
