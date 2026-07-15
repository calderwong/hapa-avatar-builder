import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  stableCertificationFileProof,
  stableCertificationFileSha256,
} from "../server/stable-certification-file-proof.mjs";

test("stable certification file proof preserves the raw-byte registry SHA semantics", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-proof-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, "registry.json");
  const bytes = Buffer.from('{"registry":"fixture"}\n', "utf8");
  fs.writeFileSync(registryPath, bytes);

  const proof = stableCertificationFileProof(registryPath, { label: "Fixture registry" });
  assert.equal(proof.sha256, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  assert.equal(stableCertificationFileSha256(registryPath, { cache: new Map() }), proof.sha256);
  assert.deepEqual(proof.bytes, bytes, "JSON plan/project callers still receive the complete stable byte snapshot");
  assert.equal(proof.path, path.resolve(registryPath));
  assert.ok(proof.statIdentity.length > 0);
});

test("stable certification file proof rejects a final-component symlink", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-symlink-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetPath = path.join(root, "target.json");
  const registryPath = path.join(root, "registry.json");
  fs.writeFileSync(targetPath, '{"registry":"target"}\n');
  fs.symlinkSync(targetPath, registryPath);

  assert.throws(
    () => stableCertificationFileProof(registryPath, { label: "Fixture registry" }),
    (error) => error?.code === "CERTIFICATION_FILE_SYMLINK",
  );
});

test("stable certification file proof rejects path replacement during a descriptor-bound read", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-race-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, "registry.json");
  const displacedPath = path.join(root, "registry.displaced.json");
  fs.writeFileSync(registryPath, '{"registry":"first"}\n');

  assert.throws(
    () => stableCertificationFileProof(registryPath, {
      label: "Fixture registry",
      readDescriptor: (descriptor) => {
        const bytes = fs.readFileSync(descriptor);
        fs.renameSync(registryPath, displacedPath);
        fs.writeFileSync(registryPath, '{"registry":"replacement"}\n');
        return bytes;
      },
    }),
    (error) => error?.code === "CERTIFICATION_FILE_PATH_REPLACED",
  );
});

test("stable registry digest cache skips unchanged bytes and misses same-size replacement or metadata drift", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-digest-cache-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, "registry.json");
  const replacementPath = path.join(root, "replacement.json");
  fs.writeFileSync(registryPath, "aaaa\n");
  const cache = new Map();
  let byteReads = 0;
  const readDescriptor = (descriptor) => {
    byteReads += 1;
    return fs.readFileSync(descriptor);
  };

  const first = stableCertificationFileSha256(registryPath, { cache, readDescriptor });
  assert.equal(first, `sha256:${createHash("sha256").update("aaaa\n").digest("hex")}`);
  const unchanged = stableCertificationFileSha256(registryPath, { cache, readDescriptor });
  assert.equal(unchanged, first);
  assert.equal(byteReads, 1, "an unchanged full-identity hit must not reread registry bytes");

  const originalStat = fs.statSync(registryPath);
  fs.writeFileSync(replacementPath, "bbbb\n");
  fs.utimesSync(replacementPath, originalStat.atime, originalStat.mtime);
  fs.renameSync(replacementPath, registryPath);
  const replacement = stableCertificationFileSha256(registryPath, { cache, readDescriptor });
  assert.notEqual(replacement, first);
  assert.equal(byteReads, 2, "a same-size replacement with restored mtime must miss on inode/ctime identity");

  const driftedTime = new Date(Date.now() + 2_000);
  fs.utimesSync(registryPath, driftedTime, driftedTime);
  const metadataDrift = stableCertificationFileSha256(registryPath, { cache, readDescriptor });
  assert.equal(metadataDrift, replacement);
  assert.equal(byteReads, 3, "metadata drift must miss even when the bytes and resulting digest are unchanged");
});

test("a cache hit cannot return a stale digest across a path-replacement race", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-cache-race-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registryPath = path.join(root, "registry.json");
  const displacedPath = path.join(root, "registry.displaced.json");
  fs.writeFileSync(registryPath, "first\n");
  const cache = new Map();
  let byteReads = 0;
  const readDescriptor = (descriptor) => {
    byteReads += 1;
    return fs.readFileSync(descriptor);
  };
  stableCertificationFileSha256(registryPath, { cache, readDescriptor });
  const get = cache.get.bind(cache);
  let replaced = false;
  cache.get = (key) => {
    const value = get(key);
    if (value && !replaced) {
      replaced = true;
      fs.renameSync(registryPath, displacedPath);
      fs.writeFileSync(registryPath, "other\n");
    }
    return value;
  };

  assert.throws(
    () => stableCertificationFileSha256(registryPath, { cache, readDescriptor }),
    (error) => error?.code === "CERTIFICATION_FILE_PATH_REPLACED",
  );
  assert.equal(byteReads, 1, "a raced cache hit must be rejected without returning or rereading stale bytes");
});

test("stable registry digest cache stays bounded and never trusts a cached symlink path", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-registry-cache-bound-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = new Map();
  const paths = ["one", "two", "three"].map((name) => {
    const filePath = path.join(root, `${name}.json`);
    fs.writeFileSync(filePath, `${name}\n`);
    return filePath;
  });
  for (const filePath of paths) stableCertificationFileSha256(filePath, { cache, cacheLimit: 2 });
  assert.equal(cache.size, 2);

  const displacedPath = path.join(root, "three.displaced.json");
  fs.renameSync(paths[2], displacedPath);
  fs.symlinkSync(displacedPath, paths[2]);
  assert.throws(
    () => stableCertificationFileSha256(paths[2], { cache, cacheLimit: 2 }),
    (error) => error?.code === "CERTIFICATION_FILE_SYMLINK",
  );
});

test("Echo registry identities use the descriptor-bound proof instead of a bare path read", () => {
  const source = fs.readFileSync(new URL("../server/api.mjs", import.meta.url), "utf8");
  assert.match(
    source,
    /function echoCertificationFileSha256\(filePath\)[\s\S]*?stableCertificationFileSha256\(filePath,/u,
  );
  assert.doesNotMatch(
    source,
    /function echoCertificationFileSha256\(filePath\)[\s\S]{0,240}?fs\.readFileSync\(filePath\)/u,
  );
});
