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
  assert.equal(saved._sync.overwatch, 'not-confirmed');
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

test('unprojected event does not overwrite an external edit', async t => {
  let failing = true;
  const { store, boardPath } = await fixture(t, { ...fs, rename: async (...args) => { if (failing) throw new Error('disk failure'); return fs.rename(...args); } });
  const initial = await store.read();
  await assert.rejects(store.changeStatus(command(initial)), { code: 'echo_board_projection_pending' });
  const external = JSON.parse(await fs.readFile(boardPath, 'utf8')); external.owner = 'external-author';
  await fs.writeFile(boardPath, JSON.stringify(external)); failing = false;
  await assert.rejects(store.read(), { code: 'echo_board_projection_conflict' });
  assert.equal(JSON.parse(await fs.readFile(boardPath, 'utf8')).owner, 'external-author');
});

test('journal failure leaves the projection unchanged; blocking requires a reason', async t => {
  const { store, boardPath } = await fixture(t, { ...fs, open: async (file, flags) => { if (String(file).endsWith('events.ndjson')) throw new Error('journal unavailable'); return fs.open(file, flags); } });
  const initial = await store.read(); const before = await fs.readFile(boardPath, 'utf8');
  await assert.rejects(store.changeStatus(command(initial, { status: 'blocked' })), { code: 'echo_board_reason_required' });
  await assert.rejects(store.changeStatus(command(initial)), /journal unavailable/);
  assert.equal(await fs.readFile(boardPath, 'utf8'), before);
});
