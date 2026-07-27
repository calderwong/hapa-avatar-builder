#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildEchoReferenceGptImageBenchmarkManifest,
  mergeEchoReferenceGptImageBenchmarkManifest,
} from "../src/domain/echo-reference-gpt-image-benchmark.js";
import { buildEchoReferenceCardSvg } from "../src/domain/echo-reference-local-art.js";

const root = process.cwd();
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "plan";
const defaultRuntimeRoot = path.join(root, "data", "echo-reference-gpt-image-benchmarks");
const manifestPath = path.resolve(option("--manifest", path.join(defaultRuntimeRoot, "manifest.json")));
const runPath = path.resolve(option("--run", path.join(root, "data", "echo-reference-mining", "latest.json")));
const outputRoot = path.resolve(option("--output-root", path.join(root, "data", "media", "echo-reference-gpt-image-benchmarks")));

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function options(name) {
  return [...new Set(args.filter((arg) => arg.startsWith(`${name}=`)).map((arg) => arg.slice(name.length + 1)))];
}

function integerOption(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "reference";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, value, encoding = null) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, value, encoding ? { encoding, mode: 0o600 } : { mode: 0o600 });
  await rename(temporary, filePath);
}

async function atomicWriteJson(filePath, value) {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function summary(manifest = {}) {
  const statuses = {};
  for (const job of manifest.jobs || []) statuses[job.status] = (statuses[job.status] || 0) + 1;
  return {
    schemaVersion: manifest.schemaVersion,
    manifestHash: manifest.manifestHash,
    sourceRunId: manifest.sourceRunId,
    jobs: manifest.jobs?.length || 0,
    statuses,
    eligibility: manifest.eligibility,
    manifestPath,
    outputRoot,
  };
}

async function plan() {
  const run = await readJson(runPath);
  const previous = await readJson(manifestPath, { jobs: [] });
  const planned = buildEchoReferenceGptImageBenchmarkManifest(run, { cardIds: options("--card") });
  let manifest = mergeEchoReferenceGptImageBenchmarkManifest(previous, planned);
  for (const mergePath of options("--merge-manifest")) {
    const prior = await readJson(path.resolve(mergePath), { jobs: [] });
    manifest = mergeEchoReferenceGptImageBenchmarkManifest(prior, manifest);
  }
  const apply = args.includes("--apply");
  if (apply) await atomicWriteJson(manifestPath, manifest);
  console.log(JSON.stringify({ ok: true, command: "plan", applied: apply, providerCalls: 0, ...summary(manifest) }, null, 2));
}

async function next() {
  const manifest = await readJson(manifestPath);
  const jobs = (manifest.jobs || [])
    .filter((job) => job.status === "planned")
    .slice(0, integerOption("--limit", 4))
    .map((job) => ({
      ordinal: job.ordinal,
      jobId: job.id,
      cardId: job.source.cardId,
      title: job.source.title,
      prompt: job.prompt,
    }));
  console.log(JSON.stringify({ ok: true, command: "next", providerCalls: 0, jobs }, null, 2));
}

async function importImage() {
  if (!args.includes("--apply")) throw new Error("GPT Image benchmark import requires --apply.");
  const manifest = await readJson(manifestPath);
  const cardId = option("--card");
  const sourcePath = path.resolve(option("--image"));
  const index = (manifest.jobs || []).findIndex((job) => job.source.cardId === cardId);
  if (index < 0) throw new Error(`Unknown benchmark Card ${cardId}.`);
  const sourceBytes = await readFile(sourcePath);
  const sourceSha256 = sha256(sourceBytes);
  const signature = sourceBytes.subarray(0, 12).toString("hex");
  const mediaType = signature.startsWith("89504e470d0a1a0a")
    ? "image/png"
    : signature.startsWith("ffd8ff")
      ? "image/jpeg"
      : signature.startsWith("52494646") ? "image/webp" : "";
  if (!mediaType) throw new Error("Benchmark import accepts PNG, JPEG, or WebP images only.");
  const job = manifest.jobs[index];
  const directory = path.join(outputRoot, safeSegment(cardId));
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/webp" ? "webp" : "png";
  const rawPath = path.join(directory, `gpt-image-raw.${extension}`);
  const svgPath = path.join(directory, "gpt-image-reference-card.svg");
  await mkdir(directory, { recursive: true });
  if (await exists(rawPath) && sha256(await readFile(rawPath)) !== sourceSha256) {
    throw new Error(`Refusing to overwrite a different GPT Image artifact for ${cardId}.`);
  }
  if (!await exists(rawPath)) await copyFile(sourcePath, rawPath);
  const svg = buildEchoReferenceCardSvg({
    imageBytes: sourceBytes,
    imageMediaType: mediaType,
    title: job.source.title,
    context: job.scene.thesis,
    citationUrl: job.source.citationUrl,
    cardId,
    candidateId: job.id,
    imageSha256: sourceSha256,
    palette: job.scene.palette,
  });
  const svgBytes = Buffer.from(svg);
  await atomicWrite(svgPath, svgBytes);
  manifest.jobs[index] = {
    ...job,
    status: "review-required",
    rawArtifact: {
      localPath: rawPath,
      sha256: sourceSha256,
      mediaType,
      generator: manifest.generator,
      generatedProposal: true,
      previewVisibility: "visible-before-review",
      humanReviewRequired: true,
    },
    assembledArtifact: {
      localPath: svgPath,
      sha256: sha256(svgBytes),
      mediaType: "image/svg+xml",
      deterministicAssembly: true,
      previewVisibility: "visible-before-review",
    },
  };
  await atomicWriteJson(manifestPath, manifest);
  console.log(JSON.stringify({ ok: true, command: "import", providerCalls: 0, cardId, rawPath, svgPath, ...summary(manifest) }, null, 2));
}

async function status() {
  console.log(JSON.stringify({ ok: true, command: "status", providerCalls: 0, ...summary(await readJson(manifestPath)) }, null, 2));
}

async function gallery() {
  if (!args.includes("--apply")) throw new Error("GPT Image benchmark gallery requires --apply.");
  const manifest = await readJson(manifestPath);
  const completed = (manifest.jobs || []).filter((job) => job.rawArtifact?.localPath);
  const cards = completed.map((job) => {
    const relativeImagePath = path.relative(outputRoot, job.rawArtifact.localPath).split(path.sep).join("/");
    return `
      <article class="card">
        <a href="${escapeHtml(relativeImagePath)}"><img loading="lazy" src="${escapeHtml(relativeImagePath)}" alt=""></a>
        <div class="copy">
          <p class="ordinal">${String(job.ordinal).padStart(2, "0")} · ${escapeHtml(job.status)}</p>
          <h2>${escapeHtml(job.source.title)}</h2>
          <p>${escapeHtml(job.scene.thesis)}</p>
          <p class="meta">${escapeHtml(job.source.cardId)}</p>
        </div>
      </article>`;
  }).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reference Atlas · GPT Image benchmark</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#071116; color:#e9f5f2; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top,#14302f 0,#071116 42rem); }
    header { max-width:1500px; margin:auto; padding:48px 28px 28px; }
    h1 { margin:0 0 10px; font-size:clamp(2rem,5vw,4.5rem); line-height:.95; }
    header p { max-width:850px; color:#afc9c3; font-size:1.05rem; line-height:1.6; }
    .status { color:#ffd878; text-transform:uppercase; letter-spacing:.16em; font-size:.75rem; }
    main { max-width:1500px; margin:auto; padding:0 28px 64px; display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:22px; }
    .card { overflow:hidden; border:1px solid #27433f; border-radius:18px; background:#0c1a1d; box-shadow:0 18px 45px #0007; }
    .card img { display:block; width:100%; aspect-ratio:3/4; object-fit:cover; background:#071116; }
    .copy { padding:17px 18px 20px; }
    .ordinal,.meta { margin:0 0 9px; color:#7eb3a7; font-size:.72rem; letter-spacing:.08em; text-transform:uppercase; }
    .copy h2 { margin:0 0 9px; font-size:1.05rem; line-height:1.25; }
    .copy p:not(.ordinal):not(.meta) { margin:0 0 14px; color:#b9ceca; font-size:.84rem; line-height:1.45; }
    .meta { margin:0; overflow-wrap:anywhere; text-transform:none; letter-spacing:0; }
  </style>
</head>
<body>
  <header>
    <p class="status">Human review required · generated proposal · not canon</p>
    <h1>Reference Atlas<br>GPT Image benchmarks</h1>
    <p>${completed.length} high-water visual proposals generated from the source-backed Reference Atlas. The image is never the evidence record: title, thesis, citation, eligibility, and provenance remain deterministic Atlas data.</p>
  </header>
  <main>${cards}</main>
</body>
</html>
`;
  const galleryPath = path.join(outputRoot, "index.html");
  const receiptPath = path.join(outputRoot, "manifest-receipt.json");
  await atomicWrite(galleryPath, html, "utf8");
  await copyFile(manifestPath, receiptPath);
  console.log(JSON.stringify({
    ok: true,
    command: "gallery",
    providerCalls: 0,
    cards: completed.length,
    galleryPath,
    receiptPath,
    ...summary(manifest),
  }, null, 2));
}

try {
  if (command === "plan") await plan();
  else if (command === "next") await next();
  else if (command === "import") await importImage();
  else if (command === "status") await status();
  else if (command === "gallery") await gallery();
  else throw new Error(`Unknown command ${command}. Expected plan, next, import, status, or gallery.`);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    command,
    error: {
      code: String(error?.code || "echo_reference_gpt_image_benchmark_failed"),
      message: String(error?.message || error),
    },
  }, null, 2));
  process.exitCode = 1;
}
