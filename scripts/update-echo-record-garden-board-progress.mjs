#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BOARD_PATH = process.env.ECHO_RECORD_GARDEN_BOARD_PATH
  || "/Users/calderwong/Desktop/Echos-of-Other-Eras-Album-App/kanban.json";
const EVENTS_PATH = process.env.ECHO_RECORD_GARDEN_EVENTS_PATH
  || "/Users/calderwong/Documents/Codex/2026-05-27/can-you-generate-me-some-concept/hapa-overwatch-kanban/data/hapa-echo-music-video-direction/events.ndjson";
const PROGRAM_ID = "echo-record-garden-2026-07-30";
const REVIEW_PASS = PROGRAM_ID;
const PROJECT_ID = "hapa-echo-music-video-direction";
const SOURCE = "echo-record-garden-progress-2026-07-30";
const APPLY = process.argv.includes("--apply");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function safeToken(value = "") {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function evidenceItems(value = "") {
  return String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stableEventId(taskId, status, summary, evidence) {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify({ taskId, status, summary, evidence }))
    .digest("hex")
    .slice(0, 12);
  return `evt_${safeToken(taskId)}_${status}_${digest}`;
}

function eventIds(text) {
  return new Set(String(text).split("\n").filter(Boolean).map((line) => {
    try {
      return JSON.parse(line).id;
    } catch {
      return null;
    }
  }).filter(Boolean));
}

const taskId = argument("task");
const status = argument("status");
const summary = argument("summary");
const evidence = evidenceItems(argument("evidence"));

if (!/^task-record-garden-v1-(0[1-9]|1[0-4])-/.test(taskId)) {
  throw new Error("Expected --task task-record-garden-v1-01-... through task-record-garden-v1-14-...");
}
if (!["todo", "in_progress", "done"].includes(status)) {
  throw new Error("Expected --status todo, in_progress, or done");
}
if (!summary) throw new Error("Expected a non-empty --summary");
if (status !== "todo" && evidence.length === 0) {
  throw new Error("Expected at least one pipe-separated --evidence item for in_progress or done");
}
if (status === "done" && evidence.length < 3) {
  throw new Error("Completing a Record Garden task requires at least three evidence links");
}
const missingLocalEvidence = evidence.filter((item) => (
  !/^(?:https?|git):/i.test(item)
  && (!path.isAbsolute(item) || !fs.existsSync(item))
));
if (APPLY && missingLocalEvidence.length > 0) {
  throw new Error(`Evidence must be an existing absolute path or a supported URL: ${missingLocalEvidence.join(", ")}`);
}

const board = JSON.parse(fs.readFileSync(BOARD_PATH, "utf8"));
const cardsById = new Map();
for (const lane of board.lanes || []) {
  for (const candidate of lane.cards || []) cardsById.set(candidate.id, candidate);
}

const card = cardsById.get(taskId);
if (!card) throw new Error(`Board task not found: ${taskId}`);
if (card.programId !== PROGRAM_ID || card.reviewPass !== REVIEW_PASS) {
  throw new Error(`Task is not registered to ${PROGRAM_ID}: ${taskId}`);
}

const unmetDependencies = (card.dependencies || []).filter((dependencyId) => (
  cardsById.get(dependencyId)?.status !== "done"
));
if (status === "done" && unmetDependencies.length > 0) {
  throw new Error(`Cannot complete ${taskId}; unmet dependencies: ${unmetDependencies.join(", ")}`);
}

const previousStatus = card.status;
const alreadyApplied = previousStatus === status
  && String(card.progressSummary || "") === summary
  && evidence.every((item) => (card.evidence || []).includes(item));
const at = new Date().toISOString();
const eventId = stableEventId(taskId, status, summary, evidence);
const existingEvents = fs.existsSync(EVENTS_PATH)
  ? fs.readFileSync(EVENTS_PATH, "utf8")
  : "";
const eventAlreadyApplied = eventIds(existingEvents).has(eventId);

const result = {
  ok: true,
  apply: APPLY,
  programId: PROGRAM_ID,
  reviewPass: REVIEW_PASS,
  taskId,
  previousStatus,
  nextStatus: status,
  alreadyApplied,
  eventAlreadyApplied,
  unmetDependencies,
  evidence
};

if (!APPLY) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (!alreadyApplied) {
  const backupDir = path.join(path.dirname(BOARD_PATH), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `kanban.before-${safeToken(taskId)}-${safeToken(at)}.json`
  );
  fs.copyFileSync(BOARD_PATH, backupPath);
  result.boardBackupPath = backupPath;

  card.status = status;
  card.progressSummary = summary;
  card.evidence = [...new Set([...(card.evidence || []), ...evidence])];
  card.lastProgressAt = at;
  if (status === "in_progress" && !card.startedAt) card.startedAt = at;
  if (status === "done") card.completedAt = at;

  board.updatedAt = at;
  if (board.echoRecordGardenProgram?.programId === PROGRAM_ID) {
    const programTaskIds = new Set(board.echoRecordGardenProgram.taskIds || []);
    const programCards = [...cardsById.values()].filter((candidate) => programTaskIds.has(candidate.id));
    board.echoRecordGardenProgram.lastProgressAt = at;
    board.echoRecordGardenProgram.progress = {
      todo: programCards.filter((candidate) => candidate.status === "todo").length,
      inProgress: programCards.filter((candidate) => candidate.status === "in_progress").length,
      done: programCards.filter((candidate) => candidate.status === "done").length
    };
  }
  fs.writeFileSync(BOARD_PATH, `${JSON.stringify(board, null, 2)}\n`);
}

if (!eventAlreadyApplied) {
  const event = {
    id: eventId,
    project_id: PROJECT_ID,
    ts: at,
    actor: "Codex",
    type: "task_moved",
    task_id: taskId,
    parent_event_id: null,
    visibility: "project",
    protocol: {
      truthStatus: "verified_event",
      recordOwner: "hapa-overwatch-kanban",
      source: SOURCE
    },
    links: evidence.map((href) => ({
      label: path.basename(href) || "evidence",
      href
    })),
    payload: {
      programId: PROGRAM_ID,
      reviewPass: REVIEW_PASS,
      from: previousStatus,
      to: status,
      summary,
      evidence,
      acceptanceRequirements: card.acceptance || [],
      evidenceRequirements: card.evidenceRequirements || []
    }
  };
  fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(event)}\n`);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
