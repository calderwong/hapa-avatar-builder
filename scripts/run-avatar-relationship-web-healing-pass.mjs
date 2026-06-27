#!/usr/bin/env node
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");

await main();

async function main() {
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  const runId = `avatar-relationship-web-healing-${stamp}`;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(RUN_DIR, { recursive: true });
  await fs.copyFile(AVATAR_STORE_PATH, path.join(BACKUP_DIR, `avatar-store.before-${runId}.json`));

  const store = await readJson(AVATAR_STORE_PATH);
  const avatars = (store.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
  const byId = new Map(avatars.map((avatar) => [avatar.id, avatar]));
  const anchors = ["red-reaper", "avatar-2", "avatar-3"]
    .map((id) => byId.get(id))
    .filter(Boolean);
  const targets = avatars.filter((avatar) => (avatar.mind?.relationships || []).length === 0);
  const report = {
    schemaVersion: "hapa.avatar-relationship-web-healing-report.v1",
    runId,
    runAt: now,
    source: "scripts/run-avatar-relationship-web-healing-pass.mjs",
    context: "Focused pass after the duplicate Pinokio/3D Tarot app divergence was merged back into the canonical app; added soft-canon relationship records only where relationship webs were empty.",
    inputCounts: {
      avatars: avatars.length,
      avatarsWithoutRelationshipRecords: targets.length
    },
    avatars: []
  };

  targets.forEach((avatar, index) => {
    const peerTargets = nearestPeers(targets, index, avatar.id);
    const linked = [];
    for (const anchor of anchors) {
      linked.push(anchor.id);
      ensureRelationship(avatar, anchor, relationForAnchor(anchor), reasonForAnchor(avatar, anchor), anchorMetrics(anchor), now, runId);
      ensureRelationship(anchor, avatar, "recovered-roster charge", `${anchor.primaryName} recognizes ${avatar.primaryName} as a restored avatar whose canon must cite songs, cards, and lore after the app merge.`, { trust: 4, tension: 1, debt: 2, fear: 0, loyalty: 5 }, now, runId);
    }
    for (const peer of peerTargets) {
      linked.push(peer.id);
      ensureRelationship(avatar, peer, "recovered-roster peer", `${avatar.primaryName} and ${peer.primaryName} were healed in the same recovered-roster relationship web pass, so their soft canon starts with continuity witness duty.`, { trust: 3, tension: 1, debt: 1, fear: 0, loyalty: 4 }, now, runId);
      ensureRelationship(peer, avatar, "recovered-roster peer", `${peer.primaryName} and ${avatar.primaryName} share recovered-roster continuity witness duty after the duplicate app split was repaired.`, { trust: 3, tension: 1, debt: 1, fear: 0, loyalty: 4 }, now, runId);
    }
    ensureJournalEntry(avatar, linked.map((id) => byId.get(id)).filter(Boolean), now, runId);
    ensureGenesisRun(avatar, linked, now, runId);
    avatar.updatedAt = now;
    report.avatars.push({
      avatarId: avatar.id,
      avatarName: avatar.primaryName,
      relationshipRecords: avatar.mind.relationships.length,
      linkedAvatarIds: unique(linked),
      journalEntries: avatar.mind.journal.length
    });
  });

  store.avatars = avatars;
  store.updatedAt = now;
  store.relationshipWebHealing = {
    schemaVersion: "hapa.avatar-store.relationship-web-healing.v1",
    runId,
    runAt: now,
    healedAvatarCount: targets.length,
    context: report.context
  };

  report.outputCounts = {
    avatars: avatars.length,
    avatarsWithRelationshipRecords: avatars.filter((avatar) => (avatar.mind?.relationships || []).length > 0).length,
    avatarsWithJournals: avatars.filter((avatar) => (avatar.mind?.journal || []).length > 0).length,
    totalRelationshipRecords: avatars.reduce((sum, avatar) => sum + (avatar.mind?.relationships || []).length, 0)
  };

  await writeJson(AVATAR_STORE_PATH, store);
  const runPath = path.join(RUN_DIR, `${runId}.json`);
  const latestPath = path.join(RUN_DIR, "latest-avatar-relationship-web-healing.json");
  await writeJson(runPath, report);
  await writeJson(latestPath, report);

  console.log(JSON.stringify({
    ok: true,
    runId,
    reportPath: path.relative(ROOT, latestPath),
    healedAvatars: targets.length,
    avatarsWithRelationshipRecords: report.outputCounts.avatarsWithRelationshipRecords,
    avatarsWithJournals: report.outputCounts.avatarsWithJournals,
    totalRelationshipRecords: report.outputCounts.totalRelationshipRecords
  }, null, 2));
}

function relationForAnchor(anchor) {
  if (anchor.id === "red-reaper") return "fire-control sponsor";
  if (anchor.id === "avatar-2") return "architecture witness";
  if (anchor.id === "avatar-3") return "growth witness";
  return "canon witness";
}

function reasonForAnchor(avatar, anchor) {
  if (anchor.id === "red-reaper") return `${avatar.primaryName} treats Red as the recovered-roster fire-control sponsor: verify source paths, then act without erasing repair.`;
  if (anchor.id === "avatar-2") return `${avatar.primaryName} treats Blue as the architecture witness who checks whether avatar, card, song, and lore links actually line up.`;
  if (anchor.id === "avatar-3") return `${avatar.primaryName} treats Green as the growth witness who keeps the restored canon emotionally usable and non-brittle.`;
  return `${avatar.primaryName} treats ${anchor.primaryName} as a canon witness for the recovered roster.`;
}

function anchorMetrics(anchor) {
  if (anchor.id === "red-reaper") return { trust: 5, tension: 1, debt: 2, fear: 0, loyalty: 5 };
  if (anchor.id === "avatar-2") return { trust: 4, tension: 1, debt: 1, fear: 0, loyalty: 4 };
  if (anchor.id === "avatar-3") return { trust: 4, tension: 0, debt: 1, fear: 0, loyalty: 4 };
  return { trust: 3, tension: 1, debt: 1, fear: 0, loyalty: 3 };
}

function nearestPeers(targets, index, selfId) {
  return [targets[index - 1], targets[index + 1]]
    .filter((avatar) => avatar?.id && avatar.id !== selfId);
}

function ensureRelationship(source, target, relationLabel, reason, metrics, now, runId) {
  if (!source?.id || !target?.id || source.id === target.id) return;
  source.mind = source.mind || {};
  source.mind.relationships = source.mind.relationships || [];
  const existing = source.mind.relationships.find((relationship) =>
    relationship.targetAvatarId === target.id &&
    relationship.relationLabel === relationLabel &&
    relationship.source === "relationship-web-healing-pass"
  );
  if (existing) return;
  source.mind.relationships.push({
    id: `rel-${source.id}-${target.id}-${slugify(relationLabel)}`,
    targetAvatarId: target.id,
    targetName: target.primaryName,
    relationLabel,
    classification: "generated",
    confidence: "generated",
    visibility: "shared",
    reason,
    source: "relationship-web-healing-pass",
    sourceRunId: runId,
    trust: metrics.trust,
    tension: metrics.tension,
    debt: metrics.debt,
    fear: metrics.fear,
    loyalty: metrics.loyalty,
    status: "active",
    createdAt: now,
    updatedAt: now
  });
  source.mind.updatedAt = now;
}

function ensureJournalEntry(avatar, linkedAvatars, now, runId) {
  avatar.mind = avatar.mind || {};
  avatar.mind.journal = avatar.mind.journal || [];
  const id = `${avatar.id}-relationship-web-healing-journal`;
  if (avatar.mind.journal.some((entry) => entry.id === id)) return;
  const names = linkedAvatars.map((item) => item.primaryName).filter(Boolean);
  avatar.mind.journal.push({
    id,
    schemaVersion: "hapa.avatar-journal-entry.v1",
    journalType: "canon-healing",
    dateOrSequenceMarker: "post-merge relationship web healing",
    entryVoice: "lorekeeper",
    privateEntry: `${avatar.primaryName} was restored into the canonical app after the duplicate Pinokio/3D Tarot divergence. The first relationship web is intentionally modest: Red verifies action, Blue checks structure, Green checks growth, and recovered peers witness continuity. These links are soft canon until human review.`,
    publicSummary: `${avatar.primaryName} received a recovered-roster relationship web linking core protocol witnesses and nearby restored peers.`,
    mentionedAvatarIds: linkedAvatars.map((item) => item.id),
    mentionedAvatarNames: names,
    classification: "generated",
    canonStatus: "soft_canon",
    causalityStatus: "causality-review-pending",
    reviewedAvatarIds: linkedAvatars.map((item) => item.id),
    reviewedAvatarNames: names,
    responsibilityTags: ["relationship-web", "recovered-roster", "canon-healing"],
    sourceRefs: [
      {
        id: runId,
        title: "Avatar Relationship Web Healing Pass",
        path: "scripts/run-avatar-relationship-web-healing-pass.mjs",
        confidence: "generated"
      }
    ],
    status: "active",
    createdAt: now,
    updatedAt: now
  });
}

function ensureGenesisRun(avatar, linkedAvatarIds, now, runId) {
  avatar.mind = avatar.mind || {};
  avatar.mind.genesisRuns = avatar.mind.genesisRuns || [];
  if (avatar.mind.genesisRuns.some((run) => run.id === runId)) return;
  avatar.mind.genesisRuns.push({
    id: runId,
    schemaVersion: "hapa.avatar-genesis-run.v1",
    runType: "relationship-web-healing",
    title: "Recovered Roster Relationship Web Healing",
    sourcePath: "scripts/run-avatar-relationship-web-healing-pass.mjs",
    summary: `${avatar.primaryName} received reciprocal soft-canon relationship links after the recovered app merge.`,
    canonStatus: "soft_canon",
    reviewedInputs: ["data/avatar-store.json", "data/avatar-agent-runs/latest-recovered-roster-genesis-healing.json"],
    outputRefs: linkedAvatarIds,
    status: "complete",
    createdAt: now,
    updatedAt: now
  });
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
