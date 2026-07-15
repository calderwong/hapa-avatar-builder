import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TOKEN = /^[a-f0-9]{64}$/u;
const DEFAULT_MAX_BYTES = 1024;
const DEFAULT_ATTEMPTS = 8;

function fileIdentity(stat) {
  if (!stat) return null;
  return `${String(stat.dev)}:${String(stat.ino)}`;
}

function sameFile(left, right) {
  return Boolean(left && right) && fileIdentity(left) === fileIdentity(right);
}

function lockError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    return null;
  }
}

function readObservedLock(lockPath, { schemaVersion, staleLegacyMs, maxBytes, nowMs }) {
  let pathStat;
  try {
    pathStat = fs.lstatSync(lockPath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "retry" };
    throw error;
  }
  if (pathStat.isSymbolicLink()) {
    throw lockError("OWNED_FILE_LOCK_PATH_INVALID", "Lock path may not be a symbolic link.", { reason: "symlink-lock-path" });
  }
  if (!pathStat.isFile()) {
    throw lockError("OWNED_FILE_LOCK_PATH_INVALID", "Lock path is not a regular file.", { reason: "nonregular-lock-path" });
  }

  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !sameFile(pathStat, before)) return { status: "retry" };
    if (before.size > BigInt(maxBytes)) {
      return {
        status: "blocked",
        stat: before,
        reason: "oversized-lock-metadata",
        ownerPid: null,
      };
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (!sameFile(before, after) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      return { status: "retry" };
    }
    const ageMs = Math.max(0, nowMs - Number(after.mtimeMs));
    let metadata = null;
    try {
      metadata = bytes.byteLength > 0 ? JSON.parse(bytes.toString("utf8")) : null;
    } catch {
      metadata = null;
    }
    const createdAtMs = Date.parse(String(metadata?.createdAt || ""));
    const validMetadata = metadata?.schemaVersion === schemaVersion
      && Number.isSafeInteger(metadata?.pid)
      && metadata.pid > 0
      && Number.isFinite(createdAtMs)
      && TOKEN.test(String(metadata?.token || ""));
    if (!validMetadata) {
      const legacyPid = Number.isSafeInteger(metadata?.pid) && metadata.pid > 0 ? metadata.pid : null;
      if (legacyPid) {
        const legacyOwnerAlive = processIsAlive(legacyPid);
        if (legacyOwnerAlive !== false) {
          return {
            status: "blocked",
            stat: after,
            reason: legacyOwnerAlive === true ? "live-legacy-lock-owner" : "legacy-lock-owner-state-unknown",
            ownerPid: legacyPid,
            ageMs,
          };
        }
        return {
          status: "reclaimable",
          stat: after,
          reason: "dead-legacy-lock-owner",
          ownerPid: legacyPid,
          ageMs,
        };
      }
      const stale = ageMs >= staleLegacyMs;
      return {
        status: stale ? "reclaimable" : "blocked",
        stat: after,
        reason: stale ? "stale-legacy-or-partial-lock" : "fresh-legacy-or-partial-lock",
        ownerPid: null,
        ageMs,
      };
    }
    const alive = processIsAlive(metadata.pid);
    return {
      status: alive === false ? "reclaimable" : "blocked",
      stat: after,
      metadata,
      ownerPid: metadata.pid,
      reason: alive === false ? "dead-lock-owner" : alive === true ? "live-lock-owner" : "lock-owner-state-unknown",
      ageMs,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "retry" };
    if (error?.code === "ELOOP" || error?.code === "EMLINK") {
      throw lockError("OWNED_FILE_LOCK_PATH_INVALID", "Lock path may not be a symbolic link.", { reason: "symlink-lock-path" });
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function restoreQuarantinedPath(quarantinePath, lockPath) {
  let quarantineStat;
  try {
    quarantineStat = fs.lstatSync(quarantinePath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "missing" };
    throw error;
  }
  try {
    fs.linkSync(quarantinePath, lockPath);
    fs.unlinkSync(quarantinePath);
    return { status: "restored" };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    try {
      const current = fs.lstatSync(lockPath, { bigint: true });
      if (sameFile(current, quarantineStat)) {
        fs.unlinkSync(quarantinePath);
        return { status: "already-restored" };
      }
    } catch (statError) {
      if (statError?.code !== "ENOENT") throw statError;
    }
    // A different successor already owns the canonical path. Preserve the
    // displaced inode under its quarantine name instead of deleting it.
    return { status: "preserved-at-quarantine", quarantinePath };
  }
}

function quarantineObservedLock(lockPath, observed) {
  const directory = path.dirname(lockPath);
  let current;
  try {
    current = fs.lstatSync(lockPath, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "retry" };
    throw error;
  }
  if (!sameFile(current, observed.stat)) return { status: "retry" };
  const quarantinePath = path.join(directory, `.${path.basename(lockPath)}.quarantine.${process.pid}.${crypto.randomBytes(16).toString("hex")}`);
  try {
    fs.renameSync(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EEXIST") return { status: "retry" };
    throw error;
  }
  const quarantined = fs.lstatSync(quarantinePath, { bigint: true });
  if (!sameFile(quarantined, observed.stat)) {
    return restoreQuarantinedPath(quarantinePath, lockPath);
  }
  fs.unlinkSync(quarantinePath);
  return { status: "reclaimed" };
}

function installOwnedFileLock({ lockPath, schemaVersion, createdAt, maxBytes }) {
  const directory = path.dirname(lockPath);
  fs.mkdirSync(directory, { recursive: true });
  const token = crypto.randomBytes(32).toString("hex");
  const metadata = { schemaVersion, token, pid: process.pid, createdAt };
  const bytes = Buffer.from(`${JSON.stringify(metadata)}\n`, "utf8");
  if (bytes.byteLength > maxBytes) throw lockError("OWNED_FILE_LOCK_METADATA_TOO_LARGE", "Lock metadata exceeds its bounded size.");
  const candidatePath = path.join(directory, `.${path.basename(lockPath)}.${process.pid}.${token}.tmp`);
  let descriptor = fs.openSync(candidatePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.linkSync(candidatePath, lockPath);
    fs.unlinkSync(candidatePath);
    const descriptorStat = fs.fstatSync(descriptor, { bigint: true });
    const lockStat = fs.lstatSync(lockPath, { bigint: true });
    if (lockStat.isSymbolicLink() || !lockStat.isFile() || !sameFile(descriptorStat, lockStat)) {
      throw lockError("OWNED_FILE_LOCK_CHANGED", "Lock changed while it was being installed.");
    }
    const owner = { lockPath, descriptor, identity: descriptorStat, metadata, token, schemaVersion, maxBytes };
    descriptor = null;
    return owner;
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    fs.rmSync(candidatePath, { force: true });
  }
}

function quarantinedLockBelongsTo(owner, quarantinePath) {
  let descriptor;
  try {
    const stat = fs.lstatSync(quarantinePath, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || !sameFile(stat, owner.identity) || stat.size > BigInt(owner.maxBytes)) return false;
    descriptor = fs.openSync(quarantinePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!sameFile(opened, owner.identity)) return false;
    const metadata = JSON.parse(fs.readFileSync(descriptor, "utf8"));
    return metadata?.schemaVersion === owner.schemaVersion
      && metadata?.pid === process.pid
      && metadata?.token === owner.token;
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function acquireOwnedFileLock({
  lockPath,
  schemaVersion,
  staleLegacyMs,
  maxBytes = DEFAULT_MAX_BYTES,
  attempts = DEFAULT_ATTEMPTS,
  createdAt = new Date().toISOString(),
  nowMs = Date.now(),
} = {}) {
  if (!path.isAbsolute(lockPath) || !schemaVersion || !Number.isFinite(staleLegacyMs) || staleLegacyMs < 0) {
    throw lockError("OWNED_FILE_LOCK_ARGUMENT_INVALID", "Owned lock path, schema, and stale age are required.");
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return installOwnedFileLock({ lockPath, schemaVersion, createdAt, maxBytes });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const observed = readObservedLock(lockPath, { schemaVersion, staleLegacyMs, maxBytes, nowMs });
    if (observed.status === "retry") continue;
    if (observed.status === "blocked") {
      throw lockError("OWNED_FILE_LOCK_BUSY", "Another process owns this lock.", observed);
    }
    const reclaimed = quarantineObservedLock(lockPath, observed);
    if (["retry", "reclaimed", "restored", "already-restored"].includes(reclaimed.status)) continue;
    throw lockError("OWNED_FILE_LOCK_CHANGED", "Lock changed during bounded stale-lock recovery.", reclaimed);
  }
  throw lockError("OWNED_FILE_LOCK_CHANGED", "Lock changed repeatedly during bounded stale-lock recovery.");
}

export function releaseOwnedFileLock(owner) {
  if (!owner || owner.descriptor === null) return { released: false, reason: "already-released" };
  const quarantinePath = path.join(
    path.dirname(owner.lockPath),
    `.${path.basename(owner.lockPath)}.release.${process.pid}.${crypto.randomBytes(16).toString("hex")}`,
  );
  try {
    try {
      fs.renameSync(owner.lockPath, quarantinePath);
    } catch (error) {
      if (error?.code === "ENOENT") return { released: false, reason: "lock-path-missing" };
      throw error;
    }
    if (quarantinedLockBelongsTo(owner, quarantinePath)) {
      fs.unlinkSync(quarantinePath);
      return { released: true, reason: "owned-lock-released" };
    }
    const restored = restoreQuarantinedPath(quarantinePath, owner.lockPath);
    return { released: false, reason: "successor-preserved", ...restored };
  } finally {
    fs.closeSync(owner.descriptor);
    owner.descriptor = null;
  }
}
