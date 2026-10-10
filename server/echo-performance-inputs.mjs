import fs from 'node:fs';
import { deriveEchoDirectionVariantProject, echoDirectionVariantFingerprint } from '../src/domain/echo-direction-variants.js';
import { buildCueGraph, normalizeStemRecords } from '../src/domain/echo-director-v2.js';
import { normalizeEchoLyricContract } from '../src/domain/echo-lyric-contract.js';
import { echoProjectAudioRoute } from '../src/domain/echo-audio-route.js';
import { normalizeHyperFramesStemRole } from '../src/domain/hyperframes-visualizer-runtime.js';
import { chooseStemSet, stemRoleLabel } from '../src/domain/echo-stem-set.js';

const text = value => String(value ?? '').trim();

function localCustodyStemRecords(project = {}, songStore = null) {
  const projectIds = new Set([
    project.song_id,
    project.audio_id,
    project.registry_track_id,
  ].map(text).filter(Boolean));
  // Exact song ID first: renamed duplicates can share a Suno/registry ID.
  const song = (songStore?.songs || []).find(candidate => text(candidate?.id) && text(candidate.id) === text(project.song_id))
    || (songStore?.songs || []).find(candidate => [
    candidate?.id,
    candidate?.songId,
    candidate?.registryTrackId,
    candidate?.audio?.registryTrackId,
    candidate?.lineage?.registryTrackId,
    candidate?.attribution?.songRegistryTrackId,
  ].map(text).some(identity => identity && projectIds.has(identity)));
  // The song's current set only (one generation, one record per role; WAV preferred via localPath).
  const current = chooseStemSet(song?.stems || [], { songTitle: song?.title || project.song_title, preferDirs: [song?.audio?.localPath] });
  return current.map(stem => ({
    id: text(stem.id) || `stem:${stemRoleLabel(stem).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    stemType: stemRoleLabel(stem) || 'Unknown',
    role: normalizeHyperFramesStemRole(stemRoleLabel(stem) || stem.id),
    title: text(stem.title || stem.stemType || stem.role) || 'Unknown stem',
    duration: Number(stem.duration || project.duration || 0) || 0,
    audioPath: text(stem.localPath || stem.audioPath || stem.uri),
    truthStatus: text(stem.localPath || stem.audioPath || stem.uri) ? 'verified_local_ingest_path' : 'local_ingest_record_without_path',
  }));
}

/** Audio-only source projection. It is never a render graph or certificate.
 * Visual rendering readiness cannot gate preparation of the selected audio. */
export function echoPerformanceInputs({ project: source, variant = null, registry = null, songStore = null }) {
  const project = variant ? deriveEchoDirectionVariantProject(source, variant) : source;
  const declaredGraph = project.director_show_graph;
  const routeGraph = declaredGraph?.song?.audioPath || declaredGraph?.song?.audioUri ? declaredGraph
    : { song: { audioPath: project.audio_path || project.audio_uri || '' } };
  const audioUri = echoProjectAudioRoute(project, routeGraph).uri;
  const cues = buildCueGraph(project);
  const lyrics = normalizeEchoLyricContract(project);
  const stemRole = stem => normalizeHyperFramesStemRole(stemRoleLabel(stem) || stem.id);
  // Exactly one stem set: the Builder's current custody set when it has playable files,
  // otherwise one Registry generation. Never merge roles across sets or formats.
  const localStems = localCustodyStemRecords(project, songStore);
  // Prefer the Builder's custody set only while its files exist; a moved library
  // (e.g. a renumbered Suno export folder) falls back to one Registry generation.
  const onDisk = stem => Boolean(stem.audioPath) && (!stem.audioPath.startsWith('/') || fs.existsSync(stem.audioPath));
  const generation = normalizeStemRecords(project, registry);
  const localMoved = localStems.some(stem => stem.audioPath) && !localStems.every(stem => !stem.audioPath || onDisk(stem));
  const generationPlayable = generation.some(stem => stem.audioPath) && generation.every(stem => !stem.audioPath || onDisk(stem));
  const registryStems = localStems.some(stem => stem.audioPath) && !(localMoved && generationPlayable) ? localStems : generation;
  const declaredStems = Array.isArray(declaredGraph?.stems?.items) ? declaredGraph.stems.items : [];
  // A declared graph defines the stem set only when it carries real audio (a compiled graph).
  // The local editor projection lists `stems_available` titles without paths (stale templates,
  // MP3+WAV duplicates, archive names); those must never become pathless placeholders that
  // fail preparation, so the song's one current stem set is used instead.
  const declaredCarriesAudio = declaredStems.some(stem => text(stem.audioPath));
  const stems = declaredCarriesAudio ? declaredStems.map(stem => {
    if (stem.audioPath) return stem;
    const source = registryStems.find(candidate => stemRole(candidate) === stemRole(stem));
    return source?.audioPath ? { ...stem, audioPath: source.audioPath, sourceRegistryStemId: source.id } : stem;
  }).filter(stem => text(stem.audioPath)) : registryStems;
  return { audioUri, graph: {
    schemaVersion: 'hapa.echo.audio-preparation-inputs.v1',
    source: { songId: project.song_id, cutId: variant?.id || 'legacy', cutFingerprint: variant ? echoDirectionVariantFingerprint(variant) : null, renderCertification: false },
    song: { id: project.song_id, audioPath: audioUri, durationSeconds: cues.durationSeconds,
      lyricOverlay: { ...lyrics, lines: lyrics.enabled ? cues.lyricCues.map(cue => ({ start: cue.startSeconds, end: cue.endSeconds, text: cue.text, words: cue.words })) : [], source: cues.timingTruth.lyricStatus } },
    stems: { items: stems.map(stem => ({ ...stem })), count: stems.length },
  } };
}
