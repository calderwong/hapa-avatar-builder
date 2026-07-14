import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PROJECTION_VERSION = "hapa.overwind.avatar-builder-bootstrap.v5.avatar-loadout-mind-spines";

async function waitFor(url, child, output) {
  for (let attempt = 0; attempt < 160 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API did not start: ${output.join("").slice(-3000)}`);
}

async function createFixture(t, { timeoutMs = 120_000, projection = null } = {}) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-hydration-api-"));
  const paths = {
    avatar: path.join(base, "avatar-store.json"),
    kanban: path.join(base, "kanban.json"),
    scene: path.join(base, "scene-store.json"),
    item: path.join(base, "item-store.json"),
    inventory: path.join(base, "inventory-store.json"),
    mint: path.join(base, "mint"),
    export: path.join(base, "export"),
    overwind: path.join(base, "overwind"),
  };
  await Promise.all([
    fsp.writeFile(paths.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [{ id: "avatar-card", schemaVersion: "hapa.avatar-card.v1", primaryName: "Canonical Full Avatar", assets: [], slots: [] }] })),
    fsp.writeFile(paths.kanban, JSON.stringify({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    fsp.writeFile(paths.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [{ id: "scene-card", schemaVersion: "hapa.scene.v1", title: "Canonical Scene", assets: [] }], timelines: [] })),
    fsp.writeFile(paths.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [{ id: "item-card", schemaVersion: "hapa.item-card.v1", title: "Canonical Item", assets: [] }] })),
    fsp.writeFile(paths.inventory, JSON.stringify({ schemaVersion: "hapa.inventory-store.v1", avatarInventories: [] })),
    fsp.mkdir(paths.mint, { recursive: true }),
    fsp.mkdir(paths.export, { recursive: true }),
    fsp.mkdir(paths.overwind, { recursive: true }),
  ]);

  if (projection) {
    const sourceFiles = [paths.avatar, paths.kanban, paths.scene, paths.item, paths.inventory];
    const files = await Promise.all(sourceFiles.map(async (filePath) => {
      const fileStat = await fsp.stat(filePath);
      return [path.resolve(filePath), fileStat.mtimeMs, fileStat.size];
    }));
    const sourceSignature = JSON.stringify({
      projectionVersion: PROJECTION_VERSION,
      selectedAvatarId: "",
      includeSelectedAvatar: false,
      files,
    });
    await fsp.writeFile(path.join(paths.overwind, "avatar-builder-bootstrap.json"), JSON.stringify({
      schemaVersion: "hapa.overwind.avatar-builder-bootstrap.v1",
      sourceSignature,
      avatars: projection.avatars || [],
      world: { scenes: projection.scenes || [] },
      items: { cards: projection.cards || [] },
    }));
  }

  const port = 20100 + Math.floor(Math.random() * 500);
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_ADMIN_TOKEN: "hydration-api-token",
      HAPA_AVATAR_STORE: paths.avatar,
      HAPA_KANBAN_STORE: paths.kanban,
      HAPA_SCENE_STORE: paths.scene,
      HAPA_ITEM_STORE: paths.item,
      HAPA_INVENTORY_STORE: paths.inventory,
      HAPA_SONG_CARD_MINT_ROOT: paths.mint,
      HAPA_SONG_CARD_EXPORT_ROOT: paths.export,
      HAPA_SONG_CARD_SOURCE_ROOTS: base,
      HAPA_OVERWIND_DIR: paths.overwind,
      HAPA_AVATAR_OVERWIND_OUTBOX: path.join(paths.overwind, "origin-outbox.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB: path.join(paths.overwind, "subscriber.sqlite3"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
      HAPA_OVERWIND_WARM_FULL: "0",
      HAPA_SONG_CARD_PLAN_TIMEOUT_MS: String(timeoutMs),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => {});
    }
    await fsp.rm(base, { recursive: true, force: true });
  });
  const api = `http://127.0.0.1:${port}`;
  await waitFor(`${api}/api/health`, child, output);
  return { api, paths, output };
}

function planBody(songId, mediaCards, cardSnapshots = {}) {
  return {
    project: { song_id: songId, song_title: songId, duration: 1 },
    showGraph: {
      song: { id: songId, title: songId, durationSeconds: 1 },
      tracks: [{ id: "media", role: "foundation", cards: mediaCards.map((media, index) => ({ id: `cue:${index}`, startSeconds: 0, endSeconds: 1, media })) }],
      directorV2: { treatmentId: `treatment:${songId}`, variantId: `variant:${songId}` },
    },
    cardSnapshots,
  };
}

async function requestPlan(api, songId, body) {
  return fetch(`${api}/api/song-cards/${encodeURIComponent(songId)}/plan`, {
    method: "POST",
    headers: { authorization: "Bearer hydration-api-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function storedPlan(paths, responsePayload) {
  const key = String(responsePayload.plan.planId).replace(/^plan:/u, "");
  return JSON.parse(await fsp.readFile(path.join(paths.mint, "plans", `${key}.json`), "utf8"));
}

test("Song Card hydration prefers the current signed compact projection without opening canonical stores", async (t) => {
  const fixture = await createFixture(t, {
    projection: {
      avatars: [{ id: "avatar-card", schemaVersion: "hapa.avatar-card.v1", primaryName: "Compact Signed Avatar", assets: [], slots: [], overwindProjection: "compact" }],
    },
  });
  const projectionPath = path.join(fixture.paths.overwind, "avatar-builder-bootstrap.json");
  const before = await fsp.stat(projectionPath);
  const response = await requestPlan(fixture.api, "projection-song", planBody("projection-song", [{
    id: "avatar-motion",
    cardId: "avatar-card",
    cardKind: "avatar",
    cardRef: "data/avatar-store.json#avatars/avatar-card",
  }]));
  assert.equal(response.status, 200);
  const plan = await storedPlan(fixture.paths, await response.json());
  const receipt = plan.input.context.constituentHydration;
  assert.equal(receipt.projection.status, "current");
  assert.equal(receipt.projection.regeneratedDuringRequest, false);
  assert.deepEqual(receipt.loadedStoreKinds, []);
  assert.equal(receipt.hydrated[0].resolutionSource, "current-overwind-projection");
  assert.equal(plan.input.cardSnapshots["avatar-card"].primaryName, "Compact Signed Avatar");
  const after = await fsp.stat(projectionPath);
  assert.equal(after.mtimeMs, before.mtimeMs, "planning must not regenerate the persisted projection");
});

test("Song Card hydration skips supplied snapshots and selectively resolves deduplicated canonical targets", async (t) => {
  const fixture = await createFixture(t);
  const embeddedResponse = await requestPlan(fixture.api, "embedded-song", planBody("embedded-song", [{
    id: "item-motion",
    cardId: "item-card",
    cardKind: "item",
    cardRef: "data/item-manager-store.json#cards/item-card",
  }], {
    "item-card": { id: "item-card", schemaVersion: "hapa.item-card.v1", title: "Already Frozen Item" },
  }));
  assert.equal(embeddedResponse.status, 200);
  const embeddedPlan = await storedPlan(fixture.paths, await embeddedResponse.json());
  const embeddedReceipt = embeddedPlan.input.context.constituentHydration;
  assert.equal(embeddedReceipt.projection.status, "not-needed");
  assert.deepEqual(embeddedReceipt.loadedStoreKinds, []);
  assert.equal(embeddedReceipt.suppliedCount, 1);
  assert.equal(embeddedPlan.input.cardSnapshots["item-card"].title, "Already Frozen Item");

  const aliases = ["avatar-alias-a", "avatar-alias-b"].map((cardId, index) => ({
    id: `avatar-motion:${index}`,
    cardId,
    cardKind: "avatar",
    cardRef: "data/avatar-store.json#avatars/avatar-card",
  }));
  const aliasResponse = await requestPlan(fixture.api, "alias-song", planBody("alias-song", aliases));
  assert.equal(aliasResponse.status, 200);
  const aliasPlan = await storedPlan(fixture.paths, await aliasResponse.json());
  const aliasReceipt = aliasPlan.input.context.constituentHydration;
  assert.equal(aliasReceipt.requestedCount, 2);
  assert.equal(aliasReceipt.canonicalTargetCount, 1);
  assert.equal(aliasReceipt.duplicateReferenceCount, 1);
  assert.deepEqual(aliasReceipt.loadedStoreKinds, ["avatar"]);
  assert.equal(aliasPlan.input.cardSnapshots["avatar-alias-a"].primaryName, "Canonical Full Avatar");
  assert.equal(aliasPlan.input.cardSnapshots["avatar-alias-b"].primaryName, "Canonical Full Avatar");
});

test("Song Card plan timeout stops an abandoned operation before controller planning persists work", async (t) => {
  const fixture = await createFixture(t, { timeoutMs: 1 });
  const response = await requestPlan(fixture.api, "timeout-song", {
    ...planBody("timeout-song", []),
    context: { padding: "x".repeat(512 * 1024) },
  });
  assert.equal(response.status, 408);
  assert.equal((await response.json()).error, "song_card_plan_timed_out");
  await new Promise((resolve) => setTimeout(resolve, 25));
  const planFiles = await fsp.readdir(path.join(fixture.paths.mint, "plans")).catch(() => []);
  assert.deepEqual(planFiles.filter((name) => name.endsWith(".json")), []);
});
