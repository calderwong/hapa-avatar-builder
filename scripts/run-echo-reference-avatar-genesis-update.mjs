#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAvatarCard } from "../src/domain/avatar.js";
import {
  createEchoReferenceMindContextFromSongStore,
  echoSongIndex,
  hydrateEchoSongChoice,
  resolveEchoSongChoice
} from "../src/domain/avatarEchoGenesis.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const avatarStorePath = path.join(root, "data/avatar-store.json");
const songStorePath = path.join(root, "data/hapa-songs-store.json");
const apply = process.argv.includes("--apply");
const additionalSongCount = numericFlag("--additional-songs", 3);
const now = new Date().toISOString();
const runId = `echo-reference-avatar-genesis-${now.replace(/[:.]/g, "-")}`;

const avatarStore = readJson(avatarStorePath);
const songStore = withEchoAlbumLineage(readJson(songStorePath));
const graphHash = sha256({
  referenceCatalog: songStore.referenceCatalog || [],
  referenceGraphEdges: songStore.referenceGraphEdges || [],
  semanticTraversal: songStore.semanticTraversal || null,
  songs: (songStore.songs || []).map((song) => ({
    id: song.id,
    songId: song.songId,
    lyricsSha256: song.lyrics?.sha256 || "",
    referenceConnectors: song.referenceConnectors || [],
    contextualLayers: song.contextualLayers || []
  }))
});
const index = echoSongIndex(songStore);
const connectorSongs = (songStore.songs || []).filter((song) => (song.referenceConnectors || []).length > 0);
const report = {
  schemaVersion: "hapa.echo-reference-avatar-genesis-update-report.v1",
  runId,
  mode: apply ? "apply" : "dry-run",
  source: {
    avatarStorePath: "data/avatar-store.json",
    songStorePath: "data/hapa-songs-store.json",
    songStoreUpdatedAt: songStore.updatedAt || null,
    graphHash
  },
  policy: {
    lineage: "Dear Papa and Echo Album are projections of the same song lineage; stable song/card IDs and lyric hashes outrank album title.",
    references: "Connector semantics remain reviewable interpretation and never become hard Avatar biography automatically.",
    additionalSongCount
  },
  before: summarize(avatarStore.avatars || []),
  avatars: [],
  generatedAt: now
};

const nextAvatars = (avatarStore.avatars || []).map((rawAvatar, avatarIndex) => {
  const avatar = normalizeAvatarCard(rawAvatar);
  const mind = avatar.mind;
  const songContext = mind.dearPapaSongContext || {};
  const graphAlreadyLoaded = songContext.echoReferenceGraph?.graphHash === graphHash;
  const existingChoices = (songContext.selectedSongCards || []).filter((choice) => choice.status !== "tombstone");
  const resolved = [];
  const unresolved = [];

  for (const choice of existingChoices) {
    const song = resolveEchoSongChoice(choice, index);
    if (!song) {
      unresolved.push(choice.id || choice.songId || choice.title);
      resolved.push(choice);
      continue;
    }
    resolved.push(hydrateEchoSongChoice(choice, song, songStore, {
      graphHash,
      sourceStorePath: "data/hapa-songs-store.json"
    }));
  }

  const selectedKeys = new Set(resolved.flatMap((choice) => [choice.id, choice.songId, choice.cardId, choice.lyricsSha256].filter(Boolean)));
  const additions = chooseAdditionalSongs(avatar, connectorSongs, selectedKeys, avatarIndex, graphAlreadyLoaded ? 0 : additionalSongCount)
    .map((song) => hydrateEchoSongChoice({
      id: `${avatar.id}-echo-reference-${song.songId || song.id}`,
      songId: song.songId || song.id,
      cardId: song.cardId || song.id,
      title: song.title,
      author: song.author || "Calder",
      perspective: song.performancePerspective || {},
      whySelected: `${avatarName(avatar)} selected ${song.title} from the current Echo reference graph because its reviewed connector and context layers expand the Avatar's song vocabulary without changing source lyrics.`,
      genesisInstruction: "Use connector evidence and semantic effects as reviewable interpretation. Carry themes, mechanics, emotional vectors, and exposition changes into voice, memory, relationships, and card choices only with their source and canon boundary visible.",
      communicationUse: "Semantic shorthand, relationship cue, card-draw operator, visual exposition route, and unresolved-reference prompt.",
      sourcePath: "data/hapa-songs-store.json",
      status: "active",
      createdAt: now,
      updatedAt: now
    }, song, songStore, {
      graphHash,
      sourceStorePath: "data/hapa-songs-store.json"
    }));

  const selectedSongCards = uniqueBy([...resolved, ...additions], (choice) => choice.id || choice.cardId || choice.songId);
  const echoReferenceGraph = createEchoReferenceMindContextFromSongStore(songStore, {
    graphHash,
    ingestionRunId: runId,
    updatedAt: now
  });
  const connectorCount = selectedSongCards.reduce((sum, choice) => sum + (choice.referenceConnectors || []).length, 0);
  const referenceIds = unique(selectedSongCards.flatMap((choice) => choice.referenceGraphSnapshot?.referenceIds || []));

  mind.dearPapaSongContext = {
    ...songContext,
    albumAliases: echoReferenceGraph.albumLineage.aliases,
    albumLineage: echoReferenceGraph.albumLineage,
    echoReferenceGraph,
    selectedSongCards,
    sourceAnchors: unique([...(songContext.sourceAnchors || []), "data/hapa-songs-store.json", "docs/ECHO_REFERENCE_GRAPH.md"]),
    genesisUse: unique([
      ...(songContext.genesisUse || []),
      "Resolve Dear Papa and Echo Album as projections of the same song lineage by stable song/card IDs and lyric hashes.",
      "Load reviewed Echo reference connectors, contextual layers, semantic effects, and graph edges before choosing song-driven voice, memory, relationship, exposition, or card behavior.",
      "Treat unresolved references as traversal prompts, not illogic, and never promote connector inference into hard biography without human review."
    ]),
    status: "active",
    updatedAt: now
  };
  mind.selfKnowledge = uniqueBy([
    ...(mind.selfKnowledge || []),
    mindFact(avatar, "echo-album-lineage", "Echo album lineage", "Dear Papa and Echo Album are source/release projections of the substantially same songs. I resolve song identity by stable IDs and lyric hash before title.", now),
    mindFact(avatar, "echo-reference-evidence", "Echo reference evidence", "I can use Echo reference connectors to widen interpretation, but I keep literal lyric evidence, public references, personal context, and thematic inference visibly distinct.", now),
    mindFact(avatar, "echo-semantic-expansion", "Echo semantic expansion", "New reference context may add or reweight meaning without rewriting the lyric or silently turning interpretation into biography.", now)
  ], (fact) => fact.id);
  mind.contextMap = uniqueBy([
    ...(mind.contextMap || []),
    {
      id: `context-${avatar.id}-echo-reference-graph`,
      contextId: "echo-reference-graph",
      label: "Echo Album reference graph",
      kind: "canon",
      avatarBelief: `${avatarName(avatar)} has ${connectorCount} selected-song connector snapshots spanning ${referenceIds.length} referenced namespaces. These are interpretive routes, not automatic hard canon.`,
      publicSummary: "The Avatar can traverse reviewed Echo lyric references and explain how loaded context changes exposition.",
      classification: "soft_canon",
      confidence: "soft",
      visibility: "shared",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (entry) => entry.id);
  mind.memoryLedger = uniqueBy([
    ...(mind.memoryLedger || []),
    {
      memoryId: `memory-${avatar.id}-echo-reference-genesis`,
      summary: `${avatarName(avatar)} loaded the current Echo reference graph as an append-only interpretation map: ${selectedSongCards.length} selected songs, ${connectorCount} connector snapshots, and ${referenceIds.length} activated public or shared-context namespaces.`,
      emotionalWeight: 6,
      visibility: "shared",
      confidence: "soft",
      classification: "memory_delta",
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ], (entry) => entry.memoryId || entry.id);
  mind.genesisRuns = uniqueBy([
    ...(mind.genesisRuns || []),
    {
      id: `${runId}:${avatar.id}`,
      runId,
      kind: "echo-reference-avatar-genesis-update",
      graphHash,
      selectedSongCount: selectedSongCards.length,
      addedSongCount: additions.length,
      connectorSnapshotCount: connectorCount,
      referenceNamespaceCount: referenceIds.length,
      source: "scripts/run-echo-reference-avatar-genesis-update.mjs",
      status: "complete",
      createdAt: now,
      updatedAt: now
    }
  ], (entry) => entry.id);
  mind.personaAnchor = {
    ...(mind.personaAnchor || {}),
    carriedForward: appendSentence(
      mind.personaAnchor?.carriedForward,
      "Echo references are expandable, source-visible thought routes: load context before judging a lyric, preserve alternate readings, and do not confuse an album-title projection with a new song identity."
    ),
    updatedAt: now
  };
  mind.updatedAt = now;
  avatar.updatedAt = now;

  const normalized = normalizeAvatarCard(avatar);
  report.avatars.push({
    avatarId: normalized.id,
    avatarName: avatarName(normalized),
    existingSelections: existingChoices.length,
    graphAlreadyLoaded,
    hydratedSelections: resolved.length - unresolved.length,
    newSelections: additions.map((choice) => choice.songId),
    unresolvedSelections: unresolved,
    connectorSnapshots: connectorCount,
    referenceNamespaces: referenceIds.length
  });
  return normalized;
});

const nextStore = {
  ...avatarStore,
  avatars: nextAvatars,
  echoReferenceAvatarGenesis: {
    schemaVersion: "hapa.echo-reference-avatar-genesis-state.v1",
    runId,
    graphHash,
    sourceStorePath: "data/hapa-songs-store.json",
    completedAt: now
  },
  updatedAt: now
};
report.after = summarize(nextAvatars);

if (apply) {
  const stamp = now.replace(/[:.]/g, "-");
  const backupPath = path.join(root, `data/backups/avatar-store.before-echo-reference-genesis.${stamp}.json`);
  const songBackupPath = path.join(root, `data/backups/hapa-songs-store.before-echo-lineage.${stamp}.json`);
  const reportPath = path.join(root, `data/merge-reports/echo-reference-avatar-genesis.${stamp}.json`);
  report.backupPath = path.relative(root, backupPath);
  report.songBackupPath = path.relative(root, songBackupPath);
  report.reportPath = path.relative(root, reportPath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.copyFileSync(avatarStorePath, backupPath);
  fs.copyFileSync(songStorePath, songBackupPath);
  fs.writeFileSync(avatarStorePath, `${JSON.stringify(nextStore, null, 2)}\n`);
  fs.writeFileSync(songStorePath, `${JSON.stringify(songStore, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));

function chooseAdditionalSongs(avatar, songs, selectedKeys, avatarIndex, limit) {
  if (limit <= 0) return [];
  const lane = avatarLane(avatar, avatarIndex);
  return songs
    .filter((song) => ![song.id, song.songId, song.cardId, song.lyrics?.sha256].some((key) => key && selectedKeys.has(key)))
    .map((song) => ({
      song,
      score: ((song.attachments?.avatarLinks || []).some((link) => link.avatarId === avatar.id) ? 1000 : 0)
        + (String(song.performancePerspective?.teamColor || "").toLowerCase() === lane ? 200 : 0)
        + (song.referenceConnectors || []).length * 10
        + (song.contextualLayers || []).length * 3,
      stable: stableNumber(`${avatar.id}:${song.id}`)
    }))
    .sort((a, b) => b.score - a.score || a.stable - b.stable)
    .slice(0, limit)
    .map((entry) => entry.song);
}

function mindFact(avatar, key, label, value, timestamp) {
  return {
    id: `fact-${avatar.id}-${key}`,
    label,
    value,
    classification: "soft_canon",
    confidence: "soft",
    visibility: "shared",
    source: "data/hapa-songs-store.json",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function summarize(avatars) {
  const choices = avatars.flatMap((avatar) => avatar.mind?.dearPapaSongContext?.selectedSongCards || []);
  return {
    avatars: avatars.length,
    selectedSongCards: choices.length,
    choicesWithReferenceConnectors: choices.filter((choice) => (choice.referenceConnectors || []).length > 0).length,
    connectorSnapshots: choices.reduce((sum, choice) => sum + (choice.referenceConnectors || []).length, 0),
    avatarsWithEchoReferenceGraph: avatars.filter((avatar) => avatar.mind?.dearPapaSongContext?.echoReferenceGraph?.graphHash).length
  };
}

function avatarLane(avatar, index) {
  const explicit = avatar.mind?.dearPapaSongContext?.performancePerspective?.teamColor
    || avatar.mind?.dearPapaSongContext?.selectedSongCards?.[0]?.perspective?.teamColor;
  return String(explicit || ["red", "blue", "green"][index % 3]).toLowerCase();
}

function avatarName(avatar) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.id;
}

function appendSentence(value, sentence) {
  const current = String(value || "").trim();
  if (!current) return sentence;
  if (current.includes(sentence)) return current;
  return `${current} ${sentence}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableNumber(value) {
  return Number.parseInt(crypto.createHash("sha256").update(value).digest("hex").slice(0, 12), 16);
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function numericFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function withEchoAlbumLineage(store) {
  const sourceAlbum = store.album || {};
  const sourceTitle = sourceAlbum.title || "Dear Papa";
  const activeProjection = {
    id: sourceAlbum.activeProjection?.id || "echo-album",
    title: sourceAlbum.activeProjection?.title || "Echo Album",
    kind: sourceAlbum.activeProjection?.kind || "later-music-visualizer-projection",
    status: sourceAlbum.activeProjection?.status || "active"
  };
  const album = {
    ...sourceAlbum,
    lineageScope: "echo-dear-papa-same-song-lineage",
    aliases: unique([...(sourceAlbum.aliases || []), sourceTitle, activeProjection.title]),
    activeProjection,
    identityRule: "Resolve stable song/card IDs and lyrics SHA-256 before album title; Echo Album is a later projection of the substantially same song corpus."
  };
  const songs = (store.songs || []).map((song) => ({
    ...song,
    albumAliases: unique([...(song.albumAliases || []), song.albumTitle || sourceTitle, activeProjection.title]),
    albumLineage: {
      schemaVersion: "hapa.song-album-lineage.v1",
      canonicalWorkId: "echo-dear-papa-song-lineage",
      sourceAlbum: {
        id: song.albumId || sourceAlbum.id || "dear-papa-album",
        title: song.albumTitle || sourceTitle
      },
      activeProjection,
      identityRule: "Resolve stable song/card IDs and lyrics SHA-256 before album title.",
      status: "operator-confirmed-lineage"
    }
  }));
  return { ...store, album, songs, updatedAt: now };
}
