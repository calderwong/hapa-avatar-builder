import fs from "node:fs";
import path from "node:path";

const text = (value) => String(value ?? "").trim();
const SHA256 = /^sha256:[a-f0-9]{64}$/iu;

export function createEchoMintPlanCertificationQueue() {
  const keyedJobs = new Map();
  let tail = Promise.resolve();
  return {
    run(keyInput, task) {
      const key = text(keyInput);
      if (!key || typeof task !== "function") throw new Error("A certification key and task are required.");
      const existing = keyedJobs.get(key);
      if (existing) return existing;
      const scheduled = tail.catch(() => {}).then(task);
      tail = scheduled.catch(() => {});
      let tracked;
      tracked = scheduled.finally(() => {
        if (keyedJobs.get(key) === tracked) keyedJobs.delete(key);
      });
      keyedJobs.set(key, tracked);
      return tracked;
    },
    get size() {
      return keyedJobs.size;
    },
  };
}

function boundedBlocker(row = {}) {
  const message = text(row.message || row.label || row.code).slice(0, 500);
  return {
    stage: text(row.stage).slice(0, 120) || "readiness",
    code: text(row.code).slice(0, 160) || "render-readiness-blocker",
    songId: text(row.songId).slice(0, 200) || null,
    cutId: text(row.cutId).slice(0, 200) || null,
    message: message || "The saved cut did not pass render readiness.",
    ...(text(row?.details?.path || row.path) ? { path: text(row?.details?.path || row.path).slice(0, 1_000) } : {}),
  };
}

export function readFreshEchoPlanCertificationBlockers({
  reportPath,
  planId,
  planSha256,
  startedAtMs,
  maxBytes = 16 * 1024 * 1024,
  maxBlockers = 5,
} = {}) {
  if (!reportPath || !planId || !SHA256.test(text(planSha256))) return null;
  let descriptor;
  try {
    descriptor = fs.openSync(path.resolve(reportPath), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes || stat.mtimeMs + 1_000 < Number(startedAtMs || 0)) return null;
    const report = JSON.parse(fs.readFileSync(descriptor, "utf8"));
    const selection = report?.source?.selection;
    if (
      selection?.mode !== "targeted-exact-plan"
      || text(selection?.planId) !== text(planId)
      || text(selection?.planSha256) !== text(planSha256)
    ) return null;
    const exactCut = (Array.isArray(report?.cuts) ? report.cuts : []).find((cut) => (
      text(cut?.cutId) === text(planId)
      && text(cut?.cutKind) === "saved-mint-plan"
      && text(cut?.cutFingerprint) === text(planSha256)
    ));
    const rows = (Array.isArray(report?.blockers) ? report.blockers : [])
      .filter((row) => (
        !text(row?.cutId)
        || text(row?.cutId) === text(planId)
        || text(row?.songId) === "album"
        || ["global-input", "final-source-cas"].includes(text(row?.stage))
      ));
    const hasGlobalBlocker = rows.some((row) => (
      text(row?.songId) === "album"
      || ["global-input", "final-source-cas"].includes(text(row?.stage))
    ));
    if (!exactCut && !hasGlobalBlocker) return null;
    const blockers = (rows.length ? rows : Array.isArray(exactCut.blockers) ? exactCut.blockers : [])
      .slice(0, Math.max(1, Math.min(20, Number(maxBlockers) || 5)))
      .map(boundedBlocker);
    return {
      schemaVersion: text(report?.schemaVersion) || null,
      status: text(report?.summary?.status) || "blocked",
      blockers,
    };
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}
