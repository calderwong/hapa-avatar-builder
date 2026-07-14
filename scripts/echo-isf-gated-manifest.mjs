import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applyIsfPixelGate, repairIsfVisualizerTimeline } from "../src/domain/isf-pixel-gate.js";

export const DEFAULT_ECHO_ISF_MANIFEST_PATH = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
export const DEFAULT_ECHO_ISF_PIXEL_GATE_PATH = "/Users/calderwong/Desktop/hapa-music-viz/docs/ISF_ALL_SHADER_PIXEL_GATE_REPORT.json";

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function normalizedHash(value = "") {
  return String(value || "").trim().replace(/^sha256:/i, "").toLowerCase();
}

function requiredBytes(filePath, label) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is required before Director shader selection: ${filePath || "missing path"}`);
  }
  return fs.readFileSync(filePath);
}

export function loadGatedEchoIsfManifest({
  manifestPath = DEFAULT_ECHO_ISF_MANIFEST_PATH,
  pixelGatePath = DEFAULT_ECHO_ISF_PIXEL_GATE_PATH,
} = {}) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const resolvedPixelGatePath = path.resolve(pixelGatePath);
  const manifestBytes = requiredBytes(resolvedManifestPath, "ISF manifest");
  const pixelGateBytes = requiredBytes(resolvedPixelGatePath, "ISF pixel-gate report");
  const sourceManifest = JSON.parse(manifestBytes.toString("utf8"));
  const pixelGate = JSON.parse(pixelGateBytes.toString("utf8"));
  if (!Array.isArray(pixelGate?.classifications) || pixelGate.classifications.length === 0) {
    throw new Error(`ISF pixel-gate report has no shader classifications: ${resolvedPixelGatePath}`);
  }
  const classificationById = new Map(pixelGate.classifications.map((entry) => [String(entry?.id || ""), entry]));
  const staleOrMissing = (Array.isArray(sourceManifest?.shaders) ? sourceManifest.shaders : []).flatMap((shader) => {
    const entry = classificationById.get(String(shader?.id || ""));
    if (entry && normalizedHash(entry.sourceHash) === normalizedHash(shader?.sourceHash)) return [];
    return [{ id: String(shader?.id || ""), reason: entry ? "source-hash-mismatch" : "classification-missing" }];
  });
  if (staleOrMissing.length) {
    throw new Error(`ISF pixel-gate report is stale or incomplete for ${staleOrMissing.length} shader(s); rerun the pixel gate before Director selection. First: ${staleOrMissing[0].id} (${staleOrMissing[0].reason}).`);
  }
  const manifest = applyIsfPixelGate(sourceManifest, pixelGate);
  return {
    manifest,
    sourceManifest,
    pixelGate,
    manifestPath: resolvedManifestPath,
    pixelGatePath: resolvedPixelGatePath,
    manifestBytes,
    pixelGateBytes,
    manifestHash: sha256(manifestBytes),
    pixelGateHash: sha256(pixelGateBytes),
    quarantinedShaderCount: manifest.shaders.filter((shader) => shader.runtimeEligibility === "unsupported-quarantine").length,
  };
}

export function repairEchoProjectShaders(sourcePayload = {}, manifest = {}) {
  const project = sourcePayload?.music_video_project || sourcePayload;
  const shaderRepair = repairIsfVisualizerTimeline(project?.visualizer_timeline, manifest);
  if (!shaderRepair.ok) {
    const error = new Error(`Pixel-gate quarantine could not be repaired before Director compilation for ${project?.song_id || "unknown song"}.`);
    error.code = "echo_shader_quarantine_unresolved";
    error.shaderRepair = shaderRepair;
    throw error;
  }
  const repairedProject = {
    ...project,
    visualizer_timeline: shaderRepair.timeline,
    runtime_shader_repair_receipt: {
      ...shaderRepair,
      nonDestructive: true,
      sourceProjectMutated: false,
    },
  };
  return {
    project: sourcePayload?.music_video_project
      ? { ...sourcePayload, music_video_project: repairedProject }
      : repairedProject,
    projectBody: repairedProject,
    shaderRepair,
  };
}
