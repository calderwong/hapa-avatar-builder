import { normalizePlaybackPowerMode } from "./playback-power-mode.js";

function projectBody(project) {
  return project?.music_video_project || project || null;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function startOf(item) {
  return finite(item?.start_sec ?? item?.start, 0);
}

function endOf(item, fallback = Infinity) {
  return finite(item?.end_sec ?? item?.end, fallback);
}

function itemIndexAt(items = [], clock = 0) {
  if (!items.length) return -1;
  const time = Math.max(0, finite(clock));
  let low = 0;
  let high = items.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const item = items[middle];
    if (time < startOf(item)) high = middle - 1;
    else if (time >= endOf(item)) low = middle + 1;
    else return middle;
  }
  return Math.max(0, Math.min(items.length - 1, high));
}

function mediaUri(shot = {}) {
  return shot?.media_contract?.runtimeUri || shot?.runtime_media_uri || shot?.media_uri || "";
}

function mediaType(shot = {}) {
  if (shot?.media_contract?.type) return shot.media_contract.type;
  if (shot?.media_id === "none") return "generated-visualizer";
  const uri = mediaUri(shot);
  if (!uri) return "missing";
  return /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(uri) ? "image" : "video";
}

function projectKey(project = null) {
  if (!project) return "";
  return String(project.song_id || project.id || project.song_title || "echo-project");
}

export function createEchoPlaybackEngine({ adapter = {}, powerMode = "active" } = {}) {
  const listeners = new Set();
  let project = null;
  let generation = 0;
  let transitionToken = 0;
  let destroyed = false;
  let playing = false;
  let mode = normalizePlaybackPowerMode(powerMode);
  let clockTime = 0;
  let committedShotIndex = -1;
  let targetShotIndex = -1;
  let visualizerIndex = -1;
  let lyricLineIndex = -1;
  let lyricWordIndex = -1;
  let pendingShotIndex = -1;
  let lastSignature = "";
  let lastReason = "init";

  function snapshot() {
    const timeline = project?.timeline || [];
    const visualizers = project?.visualizer_timeline || [];
    const lyrics = project?.timed_lyrics || [];
    const shot = committedShotIndex >= 0 ? timeline[committedShotIndex] || null : null;
    const targetShot = targetShotIndex >= 0 ? timeline[targetShotIndex] || null : null;
    const line = lyricLineIndex >= 0 ? lyrics[lyricLineIndex] || null : null;
    return Object.freeze({
      generation,
      projectKey: projectKey(project),
      clockTime,
      duration: finite(project?.duration, 0),
      playing,
      powerMode: mode,
      shotIndex: committedShotIndex,
      targetShotIndex,
      pendingShotIndex,
      shot,
      targetShot,
      nextShot: committedShotIndex >= 0 ? timeline[committedShotIndex + 1] || null : null,
      visualizerIndex,
      visualizer: visualizerIndex >= 0 ? visualizers[visualizerIndex] || null : null,
      lyricLineIndex,
      lyricLine: line,
      lyricWordIndex,
      lyricWord: lyricWordIndex >= 0 ? line?.words?.[lyricWordIndex] || null : null,
      mediaType: mediaType(targetShot || shot || {}),
      mediaUri: mediaUri(targetShot || shot || {}),
      pureIvf: mediaType(targetShot || shot || {}) === "generated-visualizer",
      missingMedia: mediaType(targetShot || shot || {}) === "missing",
      reason: lastReason,
      destroyed
    });
  }

  function signature() {
    return [generation, playing, mode, committedShotIndex, targetShotIndex, pendingShotIndex, visualizerIndex, lyricLineIndex, lyricWordIndex, lastReason].join(":");
  }

  function publish(force = false) {
    const nextSignature = signature();
    if (!force && nextSignature === lastSignature) return snapshot();
    lastSignature = nextSignature;
    const next = snapshot();
    listeners.forEach((listener) => listener(next));
    adapter.onSnapshot?.(next);
    return next;
  }

  function commitShot(index, token, reason) {
    if (destroyed || token !== transitionToken || index !== targetShotIndex) return snapshot();
    committedShotIndex = index;
    pendingShotIndex = -1;
    lastReason = reason;
    const next = snapshot();
    adapter.commitShot?.(next.shot, next);
    return publish(true);
  }

  function requestShot(index, reason = "shot-boundary") {
    if (index === targetShotIndex && (index === committedShotIndex || index === pendingShotIndex)) return;
    targetShotIndex = index;
    const token = ++transitionToken;
    if (index < 0) {
      committedShotIndex = -1;
      pendingShotIndex = -1;
      lastReason = reason;
      publish(true);
      return;
    }
    const shot = project?.timeline?.[index] || null;
    const type = mediaType(shot || {});
    pendingShotIndex = index;
    lastReason = type === "missing" ? "missing-media" : reason;
    publish(true);
    if (!adapter.prepareShot || type === "generated-visualizer" || type === "image" || type === "missing") {
      commitShot(index, token, lastReason);
      return;
    }
    Promise.resolve(adapter.prepareShot(shot, { ...snapshot(), cueEntry: startOf(shot) }))
      .then((ready) => {
        if (ready === false) return;
        commitShot(index, token, reason);
      })
      .catch((error) => {
        if (destroyed || token !== transitionToken) return;
        pendingShotIndex = -1;
        lastReason = "late-decode-error";
        adapter.onError?.(error, snapshot());
        publish(true);
      });
  }

  function tick(nextClock = clockTime, options = {}) {
    if (destroyed) return snapshot();
    clockTime = Math.max(0, finite(nextClock));
    if (typeof options.playing === "boolean" && options.playing !== playing) {
      playing = options.playing;
      lastReason = playing ? "play" : "pause";
    }
    if (!project || mode === "hidden") return publish();
    const nextShotIndex = itemIndexAt(project.timeline || [], clockTime);
    const nextVisualizerIndex = itemIndexAt(project.visualizer_timeline || [], clockTime);
    const nextLineIndex = itemIndexAt(project.timed_lyrics || [], clockTime);
    const line = nextLineIndex >= 0 ? project.timed_lyrics?.[nextLineIndex] : null;
    const nextWordIndex = itemIndexAt(line?.words || [], clockTime);
    if (nextVisualizerIndex !== visualizerIndex) {
      visualizerIndex = nextVisualizerIndex;
      adapter.applyVisualizer?.(project.visualizer_timeline?.[visualizerIndex] || null, snapshot());
    }
    if (nextLineIndex !== lyricLineIndex || nextWordIndex !== lyricWordIndex) {
      lyricLineIndex = nextLineIndex;
      lyricWordIndex = nextWordIndex;
      adapter.applyLyrics?.(line || null, nextWordIndex, snapshot());
    }
    if (nextShotIndex !== targetShotIndex) requestShot(nextShotIndex, options.reason || "shot-boundary");
    return publish();
  }

  function setProject(nextProject = null, { preserveClock = false } = {}) {
    if (destroyed) return snapshot();
    project = projectBody(nextProject);
    generation += 1;
    transitionToken += 1;
    committedShotIndex = -1;
    targetShotIndex = -1;
    pendingShotIndex = -1;
    visualizerIndex = -1;
    lyricLineIndex = -1;
    lyricWordIndex = -1;
    if (!preserveClock) clockTime = 0;
    lastReason = "project-change";
    adapter.setProject?.(project, snapshot());
    publish(true);
    return tick(clockTime, { playing, reason: "project-entry" });
  }

  function seek(time = 0) {
    transitionToken += 1;
    targetShotIndex = -1;
    pendingShotIndex = -1;
    lastReason = "seek";
    adapter.onSeek?.(Math.max(0, finite(time)), snapshot());
    return tick(time, { playing, reason: "cue-entry" });
  }

  function setPlaying(nextPlaying) {
    playing = Boolean(nextPlaying);
    lastReason = playing ? "play" : "pause";
    adapter.setPlaying?.(playing, snapshot());
    return publish(true);
  }

  function setPowerMode(nextMode) {
    mode = normalizePlaybackPowerMode(nextMode);
    lastReason = "power-mode";
    adapter.setPowerMode?.(mode, snapshot());
    return publish(true);
  }

  function subscribe(listener) {
    if (destroyed) return () => {};
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    transitionToken += 1;
    listeners.clear();
    adapter.dispose?.(snapshot());
  }

  return {
    setProject,
    setPlaying,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    setPowerMode,
    seek,
    tick,
    subscribe,
    getSnapshot: snapshot,
    destroy
  };
}

export const echoPlaybackEngineInternals = Object.freeze({ itemIndexAt, mediaType, mediaUri });
