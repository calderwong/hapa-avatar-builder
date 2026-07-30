#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compareLyricText, lyricTextTokens } from "../src/domain/echo-lyric-quality.js";

const ROOT = path.resolve(".");
const PLAN_PATH = process.env.HAPA_ECHO_LYRIC_DRAIN_PLAN
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/drain-plan.json");
const CORPUS_ROOTS = (process.env.HAPA_ECHO_LYRIC_CORPUS_ROOTS
  || "/Users/calderwong/Desktop/suno-library")
  .split(path.delimiter)
  .map((value) => value.trim())
  .filter(Boolean);
const OUTPUT_PATH = process.env.HAPA_ECHO_LYRIC_SOURCE_CANDIDATE_REPORT
  || path.join(ROOT, "artifacts/echo-lyric-quality-v4/source-candidate-report.json");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function lyricFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "lyrics.txt")
    .map((entry) => path.join(entry.parentPath || entry.path, entry.name));
}

function transcriptFor(sttPath) {
  if (!sttPath || !fs.existsSync(sttPath)) return "";
  const stt = JSON.parse(fs.readFileSync(sttPath, "utf8"));
  return (stt.words || [])
    .filter((word) => Number(word?.end) > Number(word?.start))
    .map((word) => String(word?.word || word?.text || "").trim())
    .filter(Boolean)
    .join(" ");
}

const corpusByHash = new Map();
for (const root of CORPUS_ROOTS) {
  for (const filePath of lyricFiles(root)) {
    const text = fs.readFileSync(filePath, "utf8").trim();
    if (!text) continue;
    const hash = sha256(text);
    if (!corpusByHash.has(hash)) corpusByHash.set(hash, {
      sha256: hash,
      text,
      paths: [],
      tokenCount: lyricTextTokens(text).length,
    });
    corpusByHash.get(hash).paths.push(filePath);
  }
}

const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));
const rows = [];
for (const row of plan.rows || []) {
  const sttPath = String(row.timingPath || "").replace(/\.json$/i, ".stt.json");
  const transcript = transcriptFor(sttPath);
  const candidates = [...corpusByHash.values()]
    .map((candidate) => ({
      sha256: candidate.sha256,
      paths: candidate.paths,
      tokenCount: candidate.tokenCount,
      ...compareLyricText([{ text: transcript }], candidate.text),
    }))
    .sort((left, right) => right.similarity - left.similarity || right.tokenF1 - left.tokenF1)
    .slice(0, 8);
  rows.push({
    registryTrackId: row.registryTrackId,
    title: row.title,
    timingPath: row.timingPath,
    sttPath,
    transcriptTokenCount: lyricTextTokens(transcript).length,
    transcriptPreview: transcript.slice(0, 500),
    candidates,
  });
}

const report = {
  schemaVersion: "hapa.echo.lyric-source-candidate-report.v1",
  mutationMode: "read-only",
  generatedAt: new Date().toISOString(),
  planPath: PLAN_PATH,
  corpusRoots: CORPUS_ROOTS,
  uniqueCorpusTexts: corpusByHash.size,
  reviewedTracks: rows.length,
  rows,
};
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath: OUTPUT_PATH,
  uniqueCorpusTexts: report.uniqueCorpusTexts,
  reviewedTracks: report.reviewedTracks,
  bestCandidates: rows.map((row) => ({
    title: row.title,
    transcriptTokenCount: row.transcriptTokenCount,
    bestSimilarity: row.candidates[0]?.similarity || 0,
    bestPath: row.candidates[0]?.paths?.[0] || "",
  })),
}, null, 2)}\n`);
