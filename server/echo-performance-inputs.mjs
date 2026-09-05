import { deriveEchoDirectionVariantProject, echoDirectionVariantFingerprint } from '../src/domain/echo-direction-variants.js';
import { buildCueGraph, normalizeStemRecords } from '../src/domain/echo-director-v2.js';
import { normalizeEchoLyricContract } from '../src/domain/echo-lyric-contract.js';
import { echoProjectAudioRoute } from '../src/domain/echo-audio-route.js';
import { normalizeHyperFramesStemRole } from '../src/domain/hyperframes-visualizer-runtime.js';

/** Audio-only source projection. It is never a render graph or certificate.
 * Visual rendering readiness cannot gate preparation of the selected audio. */
export function echoPerformanceInputs({ project: source, variant = null, registry = null }) {
  const project = variant ? deriveEchoDirectionVariantProject(source, variant) : source;
  const declaredGraph = project.director_show_graph;
  const routeGraph = declaredGraph?.song?.audioPath || declaredGraph?.song?.audioUri ? declaredGraph
    : { song: { audioPath: project.audio_path || project.audio_uri || '' } };
  const audioUri = echoProjectAudioRoute(project, routeGraph).uri;
  const cues = buildCueGraph(project);
  const lyrics = normalizeEchoLyricContract(project);
  const registryStems = normalizeStemRecords(project, registry);
  const stemRole = stem => normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id);
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
