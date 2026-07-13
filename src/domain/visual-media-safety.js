import crypto from "node:crypto";

export const VISUAL_MEDIA_SAFETY_SCHEMA = "hapa.export.visual-media-safety.v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const finding = ({ code, severity, atSeconds = 0, endSeconds = atSeconds, graphNodeId = null, sourceAsset = null, evidence = {}, message }) => ({ id: `finding:${hash([code, atSeconds, graphNodeId, sourceAsset]).slice(0, 16)}`, code, severity, atSeconds, endSeconds, graphNodeId, sourceAsset, evidence, message });

export function runVisualMediaSafetyProbe(input = {}) {
  const findings = [];
  for (const span of input.blackSpans || []) if (span.durationSeconds >= 0.5) findings.push(finding({ code: "black-frame-span", severity: "hard", atSeconds: span.startSeconds, endSeconds: span.endSeconds, graphNodeId: span.graphNodeId, sourceAsset: span.sourceAsset, evidence: span, message: "Sustained near-black output exceeds the release threshold." }));
  for (const span of input.frozenSpans || []) if (span.durationSeconds >= 2) findings.push(finding({ code: "frozen-texture-span", severity: "hard", atSeconds: span.startSeconds, endSeconds: span.endSeconds, graphNodeId: span.graphNodeId, sourceAsset: span.sourceAsset, evidence: span, message: "Rendered texture is unchanged for at least two seconds." }));
  for (const media of input.media || []) {
    if (media.status === "missing" || media.status === "corrupt") findings.push(finding({ code: `media-${media.status}`, severity: "hard", atSeconds: media.atSeconds, graphNodeId: media.graphNodeId, sourceAsset: media.sourceAsset, evidence: media, message: `Required media is ${media.status}.` }));
    if (media.orientationMismatch || media.blackMatExposure) findings.push(finding({ code: "orientation-or-black-mat", severity: "hard", atSeconds: media.atSeconds, graphNodeId: media.graphNodeId, sourceAsset: media.sourceAsset, evidence: media, message: "Media crop cannot fill the target aspect safely." }));
  }
  for (const lyric of input.lyrics || []) {
    if (Number(lyric.contrastRatio) < 4.5 || lyric.occludesSubject) findings.push(finding({ code: "lyric-legibility", severity: "soft", atSeconds: lyric.atSeconds, endSeconds: lyric.endSeconds, graphNodeId: lyric.graphNodeId, sourceAsset: lyric.sourceAsset, evidence: lyric, message: "Lyric placement or contrast needs operator review." }));
  }
  const flashes = [...(input.flashes || [])].sort((a, b) => a.atSeconds - b.atSeconds);
  for (let index = 0; index < flashes.length; index += 1) {
    const window = flashes.filter((row) => row.atSeconds >= flashes[index].atSeconds && row.atSeconds < flashes[index].atSeconds + 1);
    if (window.length > 3 || window.some((row) => row.luminanceDelta > 0.2 || row.frameArea > 0.25)) {
      findings.push(finding({ code: "unsafe-flash-density", severity: "hard", atSeconds: flashes[index].atSeconds, endSeconds: flashes[index].atSeconds + 1, graphNodeId: flashes[index].graphNodeId, sourceAsset: flashes[index].sourceAsset, evidence: { flashes: window }, message: "Flash density, luminance, or affected area exceeds the safe default." }));
      break;
    }
  }
  for (const camera of input.camera || []) if (camera.velocityPerSecond > 1.5 || camera.zoom > 1.18 || camera.blackMatExposure) findings.push(finding({ code: "unsafe-camera-motion", severity: "soft", atSeconds: camera.atSeconds, graphNodeId: camera.graphNodeId, sourceAsset: camera.sourceAsset, evidence: camera, message: "Camera velocity or crop exceeds the comfort envelope." }));
  for (const audio of input.audio || []) if (audio.truePeakDbTP > -1 || audio.clippedSamples > 0) findings.push(finding({ code: "audio-clipping", severity: "hard", atSeconds: audio.atSeconds, graphNodeId: audio.graphNodeId, sourceAsset: audio.sourceAsset, evidence: audio, message: "Audio exceeds the -1 dBTP or clipped-sample release limit." }));
  for (const telemetry of input.telemetry || []) if (telemetry.stale || telemetry.durationMismatchSeconds > 0.1 || telemetry.sourceHashMismatch) findings.push(finding({ code: "stale-stem-telemetry", severity: "hard", atSeconds: telemetry.atSeconds || 0, graphNodeId: telemetry.graphNodeId, sourceAsset: telemetry.sourceAsset, evidence: telemetry, message: "Stem telemetry no longer matches its source or show duration." }));
  const acknowledgements = new Map((input.acknowledgements || []).map((row) => [row.findingId, row]));
  const unacknowledgedSoft = findings.filter((row) => row.severity === "soft" && !(acknowledgements.get(row.id)?.operator && acknowledgements.get(row.id)?.rationale && acknowledgements.get(row.id)?.acknowledgedAt));
  const hard = findings.filter((row) => row.severity === "hard");
  return {
    schemaVersion: VISUAL_MEDIA_SAFETY_SCHEMA,
    exportId: input.exportId || null,
    ok: hard.length === 0 && unacknowledgedSoft.length === 0,
    approval: hard.length ? "blocked-hard-failure" : unacknowledgedSoft.length ? "blocked-unacknowledged-warning" : "approved",
    summary: { hard: hard.length, soft: findings.length - hard.length, acknowledgedSoft: findings.filter((row) => row.severity === "soft" && acknowledgements.has(row.id)).length, unacknowledgedSoft: unacknowledgedSoft.length },
    findings,
    acknowledgements: [...acknowledgements.values()],
  };
}

export function acknowledgeSafetyFinding({ findingId, operator, rationale, acknowledgedAt }) {
  const receipt = { schemaVersion: "hapa.export.safety-acknowledgement.v1", findingId, operator, rationale, acknowledgedAt };
  return { ...receipt, receiptHash: hash(receipt) };
}
