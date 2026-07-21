#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");

if (outIndex === -1 || !argv[outIndex + 1]) {
  console.error("Usage: npm run judge:package -- --out /absolute/path/to/new-package-directory");
  process.exit(2);
}

const outputRoot = path.resolve(argv[outIndex + 1]);
if (outputRoot === repoRoot || repoRoot.startsWith(`${outputRoot}${path.sep}`)) {
  console.error("Refusing an output path that is the repository root or one of its ancestors.");
  process.exit(2);
}
if (existsSync(outputRoot)) {
  console.error(`Refusing to overwrite existing judge package: ${outputRoot}`);
  process.exit(2);
}

const excludedPrefixes = [
  "Hapa Avatar Builder.app/",
  "data/",
  "public-static/media/",
  "public-static/sample/"
];
const excludedExact = new Set([".DS_Store"]);
const isExcluded = (relativePath) =>
  excludedExact.has(relativePath) ||
  relativePath.split("/").includes(".DS_Store") ||
  excludedPrefixes.some((prefix) => relativePath.startsWith(prefix));

const gitOutput = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repoRoot, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8"
}).trim();
const candidates = gitOutput
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((relativePath) => !isExcluded(relativePath))
  .sort((a, b) => a.localeCompare(b));

mkdirSync(outputRoot, { recursive: true });
const files = [];
for (const relativePath of candidates) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(outputRoot, relativePath);
  const stat = lstatSync(source);
  mkdirSync(path.dirname(target), { recursive: true });
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), target);
    files.push({ path: relativePath, kind: "symlink", target: readlinkSync(source) });
    continue;
  }
  if (!stat.isFile()) continue;
  copyFileSync(source, target);
  const bytes = readFileSync(source);
  files.push({
    path: relativePath,
    kind: "file",
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
}

const manifest = {
  schemaVersion: "hapa.build-week.judge-package.v1",
  generatedAt: new Date().toISOString(),
  sourceCommit,
  packageType: "source-plus-public-safe-bootstrap",
  truthBoundary: {
    runtimeData: "excluded; a curated tracked public demo bootstraps 3 RGB Avatars, 3 Echo State Song Cards, 33 sampled/profile-required foundation Cards, and the complete 16-card Build Week Wisdom Set",
    generatedMedia: "runtime generated media excluded; the 16 explicitly curated Build Week Wisdom Set proposal images are included with review and lineage metadata",
    thirdPartyReferenceMedia: "excluded",
    localModels: "not bundled",
    rosterBoundary: "the remaining private Avatar, Song, Tarot, media, and Card rosters are not bundled",
    p2pClaim: "two-profile encrypted local proof; not an internet-scale deployment claim"
  },
  excludedPrefixes,
  fileCount: files.length,
  files
};
writeFileSync(
  path.join(outputRoot, "JUDGE_PACKAGE_MANIFEST.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(JSON.stringify({ ok: true, outputRoot, sourceCommit, fileCount: files.length }, null, 2));
