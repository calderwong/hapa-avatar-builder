import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Bella enrichment retains the full multichannel reference set", () => {
  const result = spawnSync(process.execPath, ["scripts/enrich-echo-hidden-reference-graph.mjs"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const bella = report.songReferenceCoverage["dear-papa-song-i-knew-a-bella"];
  assert.equal(bella.connectorCount, 16);
  assert.deepEqual(bella.referenceIds, [
    "bella-ciao-resistance-song",
    "billy-squier-song-cluster",
    "born-free-elsa",
    "bungie-halo-canon",
    "dungeons-dragons-natural-twenty",
    "eminem-cinderella-man",
    "gi-jane-film",
    "heinlein-starship-troopers",
    "hoyoverse-genshin-gnosis-wish",
    "journey-to-the-west-sun-wukong",
    "pi-kappa-alpha-fraternity",
    "pussycat-dolls-dont-cha",
    "steppenwolf-born-to-be-wild",
    "tarzan-jane",
    "uw-huskies-bow-down"
  ]);
  assert.equal(new Set(bella.connectorIds).size, bella.connectorIds.length);
  assert.equal(report.mode, "dry-run");
});
