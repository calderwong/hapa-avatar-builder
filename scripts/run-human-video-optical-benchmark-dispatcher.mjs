#!/usr/bin/env node
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHumanVideoOpticalBenchmarkDispatcherService } from "../server/human-video-optical-benchmark-dispatcher.mjs";

const [command, ...values] = process.argv.slice(2);
const args = Object.fromEntries(values.filter((value) => value.startsWith("--")).map((value) => { const [key, ...rest] = value.slice(2).split("="); return [key, rest.join("=") || true]; }));
const storePath = path.resolve(String(args.store || "work/human-video-mechanical-benchmark/store.json"));
const receiptRoot = path.resolve(String(args.receipts || "work/human-video-mechanical-benchmark/receipts"));
const service = createHumanVideoOpticalBenchmarkDispatcherService({ storePath, receiptRoot, leaseMs: Number(args.leaseMs || 90_000) });
let result;
if (command === "init") {
  const packetRoot = path.resolve(String(args.packets));
  const limit = Math.max(1, Math.trunc(Number(args.limit || 40)));
  const files = (await readdir(packetRoot)).filter((name) => name.endsWith(".json")).sort().slice(0, limit);
  const jobs = await Promise.all(files.map(async (name, index) => {
    const packetPath = path.join(packetRoot, name);
    const packet = JSON.parse(await readFile(packetPath, "utf8"));
    return { id: `mechanical:${packet.ordinal || index + 1}:${packet.job.id}`, ordinal: packet.ordinal || index + 1, videoKey: packet.job.videoKey, packetPath };
  }));
  result = { ok: true, store: await service.initialize(jobs), jobs: jobs.length };
} else if (command === "claim") {
  result = { ok: true, ...(await service.claim(String(args.worker))) };
} else if (command === "submit") {
  result = { ok: true, ...(await service.submit({ receiptId: String(args.receiptId), workerId: String(args.worker), leaseId: String(args.leaseId) })) };
} else if (command === "submit-claim") {
  const claim = JSON.parse(await readFile(path.resolve(String(args.claim)), "utf8"));
  result = { ok: true, ...(await service.submit({ receiptId: claim.claim.receiptId, workerId: String(args.worker), leaseId: claim.claim.leaseId })) };
} else if (command === "fail") {
  result = { ok: true, ...(await service.fail({ receiptId: String(args.receiptId), workerId: String(args.worker), leaseId: String(args.leaseId), failureReason: String(args.reason || "worker-failed") })) };
} else if (command === "status") {
  const store = await service.read();
  result = { ok: true, store, summary: { queued: store.jobs.filter((job) => job.status === "queued").length, pending: store.jobs.filter((job) => job.status === "pending-receipt").length, retryable: store.jobs.filter((job) => job.status === "retryable").length, accepted: store.jobs.filter((job) => job.status === "accepted").length } };
} else {
  throw new Error("Usage: run-human-video-optical-benchmark-dispatcher.mjs init|claim|submit|fail|status --store=... --receipts=...");
}
if (args.out) await atomicJson(path.resolve(String(args.out)), result);
console.log(JSON.stringify(result, null, 2));

async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}
