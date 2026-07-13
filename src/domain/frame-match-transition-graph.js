function hamming(left = "", right = "") {
  const a = BigInt(`0x${left || "0"}`); const b = BigInt(`0x${right || "0"}`);
  let value = a ^ b; let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const fixed = (value) => Number(value.toFixed(4));
const basename = (value) => String(value || "").split("/").pop();

function roiFor(video, roiItems) {
  const name = basename(video.path);
  const row = roiItems.find((item) => basename(item.path) === name);
  return row ? { status: row.status, evidence: row.evidence, subjectROI: row.subjectROI } : { status: "unmeasured", evidence: "no-path-matched-roi", subjectROI: null };
}

function roiContinuity(left, right) {
  if (!left.subjectROI || !right.subjectROI) return { score: 0.5, status: "unmeasured" };
  const center = (roi) => [roi.x + roi.width / 2, roi.y + roi.height / 2];
  const [ax, ay] = center(left.subjectROI); const [bx, by] = center(right.subjectROI);
  const distance = Math.hypot(ax - bx, ay - by) / Math.SQRT2;
  return { score: fixed(clamp01(1 - distance)), status: "verified-roi-proxy", centerDistance: fixed(distance) };
}

export function buildFrameMatchTransitionGraph({ videos = [], frames = [], roiItems = [], topK = 3, contactSheet = "contact-sheet.jpg" }) {
  const byVideo = new Map(videos.map((video) => [video.video_id || video.id, { ...video, roi: roiFor(video, roiItems) }]));
  const endpoints = new Map();
  for (const frame of frames) {
    if (!endpoints.has(frame.video_id)) endpoints.set(frame.video_id, {});
    if (frame.role === "first" || frame.role === "last") endpoints.get(frame.video_id)[frame.role] = frame;
  }
  const candidates = [];
  for (const source of byVideo.values()) for (const target of byVideo.values()) {
    const sourceId = source.video_id || source.id; const targetId = target.video_id || target.id;
    if (sourceId === targetId) continue;
    const exit = endpoints.get(sourceId)?.last; const entry = endpoints.get(targetId)?.first;
    if (!exit || !entry) continue;
    const hashes = { aHash: hamming(exit.ahash, entry.ahash), dHash: hamming(exit.dhash, entry.dhash), pHash: hamming(exit.phash, entry.phash) };
    const appearance = fixed(clamp01(1 - ((hashes.aHash + hashes.dHash + hashes.pHash) / 3) / 64));
    const lumaDelta = Math.abs(Number(exit.luma_mean) - Number(entry.luma_mean));
    const palette = fixed(clamp01(1 - lumaDelta));
    const composition = roiContinuity(source.roi, target.roi);
    const sourceMotion = hamming(endpoints.get(sourceId)?.first?.dhash, exit.dhash) / 64;
    const targetMotion = hamming(entry.dhash, endpoints.get(targetId)?.last?.dhash) / 64;
    const motion = fixed(clamp01(1 - Math.abs(sourceMotion - targetMotion)));
    const aspectDelta = Math.abs((source.width / source.height) - (target.width / target.height));
    const aspect = fixed(clamp01(1 - aspectDelta / 1.5));
    const semantic = 0.5;
    const score = fixed(.25 * appearance + .22 * composition.score + .18 * palette + .15 * motion + .1 * aspect + .1 * semantic);
    const strictVisualMatch = hashes.aHash <= 6 && hashes.dHash <= 6 && hashes.pHash <= 8 && lumaDelta <= .08;
    const family = strictVisualMatch ? "match-cut" : score >= .68 && aspect >= .7 ? "wipe" : score >= .55 ? "hold" : "visualizer-buffer";
    const id = `join:${sourceId.replace("video:", "")}:${targetId.replace("video:", "")}`;
    candidates.push({
      id, sourceVideoId: sourceId, targetVideoId: targetId,
      exitTimestampSeconds: Number(exit.timestamp), entryTimestampSeconds: Number(entry.timestamp), transitionFamily: family, score,
      scoreBreakdown: {
        perceptualAppearance: { score: appearance, weight: .25, distances: hashes, status: "verified-perceptual-hash" },
        subjectComposition: { ...composition, weight: .22 },
        palette: { score: palette, weight: .18, lumaDelta: fixed(lumaDelta), status: "luma-only; full-color-palette-unmeasured" },
        motion: { score: motion, weight: .15, sourceChange: fixed(sourceMotion), targetChange: fixed(targetMotion), status: "perceptual-change-proxy; optical-flow-unmeasured" },
        aspect: { score: aspect, weight: .1, delta: fixed(aspectDelta), status: "verified-dimensions" },
        semanticContinuity: { score: semantic, weight: .1, status: "pending-human-context-review" },
        pose: { status: "unmeasured" }, depth: { status: "unmeasured" },
      },
      safetyLimits: { maxDurationSeconds: family === "visualizer-buffer" ? 1.5 : .75, noMorphWithoutApproval: true, noUnverifiedSemanticClaim: true, fallbackFamily: "visualizer-buffer", rejectOnMissingFrame: true },
      preview: { contactSheet, exitThumbnail: `mvp/thumbnails/${sourceId.replace("video:", "")}-last.jpg`, entryThumbnail: `mvp/thumbnails/${targetId.replace("video:", "")}-first.jpg` },
      provenance: { frameDatabase: "frame-match.sqlite3", continuity: "last-to-first", sourceFrameId: exit.frame_id, targetFrameId: entry.frame_id },
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const alternatesBySource = Object.fromEntries([...byVideo.keys()].map((id) => [id, candidates.filter((row) => row.sourceVideoId === id).slice(0, topK).map((row) => row.id)]));
  const selected = candidates[0] || null;
  const generatedBridgeWarranted = Boolean(selected?.transitionFamily === "match-cut" && selected.score >= .8);
  return {
    schemaVersion: "hapa.frame-match-transition-graph.v1", deterministic: true,
    truth: { strictMatches: candidates.filter((row) => row.transitionFamily === "match-cut").length, opticalFlowMeasured: false, fullColorPaletteMeasured: false, semanticReview: "pending-human" },
    totals: { videos: videos.length, orderedCandidateJoins: candidates.length, topK }, candidates, alternatesBySource,
    selection: selected ? { joinId: selected.id, transitionFamily: selected.transitionFamily, score: selected.score } : null,
    flowDancerHandoff: selected ? { schemaVersion: "hapa.video-flow-dancer.recipe.v1", selectedJoinId: selected.id, sourceVideoId: selected.sourceVideoId, targetVideoId: selected.targetVideoId, exitTimestampSeconds: selected.exitTimestampSeconds, entryTimestampSeconds: selected.entryTimestampSeconds, requestedFamily: selected.transitionFamily, generatedBridgeWarranted, status: generatedBridgeWarranted ? "approval-required-before-generation" : "not-warranted-use-selected-nongenerative-fallback", provenanceLink: selected.provenance } : null,
  };
}
