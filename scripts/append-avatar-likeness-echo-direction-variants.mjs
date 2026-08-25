#!/usr/bin/env node
// Avatar Likeness Director Pass (L5) — append-only Director variant.
//
// Standing guardrail: acceptance is the boundary; likeness is the placement.
// The pass reuses the Human-Accepted candidate pool (durable Quick Sort
// `accepted` videos only) and, for every placed media that carries a durable
// human likeness decision (origin "avatar-likeness", state "accepted"),
// injects a typed cast (evidenceBasis "likeness-accepted-v1") into the shot's
// decision evidence. Original Director projects are never mutated; the pass
// appends `<songId>/avatar-likeness-v1.json` variants + an index row + a
// post-run audit that resolves every typed shot back to the accepted set.
//
// Usage:
//   node scripts/append-avatar-likeness-echo-direction-variants.mjs [--apply] [--resume]
//     [--variant-id avatar-likeness-v1] [--title "..."]
//     [--pool typed|all]            (default: typed)
//     [--video-ratio 0.92] [--ordinal 1]
//
// `--pool typed` (default) restricts the candidate pool to media with an
// accepted likeness decision, so the variant maximizes typed cast coverage.
// `--pool all` runs the full Human-Accepted pool; typed shots appear only
// where an accepted decision is present (the plan's literal "when present").

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
import { buildDirectorDensityPlan, recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";
import {
  AVATAR_LIKENESS_VARIANT_ID,
  LIKENESS_EVIDENCE_BASIS,
  LIKENESS_CAST_AUTHORITY,
  buildAvatarLikenessDecisionIndex,
  attachAvatarLikenessCast,
  safeMediaShotMask,
  injectAvatarLikenessCastIntoVariant,
  auditAvatarLikenessVariant,
  summarizeAvatarLikenessCast,
} from "../src/domain/avatar-likeness-director-cast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = process.env.HAPA_AVATAR_LIKENESS_DATA_DIR || path.join(ROOT, "data");
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

const VARIANT_ID = flagValue("--variant-id", AVATAR_LIKENESS_VARIANT_ID);
const VARIANT_TITLE = flagValue("--title", "Avatar Likeness · Human Accepted Typed Cast Pass");
const POOL = flagValue("--pool", "typed").toLowerCase();
if (!["typed", "all"].includes(POOL)) throw new Error("--pool must be 'typed' or 'all'.");
const APPLY = process.argv.includes("--apply");
const RESUME = process.argv.includes("--resume");
const STARTED_AT = new Date().toISOString();
const RUN_ID = `avatar-likeness-echo-direction-${STARTED_AT.replace(/[:.]/g, "-")}`;
const DENSITY_TARGET_VIDEO_RATIO = Number(flagValue("--video-ratio", "0.92"));
const DENSITY_ORDINAL = Number(flagValue("--ordinal", "1"));
if (!Number.isFinite(DENSITY_TARGET_VIDEO_RATIO) || DENSITY_TARGET_VIDEO_RATIO < 0 || DENSITY_TARGET_VIDEO_RATIO > 1) {
  throw new Error("--video-ratio must be a number between 0 and 1.");
}
if (!Number.isInteger(DENSITY_ORDINAL) || DENSITY_ORDINAL < 1) {
  throw new Error("--ordinal must be a positive integer.");
}
const DENSITY = Object.freeze({
  id: flagValue("--density-id", "avatar-likeness-typed"),
  label: flagValue("--density-label", "Avatar Likeness Typed Cast"),
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
  const [avatarStore, tarotStore, sceneStore, mediaLibrary, itemStore, songStore, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore, visualEnrichmentStore, likenessDecisionStore, profilesStore, playlistManifest, songbook, existingIndex] = await Promise.all([
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
    readJson(path.join(DATA, "human-video-likeness-decisions.json"), { decisions: [] }),
    readJson(path.join(DATA, "avatar-likeness", "profiles.json"), { profiles: {} }),
    readJson(PLAYLIST_MANIFEST),
    readJson(path.join(DATA, "dear-papa-songbook.json")),
    readJson(INDEX_PATH, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [] }),
  ]);

  const avatarsById = Object.fromEntries((avatarStore.avatars || []).map((avatar) => [String(avatar.id), avatar]));
  const mediaLibraryRecords = mediaLibrary.records || [];
  const profiles = profilesStore.profiles || {};

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
  if (candidates.some((candidate) => candidate.humanAcceptedIdentity?.decisionState !== "accepted")) {
    throw new Error("A non-accepted video crossed the Human Enricher Director boundary.");
  }

  const decisionIndex = buildAvatarLikenessDecisionIndex(likenessDecisionStore.decisions || []);
  const attached = attachAvatarLikenessCast(candidates, {
    decisionIndex,
    avatars: avatarsById,
    profiles,
    mediaLibraryRecords,
  });
  const typedCandidates = attached.filter((candidate) => candidate.avatarLikeness);
  const pool = POOL === "typed" ? typedCandidates : attached;
  const castSummary = summarizeAvatarLikenessCast(attached);

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

  // Honest empty state: no accepted likeness decisions yet (the current live
  // store is empty). The pass appends nothing, writes an honest report, and
  // exits 0 — the first human acceptance is what unlocks the variant.
  if (pool.length === 0) {
    const report = {
      schemaVersion: "hapa.echo.avatar-likeness-direction-report.v1",
      runId: RUN_ID,
      mode: APPLY ? "apply" : "dry-run",
      guardrail: "Acceptance is the boundary; likeness is the placement.",
      pool: POOL,
      variantId: VARIANT_ID,
      candidates: castSummary,
      acceptedVideos: acceptedVideos.length,
      acceptedReadableCandidates: candidates.length,
      acceptedLikenessDecisions: (likenessDecisionStore.decisions || []).filter((decision) => decision.state === "accepted").length,
      variants: { projects: 0, generated: 0, resumed: 0, replacementShots: 0 },
      validation: {
        note: (likenessDecisionStore.decisions || []).length === 0
          ? "no-accepted-likeness-decisions-yet"
          : "no-readable-media-with-accepted-likeness",
        originalProjectsMutated: 0,
      },
      outputs: { variantsDirectory: VARIANTS, indexPath: INDEX_PATH, backupDirectory: "" },
      generatedAt: STARTED_AT,
    };
    const reportPath = path.join(REPORTS, `${RUN_ID}.json`);
    if (APPLY) await atomicWrite(reportPath, report);
    console.log(json({ ok: true, reportPath: APPLY ? reportPath : null, ...report }));
    return;
  }

  const usageCounts = new Map();
  const cardUsageCounts = new Map();
  const indexRows = [];
  const generated = [];
  let replacementShots = 0;
  let immediateRepeats = 0;
  let typedShotTotal = 0;
  let mediaShotTotal = 0;
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
      if (!RESUME) throw new Error(`Append-only Avatar Likeness variant already exists: ${variantPath}. Use --resume to audit/finish the same pass.`);
      if (!variant.sourcePolicy?.acceptedStateOnly || variant.sourcePolicy?.likenessAuthority !== LIKENESS_CAST_AUTHORITY) {
        throw new Error(`Existing variant lacks the accepted-likeness boundary: ${variantPath}`);
      }
      for (const selection of variant.selectionEvidence || []) {
        increment(usageCounts, selection.technicalIdentity);
        increment(cardUsageCounts, selection.cardId);
      }
      if (!variant.avatarLikenessAudit || !variant.avatarLikenessAudit.ok) {
        throw new Error(`Existing variant carries a failed likeness audit; re-run the domain audit before resuming: ${variantPath}`);
      }
      resumed += 1;
    } else {
      // The engine's no-immediate-repeat contract is variant-global: a
      // single-candidate typed pool can place at most one media shot per
      // song. safeMediaShotMask shrinks the density mask to match the pool.
      const densityPlan = buildDirectorDensityPlan(project, {
        seed: `${project.song_id || "song"}:${VARIANT_ID}:density-plan`,
        profiles: [DENSITY],
      });
      const planMask = densityPlan.profiles[0].mediaShotIndices;
      const safeMask = safeMediaShotMask(planMask, project.timeline, pool.length);
      const recastOptions = {
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
        mediaShotIndices: safeMask,
      };
      variant = recastBalancedEchoDirectorProject(project, pool, recastOptions);
      if ((variant.timeline || []).some((shot) => shot.media_source_group === "human-accepted" && shot.decision_evidence?.humanAcceptedIdentity?.decisionState !== "accepted")) {
        throw new Error(`Variant lost accepted-decision evidence: ${project.song_id}`);
      }
      variant = injectAvatarLikenessCastIntoVariant(variant, pool);
      variant.sourcePolicy = {
        ...variant.sourcePolicy,
        acceptedStateOnly: true,
        acceptedAuthority: "human-media-triage-only",
        candidateLedger: "data/human-video-quick-sort-decisions.json",
        likenessAuthority: LIKENESS_CAST_AUTHORITY,
        likenessEvidenceBasis: LIKENESS_EVIDENCE_BASIS,
        likenessDecisionLedger: "data/human-video-likeness-decisions.json",
        likenessPool: POOL,
        candidatesAtRun: pool.length,
        typedCandidatesAtRun: typedCandidates.length,
        playlistId: PLAYLIST_ID,
      };
      const audit = auditAvatarLikenessVariant(variant, { decisionIndex, decisions: likenessDecisionStore.decisions || [] });
      if (!audit.ok) {
        throw new Error(`Avatar Likeness audit failed for ${project.song_id}: ${audit.failures.slice(0, 5).join("; ")}`);
      }
      variant.avatarLikenessAudit = audit;
      if (APPLY) await atomicWrite(variantPath, variant);
      generated.push({ songId: project.song_id, title: playlistSong.title, variantPath });
    }
    replacementShots += Number(variant.telemetry?.replacementShots || 0);
    immediateRepeats += Number(variant.telemetry?.immediateMediaRepeats || 0);
    mediaShotTotal += Number(variant.avatarLikenessCast?.mediaShots ?? 0);
    typedShotTotal += Number(variant.avatarLikenessCast?.typedShots ?? 0);
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
      typedShots: variant.avatarLikenessCast?.typedShots || 0,
      mediaShots: variant.avatarLikenessCast?.mediaShots || 0,
      updatedAt: variant.updatedAt || STARTED_AT,
    });
  }

  const usage = usageStatistics(pool, usageCounts);
  if (immediateRepeats) throw new Error(`Avatar Likeness Director pass created ${immediateRepeats} immediate media repeats.`);
  if (usage.placements >= usage.eligible && usage.unused) throw new Error(`Diversity coverage left ${usage.unused} pool videos unused despite sufficient placements.`);
  const incoming = new Set(indexRows.map((row) => row.id));
  const nextIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [...indexRows, ...(existingIndex.variants || []).filter((row) => !incoming.has(row.id))],
    updatedAt: STARTED_AT,
  };
  if (APPLY) await atomicWrite(INDEX_PATH, nextIndex);

  const report = {
    schemaVersion: "hapa.echo.avatar-likeness-direction-report.v1",
    runId: RUN_ID,
    mode: APPLY ? "apply" : "dry-run",
    guardrail: "Acceptance is the boundary; likeness is the placement.",
    pool: POOL,
    variantId: VARIANT_ID,
    title: VARIANT_TITLE,
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
      likeness: {
        decisions: (likenessDecisionStore.decisions || []).length,
        acceptedDecisions: (likenessDecisionStore.decisions || []).filter((decision) => decision.state === "accepted").length,
        profiles: Object.keys(profiles).length,
        candidateSummary: castSummary,
        poolSize: pool.length,
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
      mediaShots: mediaShotTotal,
      typedShots: typedShotTotal,
      typedShotRatio: mediaShotTotal ? Number((typedShotTotal / mediaShotTotal).toFixed(4)) : 0,
    },
    audit: {
      evidenceBasis: LIKENESS_EVIDENCE_BASIS,
      authority: LIKENESS_CAST_AUTHORITY,
      everyTypedShotHasDurableReceipt: true,
      untypedShotsRemainHonest: true,
    },
    validation: {
      currentPlaylistExact: playlistSongs.length === 175,
      acceptedStateOnly: true,
      everyCurrentSongHasCardAndProject: indexRows.length === playlistSongs.length,
      noImmediateMediaRepeats: immediateRepeats === 0,
      allPoolCandidatesUsedWhenPlacementsPermit: usage.placements < usage.eligible || usage.unused === 0,
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
