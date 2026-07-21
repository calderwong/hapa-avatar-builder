#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const rootIndex = argv.indexOf("--root");
if (rootIndex === -1 || !argv[rootIndex + 1]) {
  console.error("Usage: npm run judge:preflight -- --root /absolute/path/to/judge-package");
  process.exit(2);
}

const root = path.resolve(argv[rootIndex + 1]);
const failures = [];
const required = [
  "JUDGE_PACKAGE_MANIFEST.json",
  "package.json",
  "package-lock.json",
  "vendor/hapa-overcard-0.1.1.tgz",
  "fixtures/build-week/judge-data/avatar-store.json",
  "fixtures/build-week/judge-data/dear-papa-songbook.json",
  "fixtures/build-week/judge-data/hapa-songs-store.json",
  "fixtures/build-week/judge-data/inventory-store.json",
  "fixtures/build-week/judge-data/item-manager-store.json",
  "fixtures/build-week/judge-data/tarot-store.json",
  "fixtures/build-week/judge-data/ballad-of-bella-packet.json",
  "fixtures/build-week/judge-data/kanban.json",
  "docs/submission/JUDGE_QUICKSTART.md",
  "docs/submission/PUBLIC_SAFE_FIXTURE_BOUNDARY.md",
  "docs/submission/CODEX_BUILD_WEEK_DEVPOST_FIELDS_FINAL_DRAFT.md",
  "docs/submission/RIGHTS_PRIVACY_CLAIM_AUDIT.md",
  "docs/submission/SUBMISSION_PREFLIGHT_RECEIPT.md"
];
for (const relativePath of required) {
  if (!existsSync(path.join(root, relativePath))) failures.push(`missing:${relativePath}`);
}

for (const forbidden of [".git", "node_modules", "dist", "artifacts", "data", "public-static/media", "public-static/sample"]) {
  if (existsSync(path.join(root, forbidden))) failures.push(`forbidden:${forbidden}`);
}

const manifestPath = path.join(root, "JUDGE_PACKAGE_MANIFEST.json");
let manifest = null;
if (existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    failures.push(`invalid-manifest:${error.message}`);
  }
}

if (manifest?.files) {
  for (const entry of manifest.files) {
    const absolutePath = path.join(root, entry.path);
    if (!existsSync(absolutePath)) {
      failures.push(`manifest-missing:${entry.path}`);
      continue;
    }
    const stat = lstatSync(absolutePath);
    if (entry.kind === "file" && stat.isFile()) {
      const digest = createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
      if (digest !== entry.sha256) failures.push(`manifest-hash:${entry.path}`);
    }
  }
}

if (existsSync(path.join(root, "package.json")) && existsSync(path.join(root, "overcard-release.lock.json"))) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(path.join(root, "overcard-release.lock.json"), "utf8"));
  const specifier = packageJson.dependencies?.["@hapa/overcard"];
  if (specifier !== lock.judgePackaging?.specifier) failures.push("overcard-specifier-mismatch");
  const tarball = path.join(root, "vendor/hapa-overcard-0.1.1.tgz");
  if (existsSync(tarball)) {
    const digest = createHash("sha256").update(readFileSync(tarball)).digest("hex");
    if (digest !== lock.judgePackaging?.sha256) failures.push("overcard-tarball-hash-mismatch");
  }
}

const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sh", ".txt", ".zsh"]);
const secretPatterns = [
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "openai-style-secret", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ }
];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (entry.isDirectory()) {
      walk(absolutePath);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const text = readFileSync(absolutePath, "utf8");
    for (const pattern of secretPatterns) {
      if (pattern.regex.test(text)) failures.push(`secret-pattern:${pattern.name}:${relativePath}`);
    }
  }
};
if (existsSync(root)) walk(root);

const result = {
  ok: failures.length === 0,
  root,
  sourceCommit: manifest?.sourceCommit ?? null,
  manifestFiles: manifest?.fileCount ?? null,
  failures
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
