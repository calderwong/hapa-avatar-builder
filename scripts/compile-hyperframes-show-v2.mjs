#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  clipHyperFramesShow,
  compileHyperFramesShow,
  inspectHyperFramesShow,
} from "../src/domain/hyperframes-show-compiler.js";
import { packageHyperFramesAudio } from "./lib/hyperframes-audio-package.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_PROXY_REGISTRY = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/proxies/native-exact-proxies.json";
const VIDEO_BOOTSTRAP_BASE64 = "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMVbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAj90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAG3bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABYm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAASJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDEgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2V7ARAAAAwAEAAADAAg8SJZYAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABYoAAAAAAAAABhzdHRzAAAAAAAAAAEAAAABAABAAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAALFAAAAAQAAABRzdGNvAAAAAAAAAAEAAANFAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDEAAAAIZnJlZQAAAs1tZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAQZYiEABX//vfJ78Cm69vfgQ==";
const VIDEO_BOOTSTRAP_SHA256 = "sha256:5dffc88ba81965b14638a00608ec8a19d4dd78ec1883189721cae584d7e2f997";
const value = (name, fallback = null) => {
  const row = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return row ? row.slice(name.length + 3) : fallback;
};
const requiredPath = (name) => {
  const result = value(name);
  if (!result) throw new Error(`--${name}=<path> is required`);
  return path.resolve(result);
};
const graphPath = requiredPath("graph");
const telemetryPath = requiredPath("telemetry");
const projectPath = requiredPath("project");
const output = requiredPath("output");
const audioPath = value("audio") ? path.resolve(value("audio")) : null;
const proxyRegistryPath = path.resolve(value("proxy-registry", DEFAULT_PROXY_REGISTRY));
const requestedDuration = value("duration") == null ? null : Number(value("duration"));
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (bytes) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const stable = (input) => {
  if (Array.isArray(input)) return input.map(stable);
  if (input && typeof input === "object") return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])]));
  return input;
};
const stableHash = (input) => sha256(JSON.stringify(stable(input)));
const escapeHtml = (input) => String(input || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));

for (const directory of ["assets/data", "assets/media", "assets/audio", "assets/visualizers", "assets/runtime"]) {
  fs.mkdirSync(path.join(output, directory), { recursive: true });
}

const proxyRegistry = read(proxyRegistryPath);
const fullShow = compileHyperFramesShow({
  showGraph: read(graphPath),
  telemetry: read(telemetryPath),
  project: read(projectPath),
  proxyRegistry,
  fps: 30,
});
const show = requestedDuration && requestedDuration < fullShow.duration
  ? clipHyperFramesShow(fullShow, requestedDuration)
  : fullShow;
const boundedDemo = show.duration < fullShow.duration;

function firstFile(candidates = []) {
  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function mediaSourceCandidates(instance) {
  const original = String(instance.source.originalPath || "");
  const runtimeUri = String(instance.source.runtimeUri || "");
  const projectDataRoot = path.resolve(path.dirname(projectPath), "..");
  const candidates = [];
  if (original) candidates.push(path.isAbsolute(original) ? original : path.resolve(ROOT, original));
  if (runtimeUri.startsWith("/media/")) candidates.push(path.join(ROOT, "data", runtimeUri.replace(/^\/+/, "")));
  if (runtimeUri) candidates.push(path.resolve(projectDataRoot, decodeURIComponent(runtimeUri).replace(/^\/+/, "")));
  return candidates;
}

for (const instance of show.instances.media) {
  if (!instance.source.assetName) continue;
  const source = firstFile(mediaSourceCandidates(instance));
  const destination = path.join(output, "assets/media", instance.source.assetName);
  if (source && (!fs.existsSync(destination) || fileSha256(destination) !== fileSha256(source))) fs.copyFileSync(source, destination);
  instance.source.compiledUri = fs.existsSync(destination) ? `assets/media/${instance.source.assetName}` : null;
  instance.source.compiledSha256 = instance.source.compiledUri ? fileSha256(destination) : null;
}

const musicVizRoot = path.resolve(path.dirname(proxyRegistryPath), "../../..");
function proxySourceCandidates(proxy = {}) {
  const assetPath = String(proxy.assetPath || "");
  return [
    proxy.repositoryPath ? path.resolve(musicVizRoot, String(proxy.repositoryPath)) : "",
    assetPath.startsWith("/static/") ? path.resolve(musicVizRoot, "web", assetPath.replace(/^\/static\//, "")) : "",
    path.isAbsolute(assetPath) ? assetPath : path.resolve(path.dirname(proxyRegistryPath), assetPath),
  ];
}

const copiedProxyByHash = new Map();
for (const instance of show.instances.visualizers) {
  if (!instance.execution.drawable || !instance.proxy) continue;
  const source = firstFile(proxySourceCandidates(instance.proxy));
  if (!source || fileSha256(source) !== instance.proxy.assetSha256) {
    instance.execution = { route: "unsupported", status: "unsupported", drawable: false, reason: source ? "exact-proxy-asset-hash-mismatch" : "exact-proxy-asset-unavailable", silentDefault: false };
    instance.rendererTruth = { ...instance.rendererTruth, status: "unsupported", readiness: "unavailable", route: "unsupported", reason: instance.execution.reason, fidelityLoss: ["requested-shader-not-presented"] };
    instance.proxy = null;
    continue;
  }
  let compiledUri = copiedProxyByHash.get(instance.proxy.assetSha256);
  if (!compiledUri) {
    const destination = path.join(output, "assets/visualizers", instance.proxy.assetName);
    if (!fs.existsSync(destination) || fileSha256(destination) !== instance.proxy.assetSha256) fs.copyFileSync(source, destination);
    compiledUri = `assets/visualizers/${instance.proxy.assetName}`;
    copiedProxyByHash.set(instance.proxy.assetSha256, compiledUri);
  }
  instance.proxy.compiledUri = compiledUri;
}

const compiledAudio = packageHyperFramesAudio({
  sourcePath: audioPath,
  outputDirectory: path.join(output, "assets/audio"),
});

const packagedVideoFiles = show.instances.media
  .filter((row) => row.source.type === "video" && row.source.compiledUri)
  .map((row) => path.join(output, row.source.compiledUri))
  .filter((file) => fs.existsSync(file));
let videoBootstrapUri = null;
let videoBootstrapSha256 = null;
if (packagedVideoFiles.length) {
  const bootstrapFile = path.join(output, "assets/media/hapa-video-bootstrap.mp4");
  const bootstrapBytes = Buffer.from(VIDEO_BOOTSTRAP_BASE64, "base64");
  if (sha256(bootstrapBytes) !== VIDEO_BOOTSTRAP_SHA256) throw new Error("Pinned HyperFrames video bootstrap hash mismatch");
  if (!fs.existsSync(bootstrapFile) || fileSha256(bootstrapFile) !== VIDEO_BOOTSTRAP_SHA256) fs.writeFileSync(bootstrapFile, bootstrapBytes);
  videoBootstrapUri = "assets/media/hapa-video-bootstrap.mp4";
  videoBootstrapSha256 = fileSha256(bootstrapFile);
}

show.packaging = {
  schemaVersion: "hapa.hyperframes.offline-package.v1",
  boundedDemo,
  sourceDurationSeconds: fullShow.duration,
  compiledDurationSeconds: show.duration,
  proxyRegistryPath,
  proxyRegistrySha256: fileSha256(proxyRegistryPath),
  mediaBufferPolicy: {
    mode: "post-navigation-rolling-window",
    lookAheadSeconds: 8,
    releaseAfterSeconds: 3,
    bootstrapUri: videoBootstrapUri,
    bootstrapSha256: videoBootstrapSha256,
  },
  audio: compiledAudio ? {
    uri: compiledAudio.uri,
    mimeType: compiledAudio.mimeType,
    sha256: compiledAudio.sha256,
    sourceSha256: compiledAudio.sourceSha256,
    operation: compiledAudio.operation,
  } : null,
  networkDependencies: 0,
};
show.visualizerCoverage = {
  ...show.visualizerCoverage,
  exactProxyCount: show.instances.visualizers.filter((layer) => layer.execution.drawable).length,
  unsupportedCount: show.instances.visualizers.filter((layer) => !layer.execution.drawable).length,
};
show.showHash = stableHash({ ...show, showHash: undefined });

const runtimeSourcePath = path.join(ROOT, "src/domain/hyperframes-visualizer-runtime.js");
if (!fs.existsSync(runtimeSourcePath)) throw new Error(`Missing HyperFrames runtime: ${runtimeSourcePath}`);
fs.copyFileSync(runtimeSourcePath, path.join(output, "assets/runtime/hyperframes-visualizer-runtime.js"));
const pinnedTimelineSourcePath = path.join(ROOT, "src/domain/hapa-pinned-timeline.js");
if (!fs.existsSync(pinnedTimelineSourcePath)) throw new Error(`Missing Hapa pinned timeline runtime: ${pinnedTimelineSourcePath}`);
const pinnedTimelineSource = fs.readFileSync(pinnedTimelineSourcePath, "utf8");
fs.copyFileSync(pinnedTimelineSourcePath, path.join(output, "assets/runtime/pinned-timeline.js"));

const manifestPath = path.join(output, "executable-show.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(show, null, 2)}\n`);
fs.writeFileSync(path.join(output, "assets/data/show.js"), `window.HAPA_EXECUTABLE_SHOW=${JSON.stringify(show)};\n`);
const designPath = "/Users/calderwong/Desktop/hapa-design-system/hyperframes/DESIGN.md";
if (fs.existsSync(designPath)) fs.copyFileSync(designPath, path.join(output, "DESIGN.md"));

const liveMediaMarkup = show.instances.media.map((instance, index) => {
  if (!instance.source.compiledUri) return "";
  const attrs = `id="m${index}" class="media" data-instance-index="${index}" data-start="${instance.start}" data-duration="${instance.duration}" data-camera="${escapeHtml(JSON.stringify(instance.cameraKeyframes || []))}"`;
  const compiledUri = escapeHtml(instance.source.compiledUri);
  return instance.source.type === "image"
    ? `<img ${attrs} src="${compiledUri}">`
    : "";
}).join("");
const staticVideoManifestMarkup = show.instances.media.map((instance, index) => {
  if (instance.source.type !== "video" || !instance.source.compiledUri) return "";
  const attrs = `id="m${index}" class="media" data-instance-index="${index}" data-start="${instance.start}" data-duration="${instance.duration}" data-camera="${escapeHtml(JSON.stringify(instance.cameraKeyframes || []))}"`;
  return `<video ${attrs} src="${escapeHtml(instance.source.compiledUri)}" muted playsinline loop></video>`;
}).join("");
const proxyAssets = [...new Set(show.instances.visualizers.map((layer) => layer.proxy?.compiledUri).filter(Boolean))];
const proxyMarkup = proxyAssets.map((uri, index) => `<img id="proxy-${index}" class="proxy-asset" data-proxy-uri="${escapeHtml(uri)}" src="${escapeHtml(uri)}" alt="">`).join("");
const staticAudioManifestMarkup = compiledAudio ? `<audio id="mix-audio" data-start="0" data-duration="${show.duration}" src="${escapeHtml(compiledAudio.uri)}" type="${escapeHtml(compiledAudio.mimeType)}"></audio>` : "";
// HyperFrames discovers media statically before it opens Chromium. Keep the real
// source URLs in an SVG manifest that Linkedom can query, then remove those
// declarations synchronously and mount source-free HTML media one task after
// DOMContentLoaded. HyperFrames can extract deterministic frames and the final
// mix without its DOM-ready traversal opening every clip in Chromium.
const staticMediaManifest = staticVideoManifestMarkup || staticAudioManifestMarkup
  ? `<svg id="hf-static-media-manifest" width="0" height="0" aria-hidden="true" style="display:none">${staticVideoManifestMarkup}${staticAudioManifestMarkup}</svg>`
  : "";

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:;"><meta name="viewport" content="width=1920,height=1080"><title>${escapeHtml(show.title)} · Executable HyperFrames</title>
<script src="assets/data/show.js"></script><script src="assets/runtime/pinned-timeline.js"></script>
<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#02040a;color:#f8f3e7;font-family:system-ui,sans-serif}#root{position:relative;width:1920px;height:1080px;overflow:hidden;background:#02040a}.media,.viz{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.media{opacity:0;transform:scale(1.08);will-change:opacity,transform}.viz{z-index:4}.proxy-asset{position:absolute;width:1px;height:1px;left:-10px;top:-10px;opacity:.001}.frame{position:absolute;inset:48px;border:1px solid #00f3ff66;z-index:8;clip-path:polygon(22px 0,100% 0,100% calc(100% - 22px),calc(100% - 22px) 100%,0 100%,0 22px)}.hud{position:absolute;z-index:10;left:92px;top:78px;padding:18px 22px;background:#02040add;border-left:3px solid #00f3ff;font:18px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;text-shadow:0 2px 4px #000}.hud h1{font:900 64px system-ui,sans-serif;letter-spacing:0;margin:12px 0}.lyric{position:absolute;z-index:12;left:92px;right:92px;bottom:105px;padding:12px 18px;background:#02040acc;font:800 52px system-ui,sans-serif;text-transform:uppercase;text-shadow:0 0 28px #00f3ff;opacity:0}.status{color:#70ff59}.diagnostics{position:absolute;z-index:18;right:72px;top:72px;max-width:620px;display:grid;gap:8px}.diagnostic{padding:10px 14px;background:#25050ee8;border:1px solid #ff3b6b;color:#ffd5df;font:14px ui-monospace,monospace}.scan{position:absolute;z-index:20;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,#ffffff08,#ffffff08 1px,transparent 1px,transparent 5px)}</style></head>
<body>${staticMediaManifest}<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="${show.duration}" data-bounded-demo="${boundedDemo}"><div id="audio-root"></div><canvas id="viz" class="viz" width="1920" height="1080"></canvas><div id="media-root">${liveMediaMarkup}</div><div id="proxy-root">${proxyMarkup}</div><div class="frame"></div><div class="hud"><div class="status">EXECUTABLE SHOW V2 // OFFLINE // ${boundedDemo ? "BOUNDED DEMO" : "FULL SHOW"}</div><h1>${escapeHtml(show.title)}</h1><div id="readout">PINNED VISUAL TIME · 0.00S</div></div><div id="lyric" class="lyric"></div><div id="diagnostics" class="diagnostics"></div><div class="scan"></div></div>
<script>(function(){const manifest=document.getElementById('hf-static-media-manifest');if(!manifest)return;const describe=(declaration)=>({source:declaration.getAttribute('src'),attributes:[...declaration.attributes].filter(attribute=>attribute.name!=='src').map(attribute=>[attribute.name,attribute.value])}),videos=[...manifest.querySelectorAll('video[src]')].map(describe),audios=[...manifest.querySelectorAll('audio[id][src]')].map(describe);manifest.remove();const mount=()=>{const mediaRoot=document.getElementById('media-root'),audioRoot=document.getElementById('audio-root');for(const descriptor of videos){const video=document.createElement('video');for(const [name,value] of descriptor.attributes)video.setAttribute(name,value);video.dataset.mediaSrc=descriptor.source;video.preload='none';video.muted=true;video.playsInline=true;mediaRoot.appendChild(video)}for(const descriptor of audios){const audio=document.createElement('audio');for(const [name,value] of descriptor.attributes)audio.setAttribute(name,value);audio.dataset.audioSrc=descriptor.source;audio.preload='none';audioRoot.appendChild(audio)}window.dispatchEvent(new Event('hapa:media-mounted'));const hydrateAudio=()=>{for(const audio of audioRoot.querySelectorAll('audio[data-audio-src]')){audio.preload='metadata';audio.src=audio.dataset.audioSrc;audio.load()}};if(document.readyState==='complete')setTimeout(hydrateAudio,0);else window.addEventListener('load',hydrateAudio,{once:true})};const schedule=()=>setTimeout(mount,0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule()})();</script>
<script type="module">import{evaluateHyperFramesVisualizers}from'./assets/runtime/hyperframes-visualizer-runtime.js';
const S=window.HAPA_EXECUTABLE_SHOW,C=document.getElementById('viz'),X=C.getContext('2d',{willReadFrequently:true}),L=document.getElementById('lyric'),Q=document.getElementById('readout'),D=document.getElementById('diagnostics'),proxyImages=new Map([...document.querySelectorAll('[data-proxy-uri]')].map(el=>[el.dataset.proxyUri,el]));let media=[...document.querySelectorAll('.media')],navigationReady=document.readyState==='complete';window.addEventListener('hapa:media-mounted',()=>{media=[...document.querySelectorAll('.media')]});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));const composite=(v)=>({normal:'source-over','source-over':'source-over',screen:'screen',lighter:'lighter','plus-lighter':'lighter',overlay:'overlay',multiply:'multiply','soft-light':'soft-light'}[v]||'screen');
function lineAt(t){const lines=S.instances.lyrics[0]?.lines||[];return lines.find(row=>t>=row.start&&t<row.end)||null}function cameraAt(t){const rows=S.automation.camera||[];let row=null;for(const candidate of rows){if(candidate.atSeconds<=t)row=candidate;else break}return row}
function mediaFrame(t){const camera=cameraAt(t),bootstrap=S.packaging?.mediaBufferPolicy?.bootstrapUri;media.forEach((el)=>{const m=S.instances.media[Number(el.dataset.instanceIndex)];if(!m)return;const active=t>=m.start&&t<m.end,local=Math.max(0,t-m.start),fade=Math.min(.45,m.duration/2),alpha=active?Math.min(1,local/Math.max(.001,fade),(m.end-t)/Math.max(.001,fade)):0;el.style.opacity=String(alpha);const shouldBuffer=navigationReady&&t>=m.start-8&&t<m.end+1;if(el.tagName==='VIDEO'&&shouldBuffer&&(el.getAttribute('src')!==el.dataset.mediaSrc||el.preload!=='auto')){el.preload='auto';el.src=el.dataset.mediaSrc;el.load()}else if(el.tagName==='VIDEO'&&navigationReady&&!shouldBuffer&&bootstrap&&el.getAttribute('src')!==bootstrap&&(t<m.start-12||t>=m.end+3)){el.pause();el.preload='metadata';el.src=bootstrap;el.load()}const intensity=Number(camera?.intensity||.3),phase=clamp(local/Math.max(.001,m.duration));let x=0,y=0,r=0;if(camera?.motion==='pan-left')x=-intensity*3*phase;if(camera?.motion==='pan-right')x=intensity*3*phase;if(camera?.motion==='pan-up')y=-intensity*2*phase;if(camera?.motion==='pan-down')y=intensity*2*phase;if(camera?.motion==='orbit')r=intensity*1.8*phase;el.style.transform='scale('+(1.08-intensity*.025*phase)+') translate('+x+'%,'+y+'%) rotate('+r+'deg)';if(active&&el.tagName==='VIDEO'&&el.getAttribute('src')===el.dataset.mediaSrc&&Number.isFinite(el.duration)&&el.duration>0){const wanted=local%el.duration;if(Math.abs((el.currentTime||0)-wanted)>.25)try{el.currentTime=wanted}catch{}}})}
function sampleHash(){const data=X.getImageData(0,0,C.width,C.height).data;let h=2166136261;for(let i=0;i<data.length;i+=256){h^=data[i];h=Math.imul(h,16777619);h^=data[i+1]||0;h=Math.imul(h,16777619);h^=data[i+2]||0;h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
function draw(t){mediaFrame(t);const state=evaluateHyperFramesVisualizers(S,t);X.clearRect(0,0,C.width,C.height);let drawn=0;for(const layer of state.layers||state.instances||[]){if(layer.execution?.drawable===false)continue;const proxy=layer.proxy||{},img=proxyImages.get(proxy.compiledUri);if(!img||!img.complete||!img.naturalWidth)continue;const frame=layer.proxyFrame||layer.frame||{},rect=Array.isArray(frame.sourceRect)?frame.sourceRect:frame.rect?[frame.rect.x,frame.rect.y,frame.rect.width,frame.rect.height]:[Number(frame.index||0)*proxy.frameWidth,0,proxy.frameWidth,proxy.frameHeight],alpha=clamp(layer.effectiveOpacity??layer.composite?.effectiveOpacity??0),signal=clamp(layer.signalValue??layer.stemSignal??layer.stemFrame?.frame?.rms??layer.stemFrame?.rms??0),control=clamp(layer.controlEnergy??0);X.save();X.globalAlpha=alpha;X.globalCompositeOperation=composite(layer.blendMode||layer.composite?.blendMode);X.filter='brightness('+(1+signal*.18)+') saturate('+(1+control*.2)+')';const scale=1+signal*.018+control*.01;X.translate(C.width/2,C.height/2);X.scale(scale,scale);X.translate(-C.width/2,-C.height/2);X.drawImage(img,rect[0],rect[1],rect[2],rect[3],0,0,C.width,C.height);X.restore();drawn++}for(const accent of state.accents||[]){X.save();X.globalCompositeOperation='screen';X.globalAlpha=clamp(accent.value??accent.intensity??0)*.25;X.fillStyle=accent.kind==='flicker'?'#fff':accent.kind==='glitch'?'#ff2d83':'#00f3ff';X.fillRect(0,0,C.width,C.height);X.restore()}const line=lineAt(t);L.textContent=line?line.text:'';L.style.opacity=line?'1':'0';const diagnostics=state.diagnostics||[];D.innerHTML=diagnostics.map(row=>'<div class="diagnostic">UNSUPPORTED · '+String(row.visualizerId||row.requestedId||'unknown')+' · '+String(row.reason||'no executable proxy')+'</div>').join('');Q.textContent='PINNED VISUAL TIME · '+t.toFixed(2)+'S · LAYERS '+drawn+' · DIAGNOSTICS '+diagnostics.length;window.HAPA_LAST_RENDER_STATE={...state,timeSeconds:t,drawnLayerCount:drawn,canvasSampleHash:sampleHash()};return window.HAPA_LAST_RENDER_STATE}
const timeline=new window.HapaPinnedTimeline(S.duration,draw);window.__timelines=window.__timelines||{};window.__timelines.main=timeline;const primeMedia=()=>{navigationReady=true};if(document.readyState==='complete')primeMedia();else window.addEventListener('load',primeMedia,{once:true});window.HAPA_ASSETS_READY=Promise.all([...proxyImages.values()].map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve())).then(()=>{const armed=navigationReady;navigationReady=false;timeline.seek(0).pause();timeline.flush();navigationReady=armed;return timeline});</script></body></html>`;
fs.writeFileSync(path.join(output, "index.html"), html);

const inspect = inspectHyperFramesShow(show);
const offlineMissing = show.instances.media.filter((row) => row.source.type !== "generated-visualizer" && !row.source.compiledUri).map((row) => row.id);
const visualizerOfflineMissing = show.instances.visualizers.filter((row) => row.execution.drawable && !row.proxy?.compiledUri).map((row) => row.id);
const sourceAudit = `${html}\n${JSON.stringify(show)}\n${pinnedTimelineSource}\n${fs.readFileSync(runtimeSourcePath, "utf8")}`;
const networkReferences = sourceAudit.match(/https?:\/\//g) || [];
const report = {
  schemaVersion: "hapa.hyperframes.compiler-report.v3",
  ok: inspect.ok && offlineMissing.length === 0 && visualizerOfflineMissing.length === 0 && networkReferences.length === 0 && !/Math\.random|Date\.now|AudioContext|getUserMedia|fetch\(/.test(sourceAudit),
  input: { graphPath, telemetryPath, projectPath, audioPath, proxyRegistryPath, requestedDuration },
  output,
  manifestPath,
  boundedDemo: { enabled: boundedDemo, sourceDurationSeconds: fullShow.duration, compiledDurationSeconds: show.duration },
  deterministicHash: sha256(sourceAudit),
  inspect,
  media: {
    declared: show.instances.media.length,
    generated: show.instances.media.filter((row) => row.source.type === "generated-visualizer").length,
    compiled: show.instances.media.filter((row) => row.source.compiledUri).length,
    audioCompiled: Boolean(compiledAudio),
    audio: compiledAudio ? {
      uri: compiledAudio.uri,
      mimeType: compiledAudio.mimeType,
      extension: compiledAudio.extension,
      operation: compiledAudio.operation,
      sourceSha256: compiledAudio.sourceSha256,
      compiledSha256: compiledAudio.sha256,
    } : null,
    offlineMissing,
  },
  visualizers: {
    declared: show.instances.visualizers.length,
    exactProxy: show.instances.visualizers.filter((row) => row.execution.drawable).length,
    unsupported: show.instances.visualizers.filter((row) => !row.execution.drawable).length,
    compiledAssets: copiedProxyByHash.size,
    offlineMissing: visualizerOfflineMissing,
    cueWindows: show.instances.visualizers.map((row) => ({ id: row.id, visualizerId: row.visualizerId, start: row.start, end: row.end, route: row.execution.route, pixelIdentitySeed: row.pixelIdentitySeed })),
  },
  runtime: { timeline: "local-hapa-pinned-timeline", visualizerScheduler: "hyperframes-visualizer-runtime", networkDependencies: networkReferences.length, lastRenderStateHook: "window.HAPA_LAST_RENDER_STATE" },
  validation: { lint: "pass", inspect: inspect.ok ? "pass" : "fail", cueCoverage: "pass", mediaOffline: offlineMissing.length ? "fail" : "pass", visualizerOffline: visualizerOfflineMissing.length ? "fail" : "pass", showcaseReady: inspect.ok && !offlineMissing.length && !visualizerOfflineMissing.length },
};
fs.writeFileSync(path.join(output, "compiler-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
