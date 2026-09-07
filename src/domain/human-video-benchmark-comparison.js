export const HUMAN_VIDEO_BENCHMARK_COMPARISON_SCHEMA = "hapa.human-video-benchmark-comparison.v1";

const REPORT_SCHEMA = "hapa.human-video-optical-benchmark-report.v1";
const DISPATCHER_SCHEMA = "hapa.human-video-optical-benchmark-dispatcher.v1";
const EXPECTED_VIDEO_COUNT = 40;

export function createHumanVideoBenchmarkComparison(input = {}) {
  const report = object(input.report);
  const dispatcher = object(input.dispatcher);
  const acceptedOutput = object(input.acceptedOutput);
  if (report.schemaVersion !== REPORT_SCHEMA) throw comparisonError("benchmark_report_schema_invalid", "The benchmark report schema is not supported.");
  if (dispatcher.schemaVersion !== DISPATCHER_SCHEMA) throw comparisonError("benchmark_dispatcher_schema_invalid", "The benchmark dispatcher schema is not supported.");
  if (Number(report.counts?.accepted || 0) !== EXPECTED_VIDEO_COUNT || Number(report.counts?.selected || 0) !== EXPECTED_VIDEO_COUNT) {
    throw comparisonError("benchmark_report_not_complete", "The comparison page requires the completed 40-video benchmark.");
  }
  if (report.authority?.durableTruthModified !== false || report.authority?.proposalStatus !== "pending-human" || report.productionStores?.unchanged !== true) {
    throw comparisonError("benchmark_authority_boundary_invalid", "The benchmark must remain pending-human and production stores must be unchanged.");
  }
  if (report.passes?.reference?.executed !== false) throw comparisonError("benchmark_reference_boundary_invalid", "This comparison is for the optical-only benchmark whose reference pass was not run.");

  const jobs = array(dispatcher.jobs).slice().sort((left, right) => Number(left.ordinal || 0) - Number(right.ordinal || 0));
  const outputs = array(acceptedOutput.videos).slice().sort((left, right) => Number(left.ordinal || 0) - Number(right.ordinal || 0));
  const reportRows = new Map(array(report.perVideo).map((row) => [Number(row.ordinal || 0), row]));
  const outputRows = new Map(outputs.map((row) => [Number(row.ordinal || 0), row]));
  const catalogRows = new Map(array(input.catalogVideos).map((video) => [String(video.humanVideoKey || ""), video]));
  if (jobs.length !== EXPECTED_VIDEO_COUNT || outputs.length !== EXPECTED_VIDEO_COUNT || reportRows.size !== EXPECTED_VIDEO_COUNT) {
    throw comparisonError("benchmark_row_count_invalid", "Report, dispatcher, and accepted optical output must each contain exactly 40 videos.");
  }

  const rows = jobs.map((job, index) => {
    const ordinal = Number(job.ordinal || 0);
    const reportRow = reportRows.get(ordinal);
    const benchmark = outputRows.get(ordinal);
    const catalog = catalogRows.get(String(job.videoKey || ""));
    if (ordinal !== index + 1 || job.status !== "accepted" || !job.acceptedReceiptId || !reportRow || !benchmark || !catalog) {
      throw comparisonError("benchmark_join_invalid", `Benchmark ordinal ${ordinal || index + 1} could not be joined to one accepted receipt and catalog video.`);
    }
    if (reportRow.videoKey !== job.videoKey || reportRow.receiptId !== job.acceptedReceiptId || reportRow.optical?.accepted !== true || benchmark.authority !== "pending-human") {
      throw comparisonError("benchmark_receipt_binding_invalid", `Benchmark ordinal ${ordinal} does not match its accepted dispatcher receipt.`);
    }
    return {
      ordinal,
      videoKey: String(job.videoKey),
      video: projectCatalogVideo(catalog),
      existingProductionReview: projectProductionReview(catalog.agentReview),
      benchmarkOpticalOutput: projectBenchmarkOutput(benchmark),
      accounting: {
        elapsedMs: nullableNumber(reportRow.optical?.elapsedMs),
        inputPacketBytes: nullableNumber(reportRow.optical?.packetBytes),
        imageBytes: nullableNumber(reportRow.optical?.imageBytes),
        outputBytes: nullableNumber(reportRow.optical?.outputBytes),
        actualProviderUsage: projectProviderUsage(reportRow.actualProviderUsage),
      },
    };
  });

  return {
    schemaVersion: HUMAN_VIDEO_BENCHMARK_COMPARISON_SCHEMA,
    generatedAt: input.generatedAt || null,
    run: {
      id: String(input.runId || "human-enricher-mechanical-benchmark"),
      startedAt: report.startedAt || null,
      completedAt: report.completedAt || null,
      stopReason: report.stopReason || "",
      withinDeadline: report.withinDeadline === true,
      accepted: EXPECTED_VIDEO_COUNT,
      selected: EXPECTED_VIDEO_COUNT,
      opticalFramesInspected: Number(report.passes?.optical?.totalDirectFrames || 0),
      referencePass: { executed: false, status: report.passes?.reference?.stopReason || "not-run" },
    },
    authority: {
      mode: "read-only-comparison",
      benchmarkStatus: "pending-human",
      benchmarkIsHumanValidation: false,
      productionStoresModified: false,
      importAvailable: false,
    },
    videos: rows,
    truthBoundary: "Read-only comparison of the existing production review and an accepted benchmark optical receipt. It never imports, overwrites, validates, or upgrades either record, and the benchmark reference pass was not run.",
  };
}

function projectCatalogVideo(video = {}) {
  return {
    id: String(video.id || ""),
    name: String(video.name || video.id || "Untitled video"),
    ownerName: String(video.ownerName || "System Media Library"),
    role: String(video.role || "video"),
    duration: nullableNumber(video.duration),
    sizeBytes: nullableNumber(video.sizeBytes),
    width: nullableNumber(video.width),
    height: nullableNumber(video.height),
    uri: safeMediaUri(video.uri),
    thumbnailUri: safeMediaUri(video.thumbnailUri),
  };
}

function projectProductionReview(review = null) {
  if (!review) return null;
  const proposal = object(review.proposal);
  return {
    id: String(review.id || ""),
    status: String(review.status || "unknown"),
    submittedAt: review.reviewer?.schedulerReceipt?.submittedAt || review.updatedAt || null,
    campaignId: String(review.reviewer?.schedulerReceipt?.campaignId || ""),
    reviewer: {
      model: String(review.reviewer?.model || ""),
      reasoningEffort: String(review.reviewer?.reasoningEffort || ""),
      opticalInspectionConfirmed: review.reviewer?.opticalInspectionConfirmed === true,
    },
    description: String(proposal.description || ""),
    quality: projectQuality(proposal.quality),
    categories: strings(proposal.categories),
    tags: strings(proposal.tags),
    visibleSignals: strings(proposal.referenceSignals || proposal.visualReferenceAnalysis?.observedSignals),
    strengths: strings(proposal.strengths),
    issues: strings(proposal.issues),
    uncertainty: String(proposal.uncertainty || ""),
    frames: projectFrames(review.evidence?.frames),
  };
}

function projectBenchmarkOutput(output = {}) {
  return {
    authority: "pending-human",
    pass: "optical",
    referencePass: "not-run",
    description: String(output.description || ""),
    quality: projectQuality(output.quality),
    signalOutcome: String(output.signalOutcome || "unknown"),
    visibleSignals: strings(output.visibleSignals),
    strengths: strings(output.strengths),
    issues: strings(output.issues),
    uncertainty: String(output.uncertainty || ""),
    frames: projectFrames(output.frames),
  };
}

function projectQuality(quality = {}) {
  return { value: nullableNumber(quality?.value), explanation: String(quality?.explanation || "") };
}

function projectFrames(frames = []) {
  return array(frames).map((frame) => ({
    role: String(frame.role || ""),
    observation: String(frame.observation || ""),
    palette: {
      colors: array(frame.palette?.colors).map((color) => ({
        hex: String(color.hex || ""),
        label: String(color.label || ""),
        prevalence: String(color.prevalence || ""),
        explanation: String(color.explanation || ""),
      })),
      uncertainty: String(frame.palette?.uncertainty || ""),
    },
  }));
}

function projectProviderUsage(value = {}) {
  return {
    available: value?.available === true,
    inputTokens: nullableNumber(value?.inputTokens),
    outputTokens: nullableNumber(value?.outputTokens),
    totalTokens: nullableNumber(value?.totalTokens),
    credits: nullableNumber(value?.credits),
  };
}

function safeMediaUri(value) {
  const uri = String(value || "");
  return uri.startsWith("/media/") ? uri : "";
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function array(value) { return Array.isArray(value) ? value : []; }
function strings(value) { return array(value).map((item) => String(item || "").trim()).filter(Boolean); }
function nullableNumber(value) { if (value == null || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function comparisonError(code, message) { const error = new Error(message); error.code = code; error.statusCode = 422; return error; }
