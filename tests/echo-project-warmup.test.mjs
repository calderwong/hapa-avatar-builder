import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../server/api.mjs", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("saved Echo projects warm a certified execution graph after canonical compilation", () => {
  const warmup = between("function warmEchoDirectorProject", "function pumpEchoPreviewPreparationQueue");
  const compileRoute = between(
    'if (pathname === "/api/echos/director-project/compile"',
    'if (pathname === "/api/echos/direction-variant/fork"',
  );

  assert.match(warmup, /compileEchoDirectorProject\(songId\)\.then/);
  assert.match(warmup, /preflight-echo-render-readiness\.mjs/);
  assert.match(warmup, /`--project=\$\{projectPath\}`/);
  assert.match(warmup, /"--apply-stem-repairs=true"/);
  assert.match(warmup, /"--skip-mint-plans=true"/);
  assert.match(warmup, /echoDirectorShowGraphCache\.clear\(\)/);
  assert.match(compileRoute, /warmEchoDirectorProject\(body\.songId \|\| body\.song_id/);
  assert.doesNotMatch(compileRoute, /await compileEchoDirectorProject\(body\.songId/);
});

test("new and idempotently replayed direction cuts finish the same graph warm-up", () => {
  const fork = between("async function createEchoDirectionVariantFork", "async function readEchoDirectionScriptVariants");

  assert.match(fork, /existingRequestedChild[\s\S]*settleEchoDirectionCutWarmup\(songId, requestedId\)/);
  assert.match(fork, /echoDirectionVariantSummaryIndex\.invalidate\(songId\);[\s\S]*settleEchoDirectionCutWarmup\(songId, childId\)/);
  assert.equal((fork.match(/\bwarmup,/g) || []).length, 2);
  const settlement = between("async function settleEchoDirectionCutWarmup", "function pumpEchoPreviewPreparationQueue");
  assert.match(settlement, /await warmEchoDirectorProject\(songId, \{ variantId \}\)/);
  assert.match(settlement, /status: "blocked"/);
});
