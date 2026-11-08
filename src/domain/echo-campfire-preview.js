import { validateCampfireDirection, CAMPFIRE_DIRECTION_SCHEMA } from './echo-campfire-direction.js';

// An automatic preview is transient. It does not append a saved direction or
// copy the pilot song's identity, cues, ending or creative overrides.
export function buildEchoCampfirePreviewPacket(dust, songId) {
  const timeline = dust?.timeline, score = dust?.score, source = timeline?.source;
  // Cast-library membership is not the Campfire image loader's availability
  // check. Its bounded same-origin preload reports missing/invalid images and
  // keeps the owner's shape fallback. All structural score failures still stop.
  const errors = dust?.validation?.errors || [];
  const onlyMissingAssets = errors.length > 0 && errors.every(error => error.code === 'absent-asset');
  if (dust?.status !== 'atlas' || !score || (!dust.validation?.ok && !onlyMissingAssets)) {
    throw new Error(errors.map(error => error.message).filter(Boolean).join(' ') || dust?.message || 'Preparing this song’s Audio Atlas timing for Campfire…');
  }
  if (source?.songId !== songId || !/^[a-f0-9]{64}$/i.test(source?.sourceSha256 || '') || !source.runId) {
    throw new Error('Campfire needs this song’s exact master recording and measured timing.');
  }
  const revision = dust.saved?.revision || 0;
  let extension = dust.direction?.campfire;
  let mode = 'automatic song direction', sourceRevision = revision + 1;
  if (extension) {
    const b = extension.binding;
    const revisions = dust.dirty ? [revision - 1, revision] : [revision - 1];
    if (dust.savedInvalid || b?.songId !== songId || b?.masterSha256?.toLowerCase() !== source.sourceSha256.toLowerCase() ||
        b?.scoreFingerprint !== score.fingerprint || !revisions.includes(b?.baseRevision)) {
      throw new Error('The saved Campfire direction no longer matches this song’s score. Update it or remove it from the direction draft.');
    }
    mode = dust.dirty ? 'unsaved direction draft' : 'saved direction';
    sourceRevision = b.baseRevision + 1;
  } else {
    extension = { schemaVersion: CAMPFIRE_DIRECTION_SCHEMA,
      binding: { songId, masterSha256: source.sourceSha256.toLowerCase(), baseRevision: revision, scoreFingerprint: score.fingerprint },
      defaults: {}, cues: [] };
  }
  const validation = validateCampfireDirection(extension, { durationSeconds: timeline.durationSeconds, cueIds: score.cues.map(cue => cue.id) });
  if (!validation.ok) throw new Error(validation.errors.map(error => error.message).join(' '));
  return { mode, packet: { score, timeline, direction: { ...dust.direction, campfire: extension },
    playSettings: dust.settings, sourceRevision, lyricLines: dust.currentLyricLines || [] } };
}
