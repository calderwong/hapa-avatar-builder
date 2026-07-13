import fs from "node:fs";
import path from "node:path";

const EPSILON = 1e-6;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, places = 6) {
  const scale = 10 ** places;
  return Math.round(finite(value) * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function frameBoundary(seconds, fps) {
  return Math.round(finite(seconds) * fps);
}

function explicitBlank(instance = {}) {
  const type = String(instance?.source?.type || "").toLowerCase();
  return type === "generated-visualizer"
    || type === "generated"
    || type === "no-source"
    || instance?.source?.explicitBlank === true;
}

function resolveCompiledSource(projectRoot, instance = {}) {
  const uri = String(instance?.source?.compiledUri || "").trim();
  if (!uri) return null;
  const candidate = path.resolve(projectRoot, decodeURIComponent(uri).replace(/^\/+/, ""));
  if (candidate !== projectRoot && !candidate.startsWith(`${projectRoot}${path.sep}`)) return null;
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function cameraFor(instance = {}) {
  const rows = Array.isArray(instance.cameraKeyframes) ? instance.cameraKeyframes : [];
  const first = rows[0] || {};
  return {
    motion: String(first.motion || "static"),
    intensity: rounded(clamp(first.intensity, 0, 2)),
    speed: rounded(clamp(first.speed, 0, 8)),
    keyframeCount: rows.length,
  };
}

export function buildFoundationTimeline(show, { projectRoot, fps = 30, width = 1920, height = 1080 } = {}) {
  if (!show || typeof show !== "object") throw new Error("An executable HyperFrames show is required");
  const root = path.resolve(projectRoot || ".");
  const duration = finite(show.duration);
  if (!(duration > 0)) throw new Error("Executable show duration must be positive");
  if (!(fps > 0)) throw new Error("Foundation reel FPS must be positive");
  const instances = [...(show?.instances?.media || [])]
    .filter((row) => finite(row?.end, finite(row?.start) + finite(row?.duration)) > finite(row?.start))
    .sort((left, right) => finite(left.start) - finite(right.start) || finite(left.layerOrder) - finite(right.layerOrder));
  if (!instances.length) throw new Error("Executable show has no foundation media instances");

  const segments = [];
  let cursorFrame = 0;
  for (const [index, instance] of instances.entries()) {
    const start = clamp(instance.start, 0, duration);
    const end = clamp(finite(instance.end, start + finite(instance.duration)), 0, duration);
    const startFrame = frameBoundary(start, fps);
    const endFrame = frameBoundary(end, fps);
    if (startFrame > cursorFrame) {
      throw new Error(`Unexplained foundation gap from frame ${cursorFrame} to ${startFrame}; black is only allowed for explicit generated/no-source instances`);
    }
    if (startFrame < cursorFrame) {
      throw new Error(`Overlapping foundation instances are not supported: ${instance.id || index} starts at frame ${startFrame}, before ${cursorFrame}`);
    }
    if (endFrame <= startFrame) continue;

    const blank = explicitBlank(instance);
    const sourcePath = blank ? null : resolveCompiledSource(root, instance);
    if (!blank && !sourcePath) {
      throw new Error(`Foundation source is unavailable for ${instance.id || index}: ${instance?.source?.compiledUri || "no compiledUri"}`);
    }
    const sourceType = blank ? "explicit-black" : String(instance?.source?.type || "video");
    segments.push({
      index: segments.length,
      id: String(instance.id || instance.cueId || `media:${index}`),
      sourceType,
      sourcePath,
      sourceUri: blank ? null : String(instance.source.compiledUri),
      sourceSha256: blank ? null : String(instance.source.compiledSha256 || ""),
      sourceFidelity: blank ? "explicit-generated/no-source" : String(instance.source.fidelity || "source-media"),
      start: rounded(startFrame / fps),
      end: rounded(endFrame / fps),
      duration: rounded((endFrame - startFrame) / fps),
      startFrame,
      endFrame,
      frameCount: endFrame - startFrame,
      transition: String(instance.transition || "cut"),
      camera: cameraFor(instance),
    });
    cursorFrame = endFrame;
  }

  const totalFrames = frameBoundary(duration, fps);
  if (cursorFrame !== totalFrames) {
    throw new Error(`Unexplained foundation tail from frame ${cursorFrame} to ${totalFrames}; add an explicit generated/no-source instance if black is intended`);
  }

  return {
    schemaVersion: "hapa.hyperframes.foundation-reel-plan.v1",
    title: String(show.title || "Hapa Foundation Reel"),
    duration: rounded(totalFrames / fps),
    fps,
    width,
    height,
    totalFrames,
    segments,
    mediaSegments: segments.filter((row) => row.sourceType !== "explicit-black").length,
    explicitBlackSegments: segments.filter((row) => row.sourceType === "explicit-black").length,
    explicitBlackIntervals: segments
      .filter((row) => row.sourceType === "explicit-black")
      .map((row) => ({ id: row.id, start: row.start, end: row.end, duration: row.duration })),
    cameraBakedSegments: segments.filter((row) => row.camera.motion !== "static" && row.camera.intensity > 0).length,
  };
}

function cameraAxis(segment, axis, overscan, output) {
  const available = Math.max(0, overscan - output);
  if (!available) return "0";
  const center = available / 2;
  const amplitude = available * 0.46 * clamp(segment.camera.intensity / 1.35, 0, 1);
  const denominator = Math.max(1, segment.frameCount - 1);
  const phase = `(n/${denominator})`;
  const motion = segment.camera.motion;
  if (motion === "orbit") {
    const fn = axis === "x" ? "cos" : "sin";
    return `${rounded(center, 4)}+${rounded(amplitude, 4)}*${fn}(2*PI*${phase})`;
  }
  const positive = axis === "x"
    ? ["pan-left", "pan-up-left", "pan-down-left"].includes(motion)
    : ["pan-up", "pan-up-left", "pan-up-right"].includes(motion);
  const negative = axis === "x"
    ? ["pan-right", "pan-up-right", "pan-down-right"].includes(motion)
    : ["pan-down", "pan-down-left", "pan-down-right"].includes(motion);
  if (!positive && !negative) return String(rounded(center, 4));
  const start = positive ? center - amplitude : center + amplitude;
  const delta = positive ? amplitude * 2 : amplitude * -2;
  return `${rounded(start, 4)}+${rounded(delta, 4)}*${phase}`;
}

export function buildFoundationFfmpegArgs(plan, outputPath, { preset = "faster", crf = 18 } = {}) {
  if (!plan?.segments?.length) throw new Error("A non-empty foundation reel plan is required");
  const args = ["-hide_banner", "-loglevel", "warning"];
  for (const segment of plan.segments) {
    if (segment.sourceType === "explicit-black") {
      args.push("-f", "lavfi", "-i", `color=c=0x02040a:s=${plan.width}x${plan.height}:r=${plan.fps}:d=${segment.duration}`);
    } else {
      args.push("-stream_loop", "-1", "-i", segment.sourcePath);
    }
  }

  const overscanWidth = Math.ceil(plan.width * 1.1 / 2) * 2;
  const overscanHeight = Math.ceil(plan.height * 1.1 / 2) * 2;
  const filters = plan.segments.map((segment, index) => {
    const common = [
      `fps=${plan.fps}`,
      `scale=${overscanWidth}:${overscanHeight}:force_original_aspect_ratio=increase`,
      `crop=${overscanWidth}:${overscanHeight}`,
      "setsar=1",
    ];
    if (segment.sourceType !== "explicit-black") {
      common.push(`crop=${plan.width}:${plan.height}:x='${cameraAxis(segment, "x", overscanWidth, plan.width)}':y='${cameraAxis(segment, "y", overscanHeight, plan.height)}'`);
    } else {
      common.push(`crop=${plan.width}:${plan.height}`);
    }
    common.push(`trim=start_frame=0:end_frame=${segment.frameCount}`, "setpts=PTS-STARTPTS", "format=yuv420p");
    return `[${index}:v]${common.join(",")}[v${index}]`;
  });
  filters.push(`${plan.segments.map((_, index) => `[v${index}]`).join("")}concat=n=${plan.segments.length}:v=1:a=0[outv]`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[outv]",
    "-an",
    "-fps_mode", "cfr",
    "-r", String(plan.fps),
    "-frames:v", String(plan.totalFrames),
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-level:v", "4.1",
    "-g", String(plan.fps * 2),
    "-keyint_min", String(plan.fps * 2),
    "-sc_threshold", "0",
    "-movflags", "+faststart",
    "-map_metadata", "-1",
    "-metadata", "creation_time=",
    "-y", path.resolve(outputPath),
  );
  return args;
}

export function installFoundationReelInShow(show, reel = {}) {
  const sourceMediaTimeline = structuredClone(show?.instances?.media || []);
  const result = structuredClone(show);
  result.instances = result.instances || {};
  result.instances.media = [{
    id: "foundation-reel:0",
    cueId: "foundation-reel:0",
    cueIndex: 0,
    layerOrder: 0,
    trackId: "foundation-reel",
    start: 0,
    end: finite(result.duration),
    duration: finite(result.duration),
    templateId: "precompiled-foundation-reel-v1",
    mediaId: "foundation-reel",
    title: `${String(result.title || "Hapa")} foundation reel`,
    source: {
      type: "video",
      compiledUri: String(reel.compiledUri || "assets/media/foundation-reel.mp4"),
      compiledSha256: String(reel.sha256 || ""),
      fidelity: "precompiled-source-media-timeline",
      codec: "h264",
      pixelFormat: "yuv420p",
      faststart: true,
    },
    transition: "cut",
    cameraKeyframes: [],
    cameraTransforms: "baked-into-foundation-reel",
  }];
  result.packaging = {
    ...(result.packaging || {}),
    mediaBufferPolicy: {
      mode: "single-precompiled-foundation-reel",
      lookAheadSeconds: finite(result.duration),
      releaseAfterSeconds: 0,
      bootstrapUri: null,
      bootstrapSha256: null,
    },
    foundationReel: {
      schemaVersion: "hapa.hyperframes.foundation-reel.v1",
      compiledUri: String(reel.compiledUri || "assets/media/foundation-reel.mp4"),
      sha256: String(reel.sha256 || ""),
      planSha256: String(reel.planSha256 || ""),
      sourceManifestSha256: String(reel.sourceManifestSha256 || ""),
      sourceMediaTimeline,
      sourceMediaInstanceCount: sourceMediaTimeline.length,
      physicalVideoElementCount: 1,
      cameraTransforms: "baked",
      explicitBlackIntervals: reel.explicitBlackIntervals || [],
      fidelity: "source media decoded, framed, and camera-transformed once; no bootstrap pixels",
    },
  };
  return result;
}

export function patchFoundationReelHtml(sourceHtml, { duration, reelUri = "assets/media/foundation-reel.mp4" } = {}) {
  let html = String(sourceHtml || "");
  const bootstrapStart = html.indexOf("<script>(function(){const defer=");
  if (bootstrapStart >= 0) {
    const bootstrapEnd = html.indexOf("</script>", bootstrapStart);
    if (bootstrapEnd < 0) throw new Error("Could not locate the end of the bootstrap deferral script");
    html = html.slice(0, bootstrapStart) + html.slice(bootstrapEnd + "</script>".length);
  }
  const mediaStartMarker = '<div id="media-root">';
  const mediaEndMarker = '<div id="proxy-root">';
  const mediaStart = html.indexOf(mediaStartMarker);
  const mediaEnd = html.indexOf(mediaEndMarker, mediaStart);
  if (mediaStart < 0 || mediaEnd < 0) throw new Error("Could not locate the generated media root");
  const foundationMarkup = `<div id="media-root"><video id="foundation-reel" class="media" src="${reelUri}" data-start="0" data-duration="${finite(duration)}" data-camera-baked="true" preload="auto" muted playsinline></video></div>`;
  html = html.slice(0, mediaStart) + foundationMarkup + html.slice(mediaEnd);
  html = html.replace(/(<div id="root"[^>]*\bdata-duration=")[^"]+("[^>]*>)/, `$1${finite(duration)}$2`);
  html = html.replace(/(<audio id="mix-audio"[^>]*\bdata-duration=")[^"]+("[^>]*>)/, `$1${finite(duration)}$2`);

  const functionStart = html.indexOf("function mediaFrame(t)");
  const functionEnd = html.indexOf("function sampleHash()", functionStart);
  if (functionStart < 0 || functionEnd < 0) throw new Error("Could not locate the generated media scheduler");
  const replacement = `function mediaFrame(t){const el=media[0];if(!el)return;el.style.opacity='1';el.style.transform='none';const last=Math.max(0,S.duration-1/${Math.max(1, finite(duration) ? 30 : 30)}),wanted=Math.max(0,Math.min(last,Number(t)||0));if(Number.isFinite(el.duration)&&el.duration>0&&Math.abs((el.currentTime||0)-wanted)>.001)try{el.currentTime=wanted}catch{}}\n`;
  html = html.slice(0, functionStart) + replacement + html.slice(functionEnd);
  html = html.replace(".media{opacity:0;transform:scale(1.08);", ".media{opacity:1;transform:none;");
  html = html.replace("window.__timelines.main=timeline", "window.__timelines['main']=timeline");
  html = html.replace(/EXECUTABLE SHOW V2 \/\/ OFFLINE \/\/ /g, "FOUNDATION REEL V1 // OFFLINE // ");
  html = html.replace(
    "window.HAPA_ASSETS_READY=Promise.all([...proxyImages.values()].map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve()))",
    "const foundationReady=!media[0]||media[0].readyState>=2?Promise.resolve():new Promise((resolve,reject)=>{media[0].addEventListener('loadeddata',resolve,{once:true});media[0].addEventListener('error',()=>reject(new Error('foundation reel failed to load')),{once:true})});window.HAPA_ASSETS_READY=Promise.all([foundationReady,...[...proxyImages.values()].map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve())])",
  );
  if (html.includes("data-media-src") || html.includes("hapa-video-bootstrap")) {
    throw new Error("Foundation project still references rolling source clips or bootstrap pixels");
  }
  const videoSources = [...html.matchAll(/<video\b[^>]*\bsrc=/g)];
  if (videoSources.length !== 1) throw new Error(`Foundation project must contain exactly one timed video source; found ${videoSources.length}`);
  return html;
}

export function inlineFoundationRuntimeHtml(sourceHtml, { showScript, pinnedTimelineSource, visualizerRuntimeSource } = {}) {
  let html = String(sourceHtml || "");
  const showTag = '<script src="assets/data/show.js"></script>';
  const timelineTag = '<script src="assets/runtime/pinned-timeline.js"></script>';
  if (!html.includes(showTag) || !html.includes(timelineTag)) {
    throw new Error("Could not locate generated show/timeline script tags for offline inlining");
  }
  const runtimeClassic = String(visualizerRuntimeSource || "")
    .replace(/\bexport\s+(?=(?:const|function|class)\b)/g, "")
    .replace(/\r?\n/g, " ");
  if (!runtimeClassic.includes("globalThis.HapaHyperFramesVisualizerRuntime")) {
    throw new Error("Visualizer runtime does not expose the required global evaluator");
  }
  html = html
    .replace(showTag, `<script>${String(showScript || "")}</script>`)
    .replace(timelineTag, `<script>${String(pinnedTimelineSource || "")}</script>`)
    .replace(
      "<script type=\"module\">import{evaluateHyperFramesVisualizers}from'./assets/runtime/hyperframes-visualizer-runtime.js';",
      `<script>(()=>{${runtimeClassic}\n})();\nconst evaluateHyperFramesVisualizers=globalThis.HapaHyperFramesVisualizerRuntime.evaluateHyperFramesVisualizers;\n`,
    );
  if (/<script\b[^>]*\bsrc=/i.test(html) || /<script\b[^>]*type=["']module["']/i.test(html)) {
    throw new Error("Foundation project still contains a runtime script dependency after offline inlining");
  }
  return html;
}
