import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync(new URL("../server/api.mjs", import.meta.url), "utf8");

function sourceBlock(startMarker, endMarker) {
  const start = apiSource.indexOf(startMarker);
  const end = apiSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return apiSource.slice(start, end);
}

test("retired external worker claim and result routes fail closed without queue mutations", () => {
  assert.doesNotMatch(
    apiSource,
    /songCardRemintStore\.(?:claim|recordResult|recordGuardedResult)\s*\(/u,
    "the HTTP service must not expose the internal remint execution mutations",
  );
  const claimRoute = sourceBlock(
    'if (pathname === "/api/song-card-remints/claim" && req.method === "POST")',
    "const songCardRemintActionMatch",
  );
  assert.match(claimRoute, /sendJson\(res, 409, retiredSongCardExternalWorkerPayload\(\)\)/u);
  assert.doesNotMatch(claimRoute, /songCardRemintStore\.(?:claim|recordResult|recordGuardedResult)\s*\(/u);
  assert.doesNotMatch(claimRoute, /noteSongCardRenderExecutor\s*\(/u);

  const resultRoute = sourceBlock(
    "const songCardRemintResultMatch",
    'if (pathname === "/api/hapa-songs"',
  );
  assert.match(resultRoute, /sendJson\(res, 409, retiredSongCardExternalWorkerPayload/u);
  assert.doesNotMatch(resultRoute, /songCardRemintStore\.(?:claim|recordResult|recordGuardedResult)\s*\(/u);
  assert.doesNotMatch(resultRoute, /noteSongCardRenderExecutor\s*\(/u);

  const payload = sourceBlock(
    "function retiredSongCardExternalWorkerPayload",
    "function withSongCardRenderExecutor",
  );
  assert.match(payload, /external_render_worker_protocol_not_certified/u);
  assert.match(payload, /queueMutated:\s*false/u);
  assert.match(payload, /protocolCertified:\s*false/u);
  assert.match(payload, /claimAuthority:\s*false/u);
  assert.match(payload, /SONG_CARD_LOCAL_RENDER_ENDPOINT/u);
});

test("the authenticated Builder-managed local render ingress remains wired", () => {
  const localRoute = sourceBlock(
    "const songCardLocalRenderMatch",
    'if (pathname === "/api/song-card-playback/activity"',
  );
  assert.match(localRoute, /\/render-local\$\//u);
  assert.match(localRoute, /requireAdmin\(req, res\)/u);
  assert.match(localRoute, /songCardLocalRenderBridge\.start\(candidateId\)/u);
  assert.doesNotMatch(localRoute, /retiredSongCardExternalWorkerPayload/u);
});

test("external heartbeat presence cannot advertise claim or release authority", () => {
  const status = sourceBlock(
    "function songCardRenderExecutorStatus",
    "function retiredSongCardExternalWorkerPayload",
  );
  assert.match(status, /available:\s*false/u);
  assert.match(status, /releaseCapable:\s*false/u);
  assert.match(status, /protocolCertified:\s*false/u);
  assert.match(status, /claimAuthority:\s*false/u);
  assert.match(status, /external-worker-retired/u);
  assert.doesNotMatch(status, /if \(releaseCapable\) return/u);
});
