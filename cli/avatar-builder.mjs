#!/usr/bin/env node
import { appendFile, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assignAssetToSlot,
  auditAvatar,
  createAttachPack,
  createAvatarMindAttachPack,
  createAvatarScaffold,
  createHealingPromptPacket,
  createHealingQueue,
  createHealingPlan,
  createKanbanFromAudit,
  inferAssetKind,
  normalizeAvatarCard,
  upsertAvatarMind,
  upsertContextMapping,
  upsertMindFact,
  upsertRelationshipMapping
} from "../src/domain/avatar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_STORE = path.join(ROOT, "data/avatar-store.json");
const DEFAULT_MEDIA_DIR = path.join(ROOT, "data/media");
const DEFAULT_SUBSCRIBER_DIR = path.join(ROOT, "data/subscribers");
const DEFAULT_GENERATED_DIR = "/Users/calderwong/.codex/generated_images/019eb4de-2ab3-75a2-9a59-a0508c0810e0";
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain"];
const execFileAsync = promisify(execFile);

const [command, ...argv] = process.argv.slice(2);
const options = parseOptions(argv);
const storePath = path.resolve(options.store || process.env.HAPA_AVATAR_STORE || DEFAULT_STORE);

try {
  await main(command, options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main(cmd, opts) {
  if (!cmd || opts.help || ["help", "--help", "-h"].includes(cmd)) {
    printHelp();
    return;
  }

  if (cmd === "capabilities") {
    const manifest = JSON.parse(await readFile(path.join(ROOT, "hapa-node.json"), "utf8"));
    print({ id: manifest.id, aliases: manifest.aliases || [], capabilities: manifest.capabilities || [], interfaces: manifest.interfaces || {}, errors: { invalidCommand: "non-zero exit with an actionable message", missingAvatar: "non-zero exit naming the required avatar id" } }, opts);
    return;
  }

  if (cmd === "list") {
    const store = await readStore();
    const avatars = store.avatars.map((avatar) => ({
      id: avatar.id,
      primaryName: avatar.primaryName,
      names: avatar.names.map((item) => item.name),
      audit: auditAvatar(avatar)
    }));
    print(avatars, opts);
    return;
  }

  if (cmd === "scaffold") {
    const names = collectPositionals(opts);
    const primaryName = opts.primary || names[0] || "Unnamed";
    const avatar = createAvatarScaffold({
      id: opts.id,
      names: names.length ? names : [primaryName],
      primaryName,
      aliases: opts.alias ? String(opts.alias).split(",") : [],
      summary: opts.summary || "",
      operatorNotes: opts.notes || ""
    });
    const store = await readStore();
    if (store.avatars.some((item) => item.id === avatar.id)) {
      throw new Error(`Avatar already exists: ${avatar.id}`);
    }
    store.avatars.push(avatar);
    await writeStore(store);
    print(avatar, opts);
    return;
  }

  if (cmd === "heal-queue" && opts.all) {
    const store = await readStore();
    print(createLibraryHealingQueue(store, opts), opts);
    return;
  }

  if (cmd === "promote-overfill" && opts.all) {
    const store = await readStore();
    const result = await promoteOverfillInStore(store, opts);
    if (!opts["dry-run"] && !opts.dryRun) await writeStore(result.store);
    const summary = { ...result.summary };
    if (!opts["dry-run"] && (opts["cache-thumbnails"] || opts.thumbnails || opts["with-thumbnails"])) {
      summary.thumbnailCache = await backfillThumbnails();
    }
    if (!opts["dry-run"] && (opts["register-subscribers"] || opts.register || opts["sync-subscribers"])) {
      summary.subscriberEvents = await registerPromotions(result.store, result.summary.promotions, opts);
    }
    print(summary, opts);
    return;
  }

  const avatarId = opts._[0];
  if (!avatarId) throw new Error(`Command "${cmd}" requires an avatar id.`);

  const store = await readStore();
  const avatar = store.avatars.find((item) => item.id === avatarId || item.primaryName.toLowerCase() === avatarId.toLowerCase());
  if (!avatar) throw new Error(`Avatar not found: ${avatarId}`);

  if (cmd === "audit") {
    print(auditAvatar(avatar), opts);
    return;
  }

  if (cmd === "attach") {
    print(createAttachPack(avatar, opts.target || "agent"), opts);
    return;
  }

  if (cmd === "mind") {
    print(createAvatarMindAttachPack(avatar, store.avatars), opts);
    return;
  }

  if (cmd === "mind-set") {
    const personaPatch = {};
    for (const [optionName, fieldName] of [
      ["identity", "identityStatement"],
      ["wants", "wants"],
      ["fears", "fears"],
      ["misunderstands", "misunderstandings"],
      ["will-not-say", "willNotSayDirectly"],
      ["carried-forward", "carriedForward"]
    ]) {
      const value = opts[optionName] ?? opts[fieldName];
      if (value !== undefined) personaPatch[fieldName] = value;
    }
    if (!Object.keys(personaPatch).length) {
      throw new Error("mind-set requires at least one persona option such as --wants, --fears, or --identity.");
    }
    const nextAvatar = upsertAvatarMind(avatar, { personaAnchor: personaPatch });
    const nextStore = replaceAvatarInStore(store, nextAvatar);
    await writeStore(nextStore);
    const summary = createAvatarMindAttachPack(nextAvatar, nextStore.avatars);
    if (opts["register-subscribers"] || opts.register || opts["sync-subscribers"]) {
      summary.subscriberEvent = await appendSubscriberRegistration("avatar.mind-updated", {
        avatar: nextAvatar,
        subscriberDir: opts["subscriber-dir"] || process.env.HAPA_SUBSCRIBER_DIR || DEFAULT_SUBSCRIBER_DIR
      });
    }
    print(summary, opts);
    return;
  }

  if (cmd === "mind-fact-set") {
    const label = option(opts, "label", "name") || opts._[1];
    if (!label) throw new Error("mind-fact-set requires --label <fact-label>.");
    const nextAvatar = upsertMindFact(avatar, dropUndefined({
      id: opts.id,
      label,
      value: opts.value || opts.summary || opts.detail || "",
      classification: opts.classification,
      confidence: opts.confidence,
      visibility: opts.visibility,
      source: opts.source || "cli"
    }));
    const nextStore = replaceAvatarInStore(store, nextAvatar);
    await writeStore(nextStore);
    print(createAvatarMindAttachPack(nextAvatar, nextStore.avatars), opts);
    return;
  }

  if (cmd === "relationship-set") {
    const target = option(opts, "target", "target-avatar", "targetAvatarId") || opts._[1];
    if (!target) throw new Error("relationship-set requires --target <avatar-id-or-name>.");
    const targetAvatar = store.avatars.find((item) => item.id === target || item.primaryName.toLowerCase() === String(target).toLowerCase()) || null;
    const nextAvatar = upsertRelationshipMapping(avatar, dropUndefined({
      id: opts.id,
      targetAvatarId: targetAvatar?.id || (opts["target-avatar-id"] || opts.targetAvatarId || ""),
      targetName: opts["target-name"] || targetAvatar?.primaryName || target,
      relationLabel: opts.label || opts.relationship || "known-other",
      trust: numericOption(opts, "trust"),
      tension: numericOption(opts, "tension"),
      debt: numericOption(opts, "debt"),
      fear: numericOption(opts, "fear"),
      loyalty: numericOption(opts, "loyalty"),
      reason: opts.reason || "",
      classification: opts.classification,
      confidence: opts.confidence,
      visibility: opts.visibility
    }));
    const nextStore = replaceAvatarInStore(store, nextAvatar);
    await writeStore(nextStore);
    print(createAvatarMindAttachPack(nextAvatar, nextStore.avatars), opts);
    return;
  }

  if (cmd === "context-set") {
    const label = option(opts, "label", "title", "name") || opts._[1];
    if (!label) throw new Error("context-set requires --label <context-label>.");
    const nextAvatar = upsertContextMapping(avatar, dropUndefined({
      id: opts.id,
      contextId: opts["context-id"] || opts.contextId || opts.scene || opts.place || "",
      label,
      kind: opts.kind,
      avatarBelief: opts.belief || opts["avatar-belief"] || "",
      publicSummary: opts.summary || opts["public-summary"] || "",
      classification: opts.classification,
      confidence: opts.confidence,
      visibility: opts.visibility
    }));
    const nextStore = replaceAvatarInStore(store, nextAvatar);
    await writeStore(nextStore);
    print(createAvatarMindAttachPack(nextAvatar, nextStore.avatars), opts);
    return;
  }

  if (cmd === "heal-plan") {
    print({ avatarId: avatar.id, tasks: createHealingPlan(avatar) }, opts);
    return;
  }

  if (cmd === "heal-queue") {
    print(createHealingQueue(avatar), opts);
    return;
  }

  if (cmd === "heal-prompt") {
    const selector = option(opts, "job-id", "jobId", "slot-id", "slotId") || opts._[1] || null;
    const packet = createHealingPromptPacket(avatar, selector, {
      extraInstruction: opts.instruction || opts.extra
    });
    if (!packet) throw new Error(`No healing task found for ${selector || avatar.id}`);
    if (opts.out) {
      const out = path.resolve(opts.out);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
    }
    print(packet, opts);
    return;
  }

  if (cmd === "heal-attach") {
    const file = await resolveGeneratedFileOption(opts);
    const slotId = option(opts, "slot-id", "slotId");
    if (!file) throw new Error("heal-attach requires --file <generated-image>");
    if (!slotId) throw new Error("heal-attach requires --slot-id <avatar-slot>");
    const result = await attachGeneratedHealingAsset(store, avatar, {
      file,
      slotId,
      jobId: option(opts, "job-id", "jobId"),
      promptPacketPath: opts.prompt || opts["prompt-packet"],
      mediaDir: opts["media-dir"] || process.env.HAPA_MEDIA_DIR || DEFAULT_MEDIA_DIR
    });
    await writeStore(result.store);
    const finalSummary = { ...result.summary };

    if (opts["cache-thumbnails"] || opts.thumbnails || opts["with-thumbnails"]) {
      finalSummary.thumbnailCache = await backfillThumbnails();
    }

    if (opts["register-subscribers"] || opts.register || opts["sync-subscribers"]) {
      const freshStore = await readStore();
      const freshAvatar = freshStore.avatars.find((item) => item.id === result.summary.avatarId);
      const freshSlot = freshAvatar?.slots.find((item) => item.id === result.summary.slotId);
      const freshAsset = freshAvatar?.assets.find((item) => item.id === freshSlot?.assetId);
      if (!freshAvatar || !freshAsset) throw new Error(`Unable to register subscriber event for ${result.summary.avatarId}/${result.summary.slotId}`);
      finalSummary.subscriberEvent = await appendSubscriberRegistration("avatar.asset-attached", {
        avatar: freshAvatar,
        media: freshAsset,
        subscriberDir: opts["subscriber-dir"] || process.env.HAPA_SUBSCRIBER_DIR || DEFAULT_SUBSCRIBER_DIR
      });
      finalSummary.subscriberNote = "Registered directly to local Hapa subscriber outbox.";
    }

    print(finalSummary, opts);
    return;
  }

  if (cmd === "extract-assets") {
    const manifestPath = opts.manifest || opts.from;
    if (!manifestPath) throw new Error("extract-assets requires --manifest <extract-manifest.json>");
    const result = await extractAssetsFromManifest(store, avatar, {
      manifestPath,
      mediaDir: opts["media-dir"] || process.env.HAPA_MEDIA_DIR || DEFAULT_MEDIA_DIR,
      ffmpeg: opts.ffmpeg || process.env.FFMPEG || "ffmpeg",
      force: Boolean(opts.force),
      skipExisting: Boolean(opts["skip-existing"] || opts.skipExisting)
    });
    await writeStore(result.store);
    const finalSummary = { ...result.summary };

    if (opts["cache-thumbnails"] || opts.thumbnails || opts["with-thumbnails"]) {
      finalSummary.thumbnailCache = await backfillThumbnails();
    }

    if (opts["register-subscribers"] || opts.register || opts["sync-subscribers"]) {
      const freshStore = await readStore();
      const freshAvatar = freshStore.avatars.find((item) => item.id === result.summary.avatarId);
      if (!freshAvatar) throw new Error(`Unable to register extracted assets for ${result.summary.avatarId}`);
      finalSummary.subscriberEvents = [];
      for (const extracted of result.summary.extracted) {
        const media = freshAvatar.assets.find((item) => item.id === extracted.assetId);
        if (!media) continue;
        finalSummary.subscriberEvents.push(await appendSubscriberRegistration("avatar.asset-extracted", {
          avatar: freshAvatar,
          media,
          subscriberDir: opts["subscriber-dir"] || process.env.HAPA_SUBSCRIBER_DIR || DEFAULT_SUBSCRIBER_DIR
        }));
      }
      finalSummary.subscriberNote = "Registered extracted assets directly to local Hapa subscriber outbox.";
    }

    print(finalSummary, opts);
    return;
  }

  if (cmd === "register-asset") {
    const slotId = option(opts, "slot-id", "slotId");
    if (!slotId) throw new Error("register-asset requires --slot-id <avatar-slot>");
    const slot = avatar.slots.find((item) => item.id === slotId);
    if (!slot?.assetId) throw new Error(`Slot has no attached asset: ${slotId}`);
    const asset = avatar.assets.find((item) => item.id === slot.assetId);
    if (!asset) throw new Error(`Asset not found for slot: ${slotId}`);
    const subscriberEvent = await appendSubscriberRegistration("avatar.asset-attached", {
      avatar,
      media: asset,
      subscriberDir: opts["subscriber-dir"] || process.env.HAPA_SUBSCRIBER_DIR || DEFAULT_SUBSCRIBER_DIR
    });
    print({ avatarId: avatar.id, slotId, assetId: asset.id, subscriberEvent }, opts);
    return;
  }

  if (cmd === "promote-overfill") {
    const result = promoteOverfillForAvatar(avatar);
    if (!opts["dry-run"] && !opts.dryRun && result.promotions.length) {
      store.avatars = store.avatars.map((item) => (item.id === result.avatarId ? result.avatar : item));
      await writeStore(store);
    }
    const summary = {
      schemaVersion: "hapa.avatar-overfill-promotion.v1",
      dryRun: Boolean(opts["dry-run"] || opts.dryRun),
      avatarId: result.avatarId,
      primaryName: result.primaryName,
      before: result.before,
      after: result.after,
      promotions: result.promotions
    };
    if (!opts["dry-run"] && result.promotions.length && (opts["cache-thumbnails"] || opts.thumbnails || opts["with-thumbnails"])) {
      summary.thumbnailCache = await backfillThumbnails();
    }
    if (!opts["dry-run"] && result.promotions.length && (opts["register-subscribers"] || opts.register || opts["sync-subscribers"])) {
      const freshStore = await readStore();
      summary.subscriberEvents = await registerPromotions(freshStore, result.promotions, opts);
    }
    print(summary, opts);
    return;
  }

  if (cmd === "kanban") {
    print({ avatarId: avatar.id, lanes: createKanbanFromAudit(avatar) }, opts);
    return;
  }

  if (cmd === "export-card") {
    const out = path.resolve(opts.out || `${avatar.id}.avatar-card.json`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(avatar, null, 2)}\n`, "utf8");
    print({ exported: out, avatarId: avatar.id }, opts);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

async function attachGeneratedHealingAsset(store, avatar, options) {
  const before = auditAvatar(avatar);
  const source = path.resolve(options.file);
  const sourceStat = await stat(source);
  const mediaDir = path.resolve(options.mediaDir);
  await mkdir(mediaDir, { recursive: true });

  const slot = avatar.slots.find((item) => item.id === options.slotId);
  if (!slot) throw new Error(`Slot not found: ${options.slotId}`);
  const ext = path.extname(source) || ".png";
  const baseName = slugForFile(`${avatar.id}-${slot.requirementId}-${options.slotId}-healed`);
  const destName = `${baseName}-${Date.now()}${ext}`;
  const dest = path.join(mediaDir, destName);
  await copyFile(source, dest);

  const asset = {
    id: `healed-${avatar.id}-${options.slotId}-${Date.now()}`,
    name: path.basename(source, ext),
    uri: `/media/${destName}`,
    type: inferAssetKind(destName),
    requirementId: slot.requirementId,
    tags: ["generated", "healed", "needs-review", "reference", "gpt-image-2"],
    source: "hapa-avatar-library-healer",
    notes: `Generated through Codex GPT Image 2 for ${options.slotId}.`,
    metadata: {
      originalFileName: path.basename(source),
      sourcePath: source,
      storagePath: dest,
      sizeBytes: sourceStat.size,
      generationModel: "gpt-image-2",
      generationChannel: "codex-imagegen",
      healingJobId: options.jobId || `heal-${avatar.id}-${options.slotId}`,
      promptPacketPath: options.promptPacketPath || null
    },
    processing: {
      status: "healed",
      attachedToCard: true,
      healingJobId: options.jobId || `heal-${avatar.id}-${options.slotId}`,
      needsHumanReview: true
    }
  };

  const nextAvatar = assignAssetToSlot(avatar, asset, options.slotId);
  const nextStore = {
    ...store,
    avatars: store.avatars.map((item) => (item.id === nextAvatar.id ? nextAvatar : item))
  };
  const after = auditAvatar(nextAvatar);

  return {
    store: nextStore,
    summary: {
      avatarId: nextAvatar.id,
      slotId: options.slotId,
      assetId: asset.id,
      source,
      storedAs: dest,
      before,
      after,
      subscriberNote: "Use the API PUT /api/avatars/:id or app sync to broadcast this updated card to hapa-atlas and second-brain."
    }
  };
}

async function extractAssetsFromManifest(store, avatar, options) {
  const before = auditAvatar(avatar);
  const manifestPath = path.resolve(options.manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.avatarId && manifest.avatarId !== avatar.id) {
    throw new Error(`Manifest avatarId ${manifest.avatarId} does not match ${avatar.id}`);
  }
  if (!Array.isArray(manifest.items) || !manifest.items.length) {
    throw new Error("Extraction manifest must include a non-empty items array.");
  }

  const mediaDir = path.resolve(options.mediaDir);
  await mkdir(mediaDir, { recursive: true });

  let nextAvatar = normalizeAvatarCard(avatar);
  const source = resolveManifestSource(nextAvatar, manifest);
  const extracted = [];
  const skippedExisting = [];

  for (const [index, item] of manifest.items.entries()) {
    const slotId = item.slotId;
    const slot = nextAvatar.slots.find((candidate) => candidate.id === slotId);
    if (!slot) throw new Error(`Slot not found: ${slotId}`);
    if (slot.assetId && !options.force) {
      const existingAsset = nextAvatar.assets.find((candidate) => candidate.id === slot.assetId);
      const existingManifestPath = existingAsset?.metadata?.extractionManifestPath
        ? path.resolve(existingAsset.metadata.extractionManifestPath)
        : null;
      if (existingManifestPath === manifestPath) {
        skippedExisting.push({
          slotId,
          assetId: existingAsset.id,
          name: existingAsset.name,
          reason: "already-attached-from-manifest"
        });
        continue;
      }
      if (options.skipExisting) {
        skippedExisting.push({
          slotId,
          assetId: existingAsset?.id || slot.assetId,
          name: existingAsset?.name || null,
          reason: "slot-already-filled"
        });
        continue;
      }
      throw new Error(`Slot already has an asset: ${slotId}. Pass --force to replace it or --skip-existing to resume without replacing.`);
    }
    const crop = normalizeCrop(item.crop, index);
    const itemName = item.name || item.label || slotId;
    const destName = `${slugForFile(`${avatar.id}-${slot.requirementId}-${slot.id}-${itemName}-extracted`)}-${Date.now()}-${index + 1}.png`;
    const dest = path.join(mediaDir, destName);

    await execFileAsync(options.ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      source.path,
      "-vf",
      `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
      "-frames:v",
      "1",
      dest
    ], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024 * 4
    });

    const destStat = await stat(dest);
    const now = new Date().toISOString();
    const tags = Array.from(new Set([
      "extracted",
      "healed",
      "needs-review",
      "reference",
      "kit-item",
      ...(Array.isArray(item.tags) ? item.tags : [])
    ].filter(Boolean)));
    const asset = {
      id: `extracted-${avatar.id}-${slotId}-${Date.now()}-${index + 1}`,
      name: itemName,
      uri: `/media/${destName}`,
      type: inferAssetKind(destName),
      requirementId: slot.requirementId,
      tags,
      source: "hapa-avatar-library-healer.extract-assets",
      notes: item.notes || `Extracted from ${source.slotId || source.assetId || path.basename(source.path)} for ${slotId}.`,
      metadata: {
        originalFileName: path.basename(dest),
        sourcePath: source.path,
        sourceSlotId: source.slotId || null,
        sourceAssetId: source.assetId || null,
        storagePath: dest,
        sizeBytes: destStat.size,
        extractionManifestPath: manifestPath,
        extractionCrop: crop,
        extractionIndex: index + 1,
        derivedFrom: manifest.derivedFrom || "kit-sheet-crop",
        storage: {
          kind: "local-file",
          fileName: destName,
          path: dest
        }
      },
      processing: {
        status: "healed",
        attachedToCard: true,
        healingJobId: item.jobId || `extract-${avatar.id}-${slotId}`,
        extractionManifestPath: manifestPath,
        needsHumanReview: true,
        processedAt: now
      },
      createdAt: now
    };

    nextAvatar = assignAssetToSlot(nextAvatar, asset, slotId);
    extracted.push({
      slotId,
      assetId: asset.id,
      name: asset.name,
      tags,
      source: source.path,
      storedAs: dest,
      crop
    });
  }

  const nextStore = {
    ...store,
    avatars: store.avatars.map((item) => (item.id === nextAvatar.id ? nextAvatar : item))
  };

  return {
    store: nextStore,
    summary: {
      schemaVersion: "hapa.avatar-asset-extraction.v1",
      avatarId: nextAvatar.id,
      primaryName: nextAvatar.primaryName,
      manifestPath,
      source,
      extracted,
      skippedExisting,
      before,
      after: auditAvatar(nextAvatar)
    }
  };
}

function resolveManifestSource(avatar, manifest) {
  if (manifest.sourcePath) {
    return { path: path.resolve(manifest.sourcePath), slotId: manifest.sourceSlotId || null, assetId: manifest.sourceAssetId || null };
  }
  const slotId = manifest.sourceSlotId || manifest.sourceSlot;
  const assetId = manifest.sourceAssetId || (slotId ? avatar.slots.find((slot) => slot.id === slotId)?.assetId : null);
  const asset = avatar.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error(`Unable to resolve extraction source asset from ${slotId || assetId || "manifest"}`);
  const sourcePath = asset.storage?.path
    || asset.metadata?.storage?.path
    || asset.metadata?.storagePath
    || (asset.uri?.startsWith("/media/") ? path.join(DEFAULT_MEDIA_DIR, asset.uri.replace(/^\/media\//, "")) : null);
  if (!sourcePath) throw new Error(`Source asset has no local path: ${asset.id}`);
  return {
    path: path.resolve(sourcePath),
    slotId: slotId || asset.processing?.slotId || null,
    assetId: asset.id,
    name: asset.name || null
  };
}

function normalizeCrop(crop, index) {
  if (!crop || typeof crop !== "object") throw new Error(`Manifest item ${index + 1} is missing crop.`);
  const normalized = {
    x: Number(crop.x),
    y: Number(crop.y),
    width: Number(crop.width ?? crop.w),
    height: Number(crop.height ?? crop.h)
  };
  if (!Object.values(normalized).every((value) => Number.isFinite(value) && value >= 0) || normalized.width <= 0 || normalized.height <= 0) {
    throw new Error(`Invalid crop for manifest item ${index + 1}: ${JSON.stringify(crop)}`);
  }
  return {
    x: Math.round(normalized.x),
    y: Math.round(normalized.y),
    width: Math.round(normalized.width),
    height: Math.round(normalized.height)
  };
}

function createLibraryHealingQueue(store, opts = {}) {
  const includePrompts = Boolean(opts["with-prompts"] || opts.prompts);
  const limit = opts.limit ? Math.max(1, Number(opts.limit)) : null;
  const queues = store.avatars.map((avatar) => createHealingQueue(avatar));
  const jobs = queues
    .flatMap((queue) => queue.jobs.map((job) => ({
      avatarId: queue.avatarCardId,
      avatarName: queue.primaryName,
      percent: queue.completeness.percent,
      missing: queue.completeness.missing,
      ...job,
      promptPacket: includePrompts ? job.promptPacket : undefined
    })))
    .sort((a, b) => {
      const priorityDelta = priorityScore(a.priority) - priorityScore(b.priority);
      if (priorityDelta) return priorityDelta;
      const percentDelta = a.percent - b.percent;
      if (percentDelta) return percentDelta;
      return a.rank - b.rank;
    });
  const listedJobs = limit ? jobs.slice(0, limit) : jobs;
  const totalMissing = queues.reduce((sum, queue) => sum + queue.completeness.missing, 0);

  return {
    schemaVersion: "hapa.avatar-library-healing-queue.v1",
    status: totalMissing ? "queued" : "complete",
    avatarCount: queues.length,
    completeAvatars: queues.filter((queue) => queue.completeness.complete).length,
    totalMissing,
    totalJobs: jobs.length,
    listedJobs: listedJobs.length,
    model: "gpt-image-2",
    codexTool: "image_gen",
    queues: queues.map((queue) => ({
      avatarId: queue.avatarCardId,
      primaryName: queue.primaryName,
      percent: queue.completeness.percent,
      missing: queue.completeness.missing,
      jobs: queue.total,
      highPriority: queue.highPriority,
      status: queue.status
    })),
    jobs: listedJobs,
    generatedAt: new Date().toISOString()
  };
}

function priorityScore(priority) {
  if (priority === "high") return 0;
  if (priority === "normal") return 1;
  return 2;
}

async function readStore() {
  const store = JSON.parse(await readFile(storePath, "utf8"));
  return {
    ...store,
    avatars: (store.avatars || []).map((avatar) => normalizeAvatarCard(avatar))
  };
}

async function writeStore(store) {
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function replaceAvatarInStore(store, nextAvatar) {
  return {
    ...store,
    avatars: store.avatars.map((item) => (item.id === nextAvatar.id ? nextAvatar : item))
  };
}

function numericOption(opts, name) {
  if (opts[name] === undefined) return undefined;
  const value = Number(opts[name]);
  return Number.isFinite(value) ? value : undefined;
}

function dropUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

async function backfillThumbnails() {
  const { stdout } = await execFileAsync(process.execPath, [path.join(ROOT, "scripts/backfill-thumbnails.mjs")], {
    cwd: ROOT,
    maxBuffer: 1024 * 1024 * 16
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return { raw: stdout.trim() };
  }
}

async function resolveGeneratedFileOption(opts) {
  const directFile = option(opts, "file", "input", "image");
  if (directFile) return directFile;
  if (!opts["latest-generated"] && !opts.latestGenerated) return null;

  const generatedDir = path.resolve(opts["generated-dir"] || process.env.CODEX_GENERATED_IMAGES_DIR || DEFAULT_GENERATED_DIR);
  const entries = await readdir(generatedDir, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map(async (entry) => {
      const fullPath = path.join(generatedDir, entry.name);
      const entryStat = await stat(fullPath);
      return { fullPath, mtimeMs: entryStat.mtimeMs };
    }));
  const latest = candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!latest) throw new Error(`No generated images found in ${generatedDir}`);
  return latest.fullPath;
}

async function appendSubscriberRegistration(action, { avatar = null, media = null, subscriberDir = DEFAULT_SUBSCRIBER_DIR } = {}) {
  await mkdir(subscriberDir, { recursive: true });
  const occurredAt = new Date().toISOString();
  const event = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source: "hapa-avatar-builder",
    action,
    occurredAt,
    subscribers: SUBSCRIBERS,
    avatar: avatar ? compactAvatarRegistration(avatar) : null,
    media: media ? compactMediaRegistration(media) : null,
    world: null
  };

  await appendFile(path.join(subscriberDir, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await Promise.all(SUBSCRIBERS.map((subscriber) => appendFile(
    path.join(subscriberDir, `${subscriber}.ndjson`),
    `${JSON.stringify({ ...event, subscriber, status: "queued" })}\n`,
    "utf8"
  )));
  await writeFile(path.join(subscriberDir, "latest.json"), `${JSON.stringify(event, null, 2)}\n`, "utf8");
  await writeFile(path.join(subscriberDir, "latest-summary.json"), `${JSON.stringify(summarizeSubscriberEvent(event), null, 2)}\n`, "utf8");
  return summarizeSubscriberEvent(event);
}

async function registerPromotions(store, promotions, opts) {
  const events = [];
  for (const promotion of promotions) {
    const avatar = store.avatars.find((item) => item.id === promotion.avatarId);
    const media = avatar?.assets.find((item) => item.id === promotion.assetId);
    if (!avatar || !media) continue;
    events.push(await appendSubscriberRegistration("avatar.asset-promoted-from-overfill", {
      avatar,
      media,
      subscriberDir: opts["subscriber-dir"] || process.env.HAPA_SUBSCRIBER_DIR || DEFAULT_SUBSCRIBER_DIR
    }));
  }
  return events;
}

async function promoteOverfillInStore(store, opts) {
  const results = store.avatars.map((avatar) => promoteOverfillForAvatar(avatar));
  const promotions = results.flatMap((result) => result.promotions);
  const nextStore = {
    ...store,
    avatars: store.avatars.map((avatar) => {
      const result = results.find((item) => item.avatarId === avatar.id);
      return result?.promotions.length ? result.avatar : avatar;
    })
  };
  return {
    store: nextStore,
    summary: {
      schemaVersion: "hapa.avatar-library-overfill-promotion.v1",
      dryRun: Boolean(opts["dry-run"] || opts.dryRun),
      avatarCount: store.avatars.length,
      promotedCount: promotions.length,
      touchedAvatars: results
        .filter((result) => result.promotions.length)
        .map((result) => ({
          avatarId: result.avatarId,
          primaryName: result.primaryName,
          before: result.before,
          after: result.after,
          promotedCount: result.promotions.length
        })),
      promotions
    }
  };
}

function promoteOverfillForAvatar(avatar) {
  let nextAvatar = normalizeAvatarCard(avatar);
  const before = auditAvatar(nextAvatar);
  const promotions = [];

  for (const requirement of before.byRequirement) {
    const missingSlots = nextAvatar.slots.filter((slot) =>
      slot.requirementId === requirement.id && slot.required !== false && !slot.assetId
    );
    const overfillSlots = nextAvatar.slots.filter((slot) =>
      slot.requirementId === requirement.id && slot.required === false && slot.assetId
    );
    const count = Math.min(missingSlots.length, overfillSlots.length);
    for (let index = 0; index < count; index += 1) {
      const sourceSlot = overfillSlots[index];
      const targetSlot = missingSlots[index];
      const asset = nextAvatar.assets.find((item) => item.id === sourceSlot.assetId);
      if (!asset) continue;
      const promotedAt = new Date().toISOString();
      const clearedAvatar = {
        ...nextAvatar,
        slots: nextAvatar.slots
          .map((slot) => (slot.assetId === asset.id ? { ...slot, assetId: null } : slot))
          .filter((slot) => !(slot.required === false && !slot.assetId)),
        assets: nextAvatar.assets.map((item) => item.id === asset.id ? {
          ...item,
          processing: {
            ...(item.processing || {}),
            attachedToCard: false,
            slotId: null
          }
        } : item)
      };
      nextAvatar = assignAssetToSlot(clearedAvatar, {
        ...asset,
        requirementId: requirement.id,
        metadata: {
          ...(asset.metadata || {}),
          promotedFromOverfillSlotId: sourceSlot.id,
          promotedToSlotId: targetSlot.id,
          promotedAt
        },
        processing: {
          ...(asset.processing || {}),
          attachedToCard: false,
          slotId: null,
          promotedFromOverfillSlotId: sourceSlot.id,
          promotedToSlotId: targetSlot.id
        }
      }, targetSlot.id);
      promotions.push({
        avatarId: nextAvatar.id,
        primaryName: nextAvatar.primaryName,
        requirementId: requirement.id,
        assetId: asset.id,
        assetName: asset.name,
        fromSlotId: sourceSlot.id,
        toSlotId: targetSlot.id
      });
    }
  }

  return {
    avatarId: nextAvatar.id,
    primaryName: nextAvatar.primaryName,
    before,
    after: auditAvatar(nextAvatar),
    promotions,
    avatar: nextAvatar
  };
}

function compactAvatarRegistration(avatar) {
  const normalized = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalized);
  const attachPack = createAttachPack(normalized, "hapa-subscriber");
  const media = (normalized.assets || []).map(compactMediaRegistration);
  return {
    atlasEntityId: `hapa-avatar:${normalized.id}`,
    secondBrainPathHint: `avatars/${normalized.id}.md`,
    id: normalized.id,
    primaryName: normalized.primaryName,
    names: normalized.names?.map((item) => item.name) || [normalized.primaryName],
    grade: audit.grade,
    percent: audit.percent,
    required: audit.required,
    filled: audit.filled,
    missing: audit.missing,
    updatedAt: normalized.updatedAt,
    mind: {
      endpoint: `/api/avatars/${normalized.id}/mind`,
      counts: createAvatarMindAttachPack(normalized).summary.counts,
      updatedAt: normalized.mind?.updatedAt || normalized.updatedAt
    },
    attachPack: {
      schemaVersion: attachPack.schemaVersion,
      avatarCardId: attachPack.avatarCardId,
      target: attachPack.target,
      grade: attachPack.completeness?.grade || audit.grade,
      endpoint: `/api/avatars/${normalized.id}/attach?target=hapa-subscriber`,
      baseReferenceCount: attachPack.baseReferences.length,
      modelReferenceCount: attachPack.modelReferences.length,
      videoBranchCount: attachPack.videoBranches.length,
      videoLinkCount: attachPack.videoLinks.length,
      videoMatchQueueCount: attachPack.videoMatchQueue.length
    },
    media,
    relationships: media.map((asset) => ({
      from: `hapa-avatar:${normalized.id}`,
      type: "HAS_MEDIA_ASSET",
      to: asset.atlasEntityId,
      role: asset.requirementId || "media"
    }))
  };
}

function compactMediaRegistration(media) {
  return {
    atlasEntityId: `hapa-media:${media.id || slugForFile(media.name || media.uri || "asset")}`,
    id: media.id || null,
    name: media.name || null,
    type: media.type || media.mimeType || null,
    uri: media.uri || null,
    requirementId: media.requirementId || media.metadata?.sectionRequirementId || null,
    tags: media.tags || [],
    sizeBytes: media.sizeBytes || media.metadata?.sizeBytes || null,
    width: media.metadata?.width || null,
    height: media.metadata?.height || null,
    thumbnail: media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null,
    storage: media.storage || media.metadata?.storage || null,
    updatedAt: media.updatedAt || media.processing?.attachedAt || media.processing?.processedAt || null
  };
}

function summarizeSubscriberEvent(event) {
  return {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    source: event.source,
    action: event.action,
    occurredAt: event.occurredAt,
    subscribers: event.subscribers || [],
    avatar: event.avatar ? {
      atlasEntityId: event.avatar.atlasEntityId,
      secondBrainPathHint: event.avatar.secondBrainPathHint,
      id: event.avatar.id,
      primaryName: event.avatar.primaryName,
      grade: event.avatar.grade,
      percent: event.avatar.percent,
      required: event.avatar.required,
      filled: event.avatar.filled,
      missing: event.avatar.missing,
      mediaCount: event.avatar.media?.length || 0,
      relationshipCount: event.avatar.relationships?.length || 0,
      mindEndpoint: event.avatar.mind?.endpoint || `/api/avatars/${event.avatar.id}/mind`,
      mindCounts: event.avatar.mind?.counts || null,
      attachPackEndpoint: event.avatar.attachPack?.endpoint || `/api/avatars/${event.avatar.id}/attach?target=hapa-subscriber`
    } : null,
    media: event.media ? {
      atlasEntityId: event.media.atlasEntityId,
      id: event.media.id,
      name: event.media.name,
      type: event.media.type,
      requirementId: event.media.requirementId,
      uri: event.media.uri
    } : null,
    world: null
  };
}

function parseOptions(args) {
  const opts = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      opts[key] = true;
    } else {
      opts[key] = next;
      index += 1;
    }
  }
  return opts;
}

function collectPositionals(opts) {
  return opts._.filter(Boolean);
}

function option(opts, ...names) {
  for (const name of names) {
    if (opts[name] !== undefined) return opts[name];
  }
  return null;
}

function slugForFile(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function print(payload, opts) {
  if (opts.json || typeof payload !== "object") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      console.log(`${item.id}\t${item.primaryName}\t${item.audit.percent}%\t${item.audit.filled}/${item.audit.required}`);
    }
    return;
  }

  if (payload.complete !== undefined) {
    console.log(`${payload.primaryName} (${payload.avatarId})`);
    console.log(`Completeness: ${payload.percent}% | ${payload.filled}/${payload.required} | level ${payload.level} | ${payload.grade}`);
    if (payload.missingRequirements?.length) {
      console.log("Missing:");
      for (const item of payload.missingRequirements) {
        console.log(`- ${item.label}: ${item.missing}`);
      }
    }
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
  console.log(`Hapa Avatar Builder CLI

Commands:
  list [--json]
  scaffold Red Reaper --id red-reaper [--primary Red] [--json]
  audit <avatar-id> [--json]
  attach <avatar-id> [--target comic|video|agent] [--json]
  mind <avatar-id> [--json]
  mind-set <avatar-id> [--identity "..."] [--wants "..."] [--fears "..."] [--misunderstands "..."] [--will-not-say "..."] [--carried-forward "..."] [--json]
  mind-fact-set <avatar-id> --label "Fact" --value "..." [--classification hard_canon] [--confidence hard] [--visibility private] [--json]
  relationship-set <avatar-id> --target <avatar-id-or-name> [--label ally] [--trust 2] [--tension -1] [--debt 0] [--fear 0] [--loyalty 3] [--reason "..."] [--json]
  context-set <avatar-id> --label "Scene name" [--kind scene] [--belief "..."] [--summary "..."] [--classification perspective] [--json]
  heal-plan <avatar-id> [--json]
  heal-queue <avatar-id> [--json]
  heal-queue --all [--limit 25] [--with-prompts] [--json]
  heal-prompt <avatar-id> [--slot-id <slot>] [--out ./prompt.json] [--json]
  heal-attach <avatar-id> --slot-id <slot> --file ./generated.png [--latest-generated] [--prompt ./prompt.json] [--cache-thumbnails] [--register-subscribers] [--json]
  extract-assets <avatar-id> --manifest ./extract.json [--skip-existing] [--cache-thumbnails] [--register-subscribers] [--json]
  register-asset <avatar-id> --slot-id <slot> [--json]
  promote-overfill <avatar-id>|--all [--dry-run] [--cache-thumbnails] [--register-subscribers] [--json]
  kanban <avatar-id> [--json]
  export-card <avatar-id> --out ./Red.avatar-card.json

Options:
  --store <path>  Use an alternate avatar-store.json
  --media-dir <path>  Use an alternate media directory for generated images
  --generated-dir <path>  Use an alternate Codex generated-images directory
  --json          Print machine-readable JSON
`);
}
