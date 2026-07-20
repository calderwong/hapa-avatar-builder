#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveAvatarGeneratedMediaRoot } from "../server/avatar-runtime-paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.env.HAPA_AVATAR_LEGACY_GENERATED_MEDIA_ROOT || path.join(root, "public/generated/media-queue"));
const target = resolveAvatarGeneratedMediaRoot();
const runtimeRoot = path.resolve(process.env.HAPA_ECHO_KEYFRAME_RUNTIME_ROOT || path.join(root, "data/echo-scene-keyframes"));
const apply = process.argv.includes("--apply");

function directoryIdentity(directory) {
  try {
    const info = fs.lstatSync(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Expected a real directory: ${directory}`);
    return { exists: true, directory, modifiedAt: info.mtime.toISOString() };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, directory };
    throw error;
  }
}

const sourceIdentity = directoryIdentity(source);
const targetIdentity = directoryIdentity(target);
const legacyPrefix = `${source}${path.sep}`;
const replacementPrefix = `${target}${path.sep}`;
const referenceFiles = [];

function findReferenceFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) findReferenceFiles(candidate);
    else if (entry.isFile() && /\.(?:json|ndjson)$/iu.test(entry.name)) {
      const sourceText = fs.readFileSync(candidate, "utf8");
      const references = sourceText.split(legacyPrefix).length - 1;
      if (references) referenceFiles.push({ filePath: candidate, references, sourceText });
    }
  }
}

findReferenceFiles(runtimeRoot);
const report = {
  schemaVersion: "hapa.avatar-builder.generated-media-migration.v1",
  apply,
  source: sourceIdentity,
  target: targetIdentity,
  references: {
    runtimeRoot,
    files: referenceFiles.length,
    occurrences: referenceFiles.reduce((total, entry) => total + entry.references, 0),
  },
  action: sourceIdentity.exists
    ? (targetIdentity.exists ? "blocked-target-exists" : "move-directory-and-rewrite-references")
    : (targetIdentity.exists && referenceFiles.length ? "rewrite-references" : "nothing-to-migrate"),
};

if (!apply) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}
if (sourceIdentity.exists && targetIdentity.exists) {
  throw new Error(`Refusing to merge or overwrite an existing generated-media root: ${target}`);
}

if (sourceIdentity.exists) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
}

let backupRoot = null;
if (referenceFiles.length) {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  backupRoot = path.join(root, "data/backups", `generated-media-migration-${timestamp}`);
  for (const entry of referenceFiles) {
    const relativePath = path.relative(runtimeRoot, entry.filePath);
    const backupPath = path.join(backupRoot, relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(entry.filePath, backupPath);
    const temporary = `${entry.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, entry.sourceText.split(legacyPrefix).join(replacementPrefix), "utf8");
    fs.renameSync(temporary, entry.filePath);
  }
}

process.stdout.write(`${JSON.stringify({
  ...report,
  action: sourceIdentity.exists ? "moved-and-rewrote-references" : "rewrote-references",
  backupRoot,
  completedAt: new Date().toISOString(),
}, null, 2)}\n`);
