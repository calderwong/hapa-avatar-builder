export const HUMAN_VIDEO_COST_BENCHMARK_SCHEMA = "hapa.human-video-cost-benchmark.v1";
export const HUMAN_VIDEO_COST_BENCHMARK_SIZE = 9;

export function createHumanVideoCostBenchmarkReport(input = {}) {
  const optical = Array.isArray(input.optical) ? input.optical : [];
  const reference = Array.isArray(input.reference) ? input.reference : [];
  if (optical.length !== HUMAN_VIDEO_COST_BENCHMARK_SIZE || reference.length !== HUMAN_VIDEO_COST_BENCHMARK_SIZE) throw benchmarkError("human_video_benchmark_exact_nine_required", "The controlled benchmark requires exactly nine optical and nine reference results.");
  const referenceByVideo = new Map(reference.map((row) => [row.videoKey, row]));
  const rows = optical.map((opticalRow) => {
    const referenceRow = referenceByVideo.get(opticalRow.videoKey);
    if (!referenceRow) throw benchmarkError("human_video_benchmark_pass_pair_missing", `Missing reference result for ${opticalRow.videoKey}.`);
    const packetRecords = integer(referenceRow.packetRecords);
    if (packetRecords < 5 || packetRecords > 20) throw benchmarkError("human_video_benchmark_packet_size_invalid", "Every benchmark reference pass requires a 5–20 Card packet.");
    return {
      videoKey: opticalRow.videoKey,
      videoName: opticalRow.videoName || referenceRow.videoName || "",
      optical: normalizePass(opticalRow, "optical", 3),
      reference: normalizePass(referenceRow, "reference", packetRecords),
    };
  });
  if (new Set(rows.map((row) => row.videoKey)).size !== HUMAN_VIDEO_COST_BENCHMARK_SIZE) throw benchmarkError("human_video_benchmark_video_identity_duplicate", "The controlled benchmark requires nine distinct videos.");
  const configurations = new Set(rows.flatMap((row) => [configurationKey(row.optical), configurationKey(row.reference)]));
  if (configurations.size !== 1) throw benchmarkError("human_video_benchmark_configuration_mismatch", "All nine videos and both passes must use one common model/effort/budget configuration.");
  const providerReceiptsCaptured = rows.reduce((count, row) => count + [row.optical, row.reference].filter((pass) => pass.accounting.status === "captured").length, 0);
  const remainingVideos = Math.max(0, integer(input.remainingVideos));
  const meanElapsedMs = mean(rows.map((row) => row.optical.elapsedMs + row.reference.elapsedMs));
  const meanMeasuredInputBytes = mean(rows.map((row) => row.optical.inputPacketBytes + row.reference.inputPacketBytes + row.optical.frameBytes));
  const meanMeasuredOutputBytes = mean(rows.map((row) => row.optical.outputBytes + row.reference.outputBytes));
  return {
    schemaVersion: HUMAN_VIDEO_COST_BENCHMARK_SCHEMA,
    generatedAt: input.generatedAt || new Date().toISOString(),
    sampleSize: HUMAN_VIDEO_COST_BENCHMARK_SIZE,
    configuration: rows[0].optical.configuration,
    rows,
    totals: {
      elapsedMs: rows.reduce((sum, row) => sum + row.optical.elapsedMs + row.reference.elapsedMs, 0),
      measuredInputBytes: rows.reduce((sum, row) => sum + row.optical.inputPacketBytes + row.reference.inputPacketBytes + row.optical.frameBytes, 0),
      measuredOutputBytes: rows.reduce((sum, row) => sum + row.optical.outputBytes + row.reference.outputBytes, 0),
      providerReceiptsCaptured,
      providerReceiptsUnavailable: HUMAN_VIDEO_COST_BENCHMARK_SIZE * 2 - providerReceiptsCaptured,
    },
    forecast: {
      remainingVideos,
      meanElapsedMsPerVideo: Math.round(meanElapsedMs),
      serialHours: round((meanElapsedMs * remainingVideos) / 3_600_000, 2),
      meanMeasuredInputBytesPerVideo: Math.round(meanMeasuredInputBytes),
      measuredInputBytes: Math.round(meanMeasuredInputBytes * remainingVideos),
      meanMeasuredOutputBytesPerVideo: Math.round(meanMeasuredOutputBytes),
      measuredOutputBytes: Math.round(meanMeasuredOutputBytes * remainingVideos),
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      credits: null,
      tokenTruthBoundary: "This runtime did not expose provider token or credit receipts. Byte counts are verified payload/frame proxies and are not converted into invented tokens or prices.",
    },
    productionStateUnchanged: input.sourceSnapshotBefore && input.sourceSnapshotAfter ? JSON.stringify(input.sourceSnapshotBefore) === JSON.stringify(input.sourceSnapshotAfter) : null,
    truthBoundary: "These are unimported benchmark proposals, not human validation, durable enrichment, reference truth, canon, or approval.",
  };
}

function normalizePass(input, pass, packetRecords) {
  const accounting = input.accounting && typeof input.accounting === "object" ? input.accounting : {};
  return {
    pass,
    configuration: {
      model: String(input.configuration?.model || ""),
      reasoningEffort: String(input.configuration?.reasoningEffort || input.configuration?.effort || ""),
      budgetId: String(input.configuration?.budgetId || ""),
    },
    packetRecords,
    elapsedMs: Math.max(0, integer(input.elapsedMs)),
    inputPacketBytes: Math.max(0, integer(input.inputPacketBytes)),
    frameBytes: pass === "optical" ? Math.max(0, integer(input.frameBytes)) : 0,
    outputBytes: Math.max(0, integer(input.outputBytes)),
    outcome: String(input.outcome || "unknown"),
    stoppedDueToBudget: input.stoppedDueToBudget === true,
    accounting: {
      status: new Set(["captured", "unavailable"]).has(accounting.status) ? accounting.status : "unavailable",
      source: String(accounting.source || ""),
      inputTokens: accounting.status === "captured" ? integer(accounting.inputTokens) : null,
      outputTokens: accounting.status === "captured" ? integer(accounting.outputTokens) : null,
      totalTokens: accounting.status === "captured" ? integer(accounting.totalTokens) : null,
    },
  };
}
function configurationKey(pass) { return JSON.stringify(pass.configuration); }
function integer(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : 0; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value, digits) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function benchmarkError(code, message) { const error = new Error(message); error.code = code; return error; }
