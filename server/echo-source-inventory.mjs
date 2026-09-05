import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

export const echoInventoryHash = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const stamp = info => `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`;

export function echoSourceContainer(header) {
  if (header.subarray(0, 3).toString() === "ID3" || (header[0] === 255 && (header[1] & 224) === 224)) return "mp3";
  if (header.subarray(0, 4).toString() === "fLaC") return "flac";
  if (header.subarray(0, 4).toString() === "OggS") return "ogg";
  if (header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WAVE") return "wav";
  if (header.subarray(4, 8).toString() === "ftyp") return "mp4-container";
  if (header[0] === 80 && header[1] === 75) return "archive";
  return "unknown";
}

/** Byte identity only. Header recognition is never called full-decode proof. */
export function createEchoSourceInspector({ cache = {} } = {}) {
  let bytesHashed = 0, cacheHits = 0;
  const pending = new Map();
  async function inspect(file) {
    if (!file) return { path: null, status: "missing-reference", usable: false };
    if (pending.has(file)) return pending.get(file);
    const work = (async () => {
      try {
        const before = await stat(file);
        if (!before.isFile() || !before.size) return { path: file, status: "empty-or-nonfile", usable: false };
        if (cache[file]?.stamp === stamp(before)) { cacheHits++; return cache[file].result; }
        const handle = await open(file, "r");
        const header = Buffer.alloc(16);
        try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
        const container = echoSourceContainer(header);
        let sha256 = null;
        // Archives are containers for other assets, never a playable stem bus.
        if (container !== "archive") {
          const digest = createHash("sha256");
          for await (const chunk of createReadStream(file)) { digest.update(chunk); bytesHashed += chunk.length; }
          sha256 = digest.digest("hex");
        }
        if (stamp(await stat(file)) !== stamp(before)) throw new Error("source_changed_during_hash");
        const result = { path: file, status: container === "archive" ? "archive-excluded" : "bytes-verified",
          bytes: before.size, sha256, container, audioHeaderRecognized: !["unknown", "archive"].includes(container),
          decodeVerified: false, usable: null };
        cache[file] = { stamp: stamp(before), result };
        return result;
      } catch (error) { return { path: file, status: error.code === "ENOENT" ? "missing-file" : "read-error", error: error.message, usable: false }; }
    })();
    pending.set(file, work);
    try { return await work; } finally { pending.delete(file); }
  }
  return { inspect, cache, metrics: () => ({ bytesHashed, cacheHits }) };
}

export function classifyEchoStemGap({ declared = [], projectRoles = [], registryParentId, inspected = [] }) {
  const audio = inspected.filter(row => row.container !== "archive" && row.status !== "role-declaration-only");
  const failures = audio.filter(row => row.status !== "bytes-verified" || !row.audioHeaderRecognized);
  return {
    storeCount: declared.length, projectRoles, audioResourceCount: audio.length,
    archiveCount: inspected.filter(row => row.container === "archive").length,
    roleDeclarationCount: inspected.filter(row => row.status === "role-declaration-only").length,
    sourceFailures: failures.length,
    registryRecoverableFailures: failures.filter(row => row.registryResource?.status === "bytes-verified" && row.registryResource.audioHeaderRecognized).length,
    reason: !declared.length ? "no-store-stems"
      : !projectRoles.length ? failures.length ? "project-omits-stems-and-source-verification-incomplete" : "readable-store-stems-omitted-by-project"
      : "project-declares-stems",
    registryParentId, alignmentVerified: false,
  };
}

export function reconcileEchoAcceptance({ currentContractHash, historicalLyricRow, selectedCut, renderReceipt, projectHumanReviewed }) {
  const matched = renderReceipt?.cuts?.find(cut => cut.cutId === selectedCut?.id);
  return {
    projectHumanReviewed: projectHumanReviewed === true,
    historicalLyrics: historicalLyricRow ? { status: historicalLyricRow.status, contractHash: historicalLyricRow.contractHash,
      matchesCurrentContract: historicalLyricRow.contractHash === currentContractHash, kind: "automated-lyric-contract" } : null,
    render: matched ? { status: matched.status, cutId: matched.cutId, cutFingerprint: matched.cutFingerprint,
      matchesCurrentCut: Boolean(selectedCut?.fingerprint) && matched.cutFingerprint === selectedCut.fingerprint,
      generatedAt: renderReceipt.generatedAt, kind: "automated-render-readiness", currentEnvironmentRevalidated: false } : null,
    humanTaste: "not-established-by-these-receipts",
    note: "Human Enricher accepted media and human-accepted cut filenames do not establish human lyric timing or final-cut taste acceptance.",
  };
}
