function normalizedHash(value = "") {
  return String(value || "").trim().replace(/^sha256:/i, "").toLowerCase();
}

function stableIndex(value, length) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(String(value || ""))) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return length > 0 ? (hash >>> 0) % length : -1;
}

export function applyIsfPixelGate(manifest = {}, report = null) {
  const classifications = new Map((Array.isArray(report?.classifications) ? report.classifications : [])
    .map((entry) => [String(entry?.id || ""), entry]));
  return {
    ...manifest,
    shaders: (Array.isArray(manifest?.shaders) ? manifest.shaders : []).map((shader) => {
      const entry = classifications.get(String(shader?.id || "")) || null;
      const sourceMatches = Boolean(entry && normalizedHash(entry.sourceHash) === normalizedHash(shader.sourceHash));
      const quarantined = sourceMatches && entry.classification === "unsupported-quarantine";
      const directorEligible = shader.directorEligible !== false && shader.enabled !== false && !quarantined;
      return {
        ...shader,
        directorEligible,
        enabled: shader.enabled !== false && !quarantined,
        runtimeEligibility: quarantined ? "unsupported-quarantine" : directorEligible ? "eligible" : "manifest-ineligible",
        runtimeEligibilityReason: quarantined ? entry.reason || "browser-isf-compile-or-draw-failed" : directorEligible ? "source-hash-verified-pixel-gate" : "manifest-disabled",
        pixelGate: entry ? {
          schemaVersion: report?.schemaVersion || "",
          status: sourceMatches ? "source-hash-verified" : "stale-source-hash",
          classification: entry.classification || "unclassified",
          reason: entry.reason || "",
          compileAttempted: entry.compileAttempted === true,
          drawAttempted: entry.drawAttempted === true,
          playableFrameIndices: Array.isArray(entry.playableFrameIndices) ? entry.playableFrameIndices : [],
        } : {
          schemaVersion: report?.schemaVersion || "",
          status: report ? "classification-missing" : "report-unavailable",
          classification: "unclassified",
          reason: report ? "shader-id-not-present-in-pixel-gate" : "pixel-gate-report-unavailable",
          compileAttempted: false,
          drawAttempted: false,
          playableFrameIndices: [],
        },
      };
    }),
  };
}

export function isfPixelGateReplacement(shader, shaders = []) {
  if (!shader || shader.runtimeEligibility !== "unsupported-quarantine") return null;
  const eligible = (Array.isArray(shaders) ? shaders : []).filter((candidate) => (
    candidate?.directorEligible !== false
    && candidate?.enabled !== false
    && candidate?.runtimeEligibility !== "unsupported-quarantine"
    && candidate?.pixelGate?.classification === "hash-bound-exact-proxy"
    && candidate?.pixelGate?.status === "source-hash-verified"
    && candidate?.id
    && candidate?.source
  ));
  const sameRole = eligible.filter((candidate) => String(candidate.hmvRole || "") === String(shader.hmvRole || ""));
  const sameType = eligible.filter((candidate) => String(candidate.shaderType || "") === String(shader.shaderType || ""));
  const mediaIndependentSameRole = sameRole.filter((candidate) => String(candidate.shaderType || "").toLowerCase() !== "filter");
  const mediaIndependent = eligible.filter((candidate) => String(candidate.shaderType || "").toLowerCase() !== "filter");
  // Quarantine replacement is a recovery path. Preserve the editorial role
  // first, but prefer a source that can render without a transient media input
  // so the replacement cannot inherit the failed filter's blank-frame risk.
  const candidates = (mediaIndependentSameRole.length
    ? mediaIndependentSameRole
    : sameRole.length
      ? sameRole
      : sameType.length
        ? sameType
        : mediaIndependent.length
          ? mediaIndependent
          : eligible)
    .slice()
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return candidates[stableIndex(shader.id, candidates.length)] || null;
}

export function repairIsfVisualizerTimeline(rows = [], manifest = {}) {
  const shaders = Array.isArray(manifest?.shaders) ? manifest.shaders : [];
  const byId = new Map(shaders.map((shader) => [String(shader?.id || ""), shader]));
  const replacements = [];
  const timeline = (Array.isArray(rows) ? rows : []).map((row, cueIndex) => {
    const originalId = String(row?.visualizer_id || row?.visualizerId || "");
    const original = byId.get(originalId);
    if (original?.runtimeEligibility !== "unsupported-quarantine") return row;
    const replacement = isfPixelGateReplacement(original, shaders);
    if (!replacement) return row;
    const receipt = {
      cueIndex,
      originalId,
      originalTitle: String(row?.visualizer_title || row?.visualizerTitle || original.title || ""),
      replacementId: replacement.id,
      replacementTitle: replacement.title,
      reason: original.runtimeEligibilityReason,
      nonDestructive: true,
    };
    replacements.push(receipt);
    return {
      ...row,
      visualizer_id: replacement.id,
      visualizer_title: replacement.title,
      shader_repair: { schemaVersion: "hapa.echo.runtime-shader-repair.v1", ...receipt },
    };
  });
  return {
    schemaVersion: "hapa.echo.pixel-gate-timeline-repair.v1",
    ok: timeline.every((row) => byId.get(String(row?.visualizer_id || ""))?.runtimeEligibility !== "unsupported-quarantine"),
    timeline,
    replacementCount: replacements.length,
    replacements,
  };
}
