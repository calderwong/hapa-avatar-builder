#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSystemMediaDashboard } from "../src/domain/systemMedia.js";
import { createHumanVideoEnricherDashboard } from "../src/domain/human-video-enrichment.js";
import {
  buildHumanAcceptedDirectorCandidates,
  summarizeHumanAcceptedDirectorCandidates,
} from "../src/domain/human-accepted-director-candidates.js";
import { buildVisualEnrichmentAliasIndex } from "../src/domain/human-video-visual-enrichment.js";
import { recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const PROJECTS = path.join(DATA, "music-video-projects");
const VARIANTS = path.join(DATA, "music-video-project-variants");
const INDEX_PATH = path.join(VARIANTS, "index.json");
const REPORTS = path.join(DATA, "merge-reports");
const BACKUPS = path.join(DATA, "backups");
const PLAYLIST_ID = "903148b6-5709-4511-9cfd-d34b23799da6";
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT
  || `/Users/calderwong/Desktop/suno-library/playlists/${PLAYLIST_ID}`;
const PLAYLIST_MANIFEST = process.env.HAPA_DEAR_PAPA_MANIFEST
  || path.join(PLAYLIST_ROOT, "manifest.hapa-avatar-builder.json");
function flagValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}
const VARIANT_ID = flagValue("--variant-id", "human-accepted-diversity-dense-v1");
const VARIANT_TITLE = flagValue("--title", "Human Enricher Accepted · Album Diversity Dense Pass");
const APPLY = process.argv.includes("--apply");
const RESUME = process.argv.includes("--resume");
const STARTED_AT = new Date().toISOString();
const RUN_ID = `human-accepted-echo-direction-${STARTED_AT.replace(/[:.]/g, "-")}`;
const DENSITY_TARGET_VIDEO_RATIO = Number(flagValue("--video-ratio", "0.92"));
const DENSITY_ORDINAL = Number(flagValue("--ordinal", "1"));
if (!Number.isFinite(DENSITY_TARGET_VIDEO_RATIO) || DENSITY_TARGET_VIDEO_RATIO < 0 || DENSITY_TARGET_VIDEO_RATIO > 1) {
  throw new Error("--video-ratio must be a number between 0 and 1.");
}
if (!Number.isInteger(DENSITY_ORDINAL) || DENSITY_ORDINAL < 1) {
  throw new Error("--ordinal must be a positive integer.");
}
const DENSITY = Object.freeze({
  id: flagValue("--density-id", "human-accepted-dense"),
  label: flagValue("--density-label", "Human Accepted Dense"),
  targetVideoRatio: DENSITY_TARGET_VIDEO_RATIO,
  ordinal: DENSITY_ORDINAL,
});

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const NO_FALLBACK = Symbol("no-fallback");
const readJson = async (filePath, fallback = NO_FALLBACK) => {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (fallback !== NO_FALLBACK && error?.code === "ENOENT") return fallback; throw error; }
};
const atomicWrite = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof value === "string" ? value : json(value), "utf8");
  await rename(temporary, filePath);
};

function localPathForVideo(video = {}) {
  const sourcePath = String(video.sourcePath || "").replace(/^file:\/\//, "");
  if (sourcePath) return sourcePath;
  if (!String(video.uri || "").startsWith("/media/")) return "";
  const relative = String(video.uri).replace(/^\/media\//, "").split(/[?#]/)[0];
  try { return path.join(DATA, "media", decodeURIComponent(relative)); }
  catch { return path.join(DATA, "media", relative); }
}

async function readableVideoKeys(videos = []) {
  const readable = new Set();
  await Promise.all(videos.map(async (video) => {
    const filePath = localPathForVideo(video);
    const info = filePath ? await stat(filePath).catch(() => null) : null;
    if (info?.isFile() && info.size > 0) readable.add(video.humanVideoKey);
  }));
  return readable;
}

function increment(map, key, amount = 1) {
  if (key) map.set(key, Number(map.get(key) || 0) + amount);
}

function normalizedTitle(value = "") {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalCardForSong(song, cards = []) {
  const expectedTitle = normalizedTitle(song.title);
  return cards.slice().sort((a, b) => {
    const score = (card) => (normalizedTitle(card.title) === expectedTitle ? 100 : 0)
      + (card.status === "legacy-unmatched" ? 0 : 10)
      + (Number(card.trackNumber) === Number(song.index) ? 1 : 0);
    return score(b) - score(a) || String(a.id).localeCompare(String(b.id));
  })[0] || null;
}

function usageStatistics(candidates, usageCounts) {
  const counts = candidates.map((candidate) => Number(usageCounts.get(String(candidate.technicalIdentity || "").toLowerCase()) || 0)).sort((a, b) => a - b);
  const placements = counts.reduce((sum, value) => sum + value, 0);
  const mean = counts.length ? placements / counts.length : 0;
  const variance = counts.length ? counts.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / counts.length : 0;
  return {
    eligible: counts.length,
    used: counts.filter((value) => value > 0).length,
    unused: counts.filter((value) => value === 0).length,
    placements,
    minimumUses: counts[0] || 0,
    medianUses: counts[Math.floor(counts.length / 2)] || 0,
    maximumUses: counts.at(-1) || 0,
    standardDeviation: Number(Math.sqrt(variance).toFixed(4)),
  };
}

async function main() {
  const [avatarStore, tarotStore, sceneStore, mediaLibrary, itemStore, songStore, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore, visualEnrichmentStore, playlistManifest, songbook, existingIndex] = await Promise.all([
    readJson(path.join(DATA, "avatar-store.json"), { avatars: [] }),
    readJson(path.join(DATA, "tarot-store.json"), { cards: [] }),
    readJson(path.join(DATA, "scene-store.json"), { scenes: [] }),
    readJson(path.join(DATA, "media-library.json"), { records: [] }),
    readJson(path.join(DATA, "item-manager-store.json"), { cards: [] }),
    readJson(path.join(DATA, "hapa-songs-store.json"), { songs: [] }),
    readJson(path.join(DATA, "human-video-enrichments.json"), { records: [] }),
    readJson(path.join(DATA, "human-video-agent-reviews.json"), { reviews: [] }),
    readJson(path.join(DATA, "human-video-quick-sort-decisions.json"), { decisions: [] }),
    readJson(path.join(DATA, "human-video-reference-reviews.json"), { reviews: [] }),
    readJson(path.join(DATA, "human-video-visual-enrichments.json"), { records: [] }),
    readJson(PLAYLIST_MANIFEST),
    readJson(path.join(DATA, "dear-papa-songbook.json")),
    readJson(INDEX_PATH, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [] }),
  ]);

  const mediaDashboard = createSystemMediaDashboard({
    avatars: avatarStore.avatars || [], tarotStore, sceneGraph: sceneStore, mediaLibrary, itemStore, songStore,
  });
  const humanDashboard = createHumanVideoEnricherDashboard({
    mediaDashboard, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore,
    avatars: avatarStore.avatars || [], songs: songStore.songs || [],
  });
  const acceptedVideos = humanDashboard.videos.filter((video) => video.quickSortDecision?.state === "accepted");
  const readableKeys = await readableVideoKeys(acceptedVideos);
  const visualEnrichmentIndex = buildVisualEnrichmentAliasIndex(visualEnrichmentStore);
  const candidates = buildHumanAcceptedDirectorCandidates(acceptedVideos, {
    isReadable: (video) => readableKeys.has(video.humanVideoKey),
    visualEnrichmentIndex,
  });
  const candidatesWithPalette = candidates.filter((candidate) => candidate.visualPalette).length;
  const candidatesWithDescription = candidates.filter((candidate) => candidate.visualDescription).length;
  if (!candidates.length) throw new Error("No locally readable Human Enricher accepted videos were available.");
  if (candidates.some((candidate) => candidate.humanAcceptedIdentity?.decisionState !== "accepted")) {
    throw new Error("A non-accepted video crossed the Human Enricher Director boundary.");
  }

  const playlistSongs = (playlistManifest.songs || []).slice().sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  const playlistIds = new Set(playlistSongs.map((song) => song.id));
  if (playlistIds.size !== playlistSongs.length || playlistSongs.length !== Number(playlistManifest.counts?.songs || playlistSongs.length)) {
    throw new Error("Current Suno manifest count or identity uniqueness is invalid.");
  }
  const currentCards = (songbook.songCards || []).filter((card) => playlistIds.has(card.registryTrackId));
  const cardsByRegistryId = new Map();
  const duplicateCardAliases = [];
  for (const song of playlistSongs) {
    const matches = currentCards.filter((card) => card.registryTrackId === song.id);
    const canonical = canonicalCardForSong(song, matches);
    if (canonical) cardsByRegistryId.set(song.id, canonical);
    if (matches.length > 1) duplicateCardAliases.push({
      registryTrackId: song.id,
      playlistTitle: song.title,
      canonicalCardId: canonical?.id || "",
      aliasCardIds: matches.filter((card) => card.id !== canonical?.id).map((card) => card.id),
    });
  }
  const missingCards = playlistSongs.filter((song) => !cardsByRegistryId.has(song.id));
  if (missingCards.length) throw new Error(`Current Suno songs are missing Builder Song Cards: ${missingCards.map((song) => song.title).join(", ")}`);

  const usageCounts = new Map();
  const cardUsageCounts = new Map();
  const indexRows = [];
  const generated = [];
  let replacementShots = 0;
  let immediateRepeats = 0;
  let resumed = 0;
  let backupDirectory = "";
  if (APPLY) {
    backupDirectory = path.join(BACKUPS, RUN_ID);
    await mkdir(backupDirectory, { recursive: true });
    if (await stat(INDEX_PATH).catch(() => null)) await copyFile(INDEX_PATH, path.join(backupDirectory, "index.json"));
  }

  for (const playlistSong of playlistSongs) {
    const card = cardsByRegistryId.get(playlistSong.id);
    const projectPath = path.join(PROJECTS, `${card.id}-video-project.json`);
    const projectBytes = await readFile(projectPath).catch((error) => {
      if (error?.code === "ENOENT") throw new Error(`Current Suno song has no Director project: ${playlistSong.title} (${card.id})`);
      throw error;
    });
    const payload = JSON.parse(projectBytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    const variantPath = path.join(VARIANTS, project.song_id, `${VARIANT_ID}.json`);
    const existing = await readJson(variantPath, null);
    let variant = existing;
    if (existing) {
      if (!RESUME) throw new Error(`Append-only Human Accepted variant already exists: ${variantPath}. Use --resume to audit/finish the same pass.`);
      if (existing.sourcePolicy?.acceptedStateOnly !== true) throw new Error(`Existing variant lacks the accepted-only boundary: ${variantPath}`);
      for (const selection of existing.selectionEvidence || []) {
        increment(usageCounts, selection.technicalIdentity);
        increment(cardUsageCounts, selection.cardId);
      }
      resumed += 1;
    } else {
      variant = recastBalancedEchoDirectorProject(project, candidates, {
        variantId: VARIANT_ID,
        title: VARIANT_TITLE,
        seed: `${project.song_id}:${VARIANT_ID}`,
        parentProjectHash: sha256(projectBytes),
        createdAt: STARTED_AT,
        allowedSourceGroups: ["human-accepted"],
        sourcePattern: ["human-accepted"],
        rotateSourcePattern: false,
        requireAllSourceGroups: true,
        forbiddenProvenanceLineages: ["hapa-dev-proto", "hell-week"],
        sharedUsageCounts: usageCounts,
        sharedCardUsageCounts: cardUsageCounts,
        densityProfile: DENSITY,
      });
      variant.sourcePolicy = {
        ...variant.sourcePolicy,
        acceptedStateOnly: true,
        acceptedAuthority: "human-media-triage-only",
        candidateLedger: "data/human-video-quick-sort-decisions.json",
        candidatePoolAtRun: candidates.length,
        playlistId: PLAYLIST_ID,
        visualEnrichment: {
          store: "data/human-video-visual-enrichments.json",
          recordsAtRun: visualEnrichmentStore.records?.length || 0,
          candidatesWithPalette,
          candidatesWithDescription,
          role: "soft-selection-weight",
        },
      };
      if ((variant.timeline || []).some((shot) => shot.media_source_group === "human-accepted" && shot.decision_evidence?.humanAcceptedIdentity?.decisionState !== "accepted")) {
        throw new Error(`Variant lost accepted-decision evidence: ${project.song_id}`);
      }
      if (APPLY) await atomicWrite(variantPath, variant);
      generated.push({ songId: project.song_id, title: playlistSong.title, variantPath });
    }
    replacementShots += Number(variant.telemetry?.replacementShots || 0);
    immediateRepeats += Number(variant.telemetry?.immediateMediaRepeats || 0);
    indexRows.push({
      id: `${project.song_id}:${VARIANT_ID}`,
      songId: project.song_id,
      variantId: VARIANT_ID,
      title: VARIANT_TITLE,
      relativePath: `${project.song_id}/${VARIANT_ID}.json`,
      parentProjectSha256: variant.parent?.projectSha256 || "",
      sourcePolicy: variant.sourcePolicy,
      replacementShots: variant.telemetry?.replacementShots || 0,
      uniqueMedia: variant.telemetry?.uniqueMedia || 0,
      updatedAt: variant.updatedAt || STARTED_AT,
    });
  }

  const usage = usageStatistics(candidates, usageCounts);
  if (immediateRepeats) throw new Error(`Human Accepted Director pass created ${immediateRepeats} immediate media repeats.`);
  if (usage.placements >= usage.eligible && usage.unused) throw new Error(`Diversity coverage left ${usage.unused} accepted videos unused despite sufficient placements.`);
  const incoming = new Set(indexRows.map((row) => row.id));
  const nextIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [...indexRows, ...(existingIndex.variants || []).filter((row) => !incoming.has(row.id))],
    updatedAt: STARTED_AT,
  };
  if (APPLY) await atomicWrite(INDEX_PATH, nextIndex);

  const report = {
    schemaVersion: "hapa.echo.human-accepted-direction-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    playlist: {
      id: PLAYLIST_ID,
      songs: playlistSongs.length,
      manifestPath: PLAYLIST_MANIFEST,
      duplicateCardAliases,
    },
    humanEnricher: {
      knownVideos: humanDashboard.summary.videos,
      acceptedVideos: acceptedVideos.length,
      acceptedReadableCandidates: candidates.length,
      acceptedUnavailable: acceptedVideos.length - candidates.length,
      visualEnrichment: {
        records: visualEnrichmentStore.records?.length || 0,
        candidatesWithPalette,
        candidatesWithDescription,
      },
      candidateSummary: summarizeHumanAcceptedDirectorCandidates(candidates),
    },
    diversity: usage,
    variants: {
      projects: indexRows.length,
      generated: generated.length,
      resumed,
      replacementShots,
      immediateMediaRepeats: immediateRepeats,
    },
    validation: {
      currentPlaylistExact: playlistSongs.length === 175,
      acceptedStateOnly: true,
      everyCurrentSongHasCardAndProject: indexRows.length === playlistSongs.length,
      noImmediateMediaRepeats: immediateRepeats === 0,
      allCandidatesUsedWhenPlacementsPermit: usage.placements < usage.eligible || usage.unused === 0,
      originalProjectsMutated: 0,
    },
    outputs: { variantId: VARIANT_ID, variantsDirectory: VARIANTS, indexPath: INDEX_PATH, backupDirectory },
    generatedAt: STARTED_AT,
  };
  const reportPath = path.join(REPORTS, `${RUN_ID}.json`);
  if (APPLY) await atomicWrite(reportPath, report);
  console.log(json({ ok: true, reportPath: APPLY ? reportPath : null, ...report }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
