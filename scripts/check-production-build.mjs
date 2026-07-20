#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receiptPath = path.join(root, "dist/hapa-echo-delivery-build.json");

try {
  fs.statSync(path.join(root, "dist/index.html"));
  fs.statSync(path.join(root, "dist/assets"));
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  if (!/^sha256:[a-f0-9]{64}$/iu.test(String(receipt.semanticSha256 || ""))) {
    throw new Error("Certified production build receipt is invalid.");
  }
  process.stdout.write(`${JSON.stringify({ ok: true, semanticSha256: receipt.semanticSha256, verification: "receipt-presence" })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, code: "production_build_missing", message: error?.message || String(error) })}\n`);
  process.exit(1);
}
