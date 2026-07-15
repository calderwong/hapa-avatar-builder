import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectEchoDeliveryRuntimeBuildIdentity,
  snapshotEchoDeliveryBuildInputs,
  writeEchoDeliveryBuildReceipt,
} from "../server/echo-delivery-runtime-build.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-delivery-build-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ["src/components", "dist/assets", "dist/media", "dist/sample"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "export default function HapaEchosView(){return null}\n");
  fs.writeFileSync(path.join(root, "src/components/TarotDraw3DView.jsx"), "export default function TarotDraw3DView(){return null}\n");
  fs.writeFileSync(path.join(root, "src/index.css"), "body{color:#fff}\n");
  fs.writeFileSync(path.join(root, "index.html"), "<div id=\"root\"></div>\n");
  fs.writeFileSync(path.join(root, "vite.config.js"), "export default {}\n");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module" }));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3 }));
  fs.writeFileSync(path.join(root, "dist/index.html"), "<script src=\"/assets/app.js\"></script>\n");
  fs.writeFileSync(path.join(root, "dist/assets/app.js"), "console.log('fixture')\n");
  fs.writeFileSync(path.join(root, "dist/media/clip.bin"), "clip-v1");
  fs.writeFileSync(path.join(root, "dist/sample/readme.txt"), "sample-v1");
  fs.symlinkSync(path.join(projectRoot, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

function stamp(root) {
  const before = snapshotEchoDeliveryBuildInputs({ root });
  return writeEchoDeliveryBuildReceipt({
    root,
    expectedSourceSha256: before.sourceSha256,
    expectedBuildToolSha256: before.buildToolSha256,
  });
}

test("delivery identity requires a pre-build token and binds source to the whole served dist", async (t) => {
  const root = fixture(t);
  assert.throws(() => writeEchoDeliveryBuildReceipt({ root }), /requires the exact pre-build/i);
  const firstReceipt = stamp(root);
  const first = await inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true });
  assert.equal(first.buildReceipt.semanticSha256, firstReceipt.semanticSha256);
  assert.ok(first.servedBundle.files.some((entry) => entry.path === "dist/media/clip.bin"));
  assert.ok(first.servedBundle.files.some((entry) => entry.path === "dist/sample/readme.txt"));
  assert.ok(!first.servedBundle.files.some((entry) => entry.path.endsWith("hapa-echo-delivery-build.json")));

  fs.writeFileSync(path.join(root, "dist/media/new.bin"), "new");
  await assert.rejects(
    inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true }),
    (error) => error?.code === "delivery_build_receipt_stale",
  );
  fs.rmSync(path.join(root, "dist/media/new.bin"));
  fs.writeFileSync(path.join(root, "dist/sample/readme.txt"), "sample-v2");
  await assert.rejects(
    inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true }),
    (error) => error?.code === "delivery_build_receipt_stale",
  );

  const secondReceipt = stamp(root);
  const second = await inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true });
  assert.notEqual(second.sha256, first.sha256);
  const repeatedReceipt = stamp(root);
  assert.equal(repeatedReceipt.semanticSha256, secondReceipt.semanticSha256, "generatedAt is not semantic build identity");
});

test("delivery cache invalidates on source, receipt, removal, and dist symlink drift", async (t) => {
  const root = fixture(t);
  stamp(root);
  await inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true });

  fs.appendFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "// changed\n");
  await assert.rejects(inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true }), (error) => error?.code === "delivery_build_receipt_stale");
  stamp(root);
  await inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true });

  const receiptPath = path.join(root, "dist/hapa-echo-delivery-build.json");
  fs.rmSync(receiptPath);
  await assert.rejects(inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true }), (error) => error?.code === "delivery_build_receipt_stale");
  stamp(root);
  await inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true });

  fs.rmSync(path.join(root, "dist/media/clip.bin"));
  await assert.rejects(inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true }), (error) => error?.code === "delivery_build_receipt_stale");
  fs.writeFileSync(path.join(root, "dist/media/clip.bin"), "clip-v1");
  stamp(root);

  fs.symlinkSync(path.join(root, "dist/assets/app.js"), path.join(root, "dist/media/link.js"));
  await assert.rejects(inspectEchoDeliveryRuntimeBuildIdentity({ root, refresh: true }), /symlinks are unsupported/i);
});

test("delivery receipt refuses a symlinked dist root", (t) => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "echo-delivery-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.cpSync(path.join(root, "dist"), outside, { recursive: true });
  fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(root, "dist"), "dir");
  const before = snapshotEchoDeliveryBuildInputs({ root });
  assert.throws(() => writeEchoDeliveryBuildReceipt({
    root,
    expectedSourceSha256: before.sourceSha256,
    expectedBuildToolSha256: before.buildToolSha256,
  }), /dist root must be a real, non-symlink directory/i);
});
