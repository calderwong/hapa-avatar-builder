import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createEchoKanbanStore } from '../server/echo-kanban-store.mjs';

async function fixture(t, io) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-board-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const boardPath = path.join(root, 'board.json'), stateRoot = path.join(root, 'state');
  const board = { owner: 'original', lanes: [{ id: 'lane', cards: [{ id: 'card', status: 'backlog', metadata: { accepted: false }, artifactLinks: [{ href: 'original' }] }, { id: 'other', status: 'todo' }] }] };
  await fs.writeFile(boardPath, JSON.stringify(board));
  return { root, boardPath, stateRoot, board, store: createEchoKanbanStore({ boardPath, stateRoot, io }) };
}
function command(board, patch = {}) { return { expectedRevision: board._sync.revision, commandId: 'test-command-01', laneId: 'lane', cardId: 'card', status: 'in_progress', ...patch }; }

test('one-card commands retain all unrelated fields; retries are idempotent and whole-board writes fail', async t => {
  const { store, board, stateRoot } = await fixture(t);
  const initial = await store.read();
  const input = command(initial);
  const saved = await store.changeStatus(input);
  assert.equal(saved.lanes[0].cards[0].status, 'in_progress');
  assert.deepEqual(saved.lanes[0].cards[0].metadata, { accepted: false });
  assert.deepEqual(saved.lanes[0].cards[1], board.lanes[0].cards[1]);
  assert.deepEqual(saved.lanes[0].cards[0].artifactLinks, board.lanes[0].cards[0].artifactLinks);
  assert.equal((await store.changeStatus(input)).idempotentReplay, true);
  assert.equal((await fs.readFile(path.join(stateRoot, 'events.ndjson'), 'utf8')).trim().split('\n').length, 2);
  await assert.rejects(store.changeStatus({ ...input, status: 'done' }), { code: 'echo_board_command_conflict' });
  await assert.rejects(store.changeStatus(board), { code: 'echo_board_command_required' });
  assert.equal(saved._sync.overwatch, 'not-configured');
});

test('stale concurrent writers cannot erase a newer status', async t => {
  const { store, boardPath, stateRoot } = await fixture(t);
  const second = createEchoKanbanStore({ boardPath, stateRoot });
  const initial = await store.read();
  const results = await Promise.allSettled([store.changeStatus(command(initial)), second.changeStatus(command(initial, { commandId: 'test-command-02', cardId: 'other' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const error = results.find(result => result.status === 'rejected').reason;
  assert.ok(['echo_board_busy', 'echo_board_revision_conflict'].includes(error.code));
  await assert.rejects(second.changeStatus(command(initial, { commandId: 'test-command-03' })), { code: 'echo_board_revision_conflict' });
});

test('failed projection recovers the recorded event without duplicate mutation', async t => {
  let failing = true;
  const { store, stateRoot } = await fixture(t, { ...fs, rename: async (...args) => { if (failing) throw Object.assign(new Error('disk failure'), { code: 'EIO' }); return fs.rename(...args); } });
  const initial = await store.read();
  const input = command(initial);
  await assert.rejects(store.changeStatus(input), { code: 'echo_board_projection_pending', commandId: input.commandId });
  failing = false;
  const recovered = await store.read();
  assert.equal(recovered.lanes[0].cards[0].status, 'in_progress');
  assert.equal((await store.changeStatus(input)).idempotentReplay, true);
  assert.equal((await fs.readFile(path.join(stateRoot, 'events.ndjson'), 'utf8')).trim().split('\n').length, 2);
});

test('unprojected status rebases over unrelated external metadata without erasing it', async t => {
  let failing = true;
  const { store, boardPath } = await fixture(t, { ...fs, rename: async (...args) => { if (failing) throw new Error('disk failure'); return fs.rename(...args); } });
  const initial = await store.read();
  await assert.rejects(store.changeStatus(command(initial)), { code: 'echo_board_projection_pending' });
  const external = JSON.parse(await fs.readFile(boardPath, 'utf8')); external.owner = 'external-author';
  await fs.writeFile(boardPath, JSON.stringify(external)); failing = false;
  const recovered=await store.read();
  assert.equal(recovered._sync.localProjection,'current');
  assert.equal(recovered.lanes[0].cards[0].status,'in_progress');
  assert.equal(JSON.parse(await fs.readFile(boardPath, 'utf8')).owner, 'external-author');
});

test('journal failure leaves the projection unchanged; blocking requires a reason', async t => {
  const { store, boardPath } = await fixture(t, { ...fs, open: async (file, flags) => { if (String(file).endsWith('events.ndjson')) throw new Error('journal unavailable'); return fs.open(file, flags); } });
  const initial = await store.read(); const before = await fs.readFile(boardPath, 'utf8');
  await assert.rejects(store.changeStatus(command(initial, { status: 'blocked' })), { code: 'echo_board_reason_required' });
  await assert.rejects(store.changeStatus(command(initial)), /journal unavailable/);
  assert.equal(await fs.readFile(boardPath, 'utf8'), before);
});

for(const resolution of ['keep-current','apply-recorded'])test(`conflicting external status is inspectable and ${resolution} is explicit, durable and idempotent`,async t=>{
 let failing=true;
 const {store,boardPath,stateRoot}=await fixture(t,{...fs,rename:async(...args)=>{if(failing)throw new Error('disk failure');return fs.rename(...args);}});
 const initial=await store.read();await assert.rejects(store.changeStatus(command(initial)),{code:'echo_board_projection_pending'});
 const external=JSON.parse(await fs.readFile(boardPath,'utf8'));external.lanes[0].cards[0].status='review';external.lanes[0].cards[1].metadata='external';await fs.writeFile(boardPath,JSON.stringify(external));failing=false;
 const conflict=await store.read();assert.equal(conflict._sync.localProjection,'conflict');assert.equal(conflict._sync.pendingCommands.length,1);
 assert.equal(conflict.lanes[0].cards[0].status,'review');
 await assert.rejects(store.changeStatus(command(conflict,{commandId:'other-command'})),{code:'echo_board_projection_conflict'});
 const input={commandId:'resolution-command',originalCommandId:'test-command-01',expectedRevision:conflict._sync.revision,resolution,reason:'Reviewed current and recorded choices'};
 await assert.rejects(store.resolveProjection({...input,reason:''}),{code:'echo_board_resolution_required'});
 const saved=await store.resolveProjection(input);assert.equal(saved._sync.localProjection,'current');
 assert.equal(saved.lanes[0].cards[0].status,resolution==='keep-current'?'review':'in_progress');
 assert.equal(saved.lanes[0].cards[1].metadata,'external');
 assert.equal((await store.resolveProjection(input)).idempotentReplay,true);
 await assert.rejects(store.resolveProjection({...input,resolution:resolution==='keep-current'?'apply-recorded':'keep-current'}),{code:'echo_board_command_conflict'});
 await assert.rejects(store.changeStatus(command(saved,{commandId:'resolution-command',status:'done'})),{code:'echo_board_command_conflict'});
 const events=(await fs.readFile(path.join(stateRoot,'events.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(events.filter(row=>row.type==='status_changed').length,1);assert.equal(events.filter(row=>row.type==='status_resolution').length,1);
});

test('dead-owner locks recover while live-owner and unattributed directory locks remain protected',async t=>{
 const {store,stateRoot}=await fixture(t);
 await fs.mkdir(stateRoot,{recursive:true});const lock=path.join(stateRoot,'writer.lock');
 await fs.writeFile(lock,JSON.stringify({schemaVersion:'hapa.echo.kanban-lock.v1',pid:2147483647,token:'a'.repeat(64),createdAt:new Date().toISOString()}));
 assert.equal((await store.read())._sync.localProjection,'current');await assert.rejects(fs.stat(lock),{code:'ENOENT'});
 await fs.writeFile(lock,JSON.stringify({schemaVersion:'hapa.echo.kanban-lock.v1',pid:process.pid,token:'b'.repeat(64),createdAt:new Date().toISOString()}));
 await assert.rejects(store.read(),{code:'echo_board_busy'});assert.ok((await fs.stat(lock)).isFile());await fs.unlink(lock);
 await fs.mkdir(lock);await assert.rejects(store.read(),{code:'echo_board_busy'});assert.ok((await fs.stat(lock)).isDirectory());
});

test('projection already written before receipt failure recovers without losing subsequent external fields',async t=>{
 let journalWrites=0;
 const io={...fs,open:async(file,flags,...rest)=>{if(String(file).endsWith('events.ndjson')&&++journalWrites===2)throw new Error('receipt disk failure');return fs.open(file,flags,...rest);}};
 const {store,boardPath,stateRoot}=await fixture(t,io);const initial=await store.read();const input=command(initial);
 await assert.rejects(store.changeStatus(input),{code:'echo_board_projection_pending'});
 const external=JSON.parse(await fs.readFile(boardPath,'utf8'));external.owner='newer metadata';await fs.writeFile(boardPath,JSON.stringify(external));
 const recovered=await store.read();assert.equal(recovered.owner,'newer metadata');assert.equal(recovered.lanes[0].cards[0].status,'in_progress');
 assert.equal((await store.changeStatus(input)).idempotentReplay,true);
 const events=(await fs.readFile(path.join(stateRoot,'events.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(events.length,2);assert.equal(events[1].rebased,true);
});
