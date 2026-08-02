import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { preflightCurrentEnrichmentDirectorBatch } from "../scripts/preflight-enrichment-director-variants.mjs";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

test("enrichment Director preflight rejects report-controlled path traversal", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-enrichment-preflight-path-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const projectsRoot = path.join(root, "data/music-video-projects");
  fs.mkdirSync(projectsRoot, { recursive: true });

  for (const fixture of [
    { songId: "../escaped-song", variantId: "cut" },
    { songId: "safe-song", variantId: "../../escaped-cut" },
    { songId: "safe-song", variantId: "/absolute-cut" },
    { songId: "safe-song", variantId: "%2e%2e" },
  ]) {
    writeJson(path.join(projectsRoot, "base-video-project.json"), { song_id: fixture.songId });
    const reportPath = path.join(root, "report.json");
    writeJson(reportPath, { variants: { cuts: [fixture] } });

    assert.throws(
      () => preflightCurrentEnrichmentDirectorBatch({ root, reportPath }),
      (error) => error instanceof TypeError && error.code === "ERR_ECHO_ENRICHMENT_UNSAFE_PATH",
      `${fixture.songId}/${fixture.variantId}`,
    );
  }
});

test("enrichment Director preflight rejects padded project song IDs without normalization", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-enrichment-preflight-project-id-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeJson(path.join(root, "data/music-video-projects/padded-video-project.json"), {
    song_id: " safe-song",
  });
  const reportPath = path.join(root, "report.json");
  writeJson(reportPath, { variants: { cuts: [{ songId: "safe-song", variantId: "safe-cut" }] } });

  assert.throws(
    () => preflightCurrentEnrichmentDirectorBatch({ root, reportPath }),
    (error) => error instanceof TypeError && error.code === "ERR_ECHO_ENRICHMENT_UNSAFE_PATH",
  );
});

test("enrichment Director preflight rejects duplicate canonical project song IDs", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-enrichment-preflight-project-duplicate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const projectsRoot = path.join(root, "data/music-video-projects");
  writeJson(path.join(projectsRoot, "first-video-project.json"), { song_id: "safe-song" });
  writeJson(path.join(projectsRoot, "second-video-project.json"), { songId: "safe-song" });
  const reportPath = path.join(root, "report.json");
  writeJson(reportPath, { variants: { cuts: [{ songId: "safe-song", variantId: "safe-cut" }] } });

  assert.throws(
    () => preflightCurrentEnrichmentDirectorBatch({ root, reportPath }),
    /Duplicate canonical Echo project song ID: safe-song\./u,
  );
});
