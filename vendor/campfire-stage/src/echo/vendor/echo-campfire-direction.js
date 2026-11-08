// Local stage extension. Echo continues to own musical timing and direction.
export const CAMPFIRE_DIRECTION_SCHEMA = 'hapa.echo.campfire-direction.v1';

const fields = {
  plume: { reach: [0, 2, 1], smoke: [0, 2, 1] },
  formation: { participation: [0, 1, 0.8], boundary: [0, 1, 0.3] },
  environment: { groundAsh: [0, 1, 0.25], accents: [0, 1, 0.3] },
  reading: { leadSeconds: [0, 4, 0.4], holdSeconds: [0, 8, 0], releaseSeconds: [0, 5, 0.8], clearance: [0, 1, 0.5] },
  camera: { distanceScale: [0.5, 2, 1], pitchOffset: [-0.5, 0.5, 0] },
  ending: { tailSeconds: [0, 10, 0] },
};
const modes = ['contour', 'shell', 'volume', 'plume'];
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Validate without silently clipping values or discarding unrecognized fields. */
export function validateCampfireDirection(input, { durationSeconds = null, cueIds = null } = {}) {
  const errors = [];
  const error = (path, message) => errors.push({ path, message });
  const known = (value, names, path) => {
    if (!isObject(value)) { error(path, 'Expected an object.'); return false; }
    for (const name of Object.keys(value)) if (!names.includes(name)) error(`${path}.${name}`, 'Unknown field.');
    return true;
  };
  const settings = (value, path) => {
    if (!known(value, [...Object.keys(fields), 'construction', 'motif', 'development'], path)) return;
    for (const [group, members] of Object.entries(fields)) {
      if (value[group] === undefined || !known(value[group], Object.keys(members), `${path}.${group}`)) continue;
      for (const [key, v] of Object.entries(value[group])) {
        const limits = members[key];
        if (limits && (typeof v !== 'number' || !Number.isFinite(v) || v < limits[0] || v > limits[1]))
          error(`${path}.${group}.${key}`, `Expected a number between ${limits[0]} and ${limits[1]}.`);
      }
    }
    if (value.development !== undefined) {
      const curve=value.development;
      if (!Array.isArray(curve) || curve.length<2 || curve.length>16) error(`${path}.development`, 'Expected 2–16 ordered development points.');
      else {
        let previous=-1;
        curve.forEach((point,i)=>{
          const p=`${path}.development[${i}]`;
          if (!known(point,['at','reach','smoke','participation'],p)) return;
          if (typeof point.at!=='number' || !Number.isFinite(point.at) || point.at<0 || point.at>1 || point.at<=previous) error(`${p}.at`,'Expected strictly increasing cue progress from 0 to 1.');
          previous=point.at;
          for (const key of ['reach','smoke','participation']) if(point[key]!==undefined && (typeof point[key]!=='number'||!Number.isFinite(point[key])||point[key]<0||point[key]>2)) error(`${p}.${key}`,'Expected a multiplier between 0 and 2.');
        });
        if(curve[0]?.at!==0||curve.at(-1)?.at!==1)error(`${path}.development`,'Development must cover the entire cue from 0 to 1.');
        for(const point of [curve[0],curve.at(-1)])for(const key of ['reach','smoke','participation'])if(point?.[key]!==undefined&&point[key]!==1)error(`${path}.development`,'Development endpoints must return to multiplier 1.');
      }
    }
    if (value.motif !== undefined && !['inherit', 'open-ring'].includes(value.motif)) error(`${path}.motif`, 'Choose inherit or open-ring.');
    if (value.construction !== undefined && !modes.includes(value.construction)) error(`${path}.construction`, `Choose ${modes.join(', ')}.`);
  };
  if (!known(input, ['schemaVersion', 'binding', 'defaults', 'cues', 'ending'], 'campfire')) return { ok:false, errors };
  if (input.schemaVersion !== CAMPFIRE_DIRECTION_SCHEMA) error('campfire.schemaVersion', 'Unsupported Campfire schema version.');
  if (known(input.binding, ['songId', 'masterSha256', 'baseRevision', 'scoreFingerprint'], 'campfire.binding')) {
    const b = input.binding;
    if (typeof b.songId !== 'string' || !b.songId.trim()) error('campfire.binding.songId', 'Song identity is required.');
    if (typeof b.masterSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(b.masterSha256)) error('campfire.binding.masterSha256', 'Expected the exact master SHA-256.');
    if (!Number.isSafeInteger(b.baseRevision) || b.baseRevision < 0) error('campfire.binding.baseRevision', 'Expected a nonnegative saved revision.');
    if (typeof b.scoreFingerprint !== 'string' || !b.scoreFingerprint.trim()) error('campfire.binding.scoreFingerprint', 'Score fingerprint is required.');
  }
  if (input.ending !== undefined && known(input.ending, ['releaseStart', 'fadeStart', 'fadeEnd'], 'campfire.ending')) {
    const { releaseStart, fadeStart, fadeEnd } = input.ending;
    if (![releaseStart, fadeStart, fadeEnd].every(Number.isFinite) || releaseStart < 0 || !(releaseStart < fadeStart && fadeStart < fadeEnd) || (durationSeconds !== null && fadeEnd > durationSeconds))
      error('campfire.ending', 'Expected ordered release and fade times within the song.');
  }
  if (input.defaults !== undefined) settings(input.defaults, 'campfire.defaults');
  if (input.cues !== undefined) {
    if (!Array.isArray(input.cues) || input.cues.length > 256) error('campfire.cues', 'Expected at most 256 cue overrides.');
    else {
      const seen = new Set();
      input.cues.forEach((cue, index) => {
        const p = `campfire.cues[${index}]`;
        if (!known(cue, ['cueId', 'settings'], p)) return;
        if (typeof cue.cueId !== 'string' || !cue.cueId.trim()) error(`${p}.cueId`, 'Existing Echo cue ID is required.');
        else {
          if (seen.has(cue.cueId)) error(`${p}.cueId`, 'Duplicate cue override.');
          if (cueIds && !cueIds.includes(cue.cueId)) error(`${p}.cueId`, 'Cue is not in the bound score.');
          seen.add(cue.cueId);
        }
        settings(cue.settings, `${p}.settings`);
      });
    }
  }
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) error('durationSeconds', 'Expected a positive song duration.');
  return { ok: errors.length === 0, errors };
}

/** Resolve missing stage values without mutating or rewriting owner direction. */
export function resolveCampfireSettings(extension, cueId, options = {}) {
  const result = validateCampfireDirection(extension, options);
  if (!result.ok) throw Object.assign(new Error('Invalid Campfire direction.'), { validation: result });
  const defaults = Object.fromEntries(Object.entries(fields).map(([group, members]) =>
    [group, Object.fromEntries(Object.entries(members).map(([key, limits]) => [key, limits[2]]))]));
  defaults.construction = 'shell';
  defaults.motif = 'inherit';
  const cue = extension.cues?.find(item => item.cueId === cueId)?.settings || {};
  for (const layer of [extension.defaults || {}, cue]) {
    for (const group of Object.keys(fields)) if (layer[group]) Object.assign(defaults[group], layer[group]);
    if (layer.construction !== undefined) defaults.construction = layer.construction;
    if (layer.motif !== undefined) defaults.motif = layer.motif;
    if (layer.development !== undefined) defaults.development = layer.development;
  }
  return defaults;
}
