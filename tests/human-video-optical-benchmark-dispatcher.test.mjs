import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHumanVideoOpticalBenchmarkDispatcherService } from "../server/human-video-optical-benchmark-dispatcher.mjs";

const frames = ["first", "mid", "last"].map((role, index) => ({ ordinal: index + 1, role, timestampSeconds: index, normalizedPosition: index / 2, imagePath: `/tmp/${role}.jpg`, sha256: `sha256:${String(index + 1).repeat(64)}` }));
const validRaw = {
  description: "A centered subject moves through three clearly differentiated compositions, shifting from a dark opening frame to a brighter middle and a warm final image.",
  palettes: {
    first: ["#102030", "#405060", "#8090A0"],
    middle: ["#182838", "#607080", "#C08040"],
    last: ["#203040", "#A0B0C0", "#D08040"],
  },
};

function boundRaw(claim, overrides = {}) {
  return { ...structuredClone(validRaw), ...claim.packet.outputContract.requiredReceiptEnvelope, ...overrides };
}

test("dispatcher creates pending receipts, blocks overlapping claims, accepts centrally, and retries failures with a fresh lease", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "human-video-mechanical-dispatcher-"));
  const packetPaths = [];
  for (let index = 0; index < 3; index += 1) {
    const packetPath = path.join(root, `packet-${index + 1}.json`);
    await writeFile(packetPath, JSON.stringify({ job: { id: `job:${index + 1}`, videoKey: `video:${index + 1}`, videoId: `${index + 1}`, videoName: `Video ${index + 1}`, frameDigest: `digest:${index + 1}`, frames, attempt: 1, lease: { workerId: "worker-a", claimedAt: "2026-08-08T00:00:00.000Z" }, schedulerTelemetry: { status: "unavailable", source: "test" } } }));
    packetPaths.push(packetPath);
  }
  const service = createHumanVideoOpticalBenchmarkDispatcherService({ storePath: path.join(root, "store.json"), receiptRoot: path.join(root, "receipts"), leaseMs: 90_000 });
  await service.initialize(packetPaths.map((packetPath, index) => ({ id: `job:${index + 1}`, ordinal: index + 1, videoKey: `video:${index + 1}`, packetPath })), "2026-08-08T00:00:00.000Z");
  const first = await service.claim("worker-a", "2026-08-08T00:00:01.000Z");
  assert.equal(JSON.parse(await readFile(first.claim.receiptPath, "utf8")).status, "pending");
  await assert.rejects(() => service.claim("worker-a", "2026-08-08T00:00:02.000Z"), (error) => error.code === "benchmark_dispatcher_previous_receipt_pending");
  await writeFile(first.claim.rawResultPath, JSON.stringify(boundRaw(first.claim)));
  const accepted = await service.submit({ receiptId: first.claim.receiptId, workerId: "worker-a", leaseId: first.claim.leaseId }, "2026-08-08T00:00:03.000Z");
  assert.equal(accepted.accepted, true);
  assert.equal(JSON.parse(await readFile(first.claim.receiptPath, "utf8")).status, "accepted");

  const second = await service.claim("worker-a", "2026-08-08T00:00:04.000Z");
  const invalid = boundRaw(second.claim);
  delete invalid.palettes.first;
  await writeFile(second.claim.rawResultPath, JSON.stringify(invalid));
  const failed = await service.submit({ receiptId: second.claim.receiptId, workerId: "worker-a", leaseId: second.claim.leaseId }, "2026-08-08T00:00:05.000Z");
  assert.equal(failed.accepted, false);
  assert.equal(JSON.parse(await readFile(second.claim.receiptPath, "utf8")).status, "terminal-failed");

  const retry = await service.claim("worker-b", "2026-08-08T00:00:06.000Z");
  assert.equal(retry.claim.packet.job.videoKey, "video:2");
  assert.notEqual(retry.claim.leaseId, second.claim.leaseId);
  assert.equal(retry.claim.packet.job.videoKey, second.claim.packet.job.videoKey);
});

test("dispatcher requires the complete exact receipt envelope before optical normalization", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "human-video-mechanical-binding-"));
  const packetPath = path.join(root, "packet.json");
  await writeFile(packetPath, JSON.stringify({ job: { id: "job:binding", videoKey: "video:binding", videoId: "binding", videoName: "Binding.mp4", frameDigest: "digest:binding", frames, attempt: 1, lease: { workerId: "worker-a", claimedAt: "2026-08-08T00:00:00.000Z" }, schedulerTelemetry: { status: "unavailable", source: "test" } } }));
  const service = createHumanVideoOpticalBenchmarkDispatcherService({ storePath: path.join(root, "store.json"), receiptRoot: path.join(root, "receipts") });
  await service.initialize([{ id: "job:binding", ordinal: 1, videoKey: "video:binding", packetPath }]);
  const claimed = await service.claim("worker-a");
  await writeFile(claimed.claim.rawResultPath, JSON.stringify(boundRaw(claimed.claim, { receiptId: "optical-receipt:wrong" })));
  const failed = await service.submit({ receiptId: claimed.claim.receiptId, workerId: "worker-a", leaseId: claimed.claim.leaseId });
  assert.equal(failed.accepted, false);
  assert.equal(failed.error.code, "benchmark_dispatcher_receipt_binding_mismatch");
  assert.equal(JSON.parse(await readFile(claimed.claim.receiptPath, "utf8")).status, "terminal-failed");
});
