import test from "node:test";
import assert from "node:assert/strict";
import { createWebmMuxer, readEbml, opusHead, WEBM_IDS as ID } from "../src/domain/webm-muxer.js";
import { createPcmBandSampler } from "../src/domain/echo-audio-bands.js";
import { scoreDustExportBitrate } from "../src/components/echo-score-dust-export.js";

const find = (bytes, list, id) => list.find((e) => e.id === id);
const children = (bytes, el) => readEbml(bytes, el.dataAt, el.dataAt + el.size);

test("the WebM muxer writes header, info, tracks, keyframe clusters, cues and a seek head", () => {
  const muxer = createWebmMuxer({ video: { codec: "V_VP9", width: 640, height: 360 }, audio: { sampleRate: 48000, channels: 2 } });
  for (let k = 0; k < 90; k++) muxer.addVideoChunk({ data: Uint8Array.of(k & 255, 1, 2), timestampUs: Math.round(k * 1e6 / 30), keyframe: k % 60 === 0 });
  for (let a = 0; a < 150; a++) muxer.addAudioChunk({ data: Uint8Array.of(9, a & 255), timestampUs: a * 20000 });
  const bytes = muxer.finalize({ durationUs: 3_000_000 });
  const top = readEbml(bytes);
  assert.deepEqual(top.map((e) => e.id), [ID.EBML, ID.Segment]);
  const segment = top[1], body = children(bytes, segment);
  const ids = body.map((e) => e.id);
  assert.equal(ids[0], ID.SeekHead);
  assert.ok(ids.includes(ID.Info) && ids.includes(ID.Tracks) && ids.includes(ID.Cues));
  const clusters = body.filter((e) => e.id === ID.Cluster);
  assert.equal(clusters.length, 2, "one cluster per video keyframe");
  // Every SimpleBlock's relative timecode is within int16 and ascending per cluster.
  let blocks = 0;
  for (const cluster of clusters) {
    const inner = children(bytes, cluster), timecode = inner.find((e) => e.id === ID.Timecode);
    assert.ok(timecode);
    let last = -Infinity;
    for (const block of inner.filter((e) => e.id === ID.SimpleBlock)) {
      const rel = new DataView(bytes.buffer, bytes.byteOffset + block.dataAt + 1, 2).getInt16(0);
      assert.ok(rel >= last); last = rel; blocks++;
    }
  }
  assert.equal(blocks, 240);
  // SeekHead positions point at the real elements (relative to segment data).
  const seekHead = body[0];
  for (const seek of children(bytes, seekHead)) {
    const parts = children(bytes, seek), idEl = parts.find((e) => e.id === ID.SeekID), posEl = parts.find((e) => e.id === ID.SeekPosition);
    let position = 0; for (let i = 0; i < posEl.size; i++) position = position * 256 + bytes[posEl.dataAt + i];
    const target = readEbml(bytes, segment.dataAt + position, segment.dataAt + position + 8)[0];
    let wanted = 0; for (let i = 0; i < idEl.size; i++) wanted = wanted * 256 + bytes[idEl.dataAt + i];
    assert.equal(target.id, wanted);
  }
  // Cue positions land on clusters.
  const cues = find(bytes, body, ID.Cues);
  for (const point of children(bytes, cues)) {
    const positions = children(bytes, children(bytes, point).find((e) => e.id === ID.CueTrackPositions));
    const pos = positions.find((e) => e.id === ID.CueClusterPosition);
    let value = 0; for (let i = 0; i < pos.size; i++) value = value * 256 + bytes[pos.dataAt + i];
    assert.equal(readEbml(bytes, segment.dataAt + value, segment.dataAt + value + 8)[0].id, ID.Cluster);
  }
});

test("the muxer refuses unordered or non-keyframe starts and builds a valid OpusHead", () => {
  const muxer = createWebmMuxer({ video: { width: 2, height: 2 } });
  muxer.addVideoChunk({ data: [1], timestampUs: 0, keyframe: false });
  assert.throws(() => muxer.finalize(), /keyframe/);
  assert.throws(() => muxer.addVideoChunk({ data: [1], timestampUs: 0, keyframe: true }), /increasing/);
  assert.throws(() => createWebmMuxer({ video: { width: 2, height: 2 } }).addAudioChunk({ data: [1], timestampUs: 1 }), /no audio/);
  const head = opusHead({ channels: 2, sampleRate: 48000, preSkip: 312 });
  assert.equal(new TextDecoder().decode(head.subarray(0, 8)), "OpusHead");
  assert.equal(new DataView(head.buffer).getUint16(10, true), 312);
});

test("PCM band sampler is deterministic and puts a tone in the right band", () => {
  const rate = 48000, n = rate * 2, low = new Float32Array(n), high = new Float32Array(n);
  for (let i = 0; i < n; i++) { low[i] = 0.5 * Math.sin(2 * Math.PI * 80 * i / rate); high[i] = 0.5 * Math.sin(2 * Math.PI * 9000 * i / rate); }
  const lowBands = createPcmBandSampler([low], rate)(1), highBands = createPcmBandSampler([high], rate)(1);
  const peak = (b) => b.indexOf(Math.max(...b));
  assert.ok(peak(lowBands) < peak(highBands), `${peak(lowBands)} < ${peak(highBands)}`);
  assert.deepEqual([...createPcmBandSampler([low], rate)(1)], [...lowBands]);
  const silent = createPcmBandSampler([new Float32Array(n)], rate)(1);
  assert.ok(silent.every((v) => v === 0));
  assert.ok([...lowBands, ...highBands].every((v) => v >= 0 && v <= 1));
});

test("export bitrate scales with pixels and keeps long exports under the recordings cap", () => {
  const hd = scoreDustExportBitrate({ width: 1920, height: 1080, fps: 30, durationSeconds: 15 });
  const small = scoreDustExportBitrate({ width: 1280, height: 720, fps: 30, durationSeconds: 15 });
  assert.equal(hd, 8_000_000);
  assert.ok(small < hd);
  const long = scoreDustExportBitrate({ width: 1920, height: 1080, fps: 30, durationSeconds: 600 });
  assert.ok((long + 160_000) * 600 / 8 <= 120 * 1024 * 1024);
});
