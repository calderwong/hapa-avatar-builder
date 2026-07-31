import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { buildEchoRecordVisualSurfaces } from "../src/domain/echo-record-garden.js";

const require = createRequire(import.meta.url);
const {
  RECORD_GARDEN_E2E_ORIGIN,
  RECORD_GARDEN_E2E_SCHEME,
  createRecordGardenFixtureDataset,
  createRecordGardenFixtureState,
  detailProject,
  fixtureReferences,
  routeRecordGardenFixtureApi,
} = require("../scripts/lib/record-garden-offline-fixtures.cjs");

function payload(result) {
  return JSON.parse(result.body);
}

test("offline Record Garden fixture recovers catalog and project requests deterministically", () => {
  const dataset = createRecordGardenFixtureDataset();
  const state = createRecordGardenFixtureState();
  const catalogUrl = `${RECORD_GARDEN_E2E_ORIGIN}/api/echos/director-projects?summary=1`;
  const recoveryUrl = `${RECORD_GARDEN_E2E_ORIGIN}/api/echos/director-project?songId=garden-recovery`;

  assert.equal(routeRecordGardenFixtureApi(catalogUrl, { dataset, state }).status, 503);
  const catalog = routeRecordGardenFixtureApi(catalogUrl, { dataset, state });
  assert.equal(catalog.status, 200);
  assert.equal(payload(catalog).projects.length, 8);

  assert.equal(routeRecordGardenFixtureApi(recoveryUrl, { dataset, state }).status, 503);
  const recovery = routeRecordGardenFixtureApi(recoveryUrl, { dataset, state });
  assert.equal(recovery.status, 200);
  assert.equal(payload(recovery).music_video_project.song_id, "garden-recovery");
  assert.equal(payload(recovery).music_video_project.timeline.length, 4);
});

test("offline fixture drives the real 12-surface family and paging contract", () => {
  const dataset = createRecordGardenFixtureDataset();
  const surfaces = buildEchoRecordVisualSurfaces({
    project: detailProject("garden-main"),
    referenceCards: fixtureReferences("garden-main"),
    avatars: [dataset.avatar],
    sceneGraph: dataset.world,
    clockSeconds: 1,
    limit: 12,
    apiBase: RECORD_GARDEN_E2E_ORIGIN,
  });
  const families = new Set(surfaces.map((surface) => surface.role));
  const pages = Array.from({ length: Math.ceil(surfaces.length / 3) }, (_, page) => (
    surfaces.slice(page * 3, page * 3 + 3)
  ));

  assert.equal(surfaces.length, 12);
  assert.equal(pages.length, 4);
  assert.ok(pages.every((page) => page.length === 3));
  for (const family of ["now-playing", "up-next", "character", "reference", "scene"]) {
    assert.ok(families.has(family), `Expected surface family ${family}`);
  }
  assert.ok(surfaces.some((surface) => (
    surface.media?.uri?.includes("intentionally-missing.webm")
  )));
});

test("fixture and verifier remain pure Node contracts without a browser or listener", async () => {
  const fixturePath = fileURLToPath(new URL("../scripts/lib/record-garden-offline-fixtures.cjs", import.meta.url));
  const verifierPath = fileURLToPath(new URL("../scripts/verify-record-garden-offline-contract.mjs", import.meta.url));
  const source = `${await fsp.readFile(fixturePath, "utf8")}\n${await fsp.readFile(verifierPath, "utf8")}`;

  assert.equal(RECORD_GARDEN_E2E_SCHEME, "hapa-record-e2e");
  assert.doesNotMatch(
    source,
    /\b(?:require\s*\(\s*["']electron["']\s*\)|from\s+["']electron["'])/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:require\s*\(\s*["']node:http["']\s*\)|from\s+["']node:http["']|createServer\s*\(|\.listen\s*\()/,
  );
  assert.doesNotMatch(
    source,
    /\b(?:require\s*\(\s*["'](?:playwright|puppeteer|chrome-remote-interface)["']\s*\)|from\s+["'](?:playwright|puppeteer|chrome-remote-interface)["'])/,
  );
});
