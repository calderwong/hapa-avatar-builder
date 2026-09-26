import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { avatarWorkBoardUrl } from '../src/domain/avatar-work-board.js';

test('work board links exact identity without name normalization or script routing', () => {
  assert.equal(avatarWorkBoardUrl('linden'), 'http://127.0.0.1:5181/avatars.html?avatar=linden');
  for (const id of ['same name / other ID', 'javascript:alert(1)', 'a&avatar=b']) {
    const url = new URL(avatarWorkBoardUrl(id));
    assert.equal(url.origin, 'http://127.0.0.1:5181');
    assert.equal(url.searchParams.get('avatar'), id);
    assert.equal([...url.searchParams].length, 1);
  }
  assert.equal(avatarWorkBoardUrl(null), null);
});
test('integration preserves healing boards and does not copy task ownership', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<AvatarWorkBoardPanel avatar=\{selectedAvatar\}/);
  assert.match(app, /<HealingQueuePanel/);
  const component = await readFile(new URL('../src/components/AvatarWorkBoardPanel.jsx', import.meta.url), 'utf8');
  assert.match(component, /identity: \{avatar.id\}/);
  assert.match(component, /Human \/ agent protocol/);
  assert.doesNotMatch(component, /fetch\(|localStorage|setInterval/);
});
