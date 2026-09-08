import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEchoPreviewProjection, echoPreviewShotKey, createEchoPreviewProxySchedule } from '../src/domain/echo-preview-projection.js';

test('history prefetch follows absolute replay time, accepts only approved matching derivatives and bounds its horizon', () => {
  const timeline = [0, 2, 4, 5, 6, 20].map((start, i) => ({ media_id: String(i), start_sec: start, end_sec: start + 2, media_uri: '/media/original-' + i + '.mp4' }));
  const receipt = { songId: 'song', variantId: 'cut', items: timeline.map((shot, i) => ({ shotKey: echoPreviewShotKey(shot), status: 'ready', proxy: { uri: '/media/echo-proxies-v2/' + String(i).repeat(64) + '/preview.mp4', sha256: 'a'.repeat(64), durationSeconds: 2 } })) };
  const preview = applyEchoPreviewProjection(timeline, receipt, { songId: 'song', variantId: 'cut' });
  preview[2] = { ...preview[2], start_sec: 400 }; // stale rendition cannot be prefetched
  const at = createEchoPreviewProxySchedule(timeline, preview, uri => 'http://localhost' + uri);
  assert.deepEqual(at(0), ['http://localhost' + preview[1].runtime_media_uri]);
  assert.deepEqual(at(3), [preview[3], preview[4]].map(shot => 'http://localhost' + shot.runtime_media_uri));
  assert.deepEqual(at(12), []); assert.deepEqual(at(20), []);
  assert.deepEqual(at(0), ['http://localhost' + preview[1].runtime_media_uri], 'reverse replay uses its clock');
  assert.equal(timeline[1].runtime_media_uri, undefined);
});
