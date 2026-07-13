const ELECTRON_KIOSK_PASS_SCHEMA = "hapa.song-card.electron-kiosk-playback-pass.v1";

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return Number(sorted[index].toFixed(3));
}

function intervals(values = [], key) {
  return values.slice(1).map((row, index) => number(row[key]) - number(values[index]?.[key])).filter((value) => value >= 0);
}

function intervalCovered(interval, declared = []) {
  return declared.some((row) => number(row.startMs) <= interval.startMs + 1 && number(row.endMs) >= interval.endMs - 1);
}

function compactEvent(event = {}) {
  return {
    type: String(event.type || "unknown"),
    wallMs: Number(number(event.wallMs).toFixed(3)),
    mediaTimeMs: Number(number(event.mediaTimeMs).toFixed(3)),
    readyState: number(event.readyState),
    networkState: number(event.networkState),
  };
}

function deriveProgressStalls(samples = [], thresholdMs = 750) {
  const active = samples.filter((row) => row.active === true && row.paused !== true && row.ended !== true);
  const stalls = [];
  let start = null;
  for (let index = 1; index < active.length; index += 1) {
    const prior = active[index - 1];
    const current = active[index];
    const wallDeltaMs = number(current.wallMs) - number(prior.wallMs);
    const mediaDeltaMs = number(current.mediaTimeMs) - number(prior.mediaTimeMs);
    if (wallDeltaMs > 0 && mediaDeltaMs < Math.min(20, wallDeltaMs * 0.2)) {
      if (!start) start = prior;
      continue;
    }
    if (start) {
      const durationMs = number(prior.wallMs) - number(start.wallMs);
      if (durationMs >= thresholdMs) stalls.push({
        startWallMs: number(start.wallMs),
        endWallMs: number(prior.wallMs),
        startMediaMs: number(start.mediaTimeMs),
        endMediaMs: number(prior.mediaTimeMs),
        durationMs,
      });
      start = null;
    }
  }
  const last = active.at(-1);
  if (start && last) {
    const durationMs = number(last.wallMs) - number(start.wallMs);
    if (durationMs >= thresholdMs) stalls.push({
      startWallMs: number(start.wallMs),
      endWallMs: number(last.wallMs),
      startMediaMs: number(start.mediaTimeMs),
      endMediaMs: number(last.mediaTimeMs),
      durationMs,
    });
  }
  return stalls.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(number(value).toFixed(3))])));
}

function deriveBlackIntervals(samples = [], minimumDurationMs = 200) {
  const intervalsFound = [];
  let start = null;
  let last = null;
  for (const sample of samples) {
    if (sample.isBlack === true) {
      if (!start) start = sample;
      last = sample;
      continue;
    }
    if (start && last) {
      const durationMs = Math.max(number(last.wallMs) - number(start.wallMs), number(last.mediaTimeMs) - number(start.mediaTimeMs));
      if (durationMs >= minimumDurationMs) intervalsFound.push({
        startMs: number(start.mediaTimeMs),
        endMs: number(last.mediaTimeMs),
        durationMs,
        sampledWallDurationMs: number(last.wallMs) - number(start.wallMs),
        peakBlackPixelRatio: Math.max(...samples.filter((row) => number(row.wallMs) >= number(start.wallMs) && number(row.wallMs) <= number(last.wallMs)).map((row) => number(row.blackPixelRatio))),
      });
      start = null;
      last = null;
    }
  }
  if (start && last) {
    const durationMs = Math.max(number(last.wallMs) - number(start.wallMs), number(last.mediaTimeMs) - number(start.mediaTimeMs));
    if (durationMs >= minimumDurationMs) intervalsFound.push({
      startMs: number(start.mediaTimeMs),
      endMs: number(last.mediaTimeMs),
      durationMs,
      sampledWallDurationMs: number(last.wallMs) - number(start.wallMs),
      peakBlackPixelRatio: Math.max(...samples.filter((row) => number(row.wallMs) >= number(start.wallMs)).map((row) => number(row.blackPixelRatio))),
      openEnded: true,
    });
  }
  return intervalsFound.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(3)) : value])));
}

function analyzeElectronKioskPass(raw = {}, { expectedDurationMs = 60_000, expectedBlackIntervals = [], minimumBlackDurationMs = 200, stallThresholdMs = 750 } = {}) {
  const frames = Array.isArray(raw.frameCallbacks) ? raw.frameCallbacks : [];
  const progress = Array.isArray(raw.progressSamples) ? raw.progressSamples : [];
  const mediaIntervals = intervals(frames, "mediaTimeMs");
  const wallIntervals = intervals(frames, "wallMs");
  const medianMediaIntervalMs = percentile(mediaIntervals.filter((value) => value > 0), 0.5) || 33.333;
  const presentationGapThresholdMs = Math.max(150, medianMediaIntervalMs * 4.5);
  const callbackWallGapThresholdMs = Math.max(750, (percentile(wallIntervals.filter((value) => value > 0), 0.5) || 33.333) * 15);
  const presentationGaps = mediaIntervals.flatMap((intervalMs, index) => intervalMs > presentationGapThresholdMs
    ? [{ atMediaMs: number(frames[index]?.mediaTimeMs), intervalMs: Number(intervalMs.toFixed(3)) }]
    : []);
  const callbackWallGaps = wallIntervals.flatMap((intervalMs, index) => intervalMs > callbackWallGapThresholdMs
    ? [{ atMediaMs: number(frames[index]?.mediaTimeMs), intervalMs: Number(intervalMs.toFixed(3)) }]
    : []);
  const progressStalls = deriveProgressStalls(progress, stallThresholdMs);
  const blackIntervals = deriveBlackIntervals(Array.isArray(raw.blackSamples) ? raw.blackSamples : [], minimumBlackDurationMs);
  const unintendedBlackIntervals = blackIntervals.filter((row) => !intervalCovered(row, expectedBlackIntervals));
  const frameSampleErrors = (raw.events || []).filter((event) => event.type === "pixel-sample-error").map(compactEvent);
  const qualityBefore = raw.playbackQualityBefore || {};
  const qualityAfter = raw.playbackQualityAfter || {};
  const totalFrames = Math.max(0, number(qualityAfter.totalVideoFrames) - number(qualityBefore.totalVideoFrames));
  const droppedFrames = Math.max(0, number(qualityAfter.droppedVideoFrames) - number(qualityBefore.droppedVideoFrames));
  const corruptedFrames = Math.max(0, number(qualityAfter.corruptedVideoFrames) - number(qualityBefore.corruptedVideoFrames));
  const decodedDurationMs = Math.max(number(raw.finalMediaTimeMs), number(frames.at(-1)?.mediaTimeMs), number(progress.at(-1)?.mediaTimeMs));
  const wallDurationMs = Math.max(0, number(raw.finishedWallMs) - number(raw.playStartedWallMs));
  const mediaErrorEvents = (raw.events || []).filter((event) => event.type === "error").map(compactEvent);
  const bufferingEvents = (raw.events || []).filter((event) => event.type === "waiting" || event.type === "stalled").map(compactEvent);
  const checks = {
    browserWindowVisible: raw.windowVisible === true && raw.documentVisibility === "visible",
    selectedApplicationEdition: raw.selectedEdition === raw.edition && raw.panelPresent === true,
    htmlVideoElementPlayed: raw.elementKind === "HTMLVideoElement" && raw.playRejected !== true,
    fullImmutableArtifactBuffered: raw.prebuffer?.fullyBuffered === true
      && number(raw.prebuffer?.artifactBytes) > 0
      && number(raw.prebuffer?.artifactBytes) === number(raw.prebuffer?.declaredArtifactBytes)
      && /^[a-f0-9]{64}$/u.test(String(raw.prebuffer?.artifactSha256 || "")),
    requestVideoFrameCallbackObserved: raw.requestVideoFrameCallbackSupported === true && frames.length > 0,
    endedNaturally: raw.ended === true && raw.timedOut !== true,
    durationReached: decodedDurationMs >= Math.max(0, expectedDurationMs - 250),
    realtimeWallDuration: wallDurationMs >= Math.max(0, expectedDurationMs * 0.9),
    noMediaErrors: mediaErrorEvents.length === 0 && !raw.mediaError,
    noPresentationTimestampGaps: presentationGaps.length === 0,
    noFrameCallbackWallGaps: callbackWallGaps.length === 0,
    noProgressStalls: progressStalls.length === 0,
    blackFrameSamplingObserved: (raw.blackSamples || []).length >= Math.max(2, Math.floor(expectedDurationMs / 2_000)),
    noFrameSampleErrors: frameSampleErrors.length === 0,
    noReportedDroppedFrames: droppedFrames === 0,
    noReportedCorruptedFrames: corruptedFrames === 0,
    noUnintendedBlackIntervals: unintendedBlackIntervals.length === 0,
  };
  return {
    schemaVersion: ELECTRON_KIOSK_PASS_SCHEMA,
    ok: Object.values(checks).every(Boolean),
    checks,
    method: "visible-electron-browserwindow-htmlvideoelement-requestvideoframecallback",
    expectedDurationMs,
    decodedDurationMs: Number(decodedDurationMs.toFixed(3)),
    wallDurationMs: Number(wallDurationMs.toFixed(3)),
    frameCallbackCount: frames.length,
    playbackQuality: { totalFrames, droppedFrames, corruptedFrames, before: qualityBefore, after: qualityAfter },
    presentationIntervalsMs: {
      median: percentile(mediaIntervals.filter((value) => value > 0), 0.5),
      p95: percentile(mediaIntervals.filter((value) => value > 0), 0.95),
      p99: percentile(mediaIntervals.filter((value) => value > 0), 0.99),
      max: mediaIntervals.length ? Number(Math.max(...mediaIntervals).toFixed(3)) : null,
      gapThreshold: Number(presentationGapThresholdMs.toFixed(3)),
    },
    callbackWallIntervalsMs: {
      median: percentile(wallIntervals.filter((value) => value > 0), 0.5),
      p95: percentile(wallIntervals.filter((value) => value > 0), 0.95),
      p99: percentile(wallIntervals.filter((value) => value > 0), 0.99),
      max: wallIntervals.length ? Number(Math.max(...wallIntervals).toFixed(3)) : null,
      gapThreshold: Number(callbackWallGapThresholdMs.toFixed(3)),
    },
    presentationGaps,
    callbackWallGaps,
    progressStalls,
    mediaErrorEvents,
    frameSampleErrors,
    bufferingEvents,
    blackIntervals,
    expectedBlackIntervals,
    unintendedBlackIntervals,
    progressSampleCount: progress.length,
    blackSampleCount: Array.isArray(raw.blackSamples) ? raw.blackSamples.length : 0,
    prebuffer: raw.prebuffer || null,
    renderer: raw.renderer || null,
  };
}

module.exports = {
  ELECTRON_KIOSK_PASS_SCHEMA,
  analyzeElectronKioskPass,
  deriveBlackIntervals,
};
