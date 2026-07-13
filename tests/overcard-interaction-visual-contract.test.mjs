import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Builder mounts the shared accessible Hand/slots and projects Tarot 3D through canonical Formation semantics', async () => {
  const [main, headerHand, menu, tarot, adapter, css] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/overcard/BuilderHeaderHand.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/overcard/BuilderMenuHostTab.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/TarotDraw3DView.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/overcard/tarotFormationAdapter.js', import.meta.url), 'utf8'),
    readFile(new URL('../node_modules/@hapa/overcard/dist/styles/overcard.css', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(main, /<OvercardHand/);
  assert.match(headerHand, /<OvercardHand/);
  assert.match(menu, /<OvercardHostSlots/);
  assert.match(menu, /onHeldChange=\{\(entity\) => \{ if \(!entity\) pickup\.setHeld\(null\); \}\}/);
  assert.match(tarot, /tarotSceneSnapshotToFormation/);
  assert.match(tarot, /tarotFormationToSceneSnapshot/);
  assert.match(adapter, /projections: \{ \[TAROT_FORMATION_PROJECTION_ID\]:[\s\S]*cssOvercard:/);
  assert.match(adapter, /renderer: "builder-tarot-3d"/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /data-attachment-status="staged"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
