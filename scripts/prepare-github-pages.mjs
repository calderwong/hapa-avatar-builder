#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const demoSource = path.join(root, "public-static", "demo");
const demoTarget = path.join(distRoot, "demo");

if (!fs.existsSync(path.join(distRoot, "index.html"))) {
  throw new Error("GitHub Pages preparation requires a completed Vite build.");
}
if (!fs.existsSync(demoSource)) {
  throw new Error("Curated public demo assets are missing.");
}

fs.rmSync(demoTarget, { recursive: true, force: true });
fs.cpSync(demoSource, demoTarget, { recursive: true });
fs.writeFileSync(path.join(distRoot, ".nojekyll"), "");
fs.copyFileSync(path.join(distRoot, "index.html"), path.join(distRoot, "404.html"));

const required = [
  "index.html",
  "404.html",
  ".nojekyll",
  "demo/red-avatar.svg",
  "demo/blue-avatar.svg",
  "demo/green-avatar.svg",
];
for (const relativePath of required) {
  if (!fs.existsSync(path.join(distRoot, relativePath))) {
    throw new Error(`GitHub Pages artifact is missing ${relativePath}.`);
  }
}

const forbidden = ["media", "sample", "generated"];
for (const relativePath of forbidden) {
  if (fs.existsSync(path.join(distRoot, relativePath))) {
    throw new Error(`GitHub Pages artifact unexpectedly includes ${relativePath}/.`);
  }
}

const html = fs.readFileSync(path.join(distRoot, "index.html"), "utf8");
if (!html.includes("/hapa-avatar-builder/assets/")) {
  throw new Error("GitHub Pages artifact was not built with the repository base path.");
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  schemaVersion: "hapa.avatar-builder.github-pages-artifact.v1",
  basePath: "/hapa-avatar-builder/",
  demoAvatars: ["red-reaper", "avatar-2", "avatar-3"],
  publicAssetBoundary: "public-static/demo-only",
})}\n`);
