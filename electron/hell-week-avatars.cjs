const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { hash } = require('./hell-week-contract.cjs');
const MAX_AVATARS = 8, MAX_IMAGE_BYTES = 8 * 1024 ** 2, MAX_REFERENCE_BYTES = 32 * 1024 ** 2;
const clip = (value, length) => typeof value === 'string' ? value.slice(0, length) : '';
const ROLES = ['fullbody_backgroundless', 'character_dossier', 'backgroundless_two_thirds', 'closeup_emotions', 'fullbody_concept_art'];

function validateSelections(selections = []) {
  if (!Array.isArray(selections) || selections.length > MAX_AVATARS) throw Error('Choose up to eight Avatar foundations.');
  if (selections.some(s => !s || typeof s.avatarId !== 'string' || !s.avatarId || s.avatarId.length > 200 || (s.assetId !== undefined && s.assetId !== null && typeof s.assetId !== 'string'))) throw Error('Invalid Avatar selection. Choose an Avatar from the Builder.');
  if (new Set(selections.map(s => s.avatarId)).size !== selections.length) throw Error('Each Avatar can be selected only once.');
  return selections;
}

function avatarContext(avatars = []) {
  return avatars.map(a => ({ avatar_id: a.avatarId, name: a.name, aliases: a.aliases, context: a.context, has_visual_reference: !!a.image }));
}

function bindAvatarUses(plan, design) {
  const foundations = plan.avatars || [];
  if (!foundations.length) return { ...design, avatar_uses: [] };
  if (!Array.isArray(design.avatar_uses) || design.avatar_uses.length > foundations.length) throw Error('Thor must explicitly choose Avatar references or an empty list. Saved output retained.');
  const seen = new Set();
  for (const use of design.avatar_uses) {
    if (!foundations.some(a => a.avatarId === use.avatar_id) || seen.has(use.avatar_id) || typeof use.role !== 'string' || !use.role.trim() || typeof use.reason !== 'string' || !use.reason.trim() || use.role.length > 1000 || use.reason.length > 2000) throw Error('Thor selected an unknown, duplicate or invalid Avatar reference. Saved output retained.');
    seen.add(use.avatar_id);
  }
  return design;
}

function cardAvatarLineage(avatars = [], uses = []) {
  return {
    schema: 'hapa.hell-week-avatar-lineage.v1',
    foundations: avatars.map(a => ({ avatarId: a.avatarId, name: a.name, snapshotHash: a.snapshotHash, sourceUri: a.sourceUri, sourceUpdatedAt: a.sourceUpdatedAt })),
    used: uses.map(use => {
      const a = avatars.find(a => a.avatarId === use.avatar_id);
      if (!a) throw Error('Unknown Avatar in Card lineage.');
      const { path: localPath, ...image } = a.image || {};
      return { avatarId: a.avatarId, name: a.name, snapshotHash: a.snapshotHash, role: use.role, reason: use.reason,
        mode: a.image ? 'profile-and-image' : 'profile-only', image: a.image ? image : null };
    })
  };
}

// Reads existing owner records and media. Never writes/copies reference pixels.
function createHellWeekAvatarReferences({ repositoryRoot, apiBase, fetchImpl = globalThis.fetch }) {
  const canonicalRoot = fs.realpath(repositoryRoot);
  async function request(route) {
    const url = new URL(typeof apiBase === 'function' ? apiBase() : apiBase);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Avatar references require the canonical local Builder API.');
    async function readJson(route, cap) {
      const response = await fetchImpl(`${url.origin}${route}`, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error(`Avatar reference lookup returned HTTP ${response.status}.`);
      const parts = []; let size = 0;
      for await (const part of response.body) { size += part.length; if (size > cap) throw Error('Avatar reference response exceeds its bounded limit.'); parts.push(Buffer.from(part)); }
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    }
    const health = await readJson('/api/health', 256 * 1024);
    if (health.service !== 'hapa-avatar-builder' || path.resolve(health.store || health.storePath || health.paths?.avatarStore || '') !== path.join(await canonicalRoot, 'data/avatar-store.json')) throw Error('Avatar reference owner check failed.');
    return readJson(route, 8 * 1024 ** 2);
  }
  async function catalog() {
    const avatars = [];
    for (let offset = 0; offset < 1000; offset += 250) {
      const page = await request(`/api/avatars?mode=index&limit=250&offset=${offset}`);
      for (const a of page.avatars || []) avatars.push({ avatarId: a.id, name: a.primaryName || a.id, aliases: (a.aliases || []).slice(0, 8), summary: clip(a.summary, 260), updatedAt: a.updatedAt || null });
      if (!page.hasMore) return { avatars, maxAvatars: MAX_AVATARS };
    }
    throw Error('Avatar roster exceeds the 1,000-entry limit. No partial selection list was returned.');
  }
  async function localPath(uri) {
    if (typeof uri !== 'string') return null;
    if (uri.startsWith('/media/')) {
      const base = path.join(await canonicalRoot, 'data/media');
      const candidate = path.resolve(base, decodeURIComponent(uri.slice(7)));
      return candidate.startsWith(base + path.sep) ? candidate : null;
    }
    if (uri.startsWith('/api/local-file?')) {
      const value = new URL(uri, 'http://localhost').searchParams.get('path');
      return value && path.isAbsolute(value) ? value : null;
    }
    if (uri.startsWith('file:')) { try { return fileURLToPath(uri); } catch { return null; } }
    if (/^\/(Users|Volumes|private|var|tmp)\//.test(uri)) return uri;
    return null;
  }
  async function details(avatarId, entry = null) {
    const avatar = entry || (await catalog()).avatars.find(a => a.avatarId === avatarId);
    if (!avatar || avatar.avatarId !== avatarId) throw Error('Selected Avatar is no longer in the Builder roster.');
    const pack = await request(`/api/avatars/${encodeURIComponent(avatarId)}/attach?target=hell-week`);
    if (pack.avatarCardId !== avatarId) throw Error('Avatar attach-pack identity mismatch.');
    const images = [], seen = new Set();
    const candidates = [...(pack.baseReferences || [])].sort((a,b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || Number(!!b.defaultForSection) - Number(!!a.defaultForSection));
    for (const ref of candidates) {
      if (ref.type !== 'image' || seen.has(ref.assetId) || !ROLES.includes(ref.role) || !await localPath(ref.uri)) continue;
      seen.add(ref.assetId);
      images.push({ assetId: ref.assetId, role: ref.role, label: ref.name || ref.label || ref.assetId, uri: ref.uri, thumbnailUri: ref.thumbnail?.uri || '', slotId: ref.slotId || null });
    }
    const persona = pack.mind?.personaAnchor || {};
    const context = { summary: avatar.summary, persona: Object.fromEntries(['identityStatement','wants','fears','misunderstandings'].map(k => [k, clip(persona[k], 1000)])) };
    return { ...avatar, context, images, defaultAssetId: images[0]?.assetId || null,
      sourceUri: `hapa-avatar-builder://avatar/${encodeURIComponent(avatarId)}`, sourceUpdatedAt: avatar.updatedAt,
      sourcePacketHash: hash(JSON.stringify(pack)), contextPolicy: 'Bounded profile snapshot; Avatar lore is reference context, not document evidence or an authority grant.' };
  }
  let pendingRead = null;
  async function boundedRead(file) {
    const handle = await fs.open(file, 'r');
    let bytes;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw Error('Avatar image exceeds the 8 MiB reference limit.');
      const buffer = Buffer.alloc(stat.size + 1); let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw Error('Avatar image changed while reading. Select it again.');
      bytes = buffer.subarray(0, offset);
    } finally { await handle.close(); }
    if (bytes.length > MAX_IMAGE_BYTES) throw Error('Avatar image exceeds the 8 MiB reference limit.');
    return bytes;
  }
  async function readGuard(read) {
    if (pendingRead) throw Error('An Avatar file read is still pending. Wait for storage recovery before retrying.');
    const operation = read(); pendingRead = operation;
    operation.then(() => { pendingRead = null; }, () => { pendingRead = null; });
    let timer;
    try { return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Avatar file read timed out. No generation was sent; the read remains held until storage responds.')), 15000);
    })]); } finally { clearTimeout(timer); }
  }
  async function inspect(image) { return readGuard(() => inspectFile(image)); }
  async function inspectFile(image) {
    const file = await localPath(image.uri);
    if (!file) throw Error('Use an existing local Avatar image or choose text context only.');
    const real = await fs.realpath(file), stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES || stat.size < 12) throw Error('Avatar reference must be a PNG, JPEG or WebP file up to 8 MiB.');
    const bytes = await boundedRead(real);
    const mimeType = bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a' ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mimeType) throw Error('Unsupported Avatar reference image; use PNG, JPEG or WebP.');
    return { ...image, path: real, bytes: bytes.length, sha256: hash(bytes), mimeType };
  }
  async function snapshot(selections) {
    validateSelections(selections);
    if (!selections.length) return [];
    const { avatars } = await catalog(); const result = []; let total = 0;
    for (const choice of selections) {
      const a = await details(choice.avatarId, avatars.find(a => a.avatarId === choice.avatarId));
      const assetId = choice.assetId === undefined ? a.defaultAssetId : choice.assetId;
      const ref = assetId ? a.images.find(i => i.assetId === assetId) : null;
      if (assetId && !ref) throw Error(`The chosen reference for ${a.name} is no longer available. Select it again.`);
      const image = ref ? await inspect(ref) : null;
      total += image?.bytes || 0;
      if (total > MAX_REFERENCE_BYTES) throw Error('Selected Avatar images exceed the shared 32 MiB limit. Choose smaller references.');
      const value = { avatarId: a.avatarId, name: a.name, aliases: a.aliases, context: a.context, image,
        sourceUri: a.sourceUri, sourceUpdatedAt: a.sourceUpdatedAt, sourcePacketHash: a.sourcePacketHash, contextPolicy: a.contextPolicy,
        attribution: { owner: 'hapa-avatar-builder', relationship: 'foundational-reference', rights: 'No new usage rights or ownership are inferred from selection.' } };
      result.push({ ...value, snapshotHash: hash(JSON.stringify(value)) });
    }
    if (Buffer.byteLength(JSON.stringify(result)) > 64 * 1024) throw Error('Avatar snapshots exceed the 64 KiB run limit.');
    return result;
  }
  async function readImages(references) { return readGuard(() => readImageFiles(references)); }
  async function readImageFiles(references) {
    if (references.length > MAX_AVATARS || references.reduce((n,r)=>n+r.bytes,0) > MAX_REFERENCE_BYTES) throw Error('Avatar image request exceeds its shared limit.');
    const images = [];
    for (const ref of references) {
      const file = await localPath(ref.uri);
      if (!file || await fs.realpath(file) !== ref.path) throw Error('Avatar image location changed. Prepare a new run with the reviewed reference.');
      const stat = await fs.stat(ref.path);
      if (stat.size !== ref.bytes || stat.size > MAX_IMAGE_BYTES) throw Error('Avatar image changed. Prepare a new run with the reviewed reference.');
      const bytes = await boundedRead(ref.path);
      if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256) throw Error('Avatar image digest changed. No image request was sent.');
      images.push({ bytes, mimeType: ref.mimeType, fileName: `${ref.sha256}.${ref.mimeType === 'image/jpeg' ? 'jpg' : ref.mimeType.split('/')[1]}` });
    }
    return images;
  }
  return { catalog, details: ({ avatarId }) => details(avatarId), snapshot, readImages };
}
module.exports = { createHellWeekAvatarReferences, validateSelections, avatarContext, bindAvatarUses, cardAvatarLineage, MAX_AVATARS, MAX_IMAGE_BYTES, MAX_REFERENCE_BYTES };
