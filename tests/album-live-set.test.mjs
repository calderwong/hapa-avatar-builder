import test from "node:test";
import assert from "node:assert/strict";
import { advanceLiveSet, createAlbumLiveSet, liveSetState, recoverLiveSet } from "../src/domain/album-live-set.js";
const set = createAlbumLiveSet({ entries: ["a", "b", "c"].map((songId) => ({ songId, variantId: "v", graphRef: `${songId}.json`, durationSeconds: 60 })) });
test("setlist pins variants, prewarms only next, and transitions without black", () => { const state = liveSetState(set); const next = advanceLiveSet(set, state); assert.equal(state.residentPayloadIds.length, 2); assert.equal(state.prewarmed.songId, "b"); assert.equal(next.transitionReceipt.blackFrames, 0); assert.equal(next.current.variantId, "v"); });
test("audience hides diagnostics, operator exposes health, and recovery is bounded", () => { assert.equal(set.modes.audience.diagnostics, false); assert.equal(set.modes.operator.diagnostics, true); const recovered = recoverLiveSet(set, { ...liveSetState(set), mode: "audience", recoveryCount: 0 }); assert.equal(recovered.mode, "operator"); assert.equal(recovered.residentPayloadIds.length, 2); assert.equal(recovered.recoveryCount, 1); });
