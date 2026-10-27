#!/usr/bin/env node
// Integrated multi-visual performance scripts, several per song.
//
// Foreground and in-process: no workers, models, renders or analysis jobs.
// Reads each song's Director project, its saved cuts (for the media they
// cast and their song-clocked Living Light Journey), the newest Atlas run with
// beats and sections, verified written lyric timing and the gated shader
// manifest; then plans, projects and compiles one script per treatment.
// Writes artifacts only. Saved cuts, Song Cards and Journeys are never changed.
//
//   node scripts/compile-echo-integrated-performances.mjs [--output=DIR] [--songs=a,b] [--treatments=story-arc,...] [--seed=S] [--limit=N] [--registry=FILE]
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { createAudioAtlas } from "../server/audio-atlas.mjs";
import { buildEchoMusicalTimelineFromAtlas } from "../src/domain/echo-visual-score.js";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { hydrateManifestNativeRoutes } from "../src/domain/native-visualizer-route.js";
import { echoShaderFinalRenderReadiness } from "../src/domain/echo-shader-picker.js";
import { attachEchoLivingLightTrack, validateEchoLivingLightSavedReferences } from "../src/domain/echo-living-light-cues.js";
import { attachEchoScoreDustTrack } from "../src/domain/echo-score-dust-layer.js";
import { compileEchoCutModulationBindings } from "../src/domain/echo-recipe-execution.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import { echoSavedVariantRows } from "../server/echo-saved-cut-reader.mjs";
import { createLivingLightRegistry } from "../src/living-light/registry.js";
import { LivingLightStore } from "../server/living-light-store.mjs";
import { loadGatedEchoIsfManifest, repairEchoProjectShaders, DEFAULT_ECHO_ISF_MANIFEST_PATH, DEFAULT_ECHO_ISF_PIXEL_GATE_PATH } from "./echo-isf-gated-manifest.mjs";
import { preflightEchoDirectionCut } from "./preflight-echo-director-media.mjs";
import { extractFramePixels } from "../server/media-visual-signature-extract.mjs";
import { resolveEchoRuntimeMediaUri } from "../server/echo-runtime-media-route.mjs";
import { paletteHistogramFromPixels } from "../src/domain/media-visual-signature.js";
import {
  ECHO_INTEGRATED_CUT_LINEAGE, ECHO_INTEGRATED_TREATMENTS, echoIntegratedMediaPool, echoIntegratedPaletteFromHistogram, echoIntegratedLumaFromHistogram, echoIntegratedShaderPool, planEchoIntegratedPerformance,
  projectEchoIntegratedPerformance, renderEchoIntegratedPerformanceScript,
} from "../src/domain/echo-integrated-performance.js";

const root = path.resolve(import.meta.dirname, "..");
const data = path.join(root, "data");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const today = new Date().toISOString().slice(0, 10);
const output = path.resolve(arg("output") || path.join(data, "echo-integrated-performances", today));
const seed = arg("seed") || "echo-integrated-v1";
const treatments = (arg("treatments") || Object.keys(ECHO_INTEGRATED_TREATMENTS).join(",")).split(",").map((t) => t.trim()).filter(Boolean);
for (const t of treatments) if (!ECHO_INTEGRATED_TREATMENTS[t]) throw new Error(`Unknown treatment ${t}`);
const onlySongs = arg("songs") ? new Set(arg("songs").split(",")) : null;
const limit = Number(arg("limit") || Infinity);
const registryPath = arg("registry") || path.join(process.env.HOME || "", "Desktop/hapa-song-registry/data/registry.json");

const readJson = (file, fallback = undefined) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { if (fallback !== undefined) return fallback; throw error; } };
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };

// Shaders: the same gate the Director V2 compile script uses.
const gated = loadGatedEchoIsfManifest({ manifestPath: DEFAULT_ECHO_ISF_MANIFEST_PATH, pixelGatePath: DEFAULT_ECHO_ISF_PIXEL_GATE_PATH });
const manifest = hydrateManifestNativeRoutes(gated.manifest, readJson(path.join(path.dirname(DEFAULT_ECHO_ISF_MANIFEST_PATH), "proxies/native-exact-proxies.json"), {}));
const shaderPool = echoIntegratedShaderPool(manifest.shaders || [], (s) => echoShaderFinalRenderReadiness(s).finalRenderReady === true);
const registry = readJson(registryPath, null);
const atlas = createAudioAtlas({ root });
const journeys = new LivingLightStore({ file: path.join(data, "living-light/authoring.sqlite3"), registry: createLivingLightRegistry() });

function savedCuts(songId) {
  const dir = path.join(data, "music-video-project-variants", songId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
    // Integrated cuts are this script's own output; feeding them back in would change the next plan.
    try { return echoSavedVariantRows(readJson(path.join(dir, f))).filter((v) => v.lineage?.kind !== ECHO_INTEGRATED_CUT_LINEAGE).map((v) => ({ ...v, sourceFile: f })); } catch { return []; }
  });
}

// The newest saved Journey a cut of this song already references, preferring
// one that covers the whole song (journey time = song time).
function songJourney(songId, cuts, durationUs) {
  const refs = cuts.flatMap((cut) => (cut.project_patch?.living_light_cues || []).map((cue) => ({ cut, ref: cue.journeyRef })))
    .sort((a, b) => String(b.cut.updatedAt || b.cut.createdAt || "").localeCompare(String(a.cut.updatedAt || a.cut.createdAt || "")));
  const found = [];
  for (const { cut, ref } of refs) {
    if (!ref?.journeyId || found.some((f) => f.journeyRef.journeyId === ref.journeyId && f.journeyRef.revisionId === ref.revisionId)) continue;
    try {
      const { journey } = journeys.journey(ref.journeyId, ref.revisionId);
      const end = Math.max(0, ...(journey.schedule || []).map((row) => Number(row.endUs ?? row.window?.endUs ?? 0)));
      const covered = Number(journey.durationUs ?? end);
      if (journey.songId === songId && covered > 0) found.push({ journeyRef: { journeyId: ref.journeyId, revisionId: ref.revisionId }, sourceBindingRef: journey.sourceBindingRef ?? null, schedule: (journey.schedule || []).map(({ startUs, endUs, fromInstanceId, toInstanceId }) => ({ startUs, endUs, fromInstanceId, toInstanceId })), durationUs: covered, fromCut: cut.id, title: journey.title || null });
    } catch { /* A missing or unreadable Journey is skipped. */ }
  }
  return found.find((f) => f.durationUs >= durationUs) || found.sort((a, b) => b.durationUs - a.durationUs)[0] || null;
}

// Dust colours: each cast shot's poster (or its video's first frame), one
// bounded ffmpeg decode at a time through the media visual signature owner.
const paletteCache = new Map();
async function mediaLooks(shots, pool) {
  const fields = new Map(pool.map((m) => [m.mediaId, m.fields || {}]));
  const palettes = {}, luma = {};
  for (const mediaId of [...new Set(shots.map((shot) => shot.mediaId))]) {
    if (!paletteCache.has(mediaId)) {
      const f = fields.get(mediaId) || {};
      let look = null;
      for (const [uri, timeSeconds] of [[f.media_thumbnail, 0], [f.runtime_media_uri || f.media_uri, Number(f.media_contract?.sourceInSeconds || 0) + 0.5]]) {
        const route = uri ? resolveEchoRuntimeMediaUri(uri, { root }) : null;
        if (!route?.ok || !route.resolvedPath) continue;
        try {
          const frame = await extractFramePixels({ path: route.resolvedPath, timeSeconds, width: 64, height: 64, pixelFormat: "rgb24", timeoutMs: 15000 });
          const histogram = paletteHistogramFromPixels(frame.pixels, frame.width, frame.height);
          look = { palette: echoIntegratedPaletteFromHistogram(histogram), luma: echoIntegratedLumaFromHistogram(histogram) };
          break;
        } catch { /* An unreadable picture leaves the dust on its generated colours. */ }
      }
      paletteCache.set(mediaId, look);
    }
    const look = paletteCache.get(mediaId);
    if (look?.palette) palettes[mediaId] = look.palette;
    if (Number.isFinite(look?.luma)) luma[mediaId] = look.luma;
  }
  return { palettes, luma };
}

// Drop media the preflight cannot resolve, so every script is renderable.
function resolvableMedia(pool, baseProject, projectPath) {
  const probe = { ...baseProject, director_show_graph: undefined, hyperframe_script: undefined, persistent_shader_slots: [], visualizer_timeline: [], living_light_cues: undefined,
    timeline: pool.map((m, i) => ({ ...m.fields, section_id: "probe", start_sec: i, end_sec: i + 1, shot_index: i, transition: "cut" })) };
  const report = preflightEchoDirectionCut({ project: probe, sourcePath: projectPath, avatarRoot: root });
  const bad = new Set(report.failures.map((f) => f.mediaId).filter(Boolean));
  return { pool: pool.filter((m) => !bad.has(m.mediaId)), dropped: [...bad], reportOk: report.ok };
}

const projectsDir = path.join(data, "music-video-projects");
const projectFiles = fs.readdirSync(projectsDir).filter((f) => f.endsWith("-video-project.json")).sort();
const index = { schemaVersion: "hapa.echo.integrated-performance-batch.v1", createdAt: new Date().toISOString(), seed, treatments, output,
  shaderPool: { ready: shaderPool.length, alwaysOn: shaderPool.filter((s) => s.alwaysOn).length, audioMapped: shaderPool.filter((s) => s.signals.length).length, manifestHash: gated.manifestHash },
  songs: [] };
let attempted = 0;
for (const file of projectFiles) {
  const projectPath = path.join(projectsDir, file);
  const projectBytes = fs.readFileSync(projectPath);
  const raw = JSON.parse(projectBytes.toString("utf8"));
  const sourceProjectSha256 = crypto.createHash("sha256").update(projectBytes).digest("hex");
  const baseProject = raw.music_video_project || raw.project || raw;
  const songId = String(baseProject.song_id || file.replace(/-video-project\.json$/, ""));
  if (onlySongs && !onlySongs.has(songId)) continue;
  if (attempted >= limit) break;
  attempted += 1;
  const entry = { songId, title: baseProject.song_title || songId, scripts: [], skipped: null };
  index.songs.push(entry);
  try {
    const run = atlas.visualScoreRun(songId);
    if (!run.run || run.basis !== "beats-and-sections") { entry.skipped = `No Atlas run with beats and sections (${run.reason})`; continue; }
    const timeline = buildEchoMusicalTimelineFromAtlas(atlas.result(run.run.id));
    const durationSeconds = Math.min(Number(baseProject.duration) || timeline.durationSeconds, timeline.durationSeconds);
    const verdict = atlas.visualScoreLyrics(run.run.id);
    const lyrics = { verified: verdict.status === "verified", status: verdict.status, reason: verdict.reason || null, lines: verdict.lyricLines || [] };
    const cuts = savedCuts(songId);
    const media = resolvableMedia(echoIntegratedMediaPool(cuts), baseProject, projectPath);
    if (!media.pool.length) { entry.skipped = "No resolvable media in the song's saved cuts"; continue; }
    const livingLight = songJourney(songId, cuts, Math.floor(durationSeconds * 1000) * 1000);
    Object.assign(entry, { atlasRunId: run.run.id, lyricTiming: lyrics.status, cuts: cuts.length, mediaPool: media.pool.length, mediaDropped: media.dropped.length, livingLightJourney: livingLight?.journeyRef?.journeyId || null, livingLightMapping: livingLight ? (livingLight.durationUs >= Math.floor(durationSeconds * 1000) * 1000 ? "song-clocked" : "entered-late") : null });
    for (const treatment of treatments) {
      const planInputs = { song: { songId, title: entry.title, durationSeconds }, timeline, lyrics, lyricAudioHash: verdict.lyricAudioHash, mediaPool: media.pool, shaderPool, livingLight, treatment, seed };
      // Colours do not change the casting, so the second pass keeps the same shots and adds their palettes.
      const cast = planEchoIntegratedPerformance(planInputs).layers.media;
      const looks = await mediaLooks(cast, media.pool);
      const plan = planEchoIntegratedPerformance({ ...planInputs, mediaPalettes: looks.palettes, mediaLuma: looks.luma });
      if (JSON.stringify(plan.layers.media.map((s) => s.mediaId)) !== JSON.stringify(cast.map((s) => s.mediaId))) throw new Error("Palettes changed the casting.");
      // The layer must name the score the Builder will render: the same Atlas
      // visual-score composition the preview's "Render layer" requests.
      let scoreDustBinding = null;
      const dustLayer = plan.layers.scoreDust.layer;
      if (dustLayer) {
        const builderScore = atlas.visualScore(run.run.id, { direction: dustLayer.source.direction, ...(dustLayer.source.lyricLines ? { lyricLines: dustLayer.source.lyricLines } : {}) });
        const binding = { scoreFingerprint: builderScore.score.fingerprint, seed: builderScore.playSettings.seed };
        scoreDustBinding = binding.scoreFingerprint === dustLayer.binding.scoreFingerprint && binding.seed === dustLayer.binding.seed ? "matches-builder-score" : "rebound-to-builder-score";
        if (scoreDustBinding !== "matches-builder-score") plan.layers.scoreDust.layer = { ...dustLayer, binding };
      }
      // The plan casts only ready shaders; the shared repair still runs so a
      // quarantined cue can never reach the compiler.
      const { project, shaderRepair } = repairEchoProjectShaders(projectEchoIntegratedPerformance(plan, baseProject, media.pool), manifest);
      const preflight = preflightEchoDirectionCut({ project, sourcePath: projectPath, avatarRoot: root });
      // Every cue must resolve against the saved Journey revision, as certification resolves it.
      validateEchoLivingLightSavedReferences(project, (ref) => journeys.journey(ref.journeyId, ref.revisionId));
      const artifacts = buildDirectorV2Artifacts({ project, sourceProject: project, manifest, registry, duration: durationSeconds, recipe: plan.recipe, seed: `${seed}:${treatment}`, avatarRoot: root,
        locks: [{ targetId: "media-casting", reason: "integrated performance plan cast the media" }] });
      // The same layer and telemetry compile a saved cut gets when it is derived.
      const showGraph = compileEchoCutModulationBindings(attachEchoScoreDustTrack(attachEchoLivingLightTrack(artifacts.showGraph, project), project), { project });
      const bindings = showGraph.directorV2?.modulationBindings || [];
      const hyperframe = generateEchoHyperframeScript({ ...project, director_show_graph: showGraph });
      const compiled = { sourceProjectSha256, livingLightResolved: true, tracks: showGraph.tracks.length, modulationBindings: bindings.filter((b) => b.target?.kind === "visualizer_uniform").length,
        slotOpacityBindings: bindings.filter((b) => b.target?.kind === "visualizer_opacity").length, cutModulation: showGraph.directorV2?.cutModulation || null,
        livingLight: Boolean(showGraph.livingLight), scoreDustLayer: showGraph.scoreDust?.status || null, scoreDustBinding, shaderRepairs: shaderRepair.replacementCount, mediaPreflight: preflight.ok ? "ok" : `${preflight.failures.length} unresolved`,
        // The compiled picture track must be the plan's cast, shot for shot.
        castPreserved: JSON.stringify((showGraph.tracks.find((t) => t.id === "track-a")?.cards || []).map((c) => c.media?.id)) === JSON.stringify(plan.layers.media.map((s) => s.mediaId)) };
      const dir = path.join(output, songId, treatment);
      const { score, ...dustSummary } = plan.layers.scoreDust;
      writeJson(path.join(dir, "plan.json"), { ...plan, layers: { ...plan.layers, scoreDust: dustSummary }, compiled });
      writeJson(path.join(dir, "score-dust.json"), score);
      writeJson(path.join(dir, "project.json"), project);
      writeJson(path.join(dir, "native-show-graph.json"), showGraph);
      writeJson(path.join(dir, "variant-receipt.json"), artifacts.receipt);
      writeText(path.join(dir, "hyperframe.html"), hyperframe);
      writeText(path.join(dir, "DIRECTOR_SCRIPT.md"), renderEchoIntegratedPerformanceScript(plan, { compiled }));
      entry.scripts.push({ treatment, planId: plan.planId, layersUsed: plan.checks.layersUsed, sections: plan.sections.length, shots: plan.layers.media.length,
        shaders: new Set(plan.layers.shaders.map((s) => s.shaderId)).size, livingLightCues: plan.layers.livingLight.cues.length, dustPhrases: plan.layers.scoreDust.phrases.length, ...compiled });
    }
  } catch (error) {
    entry.skipped = `Failed: ${error.message}`;
    if (process.env.DEBUG_INTEGRATED) console.error(error.stack);
  }
  console.log(JSON.stringify({ songId, scripts: entry.scripts.length, skipped: entry.skipped }));
}
await atlas.close?.();
journeys.db?.close?.();
writeJson(path.join(output, "index.json"), index);
const done = index.songs.filter((s) => s.scripts.length);
const lines = [`# Echo integrated performances — ${today}`, "",
  `${done.length} songs · ${done.reduce((n, s) => n + s.scripts.length, 0)} director scripts · treatments: ${treatments.join(", ")} · seed \`${seed}\``, "",
  `Shader pool: ${index.shaderPool.ready} final-render-ready generators (${index.shaderPool.alwaysOn} always-on waveforms, ${index.shaderPool.audioMapped} audio-mapped).`, "",
  "| Song | Lyrics | Media | Living Light | Scripts (layers / shots / LL cues / dust phrases / bindings) |", "|---|---|---|---|---|",
  ...done.map((s) => `| [${s.title}](${s.songId}/) | ${s.lyricTiming} | ${s.mediaPool}${s.mediaDropped ? ` (−${s.mediaDropped})` : ""} | ${s.livingLightJourney ? "yes" : "no"} | ${s.scripts.map((x) => `${x.treatment}: ${x.layersUsed}/${x.shots}/${x.livingLightCues}/${x.dustPhrases}/${x.modulationBindings}`).join("<br>")} |`),
  "", "## Skipped", "", ...index.songs.filter((s) => !s.scripts.length).map((s) => `- ${s.title} (\`${s.songId}\`): ${s.skipped}`), ""];
writeText(path.join(output, "REPORT.md"), lines.join("\n"));
console.log(JSON.stringify({ output, songs: done.length, scripts: done.reduce((n, s) => n + s.scripts.length, 0), skipped: index.songs.length - done.length }));
