import assert from "node:assert/strict";
import { once } from "node:events";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

async function waitForPhoneInfo(api, child, output) {
  for (let attempt = 0; attempt < 160 && child.exitCode === null; attempt += 1) {
    try {
      const response = await fetch(`${api}/api/phone-bridge/info?session=bootstrap-proof`);
      if (response.ok) {
        const payload = await response.json();
        if (payload.httpsEnabled) return payload;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`secure Phone Bridge did not start: ${output.join("").slice(-3000)}`);
}

test("Phone Card QR bootstraps certificate trust over reachable HTTP before secure handoff", async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "avatar-phone-bootstrap-"));
  const port = 20300 + Math.floor(Math.random() * 180);
  const httpsPort = port + 300;
  const api = `http://127.0.0.1:${port}`;
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
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(port), "--https-port", String(httpsPort), "--https-host", "127.0.0.1", "--static", "dist"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HAPA_AVATAR_PUBLIC_HOST: "127.0.0.1",
      HAPA_AVATAR_PUBLIC_PORT: String(port),
      HAPA_AVATAR_PUBLIC_HTTPS_PORT: String(httpsPort),
      HAPA_AVATAR_HTTPS_CERT_DIR: path.join(root, "certs"),
      HAPA_AVATAR_STORE: stores.avatar,
      HAPA_SCENE_STORE: stores.scene,
      HAPA_ITEM_STORE: stores.item,
      HAPA_SONG_CARD_MINT_ROOT: path.join(root, "song-card-mints"),
      HAPA_SONG_CARD_EXPORT_ROOT: path.join(root, "song-card-exports"),
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

  const info = await waitForPhoneInfo(api, child, output);
  assert.equal(info.setupRequired, true);
  assert.equal(info.mobileUrl, `${api}/phone-card/setup?session=bootstrap-proof`);
  assert.equal(info.setupUrl, info.mobileUrl);
  assert.equal(info.secureMobileUrl, `https://127.0.0.1:${httpsPort}/phone-card?session=bootstrap-proof`);
  assert.equal(info.certificateUrl, `${api}/api/phone-bridge/ca.crt`);
  assert.equal(info.secureContextLikely, true);

  const setupResponse = await fetch(info.mobileUrl);
  const setupHtml = await setupResponse.text();
  assert.equal(setupResponse.status, 200);
  assert.match(setupResponse.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(setupHtml, /Download Hapa certificate/);
  assert.match(setupHtml, /Certificate Trust Settings/);
  assert.match(setupHtml, new RegExp(info.certificateUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(setupHtml, new RegExp(info.secureMobileUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const certificateResponse = await fetch(info.certificateUrl);
  assert.equal(certificateResponse.status, 200);
  assert.match(certificateResponse.headers.get("content-type") || "", /x-x509-ca-cert/);
});
