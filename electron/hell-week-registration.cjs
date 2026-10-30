const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { atomic } = require('./hell-week-generation.cjs');
const { hash } = require('./hell-week-contract.cjs');

function nativePreview(bytes) {
  const { nativeImage } = require('electron');
  if (!nativeImage) throw Error('The native image decoder is required for external artwork previews.');
  const source = nativeImage.createFromBuffer(bytes);
  if (source.isEmpty()) throw Error('Artwork preview could not be decoded.');
  return source.resize({ height: 512 }).toJPEG(78);
}

// All authoring goes through the Builder API. Local reads only reconcile exact IDs and backups.
function createHellWeekRegistrar({ repositoryRoot, apiBase, fetchImpl = globalThis.fetch, nativeSession = false, adminToken = '', previewRenderer = nativePreview }) {
  const root = path.resolve(repositoryRoot);
  const canonicalRoot = fs.realpath(root);
  let cookie = '';
  async function base() {
    const value = typeof apiBase === 'function' ? apiBase() : apiBase;
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Use the canonical local Builder API.');
    return url.origin;
  }
  async function request(method, route, body, { verify = true } = {}) {
    const origin = await base();
    if (verify) {
      let response, health;
      // Only this read-only health probe may retry automatically. Mutations and
      // paid provider calls retain their existing durable recovery boundaries.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          response = await fetchImpl(`${origin}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
          health = await response.json(); break;
        } catch (error) {
          if (attempt === 1) throw Error(`Builder health check before ${method} ${route} failed twice: ${error.message}`, { cause: error });
        }
      }
      if (!response.ok || health.service !== 'hapa-avatar-builder' || path.resolve(health.store || health.storePath || health.paths?.avatarStore || '') !== path.join(await canonicalRoot, 'data/avatar-store.json')) throw Error('Builder API ownership check failed.');
    }
    let response;
    try { response = await fetchImpl(`${origin}${route}`, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        ...(nativeSession ? { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'X-Hapa-Intent': 'hell-week-native', ...(cookie ? { Cookie: cookie } : {}) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch (error) { throw Error(`Builder ${method} ${route} could not finish: ${error.message}. Saved generation is retained.`, { cause: error }); }
    if (!response.ok) { if ([401, 403, 503].includes(response.status)) cookie = ''; throw Error(`Builder ${route} returned HTTP ${response.status}; saved generation is retained.`); }
    const parseJson = response.json.bind(response);
    response.json = async () => {
      try { return await parseJson(); }
      catch (error) { throw Error(`Builder ${method} ${route} response could not be read: ${error.message}. Saved generation is retained.`, { cause: error }); }
    };
    return response;
  }
  async function preflight() {
    if (nativeSession && !cookie) {
      const response = await request('POST', '/api/local-ui-session');
      cookie = (response.headers.get('set-cookie') || '').split(';')[0];
      if (!cookie) throw Error('Builder did not establish the native session.');
    }
    if (!nativeSession && !adminToken) throw Error('CLI registration requires the existing HAPA_AVATAR_ADMIN_TOKEN. No generation has started.');
    await (await request('GET', '/api/health')).json();
  }
  async function register({ run, card, chunk, imageBytes }) {
    await preflight();
    const backup = path.join(root, 'data/backups/hell-week', run.id);
    const { treeBytes } = require('./hell-week-storage.cjs');
    let needed = 0;
    for (const name of ['item-manager-store.json', 'media-library.json']) {
      if (!await fs.stat(path.join(backup, name)).catch(() => null)) needed += (await fs.stat(path.join(root, 'data', name)).catch(() => ({ size: 2 }))).size;
    }
    if (await treeBytes(path.join(root, 'data/backups/hell-week')) + needed * 2 > 384 * 1024 ** 2) throw Error('Recovery backups reached the shared 384 MiB ceiling.');
    await fs.mkdir(backup, { recursive: true });
    for (const name of ['item-manager-store.json', 'media-library.json']) {
      const target = path.join(backup, name);
      try { await fs.access(target); }
      catch {
        const bytes = await fs.readFile(path.join(root, 'data', name)).catch(e => { if (e.code === 'ENOENT') return Buffer.from('{}'); throw e; });
        await atomic(target, bytes);
      }
    }
    let store = await (await request('GET', '/api/items')).json();
    const existing = store.cards.find(c => c.id === card.id);
    const expectedAvatarLineage = require('./hell-week-avatars.cjs').cardAvatarLineage(run.avatars, card.design.avatar_uses);
    if (existing) {
      if (run.avatars?.length && JSON.stringify(existing.cardRecord?.hellWeek?.avatarLineage) !== JSON.stringify(expectedAvatarLineage)) throw Error('Card ID exists with different Avatar provenance.');
      if (existing.cardRecord?.hellWeek?.sourceHash !== run.sourceHash || existing.cardRecord?.hellWeek?.imageSha256 !== card.image.sha256) throw Error('Card ID exists with different provenance.');
      const attached = existing.mediaAssets?.find(a => a.id === `${card.id}-art` && a.uri && a.metadata?.hellWeek?.imageSha256 === card.image.sha256);
      if (attached && (!card.image.storage || attached.metadata?.preview?.sourceSha256 === card.image.sha256 && attached.thumbnailUri)) return { cardId: card.id, uri: attached.uri, custody: existing.cardRecord?.custody, reconciled: true };
    }
    const library = JSON.parse(await fs.readFile(path.join(root, 'data/media-library.json'), 'utf8').catch(e => { if (e.code === 'ENOENT') return '{"records":[]}'; throw e; }));
    const mediaId = `${card.id}-art`;
    const matches = (library.records || []).filter(r => r.asset?.id === mediaId);
    if (matches.length > 1) throw Error('Duplicate artwork ID requires reconciliation.');
    const found = matches[0];
    const external = card.image.storage;
    if (external && (external.kind !== 'external-object' || hash(imageBytes) !== external.sha256)) throw Error('Invalid external artwork.');
    const media = external ? { id: mediaId, uri: pathToFileURL(external.path).href, storage: external } : found ? { ...found.asset, storage: found.asset.storage || found.storage, uri: found.uri || found.asset.uri }
      : await (await request('POST', '/api/media', { id: mediaId, name: `${mediaId}.png`, mimeType: 'image/png', dataUrl: `data:image/png;base64,${imageBytes.toString('base64')}` })).json();
    const stored = external ? imageBytes : await fs.readFile(media.storage.path);
    if (hash(stored) !== card.image.sha256) throw Error('Saved artwork does not match the generated image.');
    let preview = null;
    if (external) {
      const previewId = `hw-preview-v1-${card.image.sha256}`;
      const previews = (library.records || []).filter(r => r.asset?.id === previewId);
      if (previews.length > 1) throw Error('Duplicate preview ID requires review.');
      const pixels = await previewRenderer(imageBytes);
      if (!pixels.length || pixels.length > 256 * 1024) throw Error('Card preview exceeds its 256 KiB limit.');
      const existingPreview = previews[0];
      if (existingPreview) preview = { ...existingPreview.asset, storage: existingPreview.asset.storage || existingPreview.storage, uri: existingPreview.uri || existingPreview.asset.uri };
      else {
        // One lane-wide worker serializes this namespace; all versions count.
        const mediaRoot = path.join(root, 'data/media');
        const names = (await fs.readdir(mediaRoot).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(n=>n.startsWith('hw-preview-'));
        let used = 0; for (const name of names) used += (await fs.stat(path.join(mediaRoot,name))).size;
        if (used + 2 * 256 * 1024 > 32 * 1024 ** 2) throw Error('Card previews reached their shared 32 MiB ceiling.');
        preview = await (await request('POST', '/api/media', { id: previewId, name: `${previewId}.jpg`, mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${pixels.toString('base64')}` })).json();
      }
      if (hash(await fs.readFile(preview.storage.path)) !== hash(pixels)) throw Error('Saved Card preview digest mismatch.');
      preview.recipe = { sourceSha256: card.image.sha256, sha256: hash(pixels), bytes: pixels.length, height: 512, recipe: 'electron-nativeimage-jpeg78-v1' };
    }
    const avatarLineage = expectedAvatarLineage;
    const lineage = { sourceDigestAlgorithm: run.sourceDigestAlgorithm || 'sha256-utf8-v1', ...(run.schema === 'hapa.builder-hell-week.v2' ? { discovery: { conceptKey: card.design.concept_key, originCallId: card.originCallId, relatedSourceCount: card.relatedSourceCount || 0, occurrenceIndexUri: `hapa-builder-hell-week://${run.id}/occurrences/${card.id}` } } : {}), avatarLineage, schema: run.schema, runId: run.id, chunkId: chunk.id, sourceHash: run.sourceHash,
      spans: chunk.spans.map(({ text, ...span }) => span), imageSha256: card.image.sha256,
      models: run.config, reviewStatus: 'candidate-pending-human-review', sourceOwner: 'operator supplied',
      adaptedFrom: 'hapa-dev-proto:LEO/Thor', imagePrompt: card.imagePrompt,
      facts: card.design.facts, desires: card.design.desires, uncertainties: card.design.uncertainties, evidenceQuotes: card.design.evidence_quotes, validationWarnings: card.design.validationWarnings || [] };
    const record = { id: card.id, title: card.design.title, kind: card.design.kind, cardType: `${card.design.kind}_card`,
      connections: { avatarIds: avatarLineage.used.map(a => a.avatarId) }, status: 'draft', canonStatus: 'generated', summary: card.design.summary, lore: card.design.lore,
      description: card.design.visual_thesis, skills: card.design.skills, utility: card.design.skills.map(s => `${s.name}: ${s.description}`),
      tags: ['hell-week', 'needs-review', run.id, ...card.design.tags], memberOfSets: [run.id],
      mediaPrompts: { heroImage: card.imagePrompt, twoD: card.imagePrompt },
      mediaAssets: [{ id: mediaId, type: 'image', uri: media.uri, thumbnailUri: preview?.uri || '', width: card.image.width, height: card.image.height, mimeType: 'image/png', storage: media.storage, metadata: { hellWeek: lineage, storage: media.storage, ...(preview ? { thumbnailUri: preview.uri, preview: preview.recipe } : {}) } }],
      sourceRefs: [{ label: run.name, uri: `hapa-builder-hell-week://${run.id}/${chunk.id}`, confidence: 'source-linked', notes: `Source digest ${run.sourceHash}; raw source retained privately.` }],
      creatorProfile: { name: 'Hapa.ai / Calder Wong; OpenAI-assisted proposal' },
      cardRecord: { hellWeek: lineage }, createdAt: run.createdAt, updatedAt: run.createdAt };
    if (existing) {
      // Repair only the absent attachment, preserving current owner edits and custody.
      const repairedStore = await (await request('POST', '/api/items/cards', { card: { ...existing, mediaAssets: [...(existing.mediaAssets || []).filter(a => a.id !== mediaId), ...record.mediaAssets] } })).json();
      const repaired = repairedStore.cards.find(c => c.id === card.id);
      if (!repaired?.mediaAssets?.some(a => a.id === mediaId && a.uri === media.uri && (!preview || a.thumbnailUri === preview.uri))) throw Error('Owner dropped the repaired artwork attachment.');
      return { cardId: card.id, uri: media.uri, custody: existing.cardRecord?.custody, reconciled: true, attachmentRepaired: true };
    }
    const custody = await (await request('POST', '/api/cards/custody/ensure', { card: record, actorId: 'hapa-avatar-builder:hell-week', evidenceRef: `hell-week:${run.id}:${chunk.id}` })).json();
    record.cardRecord.custody = custody.receipt;
    store = await (await request('POST', '/api/items/cards', { card: record })).json();
    const saved = store.cards.find(c => c.id === card.id);
    if (JSON.stringify(saved?.cardRecord?.hellWeek?.avatarLineage) !== JSON.stringify(avatarLineage)) throw Error('Owner did not preserve Avatar lineage.');
    if (!saved || saved.cardRecord?.hellWeek?.imageSha256 !== card.image.sha256 || !saved.mediaAssets?.some(a => a.id === mediaId && a.uri === media.uri && (!preview || a.thumbnailUri === preview.uri))) throw Error('Card registration could not be verified.');
    return { cardId: saved.id, uri: media.uri, custody: custody.receipt, reviewStatus: 'candidate-pending-human-review' };
  }
  register.preflight = preflight;
  return register;
}
module.exports = { createHellWeekRegistrar };
