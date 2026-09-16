import { deriveEchoDirectionVariantProject, echoDirectionVariantFingerprint } from '../src/domain/echo-direction-variants.js';
import { buildCueGraph, normalizeStemRecords } from '../src/domain/echo-director-v2.js';
import { normalizeEchoLyricContract } from '../src/domain/echo-lyric-contract.js';
import { echoProjectAudioRoute } from '../src/domain/echo-audio-route.js';
import { normalizeHyperFramesStemRole } from '../src/domain/hyperframes-visualizer-runtime.js';

const text = value => String(value ?? '').trim();

function localCustodyStemRecords(project = {}, songStore = null) {
  const projectIds = new Set([
    project.song_id,
    project.audio_id,
    project.registry_track_id,
  ].map(text).filter(Boolean));
  const song = (songStore?.songs || []).find(candidate => [
    candidate?.id,
    candidate?.songId,
    candidate?.registryTrackId,
    candidate?.audio?.registryTrackId,
    candidate?.lineage?.registryTrackId,
    candidate?.attribution?.songRegistryTrackId,
  ].map(text).some(identity => identity && projectIds.has(identity)));
  return (song?.stems || []).map(stem => ({
    id: text(stem.id) || `stem:${text(stem.stemType || stem.role || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    stemType: text(stem.stemType || stem.role || stem.title) || 'Unknown',
    role: normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id),
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
  const registryStems = normalizeStemRecords(project, registry);
  const stemRole = stem => normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id);
  for (const localStem of localCustodyStemRecords(project, songStore)) {
    const existing = registryStems.find(candidate => stemRole(candidate) === stemRole(localStem));
    if (existing) {
      if (!existing.audioPath && localStem.audioPath) Object.assign(existing, localStem);
    } else {
      registryStems.push(localStem);
    }
  }
  const declaredStems = declaredGraph?.stems?.items;
  const stems = declaredStems?.length ? declaredStems.map(stem => {
    if (stem.audioPath) return stem;
    const source = registryStems.find(candidate => stemRole(candidate) === stemRole(stem));
    return source?.audioPath ? { ...stem, audioPath: source.audioPath, sourceRegistryStemId: source.id } : stem;
  }) : registryStems;
  return { audioUri, graph: {
    schemaVersion: 'hapa.echo.audio-preparation-inputs.v1',
    source: { songId: project.song_id, cutId: variant?.id || 'legacy', cutFingerprint: variant ? echoDirectionVariantFingerprint(variant) : null, renderCertification: false },
    song: { id: project.song_id, audioPath: audioUri, durationSeconds: cues.durationSeconds,
      lyricOverlay: { ...lyrics, lines: lyrics.enabled ? cues.lyricCues.map(cue => ({ start: cue.startSeconds, end: cue.endSeconds, text: cue.text, words: cue.words })) : [], source: cues.timingTruth.lyricStatus } },
    stems: { items: stems.map(stem => ({ ...stem })), count: stems.length },
  } };
}
