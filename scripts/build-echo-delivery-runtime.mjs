#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  snapshotEchoDeliveryBuildInputs,
  writeEchoDeliveryBuildReceipt,
} from "../server/echo-delivery-runtime-build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const before = snapshotEchoDeliveryBuildInputs({ root });
const result = spawnSync(before.nodePath, [before.viteCliPath, "build"], { cwd: root, stdio: "inherit" });
if (result.error || result.status !== 0) {
  process.stderr.write(`${result.error?.message || `Vite exited ${result.status}`}\n`);
  process.exit(result.status || 1);
}

try {
  const receipt = writeEchoDeliveryBuildReceipt({
    root,
    expectedSourceSha256: before.sourceSha256,
    expectedBuildToolSha256: before.buildToolSha256,
  });
  if (!fs.existsSync(receipt.receiptPath)) throw new Error("Delivery build receipt was not persisted.");
  process.stdout.write(`Echo delivery receipt ${receipt.semanticSha256}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
