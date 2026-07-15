import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ECHO_READINESS_CERTIFICATION_LOCK_SCHEMA,
  acquireEchoReadinessCertificationLock,
} from "../scripts/preflight-echo-render-readiness.mjs";
import {
  SONG_CARD_MINT_LOCK_SCHEMA,
  SongCardMintLedger,
} from "../server/song-card-mint-ledger.mjs";

const STALE_MS = 1_000;

function lockMetadata(schemaVersion, { pid = process.pid, token = "a".repeat(64) } = {}) {
  return {
    schemaVersion,
    token,
    pid,
    createdAt: new Date().toISOString(),
  };
}

function writeLock(lockPath, content, { stale = false } = {}) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, content);
  if (stale) {
    const staleAt = new Date(Date.now() - (STALE_MS + 5_000));
    fs.utimesSync(lockPath, staleAt, staleAt);
  }
}

async function readinessFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-owned-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lockPath = path.join(root, "artifacts", "echo-render-readiness", ".certification.lock");
  return {
    kind: "readiness",
    schemaVersion: ECHO_READINESS_CERTIFICATION_LOCK_SCHEMA,
    lockPath,
    acquire: async () => acquireEchoReadinessCertificationLock({ avatarRoot: root, staleLegacyMs: STALE_MS }),
    release: async (release) => release(),
    assertBusy: async (operation) => assert.rejects(operation, /already running/u),
  };
}

async function ledgerFixture(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-mint-owned-lock-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const ledger = new SongCardMintLedger({ root, staleLockMs: STALE_MS, lockTimeoutMs: 35 });
  await ledger.initialize();
  const lockPath = path.join(root, ".locks", "audit.lock");
  return {
    kind: "mint-ledger",
    schemaVersion: SONG_CARD_MINT_LOCK_SCHEMA,
    lockPath,
    acquire: async () => ledger.acquireLock("audit"),
    release: async (release) => release(),
    assertBusy: async (operation) => assert.rejects(operation, (error) => error?.code === "LOCK_TIMEOUT"),
  };
}

const fixtures = [readinessFixture, ledgerFixture];

for (const fixture of fixtures) {
  test(`${fixture.name}: release preserves a successor lock`, async (t) => {
    const runtime = await fixture(t);
    const release = await runtime.acquire();
    const displaced = `${runtime.lockPath}.displaced`;
    fs.renameSync(runtime.lockPath, displaced);
    const successor = lockMetadata(runtime.schemaVersion, { token: "b".repeat(64) });
    writeLock(runtime.lockPath, `${JSON.stringify(successor)}\n`);

    await runtime.release(release);

    assert.equal(fs.existsSync(runtime.lockPath), true);
    assert.equal(JSON.parse(fs.readFileSync(runtime.lockPath, "utf8")).token, successor.token);
  });

  test(`${fixture.name}: a stale zero-byte legacy lock is recovered`, async (t) => {
    const runtime = await fixture(t);
    writeLock(runtime.lockPath, "", { stale: true });

    const release = await runtime.acquire();

    const owner = JSON.parse(fs.readFileSync(runtime.lockPath, "utf8"));
    assert.equal(owner.schemaVersion, runtime.schemaVersion);
    assert.equal(owner.pid, process.pid);
    assert.match(owner.token, /^[a-f0-9]{64}$/u);
    assert.equal(Number.isFinite(Date.parse(owner.createdAt)), true);
    await runtime.release(release);
  });

  test(`${fixture.name}: a fresh zero-byte lock blocks without being removed`, async (t) => {
    const runtime = await fixture(t);
    writeLock(runtime.lockPath, "");

    await runtime.assertBusy(() => runtime.acquire());

    assert.equal(fs.existsSync(runtime.lockPath), true);
    assert.equal(fs.statSync(runtime.lockPath).size, 0);
  });

  test(`${fixture.name}: a lock owned by a dead process is recovered immediately`, async (t) => {
    const runtime = await fixture(t);
    const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
    assert.ok(Number(exited.pid) > 0);
    writeLock(runtime.lockPath, `${JSON.stringify(lockMetadata(runtime.schemaVersion, { pid: exited.pid }))}\n`);

    const release = await runtime.acquire();

    assert.equal(JSON.parse(fs.readFileSync(runtime.lockPath, "utf8")).pid, process.pid);
    await runtime.release(release);
  });

  test(`${fixture.name}: a live owner blocks even when its lock is old`, async (t) => {
    const runtime = await fixture(t);
    writeLock(runtime.lockPath, `${JSON.stringify(lockMetadata(runtime.schemaVersion))}\n`, { stale: true });

    await runtime.assertBusy(() => runtime.acquire());

    assert.equal(JSON.parse(fs.readFileSync(runtime.lockPath, "utf8")).pid, process.pid);
  });

  test(`${fixture.name}: a symbolic-link lock path is rejected without touching its target`, async (t) => {
    const runtime = await fixture(t);
    const target = `${runtime.lockPath}.target`;
    const bytes = `${JSON.stringify(lockMetadata(runtime.schemaVersion))}\n`;
    writeLock(target, bytes);
    fs.mkdirSync(path.dirname(runtime.lockPath), { recursive: true });
    fs.symlinkSync(target, runtime.lockPath);

    await assert.rejects(() => runtime.acquire(), /symbolic link|not a regular file/u);

    assert.equal(fs.readFileSync(target, "utf8"), bytes);
    assert.equal(fs.lstatSync(runtime.lockPath).isSymbolicLink(), true);
  });
}
