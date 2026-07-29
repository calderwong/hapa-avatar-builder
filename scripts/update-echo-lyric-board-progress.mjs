#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const BOARD_PATH = "/Users/calderwong/Desktop/Echos-of-Other-Eras-Album-App/kanban.json";
const EVENTS_PATH = "/Users/calderwong/Documents/Codex/2026-05-27/can-you-generate-me-some-concept/hapa-overwatch-kanban/data/hapa-echo-music-video-direction/events.ndjson";
const PROJECT_ID = "hapa-echo-music-video-direction";
const APPLY = process.argv.includes("--apply");

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function safeToken(value = "") {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_");
}

const taskId = argument("task");
const status = argument("status");
const summary = argument("summary");
const evidence = argument("evidence").split("|").map((item) => item.trim()).filter(Boolean);
if (!taskId.startsWith("task-lyrics-v4-")) throw new Error("Expected --task task-lyrics-v4-...");
if (!["todo", "in_progress", "done"].includes(status)) throw new Error("Expected --status todo, in_progress, or done");
if (!summary) throw new Error("Expected a non-empty --summary");

const board = JSON.parse(fs.readFileSync(BOARD_PATH, "utf8"));
let card = null;
for (const lane of board.lanes || []) {
  const match = (lane.cards || []).find((candidate) => candidate.id === taskId);
  if (match) {
    card = match;
    break;
  }
}
if (!card) throw new Error(`Board task not found: ${taskId}`);

const previousStatus = card.status;
const alreadyApplied = previousStatus === status
  && String(card.progressSummary || "") === summary
  && evidence.every((item) => (card.evidence || []).includes(item));
const at = new Date().toISOString();
const eventId = `evt_${safeToken(taskId)}_${status}_${safeToken(summary).slice(0, 60)}`;
const existingEvents = fs.existsSync(EVENTS_PATH) ? fs.readFileSync(EVENTS_PATH, "utf8") : "";
const eventAlreadyApplied = existingEvents.includes(`"id":"${eventId}"`);

const result = {
  ok: true,
  apply: APPLY,
  taskId,
  previousStatus,
  nextStatus: status,
  alreadyApplied,
  eventAlreadyApplied,
  evidence,
};

if (!APPLY) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (!alreadyApplied) {
  const backupDir = path.join(path.dirname(BOARD_PATH), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `kanban.before-${safeToken(taskId)}-${safeToken(at)}.json`);
  fs.copyFileSync(BOARD_PATH, backupPath);
  card.status = status;
  card.progressSummary = summary;
  card.evidence = [...new Set([...(card.evidence || []), ...evidence])];
  if (status === "in_progress" && !card.startedAt) card.startedAt = at;
  if (status === "done") card.completedAt = at;
  board.updatedAt = at;
  fs.writeFileSync(BOARD_PATH, `${JSON.stringify(board, null, 2)}\n`);
  result.boardBackupPath = backupPath;
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
      source: "echo-lyric-quality-drain",
    },
    links: evidence.map((href) => ({ label: path.basename(href), href })),
    payload: {
      from: previousStatus,
      to: status,
      summary,
      evidence,
    },
  };
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(event)}\n`);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
