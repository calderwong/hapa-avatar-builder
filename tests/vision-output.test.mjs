import test from "node:test";
import assert from "node:assert/strict";
import { parseVisionToolOutput } from "../src/domain/vision-output.js";

test("parses the current pretty-printed JSON array contract", () => {
  const output = JSON.stringify([{ path: "a.jpg", labels: [] }, { path: "b.jpg", labels: [] }], null, 2);
  assert.deepEqual(parseVisionToolOutput(output).map((item) => item.path), ["a.jpg", "b.jpg"]);
});

test("keeps compatibility with the historical JSONL contract", () => {
  const output = '{"path":"a.jpg"}\n{"path":"b.jpg"}\n';
  assert.deepEqual(parseVisionToolOutput(output).map((item) => item.path), ["a.jpg", "b.jpg"]);
});
