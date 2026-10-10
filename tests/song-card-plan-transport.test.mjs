import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { prepareSongCardPlanRequest, SONG_CARD_PLAN_JSON_BYTES, SONG_CARD_PLAN_WIRE_BYTES } from "../src/domain/song-card-plan-transport.js";
import { readSongCardPlanRequest } from "../server/song-card-plan-request.mjs";

const route = "/api/song-cards/test-song/plan";
function request(body, headers = {}) {
  return Object.assign(Readable.from([Buffer.from(body)]), { headers });
}

test("large plan crosses the old limit losslessly, including source paths, words, and locks", async () => {
  const input = { project: { timeline: [{ evidence: "e".repeat(9 * 1024 * 1024) }], active_direction_script_variant: { id: "saved-cut" }, timed_lyrics: [{ words: [{ text: "écho", start: 1.2, end: 2.5, locked: true }] }] }, showGraph: { stems: { items: [{ audioPath: "/local/lead.wav", role: "lead" }] } } };
  const options = await prepareSongCardPlanRequest(route, { method: "POST", body: JSON.stringify(input), headers: { Authorization: "Bearer test" }, credentials: "same-origin" });
  assert.equal(options.headers.get("content-encoding"), "gzip");
  assert.equal(options.headers.get("authorization"), "Bearer test");
  assert.ok(options.body.byteLength < 128 * 1024);
  assert.equal(options.credentials, "same-origin");
  assert.deepEqual(await readSongCardPlanRequest(request(options.body, { "content-encoding": "gzip" })), input);
  // The same materialized bytes can be sent again after session bootstrap.
  assert.deepEqual(await readSongCardPlanRequest(request(options.body, { "content-encoding": "gzip" })), input);
});

test("small plans and unrelated mutations retain their existing transport", async () => {
  const init = { method: "POST", body: '{"small":true}' };
  assert.equal(await prepareSongCardPlanRequest(route, init), init);
  assert.equal(await prepareSongCardPlanRequest(route.replace("/plan", "/mint"), init), init);
  assert.deepEqual(await readSongCardPlanRequest(request(init.body)), { small: true });
});

test("rejects compressed expansion, wire overflow, malformed payloads and unsupported encoding", async () => {
  await assert.rejects(readSongCardPlanRequest(request(gzipSync(Buffer.alloc(SONG_CARD_PLAN_JSON_BYTES + 1)), { "content-encoding": "gzip" })), { statusCode: 413 });
  await assert.rejects(readSongCardPlanRequest(request(Buffer.alloc(SONG_CARD_PLAN_WIRE_BYTES + 1), { "content-encoding": "gzip" })), { statusCode: 413 });
  await assert.rejects(readSongCardPlanRequest(request("bad", { "content-encoding": "gzip" })), { statusCode: 400 });
  await assert.rejects(readSongCardPlanRequest(request("bad")), { statusCode: 400 });
  await assert.rejects(readSongCardPlanRequest(request("{}", { "content-encoding": "br" })), { statusCode: 415 });
  await assert.rejects(readSongCardPlanRequest(request("{}", { "content-length": String(SONG_CARD_PLAN_JSON_BYTES + 1) })), { statusCode: 413 });
});

test("cancellation is honored before transmission and decoding", async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(prepareSongCardPlanRequest(route, { method: "POST", body: "{}", signal }), { name: "AbortError" });
  await assert.rejects(readSongCardPlanRequest(request("{}"), { signal }), { name: "AbortError" });
});
