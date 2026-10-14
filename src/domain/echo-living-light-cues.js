import { canonicalJSON, LivingLightValidationError } from './living-light-contracts.js';
import { resolveEchoOutputProfile } from './echo-output-profile.js';

export const ECHO_LIVING_LIGHT_CUE_SCHEMA = 'hapa.echo.living-light-cue.v1';
export const ECHO_LIVING_LIGHT_TRACK_SCHEMA = 'hapa.echo.living-light-track.v1';
const fail = (code, path, message) => { throw new LivingLightValidationError(code, path, message); };
const object = (value, path, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('living_light_cue_object', path, 'Expected a cue object.');
  for (const key of Object.keys(value)) if (!fields.includes(key)) fail('living_light_cue_field', `${path}.${key}`, 'Unknown cue field.');
};
const id = (value, path) => {
  if (typeof value !== 'string' || value.length > 256 || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(value)) fail('living_light_cue_identity', path, 'An exact saved identifier is required.');
};
const window = (value, path) => {
  object(value, path, ['startUs', 'endUs']);
  if (!Number.isSafeInteger(value.startUs) || !Number.isSafeInteger(value.endUs) || value.startUs < 0 || value.endUs <= value.startUs) fail('living_light_cue_window', path, 'Use a positive, half-open interval in integer microseconds.');
};

/** Inert authoring contract shared by the cut owner, compiler and editor.
 * Resolution/readiness is derived separately; callers cannot assert it. */
export function validateEchoLivingLightCues(cues, { songId, durationUs } = {}) {
  if (cues === undefined) return [];
  if (!Array.isArray(cues) || cues.length > 128) fail('living_light_cue_limit', 'living_light_cues', 'Use at most 128 Living Light cues.');
  const seen = new Set();
  cues.forEach((cue, index) => {
    const path = `living_light_cues.${index}`;
    object(cue, path, ['schemaVersion', 'cueId', 'role', 'songId', 'journeyRef', 'sourceBindingRef', 'window', 'journeyWindow', 'clock', 'mapping', 'outputProfile', 'locks']);
    if (cue.schemaVersion !== ECHO_LIVING_LIGHT_CUE_SCHEMA) fail('living_light_cue_schema', path, 'Unsupported Living Light cue version.');
    for (const key of ['cueId', 'songId']) id(cue[key], `${path}.${key}`);
    if (seen.has(cue.cueId)) fail('living_light_cue_duplicate', path, 'Cue IDs must be unique.');
    seen.add(cue.cueId);
    if (songId !== undefined && cue.songId !== songId) fail('living_light_cue_song', path, 'Fork the Journey explicitly before using it with another song.');
    if (!['scene', 'transition'].includes(cue.role)) fail('living_light_cue_role', path, 'Choose Scene or Transition.');
    object(cue.journeyRef, `${path}.journeyRef`, ['journeyId', 'revisionId']);
    for (const key of ['journeyId', 'revisionId']) id(cue.journeyRef[key], `${path}.journeyRef.${key}`);
    if (cue.sourceBindingRef !== null) {
      object(cue.sourceBindingRef, `${path}.sourceBindingRef`, ['bindingId', 'revisionId']);
      for (const key of ['bindingId', 'revisionId']) id(cue.sourceBindingRef[key], `${path}.sourceBindingRef.${key}`);
    }
    window(cue.window, `${path}.window`);
    window(cue.journeyWindow, `${path}.journeyWindow`);
    if (durationUs !== undefined && (!Number.isSafeInteger(durationUs) || durationUs < 1 || cue.window.endUs > durationUs)) fail('living_light_cue_duration', path, 'The cue must fit the song; it is never silently clipped.');
    if (cue.clock !== 'echo-song' || cue.mapping !== 'offset-1x' || cue.window.endUs - cue.window.startUs !== cue.journeyWindow.endUs - cue.journeyWindow.startUs) fail('living_light_cue_time_mapping', path, 'Journey time advances at the original speed. Choose an equal-length source window.');
    if (cue.outputProfile !== 'project') fail('living_light_cue_profile', path, 'Living Light uses the cut’s selected output profile.');
    object(cue.locks, `${path}.locks`, ['timing', 'journey']);
    if (typeof cue.locks.timing !== 'boolean' || typeof cue.locks.journey !== 'boolean') fail('living_light_cue_locks', path, 'Both timing and Journey locks must be explicit.');
  });
  const ordered = [...cues].sort((a, b) => a.window.startUs - b.window.startUs);
  for (let i = 1; i < ordered.length; i++) if (ordered[i].window.startUs < ordered[i - 1].window.endUs) fail('living_light_cue_overlap', 'living_light_cues', 'Living Light cues share one native surface and cannot overlap.');
  return cues;
}

export function echoProjectLivingLightCues(project = {}) {
  const body = project.music_video_project || project.project || project;
  return validateEchoLivingLightCues(body.living_light_cues, {
    songId: body.song_id,
    ...(body.duration !== undefined ? { durationUs: Math.round(Number(body.duration) * 1e6) } : {}),
  });
}

export function compileEchoLivingLightTrack(project = {}) {
  const cues = echoProjectLivingLightCues(project);
  if (!cues.length) return null;
  const body = project.music_video_project || project.project || project;
  return {
    schemaVersion: ECHO_LIVING_LIGHT_TRACK_SCHEMA,
    cues: structuredClone(cues),
    outputProfile: resolveEchoOutputProfile(body.output_profile ?? body.outputProfile),
    readiness: { preview: 'requires-native-host-and-exact-resolution', finalEncoding: 'unsupported' },
  };
}

/** A reference is not resolved by title, latest head or a caller's ready flag. */
export function resolveEchoLivingLightCue(cue, { resolveJourney } = {}) {
  validateEchoLivingLightCues([cue]);
  const record = resolveJourney?.(cue.journeyRef);
  const journey = record?.journey || record;
  if (!journey || journey.journeyId !== cue.journeyRef.journeyId || journey.revisionId !== cue.journeyRef.revisionId) fail('living_light_journey_unavailable', 'journeyRef', 'The exact saved Journey revision is unavailable.');
  if (journey.songId !== cue.songId || canonicalJSON(journey.sourceBindingRef) !== canonicalJSON(cue.sourceBindingRef)) fail('living_light_journey_source_mismatch', 'sourceBindingRef', 'The saved Journey song/source binding differs from this cue.');
  const endUs = journey.schedule?.at(-1)?.endUs;
  if (!Number.isSafeInteger(endUs) || cue.journeyWindow.endUs > endUs) fail('living_light_journey_window', 'journeyWindow', 'The selected window extends beyond the saved Journey.');
  // A passage must run as authored, with both destination endpoints available.
  const bridges = (journey.schedule || []).filter(row => row.fromInstanceId && row.toInstanceId);
  const intersecting = bridges.filter(row => row.startUs < cue.journeyWindow.endUs && row.endUs > cue.journeyWindow.startUs);
  if (intersecting.some(row => row.startUs < cue.journeyWindow.startUs || row.endUs > cue.journeyWindow.endUs)) fail('living_light_passage_truncated', 'journeyWindow', 'Include the complete native passage; short transitions need a different treatment.');
  if (cue.role === 'transition' && !bridges.some(row => row.startUs === cue.journeyWindow.startUs && row.endUs === cue.journeyWindow.endUs)) fail('living_light_transition_window', 'journeyWindow', 'A native transition selects exactly one complete authored passage.');
  return structuredClone(journey);
}

/** Read only the exact revisions through the existing authoring owner. */
export function validateEchoLivingLightSavedReferences(project, resolveJourney) {
  const cues = echoProjectLivingLightCues(project);
  for (const cue of cues) resolveEchoLivingLightCue(cue, { resolveJourney });
  return cues;
}

export function echoLivingLightCueAt(cues, songUs) {
  if (!Number.isSafeInteger(songUs) || songUs < 0) return null;
  const cue = cues.find(row => row.window.startUs <= songUs && songUs < row.window.endUs);
  return cue ? { cue, songUs, journeyUs: cue.journeyWindow.startUs + songUs - cue.window.startUs } : null;
}

export function attachEchoLivingLightTrack(graph, project) {
  const track = compileEchoLivingLightTrack(project);
  if (track) graph.livingLight = track;
  else delete graph.livingLight;
  return graph;
}

export function assertEchoLivingLightExportSupported(project, graph) {
  const declared = echoProjectLivingLightCues(project);
  if (declared.length || graph?.livingLight != null) fail('living_light_export_unsupported', 'living_light_cues', 'Living Light cues need a qualified native render or an explicit source-bound baked output. This export cannot omit them.');
}
