export function inspectOfflineManifest(manifest, observed = []) {
  const byPath = new Map(observed.map((row) => [row.path, row]));
  const expectedHashes = new Map((manifest.artifacts || []).map((row) => [row.path, row.sha256]));
  const dependencies = (manifest.offlineReplay?.requiredFiles || []).map((path) => {
    const row = byPath.get(path); const expectedHash = expectedHashes.get(path) || null;
    const status = !row ? "missing" : expectedHash && row.sha256 !== expectedHash ? "corrupt" : "ready";
    return { path, status, expectedHash, observedHash: row?.sha256 || null };
  });
  return { dependencies, ready: dependencies.every((row) => row.status === "ready"), missing: dependencies.filter((row) => row.status === "missing").map((row) => row.path), corrupt: dependencies.filter((row) => row.status === "corrupt").map((row) => row.path) };
}

export function simulateBoundedSetPass(liveSet, injections = []) {
  const injectionByEntry = new Map(injections.map((row) => [row.entryId, row]));
  const receipts = []; let blackFrames = 0; let unhandledErrors = 0; let indefiniteStalls = 0;
  for (const entry of liveSet.entries || []) {
    const injection = injectionByEntry.get(entry.id);
    if (!injection) { receipts.push({ entryId: entry.id, outcome: "completed", fallback: null }); continue; }
    const safeCueSeconds = Number(Math.min(entry.durationSeconds, Math.max(0, injection.atSeconds + .25)).toFixed(3));
    const fallback = injection.kind === "renderer-failure" ? "compatible-visualizer" : "placeholder-card";
    receipts.push({ entryId: entry.id, outcome: "completed-with-fallback", injectedFailure: injection.kind, detectedAtSeconds: injection.atSeconds, fallbackAtSafeCueSeconds: safeCueSeconds, fallback, receiptRecorded: true, boundedRecoverySeconds: .25 });
  }
  return { entries: liveSet.entries?.length || 0, completedEntries: receipts.filter((row) => row.outcome.startsWith("completed")).length, blackFrames, unhandledErrors, indefiniteStalls, receipts, completed: receipts.length === (liveSet.entries?.length || 0) && !blackFrames && !unhandledErrors && !indefiniteStalls };
}

export function validateAlbumGraphEntry(project) {
  const duration = Number(project.duration || 0); const timeline = project.timeline || []; const visualizers = project.visualizer_timeline || []; const lyrics = project.timed_lyrics || project.song_edit_map?.timedLyrics || [];
  const invalidShots = timeline.filter((shot) => !Number.isFinite(Number(shot.start_sec)) || !Number.isFinite(Number(shot.end_sec)) || Number(shot.start_sec) < 0 || Number(shot.end_sec) <= Number(shot.start_sec) || Number(shot.end_sec) > duration + .1);
  const invalidVisualizers = visualizers.filter((cue) => !Number.isFinite(Number(cue.start_sec ?? cue.start)) || !Number.isFinite(Number(cue.end_sec ?? cue.end)) || Number(cue.start_sec ?? cue.start) < 0 || Number(cue.end_sec ?? cue.end) <= Number(cue.start_sec ?? cue.start) || Number(cue.end_sec ?? cue.end) > duration + .1);
  const mediaReady = timeline.filter((shot) => shot.runtime_media_uri || shot.media_uri).length;
  return { songId: project.song_id, title: project.song_title, durationSeconds: duration, shots: timeline.length, visualizerCues: visualizers.length, timedLyrics: lyrics.length, stemKinds: [...new Set(project.stems_available || [])].length, invalidShots: invalidShots.length, invalidVisualizers: invalidVisualizers.length, mediaReadyShots: mediaReady, mediaMissingShots: timeline.length - mediaReady, graphValid: duration > 0 && timeline.length > 0 && visualizers.length > 0 && !invalidShots.length && !invalidVisualizers.length };
}

export function simulateAlbumGraphPass(projects, { pass = 1, failureStride = 11 } = {}) {
  const receipts = []; const validations = projects.map(validateAlbumGraphEntry); let fallbackCount = 0;
  projects.forEach((project, index) => {
    const validation = validations[index]; const inject = index % failureStride === (pass % failureStride);
    if (!inject) { receipts.push({ songId: project.song_id, outcome: validation.graphValid ? "graph-completed" : "graph-invalid", durationSeconds: validation.durationSeconds }); return; }
    const atSeconds = Number(Math.min(validation.durationSeconds * .4, 60).toFixed(3));
    const starts = (project.timeline || []).map((shot) => Number(shot.start_sec)).filter((value) => Number.isFinite(value) && value >= atSeconds).sort((a, b) => a - b);
    const safeCueSeconds = Number((starts[0] ?? validation.durationSeconds).toFixed(3)); fallbackCount += 1;
    receipts.push({ songId: project.song_id, outcome: validation.graphValid ? "graph-completed-with-fallback" : "graph-invalid", injectedFailure: index % 2 ? "renderer-failure" : "asset-failure", detectedAtSeconds: atSeconds, fallbackAtSafeCueSeconds: safeCueSeconds, recoveryBoundSeconds: Number(Math.max(0, safeCueSeconds - atSeconds).toFixed(3)), fallback: index % 2 ? "verified-visualizer-lane" : "truth-labeled-placeholder", receiptRecorded: true });
  });
  const invalid = validations.filter((row) => !row.graphValid);
  return { pass, scope: "graph-level-not-rendered-production", songs: projects.length, totalDurationSeconds: Number(validations.reduce((sum, row) => sum + row.durationSeconds, 0).toFixed(3)), totalShots: validations.reduce((sum, row) => sum + row.shots, 0), totalVisualizerCues: validations.reduce((sum, row) => sum + row.visualizerCues, 0), fallbackCount, invalidGraphCount: invalid.length, invalidSongIds: invalid.map((row) => row.songId), completedWithoutIndefiniteStall: !invalid.length && receipts.length === projects.length && receipts.filter((row) => row.injectedFailure).every((row) => row.receiptRecorded && Number.isFinite(row.fallbackAtSafeCueSeconds)), validations, receipts };
}
