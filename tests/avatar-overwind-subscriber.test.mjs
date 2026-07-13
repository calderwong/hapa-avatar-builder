import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AvatarOverwindSubscriber } from '../server/avatar-overwind-subscriber.mjs';

const cardId = (localId) => `hapa-card:v1:${Buffer.from('hapa-avatar-builder').toString('base64url')}:${Buffer.from(localId).toString('base64url')}`;
const docs = [
  { card_id: cardId('avatar/a'), card_type: 'avatar_card', title: 'A', revision: 1, event_id: 'e1', event_digest: 'd1', ledger_position: 4 },
  { card_id: cardId('avatar/b'), card_type: 'avatar_card', title: 'B', revision: 2, event_id: 'e2', event_digest: 'd2', ledger_position: 4 },
  { card_id: cardId('item/i'), card_type: 'item_card', title: 'I', revision: 1, event_id: 'e3', event_digest: 'd3', ledger_position: 4 },
  { card_id: cardId('item/j'), card_type: 'tarot_card', title: 'J', revision: 1, event_id: 'e4', event_digest: 'd4', ledger_position: 4 }
];

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('subscriber rebuild separates canonical populations and exposes bounded rollback', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'avatar-overwind-subscriber-'));
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/subscriptions/register')) return response({ ok: true });
    if (parsed.pathname.endsWith('/subscriptions/ack')) return response({ ok: true });
    if (parsed.pathname.endsWith('/subscriptions/deltas')) return response({ head: 4, items: [{ cursor: 4, event_id: 'e4' }], has_more: false });
    if (parsed.pathname.endsWith('/cards/search')) {
      const types = String(parsed.searchParams.get('types') || '').split(',').filter(Boolean);
      const selected = types.length ? docs.filter((doc) => types.includes(doc.card_type)) : docs;
      return response({ ok: true, items: selected, count: selected.length, total: selected.length, next_cursor: null, as_of_watermark: 4, serving_backend: 'elasticsearch', facets: { card_type: { avatar_card: 2, item_card: 1, tarot_card: 1 } } });
    }
    if (parsed.pathname.includes('/history')) return response({ items: [{ revision: 1 }], as_of_watermark: 4 });
    if (parsed.pathname.includes('/comments')) return response({ items: [{ body: 'tracked' }], as_of_watermark: 4 });
    if (parsed.pathname.includes('/lineage')) return response({ edges: [], as_of_watermark: 4 });
    return response({ card: docs[0], envelope: { content: { authoritative: { id: 'a' } } }, as_of_watermark: 4 });
  };
  const subscriber = new AvatarOverwindSubscriber({ dbPath: path.join(dir, 'subscriber.sqlite3'), token: 'token' });
  try {
    const rebuilt = await subscriber.rebuild();
    assert.equal(rebuilt.total, 4);
    assert.deepEqual(rebuilt.populations, { avatars: 2, items: 2 });
    assert.equal((await subscriber.population('avatars')).total, 2);
    assert.equal((await subscriber.population('items')).total, 2);
    assert.equal((await subscriber.history(docs[0].card_id)).items.length, 1);
    assert.equal((await subscriber.comments(docs[0].card_id)).items.length, 1);
    assert.equal((await subscriber.lineage(docs[0].card_id)).edges.length, 0);
    globalThis.fetch = async () => { throw new Error('offline drill'); };
    const fallback = await subscriber.search({ population: 'avatars' });
    assert.equal(fallback.truth_state, 'local-stale');
    assert.equal(fallback.consistency_state, 'bounded_stale_local_fallback');
    assert.equal(fallback.total, 2);
    assert.equal(fallback.fallback_policy.reversible, true);
    assert.ok(calls.some((call) => call.url.includes('sources=hapa-avatar-builder')));
  } finally {
    subscriber.close();
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});
