import assert from "node:assert/strict";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

async function waitFor(url, child, output) {
  for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`API did not start: ${output.join("").slice(-3000)}`);
}

test("trusted loopback UI uses an opaque process session while external API auth remains bearer-only", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "avatar-local-ui-session-"));
  const port = 19700 + Math.floor(Math.random() * 200);
  const api = `http://127.0.0.1:${port}`;
  const vitePort = port + 500;
  const viteOrigin = `http://127.0.0.1:${vitePort}`;
  const output = [];
  const stores = {
    avatar: path.join(root, "avatars.json"),
    scene: path.join(root, "scenes.json"),
    item: path.join(root, "items.json"),
  };
  await Promise.all([
    fsp.writeFile(stores.avatar, JSON.stringify({ schemaVersion: "hapa.avatar-store.v1", avatars: [], teams: [] })),
    fsp.writeFile(stores.scene, JSON.stringify({ schemaVersion: "hapa.scene-graph.v1", places: [], scenes: [], timelines: [] })),
    fsp.writeFile(stores.item, JSON.stringify({ schemaVersion: "hapa.item-manager-store.v1", cards: [], agents: [], auditRuns: [], audit: {} })),
  ]);
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "0.0.0.0", "--port", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_ADMIN_TOKEN: "external-admin-token",
      HAPA_AVATAR_TRUST_LOCAL_UI: "1",
      HAPA_AVATAR_ALLOWED_ORIGINS: viteOrigin,
      HAPA_AVATAR_STORE: stores.avatar,
      HAPA_SCENE_STORE: stores.scene,
      HAPA_ITEM_STORE: stores.item,
      HAPA_SONG_CARD_MINT_ROOT: path.join(root, "song-card-mints"),
      HAPA_AVATAR_OVERWIND_OUTBOX: path.join(root, "overwind", "outbox.sqlite3"),
      HAPA_OVERWIND_DIR: path.join(root, "overwind"),
      HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    await fsp.rm(root, { recursive: true, force: true });
  });

  await waitFor(`${api}/api/health`, child, output);
  const protectedUrl = `${api}/api/song-card-remints`;

  assert.equal((await fetch(protectedUrl)).status, 401, "an external tokenless API call must stay unauthorized");
  assert.equal((await fetch(protectedUrl, { headers: { authorization: "Bearer external-admin-token" } })).status, 200, "external Bearer auth must remain supported");
  assert.equal((await fetch(`${api}/api/local-ui-session`, { method: "POST" })).status, 403, "a non-browser caller cannot bootstrap without a trusted UI origin");
  assert.equal((await fetch(`${api}/api/local-ui-session`, { method: "POST", headers: { origin: "https://evil.example" } })).status, 403, "a foreign browser origin cannot bootstrap");

  const bootstrap = await fetch(`${api}/api/local-ui-session`, {
    method: "POST",
    headers: { origin: api, "sec-fetch-site": "same-origin" },
  });
  assert.equal(bootstrap.status, 201);
  const payloadText = await bootstrap.text();
  const cookie = bootstrap.headers.get("set-cookie") || "";
  assert.match(cookie, new RegExp(`^hapa_avatar_local_session_${port}=[A-Za-z0-9_-]+;`));
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  const cookiePair = cookie.split(";", 1)[0];
  const opaqueSecret = cookiePair.split("=")[1];
  assert.ok(opaqueSecret.length >= 40);
  assert.equal(payloadText.includes(opaqueSecret), false, "the renderer-visible response must not expose the session secret");
  assert.deepEqual(JSON.parse(payloadText), {
    schemaVersion: "hapa.avatar-builder.local-ui-session.v1",
    ok: true,
    authMode: "trusted-local-ui",
    processScoped: true,
  });

  const localUiResponse = await fetch(protectedUrl, {
    headers: { cookie: cookiePair, origin: api, "sec-fetch-site": "same-origin" },
  });
  assert.equal(localUiResponse.status, 200, "the HttpOnly loopback session authorizes the trusted Builder UI");
  assert.equal((await fetch(protectedUrl, { headers: { cookie: cookiePair, origin: api, "sec-fetch-site": "cross-site" } })).status, 401, "cross-site fetch metadata invalidates the local UI session");
  assert.equal((await fetch(protectedUrl, { headers: { cookie: cookiePair, origin: "https://evil.example" } })).status, 403, "CORS still rejects a foreign origin before local session auth");
  assert.equal((await fetch(protectedUrl, { headers: { cookie: `hapa_avatar_local_session_${port}=wrong`, origin: api } })).status, 401);

  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: vitePort,
      strictPort: true,
      proxy: { "/api": { target: api, changeOrigin: true } },
    },
  });
  await vite.listen();
  t.after(() => vite.close());
  const proxiedBootstrap = await fetch(`${viteOrigin}/api/local-ui-session`, {
    method: "POST",
    headers: { origin: viteOrigin, "sec-fetch-site": "same-origin" },
  });
  assert.equal(proxiedBootstrap.status, 201);
  assert.match(proxiedBootstrap.headers.get("set-cookie") || "", new RegExp(`^hapa_avatar_local_session_${port}=[A-Za-z0-9_-]+;`), "Vite must forward the opaque Set-Cookie header to the dev UI origin");
});
