// One coherent stem set per song. A Suno ID can carry several stem generations
// (re-separations, renamed titles, remaster exports) and the same set may be listed
// once per format. Mixing roles across generations misaligns analysis, so callers
// choose exactly one set and then take one record per role from it.

const text = value => String(value ?? "").trim();
const norm = value => text(value).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dirOf = value => text(value).replace(/\/[^/]*$/, "");

/** Role label without a "Song Title (Role)" wrapper. */
export function stemRoleLabel(record = {}) {
  const raw = text(record.stemType || record.kind || record.role || record.title || record.id);
  const wrapped = raw.match(/\(([^()]+)\)\s*$/);
  // Ingest/export file names prefix an ordinal ("0-lead-vocals", "03 - Drums").
  return text(wrapped ? wrapped[1] : raw).replace(/^\d+\s*[-_. ]\s*/, "");
}

/** Excludes archive and master-like records that are not separable stems. */
export function isStemRecord(record = {}, songTitle = "") {
  const kind = norm(record.kind || record.stemType);
  const file = text(record.localPath || record.audioPath || record.uri);
  if (kind === "archive zip" || /\.zip$/i.test(file)) return false;
  const label = stemRoleLabel(record);
  return Boolean(label) && norm(label) !== norm(songTitle);
}

// "Song (Role)" titles name their generation; a bare role title carries no generation name.
const generationName = record => { const match = text(record.title).match(/^(.*\S)\s*\([^()]+\)\s*$/); return match ? norm(match[1]) : ""; };
const familyKey = record => `${generationName(record)}|${dirOf(record.localPath || record.audioPath)}`;

/** Choose one stem family and return one record per role from it. */
export function chooseStemSet(records = [], { songTitle = "", preferDirs = [], roleOf = stemRoleLabel } = {}) {
  const stems = records.filter(record => isStemRecord(record, songTitle));
  const families = new Map();
  for (const record of stems) {
    const key = familyKey(record);
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(record);
  }
  const prefer = preferDirs.map(dirOf).filter(Boolean);
  const score = members => {
    const dirs = members.map(m => dirOf(m.localPath || m.audioPath));
    const nearMaster = dirs.some(d => prefer.some(p => d === p || d.startsWith(p + "/"))) ? 1 : 0;
    const titleMatch = generationName(members[0]) === norm(songTitle) ? 1 : 0;
    const roles = new Set(members.filter(m => text(m.localPath || m.audioPath)).map(m => norm(roleOf(m)))).size;
    const wav = members.filter(m => /\.(wav|wave)$/i.test(text(m.localPath || m.audioPath))).length;
    return [nearMaster, titleMatch, roles, wav];
  };
  const better = (a, b) => { for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
  let best = null, bestScore = null;
  for (const members of families.values()) {
    const s = score(members);
    if (!best || better(s, bestScore)) { best = members; bestScore = s; }
  }
  const byRole = new Map();
  for (const record of best || []) {
    const role = norm(roleOf(record));
    const current = byRole.get(role);
    const hasPath = r => Boolean(text(r?.localPath || r?.audioPath));
    const isWav = r => /\.(wav|wave)$/i.test(text(r?.localPath || r?.audioPath));
    if (!current || (!hasPath(current) && hasPath(record)) || (hasPath(record) && !isWav(current) && isWav(record))) byRole.set(role, record);
  }
  return [...byRole.values()];
}
