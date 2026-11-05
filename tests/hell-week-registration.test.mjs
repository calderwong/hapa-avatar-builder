import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createItemCard } from '../src/domain/item.js';
const require = createRequire(import.meta.url);
const { createHellWeekRegistrar } = require('../electron/hell-week-registration.cjs');
const { hash } = require('../electron/hell-week-contract.cjs');

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hell-week-registration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'data'));
  const imageBytes = Buffer.from('fixture image bytes');
  const file = path.join(root, 'data', 'fixture.png'); await fs.writeFile(file, imageBytes);
  const cards = []; const requests = [];
  const response = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
  const fetchImpl = async (url, request = {}) => {
    const route = new URL(url).pathname; const method = request.method || 'GET';
    requests.push({ route, method, request });
    if (route === '/api/health' && (options.healthAlwaysFails || options.healthFailsOnce && requests.filter(r=>r.route==='/api/health').length===1)) throw Error('fixture timeout');
    if (route === '/api/health') return response({ service: 'hapa-avatar-builder', store: options.wrongOwner ? '/different/data/avatar-store.json' : path.join(await fs.realpath(root), 'data/avatar-store.json') });
    if (route === '/api/local-ui-session') return response({}, 200, { 'set-cookie': 'fixture-session=opaque; HttpOnly; SameSite=Strict' });
    if (route === '/api/items') return response({ cards });
    if (route === '/api/media') { const body=JSON.parse(request.body); const mediaFile=body.mimeType==='image/jpeg'?path.join(root,'data',body.id+'.jpg'):file; await fs.writeFile(mediaFile,Buffer.from(body.dataUrl.split(',')[1],'base64')); const asset={id:body.id,uri:body.mimeType==='image/jpeg'?`/media/${body.id}.jpg`:'/media/fixture.png',storage:{path:mediaFile}}; const libraryFile=path.join(root,'data/media-library.json');const library=JSON.parse(await fs.readFile(libraryFile,'utf8').catch(()=>'{"records":[]}'));library.records.push({asset,uri:asset.uri,storage:asset.storage});await fs.writeFile(libraryFile,JSON.stringify(library));return response(asset); }
    if (route === '/api/cards/custody/ensure') return options.custodyFailure ? response({}, 503) : response({ receipt: { originCoreKey: 'fixture-core', originRevision: 1, recordDigest: 'fixture-digest' } });
    if (route === '/api/items/cards') { const card = createItemCard(JSON.parse(request.body).card); const index = cards.findIndex(c => c.id === card.id); if (index < 0) cards.push(card); else cards[index] = card; return response({ cards }); }
    throw Error(`Unexpected route ${route}`);
  };
  const register = createHellWeekRegistrar({ repositoryRoot: root, apiBase: 'http://127.0.0.1:8797', nativeSession: true, fetchImpl, previewRenderer: async () => Buffer.from('fixture preview bytes') });
  const input = { run: { id: 'hw-fixture', name: 'seed.txt', sourceHash: 'source-digest', schema: 'fixture', config: {}, createdAt: '2026-10-29T00:00:00Z' },
    chunk: { id: 'chunk-1', spans: [{ start: 0, end: 20, text: 'private raw source' }] }, imageBytes,
    card: { id: 'fixture-card', image: { sha256: hash(imageBytes), width: 1024, height: 1536 }, imagePrompt: 'a garden',
      design: { title: 'Keeper', kind: 'skill', summary: 'Seed memory', lore: 'A garden keeps memories.', visual_thesis: 'a garden', facts: [], desires: [], uncertainties: [], evidence_quotes: ['source quote'], skills: [], tags: [] } } };
  return { root, register, requests, cards, input };
}

test('registration verifies owner, uses native session and custody before Items, reconciles exact ID', async t => {
  const { root, register, requests, cards, input } = await fixture(t);
  await register.preflight(); const first = await register(input); const second = await register(input);
  assert.equal(first.cardId, 'fixture-card'); assert.equal(second.reconciled, true); assert.equal(cards.length, 1);
  const mutations = requests.filter(r => r.method === 'POST');
  assert.deepEqual(mutations.map(r => r.route), ['/api/local-ui-session', '/api/media', '/api/cards/custody/ensure', '/api/items/cards']);
  assert.equal(mutations[1].request.headers.Cookie, 'fixture-session=opaque');
  assert.equal(mutations[0].request.body, undefined);
  assert.equal(cards[0].cardRecord.hellWeek.spans[0].text, undefined);
  assert.equal(cards[0].cardRecord.hellWeek.reviewStatus, 'candidate-pending-human-review');
  assert.equal(cards[0].cardRecord.custody.originRevision, 1);
  await fs.access(path.join(root, 'data/backups/hell-week/hw-fixture/item-manager-store.json'));
  input.card.image.sha256 = 'different'; await assert.rejects(register(input), /different provenance/);
});

test('different owner fails before session or authoring mutation', async t => {
  const { register, requests } = await fixture(t, { wrongOwner: true });
  await assert.rejects(register.preflight(), /ownership check failed/);
  assert.equal(requests.filter(r => r.method === 'POST').length, 0);
});

test('custody failure cannot present a saved Item Card', async t => {
  const { register, requests, input } = await fixture(t, { custodyFailure: true });
  await assert.rejects(register(input), /HTTP 503/);
  assert.equal(requests.some(r => r.route === '/api/items/cards'), false);
});


test('external artwork registers by reference; only a bounded JPEG preview is uploaded', async t => {
  const { register, requests, cards, input } = await fixture(t);
  input.card.image.storage = { kind: 'external-object', storeId: 'fixture', path: '/external/objects/art.png', sha256: input.card.image.sha256, bytes: input.imageBytes.length };
  const saved = await register(input);
  assert.equal(requests.filter(r => r.route === '/api/media').length, 1); assert.equal(JSON.parse(requests.find(r => r.route === '/api/media').request.body).mimeType, 'image/jpeg');
  assert.equal(saved.uri, 'file:///external/objects/art.png');
  assert.equal(cards[0].mediaAssets[0].metadata.storage.kind, 'external-object');
});


test('missing owner attachment is repaired without another upload or replacing Card edits', async t => {
  const {register,requests,cards,input}=await fixture(t);
  input.card.image.storage={kind:'external-object',storeId:'fixture',path:'/external/art.png',sha256:input.card.image.sha256,bytes:input.imageBytes.length};
  await register(input);cards[0].mediaAssets=[];cards[0].title='Operator edited title';
  const result=await register(input);assert.equal(result.attachmentRepaired,true);assert.equal(cards[0].title,'Operator edited title');assert.equal(cards[0].mediaAssets.length,1);assert.equal(requests.filter(r=>r.route==='/api/cards/custody/ensure').length,1);assert.equal(requests.filter(r=>r.route==='/api/media').length,1);
});

test('one transient health read failure recovers before any mutation',async t=>{
 const {register,requests}=await fixture(t,{healthFailsOnce:true});await register.preflight();
 assert.deepEqual(requests.slice(0,3).map(r=>r.route),['/api/health','/api/health','/api/local-ui-session']);
});
test('persistent health failure is bounded to two reads and zero mutations',async t=>{
 const {register,requests}=await fixture(t,{healthAlwaysFails:true});await assert.rejects(register.preflight(),/failed twice/);
 assert.equal(requests.length,2);assert.equal(requests.some(r=>r.method==='POST'),false);
});

test('Avatar origins and used relationships survive owner normalization and precede custody', async t => {
 const {register,requests,cards,input}=await fixture(t);
 input.run.avatars=[{avatarId:'red',name:'Red',snapshotHash:'red-snapshot',sourceUri:'hapa-avatar-builder://avatar/red',image:{assetId:'portrait',path:'/private/input.png',uri:'/media/input.png',sha256:'pixel-digest',bytes:30,mimeType:'image/png'}},{avatarId:'blue',name:'Blue',snapshotHash:'blue-snapshot',sourceUri:'hapa-avatar-builder://avatar/blue',image:null}];
 input.card.design.avatar_uses=[{avatar_id:'red',role:'seedkeeper',reason:'Protects the source'}];
 await register(input);
 const lineage=cards[0].cardRecord.hellWeek.avatarLineage;
 assert.equal(lineage.foundations.length,2);assert.equal(lineage.used.length,1);assert.equal(lineage.used[0].image.sha256,'pixel-digest');assert.equal(lineage.used[0].image.path,undefined);
 assert.deepEqual(cards[0].connections.avatarIds,['red']);assert.deepEqual(cards[0].mediaAssets[0].metadata.hellWeek.avatarLineage,lineage);
 const birth=JSON.parse(requests.find(r=>r.route==='/api/cards/custody/ensure').request.body).card;assert.deepEqual(birth.cardRecord.hellWeek.avatarLineage,lineage);
 cards[0].cardRecord.hellWeek.avatarLineage.used=[];await assert.rejects(()=>register(input),/different Avatar provenance/);
});


test('reviewed Dreamer six-field source survives native normalization and custody preparation',async t=>{
 const f=await fixture(t);f.input.card.reviewedDesign={adapter:'hapa.builder.reviewed-designs.v1',source:{id:'record:fixture',revision:1,digest:'a'.repeat(64)},recordJson:'exact reviewed source',promptSha256:hash(f.input.card.imagePrompt)};f.input.card.design.flavor_text='An attributed flavor';f.input.card.design.parameters=[{name:'facets',type:'integer',value:6}];
 await f.register(f.input);const saved=f.cards[0].cardRecord.hellWeek;assert.deepEqual(saved.reviewedDesign,f.input.card.reviewedDesign);assert.equal(saved.flavorText,'An attributed flavor');assert.equal(saved.parameters[0].value,6);
});
