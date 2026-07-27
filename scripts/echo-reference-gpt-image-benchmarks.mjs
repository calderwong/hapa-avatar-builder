#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildEchoReferenceGptImageBenchmarkManifest,
  mergeEchoReferenceGptImageBenchmarkManifest,
} from "../src/domain/echo-reference-gpt-image-benchmark.js";
import { echoReferenceArtDigest } from "../src/domain/echo-reference-card-art.js";
import { buildEchoReferenceCardSvg } from "../src/domain/echo-reference-local-art.js";
import { createEchoReferenceMiningStore } from "../server/echo-reference-mining-store.mjs";
import { ECHO_AVATAR_CAST_REGISTRY } from "../src/domain/echo-avatar-cast-registry.js";

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

const CANONICAL_AVATAR_SEEDS = Object.freeze({
  "red-reaper": {
    id: "red-reaper",
    name: "Red",
    path: path.join(root, "data", "media", "chatgpt-image-jun-10-2026-05-42-47-pm-1-source-88bbebd91cf51d88.png"),
  },
  "avatar-2": {
    id: "avatar-2",
    name: "Blue",
    path: path.join(root, "data", "media", "chatgpt-image-may-24-2026-07-21-01-pm-1-1781221375816-2014333.png"),
  },
  "avatar-3": {
    id: "avatar-3",
    name: "Green",
    path: path.join(root, "data", "media", "chatgpt-image-may-24-2026-10-26-52-pm-1-1781222050768-2735317.png"),
  },
});

function referenceTerms(card = {}) {
  return new Set([
    card.title,
    card.summary,
    ...(card.aliases || []),
    ...(card.themes || []),
    ...(card.mechanics || []),
    ...(card.signalLexicon?.literal || []),
    ...(card.signalLexicon?.phonetic || []),
    ...(card.signalLexicon?.orthographic || []),
    ...(card.signalLexicon?.multilingual || []),
  ].flatMap((value) => String(value || "").toLowerCase().split(/[^a-z0-9]+/)).filter((value) => value.length >= 4));
}

function overlapScore(left = new Set(), right = new Set()) {
  let score = 0;
  for (const value of left) if (right.has(value)) score += 1;
  return score;
}

function deterministicIndex(value, length) {
  if (!length) return -1;
  const digest = createHash("sha256").update(String(value || "")).digest();
  return digest.readUInt32BE(0) % length;
}

async function buildReferenceImagePacks(run = {}) {
  const [songStore, animatedMedia] = await Promise.all([
    readJson(path.join(root, "data", "hapa-songs-store.json"), { songs: [] }),
    readJson(path.join(root, "data", "echo-reference-animated-media.json"), { records: [] }),
  ]);
  const songById = new Map((songStore.songs || []).map((song) => [song.id, song]));
  const cardById = new Map((run.cards || []).map((card) => [card.id, card]));
  const mediaByCardId = new Map((animatedMedia.records || []).map((record) => [record.card?.id, record]));
  const mediaCardsBySongId = new Map();
  for (const [cardId, record] of mediaByCardId) {
    const card = cardById.get(cardId);
    for (const occurrence of card?.occurrences || []) {
      const pathValue = record.artifacts?.image?.sourcePath || record.artifacts?.image?.path;
      if (!occurrence.songId || !pathValue) continue;
      const rows = mediaCardsBySongId.get(occurrence.songId) || [];
      rows.push({ card, record, path: pathValue });
      mediaCardsBySongId.set(occurrence.songId, rows);
    }
  }
  const evergreen = ECHO_AVATAR_CAST_REGISTRY.evergreen
    .map((member) => ({ ...member, path: path.join(root, member.seedRelativePath) }));
  const packs = {};
  for (const card of run.cards || []) {
    const songIds = [...new Set((card.occurrences || []).map((item) => item.songId).filter(Boolean))];
    const sourceSong = songById.get(songIds[0]);
    const primary = CANONICAL_AVATAR_SEEDS[sourceSong?.performancePerspective?.avatarId] || null;
    const explicitCast = songIds.flatMap((songId) => ECHO_AVATAR_CAST_REGISTRY.songBindings?.[songId] || []);
    const castPool = explicitCast.length
      ? explicitCast.map((member) => ({ ...member, path: path.join(root, member.seedRelativePath) }))
      : evergreen;
    const castIndex = deterministicIndex(card.id, castPool.length);
    const supporting = castIndex >= 0 ? [castPool[castIndex]] : [];
    const terms = referenceTerms(card);
    const imagery = songIds
      .flatMap((songId) => mediaCardsBySongId.get(songId) || [])
      .filter((item) => item.card?.id !== card.id)
      .map((item) => ({
        ...item,
        score: overlapScore(terms, referenceTerms(item.card)),
      }))
      .sort((left, right) => right.score - left.score || left.card.title.localeCompare(right.card.title))
      .filter((item, index, rows) => rows.findIndex((candidate) => candidate.card.id === item.card.id) === index)
      .slice(0, 2)
      .map((item) => ({
        cardId: item.card.id,
        title: item.card.title,
        path: item.path,
        relation: "same-song-reference-neighborhood",
        overlapScore: item.score,
      }));
    const candidates = [
      ...(primary ? [primary] : []),
      ...supporting,
      ...imagery,
    ];
    const valid = [];
    for (const item of candidates) if (item.path && await exists(item.path)) valid.push(item);
    packs[card.id] = {
      schemaVersion: "hapa.echo-reference-image-pack.v1",
      primaryAvatar: valid.find((item) => item.id === primary?.id) || null,
      supportingAvatars: valid.filter((item) => supporting.some((member) => member.avatarId === item.avatarId)),
      referenceImagery: valid.filter((item) => item.cardId),
      paths: [...new Set(valid.map((item) => item.path))].slice(0, 5),
      selectionPolicy: "source-song RGB anchor + lyric-backed/evergreen Hapa cast + same-song Reference Atlas visual neighborhood",
    };
  }
  return packs;
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
  const approvedRemainder = args.includes("--approved-remainder");
  const run = approvedRemainder
    ? await createEchoReferenceMiningStore().currentRun()
    : await readJson(runPath);
  const previous = await readJson(manifestPath, { jobs: [] });
  const alreadyMediaBacked = approvedRemainder
    ? (run.cards || []).filter((card) => card.presentationMedia?.image?.uri).map((card) => card.id)
    : [];
  const referencePacks = approvedRemainder ? await buildReferenceImagePacks(run) : {};
  const planned = buildEchoReferenceGptImageBenchmarkManifest(run, {
    cardIds: options("--card"),
    excludeCardIds: alreadyMediaBacked,
    approvedAtlas: approvedRemainder,
    assumeApproved: approvedRemainder,
    approvedBy: option("--approved-by", "Calder Wong"),
    approvedAt: option("--approved-at", ""),
    authorityReceiptId: String(run.referenceRuntime?.authority?.receiptId || ""),
    referencePacks,
  });
  let manifest = mergeEchoReferenceGptImageBenchmarkManifest(previous, planned, {
    preserveExactCardRevision: approvedRemainder && !args.includes("--refresh-reference-packs"),
  });
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
      referencedImagePaths: job.referencePack?.paths || [],
      referencePack: job.referencePack || null,
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
  const version = job.promptHash.slice(-12);
  const rawPath = path.join(directory, `gpt-image-raw-${version}.${extension}`);
  const svgPath = path.join(directory, `gpt-image-reference-card-${version}.svg`);
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
    status: job.custody?.reviewStatus === "approved" ? "accepted" : "review-required",
    rawArtifact: {
      localPath: rawPath,
      sha256: sourceSha256,
      mediaType,
      generator: manifest.generator,
      generatedProposal: true,
      previewVisibility: "visible-before-review",
      reviewStatus: job.custody?.reviewStatus || "not-reviewed",
      humanReviewRequired: job.custody?.humanReviewRequired !== false,
      approvedBy: job.custody?.approvedBy || "",
      authorityReceiptId: job.custody?.authorityReceiptId || "",
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

async function recoverExactRevisionArtifacts() {
  if (!args.includes("--apply")) throw new Error("Exact-revision artifact recovery requires --apply.");
  const manifest = await readJson(manifestPath);
  const requestedCards = new Set(options("--card"));
  const recovered = [];
  const skipped = [];
  manifest.jobs = await Promise.all((manifest.jobs || []).map(async (job) => {
    if (requestedCards.size && !requestedCards.has(job.source?.cardId)) return job;
    if (job.rawArtifact?.localPath || !job.supersededArtifacts?.length) return job;
    const candidates = [...job.supersededArtifacts].reverse();
    const candidate = candidates.find((item) => item.rawArtifact?.localPath);
    if (!candidate) return job;
    if (!await exists(candidate.rawArtifact.localPath)) {
      skipped.push({
        cardId: job.source?.cardId,
        reason: "superseded-raw-artifact-missing",
        localPath: candidate.rawArtifact.localPath,
      });
      return job;
    }
    if (candidate.assembledArtifact?.localPath && !await exists(candidate.assembledArtifact.localPath)) {
      skipped.push({
        cardId: job.source?.cardId,
        reason: "superseded-assembled-artifact-missing",
        localPath: candidate.assembledArtifact.localPath,
      });
      return job;
    }
    recovered.push({
      cardId: job.source.cardId,
      cardRevisionId: job.source.cardRevisionId,
      recoveredPromptHash: candidate.promptHash,
      currentPromptHash: job.promptHash,
      rawPath: candidate.rawArtifact.localPath,
    });
    return {
      ...job,
      status: job.custody?.reviewStatus === "approved" ? "accepted" : "review-required",
      rawArtifact: {
        ...candidate.rawArtifact,
        recoveredFromSupersededPromptHash: candidate.promptHash,
        recoveryReason: "exact-card-revision-queue-freeze",
      },
      assembledArtifact: candidate.assembledArtifact
        ? {
          ...candidate.assembledArtifact,
          recoveredFromSupersededPromptHash: candidate.promptHash,
          recoveryReason: "exact-card-revision-queue-freeze",
        }
        : null,
      recovery: {
        schemaVersion: "hapa.echo-reference-gpt-image-artifact-recovery.v1",
        reason: "exact-card-revision-queue-freeze",
        recoveredPromptHash: candidate.promptHash,
        currentPromptHash: job.promptHash,
        cardRevisionId: job.source.cardRevisionId,
      },
    };
  }));
  const { manifestHash: _discardedManifestHash, ...core } = manifest;
  const recoveredManifest = { ...core, manifestHash: echoReferenceArtDigest(core) };
  await atomicWriteJson(manifestPath, recoveredManifest);
  console.log(JSON.stringify({
    ok: true,
    command: "recover-exact-revision",
    providerCalls: 0,
    recovered: recovered.length,
    recoveredCards: recovered,
    skipped,
    ...summary(recoveredManifest),
  }, null, 2));
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
  else if (command === "recover-exact-revision") await recoverExactRevisionArtifacts();
  else if (command === "status") await status();
  else if (command === "gallery") await gallery();
  else throw new Error(`Unknown command ${command}. Expected plan, next, import, recover-exact-revision, status, or gallery.`);
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
