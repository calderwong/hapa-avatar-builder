#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeHumanVideoAgentReview } from "../src/domain/human-video-agent-review.js";

const args = process.argv.slice(2);
const outputFlag = args.indexOf("--out");
const inputPaths = (outputFlag >= 0 ? args.slice(0, outputFlag) : args).filter((value) => !value.startsWith("--"));
const outputPath = outputFlag >= 0 ? args[outputFlag + 1] : "work/human-enricher-optical/normalized-review-import.json";
if (!inputPaths.length) throw new Error("Usage: node scripts/prepare-human-video-optical-review-import.mjs <packet.json> [...] --out <normalized.json>");

const reviews = [];
for (const inputPath of inputPaths) {
  const absoluteInput = path.resolve(inputPath);
  const packet = JSON.parse(await readFile(absoluteInput, "utf8"));
  for (const [index, source] of (packet.reviews || []).entries()) reviews.push(await adaptReview(packet, source, index, absoluteInput));
}

const output = {
  schemaVersion: "hapa.human-video-agent-review-import.v1",
  preparedAt: new Date().toISOString(),
  semanticJudgmentAutomation: false,
  preparationBoundary: "This command only maps agent-authored fields and hashes delivered images. It performs no grading, tagging, categorization, identity matching, or reference inference.",
  reviews,
};
await writeFile(path.resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), reviewCount: reviews.length }, null, 2));

async function adaptReview(packet, source, index, packetPath) {
  if (source.schemaVersion === "hapa.human-video-agent-review.v1" && source.proposal && source.evidence?.frames) {
    return normalizeHumanVideoAgentReview({
      ...source,
      reviewer: { ...(packet.reviewer || {}), ...(source.reviewer || {}) },
      evidence: { ...source.evidence, requiredFrameCount: source.evidence.requiredFrameCount || source.evidence.frames.length },
    });
  }
  const identity = source.stableIdentity || {};
  const videoKey = source.humanVideoKey || identity.humanVideoKey;
  const frameRows = source.framesInspected || [];
  const frames = [];
  for (const [frameIndex, frame] of frameRows.entries()) {
    const declaredFramePath = frame.path || frame.imagePath || "";
    const framePath = path.isAbsolute(declaredFramePath) ? declaredFramePath : path.resolve(process.cwd(), declaredFramePath);
    const bytes = await readFile(framePath);
    frames.push({
      timestampSeconds: Number(frame.timestampSeconds ?? frame.timestampSec ?? 0),
      normalizedPosition: frameRows.length === 1 ? 0 : frameIndex / (frameRows.length - 1),
      imagePath: framePath,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      observation: frame.observation || frame.visualObservation,
    });
  }
  const quality = source.quality || {};
  const visual = source.visualObservation || {};
  const sourceAvatars = (source.suggestedAvatarMentions || source.suggestedAvatars || []).flatMap((relationship) => {
    if (!Array.isArray(relationship.mentions)) return [relationship];
    return relationship.mentions.map((mention, mentionIndex) => ({ ...relationship, mention, avatarId: relationship.avatarIds?.[mentionIndex] || "" }));
  });
  const sourceReferences = source.suggestedReferences || [];
  const knowledgeSources = packet.knowledgeSourcesConsulted || packet.knowledgeSources || [];
  const reviewer = packet.reviewer || {};
  return normalizeHumanVideoAgentReview({
    id: `${videoKey}:optical:${packet.batchId || path.basename(packetPath, ".json")}`,
    videoKey,
    videoId: source.id || identity.id,
    videoName: source.videoName || source.name || source.title || identity.id || `catalog-offset-${source.catalogOffset ?? index}`,
    videoIdentity: {
      recordId: source.id || identity.id || "",
      assetId: identity.assetId || "",
      contentFingerprint: identity.contentFingerprint || (videoKey?.startsWith("fingerprint:") ? videoKey.replace(/^fingerprint:/, "") : ""),
      uri: source.mediaUri || identity.mediaUri || "",
      sourcePath: source.sourcePath || identity.sourcePath || "",
    },
    status: "pending-human",
    reviewer: {
      agentId: reviewer.agentId || reviewer.task || reviewer.taskId,
      taskId: reviewer.taskId || reviewer.task || packet.batchId,
      model: reviewer.model || "GPT-5 Codex",
      opticalInspectionConfirmed: reviewer.opticalInspectionConfirmed === true,
      attestation: reviewer.attestation || packet.method?.visualReview || packet.methodology?.visualReview || "",
    },
    evidence: { frames },
    proposal: {
      description: source.visualDescription || visual.description,
      quality: {
        value: quality.value ?? quality.grade,
        explanation: quality.explanation,
        technicalUsability: quality.technicalUsability,
        visualCraft: quality.visualCraft,
        narrativeValue: quality.narrativeValue,
        identityConfidence: quality.identityConfidence,
      },
      categories: source.categories || [],
      tags: source.tags || [],
      avatarRelationships: sourceAvatars.map((relationship) => ({
        avatarId: relationship.avatarId || "",
        avatarName: String(relationship.mention || relationship.label || "").replace(/^@/, ""),
        relationship: relationship.relationship || "suggested-visible-or-thematic-avatar",
        evidenceType: evidenceType(relationship.evidenceKind || relationship.evidenceType),
        explanation: relationship.explanation || relationship.evidence,
        confidence: relationship.confidence,
      })),
      references: sourceReferences.map((reference) => ({
        type: normalizeReferenceType(reference.type),
        id: reference.id,
        label: reference.title || reference.label,
        uri: reference.uri || "",
        evidenceType: evidenceType(reference.evidenceKind || reference.evidenceType),
        explanation: reference.explanation || reference.evidence,
        confidence: reference.confidence,
      })),
      directorNotes: source.directorNotes,
      strengths: source.strengths || [],
      issues: (source.technicalArtisticIssues || source.issues || []).map((issue) => typeof issue === "string" ? issue : issue.detail).filter(Boolean),
      uncertainty: Array.isArray(source.uncertainty) ? source.uncertainty.join("\n") : source.uncertainty,
      confidence: source.confidence,
    },
    knowledgeComparisons: knowledgeSources.map((item) => ({
      sourcePath: typeof item === "string" ? item : item.path || item.sourcePath,
      entityLabel: typeof item === "string" ? "Hapa knowledge source" : item.label || item.title,
      relationship: "reviewer-consulted-source",
      explanation: "Consulted after direct optical review for the explicitly labeled relationship and reference suggestions in this proposal.",
      confidence: 1,
    })),
    createdAt: packet.reviewedAt,
    updatedAt: packet.reviewedAt,
  });
}

function evidenceType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("catalog") || text.includes("authoritative") || text.includes("source-relationship")) return "source-relationship";
  if (text.includes("visual") && !text.includes("knowledge")) return "visual-observation";
  return "knowledge-base-inference";
}

function normalizeReferenceType(value) {
  return new Set(["echo-song", "song", "card", "scene", "avatar", "url", "other"]).has(value) ? value : "other";
}
