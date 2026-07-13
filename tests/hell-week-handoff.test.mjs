import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Hypercore from "hypercore";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 19047;
const BASE = `http://127.0.0.1:${PORT}`;

test("Hell Week handoff preserves ownership, incremental state, feedback, and stream cleanup", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "hapa-hell-week-handoff-"));
  const dbPath = path.join(temp, "persistence.db");
  const storePath = path.join(temp, "avatar-store.json");
  const mediaDir = path.join(temp, "media");
  const subscriberDir = path.join(temp, "subscribers");
  const overwindDir = path.join(temp, "overwind");
  const videoPath = path.join(temp, "fixture-loop.mp4");
  const hypercoreDir = path.join(temp, "hypercore-storage");
  const child = spawn(process.execPath, ["server/api.mjs", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HAPA_DEV_PROTO_DB: dbPath,
      HAPA_DEV_PROTO_HYPERCORE_DIR: hypercoreDir,
      HAPA_AVATAR_STORE: storePath,
      HAPA_MEDIA_DIR: mediaDir,
      HAPA_SUBSCRIBER_DIR: subscriberDir,
      HAPA_OVERWIND_DIR: overwindDir,
      HAPA_AVATAR_PROCESS_OWNER: "contract-test"
    }
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await writeFile(storePath, `${JSON.stringify({
      schemaVersion: "hapa.avatar-store.v1",
      avatars: [{ id: "canonical-avatar", primaryName: "Canonical Avatar", names: [{ name: "Canonical Avatar" }], slots: [], assets: [] }],
      teams: [],
      updatedAt: "2026-07-09T00:00:00.000Z"
    }, null, 2)}\n`);
    await writeLargeFixture(videoPath, 12 * 1024 * 1024);
    createFixtureDatabase(dbPath, videoPath);
    await createFixtureHypercore(hypercoreDir);
    await waitForHealth(child);

    const health = await fetchJson(`${BASE}/api/health`);
    assert.equal(health.response.status, 200);
    assert.equal(health.body.runtime.processOwner, "contract-test");
    assert.match(health.body.runtime.buildSignature, /^[a-f0-9]{16}$/);

    const envelope = await fetchJson(`${BASE}/api/hell-week/cards?envelope=1`);
    assert.equal(envelope.response.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.schemaVersion, "hapa.hell-week-handoff.v1");
    assert.equal(envelope.body.cards.length, 2);
    assert.equal(envelope.body.tombstones.length, 1);
    const firstCard = envelope.body.cards.find((card) => card.id === "card-1");
    assert.ok(firstCard, "expected card-1 projection");
    assert.equal(firstCard.handoff.schemaVersion, "hapa.card-envelope.v1");
    assert.equal(firstCard.projection.readOnly, true);
    assert.ok(firstCard.assets.some((asset) => asset.type === "video"), "child video should be attached to the projection");
    const firstCardDetail = await fetchJson(`${BASE}/api/hell-week/cards/card-1`);
    assert.equal(firstCardDetail.response.status, 200);
    assert.equal(firstCardDetail.body.three_paragraph_background_narrative.origin, "First lore continues beyond the compact SQLite projection.");
    assert.equal(firstCardDetail.body.handoff.source.narrativeHydratedFrom, "hypercore");

    const incremental = await fetchJson(`${BASE}/api/hell-week/sync?cursor=${encodeURIComponent("2026-07-09T01:30:00.000Z")}`);
    assert.equal(incremental.response.status, 200);
    assert.deepEqual(incremental.body.cards.map((card) => card.id), ["card-2"]);
    assert.deepEqual(incremental.body.tombstones.map((entry) => entry.cardId), ["card-deleted"]);

    const canonical = await fetchJson(`${BASE}/api/avatars?mode=canonical`);
    const merged = await fetchJson(`${BASE}/api/avatars?mode=projected`);
    assert.equal(canonical.body.avatars.length, 1);
    assert.equal(merged.body.avatars.length, 3);
    assert.equal(merged.body.externalProjections.hellWeek.count, 2);

    const putMerged = await fetch(`${BASE}/api/avatars`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged.body)
    });
    assert.equal(putMerged.status, 200);
    const persisted = JSON.parse(await readFile(storePath, "utf8"));
    assert.deepEqual(persisted.avatars.map((avatar) => avatar.id), ["canonical-avatar"]);
    assert.equal(persisted.teams.some((team) => team.id === "hell-week-cards-team"), false);

    const rejectedMutation = await fetchJson(`${BASE}/api/avatars/card-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "card-1", primaryName: "Consumer overwrite" })
    });
    assert.equal(rejectedMutation.response.status, 409);
    assert.equal(rejectedMutation.body.error, "external_projection_read_only");

    const feedback = await fetchJson(`${BASE}/api/hell-week/cards/card-1/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Keep the source lineage and review this media suggestion.", tags: ["lineage", "media"] })
    });
    assert.equal(feedback.response.status, 201);
    assert.equal(feedback.body.event.sourceOwner, "hapa-dev-proto");
    const feedbackRows = (await readFile(path.join(subscriberDir, "hapa-dev-proto.ndjson"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(feedbackRows.length, 1);
    assert.equal(feedbackRows[0].truthStatus, "proposed_feedback_requires_source_owner_review");

    for (let index = 0; index < 40; index += 1) {
      await abortRangeRequest(`${BASE}/api/local-file?path=${encodeURIComponent(videoPath)}`);
    }
    await waitForActiveStreamsToDrain();
    const postAbortHealth = await fetchJson(`${BASE}/api/health`);
    assert.equal(postAbortHealth.body.runtime.fileStreams.active, 0);
    assert.ok(postAbortHealth.body.runtime.fileStreams.aborted > 0);

    const movedDb = `${dbPath}.gone`;
    await rename(dbPath, movedDb);
    const degraded = await fetchJson(`${BASE}/api/hell-week/cards?envelope=1&refresh=1`);
    assert.equal(degraded.response.status, 503);
    assert.equal(degraded.body.ok, false);
    assert.equal(degraded.body.error.dependency, "hapa-dev-proto-sqlite");
    assert.equal(degraded.body.counts.lastKnownCards, 2);
    await rename(movedDb, dbPath);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    await rm(temp, { recursive: true, force: true });
  }

  assert.equal(stderr.includes("SyntaxError"), false, stderr);
});

function createFixtureDatabase(dbPath, videoPath) {
  const sql = `
    CREATE TABLE cards (
      id TEXT PRIMARY KEY,
      core_name TEXT,
      parent_id TEXT,
      name TEXT,
      media_local_path TEXT,
      thumbnail TEXT,
      created_at TEXT,
      updated_at TEXT,
      lore TEXT,
      content_text TEXT,
      metadata_json TEXT,
      media_kind TEXT,
      hellweek_run_id TEXT,
      is_deleted INTEGER DEFAULT 0
    );
    INSERT INTO cards VALUES (
      'card-1', 'hell-week-card-card-1', NULL, 'First Forge', NULL, NULL,
      '2026-07-09T01:00:00.000Z', '2026-07-09T01:00:00.000Z',
      'First lore', 'First content',
      '{"skills":[{"name":"Trace","description":"Preserve lineage","type":"Passive"}]}',
      'card', 'run-1', 0
    );
    INSERT INTO cards VALUES (
      'card-1-video', 'card-1-video', 'card-1', 'First Forge Loop', '${sqlQuote(videoPath)}', NULL,
      '2026-07-09T01:05:00.000Z', '2026-07-09T01:05:00.000Z',
      '', '', '{}', 'video', NULL, 0
    );
    INSERT INTO cards VALUES (
      'card-2', 'hell-week-card-card-2', NULL, 'Second Forge', NULL, NULL,
      '2026-07-09T02:00:00.000Z', '2026-07-09T02:00:00.000Z',
      'Second lore', 'Second content', '{}', 'card', 'run-2', 0
    );
    INSERT INTO cards VALUES (
      'card-deleted', 'hell-week-card-card-deleted', NULL, 'Deleted Forge', NULL, NULL,
      '2026-07-09T02:30:00.000Z', '2026-07-09T03:00:00.000Z',
      '', '', '{}', 'card', 'run-2', 1
    );
  `;
  execFileSync("/usr/bin/sqlite3", [dbPath, sql], { encoding: "utf8" });
}

async function createFixtureHypercore(hypercoreDir) {
  const core = new Hypercore(path.join(hypercoreDir, "hell-week-card-card-1"));
  await core.ready();
  await core.append(Buffer.from(JSON.stringify({
    type: "card-state",
    card: {
      cardId: "card-1",
      cardData: {
        lore: "First lore continues beyond the compact SQLite projection."
      }
    }
  })));
  await core.close();
}

function sqlQuote(value) {
  return String(value).replaceAll("'", "''");
}

async function writeLargeFixture(filePath, bytes) {
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    stream.on("error", reject);
    stream.on("finish", resolve);
    const chunk = Buffer.alloc(256 * 1024, 7);
    for (let written = 0; written < bytes; written += chunk.length) stream.write(chunk);
    stream.end();
  });
}

async function waitForHealth(child) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    if (child.exitCode !== null) throw new Error(`server exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry until the child binds.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Hell Week fixture server did not become healthy");
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  return { response, body: await response.json() };
}

async function abortRangeRequest(url) {
  await new Promise((resolve) => {
    const request = http.get(url, { headers: { Range: "bytes=0-12582911" } }, (response) => {
      response.once("data", () => {
        response.destroy();
        resolve();
      });
      response.once("error", () => resolve());
    });
    request.once("error", () => resolve());
  });
}

async function waitForActiveStreamsToDrain() {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const health = await fetchJson(`${BASE}/api/health`);
    if (health.body.runtime.fileStreams.active === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("file streams did not drain after aborted requests");
}
