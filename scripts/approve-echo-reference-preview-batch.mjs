#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RUN_PATH = path.resolve(option("--run", path.join(ROOT, "data/echo-reference-research-loop/projected-run.json")));
const MEDIA_PATH = path.resolve(option("--media", path.join(ROOT, "data/echo-reference-animated-media.json")));
const RECEIPT_PATH = path.resolve(option(
  "--receipt",
  path.join(ROOT, "data/echo-reference-governance/preview-first-authority.json")
));
const BACKUP_DIR = path.join(ROOT, "data/backups");

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonIfPresent(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

async function backupExisting(filePath, stamp) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return null;
  await mkdir(BACKUP_DIR, { recursive: true });
  const target = path.join(BACKUP_DIR, `echo-reference-preview-authority-${stamp}.json`);
  await copyFile(filePath, target);
  return target;
}

function cardEntry(card = {}) {
  return {
    cardId: String(card.id || ""),
    revisionId: String(card.revisionId || ""),
    evidenceClass: String(card.authority?.evidenceClass || "unresolved"),
  };
}

function mediaEntry(record = {}) {
  return {
    cardId: String(record.card?.id || record.cardId || ""),
    revisionId: String(record.card?.revisionId || record.cardRevisionId || ""),
    imageSha256: String(record.artifacts?.image?.sha256 || ""),
    loopSha256: String(record.artifacts?.loopVideo?.sha256 || ""),
    directorEligible: record.technical?.directorEligible === true,
  };
}

async function main() {
  const [run, mediaCatalog] = await Promise.all([readJson(RUN_PATH), readJson(MEDIA_PATH)]);
  if (!run.runHash || !list(run.cards).length) throw new Error("Reference run is missing cards or run identity.");
  const supportedCards = list(run.cards)
    .filter((card) => card.authority?.evidenceClass !== "unresolved")
    .map(cardEntry);
  const unresolvedCards = list(run.cards)
    .filter((card) => card.authority?.evidenceClass === "unresolved")
    .map((card) => ({
      ...cardEntry(card),
      reason: "The current pass did not produce enough evidence to promote this lead as a reference.",
    }));
  const researchUpdates = list(run.contributions)
    .filter((entry) => /research/i.test(String(entry?.kind || entry?.type || entry?.eventType || "")))
    .map((entry) => ({
      id: String(entry.id || ""),
      resultHash: String(entry.resultHash || entry.contentDigest || ""),
      priorStatus: String(entry.status || ""),
    }));
  const media = list(mediaCatalog.records).map(mediaEntry);
  const invalidMedia = media.filter((entry) => (
    !entry.cardId
    || !entry.revisionId
    || !entry.imageSha256
    || !entry.loopSha256
    || !entry.directorEligible
  ));
  if (invalidMedia.length) {
    throw new Error(`${invalidMedia.length} media records are incomplete or not Director-eligible.`);
  }

  const approvedAt = new Date().toISOString();
  const actor = option("--actor", "Calder Wong");
  const reason = option(
    "--reason",
    "Human owner authorized blanket local approval so references and generated visuals can be inspected and used without a visibility-blocking review gate."
  );
  const payload = {
    schemaVersion: "hapa.echo-reference-preview-first-authority.v1",
    createdAt: approvedAt,
    approvedAt,
    actor,
    approvedBy: actor,
    authority: "human-owner-explicit",
    reason,
    source: {
      runId: String(run.runId || ""),
      runHash: String(run.runHash || ""),
      graphHash: String(run.graph?.graphHash || ""),
      packetHash: String(run.packetHash || ""),
      mediaCatalogHash: digest(mediaCatalog.records),
    },
    policy: {
      previewVisibility: "visible-before-review",
      approvalControlsAuthorityNotVisibility: true,
      approvedUseScopes: [
        "local-reference-atlas",
        "tarot-draw-reference-runtime",
        "echo-director-candidate",
      ],
      unresolvedDisposition: "resolved-without-promotion-and-retriable",
      publicActivation: false,
      canonPromotion: false,
      mint: false,
      commerce: false,
    },
    approvedCards: supportedCards,
    resolvedWithoutPromotion: unresolvedCards,
    resolvedResearchUpdates: researchUpdates,
    approvedMedia: media,
    connectionDecision: {
      approveEvidenceClasses: ["direct", "source-backed-candidate", "comparative"],
      resolveWithoutPromotionEvidenceClasses: ["unresolved"],
      preserveChallenges: true,
    },
    counts: {
      approvedCards: supportedCards.length,
      resolvedWithoutPromotion: unresolvedCards.length,
      resolvedUnresolvedNodes: list(run.unresolved).length,
      resolvedResearchUpdates: researchUpdates.length,
      approvedMedia: media.length,
      approvedConnections: list(run.graph?.edges).filter((edge) => edge.evidenceClass !== "unresolved").length,
      resolvedConnections: list(run.graph?.edges).filter((edge) => edge.evidenceClass === "unresolved").length,
    },
    guardrails: {
      everyProposalVisibleBeforeApproval: true,
      generatedMediaVisibleBeforeApproval: true,
      exactCardRevisionBindingRequired: true,
      sourceCardsUnchanged: true,
      generatedOutputIsIdentityTruth: false,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
    },
  };
  const authorityBasisHash = digest({
    ...payload,
    createdAt: "",
    approvedAt: "",
  });
  const existingReceipt = await readJsonIfPresent(RECEIPT_PATH);
  const idempotentReplay = existingReceipt?.authorityBasisHash === authorityBasisHash;
  const receipt = idempotentReplay ? existingReceipt : {
    ...payload,
    authorityBasisHash,
    id: `echo-reference-preview-authority:${authorityBasisHash.replace("sha256:", "").slice(0, 24)}`,
  };
  const stamp = approvedAt.replace(/[:.]/g, "-");
  const backupPath = APPLY && !idempotentReplay ? await backupExisting(RECEIPT_PATH, stamp) : null;
  if (APPLY && !idempotentReplay) await atomicWriteJson(RECEIPT_PATH, receipt);
  console.log(JSON.stringify({
    ok: true,
    command: "approve-preview-batch",
    mode: APPLY ? "apply" : "dry-run",
    receiptPath: path.relative(ROOT, RECEIPT_PATH),
    backupPath: backupPath ? path.relative(ROOT, backupPath) : null,
    idempotentReplay,
    receiptId: receipt.id,
    source: receipt.source,
    policy: receipt.policy,
    counts: receipt.counts,
    guardrails: receipt.guardrails,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
