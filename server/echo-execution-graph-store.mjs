import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import { deriveRequiredStemTelemetryBindings } from "./stem-telemetry-preflight.mjs";

export const ECHO_EXECUTION_GRAPH_RECEIPT_SCHEMA = "hapa.echo.execution-graph-receipt.v2";
export const ECHO_EXECUTION_GRAPH_POINTER_SCHEMA = "hapa.echo.execution-graph-pointer.v1";
export const ECHO_EXECUTION_PUBLICATION_GATE_SCHEMA = "hapa.echo.execution-publication-gate.v1";
export const ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA = "hapa.echo.execution-publisher-lock.v1";
export const ECHO_EXECUTION_LEGACY_LOCK_STALE_MS = 5 * 60 * 1000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const SHA256 = /^sha256:[a-f0-9]{64}$/iu;
const CUT_FINGERPRINT = /^(?:sha256|content-v2):[a-f0-9]{64}$/iu;
const LOCK_TOKEN = /^[a-f0-9]{64}$/u;
const PUBLISHER_LOCK_MAX_BYTES = 1024;
const PUBLISHER_LOCK_RECLAIM_ATTEMPTS = 8;
const PROCESS_START_CLOCK_SKEW_MS = 2_000;
const THIS_PROCESS_STARTED_AT_MS = Date.now() - (process.uptime() * 1_000);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function hashBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function hashValue(value) {
  return hashBytes(Buffer.from(JSON.stringify(stable(value))));
}

function compiledGraphIdentity(graph = {}) {
  return {
    runId: text(graph?.runId) || null,
    variantId: text(graph?.directorV2?.variantId) || null,
    variantHash: text(graph?.directorV2?.variantHash) || null,
  };
}

function sameCompiledGraphIdentity(left = {}, right = {}) {
  return ["runId", "variantId", "variantHash"].every((key) => (text(left?.[key]) || null) === (text(right?.[key]) || null));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeSegment(value) {
  const candidate = text(value);
  return candidate
    && candidate !== "."
    && candidate !== ".."
    && path.basename(candidate) === candidate
    && !candidate.includes("/")
    && !candidate.includes("\\")
    ? candidate
    : "";
}

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function rejectSymlink(candidate, label) {
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink()) throw new Error(`${label} may not be a symbolic link.`);
  return stat;
}

function realDirectory(candidate, { parent = null, create = false, label = "Directory" } = {}) {
  if (create) fs.mkdirSync(candidate, { recursive: true });
  const stat = rejectSymlink(candidate, label);
  if (!stat.isDirectory()) throw new Error(`${label} is not a directory.`);
  const real = fs.realpathSync(candidate);
  if (parent && !within(parent, real)) throw new Error(`${label} escaped its real parent directory.`);
  return real;
}

function realRegularFile(candidate, { parent, label }) {
  const stat = rejectSymlink(candidate, label);
  if (!stat.isFile()) throw new Error(`${label} is not a regular file.`);
  const real = fs.realpathSync(candidate);
  if (!within(parent, real)) throw new Error(`${label} escaped its real parent directory.`);
  return real;
}

function cutKey(cutId) {
  return crypto.createHash("sha256").update(text(cutId) || "base").digest("hex").slice(0, 32);
}

function storePaths({ albumRoot, songId, cutId = "base", create = false }) {
  const safeSongId = safeSegment(songId);
  if (!safeSongId) throw new Error("A safe song ID is required for the Echo execution store.");
  const albumReal = realDirectory(path.resolve(albumRoot), { label: "Echo album root" });
  const songPath = path.resolve(albumReal, safeSongId);
  const songReal = realDirectory(songPath, { parent: albumReal, create, label: "Echo song artifact directory" });
  const executionPath = path.join(songReal, "execution");
  const executionReal = realDirectory(executionPath, { parent: songReal, create, label: "Echo execution directory" });
  const cutsPath = path.join(executionReal, "cuts");
  const cutsReal = realDirectory(cutsPath, { parent: executionReal, create, label: "Echo execution cuts directory" });
  const cutPath = path.join(cutsReal, cutKey(cutId));
  const cutReal = realDirectory(cutPath, { parent: cutsReal, create, label: "Echo execution cut directory" });
  return {
    safeSongId,
    cutId: text(cutId) || "base",
    albumReal,
    songReal,
    executionReal,
    cutReal,
    pointerPath: path.join(cutReal, "current.json"),
    lockPath: path.join(cutReal, "current.lock"),
  };
}

export function echoExecutionFileSha256(filePath) {
  return hashBytes(fs.readFileSync(filePath));
}

function pointerTokenAt(pointerPath) {
  try {
    const stat = fs.lstatSync(pointerPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("The Echo execution pointer is not a regular file.");
    return echoExecutionFileSha256(pointerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function echoExecutionPointerToken({ albumRoot, songId, cutId = "base" } = {}) {
  try {
    return pointerTokenAt(storePaths({ albumRoot, songId, cutId, create: false }).pointerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function writeOnceJson(filePath, value, parentReal) {
  const bytes = jsonBytes(value);
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("An immutable Echo artifact path is not a regular file.");
    const existing = fs.readFileSync(filePath);
    if (!existing.equals(bytes)) throw new Error("An immutable Echo execution artifact already exists with different bytes.");
    return { status: "verified-existing", sha256: hashBytes(existing) };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = path.join(parentReal, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  fs.writeFileSync(temporary, bytes, { flag: "wx" });
  try {
    fs.linkSync(temporary, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = fs.readFileSync(filePath);
    if (!existing.equals(bytes)) throw new Error("A concurrent publisher created different bytes for an immutable Echo artifact.");
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  const real = realRegularFile(filePath, { parent: parentReal, label: "Immutable Echo execution artifact" });
  return { status: "created", sha256: echoExecutionFileSha256(real) };
}

function replacePointerJson(pointerPath, value, cutReal) {
  try {
    const stat = fs.lstatSync(pointerPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("The Echo execution pointer is not a regular file.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = path.join(cutReal, `.current.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, jsonBytes(value), { flag: "wx" });
    fs.renameSync(temporary, pointerPath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function sameFileIdentity(left, right) {
  return Boolean(left && right)
    && String(left.dev) === String(right.dev)
    && String(left.ino) === String(right.ino);
}

function sameFileSnapshot(left, right) {
  return sameFileIdentity(left, right)
    && String(left.size) === String(right.size)
    && String(left.mtimeNs) === String(right.mtimeNs)
    && String(left.ctimeNs) === String(right.ctimeNs);
}

function processStartedAtMs(pid) {
  if (pid === process.pid) return THIS_PROCESS_STARTED_AT_MS;
  try {
    const output = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      maxBuffer: 512,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const parsed = Date.parse(output);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function processOwnerState(pid, declaredStartedAtMs) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error?.code === "ESRCH") return { alive: false, pidReused: false };
    if (error?.code !== "EPERM") return { alive: null, pidReused: false };
  }
  const startedAtMs = processStartedAtMs(pid);
  const pidReused = Number.isFinite(startedAtMs)
    && Number.isFinite(declaredStartedAtMs)
    && Math.abs(startedAtMs - declaredStartedAtMs) > PROCESS_START_CLOCK_SKEW_MS;
  return { alive: !pidReused, pidReused, startedAtMs };
}

function readPublisherLockSnapshot(lockPath) {
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error("The Echo execution publisher lock may not be a symbolic link.");
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor, { bigint: true });
    if (!stat.isFile()) throw new Error("The Echo execution publisher lock is not a regular file.");
    if (stat.size > BigInt(PUBLISHER_LOCK_MAX_BYTES)) return { stat, bytes: null };
    const bytes = Buffer.alloc(Number(stat.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = fs.readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    if (offset !== bytes.byteLength) return { stat, bytes: null };
    const finalStat = fs.fstatSync(descriptor, { bigint: true });
    if (!sameFileSnapshot(stat, finalStat)) return { stat: finalStat, bytes: null, changed: true };
    return { stat, bytes };
  } finally {
    fs.closeSync(descriptor);
  }
}

function inspectPublisherLock(lockPath) {
  const pathStat = fs.lstatSync(lockPath, { bigint: true });
  if (pathStat.isSymbolicLink()) throw new Error("The Echo execution publisher lock may not be a symbolic link.");
  if (!pathStat.isFile()) throw new Error("The Echo execution publisher lock is not a regular file.");
  const snapshot = readPublisherLockSnapshot(lockPath);
  if (!sameFileIdentity(pathStat, snapshot.stat)) return { stat: pathStat, kind: "race", reclaimable: false, retry: true, reason: "lock-path-changed" };
  const { stat, bytes } = snapshot;
  if (snapshot.changed) return { stat, kind: "race", reclaimable: false, retry: true, reason: "lock-metadata-changed" };
  if (bytes === null) {
    return { stat, kind: "invalid", reclaimable: false, reason: "oversized-lock-metadata" };
  }
  if (bytes.byteLength === 0) {
    const ageMs = Math.max(0, Date.now() - Number(stat.mtimeMs || 0));
    return {
      stat,
      kind: "legacy-empty",
      ageMs,
      reclaimable: ageMs >= ECHO_EXECUTION_LEGACY_LOCK_STALE_MS,
      reason: ageMs >= ECHO_EXECUTION_LEGACY_LOCK_STALE_MS ? "stale-legacy-empty-lock" : "fresh-legacy-empty-lock",
    };
  }
  let metadata;
  try {
    metadata = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { stat, kind: "invalid", reclaimable: false, reason: "invalid-lock-metadata" };
  }
  const createdAtMs = Date.parse(text(metadata?.createdAt));
  const ownerStartedAtMs = Date.parse(text(metadata?.ownerStartedAt));
  if (
    metadata?.schemaVersion !== ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA
    || !Number.isSafeInteger(metadata?.pid)
    || metadata.pid <= 0
    || !Number.isFinite(createdAtMs)
    || !Number.isFinite(ownerStartedAtMs)
    || !LOCK_TOKEN.test(text(metadata?.token))
  ) {
    return { stat, kind: "invalid", reclaimable: false, reason: "invalid-lock-metadata" };
  }
  const owner = processOwnerState(metadata.pid, ownerStartedAtMs);
  return {
    stat,
    kind: "metadata",
    metadata,
    alive: owner.alive,
    pidReused: owner.pidReused,
    reclaimable: owner.alive === false,
    reason: owner.pidReused
      ? "pid-reused-lock-owner"
      : owner.alive === false
        ? "dead-lock-owner"
        : owner.alive === true
          ? "live-lock-owner"
          : "lock-owner-state-unknown",
  };
}

function createPublisherLockCandidate(cutReal) {
  const token = crypto.randomBytes(32).toString("hex");
  const metadata = {
    schemaVersion: ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA,
    pid: process.pid,
    ownerStartedAt: new Date(THIS_PROCESS_STARTED_AT_MS).toISOString(),
    createdAt: new Date().toISOString(),
    token,
  };
  const candidatePath = path.join(cutReal, `.current.lock.${process.pid}.${token}.tmp`);
  const descriptor = fs.openSync(
    candidatePath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const bytes = jsonBytes(metadata);
    if (bytes.byteLength > PUBLISHER_LOCK_MAX_BYTES) throw new Error("Echo execution publisher lock metadata exceeds its bounded size.");
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    return { candidatePath, descriptor, metadata, token };
  } catch (error) {
    fs.closeSync(descriptor);
    fs.rmSync(candidatePath, { force: true });
    throw error;
  }
}

function discardPublisherLockCandidate(candidate) {
  if (!candidate) return;
  try {
    if (candidate.descriptor !== null) fs.closeSync(candidate.descriptor);
  } finally {
    candidate.descriptor = null;
    fs.rmSync(candidate.candidatePath, { force: true });
  }
}

function installPublisherLock(lockPath, cutReal) {
  const candidate = createPublisherLockCandidate(cutReal);
  let linked = false;
  try {
    fs.linkSync(candidate.candidatePath, lockPath);
    linked = true;
    const descriptorStat = fs.fstatSync(candidate.descriptor, { bigint: true });
    const lockStat = fs.lstatSync(lockPath, { bigint: true });
    if (lockStat.isSymbolicLink() || !lockStat.isFile() || !sameFileIdentity(descriptorStat, lockStat)) {
      throw new Error("The Echo execution publisher lock changed while it was being installed.");
    }
    fs.rmSync(candidate.candidatePath, { force: true });
    return {
      path: lockPath,
      descriptor: candidate.descriptor,
      metadata: candidate.metadata,
      token: candidate.token,
      identity: descriptorStat,
    };
  } catch (error) {
    let releaseError = null;
    if (linked) {
      try {
        releasePublisherLock({
          path: lockPath,
          descriptor: candidate.descriptor,
          metadata: candidate.metadata,
          token: candidate.token,
          identity: fs.fstatSync(candidate.descriptor, { bigint: true }),
        });
      } catch (cleanupError) {
        releaseError = cleanupError;
      } finally {
        candidate.descriptor = null;
      }
    }
    discardPublisherLockCandidate(candidate);
    if (releaseError) throw releaseError;
    throw error;
  }
}

function publisherStillOwnsLock(owner) {
  if (!owner) return false;
  try {
    const pathStat = fs.lstatSync(owner.path, { bigint: true });
    if (pathStat.isSymbolicLink() || !pathStat.isFile() || !sameFileIdentity(pathStat, owner.identity)) return false;
    const snapshot = readPublisherLockSnapshot(owner.path);
    if (!sameFileIdentity(snapshot.stat, owner.identity) || snapshot.bytes === null) return false;
    const metadata = JSON.parse(snapshot.bytes.toString("utf8"));
    return metadata?.schemaVersion === ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA
      && text(metadata?.token) === owner.token
      && metadata?.pid === process.pid;
  } catch {
    return false;
  }
}

function quarantineReclaimablePublisherLock(lockPath, cutReal, observed) {
  const claimIdentity = crypto.createHash("sha256").update([
    String(observed.stat.dev),
    String(observed.stat.ino),
    String(observed.stat.size),
    String(observed.stat.mtimeMs),
  ].join("\u0000")).digest("hex").slice(0, 32);
  const quarantinePath = path.join(cutReal, `.current.lock.reclaim.${claimIdentity}`);
  try {
    // A hard-link claim is an atomic, inode-bound quarantine. Unlike rename,
    // it can never move a successor that won the current.lock path race.
    fs.linkSync(lockPath, quarantinePath);
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "retry" };
    if (error?.code === "EEXIST") {
      let claim;
      try {
        claim = fs.lstatSync(quarantinePath, { bigint: true });
      } catch (claimError) {
        if (claimError?.code === "ENOENT") return { status: "retry" };
        throw claimError;
      }
      if (claim.isSymbolicLink()) throw new Error("The Echo execution stale-lock recovery claim may not be a symbolic link.");
      if (!claim.isFile()) throw new Error("The Echo execution stale-lock recovery claim is not a regular file.");
      const claimAgeMs = Math.max(0, Date.now() - Number(claim.ctimeMs || 0));
      if (claimAgeMs >= ECHO_EXECUTION_LEGACY_LOCK_STALE_MS) {
        try {
          fs.unlinkSync(quarantinePath);
        } catch (claimError) {
          if (claimError?.code !== "ENOENT") throw claimError;
        }
        return { status: "retry" };
      }
      return { status: "contended" };
    }
    throw error;
  }
  try {
    const quarantined = fs.lstatSync(quarantinePath, { bigint: true });
    if (quarantined.isSymbolicLink() || !quarantined.isFile() || !sameFileIdentity(quarantined, observed.stat)) {
      return { status: "retry" };
    }
    const quarantinedState = inspectPublisherLock(quarantinePath);
    if (quarantinedState.retry || !quarantinedState.reclaimable) return { status: "retry" };
    let current;
    try {
      current = fs.lstatSync(lockPath, { bigint: true });
    } catch (error) {
      if (error?.code === "ENOENT") return { status: "retry" };
      throw error;
    }
    if (current.isSymbolicLink()) throw new Error("The Echo execution publisher lock may not be a symbolic link.");
    if (!current.isFile()) throw new Error("The Echo execution publisher lock is not a regular file.");
    if (!sameFileIdentity(current, quarantined)) return { status: "retry" };
    const disposalPath = path.join(cutReal, `.current.lock.reclaim-dispose.${process.pid}.${crypto.randomBytes(12).toString("hex")}`);
    try {
      fs.renameSync(lockPath, disposalPath);
    } catch (error) {
      if (error?.code === "ENOENT") return { status: "retry" };
      throw error;
    }
    const disposed = fs.lstatSync(disposalPath, { bigint: true });
    if (!sameFileIdentity(disposed, quarantined)) {
      try {
        fs.linkSync(disposalPath, lockPath);
        fs.rmSync(disposalPath, { force: true });
        return { status: "retry" };
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error(`The Echo execution stale-lock recovery preserved a raced successor at ${disposalPath}.`);
        }
        throw error;
      }
    }
    fs.rmSync(disposalPath, { force: true });
    return { status: "reclaimed" };
  } finally {
    // This path is the hard link created by this reclaimer. Removing it never
    // removes current.lock or a successor inode.
    fs.rmSync(quarantinePath, { force: true });
  }
}

function acquirePublisherLock(lockPath, cutReal) {
  for (let attempt = 0; attempt < PUBLISHER_LOCK_RECLAIM_ATTEMPTS; attempt += 1) {
    try {
      return installPublisherLock(lockPath, cutReal);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    let observed;
    try {
      observed = inspectPublisherLock(lockPath);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (observed.retry) continue;
    if (!observed.reclaimable) {
      throw new Error(`Another Echo execution publisher is activating this cut (${observed.reason}).`);
    }
    const reclaim = quarantineReclaimablePublisherLock(lockPath, cutReal, observed);
    if (reclaim.status === "retry" || reclaim.status === "reclaimed") continue;
    if (reclaim.status === "contended") {
      throw new Error("Another Echo execution publisher is recovering a stale lock for this cut.");
    }
  }
  throw new Error("The Echo execution publisher lock changed repeatedly during bounded stale-lock recovery.");
}

function releasePublisherLock(owner) {
  if (!owner) return;
  try {
    let current;
    try {
      current = fs.lstatSync(owner.path, { bigint: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    if (current.isSymbolicLink() || !current.isFile()) return;
    const quarantinePath = path.join(path.dirname(owner.path), `.current.lock.release.${process.pid}.${owner.token}`);
    try {
      // Claim the currently named inode without moving it. If a successor has
      // already replaced our lock, the claim binds that successor and the
      // identity/token check below leaves current.lock untouched.
      fs.linkSync(owner.path, quarantinePath);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    const quarantinedStat = fs.lstatSync(quarantinePath, { bigint: true });
    let owned = false;
    if (!quarantinedStat.isSymbolicLink() && quarantinedStat.isFile() && sameFileIdentity(quarantinedStat, owner.identity)) {
      try {
        const snapshot = readPublisherLockSnapshot(quarantinePath);
        const metadata = snapshot.bytes === null ? null : JSON.parse(snapshot.bytes.toString("utf8"));
        owned = sameFileIdentity(snapshot.stat, owner.identity)
          && metadata?.schemaVersion === ECHO_EXECUTION_PUBLISHER_LOCK_SCHEMA
          && text(metadata?.token) === owner.token
          && metadata?.pid === process.pid;
      } catch {
        owned = false;
      }
    }
    if (owned) {
      const disposalPath = path.join(path.dirname(owner.path), `.current.lock.release-dispose.${process.pid}.${crypto.randomBytes(12).toString("hex")}`);
      try {
        fs.renameSync(owner.path, disposalPath);
      } catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
      }
      const disposed = fs.lstatSync(disposalPath, { bigint: true });
      if (sameFileIdentity(disposed, owner.identity)) {
        fs.rmSync(disposalPath, { force: true });
        fs.rmSync(quarantinePath, { force: true });
        return;
      }
      try {
        fs.linkSync(disposalPath, owner.path);
        fs.rmSync(disposalPath, { force: true });
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error(`Echo execution publisher cleanup preserved a successor lock at ${disposalPath}.`);
        }
        throw error;
      }
    }
    fs.rmSync(quarantinePath, { force: true });
  } finally {
    if (owner.descriptor !== null) fs.closeSync(owner.descriptor);
    owner.descriptor = null;
  }
}

function repairDecisionHealth(repairReceipt = {}) {
  const decisions = list(repairReceipt?.decisions);
  const statuses = decisions.map((entry) => text(entry?.decision?.status || entry?.status));
  const blockedCount = Math.max(
    Number(repairReceipt?.blockedDecisionCount || 0),
    statuses.filter((status) => status === "blocked" || status.startsWith("blocked-")).length,
  );
  const unmeasuredCount = statuses.filter((status) => status.includes("unmeasured") || status.includes("unverified")).length;
  const countMatches = Number(repairReceipt?.decisionCount || 0) === decisions.length;
  return {
    ok: ["repaired", "verified-no-change"].includes(text(repairReceipt?.status))
      && blockedCount === 0
      && unmeasuredCount === 0
      && countMatches,
    blockedCount,
    unmeasuredCount,
    decisionCount: decisions.length,
    countMatches,
  };
}

function statBoundInputsValid(rows) {
  return Array.isArray(rows) && rows.every((entry) => (
    text(entry?.path)
    && text(entry?.kind)
    && text(entry?.inputClass)
    && text(entry?.signatureKey)
    && text(entry?.statIdentityKey).split("\u0000").length === 7
    && (text(entry?.inputClass) !== "visual-media" || (Array.isArray(entry?.routeBindings) && entry.routeBindings.length > 0))
  ));
}

function assertPublicationEvidence(evidence = {}, graph = {}) {
  const gate = evidence?.gate;
  const repairReceipt = evidence?.repair?.receipt;
  const repairHealth = repairDecisionHealth(repairReceipt);
  const repairReceiptSha256 = hashValue(repairReceipt);
  const telemetryBundleSha256 = text(repairReceipt?.telemetry?.bundleSha256);
  const telemetryEvidence = evidence?.telemetry || {};
  const noTelemetryRequired = (
    text(repairReceipt?.policy?.id || repairReceipt?.policy) === "no-stem-binding-repair-required"
    && text(repairReceipt?.status) === "verified-no-change"
    && Number(repairReceipt?.decisionCount || 0) === 0
    && list(repairReceipt?.decisions).length === 0
    && text(repairReceipt?.telemetry?.truthStatus) === "not-required-no-audio-reactive-stem-bindings"
    && deriveRequiredStemTelemetryBindings({ showGraph: graph }).length === 0
  );
  const telemetryValid = noTelemetryRequired
    ? telemetryEvidence.schemaVersion === "hapa.echo.no-stem-telemetry-proof.v1"
      && text(telemetryEvidence.analysisVersion) === "not-required"
      && text(telemetryEvidence.truthStatus) === "not-required-no-audio-reactive-stem-bindings"
      && Number(telemetryEvidence.fps || 0) === 0
      && Number(telemetryEvidence.sampleRate || 0) === 0
      && SHA256.test(telemetryBundleSha256)
      && text(telemetryEvidence.bundleSha256) === telemetryBundleSha256
      && SHA256.test(text(telemetryEvidence.cacheIdentitySha256))
    : SHA256.test(telemetryBundleSha256)
      && text(telemetryEvidence.bundleSha256) === telemetryBundleSha256
      && Boolean(text(telemetryEvidence.analysisVersion))
      && text(telemetryEvidence.analysisVersion) !== "not-required"
      && text(telemetryEvidence.schemaVersion) !== "hapa.echo.no-stem-telemetry-proof.v1";
  const cut = evidence?.cut || {};
  const inputs = list(evidence?.inputs);
  const inputsValid = inputs.length > 0 && inputs.every((entry) => (
    text(entry?.path)
    && text(entry?.inputClass)
    && SHA256.test(text(entry?.contentSha256))
    && text(entry?.statIdentityKey).split("\u0000").length === 7
    && (text(entry?.inputClass) !== "master-audio" || (Array.isArray(entry?.routeBindings) && entry.routeBindings.length > 0))
  ));
  const visualInputs = evidence?.visualInputs;
  const proxyInputs = evidence?.proxyInputs;
  const visualInputSummary = evidence?.visualInputSummary || {};
  const visualInputsValid = statBoundInputsValid(visualInputs)
    && statBoundInputsValid(proxyInputs)
    && Number.isInteger(Number(visualInputSummary.visualInputCount))
    && Number.isInteger(Number(visualInputSummary.proxyInputCount))
    && Number(visualInputSummary.visualInputCount) === visualInputs.length
    && Number(visualInputSummary.proxyInputCount) === proxyInputs.length;
  if (
    gate?.schemaVersion !== ECHO_EXECUTION_PUBLICATION_GATE_SCHEMA
    || gate?.ok !== true
    || gate?.cutStatus !== "ready-no-known-blockers"
    || !SHA256.test(text(gate?.certificateSha256))
    || !SHA256.test(text(gate?.readinessFingerprint))
    || text(cut?.certificateSha256) !== text(gate?.certificateSha256)
    || text(cut?.readinessFingerprint) !== text(gate?.readinessFingerprint)
    || gate?.repairReceiptSha256 !== repairReceiptSha256
    || evidence?.repair?.receiptSha256 !== repairReceiptSha256
    || !telemetryValid
    || !SHA256.test(text(telemetryEvidence.analyzerScriptSha256))
    || !SHA256.test(text(evidence?.registries?.shaderCatalogSha256))
    || !SHA256.test(text(evidence?.registries?.proxyRegistrySha256))
    || !SHA256.test(text(evidence?.registries?.songRegistrySha256))
    || !SHA256.test(text(evidence?.registries?.songbookSha256))
    || !SHA256.test(text(evidence?.rendererBuildSha256))
    || !SHA256.test(text(evidence?.deliveryRuntimeBuildSha256))
    || !SHA256.test(text(evidence?.serverDeliveryBuildSha256))
    || evidence?.certifier?.schemaVersion !== "hapa.echo.readiness-certifier-source.v1"
    || !SHA256.test(text(evidence?.certifier?.sourceSha256))
    || !inputsValid
    || !visualInputsValid
    || !repairHealth.ok
  ) {
    throw new Error("The Echo execution publication gate is missing, blocked, unmeasured, or inconsistent with its stem-repair receipt.");
  }
  return { gate, repairReceipt, repairHealth, repairReceiptSha256 };
}

function assertExecutionBinding({
  evidence = {},
  graph = {},
  parentGraph = {},
  parentGraphSha256,
  songId,
  cutId,
  expectedCutKind = null,
  expectedCutFingerprint = null,
} = {}) {
  const cut = evidence?.cut || {};
  const cutKind = text(cut?.kind);
  const cutFingerprint = text(cut?.fingerprint);
  const parentIdentity = compiledGraphIdentity(parentGraph);
  const lineage = graph?.directorV2?.executionLineage || {};
  const reasons = [];
  if (text(cut?.id) !== text(cutId)) reasons.push("evidence-cut-id-mismatch");
  if (!cutKind) reasons.push("evidence-cut-kind-missing");
  if (expectedCutKind && cutKind !== text(expectedCutKind)) reasons.push("evidence-cut-kind-mismatch");
  if (!CUT_FINGERPRINT.test(cutFingerprint)) reasons.push("evidence-cut-fingerprint-invalid");
  if (expectedCutFingerprint && cutFingerprint !== text(expectedCutFingerprint)) reasons.push("evidence-cut-fingerprint-mismatch");
  if (text(evidence?.parentGraphSha256) !== text(parentGraphSha256)) reasons.push("evidence-parent-sha-mismatch");
  if (!sameCompiledGraphIdentity(evidence?.parentIdentity, parentIdentity)) reasons.push("evidence-parent-identity-mismatch");
  if (lineage?.schemaVersion !== "hapa.echo.execution-graph-lineage.v1") reasons.push("lineage-schema-mismatch");
  if (text(lineage?.parentGraphSha256) !== text(parentGraphSha256)) reasons.push("lineage-parent-sha-mismatch");
  if (text(lineage?.cutId) !== text(cutId)) reasons.push("lineage-cut-id-mismatch");
  if (text(lineage?.cutKind) !== cutKind) reasons.push("lineage-cut-kind-mismatch");
  if (text(lineage?.cutFingerprint) !== cutFingerprint) reasons.push("lineage-cut-fingerprint-mismatch");
  if (!sameCompiledGraphIdentity(lineage?.parentIdentity, parentIdentity)) reasons.push("lineage-parent-identity-mismatch");
  if (reasons.length) {
    throw new Error(`The Echo execution graph is not bound to the exact canonical parent, semantic cut, and stored cut identity: ${reasons.join(", ")}.`);
  }
  return { cutKind, cutFingerprint, parentIdentity, lineage };
}

function rejected(reason, details = {}) {
  return { ok: false, status: "rejected", reason, ...details };
}

/**
 * Publish a content-addressed execution graph. Immutable graph/receipt files
 * are create-or-verify only. A locked compare-and-swap updates current.json
 * last, after the canonical parent and previous current token still match.
 */
export function publishEchoExecutionGraph({
  albumRoot,
  songId,
  cutId = "base",
  cutKind,
  cutFingerprint,
  parentGraphPath,
  expectedParentGraphSha256,
  expectedCurrentPointerSha256 = undefined,
  graph,
  project,
  evidence = {},
  validateGraph = validateEchoCompiledShowGraph,
  assertPublicationFresh = null,
} = {}) {
  const gateProof = assertPublicationEvidence(evidence, graph);
  const store = storePaths({ albumRoot, songId, cutId, create: true });
  const parentReal = realRegularFile(path.resolve(parentGraphPath), { parent: store.songReal, label: "Canonical Echo graph" });
  const parentBytes = fs.readFileSync(parentReal);
  const parentGraphSha256 = hashBytes(parentBytes);
  if (!SHA256.test(text(expectedParentGraphSha256)) || parentGraphSha256 !== expectedParentGraphSha256) {
    throw new Error("The canonical Echo graph changed before execution graph publication.");
  }
  let parentGraph;
  try {
    parentGraph = JSON.parse(parentBytes.toString("utf8"));
  } catch {
    throw new Error("The canonical Echo graph is not valid JSON at execution publication.");
  }
  const initialCurrentToken = expectedCurrentPointerSha256 === undefined
    ? pointerTokenAt(store.pointerPath)
    : expectedCurrentPointerSha256;
  if (initialCurrentToken !== null && !SHA256.test(text(initialCurrentToken))) {
    throw new Error("The expected Echo execution pointer token is invalid.");
  }
  const validation = validateGraph({ project, graph });
  if (!validation?.ok) throw new Error(`The derived Echo execution graph is invalid: ${(validation?.reasons || ["validation-failed"]).join(", ")}.`);
  const variantHash = text(graph?.directorV2?.variantHash);
  if (!/^[a-f0-9]{64}$/iu.test(variantHash)) throw new Error("The derived Echo execution graph has no content identity.");
  if (!text(cutKind) || !CUT_FINGERPRINT.test(text(cutFingerprint))) {
    throw new Error("The Echo execution publisher must provide the current semantic cut kind and fingerprint.");
  }
  const binding = assertExecutionBinding({
    evidence,
    graph,
    parentGraph,
    parentGraphSha256,
    songId: store.safeSongId,
    cutId: store.cutId,
    expectedCutKind: cutKind,
    expectedCutFingerprint: cutFingerprint,
  });
  const assertFresh = (stage) => {
    if (typeof assertPublicationFresh !== "function") return;
    const result = assertPublicationFresh({ stage, evidence });
    if (result && typeof result.then === "function") {
      throw new Error("The Echo execution publication freshness assertion must be synchronous.");
    }
  };
  assertFresh("before-artifact-write");
  const artifactId = hashValue({ parentGraphSha256, graph, evidence }).replace(/^sha256:/u, "");
  const artifactPath = path.join(store.cutReal, "artifacts", artifactId);
  const artifactsReal = realDirectory(path.dirname(artifactPath), { parent: store.cutReal, create: true, label: "Echo immutable artifacts directory" });
  const artifactReal = realDirectory(artifactPath, { parent: artifactsReal, create: true, label: "Echo immutable artifact directory" });
  const graphPath = path.join(artifactReal, "show-graph.json");
  const graphWrite = writeOnceJson(graphPath, graph, artifactReal);
  const outputGraphSha256 = graphWrite.sha256;
  const receipt = {
    schemaVersion: ECHO_EXECUTION_GRAPH_RECEIPT_SCHEMA,
    status: "ready",
    songId: store.safeSongId,
    cutId: store.cutId,
    cutKind: binding.cutKind,
    cutFingerprint: binding.cutFingerprint,
    artifactId,
    derivedExecutionArtifact: true,
    canonicalGraphMutated: false,
    sourceProjectMutated: false,
    savedVariantsMutated: false,
    parent: {
      path: path.relative(store.songReal, parentReal),
      graphSha256: parentGraphSha256,
      ...binding.parentIdentity,
    },
    output: {
      path: path.relative(store.cutReal, graphPath),
      graphSha256: outputGraphSha256,
      runId: text(graph?.runId) || null,
      variantId: text(graph?.directorV2?.variantId) || null,
      variantHash,
    },
    validation,
    publicationGate: gateProof.gate,
    evidence,
  };
  const receiptPath = path.join(artifactReal, "receipt.json");
  const receiptWrite = writeOnceJson(receiptPath, receipt, artifactReal);
  const receiptSha256 = receiptWrite.sha256;
  const publisherLock = acquirePublisherLock(store.lockPath, store.cutReal);
  try {
    if (!publisherStillOwnsLock(publisherLock)) {
      throw new Error("The Echo execution publisher no longer owns this cut lock.");
    }
    if (pointerTokenAt(store.pointerPath) !== initialCurrentToken) {
      throw new Error("The Echo execution current pointer changed during publication.");
    }
    if (echoExecutionFileSha256(parentReal) !== parentGraphSha256) {
      throw new Error("The canonical Echo graph changed while the execution graph was being published.");
    }
    assertFresh("before-pointer-activation");
    if (!publisherStillOwnsLock(publisherLock)) {
      throw new Error("The Echo execution publisher no longer owns this cut lock.");
    }
    const pointer = {
      schemaVersion: ECHO_EXECUTION_GRAPH_POINTER_SCHEMA,
      status: "ready",
      songId: store.safeSongId,
      cutId: store.cutId,
      cutKind: binding.cutKind,
      cutFingerprint: binding.cutFingerprint,
      artifactId,
      parentGraphSha256,
      executionGraphPath: path.relative(store.cutReal, graphPath),
      executionGraphSha256: outputGraphSha256,
      receiptPath: path.relative(store.cutReal, receiptPath),
      receiptSha256,
      variantId: receipt.output.variantId,
      variantHash,
    };
    replacePointerJson(store.pointerPath, pointer, store.cutReal);
    return { ok: true, status: "published", graphPath, receiptPath, pointerPath: store.pointerPath, graph, receipt, pointer };
  } finally {
    releasePublisherLock(publisherLock);
  }
}

/** Resolve current only when pointer, receipt, gate, real paths, parent,
 * output bytes, and compiled identity all agree. */
export function resolveEchoExecutionGraph({
  albumRoot,
  songId,
  cutId = "base",
  parentGraphPath,
  parentGraphSha256,
  cutKind = null,
  cutFingerprint = null,
  project,
  validateGraph = validateEchoCompiledShowGraph,
} = {}) {
  let store;
  try {
    store = storePaths({ albumRoot, songId, cutId, create: false });
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, status: "missing", reason: "execution-pointer-missing" };
    return rejected("execution-store-path-invalid", { message: error.message });
  }
  let pointer;
  try {
    const pointerReal = realRegularFile(store.pointerPath, { parent: store.cutReal, label: "Echo execution pointer" });
    pointer = JSON.parse(fs.readFileSync(pointerReal, "utf8"));
  } catch (error) {
    return error?.code === "ENOENT" ? { ok: false, status: "missing", reason: "execution-pointer-missing" } : rejected("execution-pointer-invalid");
  }
  if (
    pointer?.schemaVersion !== ECHO_EXECUTION_GRAPH_POINTER_SCHEMA
    || pointer?.status !== "ready"
    || pointer?.songId !== store.safeSongId
    || pointer?.cutId !== store.cutId
    || !text(cutKind)
    || !CUT_FINGERPRINT.test(text(cutFingerprint))
    || !text(pointer?.cutKind)
    || pointer.cutKind !== text(cutKind)
    || !CUT_FINGERPRINT.test(text(pointer?.cutFingerprint))
    || pointer.cutFingerprint !== text(cutFingerprint)
  ) return rejected("execution-pointer-contract-invalid");
  if (!SHA256.test(text(parentGraphSha256)) || pointer.parentGraphSha256 !== parentGraphSha256) {
    return rejected("execution-parent-graph-stale", { expectedParentGraphSha256: parentGraphSha256, observedParentGraphSha256: pointer.parentGraphSha256 || null });
  }
  let parentReal;
  try {
    parentReal = realRegularFile(path.resolve(parentGraphPath), { parent: store.songReal, label: "Canonical Echo graph" });
  } catch {
    return rejected("execution-parent-graph-path-invalid");
  }
  const parentBytes = fs.readFileSync(parentReal);
  if (hashBytes(parentBytes) !== parentGraphSha256) return rejected("execution-parent-graph-bytes-changed");
  let parentGraph;
  try {
    parentGraph = JSON.parse(parentBytes.toString("utf8"));
  } catch {
    return rejected("execution-parent-graph-json-invalid");
  }
  const graphPath = path.resolve(store.cutReal, text(pointer.executionGraphPath));
  const receiptPath = path.resolve(store.cutReal, text(pointer.receiptPath));
  let graphReal;
  let receiptReal;
  try {
    if (!within(store.cutReal, graphPath) || !within(store.cutReal, receiptPath)) throw new Error("outside-cut-root");
    graphReal = realRegularFile(graphPath, { parent: store.cutReal, label: "Echo execution graph" });
    receiptReal = realRegularFile(receiptPath, { parent: store.cutReal, label: "Echo execution receipt" });
  } catch {
    return rejected("execution-artifact-path-invalid");
  }
  const graphBytes = fs.readFileSync(graphReal);
  const receiptBytes = fs.readFileSync(receiptReal);
  const outputGraphSha256 = hashBytes(graphBytes);
  const receiptSha256 = hashBytes(receiptBytes);
  if (outputGraphSha256 !== pointer.executionGraphSha256 || receiptSha256 !== pointer.receiptSha256) return rejected("execution-artifact-hash-mismatch");
  let graph;
  let receipt;
  try {
    graph = JSON.parse(graphBytes.toString("utf8"));
    receipt = JSON.parse(receiptBytes.toString("utf8"));
  } catch {
    return rejected("execution-artifact-json-invalid");
  }
  try {
    assertPublicationEvidence(receipt?.evidence, graph);
  } catch {
    return rejected("execution-publication-gate-invalid");
  }
  try {
    assertExecutionBinding({
      evidence: receipt?.evidence,
      graph,
      parentGraph,
      parentGraphSha256,
      songId: store.safeSongId,
      cutId: store.cutId,
      expectedCutKind: cutKind,
      expectedCutFingerprint: cutFingerprint,
    });
  } catch {
    return rejected("execution-parent-cut-binding-invalid");
  }
  if (
    receipt?.schemaVersion !== ECHO_EXECUTION_GRAPH_RECEIPT_SCHEMA
    || receipt?.status !== "ready"
    || receipt?.songId !== store.safeSongId
    || receipt?.cutId !== store.cutId
    || receipt?.cutKind !== pointer.cutKind
    || receipt?.cutFingerprint !== pointer.cutFingerprint
    || receipt?.artifactId !== pointer.artifactId
    || hashValue(receipt?.publicationGate) !== hashValue(receipt?.evidence?.gate)
    || receipt?.parent?.graphSha256 !== parentGraphSha256
    || receipt?.output?.graphSha256 !== outputGraphSha256
    || receipt?.output?.variantHash !== pointer.variantHash
    || text(graph?.directorV2?.variantHash) !== pointer.variantHash
  ) return rejected("execution-receipt-contract-invalid");
  const validation = validateGraph({ project, graph });
  if (!validation?.ok) return rejected("execution-graph-validation-failed", { validation });
  return {
    ok: true,
    status: "ready",
    graph,
    receipt,
    pointer,
    graphPath: graphReal,
    receiptPath: receiptReal,
    sourceHash: outputGraphSha256,
    sourceBytes: graphBytes.byteLength,
    validation,
  };
}
