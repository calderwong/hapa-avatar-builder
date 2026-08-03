import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

export async function withLocalJsonFileLock(lockPath, operation, options = {}) {
  const waitMs = Math.max(250, Number(options.waitMs || 5_000));
  const staleMs = Math.max(5_000, Number(options.staleMs || 30_000));
  const errorCode = String(options.errorCode || "local_json_store_locked");
  const errorMessage = String(options.errorMessage || "The local JSON store is busy in another process; retry this mutation.");
  await mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + waitMs;
  const owner = { pid: process.pid, token: randomUUID(), acquiredAt: new Date().toISOString() };
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await recoverDeadOwner(lockPath, staleMs);
      if (Date.now() >= deadline) {
        const lockError = new Error(errorMessage);
        lockError.code = errorCode;
        lockError.statusCode = 503;
        throw lockError;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      continue;
    }
    try {
      await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
      return await operation();
    } finally {
      await handle.close().catch(() => {});
      await releaseIfOwned(lockPath, owner.token);
    }
  }
}

async function recoverDeadOwner(lockPath, staleMs) {
  const recoveryPath = `${lockPath}.recovery`;
  const recoveryOwner = { pid: process.pid, token: randomUUID(), acquiredAt: new Date().toISOString() };
  let recoveryHandle;
  try {
    recoveryHandle = await open(recoveryPath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") return;
    throw error;
  }
  try {
    await recoveryHandle.writeFile(`${JSON.stringify(recoveryOwner)}\n`, "utf8");
    const inspected = await inspectLock(lockPath);
    if (!inspected || Date.now() - inspected.mtimeMs <= staleMs || processIsAlive(inspected.owner?.pid)) return;

    // Re-read under the recovery mutex so another recoverer cannot act on the
    // same stale inode. A malformed/empty owner is recoverable only after the
    // stale bound, while a valid owner must belong to a process that is gone.
    const current = await inspectLock(lockPath);
    if (!sameLockSnapshot(inspected, current) || processIsAlive(current?.owner?.pid)) return;

    // Rename the exact stale lock out of the acquisition path. Removing the
    // quarantine afterwards cannot unlink a successor that acquires lockPath.
    const quarantinePath = `${lockPath}.stale-${recoveryOwner.token}`;
    await rename(lockPath, quarantinePath);
    await unlink(quarantinePath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  } finally {
    await recoveryHandle.close().catch(() => {});
    await releaseIfOwned(recoveryPath, recoveryOwner.token);
  }
}

async function inspectLock(lockPath) {
  try {
    const [lockStat, owner] = await Promise.all([stat(lockPath), readOwner(lockPath)]);
    return {
      dev: String(lockStat.dev),
      ino: String(lockStat.ino),
      mtimeMs: lockStat.mtimeMs,
      size: lockStat.size,
      owner,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameLockSnapshot(left, right) {
  if (!left || !right) return false;
  if (left.dev !== right.dev || left.ino !== right.ino || left.mtimeMs !== right.mtimeMs || left.size !== right.size) return false;
  if (!left.owner || !right.owner) return left.owner === right.owner;
  return left.owner.token === right.owner.token && left.owner.pid === right.owner.pid;
}

async function releaseIfOwned(lockPath, token) {
  try {
    const owner = await readOwner(lockPath);
    if (owner?.token === token) await unlink(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function readOwner(lockPath) {
  try { return JSON.parse(await readFile(lockPath, "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") throw error;
    return null;
  }
}

function processIsAlive(pidInput) {
  const pid = Number(pidInput);
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === "EPERM"; }
}
