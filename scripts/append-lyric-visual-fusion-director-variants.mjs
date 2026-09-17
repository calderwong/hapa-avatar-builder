#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEchoReferenceMediaLibrary } from "../server/echo-reference-media-library.mjs";
import { createSystemMediaDashboard } from "../src/domain/systemMedia.js";
import { createHumanVideoEnricherDashboard } from "../src/domain/human-video-enrichment.js";
import { buildVisualEnrichmentAliasIndex } from "../src/domain/human-video-visual-enrichment.js";
import { buildHumanAcceptedDirectorCandidates } from "../src/domain/human-accepted-director-candidates.js";
import { buildReferenceLoopDirectorCandidates } from "../src/domain/echo-reference-loop-director.js";
import { recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";
import {
  ECHO_LYRIC_VISUAL_VARIATION_SET,
  ECHO_LYRIC_VISUAL_VARIATIONS,
  attachTimedLyricContextToProject,
  enrichedCandidatesForSong,
  highQualityHumanAcceptedCandidates,
  referenceCandidatesForSong,
} from "../src/domain/echo-lyric-visual-director.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const PROJECTS = path.join(DATA, "music-video-projects");
const VARIANTS = path.join(DATA, "music-video-project-variants");
const INDEX_PATH = path.join(VARIANTS, "index.json");
const REPORTS = path.join(ROOT, "artifacts/lyric-visual-fusion-director");
const APPLY = process.argv.includes("--apply");
const RESUME = process.argv.includes("--resume");
const STARTED_AT = new Date().toISOString();
const RUN_ID = `lyric-visual-fusion-${STARTED_AT.replace(/[:.]/gu, "-")}`;

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || fallback;
}

const TARGET_SONG_ID = option("--song-id");
const TARGET_VARIATION_ID = option("--variation-id");
const MINIMUM_SHORT_EDGE = Number(option("--minimum-short-edge", "720"));
if (!Number.isFinite(MINIMUM_SHORT_EDGE) || MINIMUM_SHORT_EDGE < 1) throw new Error("--minimum-short-edge must be a positive number.");

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value || "").trim(); }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT" && fallback !== undefined) return fallback; throw error; }
}

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof payload === "string" ? payload : json(payload), "utf8");
  await rename(temporary, filePath);
}

function localPathForVideo(video = {}) {
  const sourcePath = text(video.sourcePath).replace(/^file:\/\//u, "");
  if (sourcePath) return sourcePath;
  if (!text(video.uri).startsWith("/media/")) return "";
  const relative = text(video.uri).replace(/^\/media\//u, "").split(/[?#]/u)[0];
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

function unwrapProject(payload = {}) {
  return payload.music_video_project || payload.musicVideoProject || payload.project || payload;
}

async function loadProjects() {
  const rows = [];
  for (const fileName of (await readdir(PROJECTS)).filter((name) => name.endsWith("-video-project.json")).sort()) {
    const filePath = path.join(PROJECTS, fileName);
    const bytes = await readFile(filePath);
    const project = unwrapProject(JSON.parse(bytes.toString("utf8")));
    if (!project?.song_id || (TARGET_SONG_ID && project.song_id !== TARGET_SONG_ID)) continue;
    rows.push({ filePath, bytes, project });
  }
  if (!rows.length) throw new Error(TARGET_SONG_ID ? `No Echo project found for ${TARGET_SONG_ID}.` : "No Echo projects found.");
  return rows;
}

function increment(map, key, amount = 1) {
  if (key) map.set(key, Number(map.get(key) || 0) + amount);
}

function indexRow(variant = {}) {
  return {
    id: `${variant.parent.songId}:${variant.id}`,
    songId: variant.parent.songId,
    variantId: variant.id,
    title: variant.title,
    schemaVersion: variant.schemaVersion,
    status: variant.status,
    createdAt: variant.createdAt,
    timelineCount: list(variant.timeline).length,
    hasHyperframeScript: Boolean(variant.hyperframe_script),
    relativePath: `${variant.parent.songId}/${variant.id}.json`,
    parentProjectSha256: variant.parent.projectSha256,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry?.replacementShots || 0,
    sourceSelections: variant.telemetry?.selectionsBySource || {},
    uniqueMedia: variant.telemetry?.uniqueMedia || 0,
    mediaBearingShots: variant.telemetry?.mediaBearingShots || 0,
    visualizerOnlyShots: variant.telemetry?.visualizerOnlyShots || 0,
    actualVideoRatio: variant.telemetry?.actualVideoRatio || 0,
    videoEventsPerMinute: variant.telemetry?.videoEventsPerMinute || 0,
    updatedAt: variant.updatedAt,
  };
}

async function main() {
  const [
    avatarStore, tarotStore, sceneStore, mediaLibrary, itemStore, songStore,
    enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore,
    visualEnrichmentStore, projects, referenceLibrary, existingIndex,
  ] = await Promise.all([
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
    loadProjects(),
    buildEchoReferenceMediaLibrary({}),
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
  const humanCandidates = buildHumanAcceptedDirectorCandidates(acceptedVideos, {
    isReadable: (video) => readableKeys.has(video.humanVideoKey),
    visualEnrichmentIndex: buildVisualEnrichmentAliasIndex(visualEnrichmentStore),
  });
  const humanQuality = highQualityHumanAcceptedCandidates(humanCandidates, { minimumShortEdge: MINIMUM_SHORT_EDGE });
  if (humanQuality.candidates.length < 2) throw new Error("Fewer than two readable, enriched Human-accepted videos satisfy the quality floor.");

  const referenceCandidates = buildReferenceLoopDirectorCandidates(referenceLibrary);
  if (referenceCandidates.length < 2) throw new Error("Fewer than two completed H3/FAL Reference Card loops are available.");
  const variations = ECHO_LYRIC_VISUAL_VARIATIONS.filter((variation) => !TARGET_VARIATION_ID || variation.id === TARGET_VARIATION_ID);
  if (!variations.length) throw new Error(`Unknown --variation-id: ${TARGET_VARIATION_ID}`);

  const usageByVariation = new Map(variations.map((variation) => [variation.id, {
    media: new Map(), cards: new Map(),
  }]));
  const indexRows = [];
  const songSummaries = [];
  const selectionTotals = new Map();
  const pipelineCounts = new Map();
  for (const candidate of referenceCandidates) {
    const provider = text(candidate.loopPipeline?.provider) || "unknown";
    increment(pipelineCounts, provider);
  }

  let generated = 0;
  let resumed = 0;
  let fallbackSongs = 0;
  let shotsWithLyrics = 0;
  let selectedLyricWindows = 0;
  let positiveLyricMatches = 0;
  let lyricAffinityTotal = 0;
  let immediateRepeats = 0;
  let missingSourceFamilies = 0;
  let backupPath = "";
  if (APPLY) {
    backupPath = path.join(DATA, "backups", `music-video-project-variants-index.before-${RUN_ID}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(INDEX_PATH, backupPath);
  }

  for (const { bytes, project } of projects) {
    const lyricProject = attachTimedLyricContextToProject(project);
    shotsWithLyrics += lyricProject.evidence.shotsWithLyrics;
    const referencePool = referenceCandidatesForSong(referenceCandidates, project);
    const humanPool = enrichedCandidatesForSong(humanQuality.candidates, project, { limit: 320 });
    if (referencePool.mode === "album-reference-semantic-fallback") fallbackSongs += 1;
    const candidates = [...humanPool.candidates, ...referencePool.candidates];
    const summary = {
      songId: project.song_id,
      title: project.song_title || project.song_id,
      lyricEvidence: lyricProject.evidence,
      referenceMode: referencePool.mode,
      sameSongReferenceLoops: referencePool.scopedCount,
      humanShortlist: {
        candidates: humanPool.candidates.length,
        positiveMatches: humanPool.positiveMatches,
        topScore: humanPool.topScore,
      },
      variants: [],
    };

    for (const variation of variations) {
      const targetPath = path.join(VARIANTS, project.song_id, `${variation.id}.json`);
      const existing = await readJson(targetPath, null);
      let variant = existing;
      if (existing) {
        if (!RESUME) throw new Error(`Append-only conflict: ${targetPath}. Use --resume to audit/finish this exact pass.`);
        if (existing.lyricVisualDirection?.variationSet !== ECHO_LYRIC_VISUAL_VARIATION_SET) {
          throw new Error(`Existing variant is not owned by ${ECHO_LYRIC_VISUAL_VARIATION_SET}: ${targetPath}`);
        }
        resumed += 1;
      } else {
        const usage = usageByVariation.get(variation.id);
        variant = recastBalancedEchoDirectorProject(lyricProject.project, candidates, {
          variantId: variation.id,
          title: variation.title,
          seed: `${project.song_id}:${variation.id}:${referenceLibrary.digest}`,
          parentProjectHash: sha256(bytes),
          createdAt: STARTED_AT,
          allowedSourceGroups: ["human-accepted", "reference"],
          sourcePattern: variation.sourcePattern,
          rotateSourcePattern: false,
          requireAllSourceGroups: true,
          forbiddenProvenanceLineages: ["hapa-dev-proto", "hell-week"],
          sharedUsageCounts: usage.media,
          sharedCardUsageCounts: usage.cards,
          densityProfile: variation.density,
          densityPlanSeed: `${project.song_id}:${ECHO_LYRIC_VISUAL_VARIATION_SET}:density-plan`,
          coveragePass: {
            strategy: "human-accepted-plus-song-scoped-h3-fal-reference-loops-with-timed-lyric-soft-alignment",
            referenceLibraryDigest: referenceLibrary.digest,
            referenceMode: referencePool.mode,
          },
          variationSet: {
            id: ECHO_LYRIC_VISUAL_VARIATION_SET,
            ordinal: variation.density.ordinal,
            profile: variation.density.id,
          },
        });
        variant.sourcePolicy = {
          ...variant.sourcePolicy,
          humanAccepted: {
            acceptedStateOnly: true,
            candidateLedger: "data/human-video-quick-sort-decisions.json",
            qualityFloor: {
              enrichedDescription: true,
              enrichedPalette: true,
              minimumShortEdge: humanQuality.minimumShortEdge,
            },
            candidatesAtRun: humanQuality.candidates.length,
            perSongShortlist: {
              candidates: humanPool.candidates.length,
              positiveMatches: humanPool.positiveMatches,
              topScore: humanPool.topScore,
              method: "enriched-description-plus-full-song-lyric-token-affinity",
            },
          },
          referenceCards: {
            completedLoopsOnly: true,
            libraryDigest: referenceLibrary.digest,
            selectionScope: referencePool.mode,
            sameSongCandidates: referencePool.scopedCount,
            selectedPoolCandidates: referencePool.candidates.length,
            pipelineProviders: Object.fromEntries([...pipelineCounts.entries()].sort()),
          },
          lyricVisualAlignment: {
            source: lyricProject.evidence.source,
            timedLyricLines: lyricProject.evidence.timedLyricLines,
            shotsWithLyrics: lyricProject.evidence.shotsWithLyrics,
            method: "measured-token-overlap-soft-weight-v1",
            semanticTruthClaimed: false,
          },
        };
        variant.lyricVisualDirection = {
          schemaVersion: "hapa.echo.lyric-visual-direction.v1",
          variationSet: ECHO_LYRIC_VISUAL_VARIATION_SET,
          variationId: variation.id,
          sourcePattern: variation.sourcePattern,
          density: variation.density,
          lyricEvidence: lyricProject.evidence,
          referenceSelection: {
            mode: referencePool.mode,
            sameSongCandidates: referencePool.scopedCount,
            selectedPoolCandidates: referencePool.candidates.length,
          },
        };
        if (APPLY) await atomicWrite(targetPath, variant);
        generated += 1;
      }

      const selections = list(variant.selectionEvidence);
      const sourceGroups = new Set(selections.map((selection) => selection.sourceGroup));
      if (!sourceGroups.has("human-accepted") || !sourceGroups.has("reference")) missingSourceFamilies += 1;
      if (list(variant.timeline).some((shot) => shot.media_source_group === "human-accepted" && shot.decision_evidence?.humanAcceptedIdentity?.decisionState !== "accepted")) {
        throw new Error(`Non-accepted Human video crossed the Director boundary for ${project.song_id}/${variation.id}.`);
      }
      immediateRepeats += Number(variant.telemetry?.immediateMediaRepeats || 0);
      for (const selection of selections) {
        increment(selectionTotals, selection.sourceGroup);
        if (selection.lyricContextAvailable) selectedLyricWindows += 1;
        if (selection.lyricAffinity > 0) {
          positiveLyricMatches += 1;
          lyricAffinityTotal += selection.lyricAffinity;
        }
      }
      const row = indexRow(variant);
      indexRows.push(row);
      const variationSummary = {
        variationId: variation.id,
        timelineShots: row.timelineCount,
        mediaBearingShots: row.mediaBearingShots,
        sourceSelections: row.sourceSelections,
        actualVideoRatio: row.actualVideoRatio,
        lyricContextSelections: variant.telemetry?.lyricContextSelections || 0,
        lyricAffinitySelections: variant.telemetry?.lyricAffinitySelections || 0,
      };
      summary.variants.push(variationSummary);
    }
    songSummaries.push(summary);
    if (songSummaries.length % 25 === 0 || songSummaries.length === projects.length) {
      console.error(`[lyric-visual-fusion] planned ${songSummaries.length}/${projects.length} songs (${indexRows.length} variants)`);
    }
  }

  if (immediateRepeats) throw new Error(`Lyric Visual Fusion created ${immediateRepeats} immediate media repeats.`);
  if (missingSourceFamilies) throw new Error(`${missingSourceFamilies} variants did not use both Human-accepted and Reference media.`);
  const incoming = new Set(indexRows.map((row) => row.id));
  const nextIndex = {
    ...existingIndex,
    schemaVersion: existingIndex.schemaVersion || "hapa.echo.direction-script-variant-index.v1",
    variants: [...indexRows, ...list(existingIndex.variants).filter((row) => !incoming.has(row.id))],
    updatedAt: STARTED_AT,
  };
  if (APPLY) await atomicWrite(INDEX_PATH, nextIndex);

  const report = {
    schemaVersion: "hapa.echo.lyric-visual-fusion-director-run.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    generatedAt: STARTED_AT,
    variationSet: ECHO_LYRIC_VISUAL_VARIATION_SET,
    counts: {
      songs: projects.length,
      variationsPerSong: variations.length,
      variants: indexRows.length,
      generated,
      resumed,
      humanAcceptedVideos: acceptedVideos.length,
      humanReadableCandidates: humanCandidates.length,
      humanHighQualityCandidates: humanQuality.candidates.length,
      referenceCardLoops: referenceCandidates.length,
      songScopedReferenceSongs: projects.length - fallbackSongs,
      albumSemanticFallbackSongs: fallbackSongs,
      shotsWithTimedLyrics: shotsWithLyrics,
      selectedLyricWindows,
      positiveLyricMatches,
      immediateMediaRepeats: immediateRepeats,
    },
    qualityFloor: {
      minimumShortEdge: humanQuality.minimumShortEdge,
      acceptedEnrichedCount: humanQuality.acceptedEnrichedCount,
      highResolutionCount: humanQuality.highResolutionCount,
      selectedCandidates: humanQuality.candidates.length,
      resolutionFallback: humanQuality.resolutionFallback,
    },
    referencePipelines: Object.fromEntries([...pipelineCounts.entries()].sort()),
    selectionsBySource: Object.fromEntries([...selectionTotals.entries()].sort()),
    lyricAlignment: {
      method: "measured-token-overlap-soft-weight-v1",
      averagePositiveAffinity: positiveLyricMatches ? Number((lyricAffinityTotal / positiveLyricMatches).toFixed(4)) : 0,
      semanticTruthClaimed: false,
    },
    validation: {
      everyProjectReceivedEveryVariation: indexRows.length === projects.length * variations.length,
      bothSourceFamiliesInEveryVariant: missingSourceFamilies === 0,
      acceptedHumanBoundaryPreserved: true,
      completedReferenceLoopsOnly: true,
      noImmediateMediaRepeats: immediateRepeats === 0,
      originalProjectsMutated: 0,
    },
    outputs: { variantsDirectory: VARIANTS, indexPath: INDEX_PATH, backupPath },
    variations: variations.map((variation) => ({ id: variation.id, title: variation.title, density: variation.density, sourcePattern: variation.sourcePattern })),
    songs: songSummaries,
  };
  const reportPath = path.join(REPORTS, `${RUN_ID}-${APPLY ? "apply" : "dry-run"}.json`);
  if (APPLY) await atomicWrite(reportPath, report);
  console.log(json({ ok: true, reportPath: APPLY ? reportPath : null, ...report.counts, referencePipelines: report.referencePipelines, selectionsBySource: report.selectionsBySource, lyricAlignment: report.lyricAlignment }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
