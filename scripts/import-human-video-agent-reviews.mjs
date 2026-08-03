#!/usr/bin/env node
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { openHumanVideoAgentReviewStore } from "../server/human-video-agent-review-store.mjs";

const args = process.argv.slice(2);
const value = (name, fallback = "") => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const inputPath = path.resolve(value("--file"));
if (!value("--file")) throw new Error("Usage: node scripts/import-human-video-agent-reviews.mjs --file <normalized-review-import.json> [--apply]");
const root = path.resolve(new URL("..", import.meta.url).pathname);
const filePath = path.resolve(value("--store", path.join(root, "data/human-video-agent-reviews.json")));
const eventPath = path.resolve(value("--events", path.join(root, "data/human-video-agent-review-events.ndjson")));
const packet = JSON.parse(await readFile(inputPath, "utf8"));
const reviews = Array.isArray(packet.reviews) ? packet.reviews : [];
if (!reviews.length) throw new Error("The normalized optical review packet contains no reviews.");

if (!args.includes("--apply")) {
  console.log(JSON.stringify({ dryRun: true, inputPath, filePath, eventPath, reviewCount: reviews.length, semanticJudgmentAutomation: false }, null, 2));
  process.exit(0);
}

if (await exists(filePath)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(root, "data/backups", `human-video-agent-reviews-${stamp}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
}

const store = openHumanVideoAgentReviewStore({ filePath, eventPath });
const imported = [];
for (const review of reviews) imported.push((await store.submit({ ...review, expectedRevision: undefined }, { agentId: review.reviewer?.agentId })).review);
console.log(JSON.stringify({ applied: true, inputPath, filePath, eventPath, reviewCount: imported.length, pendingHuman: imported.filter((review) => review.status === "pending-human").length }, null, 2));

async function exists(filePath) { try { await stat(filePath); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }
