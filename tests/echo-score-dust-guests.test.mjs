import test from "node:test";
import assert from "node:assert/strict";
import { createScoreDustSessionStore, handleScoreDustGuests, handleScoreDustSessions } from "../server/echo-score-dust-sessions.mjs";

function setup() {
  let clock = 1_000_000;
  const store = createScoreDustSessionStore({ now: () => clock });
  const session = store.create({ songId: "song-trip", state: "playing", positionSeconds: 10, score: { schemaVersion: "x" }, timeline: { schemaVersion: "y" }, audioUri: "/api/song-registry/audio/song-trip" });
  return { store, session, tick: (ms) => { clock += ms; } };
}

test("invites admit named guests with their own scoped tokens; nothing secret leaks", () => {
  const { store, session } = setup();
  const invite = store.createInvite(session.id, { ttlMinutes: 30, maxUses: 2 });
  assert.equal(invite.code.length, 43, "256-bit code");
  const joined = store.join({ sessionId: session.id, invite: invite.code, name: "  Sam <b> " });
  assert.equal(joined.session.guests[0].name, "Sam b");
  const view = store.guestSession(joined.guestToken);
  assert.deepEqual([view.you.name, view.you.hasControl, view.score.schemaVersion, view.audioUri], ["Sam b", false, "x", "/api/song-registry/audio/song-trip"]);
  const text = JSON.stringify([store.get(session.id), view, joined.session]);
  assert.ok(!text.includes(invite.code) && !/tokenHash|"hash"|invites"/.test(text), "no codes, tokens or hashes in any view");
  store.join({ sessionId: session.id, invite: invite.code, name: "Ana" });
  assert.throws(() => store.join({ sessionId: session.id, invite: invite.code, name: "Third" }), (e) => e.statusCode === 403, "uses run out");
  assert.throws(() => store.join({ sessionId: session.id, invite: invite.code.replace(/.$/, "A") === invite.code ? "x" : invite.code.replace(/.$/, "A"), name: "X" }), (e) => e.code === "guest_invite_invalid");
  assert.throws(() => store.guestSession("not-a-token"), (e) => e.statusCode === 401);
});

test("invites expire, bad codes are rate limited, revocation is immediate", () => {
  const { store, session, tick } = setup();
  const invite = store.createInvite(session.id, { ttlMinutes: 1 });
  tick(61_000);
  assert.throws(() => store.join({ sessionId: session.id, invite: invite.code, name: "Late" }), (e) => e.statusCode === 403);
  for (let i = 0; i < 19; i++) assert.throws(() => store.join({ sessionId: session.id, invite: `wrong-${i}`, name: "x" }), (e) => e.statusCode === 403);
  assert.throws(() => store.join({ sessionId: session.id, invite: "wrong", name: "x" }), (e) => e.statusCode === 429);
  tick(61_000);
  const fresh = store.createInvite(session.id);
  const guest = store.join({ sessionId: session.id, invite: fresh.code, name: "Kai" });
  assert.throws(() => store.join({ sessionId: session.id, invite: fresh.code, name: "  " }), (e) => e.code === "guest_name_required");
  store.revokeGuest(session.id, guest.guestId);
  assert.throws(() => store.guestSession(guest.guestToken), (e) => e.statusCode === 401);
});

test("only the guest holding control drives play; the owner takes it back", () => {
  const { store, session, tick } = setup();
  const { guestToken, guestId } = store.join({ sessionId: session.id, invite: store.createInvite(session.id).code, name: "Rae" });
  assert.throws(() => store.guestControl(guestToken, { baseRevision: store.get(session.id).revision, state: "paused" }), (e) => e.code === "guest_not_controller");
  tick(5000);
  const handed = store.setController(session.id, guestId);
  assert.equal(handed.controller, guestId);
  assert.equal(Math.round(handed.positionSeconds), 15, "hand-off freezes the shared position");
  const paused = store.guestControl(guestToken, { baseRevision: handed.revision, state: "paused", positionSeconds: 20 });
  assert.deepEqual([paused.state, paused.positionSeconds], ["paused", 20]);
  const ignored = store.update(session.id, { baseRevision: paused.revision, state: "playing", positionSeconds: 99 });
  assert.equal(ignored.state, "paused", "the owner's play state waits while a guest has control");
  assert.throws(() => store.setController(session.id, "someone-else"), (e) => e.statusCode === 422);
  const back = store.setController(session.id, "owner");
  assert.equal(store.update(session.id, { baseRevision: back.revision, state: "playing", positionSeconds: 30 }).state, "playing");
  store.revokeGuest(session.id, guestId);
  assert.equal(store.get(session.id).controller, "owner");
});

test("reactions are limited to a short list and one every half second", () => {
  const { store, session, tick } = setup();
  const { guestToken } = store.join({ sessionId: session.id, invite: store.createInvite(session.id).code, name: "Jo" });
  assert.equal(store.react(guestToken, "heart").reactions.at(-1).kind, "heart");
  assert.throws(() => store.react(guestToken, "spark"), (e) => e.statusCode === 429);
  tick(600);
  assert.throws(() => store.react(guestToken, "<script>"), (e) => e.statusCode === 422);
  for (let i = 0; i < 60; i++) { tick(600); store.react(guestToken, "clap"); }
  assert.equal(store.get(session.id).reactions.length, 50, "a bounded feed");
});

test("guest routes need no admin but do need an invite or token; owner routes stay admin-only", async () => {
  const { store, session } = setup();
  const call = async (handler, method, path, body, headers = {}, admin = false) => {
    let sent = null;
    await handler({ req: { method, headers }, res: {}, url: new URL(`http://127.0.0.1:8792${path}`), store, requireAdmin: (req, res) => admin, readBody: async () => structuredClone(body), sendJson: (res, status, payload) => { sent = { status, payload }; } });
    return sent;
  };
  assert.equal(await call(handleScoreDustSessions, "POST", `/api/echos/score-dust/sessions/${session.id}/invites`, {}, {}, false), null, "no admin → the admin gate answers");
  const invite = (await call(handleScoreDustSessions, "POST", `/api/echos/score-dust/sessions/${session.id}/invites`, { maxUses: 1 }, {}, true)).payload.invite;
  const joined = await call(handleScoreDustGuests, "POST", "/api/echos/score-dust/guest/join", { sessionId: session.id, invite: invite.code, name: "Lee" });
  assert.equal(joined.status, 201);
  assert.ok(joined.payload.clock.serverReceiveMs, "room clock on every guest response");
  const auth = { authorization: `Bearer ${joined.payload.guestToken}` };
  assert.equal((await call(handleScoreDustGuests, "GET", "/api/echos/score-dust/guest/session", null, auth)).payload.session.you.name, "Lee");
  assert.equal((await call(handleScoreDustGuests, "GET", "/api/echos/score-dust/guest/session", null, {})).status, 401);
  assert.equal((await call(handleScoreDustGuests, "POST", "/api/echos/score-dust/guest/reactions", { kind: "fire" }, auth)).status, 201);
  assert.equal(await handleScoreDustGuests({ req: { method: "GET", headers: {} }, res: {}, url: new URL("http://x/api/echos/score-dust/guest-origin"), store, readBody: async () => ({}), sendJson: () => {} }), false, "sibling routes are not swallowed");
  const guests = await call(handleScoreDustSessions, "GET", `/api/echos/score-dust/sessions/${session.id}/guests`, null, {}, true);
  assert.equal(guests.payload.guests[0].name, "Lee");
});
