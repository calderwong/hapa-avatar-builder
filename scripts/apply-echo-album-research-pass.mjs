#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEchoAlbumResearchPass } from "../src/domain/echo-album-research-pass.js";
import { buildEchoTarotSongConnections } from "../src/domain/echo-tarot-song-links.js";
import { attachCardToSong } from "../src/domain/song.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const passId = option("--pass-id", "codex-echo-research-2026-09-13");
const timestamp = option("--timestamp", new Date().toISOString());
const sourceRoot = path.resolve(option("--source", "/Users/calderwong/raw-models/references-proto-1/Hapa_Echo_Research_Pack"));
const storePath = path.join(root, "data", "hapa-songs-store.json");
const tarotPath = path.join(root, "resources", "echo-album", "hapa-tarot-echoes-v1.json");
const sourceJsonPath = path.join(sourceRoot, "Hapa_Echo_Reference_Atlas.json");
const sourceMarkdownPath = path.join(sourceRoot, "Hapa_Echo_Reference_Atlas.md");
const resourceRoot = path.join(root, "resources", "echo-album", "research", "reference-atlas-v1");
const passPath = path.join(root, "resources", "echo-album", `${passId}.json`);
const reportPath = path.join(root, "data", "merge-reports", `${passId}.json`);

function option(name, fallback = "") {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

function replacePassRows(existing = [], incoming = []) {
  return [...incoming, ...(existing || []).filter((entry) => entry.passId !== passId)];
}

function mergeKnowledge(existing = {}, incoming = {}) {
  return {
    ...existing,
    schemaVersion: "hapa.song-knowledge.v2",
    understandings: replacePassRows(existing.understandings, incoming.understandings),
    notes: replacePassRows(existing.notes, incoming.notes),
    anecdotes: replacePassRows(existing.anecdotes, incoming.anecdotes),
    lessons: replacePassRows(existing.lessons, incoming.lessons),
    tarotRationales: replacePassRows(existing.tarotRationales, incoming.tarotRationales),
    researchReferences: replacePassRows(existing.researchReferences, incoming.researchReferences),
    songConnections: replacePassRows(existing.songConnections, incoming.songConnections),
    referenceImagePrompts: replacePassRows(existing.referenceImagePrompts, incoming.referenceImagePrompts),
    passProvenance: replacePassRows(existing.passProvenance, incoming.passProvenance),
    updatedAt: timestamp,
  };
}

const [store, atlas, tarotEdition, atlasJsonBytes, atlasMarkdownBytes] = await Promise.all([
  readJson(storePath),
  readJson(sourceJsonPath),
  readJson(tarotPath),
  readFile(sourceJsonPath),
  readFile(sourceMarkdownPath),
]);
const suppliedConnections = buildEchoTarotSongConnections(tarotEdition, store.songs || []);
const researchPass = buildEchoAlbumResearchPass({
  songs: store.songs || [],
  atlas,
  tarotEdition,
  tarotConnections: suppliedConnections,
  timestamp,
  passId,
});
const passBySongId = new Map(researchPass.songs.map((record) => [record.songId, record]));
let newTarotAttachments = 0;
const nextSongs = (store.songs || []).map((song) => {
  const record = passBySongId.get(song.id);
  if (!record) return song;
  let next = { ...song, knowledge: mergeKnowledge(song.knowledge || {}, record.knowledge), updatedAt: timestamp };
  if (record.tarot.assignmentType === "agent-proposed") {
    const alreadyLinked = (song.attachments?.cardLinks || []).some((link) => link.cardId === record.tarot.cardId);
    if (!alreadyLinked) {
      const rationale = record.knowledge.tarotRationales[0];
      next = attachCardToSong(next, { id: record.tarot.cardId, title: record.tarot.cardTitle }, {
        role: "tarot-song-correspondence",
        reason: rationale.body,
        contextReason: rationale.body,
        tags: ["echo-album", "tarot", "agent-authored-logic", "reviewable-proposal", passId],
        linkedAt: timestamp,
      });
      newTarotAttachments += 1;
    }
  }
  return next;
});
const nextStore = {
  ...store,
  songs: nextSongs,
  audit: {
    ...(store.audit || {}),
    researchPass: {
      passId,
      author: "OpenAI Codex",
      authoredAt: timestamp,
      status: "reviewable-agent-proposal",
      counts: researchPass.counts,
    },
  },
  updatedAt: timestamp,
};
const report = {
  schemaVersion: "hapa.echo-album-research-pass-apply-report.v1",
  passId,
  author: "OpenAI Codex",
  authoredAt: timestamp,
  applied: apply,
  storePath,
  passPath,
  source: {
    root: sourceRoot,
    jsonSha256: sha256(atlasJsonBytes),
    markdownSha256: sha256(atlasMarkdownBytes),
  },
  counts: { ...researchPass.counts, newTarotAttachments },
  invariants: {
    sourceSongCount: store.songs?.length || 0,
    outputSongCount: nextSongs.length,
    everySongHasUnderstanding: nextSongs.every((song) => song.knowledge?.understandings?.some((entry) => entry.passId === passId)),
    everySongHasNote: nextSongs.every((song) => song.knowledge?.notes?.some((entry) => entry.passId === passId)),
    everySongHasAnecdoteSeed: nextSongs.every((song) => song.knowledge?.anecdotes?.some((entry) => entry.passId === passId)),
    everySongHasLesson: nextSongs.every((song) => song.knowledge?.lessons?.some((entry) => entry.passId === passId)),
    everySongHasTarotRationale: nextSongs.every((song) => song.knowledge?.tarotRationales?.some((entry) => entry.passId === passId)),
    everySongHasTarotConnection: nextSongs.every((song) => suppliedConnections.some((connection) => connection.songId === song.id) || (song.attachments?.cardLinks || []).some((link) => link.role === "tarot-song-correspondence")),
  },
};

if (apply) {
  const backupPath = path.join(root, "data", "backups", `hapa-songs-store.before-${passId}-${timestamp.replace(/[:.]/g, "-")}.json`);
  await atomicWriteJson(backupPath, store);
  await mkdir(resourceRoot, { recursive: true });
  await Promise.all([
    copyFile(sourceJsonPath, path.join(resourceRoot, "Hapa_Echo_Reference_Atlas.json")),
    copyFile(sourceMarkdownPath, path.join(resourceRoot, "Hapa_Echo_Reference_Atlas.md")),
  ]);
  await atomicWriteJson(passPath, researchPass);
  await atomicWriteJson(storePath, nextStore);
  await atomicWriteJson(reportPath, { ...report, backupPath });
}

console.log(JSON.stringify(report, null, 2));
if (!Object.values(report.invariants).every(Boolean)) process.exitCode = 1;
