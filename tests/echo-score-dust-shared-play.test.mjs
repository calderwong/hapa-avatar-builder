import test from "node:test";
import assert from "node:assert/strict";
import { clockSample, createRoomClock, sessionPositionAt, sharedPlayCorrection, validateSharedPlayInput } from "../src/domain/echo-score-dust-shared-play.js";
import { createScoreDustSessionStore, handleScoreDustSessions } from "../server/echo-score-dust-sessions.mjs";

test("four-timestamp offset matches the research formula and midpoint is the fallback", () => {
  // Client is 500 ms behind the server; 40 ms each way; server spends 5 ms.
  const sample = clockSample({ clientSendMs: 1000, serverReceiveMs: 1540, serverSendMs: 1545, clientReceiveMs: 1085 });
  assert.equal(sample.offsetMs, 500);
  assert.equal(sample.delayMs, 80);
  assert.equal(sample.method, "four-timestamp");
  const midpoint = clockSample({ clientSendMs: 1000, serverSendMs: 1545, clientReceiveMs: 1090 });
  assert.equal(midpoint.offsetMs, 500);
  assert.equal(midpoint.method, "midpoint");
  assert.equal(clockSample({ clientSendMs: 10, clientReceiveMs: 5, serverSendMs: 1 }), null);
});

test("the room clock keeps the lowest-delay estimate and asks for a refresh after ten minutes", () => {
  let now = 0;
  const clock = createRoomClock({ now: () => now });
  clock.add({ clientSendMs: 0, serverReceiveMs: 600, serverSendMs: 600, clientReceiveMs: 400 }); // delay 400, offset 400
  clock.add({ clientSendMs: 0, serverReceiveMs: 510, serverSendMs: 510, clientReceiveMs: 20 }); // delay 20, offset 500
  assert.equal(clock.offsetMs, 500);
  assert.equal(clock.roomNowMs(1000), 1500);
  now = 11 * 60 * 1000;
  assert.equal(clock.needsRefresh, true);
});

test("drift policy seeks only past 250 ms, follows play/pause and respects the song end", () => {
  const session = { state: "playing", positionSeconds: 10, startedAtRoomMs: 0, durationSeconds: 100 };
  assert.equal(sessionPositionAt(session, 5000), 15);
  assert.equal(sharedPlayCorrection({ session, roomNowMs: 5000, actualSeconds: 15.2, playing: true }).action, "none");
  const drift = sharedPlayCorrection({ session, roomNowMs: 5000, actualSeconds: 15.4, playing: true });
  assert.equal(drift.action, "seek");
  assert.ok(Math.abs(drift.to - 15) < 1e-9);
  assert.equal(sharedPlayCorrection({ session, roomNowMs: 5000, actualSeconds: 0, playing: false }).action, "play");
  assert.equal(sharedPlayCorrection({ session: { ...session, state: "paused", startedAtRoomMs: null }, roomNowMs: 5000, actualSeconds: 10, playing: true }).action, "pause");
  assert.equal(sharedPlayCorrection({ session, roomNowMs: 200_000, actualSeconds: 0, playing: true }).action, "none");
  assert.ok(Math.abs(sharedPlayCorrection({ session, roomNowMs: 5000, actualSeconds: 15, playing: true, outputLatencySeconds: 0.5 }).to - 15.5) < 1e-9);
});

test("session store revisions block stale updates and derive the paused position", () => {
  let now = 1000;
  const store = createScoreDustSessionStore({ now: () => now });
  assert.throws(() => store.create({}), /songId/);
  const session = store.create({ songId: "s", state: "playing", positionSeconds: 4, durationSeconds: 60 });
  assert.equal(session.revision, 1);
  now += 3000;
  const paused = store.update(session.id, { baseRevision: 1, state: "paused" });
  assert.equal(paused.positionSeconds, 7);
  assert.equal(paused.startedAtRoomMs, null);
  assert.throws(() => store.update(session.id, { baseRevision: 1, state: "playing" }), (e) => e.statusCode === 409);
  assert.throws(() => store.update(session.id, { baseRevision: 2, surprise: 1 }), /Unknown session field/);
  assert.equal(validateSharedPlayInput({ songId: "s", state: "dancing" }).ok, false);
});

test("routes return room-clock times with every response", async () => {
  let now = 50;
  const store = createScoreDustSessionStore({ now: () => now });
  const call = async (method, path, body) => {
    let sent;
    await handleScoreDustSessions({ req: { method }, res: {}, url: new URL(`http://x/api/echos/score-dust/sessions${path}`), store, requireAdmin: () => true,
      readBody: async () => body, sendJson: (res, status, payload) => { sent = { status, payload }; }, now: () => (now += 1) });
    return sent;
  };
  const created = await call("POST", "", { songId: "s" });
  assert.equal(created.status, 201);
  assert.ok(created.payload.clock.serverSendMs >= created.payload.clock.serverReceiveMs);
  const id = created.payload.session.id;
  assert.equal((await call("GET", `/${id}`)).payload.session.id, id);
  assert.equal((await call("PUT", `/${id}`, { baseRevision: 9 })).status, 409);
  assert.equal((await call("GET", "/00000000-0000-0000-0000-000000000000")).status, 404);
  assert.equal((await call("DELETE", `/${id}`)).status, 405);
});
