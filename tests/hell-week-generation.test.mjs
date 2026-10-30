import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { prepare, validateLeo, validateThor } = require('../electron/hell-week-contract.cjs');
const { createHellWeekGeneration } = require('../electron/hell-week-generation.cjs');
const text = 'A seed archive keeps every original seed. Gardeners record what changed after each season. A new bed is an experiment, not a replacement for the old garden.';
const design = { title: 'The Seedkeeper', kind: 'skill', summary: 'Preserve originals and record experiments.', facts: ['Seeds are retained.'], desires: [], uncertainties: [], lore: 'A keeper maps the branching garden.', skills: [{ name: 'Trace the season', description: 'Compare one season with the next.', type: 'Active' }], evidence_quotes: ['A seed archive keeps every original seed.'], visual_thesis: 'One gardener holds an intact seed archive beside a branching garden.', image_prompt: 'A gardener preserves a gold seed beneath a glass bell while a new garden unfurls through moonlit ruins.', tags: ['memory'] };
function fixtureFetch(calls, hook = async () => {}) {
  return async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body }); await hook(body, calls.length);
    if (url.endsWith('/images/generations')) {
      const png = Buffer.alloc(30); Buffer.from('89504e470d0a1a0a', 'hex').copy(png); png.writeUInt32BE(1024, 16); png.writeUInt32BE(1536, 20);
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }], usage: { total_tokens: 100 } }), { status: 200 });
    }
    const source = JSON.parse(body.input);
    const value = source.chunks ? { set_name: 'The Seed Archive', summary: 'Preserve before experimenting.', audience: ['gardeners'], objectives: ['record change'], yarn: 'Lineage through seasons', preparation: source.chunks.map(c => ({ chunk_id: c.chunk_id, focus: 'Preserve seeds', why_it_matters: 'Recover earlier work', continuity: 'Keep source roles distinct' })) } : design;
    return new Response(JSON.stringify({ id: `response-${calls.length}`, status: 'completed', usage: { input_tokens: 50, output_tokens: 50 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }), { status: 200 });
  };
}
async function setup(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hapa-hell-week-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = []; const registrations = [];
  const options = { legacyOnly: true, userDataPath: root, credentialStore: { read: async () => 'fixture-key-not-a-secret' },
    fetchImpl: fixtureFetch(calls), registerCard: async x => { registrations.push(x.card.id); return { cardId: x.card.id, uri: '/fixture.png' }; }, ...extra };
  return { root, calls, registrations, options, engine: createHellWeekGeneration(options) };
}
test('all accepted text is covered exactly, including long paragraphs and Unicode', () => {
  const value = ('🙂 original words\n\n').repeat(1800);
  const plan = prepare({ text: value, maxCards: 20 });
  const spans = plan.chunks.flatMap(c => c.spans);
  assert.equal(spans.map(s => s.text).join(''), value);
  assert.equal(plan.sourceText, value);
  assert.ok(plan.chunks.every(c => c.text.length <= 6000));
  assert.equal(spans[0].start, 0); assert.equal(spans.at(-1).end, value.length);
  assert.ok(spans.every(s => s.text.length <= 6000));
  assert.throws(() => prepare({ text: value, maxCards: 1 }), /Nothing was sent or truncated/);
});
test('conversation branches retain message and parent identity; cycles and attachments refuse', () => {
  const mapping = { a: { parent: null, message: { author: { role: 'user' }, content: { parts: ['Question'] } } },
    b: { parent: 'a', message: { author: { role: 'assistant' }, content: { parts: ['First answer'] } } },
    c: { parent: 'a', message: { author: { role: 'assistant' }, content: { parts: ['Alternate answer'] } } } };
  const plan = prepare({ name: 'chat.json', text: JSON.stringify({ mapping }) });
  assert.deepEqual(plan.units.map(u => [u.id, u.parent]), [['0:a', null], ['0:b', '0:a'], ['0:c', '0:a']]);
  mapping.a.parent = 'b'; assert.throws(() => prepare({ name: 'chat.json', text: JSON.stringify({ mapping }) }), /cycle/);
  assert.throws(() => prepare({ name: 'chat.json', text: JSON.stringify([{ role: 'user', content: [{ type: 'image' }] }]) }), /text/);
});
test('LEO coverage and Thor literal evidence are validated', () => {
  assert.throws(() => validateLeo({ set_name: 'x', summary: 'x', preparation: [] }, ['chunk-1']), /every source/);
  const chunk = prepare({ text }).chunks[0];
  assert.equal(validateThor(design, chunk).title, 'The Seedkeeper');
  assert.throws(() => validateThor({ ...design, evidence_quotes: ['An invented quote'] }, chunk), /do not match/);
});
test('complete run uses one LEO, one Thor and one image; restart reuses all results', async t => {
  const { engine, options, calls, registrations } = await setup(t);
  const run = await engine.create({ text, name: 'seed.txt' });
  assert.equal(calls.length, 0); assert.equal(run.plannedCalls, 3);
  await engine.start({ id: run.id }); await engine._active();
  assert.equal((await engine.status({ id: run.id })).state, 'complete');
  assert.equal(calls.length, 3); assert.equal(registrations.length, 1);
  assert.equal(calls[0].body.store, false); assert.equal(calls[0].body.text.format.strict, true);
  const resumed = createHellWeekGeneration(options); await resumed.start({ id: run.id });
  assert.equal(calls.length, 3); assert.equal((await resumed.asset({ id: run.id, cardId: registrations[0] })).dataUrl.startsWith('data:image/png'), true);
});
test('pause during a response survives its commit, and two resumes preserve progress', async t => {
  const { engine, calls, options } = await setup(t);
  let runner = engine; let id;
  options.fetchImpl = fixtureFetch(calls, async () => runner.pause({ id }));
  runner = createHellWeekGeneration(options);
  const run = await runner.create({ text }); id = run.id;
  await runner.start({ id }); await runner._active(); assert.equal(calls.length, 1);
  assert.equal((await runner.status({ id })).state, 'paused');
  runner = createHellWeekGeneration(options); await runner.start({ id }); await runner._active(); assert.equal(calls.length, 2);
  assert.equal((await runner.status({ id })).state, 'paused');
  options.fetchImpl = fixtureFetch(calls); runner = createHellWeekGeneration(options);
  await runner.start({ id }); await runner._active(); assert.equal(calls.length, 3);
  assert.equal((await runner.status({ id })).state, 'complete');
});
test('unknown remote outcome never replays, even after restarting', async t => {
  let count = 0;
  const { engine, options } = await setup(t, { fetchImpl: async () => { count++; throw Error('transport lost'); } });
  const run = await engine.create({ text }); await engine.start({ id: run.id }); await engine._active();
  const restarted = createHellWeekGeneration(options); await restarted.start({ id: run.id }); await restarted._active();
  assert.equal(count, 1); assert.equal((await restarted.status({ id: run.id })).calls['leo-0'].state, 'unknown');
});
test('insufficient lease defers before spend; registration failure reuses paid work', async t => {
  const { engine, options, calls } = await setup(t, { leaseMs: 100 });
  const run = await engine.create({ text }); await engine.start({ id: run.id }); await engine._active();
  assert.equal(calls.length, 0); assert.equal((await engine.status({ id: run.id })).state, 'yielded');
  const broken = createHellWeekGeneration({ ...options, leaseMs: 1800000, registerCard: async () => { throw Error('owner unavailable'); } });
  await broken.start({ id: run.id }); await broken._active(); assert.equal(calls.length, 3);
  const repaired = createHellWeekGeneration({ ...options, leaseMs: 1800000 });
  await repaired.start({ id: run.id }); await repaired._active(); assert.equal(calls.length, 3);
  assert.equal((await repaired.status({ id: run.id })).state, 'complete');
});
test('response receipt repairs cursor gap without another API call; tampered source quarantines', async t => {
  const { engine, options, calls, root } = await setup(t);
  const run = await engine.create({ text }); await engine.start({ id: run.id }); await engine._active();
  const folder = path.join(root, 'Hell Week Runs', run.id);
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'run.json')));
  manifest.leo = []; manifest.state = 'interrupted'; manifest.calls['leo-0'].state = 'submitted';
  await fs.writeFile(path.join(folder, 'run.json'), JSON.stringify(manifest));
  const recovered = createHellWeekGeneration(options); await recovered.start({ id: run.id }); await recovered._active(); assert.equal(calls.length, 3);
  await fs.writeFile(path.join(folder, 'source.json'), '{}');
  await assert.rejects(() => recovered.start({ id: run.id }), /digest changed/);
});

test('quote wrappers normalize; ellipsized claims remain flagged and never count as exact evidence', () => {
  const output = validateThor({ ...design, evidence_quotes: ['"A seed archive keeps every original seed."', 'Gardeners... season.'] }, prepare({ text }).chunks[0]);
  assert.deepEqual(output.evidence_quotes, ['A seed archive keeps every original seed.']);
  assert.deepEqual(output.unverifiedEvidenceQuotes, ['Gardeners... season.']);
  assert.equal(output.validationWarnings.length, 1);
});


test('another runner sees the live owner, cannot retry its cursor, and can pause it', async t => {
  const { options, calls, root } = await setup(t);
  let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  options.fetchImpl = fixtureFetch(calls, async () => { entered(); await wait; });
  const first = createHellWeekGeneration(options);
  const second = createHellWeekGeneration(options);
  const run = await first.create({ text });
  await first.start({ id: run.id }); await enteredPromise;
  assert.equal((await second.status({ id: run.id })).workerActive, true);
  const before = await fs.readFile(path.join(root, 'Hell Week Runs', run.id, 'run.json'), 'utf8');
  await assert.rejects(second.start({ id: run.id, retryRejected: true }), /Another Hell Week worker/);
  assert.equal(await fs.readFile(path.join(root, 'Hell Week Runs', run.id, 'run.json'), 'utf8'), before);
  await second.pause({ id: run.id }); release(); await first._active();
  assert.equal((await second.status({ id: run.id })).state, 'paused');
  assert.equal(calls.length, 1);
});

test('rejected requests require explicit retry and stop after two total attempts', async t => {
  let count = 0;
  const { engine } = await setup(t, { fetchImpl: async () => { count++; return new Response('{}', { status: 429 }); } });
  const run = await engine.create({ text });
  for (const retryRejected of [false, false, true, true]) { await engine.start({ id: run.id, retryRejected }); await engine._active(); }
  assert.equal(count, 2);
  assert.equal((await engine.status({ id: run.id })).state, 'blocked');
});

test('owner admission fails before any paid request', async t => {
  const registrar = async () => ({});
  registrar.preflight = async () => { throw Error('owner unavailable'); };
  const { engine, calls } = await setup(t, { registerCard: registrar });
  const run = await engine.create({ text }); await engine.start({ id: run.id }); await engine._active();
  assert.equal(calls.length, 0);
  assert.match((await engine.status({ id: run.id })).error, /owner unavailable/);
});


test('non-text mapping payloads cannot disappear silently', () => {
  const text = JSON.stringify({ mapping: { a: { parent: null, message: { content: { content_type: 'audio', transcript: 'not an accepted plain-text export' } } } } });
  assert.throws(() => prepare({ name: 'chat.json', text }), /non-text content/);
});


test('uncertain connection recovery requires acknowledgement, preserves earlier work, archives and pauses', async t => {
  const { options, calls, root } = await setup(t);
  options.fetchImpl = fixtureFetch(calls, async (_body, count) => {
    if (count === 2) throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }) });
  });
  const engine = createHellWeekGeneration(options);
  const run = await engine.create({ text: text.repeat(200), maxCards: 12 });
  await engine.start({ id: run.id }); await engine._active();
  let status = await engine.status({ id: run.id });
  assert.equal(status.leo.length, 1); assert.equal(calls.length, 2);
  assert.equal(status.calls['leo-1'].failure.code, 'ECONNRESET');
  assert.match(status.error, /billing is unknown/);
  await assert.rejects(engine.start({ id: run.id, retryUnknownCallId: 'leo-1' }), /explicit acknowledgement/);
  assert.equal(calls.length, 2);
  await engine.start({ id: run.id, retryUnknownCallId: 'leo-1', acknowledgePossibleDuplicateCharge: true }); await engine._active();
  status = await engine.status({ id: run.id });
  assert.equal(calls.length, 3); assert.equal(status.state, 'paused'); assert.equal(status.leo.length, 2);
  assert.equal(status.cards.length, 0); assert.equal(status.calls['leo-0'].attempt, 1);
  assert.equal(status.calls['leo-1'].attempt, 2);
  assert.equal(status.calls['leo-1'].retryAuthorization.possibleDuplicateChargeAcknowledged, true);
  const archived = JSON.parse(await fs.readFile(path.join(root, 'Hell Week Runs', run.id, 'attempts/leo-1-1.receipt.json')));
  assert.equal(archived.state, 'unknown'); assert.equal(archived.failure.code, 'ECONNRESET');
});

test('uncertain recovery never exceeds its single explicitly authorized retry', async t => {
  const { engine, root } = await setup(t, { fetchImpl: async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' }) }); } });
  const run = await engine.create({ text });
  await engine.start({ id: run.id }); await engine._active();
  await engine.start({ id: run.id, retryUnknownCallId: 'leo-0', acknowledgePossibleDuplicateCharge: true }); await engine._active();
  await assert.rejects(engine.start({ id: run.id, retryUnknownCallId: 'leo-0', acknowledgePossibleDuplicateCharge: true }), /not eligible/);
  assert.equal((await engine.status({ id: run.id })).attempts, 2);
});

test('LEO schema requires each chunk by identity and accepts legacy complete arrays', () => {
  const { leoRequest } = require('../electron/hell-week-contract.cjs');
  const plan = prepare({ text: text.repeat(150), maxCards: 12 });
  const ids = plan.leoWindows[0];
  const schema = leoRequest(plan, ids).schema.properties.preparation;
  assert.equal(schema.type, 'object'); assert.deepEqual(schema.required, ids);
  assert.equal(schema.additionalProperties, false);
  const base = { set_name: 'Archive', summary: 'Seeds', preparation: Object.fromEntries(ids.map(id => [id, { focus: 'preserve', why_it_matters: 'lineage', continuity: 'seasons' }])) };
  assert.deepEqual(validateLeo(base, ids).preparation.map(p => p.chunk_id), ids);
  assert.throws(() => validateLeo({ ...base, preparation: [{ chunk_id: ids[0], focus: 'x' }, { chunk_id: ids[0], focus: 'y' }] }, ids), /duplicate/);
});

test('coverage repair requests only missing chunks, preserves receipts and pauses after one call', async t => {
  const { options, calls, root } = await setup(t);
  const normal = fixtureFetch(calls);
  options.fetchImpl = async (url, request) => {
    const response = await normal(url, request); const body = await response.json();
    const output = JSON.parse(body.output[0].content[0].text);
    output.preparation = calls.length === 1 ? output.preparation.slice(0, 1)
      : Object.fromEntries(output.preparation.map(({ chunk_id, ...entry }) => [chunk_id, entry]));
    body.output[0].content[0].text = JSON.stringify(output);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const engine = createHellWeekGeneration(options);
  const run = await engine.create({ text: text.repeat(150), maxCards: 12 });
  await engine.start({ id: run.id }); await engine._active();
  const blocked = await engine.status({ id: run.id });
  assert.equal(blocked.state, 'blocked'); assert.equal(blocked.leoCoverage.savedCount, 1);
  const originalPath = path.join(root, 'Hell Week Runs', run.id, 'leo-0.result.json');
  const original = await fs.readFile(originalPath, 'utf8');
  const resumed = createHellWeekGeneration(options);
  await resumed.start({ id: run.id, repairLeoWindow: 0 }); await resumed._active();
  const after = await resumed.status({ id: run.id });
  assert.equal(after.state, 'paused'); assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].body.input).chunks.map(c => c.chunk_id), blocked.leoCoverage.missing);
  assert.equal(after.leo[0].preparation.length, blocked.leoCoverage.expected.length);
  assert.equal(after.cards.length, 0); assert.equal(after.leoCoverage, undefined);
  assert.equal(await fs.readFile(originalPath, 'utf8'), original);
  await assert.rejects(resumed.start({ id: run.id, repairLeoWindow: 0 }), /not eligible/);
  assert.equal(calls.length, 2);
});


test('external image receipt survives two resumes without a private PNG copy', async t => {
  const objects = new Map(); let reserves = 0; let writes = 0; let fail = true;
  const mediaStore = { preflight: async () => {}, reserve: async () => { reserves++; }, put: async bytes => { writes++; objects.set('one', bytes); return { kind: 'external-object', id: 'one' }; }, read: async ref => objects.get(ref.id) };
  const { engine, root, options, calls } = await setup(t, { mediaStore, registerCard: async () => { if (fail) throw Error('temporary owner hold'); return { cardId: 'saved' }; } });
  const run = await engine.create({ text }); await engine.start({ id: run.id }); await engine._active();
  assert.equal((await engine.status({id:run.id})).state, 'blocked');
  for (let i = 0; i < 2; i++) { fail = i === 0; const next = createHellWeekGeneration(options); await next.start({id:run.id}); await next._active(); }
  assert.equal(calls.length,3); assert.equal(writes,1); assert.equal(reserves,1);
  assert.equal((await engine.status({id:run.id})).state,'complete');
  assert.equal((await fs.readdir(path.join(root,'Hell Week Runs',run.id))).some(f=>f.endsWith('.png')),false);
});


test('Thor selects literal source excerpts; legacy bad quotes repair once and reuse after restart', async t => {
  const { evidenceChoices, evidenceRepairRequest } = require('../electron/hell-week-contract.cjs');
  const chunk = prepare({text}).chunks[0];
  assert.ok(evidenceChoices(chunk).every(q=>q.length<=160 && chunk.spans.some(s=>s.text.includes(q))));
  assert.deepEqual(evidenceRepairRequest(chunk,design).schema.properties.evidence_quote_id.enum,evidenceChoices(chunk).map((_,i)=>`excerpt-${i+1}`));
  const calls=[]; const base=fixtureFetch(calls);
  const fetchImpl=async(url, options)=>{
    const request=JSON.parse(options.body);
    if(Object.keys(request.text?.format.schema.properties || {}).join(',')==='evidence_quote_id'){
      calls.push({url,body:request});
      return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({evidence_quote_id:'excerpt-1'})}]}]}));
    }
    const response=await base(url,options);
    if(request.instructions?.startsWith('You are Thor')){const body=await response.json();body.output[0].content[0].text=JSON.stringify({...design,evidence_quotes:['Paraphrase not present in source']});return new Response(JSON.stringify(body));}
    return response;
  };
  const {engine,root:privateRoot,options}=await setup(t,{fetchImpl});
  const run=await engine.create({text});await engine.start({id:run.id});await engine._active();
  assert.equal((await engine.status({id:run.id})).state,'blocked'); assert.equal(calls.length,2);
  const original=await fs.readFile(path.join(privateRoot,'Hell Week Runs',run.id,'thor-0.result.json'),'utf8');
  await engine.start({id:run.id,repairThorEvidence:true});await engine._active();
  const saved=await engine.status({id:run.id}); assert.equal(saved.state,'complete');assert.equal(calls.length,4);
  assert.equal(saved.cards[0].design.title,design.title);assert.equal(saved.cards[0].design.evidenceRepair.callId,'thor-0-evidence-repair-v2');
  assert.equal(await fs.readFile(path.join(privateRoot,'Hell Week Runs',run.id,'thor-0.result.json'),'utf8'),original);
  const resumed=createHellWeekGeneration(options);await resumed.start({id:run.id,repairThorEvidence:true});assert.equal(calls.length,4);
});


test('reconciling saved artwork uses no paid calls and preserves the call journal', async t => {
 const {engine,calls}=await setup(t);const run=await engine.create({text});await engine.start({id:run.id});await engine._active();
 const before=await engine.status({id:run.id});const count=calls.length;await engine.reconcile({id:run.id});await engine.reconcile({id:run.id});
 const after=await engine.status({id:run.id});assert.equal(after.state,'complete');assert.equal(calls.length,count);assert.deepEqual(after.calls,before.calls);
});
