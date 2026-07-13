#!/usr/bin/env node
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBuilderExpandedDirectorCandidates,
  hasHapaDevProtoOrigin,
} from "../src/domain/builder-direction-candidates.js";
import {
  SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID,
  WIDE_COVERAGE_DENSITY_PROFILES,
  WIDE_COVERAGE_VARIATION_SET_ID,
  buildBalancedDirectorCandidates,
  buildDirectorDensityPlan,
  recastBalancedEchoDirectorProject,
} from "../src/domain/echo-media-recast.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(DATA_DIR, "media");
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const VARIANTS_DIR = path.join(DATA_DIR, "music-video-project-variants");
const VARIANT_INDEX_PATH = path.join(VARIANTS_DIR, "index.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const MEDIA_LIBRARY_PATH = path.join(DATA_DIR, "media-library.json");
const TECHNICAL_CACHE_PATH = path.join(ROOT, "artifacts/echo-media-affordances/technical-cache-v2.json");
const OUTPUT_DIR = path.join(ROOT, "artifacts/builder-expanded-direction");
const HASH_CACHE_PATH = path.join(OUTPUT_DIR, "hash-cache-v1.json");
const REPORTS_DIR = path.join(DATA_DIR, "merge-reports");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const WIDE_CUTS = args.has("--wide-cuts");
const RUN_STARTED_AT = new Date().toISOString();
const RUN_ID = `builder-expanded-direction-${RUN_STARTED_AT.replace(/[:.]/g, "-")}`;
const VARIANT_TITLE = "Scroll + FAL + Builder Scenes/Avatars · Balanced Recast";
const WIDE_VARIATION_SET = Object.freeze({
  id: WIDE_COVERAGE_VARIATION_SET_ID,
  label: "Wide Coverage Director Passes",
  batchId: "wide-coverage-density-2026-07-v1",
});
const WIDE_SOURCE_PATTERN = Object.freeze([
  "avatar", "avatar", "scroll", "avatar", "avatar",
  "scene", "avatar", "avatar", "scroll", "avatar",
  "avatar", "scene", "avatar", "avatar", "scroll",
  "avatar", "avatar", "scene", "avatar", "scroll",
]);
const WIDE_CUTS_CONFIG = Object.freeze(WIDE_COVERAGE_DENSITY_PROFILES.map((profile) => Object.freeze({
  ...profile,
  variantId: `wide-coverage-${profile.id}-v1`,
  title: `Wide Coverage · ${profile.label} (${Math.round(profile.targetVideoRatio * 100)}% video)`,
})));
const COVERAGE_BASELINE_VARIANT_IDS = Object.freeze([
  "scroll-fal-authored-v1",
  SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID,
]);

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, filePath);
}

async function mapLimit(values, limit, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return output;
}

function mediaRelativePath(uri = "") {
  const encoded = String(uri).replace(/^\/media\//, "").split(/[?#]/)[0];
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

async function discoverMediaFiles(directory = MEDIA_DIR, relative = "") {
  const rows = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [key, value] of await discoverMediaFiles(absolute, nextRelative)) rows.set(key, value);
      continue;
    }
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile() || info.size <= 0) continue;
    rows.set(nextRelative, { path: absolute, sizeBytes: info.size, mtimeMs: info.mtimeMs });
  }
  return rows;
}

function technicalCacheByMediaName(cache = {}) {
  const rows = new Map();
  for (const [sourcePath, value] of Object.entries(cache)) {
    const technical = value?.technical || value;
    const normalized = String(sourcePath).replaceAll("\\", "/");
    const marker = "/data/media/";
    const markerIndex = normalized.lastIndexOf(marker);
    if (markerIndex >= 0) rows.set(normalized.slice(markerIndex + marker.length), technical);
    rows.set(path.basename(normalized), technical);
  }
  return rows;
}

async function materializeContentHashes(candidates, mediaFiles, hashCache) {
  const missing = candidates.filter((candidate) => !/^[a-f0-9]{64}$/.test(String(candidate.sha256 || "")));
  let processed = 0;
  let diskHashed = 0;
  let cacheHits = 0;
  const enrichedMissing = await mapLimit(missing, 4, async (candidate) => {
    const relativePath = mediaRelativePath(candidate.uri);
    const file = mediaFiles.get(relativePath);
    if (!file) throw new Error(`Candidate media is not available locally: ${candidate.uri}`);
    const cached = hashCache.entries?.[relativePath];
    let sha256 = cached?.sizeBytes === file.sizeBytes
      && Math.abs(Number(cached?.mtimeMs || 0) - file.mtimeMs) < 1
      && /^[a-f0-9]{64}$/.test(String(cached?.sha256 || ""))
      ? cached.sha256
      : "";
    if (!sha256) {
      sha256 = await sha256File(file.path);
      diskHashed += 1;
    } else {
      cacheHits += 1;
    }
    hashCache.entries[relativePath] = {
      sizeBytes: file.sizeBytes,
      mtimeMs: file.mtimeMs,
      sha256,
      verifiedAt: RUN_STARTED_AT,
    };
    processed += 1;
    if (processed % 50 === 0 || processed === missing.length) {
      console.error(`[builder-expanded-direction] verified ${processed}/${missing.length} candidate identities (${cacheHits} cache hits, ${diskHashed} file hashes)`);
    }
    return {
      ...candidate,
      sha256,
      technicalIdentity: `sha256:${sha256}`,
      mediaLibraryId: `hapa-media:sha256:${sha256}`,
      technical: { ...candidate.technical, identityBasis: "sha256" },
    };
  });
  const byId = new Map(enrichedMissing.map((candidate) => [candidate.id, candidate]));
  return {
    candidates: candidates.map((candidate) => {
      const enriched = byId.get(candidate.id) || candidate;
      const sha256 = String(enriched.sha256 || "");
      return sha256 ? {
        ...enriched,
        technicalIdentity: `sha256:${sha256}`,
        mediaLibraryId: `hapa-media:sha256:${sha256}`,
      } : enriched;
    }),
    newlyMaterialized: diskHashed,
    cacheHits,
  };
}

function dedupeByContent(candidates = []) {
  const rows = new Map();
  for (const candidate of candidates) {
    const identity = candidate.technicalIdentity || (candidate.sha256 ? `sha256:${candidate.sha256}` : `uri:${candidate.uri}`);
    const current = rows.get(identity);
    const alias = {
      cardId: candidate.cardId,
      cardKind: candidate.cardKind,
      cardRef: candidate.cardRef,
      cardTitle: candidate.cardTitle,
      ownerId: candidate.ownerId,
      ownerTitle: candidate.ownerTitle,
      sourceGroup: candidate.sourceGroup,
    };
    if (!current) {
      rows.set(identity, { ...candidate, cardAliases: [alias] });
      continue;
    }
    current.cardAliases = [...current.cardAliases, alias].filter((row, index, all) => (
      all.findIndex((item) => item.cardId === row.cardId && item.sourceGroup === row.sourceGroup) === index
    ));
  }
  return [...rows.values()];
}

function directionVariantFingerprint(variant = {}) {
  return sha256Bytes(Buffer.from(JSON.stringify({
    id: variant.id,
    parentProjectSha256: variant.parent?.projectSha256 || "",
    seed: variant.seed || "",
    variationSet: variant.variationSet || {},
    cut: variant.cut || {},
    densityProfile: variant.densityProfile || {},
    densityPlan: variant.densityPlan || {},
    coveragePass: variant.coveragePass || {},
    sourcePolicy: variant.sourcePolicy || {},
    timeline: variant.timeline || [],
    visualizerTimeline: variant.visualizer_timeline || [],
    hyperframeScript: variant.hyperframe_script || "",
  })));
}

function shotTechnicalIdentity(shot = {}) {
  const hash = String(shot.media_contract?.contentHash || shot.decision_evidence?.contentHash || "").toLowerCase();
  return String(
    shot.media_technical_identity
      || shot.decision_evidence?.technicalIdentity
      || (hash ? `sha256:${hash}` : "")
      || shot.media_id
      || shot.runtime_media_uri
      || shot.media_uri
      || "",
  ).toLowerCase();
}

function shotCardId(shot = {}) {
  return String(shot.media_card_id || shot.decision_evidence?.sourceEvidence?.card?.id || "");
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map.set(key, Number(map.get(key) || 0) + amount);
}

async function seedCoverageLedgers(songIds = []) {
  const usageCounts = new Map();
  const cardUsageCounts = new Map();
  let variantsRead = 0;
  let placementsRead = 0;
  for (const songId of songIds) {
    for (const variantId of COVERAGE_BASELINE_VARIANT_IDS) {
      const variantPath = path.join(VARIANTS_DIR, songId, `${variantId}.json`);
      const variant = await readJson(variantPath, null).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (!variant) continue;
      variantsRead += 1;
      for (const shot of list(variant.timeline)) {
        if (shot.media_id === "none" || !shot.media_uri) continue;
        increment(usageCounts, shotTechnicalIdentity(shot));
        increment(cardUsageCounts, shotCardId(shot));
        placementsRead += 1;
      }
    }
  }
  return { usageCounts, cardUsageCounts, variantsRead, placementsRead };
}

function usageSummary(candidates = [], usageCounts = new Map()) {
  return Object.fromEntries(["scroll", "scene", "avatar"].map((sourceGroup) => {
    const group = candidates.filter((candidate) => candidate.sourceGroup === sourceGroup);
    const counts = group.map((candidate) => Number(usageCounts.get(candidate.technicalIdentity) || 0));
    return [sourceGroup, {
      eligible: group.length,
      used: counts.filter((count) => count > 0).length,
      unused: counts.filter((count) => count === 0).length,
      minimumUses: counts.length ? Math.min(...counts) : 0,
      maximumUses: counts.length ? Math.max(...counts) : 0,
      totalUses: counts.reduce((sum, count) => sum + count, 0),
    }];
  }));
}

function longestSourceStreak(selections = []) {
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const selection of selections) {
    if (selection.sourceGroup === previous) current += 1;
    else current = 1;
    previous = selection.sourceGroup;
    longest = Math.max(longest, current);
  }
  return longest;
}

function upsertById(existing = [], incoming = []) {
  const ids = new Set(incoming.map((row) => row.id));
  return [...incoming, ...existing.filter((row) => !ids.has(row.id))];
}

function validateCardReferences(candidates, itemCardIds, sceneIds, avatarIds) {
  const unresolved = candidates.filter((candidate) => {
    if (candidate.cardKind === "item") return !itemCardIds.has(candidate.cardId);
    if (candidate.cardKind === "scene") return !sceneIds.has(candidate.cardId);
    if (candidate.cardKind === "avatar") return !avatarIds.has(candidate.cardId);
    return true;
  });
  if (unresolved.length) {
    throw new Error(`Unresolved candidate Card references: ${unresolved.slice(0, 12).map((row) => `${row.sourceGroup}:${row.cardId}`).join(", ")}`);
  }
}

async function runWideCoverageCutPass({
  candidates,
  extraction,
  hashed,
  hashCache,
  existingIndex,
  projectFiles,
  candidatesByGroup,
}) {
  const targetVariantIds = new Set(WIDE_CUTS_CONFIG.map((profile) => profile.variantId));
  const projectRows = [];
  const projectHashesBefore = new Map();
  for (const fileName of projectFiles) {
    const filePath = path.join(PROJECTS_DIR, fileName);
    const bytes = await readFile(filePath);
    const parentSha256 = sha256Bytes(bytes);
    projectHashesBefore.set(fileName, parentSha256);
    const payload = JSON.parse(bytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    if (!project?.song_id) continue;
    const densityPlan = buildDirectorDensityPlan(project, {
      seed: `${project.song_id}:${WIDE_COVERAGE_VARIATION_SET_ID}:density-plan`,
      profiles: WIDE_CUTS_CONFIG,
    });
    const densityPlanHash = sha256Bytes(Buffer.from(JSON.stringify({
      seed: densityPlan.seed,
      ordering: densityPlan.ordering,
      profiles: densityPlan.profiles.map((profile) => ({
        id: profile.id,
        targetVideoRatio: profile.targetVideoRatio,
        mediaShotIndices: profile.mediaShotIndices,
      })),
    })));
    projectRows.push({ fileName, parentSha256, project, densityPlan, densityPlanHash });
  }

  const immutableVariantHashes = new Map();
  for (const row of list(existingIndex.variants)) {
    if (targetVariantIds.has(row.variantId) || !row.relativePath) continue;
    const filePath = path.join(VARIANTS_DIR, row.relativePath);
    const bytes = await readFile(filePath).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (bytes) immutableVariantHashes.set(filePath, sha256Bytes(bytes));
  }

  const ledgers = await seedCoverageLedgers(projectRows.map((row) => row.project.song_id));
  const baselineUsage = new Map(ledgers.usageCounts);
  const baselineUsageSummary = usageSummary(candidates, baselineUsage);
  const variants = [];
  for (const profile of WIDE_CUTS_CONFIG) {
    for (const row of projectRows) {
      const planProfile = row.densityPlan.profiles.find((item) => item.id === profile.id);
      if (!planProfile) throw new Error(`Missing ${profile.id} density plan for ${row.project.song_id}.`);
      const variant = recastBalancedEchoDirectorProject(row.project, candidates, {
        variantId: profile.variantId,
        title: profile.title,
        seed: `${row.project.song_id}:${profile.variantId}:media-recast`,
        parentProjectHash: row.parentSha256,
        createdAt: RUN_STARTED_AT,
        variationSet: WIDE_VARIATION_SET,
        cut: { ordinal: profile.ordinal, label: profile.label },
        densityProfile: profile,
        densityPlanSeed: row.densityPlan.seed,
        densityPlanHash: row.densityPlanHash,
        mediaShotIndices: planProfile.mediaShotIndices,
        coveragePass: {
          strategy: "album-least-used-first-with-card-fairness",
          ordinal: profile.ordinal,
          baselineVariantIds: COVERAGE_BASELINE_VARIANT_IDS,
          recentCardWindow: 6,
          sourceWeights: { scroll: 0.2, scene: 0.15, avatar: 0.65 },
        },
        sourcePattern: WIDE_SOURCE_PATTERN,
        allowAdjacentSourcePatternRepeats: true,
        sharedUsageCounts: ledgers.usageCounts,
        sharedCardUsageCounts: ledgers.cardUsageCounts,
      });
      variants.push({
        songId: row.project.song_id,
        fileName: row.fileName,
        parentSha256: row.parentSha256,
        profile,
        variant,
      });
    }
  }

  const invalidVariants = variants.filter(({ variant }) => {
    const sourceGroups = new Set(variant.selectionEvidence.map((selection) => selection.sourceGroup));
    return variant.telemetry?.immediateMediaRepeats !== 0
      || longestSourceStreak(variant.selectionEvidence) > 2
      || sourceGroups.size !== 3
      || variant.telemetry?.mediaBearingShots !== variant.densityPlan?.mediaShotIndices?.length
      || variant.telemetry?.visualizerOnlyShots + variant.telemetry?.mediaBearingShots !== variant.timeline.length;
  });
  if (invalidVariants.length) {
    throw new Error(`Wide-coverage recast invariants failed for: ${invalidVariants.slice(0, 12).map((row) => `${row.songId}:${row.profile.id}`).join(", ")}`);
  }

  const indexRows = variants.map(({ songId, parentSha256, variant }) => ({
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: parentSha256,
    variationSet: variant.variationSet,
    cut: variant.cut,
    densityProfile: variant.densityProfile,
    coveragePass: variant.coveragePass,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry.replacementShots,
    sourceSelections: variant.telemetry.selectionsBySource,
    uniqueMedia: variant.telemetry.uniqueMedia,
    mediaBearingShots: variant.telemetry.mediaBearingShots,
    visualizerOnlyShots: variant.telemetry.visualizerOnlyShots,
    actualVideoRatio: variant.telemetry.actualVideoRatio,
    previouslyUnseenSelections: variant.telemetry.previouslyUnseenSelections,
    updatedAt: RUN_STARTED_AT,
  }));
  const nextIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: upsertById(existingIndex.variants || [], indexRows),
    updatedAt: RUN_STARTED_AT,
  };

  const conflicts = [];
  const missingTargets = [];
  for (const { songId, variant } of variants) {
    const variantPath = path.join(VARIANTS_DIR, songId, `${variant.id}.json`);
    const existing = await readJson(variantPath, null).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!existing) missingTargets.push({ variantPath, variant });
    else if (directionVariantFingerprint(existing) !== directionVariantFingerprint(variant)) conflicts.push(variantPath);
  }
  if (conflicts.length) {
    throw new Error(`Append-only variant conflicts detected before write: ${conflicts.slice(0, 8).join(", ")}. Choose new variant ids.`);
  }

  const finalUsageSummary = usageSummary(candidates, ledgers.usageCounts);
  const variationPairs = [];
  for (let leftIndex = 0; leftIndex < WIDE_CUTS_CONFIG.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < WIDE_CUTS_CONFIG.length; rightIndex += 1) {
      const leftProfile = WIDE_CUTS_CONFIG[leftIndex];
      const rightProfile = WIDE_CUTS_CONFIG[rightIndex];
      const perSong = projectRows.map(({ project }) => {
        const left = variants.find((row) => row.songId === project.song_id && row.profile.id === leftProfile.id)?.variant;
        const right = variants.find((row) => row.songId === project.song_id && row.profile.id === rightProfile.id)?.variant;
        const leftIdentities = new Set(left.selectionEvidence.map((selection) => selection.technicalIdentity));
        const rightIdentities = new Set(right.selectionEvidence.map((selection) => selection.technicalIdentity));
        const setOverlap = [...leftIdentities].filter((identity) => rightIdentities.has(identity)).length
          / Math.max(1, Math.min(leftIdentities.size, rightIdentities.size));
        let sharedMediaWindows = 0;
        let sameMediaWindows = 0;
        for (let shotIndex = 0; shotIndex < left.timeline.length; shotIndex += 1) {
          const leftShot = left.timeline[shotIndex];
          const rightShot = right.timeline[shotIndex];
          if (leftShot.media_id === "none" || rightShot.media_id === "none") continue;
          sharedMediaWindows += 1;
          if (leftShot.media_technical_identity === rightShot.media_technical_identity) sameMediaWindows += 1;
        }
        return {
          setOverlap,
          sameWindowRatio: sharedMediaWindows ? sameMediaWindows / sharedMediaWindows : 0,
        };
      });
      variationPairs.push({
        pair: `${leftProfile.id}:${rightProfile.id}`,
        averageMediaSetOverlap: perSong.reduce((sum, row) => sum + row.setOverlap, 0) / perSong.length,
        maximumMediaSetOverlap: Math.max(...perSong.map((row) => row.setOverlap)),
        averageSameWindowIdentityRatio: perSong.reduce((sum, row) => sum + row.sameWindowRatio, 0) / perSong.length,
        maximumSameWindowIdentityRatio: Math.max(...perSong.map((row) => row.sameWindowRatio)),
      });
    }
  }
  const profileReport = Object.fromEntries(WIDE_CUTS_CONFIG.map((profile) => {
    const rows = variants.filter((row) => row.profile.id === profile.id);
    const placements = rows.reduce((sum, row) => sum + row.variant.telemetry.mediaBearingShots, 0);
    const visualizerShots = rows.reduce((sum, row) => sum + row.variant.telemetry.visualizerOnlyShots, 0);
    const ratios = rows.map((row) => row.variant.telemetry.actualVideoRatio);
    return [profile.id, {
      variantId: profile.variantId,
      songs: rows.length,
      targetVideoRatio: profile.targetVideoRatio,
      mediaBearingShots: placements,
      visualizerOnlyShots: visualizerShots,
      minimumActualVideoRatio: Math.min(...ratios),
      maximumActualVideoRatio: Math.max(...ratios),
      averageActualVideoRatio: ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
      promotedToMedia: rows.reduce((sum, row) => sum + row.variant.telemetry.promotedToMedia, 0),
      convertedToVisualizerOnly: rows.reduce((sum, row) => sum + row.variant.telemetry.convertedToVisualizerOnly, 0),
      previouslyUnseenSelections: rows.reduce((sum, row) => sum + row.variant.telemetry.previouslyUnseenSelections, 0),
      selectionsBySource: Object.fromEntries(["scroll", "scene", "avatar"].map((sourceGroup) => [
        sourceGroup,
        rows.reduce((sum, row) => sum + Number(row.variant.telemetry.selectionsBySource?.[sourceGroup] || 0), 0),
      ])),
    }];
  }));
  const report = {
    schemaVersion: "hapa.builder-wide-coverage-direction-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    variationSet: WIDE_VARIATION_SET,
    cuts: WIDE_CUTS_CONFIG.map((profile) => ({
      variantId: profile.variantId,
      label: profile.label,
      targetVideoRatio: profile.targetVideoRatio,
    })),
    policy: {
      selection: "album-least-used-clip, recent/current/global Card fairness, then soft motion-role fit",
      density: "one deterministic nested shot order with duration-nearest profile masks",
      sourceWeights: { scroll: 0.2, scene: 0.15, avatar: 0.65 },
      maximumSourceFamilyStreak: 2,
      provenanceExclusion: "explicit-hapa-dev-proto-origin-only",
      preserveExistingVariants: true,
      preserveLegacyProjects: true,
    },
    candidates: {
      extracted: extraction.telemetry,
      hashesMaterialized: hashed.newlyMaterialized,
      hashCacheHits: hashed.cacheHits,
      afterFullHashDeduplication: candidates.length,
      bySourceGroup: candidatesByGroup,
      baselineUsage: baselineUsageSummary,
      finalUsage: finalUsageSummary,
      newlyCovered: Object.fromEntries(["scroll", "scene", "avatar"].map((sourceGroup) => [
        sourceGroup,
        baselineUsageSummary[sourceGroup].unused - finalUsageSummary[sourceGroup].unused,
      ])),
    },
    baselineLedger: {
      variantIds: COVERAGE_BASELINE_VARIANT_IDS,
      variantsRead: ledgers.variantsRead,
      placementsRead: ledgers.placementsRead,
    },
    variants: {
      generated: variants.length,
      newFiles: missingTargets.length,
      existingIdenticalFiles: variants.length - missingTargets.length,
      byProfile: profileReport,
      immediateMediaRepeats: variants.reduce((sum, row) => sum + row.variant.telemetry.immediateMediaRepeats, 0),
      longestSourceStreak: Math.max(0, ...variants.map((row) => longestSourceStreak(row.variant.selectionEvidence))),
      variationDistinctness: variationPairs,
    },
    validation: {
      allSongsHaveThreeNewCuts: variants.length === projectRows.length * WIDE_CUTS_CONFIG.length,
      allCandidateMediaCovered: Object.values(finalUsageSummary).every((summary) => summary.unused === 0),
      fullVisualizerCoverage: true,
      nestedDensityMasks: projectRows.every((row) => row.densityPlan.profiles.every((profile, index, profiles) => (
        index === 0 || profiles[index - 1].mediaShotIndices.every((shotIndex) => profile.mediaShotIndices.includes(shotIndex))
      ))),
      noImmediateMediaRepeats: invalidVariants.length === 0,
      distinctSameWindowSelections: variationPairs.every((pair) => pair.maximumSameWindowIdentityRatio <= 0.1),
      maximumSourceFamilyStreak: Math.max(0, ...variants.map((row) => longestSourceStreak(row.variant.selectionEvidence))),
      originalProjectsMutated: 0,
      existingVariantFilesMutated: 0,
    },
    outputs: {
      variantsDirectory: VARIANTS_DIR,
      variantIndex: VARIANT_INDEX_PATH,
      hashCache: HASH_CACHE_PATH,
    },
    generatedAt: RUN_STARTED_AT,
  };
  if (!report.validation.allCandidateMediaCovered) {
    throw new Error(`Wide-coverage pass left eligible media unused: ${JSON.stringify(finalUsageSummary)}.`);
  }
  if (!report.validation.nestedDensityMasks) throw new Error("Wide-coverage density masks are not nested.");
  if (!report.validation.distinctSameWindowSelections) throw new Error("Wide-coverage cuts repeat too many exact media identities at the same shot windows.");

  let backupDirectory = "";
  if (APPLY) {
    backupDirectory = path.join(BACKUPS_DIR, RUN_ID);
    await mkdir(backupDirectory, { recursive: true });
    if (await stat(VARIANT_INDEX_PATH).catch(() => null)) {
      await copyFile(VARIANT_INDEX_PATH, path.join(backupDirectory, path.basename(VARIANT_INDEX_PATH)));
    }
    for (const { variantPath, variant } of missingTargets) await atomicWrite(variantPath, json(variant));
    await Promise.all([
      atomicWrite(VARIANT_INDEX_PATH, json(nextIndex)),
      atomicWrite(HASH_CACHE_PATH, json(hashCache)),
    ]);
  }

  const mutatedProjects = [];
  for (const fileName of projectFiles) {
    const after = sha256Bytes(await readFile(path.join(PROJECTS_DIR, fileName)));
    if (after !== projectHashesBefore.get(fileName)) mutatedProjects.push(fileName);
  }
  const mutatedVariants = [];
  for (const [filePath, before] of immutableVariantHashes) {
    const after = sha256Bytes(await readFile(filePath));
    if (after !== before) mutatedVariants.push(filePath);
  }
  if (mutatedProjects.length) throw new Error(`Legacy project files changed: ${mutatedProjects.join(", ")}`);
  if (mutatedVariants.length) throw new Error(`Existing direction variants changed: ${mutatedVariants.join(", ")}`);
  report.validation.originalProjectsMutated = mutatedProjects.length;
  report.validation.existingVariantFilesMutated = mutatedVariants.length;
  report.backupDirectory = backupDirectory;
  const reportPath = path.join(REPORTS_DIR, `${RUN_ID}-wide-coverage.json`);
  if (APPLY) await atomicWrite(reportPath, json(report));
  console.log(json({ ok: true, dryRun: !APPLY, reportPath: APPLY ? reportPath : null, ...report }));
}

async function main() {
  const [
    mediaLibrary,
    sceneStore,
    avatarStore,
    itemStore,
    technicalCache,
    existingIndex,
    existingHashCache,
    mediaFiles,
  ] = await Promise.all([
    readJson(MEDIA_LIBRARY_PATH),
    readJson(SCENE_STORE_PATH),
    readJson(AVATAR_STORE_PATH),
    readJson(ITEM_STORE_PATH),
    readJson(TECHNICAL_CACHE_PATH, {}),
    readJson(VARIANT_INDEX_PATH, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [], updatedAt: "" }),
    readJson(HASH_CACHE_PATH, { schemaVersion: "hapa.builder-expanded-direction-hash-cache.v1", entries: {}, updatedAt: "" }),
    discoverMediaFiles(),
  ]);
  const itemCardById = new Map(list(itemStore.cards).map((card) => [card.id, card]));
  const itemCardIds = new Set(itemCardById.keys());
  const sceneIds = new Set(list(sceneStore.scenes).map((scene) => scene.id));
  const avatarIds = new Set(list(avatarStore.avatars).map((avatar) => avatar.id));
  const extraction = buildBuilderExpandedDirectorCandidates({ mediaLibrary, sceneStore, avatarStore }, {
    minShortEdge: 720,
    minDurationSeconds: 2.5,
    availableMediaFiles: new Set(mediaFiles.keys()),
    technicalByFileName: technicalCacheByMediaName(technicalCache),
    itemCardById,
    sceneOptions: {
      requireSceneItemCard: true,
      requireVerifiedTechnical: true,
      requireBrowserSafePixelFormat: true,
    },
  });
  if (!extraction.groups.scroll.length || !extraction.groups.scene.length || !extraction.groups.avatar.length) {
    throw new Error(`All three source families are required; found ${JSON.stringify(extraction.telemetry)}.`);
  }
  const hashCache = {
    schemaVersion: "hapa.builder-expanded-direction-hash-cache.v1",
    entries: { ...(existingHashCache.entries || {}) },
    updatedAt: RUN_STARTED_AT,
  };
  const selectableCandidates = buildBalancedDirectorCandidates(extraction.candidates);
  const hashed = await materializeContentHashes(selectableCandidates, mediaFiles, hashCache);
  const candidates = dedupeByContent(hashed.candidates);
  validateCardReferences(candidates, itemCardIds, sceneIds, avatarIds);
  const devProtoCandidates = candidates.filter((candidate) => hasHapaDevProtoOrigin(candidate.origin, candidate.provenance));
  if (devProtoCandidates.length) throw new Error(`Explicit hapa-dev-proto candidates survived extraction: ${devProtoCandidates.map((row) => row.id).join(", ")}`);
  const candidatesByGroup = Object.fromEntries(["scroll", "scene", "avatar"].map((sourceGroup) => [
    sourceGroup,
    candidates.filter((candidate) => candidate.sourceGroup === sourceGroup).length,
  ]));
  if (Object.values(candidatesByGroup).some((count) => count === 0)) {
    throw new Error(`Content deduplication removed a required source family: ${JSON.stringify(candidatesByGroup)}.`);
  }

  const projectFiles = (await readdir(PROJECTS_DIR)).filter((file) => file.endsWith("-video-project.json")).sort();
  if (WIDE_CUTS) {
    await runWideCoverageCutPass({
      candidates,
      extraction,
      hashed,
      hashCache,
      existingIndex,
      projectFiles,
      candidatesByGroup,
    });
    return;
  }
  const projectHashesBefore = new Map();
  const variants = [];
  for (const fileName of projectFiles) {
    const filePath = path.join(PROJECTS_DIR, fileName);
    const bytes = await readFile(filePath);
    const parentSha256 = sha256Bytes(bytes);
    projectHashesBefore.set(fileName, parentSha256);
    const payload = JSON.parse(bytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    if (!project?.song_id) continue;
    const variant = recastBalancedEchoDirectorProject(project, candidates, {
      variantId: SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID,
      title: VARIANT_TITLE,
      seed: `${project.song_id}:${SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID}`,
      parentProjectHash: parentSha256,
      createdAt: RUN_STARTED_AT,
    });
    variants.push({ songId: project.song_id, fileName, parentSha256, variant });
  }

  const invalidVariants = variants.filter(({ variant }) => (
    variant.telemetry?.immediateMediaRepeats !== 0
      || variant.telemetry?.longestSourceStreak > 1
      || variant.telemetry?.sourceSelectionBalanceSpread > 1
  ));
  if (invalidVariants.length) {
    throw new Error(`Balanced recast invariants failed for: ${invalidVariants.map((row) => row.songId).join(", ")}`);
  }
  const indexRows = variants.map(({ songId, parentSha256, variant }) => ({
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: parentSha256,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry.replacementShots,
    sourceSelections: variant.telemetry.selectionsBySource,
    uniqueMedia: variant.telemetry.uniqueMedia,
    updatedAt: RUN_STARTED_AT,
  }));
  const nextIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: upsertById(existingIndex.variants || [], indexRows),
    updatedAt: RUN_STARTED_AT,
  };

  const report = {
    schemaVersion: "hapa.builder-expanded-direction-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    variant: { id: SCROLL_SCENE_AVATAR_BALANCED_VARIANT_ID, title: VARIANT_TITLE },
    policy: {
      sourceFamilies: ["scroll", "scene", "avatar"],
      sourceRotation: "one-of-each-per-three-media-shots-with-seeded-offset",
      provenanceExclusion: "explicit-hapa-dev-proto-origin-only",
      sceneCards: "existing-Item-Card-linked-only",
      browserSafety: "Scene yuv420p; all media local, nonzero, >=720 short edge, >=2.5 seconds",
      preserveExistingVariants: true,
      preserveLegacyProjects: true,
    },
    candidates: {
      extracted: extraction.telemetry,
      hashesMaterialized: hashed.newlyMaterialized,
      hashCacheHits: hashed.cacheHits,
      afterFullHashDeduplication: candidates.length,
      bySourceGroup: candidatesByGroup,
      unresolvedCards: 0,
      explicitHapaDevProtoOrigins: 0,
    },
    variants: {
      generated: variants.length,
      replacementShots: variants.reduce((sum, row) => sum + row.variant.telemetry.replacementShots, 0),
      selectionsBySource: Object.fromEntries(["scroll", "scene", "avatar"].map((sourceGroup) => [
        sourceGroup,
        variants.reduce((sum, row) => sum + Number(row.variant.telemetry.selectionsBySource?.[sourceGroup] || 0), 0),
      ])),
      immediateMediaRepeats: variants.reduce((sum, row) => sum + row.variant.telemetry.immediateMediaRepeats, 0),
      longestSourceStreak: Math.max(0, ...variants.map((row) => row.variant.telemetry.longestSourceStreak)),
      maximumBalanceSpread: Math.max(0, ...variants.map((row) => row.variant.telemetry.sourceSelectionBalanceSpread)),
    },
    validation: {
      allThreeSourceFamilies: Object.values(candidatesByGroup).every((count) => count > 0),
      allCardsResolve: true,
      allCandidateFilesLocalAndNonzero: true,
      allContentHashesFullSha256: candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.sha256)),
      noImmediateMediaRepeats: invalidVariants.length === 0,
      noAdjacentSourceRepeats: invalidVariants.length === 0,
      sourceBalanceWithinOneShot: invalidVariants.length === 0,
      originalProjectsMutated: 0,
    },
    outputs: {
      variantsDirectory: VARIANTS_DIR,
      variantIndex: VARIANT_INDEX_PATH,
      hashCache: HASH_CACHE_PATH,
    },
    generatedAt: RUN_STARTED_AT,
  };
  if (!report.validation.allContentHashesFullSha256) throw new Error("One or more expanded candidates lacks a full SHA-256 identity.");

  let backupDirectory = "";
  if (APPLY) {
    backupDirectory = path.join(BACKUPS_DIR, RUN_ID);
    await mkdir(backupDirectory, { recursive: true });
    if (await stat(VARIANT_INDEX_PATH).catch(() => null)) {
      await copyFile(VARIANT_INDEX_PATH, path.join(backupDirectory, path.basename(VARIANT_INDEX_PATH)));
    }
    for (const { songId, variant } of variants) {
      const variantPath = path.join(VARIANTS_DIR, songId, `${variant.id}.json`);
      const existing = await readJson(variantPath, null).catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (existing && directionVariantFingerprint(existing) !== directionVariantFingerprint(variant)) {
        throw new Error(`Append-only variant conflict at ${variantPath}; choose a new variant id.`);
      }
      if (!existing) await atomicWrite(variantPath, json(variant));
    }
    await Promise.all([
      atomicWrite(VARIANT_INDEX_PATH, json(nextIndex)),
      atomicWrite(HASH_CACHE_PATH, json(hashCache)),
    ]);
  }

  const mutatedProjects = [];
  for (const fileName of projectFiles) {
    const after = sha256Bytes(await readFile(path.join(PROJECTS_DIR, fileName)));
    if (after !== projectHashesBefore.get(fileName)) mutatedProjects.push(fileName);
  }
  if (mutatedProjects.length) throw new Error(`Legacy project files changed: ${mutatedProjects.join(", ")}`);
  report.validation.originalProjectsMutated = mutatedProjects.length;
  report.backupDirectory = backupDirectory;
  const reportPath = path.join(REPORTS_DIR, `${RUN_ID}.json`);
  if (APPLY) await atomicWrite(reportPath, json(report));
  console.log(json({ ok: true, dryRun: !APPLY, reportPath: APPLY ? reportPath : null, ...report }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
