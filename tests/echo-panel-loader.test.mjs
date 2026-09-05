import test from "node:test";
import assert from "node:assert/strict";
import { createEchoPanelLoader } from "../src/domain/echo-panel-loader.js";

const response = data => ({ ok: true, json: async () => data });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("hung optional panels cannot delay songs and emit progress within configured deadline", async () => {
  const wait = deferred(); const values = [], statuses = [];
  const loader = createEchoPanelLoader({ slowMs: 10, timeoutMs: 1000, onStatus: (key, state) => statuses.push([key, state.state]), fetchImpl: url => url === "board" ? wait.promise : Promise.resolve(response(["song"])) });
  const board = loader.load("board", "board", data => values.push(data));
  await loader.load("catalog", "songs", data => values.push(data));
  assert.deepEqual(values, [["song"]]);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(statuses.some(([key, state]) => key === "board" && state === "slow"));
  wait.resolve(response({ board: true })); await board; loader.dispose();
});

test("superseded and route-exit responses cannot overwrite current data even if abort is ignored", async () => {
  const waits = [deferred(), deferred(), deferred()]; let count = 0; const signals = [], values = [];
  const loader = createEchoPanelLoader({ fetchImpl: (_url, init) => { signals.push(init.signal); return waits[count++].promise; } });
  const old = loader.load("catalog", "old", data => values.push(data));
  const fresh = loader.load("catalog", "fresh", data => values.push(data));
  assert.equal(signals[0].aborted, true);
  waits[1].resolve(response("fresh")); await fresh;
  waits[0].resolve(response("old")); await old;
  assert.deepEqual(values, ["fresh"]);
  const exit = loader.load("gaps", "exit", data => values.push(data)); loader.dispose();
  waits[2].resolve(response("late")); await exit;
  assert.equal(signals[2].aborted, true);
  assert.deepEqual(values, ["fresh"]);
});

test("HTTP failure and timeout stay retryable; late responses do not erase timeout errors", async () => {
  const statuses = []; const wait = deferred(); let delivered = false;
  const loader = createEchoPanelLoader({ slowMs: 5, timeoutMs: 10, onStatus: (_key, state) => statuses.push(state.state), fetchImpl: url => url === "bad" ? Promise.resolve({ ok: false, status: 503 }) : wait.promise });
  await loader.load("board", "bad", () => {});
  assert.equal(statuses.at(-1), "error");
  const pending = loader.load("catalog", "slow", () => { delivered = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(statuses.at(-1), "error");
  wait.resolve(response("too late")); await pending;
  assert.equal(delivered, false); assert.equal(statuses.at(-1), "error"); loader.dispose();
});
