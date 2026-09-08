import test from "node:test";
import assert from "node:assert/strict";
import { admitMergedAccentEvents, buildAccentEventTrack, createAccentOverrideReceipt, SAFE_ACCENT_LIMITS, validateAccentEventTrack } from "../src/domain/accent-event-track.js";

const cues = Array.from({ length: 20 }, (_, index) => ({
  id: `cue:${index}`,
  approved: true,
  atSeconds: index * 0.2,
  kind: "stem_onset",
  eligibleActions: ["accent", "effect"],
  evidence: { stemRole: index % 2 ? "drums" : "bass", onset: 0.8 },
}));

test("safe accent tracks are sparse, cue/stem-addressed, and layer-targeted", () => {
  const track = buildAccentEventTrack({ cues, density: 1, durationSeconds: 4 });
  assert.ok(validateAccentEventTrack(track).ok);
  assert.ok(track.events.every((event) => event.cueId && event.source.stemRole && event.target.scope === "single-layer"));
  assert.ok(track.events.every((event) => event.safety.flashHz <= SAFE_ACCENT_LIMITS.maxFlashHz));
  assert.ok(track.events.every((event) => event.safety.luminanceDelta <= SAFE_ACCENT_LIMITS.maxLuminanceDelta));
  assert.ok(track.events.every((event) => event.safety.frameArea <= SAFE_ACCENT_LIMITS.maxFrameArea));
});

test("reduced motion removes reversals, shutters, flicker, and glitch", () => {
  const track = buildAccentEventTrack({ cues, density: 1, durationSeconds: 4, reducedMotion: true });
  assert.ok(track.events.every((event) => !["glitch", "shutter", "flicker"].includes(event.kind)));
  assert.ok(track.events.every((event) => event.safety.flashCount === 0));
  assert.ok(validateAccentEventTrack(track).ok);
});

test("strong treatments require an explicit operator override receipt", () => {
  const track = buildAccentEventTrack({ cues: cues.slice(0, 1), density: 1, durationSeconds: 1 });
  track.events[0].safety.luminanceDelta = 0.4;
  assert.equal(validateAccentEventTrack(track).ok, false);
  const receipt = createAccentOverrideReceipt({ operator: "Calder", reason: "Reviewed hook treatment", acknowledgedAt: "2026-07-11T07:24:00Z", eventIds: [track.events[0].id] });
  assert.ok(validateAccentEventTrack(track, { overrideReceipt: receipt }).ok);
});

test("section budgets cross boundaries, honor zero density and prefer distinct musical gestures", () => {
  const sectionRows = [{ id: "chorus", type: "chorus", energy: .9, startSeconds: 0, endSeconds: 8 }, { id: "quiet", type: "outro", energy: .1, startSeconds: 8, endSeconds: 24 }];
  const cue = (id, atSeconds, kind) => ({ id, atSeconds, kind, approved: true, eligibleActions: ["accent"], source: "fixture-events", confidence: .7, evidence: { stemRole: "vocals", timingStatus: "unverified" } });
  const input = [...Array.from({length:80},(_,i)=>cue('onset-'+i,i*.2,'stem_onset')),cue('entry',2,'vocal-entry'),cue('downbeat',4,'downbeat'),cue('end',6,'phrase-end')];
  const track = buildAccentEventTrack({ cues: input, sections: sectionRows, density: 1, durationSeconds: 24 });
  assert.equal(buildAccentEventTrack({ cues: input, sections: sectionRows, density: 0 }).events.length, 0);
  const special = track.events.filter(e=>['entry','downbeat','end'].includes(e.cueId));
  assert.equal(special.length,3);
  assert.equal(new Set(special.map(e=>e.gestureRole)).size,3);
  assert.deepEqual(special.map(e=>e.target.layer),['lyric-layer','visualizer-layer','media-layer']);
  for (const event of track.events) {
    assert.ok(track.events.filter(other=>other.atSeconds<=event.atSeconds&&other.atSeconds>event.atSeconds-8).length<=event.sectionBudget.maxEvents);
    if(event.gestureRole!=='source-accent')assert.equal(event.safety.flashCount,0);
  }
  assert.deepEqual(buildAccentEventTrack({ cues: [...input].reverse(), sections: sectionRows, density: 1, durationSeconds: 24 }),track);
});

test('range recuts cannot refill a shared density window or displace locked source events', () => {
  const budget = { windowSeconds: 8, maxEvents: 2, minimumSeparationSeconds: .4 };
  const row = (id, atSeconds, locked = false) => ({ id, atSeconds, endSeconds: atSeconds + .18, locked, sectionBudget: budget });
  const protectedEvents = [row('outside-left', 0), row('locked-right', 7, true)];
  const before = JSON.stringify(protectedEvents);
  const result = admitMergedAccentEvents(protectedEvents, [row('new', 4), row('later', 9)]);
  assert.deepEqual(result.events.map(event => event.id), ['outside-left', 'locked-right', 'later']);
  assert.deepEqual(result.receipt.decisions[0].reasons, ['section-density']);
  assert.equal(JSON.stringify(protectedEvents), before);
  assert.deepEqual(admitMergedAccentEvents([...protectedEvents].reverse(), [row('later', 9), row('new', 4)]), result);
});

test('pre-existing locked excess is reported, preserved and does not block unrelated later work', () => {
  const budget = { windowSeconds: 8, maxEvents: 1, minimumSeparationSeconds: .4 };
  const row = (id, atSeconds) => ({ id, atSeconds, sectionBudget: budget });
  const original = [row('locked-a', 1), row('locked-b', 2)];
  const result = admitMergedAccentEvents(original, [row('nearby', 3), row('distant', 20)]);
  assert.deepEqual(result.events.map(event => event.id), ['locked-a', 'locked-b', 'distant']);
  assert.equal(result.receipt.preservedViolations.length, 1);
});
