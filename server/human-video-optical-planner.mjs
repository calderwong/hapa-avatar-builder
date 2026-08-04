export async function scanHumanVideoOpticalCandidates(options = {}) {
  const jobLimit = boundedInteger(options.jobLimit, 1, 2_000, 100);
  const scanLimit = boundedInteger(options.scanLimit, jobLimit, 10_000, Math.max(jobLimit, Math.min(2_000, jobLimit * 10)));
  const existingVideoKeys = new Set(options.existingVideoKeys || []);
  const needsReview = typeof options.needsReview === "function" ? options.needsReview : (video) => !video?.agentReview;
  const prepare = typeof options.prepare === "function" ? options.prepare : async () => ({ deferred: "missing-files" });
  const candidates = (Array.isArray(options.videos) ? options.videos : [])
    .filter((video) => stableVideoKey(video) && !existingVideoKeys.has(stableVideoKey(video)) && needsReview(video))
    .sort((left, right) => stableVideoKey(left).localeCompare(stableVideoKey(right)));
  const afterVideoKey = clean(options.afterVideoKey);
  const startIndex = afterVideoKey
    ? candidates.findIndex((video) => stableVideoKey(video).localeCompare(afterVideoKey) > 0)
    : 0;
  if (startIndex < 0 || startIndex >= candidates.length) {
    return emptyResult(candidates.length, afterVideoKey);
  }

  const jobs = [];
  let scanned = 0;
  let deferredMissingFrames = 0;
  let deferredMissingFiles = 0;
  let lastScannedVideoKey = afterVideoKey;
  let index = startIndex;
  while (index < candidates.length && scanned < scanLimit && jobs.length < jobLimit) {
    const video = candidates[index];
    index += 1;
    scanned += 1;
    lastScannedVideoKey = stableVideoKey(video);
    const outcome = await prepare(video);
    if (outcome?.job) jobs.push(outcome.job);
    else if (outcome?.deferred === "missing-frames") deferredMissingFrames += 1;
    else deferredMissingFiles += 1;
  }
  return {
    jobs,
    scanned,
    deferredMissingFrames,
    deferredMissingFiles,
    lastScannedVideoKey,
    scanExhausted: index >= candidates.length,
    eligibleCandidates: candidates.length,
    scanLimit,
  };
}

function emptyResult(eligibleCandidates, lastScannedVideoKey) {
  return {
    jobs: [],
    scanned: 0,
    deferredMissingFrames: 0,
    deferredMissingFiles: 0,
    lastScannedVideoKey,
    scanExhausted: true,
    eligibleCandidates,
    scanLimit: 0,
  };
}

function stableVideoKey(video = {}) {
  return clean(video.humanVideoKey);
}

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Math.trunc(Number(value));
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) && number > 0 ? number : fallback));
}

function clean(value) {
  return String(value || "").trim();
}
