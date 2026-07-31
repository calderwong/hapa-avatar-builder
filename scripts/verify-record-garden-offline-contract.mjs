#!/usr/bin/env node

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { buildEchoRecordVisualSurfaces } from "../src/domain/echo-record-garden.js";
import { createEchoRecordVisualCardResolver } from "../src/domain/echo-record-card-resolution.js";

const require = createRequire(import.meta.url);
const {
  FIXTURE_SONGS,
  RECORD_GARDEN_E2E_MEDIA_PREFIX,
  RECORD_GARDEN_E2E_ORIGIN,
  RECORD_GARDEN_E2E_SCHEME,
  createRecordGardenFixtureDataset,
  createRecordGardenFixtureState,
  detailProject,
  fixtureReferences,
  prepareRecordGardenFixtureMedia,
  routeRecordGardenFixtureApi,
} = require("./lib/record-garden-offline-fixtures.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "artifacts", "echo-record-garden", "e2e");
const FIXTURE_MEDIA = path.join(OUTPUT, "fixtures");
const RECEIPT_PATH = path.join(OUTPUT, "offline-contract-receipt.json");
const checks = [];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function errorRecord(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    stack: error?.stack || "",
  };
}

function gitValue(args, fallback = "") {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(id, operation, { required = true } = {}) {
  const startedAt = Date.now();
  try {
    const evidence = await operation();
    checks.push({
      id,
      required,
      status: "passed",
      durationMs: Date.now() - startedAt,
      evidence: evidence ?? null,
    });
    return evidence;
  } catch (error) {
    checks.push({
      id,
      required,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: errorRecord(error),
    });
    return null;
  }
}

function route(url, options = {}) {
  return routeRecordGardenFixtureApi(url, options);
}

function parseJson(result) {
  return JSON.parse(result.body);
}

function fixtureFetch(state, dataset) {
  return async (url, options = {}) => {
    const result = route(url, {
      method: String(options.method || "GET").toUpperCase(),
      body: options.body || "",
      state,
      dataset,
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
}

function wavMetadata(bytes) {
  assert(bytes.subarray(0, 4).toString("ascii") === "RIFF", "WAV fixture is missing the RIFF signature.");
  assert(bytes.subarray(8, 12).toString("ascii") === "WAVE", "WAV fixture is missing the WAVE signature.");
  const channels = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  const bitsPerSample = bytes.readUInt16LE(34);
  const dataBytes = bytes.readUInt32LE(40);
  const durationSeconds = dataBytes / (sampleRate * channels * (bitsPerSample / 8));
  return { channels, sampleRate, bitsPerSample, dataBytes, durationSeconds };
}

function ftypPresent(bytes) {
  return bytes.length > 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
}

function collectFixtureMediaUris(value, result = new Set()) {
  if (typeof value === "string") {
    if (value.startsWith(`${RECORD_GARDEN_E2E_MEDIA_PREFIX}/`)) result.add(value);
    return result;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectFixtureMediaUris(entry, result);
    return result;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectFixtureMediaUris(entry, result);
  }
  return result;
}

async function verify() {
  await fsp.mkdir(OUTPUT, { recursive: true });
  const dataset = createRecordGardenFixtureDataset();
  const state = createRecordGardenFixtureState();

  await check("fixture-media.generated-offline", async () => {
    const manifest = await prepareRecordGardenFixtureMedia(FIXTURE_MEDIA);
    const wav = await fsp.readFile(path.join(FIXTURE_MEDIA, "sunday-signals.wav"));
    const videoA = await fsp.readFile(path.join(FIXTURE_MEDIA, "surface-a.mp4"));
    const videoB = await fsp.readFile(path.join(FIXTURE_MEDIA, "surface-b.mp4"));
    const broken = await fsp.readFile(path.join(FIXTURE_MEDIA, "broken-audio.bin"));
    const metadata = wavMetadata(wav);
    assert(Math.abs(metadata.durationSeconds - 18) < 0.01, `Expected an 18-second WAV, got ${metadata.durationSeconds}.`);
    assert(ftypPresent(videoA) && ftypPresent(videoB), "Fixture MP4 files do not contain an ftyp box.");
    assert(videoA.length > 10_000 && videoB.length > 10_000, "Fixture MP4 files are unexpectedly small.");
    assert(broken.subarray(0, 4).toString("ascii") !== "RIFF", "Broken-audio fixture accidentally became valid WAV data.");
    assert(manifest.intentionallyMissing.includes("intentionally-missing.webm"), "Missing-media fixture is not declared.");
    return {
      manifestPath: path.join(FIXTURE_MEDIA, "fixture-media-manifest.json"),
      manifestDigest: manifest.digest,
      wav: metadata,
      videoBytes: [videoA.length, videoB.length],
      intentionallyMissing: manifest.intentionallyMissing,
    };
  });

  await check("fixture-media.uri-coverage", async () => {
    const mediaSources = [
      dataset,
      ...FIXTURE_SONGS.map(([songId]) => detailProject(songId)),
      fixtureReferences("garden-main"),
    ];
    const declaredUris = [...collectFixtureMediaUris(mediaSources)].sort();
    const mapped = [];
    const intentionallyMissing = [];
    for (const uri of declaredUris) {
      const name = decodeURIComponent(uri.slice(RECORD_GARDEN_E2E_MEDIA_PREFIX.length + 1));
      assert(name === path.basename(name), `Fixture media URI escapes its directory: ${uri}`);
      if (name === "intentionally-missing.webm") {
        intentionallyMissing.push(uri);
        continue;
      }
      const filePath = path.join(FIXTURE_MEDIA, name);
      const stat = await fsp.stat(filePath);
      assert(stat.isFile() && stat.size > 0, `Fixture media URI is unmapped or empty: ${uri}`);
      mapped.push({ uri, filePath, bytes: stat.size });
    }
    assert(intentionallyMissing.length === 1, "Expected exactly one deliberate missing-media URI.");
    return {
      declaredUriCount: declaredUris.length,
      mapped,
      intentionallyMissing,
    };
  });

  await check("fixture-api.catalog-retry", () => {
    const first = route(`${RECORD_GARDEN_E2E_ORIGIN}/api/echos/director-projects?summary=1`, {
      state,
      dataset,
    });
    const second = route(`${RECORD_GARDEN_E2E_ORIGIN}/api/echos/director-projects?summary=1`, {
      state,
      dataset,
    });
    assert(first.status === 503, `First catalog request should fail with 503, got ${first.status}.`);
    assert(second.status === 200, `Second catalog request should recover with 200, got ${second.status}.`);
    const payload = parseJson(second);
    assert(payload.projects.length === 8, `Expected 8 fixture records, got ${payload.projects.length}.`);
    return {
      firstStatus: first.status,
      retryStatus: second.status,
      records: payload.projects.map((entry) => entry.music_video_project.song_id),
    };
  });

  await check("fixture-api.project-retry", () => {
    const url = `${RECORD_GARDEN_E2E_ORIGIN}/api/echos/director-project?songId=garden-recovery`;
    const first = route(url, { state, dataset });
    const second = route(url, { state, dataset });
    assert(first.status === 503, `First recovery project request should fail with 503, got ${first.status}.`);
    assert(second.status === 200, `Recovery project retry should return 200, got ${second.status}.`);
    const project = parseJson(second).music_video_project;
    assert(project.song_id === "garden-recovery", "Recovered project identity changed.");
    assert(project.timeline.length === 4, "Recovered project does not have the complete fixture timeline.");
    return {
      firstStatus: first.status,
      retryStatus: second.status,
      songId: project.song_id,
      timelineCount: project.timeline.length,
    };
  });

  const surfaces = await check("domain.surface-family-paging-contract", () => {
    const project = detailProject("garden-main");
    const references = fixtureReferences("garden-main");
    const rows = buildEchoRecordVisualSurfaces({
      project,
      referenceCards: references,
      avatars: [dataset.avatar],
      sceneGraph: dataset.world,
      clockSeconds: 1,
      limit: 12,
      apiBase: RECORD_GARDEN_E2E_ORIGIN,
    });
    const pages = Array.from({ length: Math.ceil(rows.length / 3) }, (_, index) => (
      rows.slice(index * 3, index * 3 + 3).map((surface) => surface.role)
    ));
    const families = new Set(rows.map((surface) => surface.role));
    for (const family of ["now-playing", "up-next", "character", "reference", "scene"]) {
      assert(families.has(family), `Surface family ${family} is absent.`);
    }
    assert(rows.length === 12, `Expected a bounded 12-surface constellation, got ${rows.length}.`);
    assert(rows.some((surface) => surface.media?.uri?.includes("intentionally-missing.webm")), "Missing-media fallback surface is absent.");
    return { rows, pages, families: [...families] };
  });

  await check("domain.card-resolution-contract", async () => {
    assert(surfaces?.rows?.length, "Surface contract did not produce inputs for Card resolution.");
    const resolutionState = createRecordGardenFixtureState();
    const resolve = createEchoRecordVisualCardResolver({
      apiBase: RECORD_GARDEN_E2E_ORIGIN,
      fetchImpl: fixtureFetch(resolutionState, dataset),
    });
    const project = detailProject("garden-main");
    const directorVisual = surfaces.rows.find((surface) => surface.role === "now-playing");
    const referenceVisual = surfaces.rows.find((surface) => surface.role === "reference");
    const authoritative = await resolve({ visual: directorVisual, project, clockSeconds: 1.25 });
    const embedded = await resolve({ visual: referenceVisual, project, clockSeconds: 1.25 });
    assert(authoritative.mode === "authoritative-edition-print", `Unexpected Director Card mode: ${authoritative.mode}.`);
    assert(authoritative.receipt?.songId === "garden-main", "Authoritative print receipt lost song identity.");
    assert(authoritative.receipt?.timestampMs === 1250, "Authoritative print receipt lost the media timestamp.");
    assert(embedded.mode === "embedded-source-card", `Unexpected Reference Card mode: ${embedded.mode}.`);
    assert(resolutionState.songCardPrintRequests === 1, "Authoritative print endpoint was not exercised exactly once.");
    assert(resolutionState.unexpectedApiRequests.length === 0, "Card resolution escaped the fixture API contract.");
    return {
      authoritative: {
        mode: authoritative.mode,
        cardId: authoritative.card.id,
        receipt: authoritative.receipt,
      },
      embedded: {
        mode: embedded.mode,
        cardId: embedded.card.id,
      },
      requestState: resolutionState,
    };
  });

  await check("source.runtime-recovery-contracts-present", async () => {
    const [component, resolver, css, index] = await Promise.all([
      fsp.readFile(path.join(ROOT, "src/components/EchoRecordGarden3DView.jsx"), "utf8"),
      fsp.readFile(path.join(ROOT, "src/domain/echo-record-card-resolution.js"), "utf8"),
      fsp.readFile(path.join(ROOT, "src/index.css"), "utf8"),
      fsp.readFile(path.join(ROOT, "index.html"), "utf8"),
    ]);
    const contracts = {
      catalogRetry: /Retry catalog/.test(component),
      projectRetry: /Retry record sleeve/.test(component),
      sceneRetry: /Retry 3D scene/.test(component),
      audioRetry: /Retry record audio/.test(component),
      cardCancel: /Cancel Card request/.test(component) && /cancelVisual/.test(resolver),
      pointerBlurCancel: /addEventListener\?\.\("blur"/.test(component) && /cancelInteraction/.test(component),
      visibilityCancel: /document\.hidden[\s\S]{0,300}cancelInteraction/.test(component),
      keyboardRoving: /handleCrateKeyDown/.test(component) && /ArrowRight/.test(component) && /tabIndex=/.test(component),
      sourceCoverage: /echo-record-source-coverage/.test(component),
      reducedPowerProfile: /ECHO_RECORD_GARDEN_POWER_PROFILES/.test(component),
      viewportFit: /viewport-fit=cover/.test(index),
      safeAreas: /safe-area-inset-(?:top|right|bottom|left)/.test(css),
      touchMinimums: /\.echo-record-surface-pages button[\s\S]{0,200}min-width:\s*44px/.test(css)
        && /\.echo-record-visual-selector button[\s\S]{0,200}min-height:\s*44px/.test(css)
        && /\.echo-record-print-card[\s\S]{0,160}min-height:\s*44px/.test(css),
    };
    const missing = Object.entries(contracts).filter(([, present]) => !present).map(([name]) => name);
    assert(missing.length === 0, `Runtime recovery source contracts are missing: ${missing.join(", ")}`);
    return contracts;
  });

  await check("build.offline-bundle-contract", async () => {
    const indexPath = path.join(ROOT, "dist", "index.html");
    const html = await fsp.readFile(indexPath, "utf8");
    const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value) => !value.startsWith("data:"));
    const files = [];
    for (const reference of references) {
      assert(!/^https?:/i.test(reference), `Production HTML contains a network asset: ${reference}`);
      const local = path.join(ROOT, "dist", reference.replace(/^\/+/, ""));
      const stat = await fsp.stat(local);
      assert(stat.isFile() && stat.size > 0, `Built asset is missing or empty: ${reference}`);
      files.push({ reference, bytes: stat.size });
    }
    const chunks = (await fsp.readdir(path.join(ROOT, "dist", "assets")))
      .filter((name) => /^EchoRecordGarden3DView-.*\.js$/.test(name));
    assert(chunks.length === 1, `Expected one Record Garden lazy chunk, found ${chunks.length}.`);
    const chunkPath = path.join(ROOT, "dist", "assets", chunks[0]);
    const chunk = await fsp.readFile(chunkPath);
    assert(chunk.length > 20_000, "Record Garden production chunk is unexpectedly small.");
    return {
      indexPath,
      indexSha256: sha256(Buffer.from(html)),
      referencedAssets: files,
      recordGardenChunk: {
        path: chunkPath,
        bytes: chunk.length,
        sha256: sha256(chunk),
      },
    };
  });

  await check("harness.no-listener-no-browser-contract", async () => {
    const [fixtureSource, verifierSource] = await Promise.all([
      fsp.readFile(path.join(ROOT, "scripts/lib/record-garden-offline-fixtures.cjs"), "utf8"),
      fsp.readFile(fileURLToPath(import.meta.url), "utf8"),
    ]);
    const combined = `${fixtureSource}\n${verifierSource}`;
    assert(
      !/\b(?:require\s*\(\s*["']electron["']\s*\)|from\s+["']electron["'])/.test(combined),
      "Pure-Node contract imports Electron.",
    );
    assert(
      !/\b(?:require\s*\(\s*["']node:http["']\s*\)|from\s+["']node:http["']|createServer\s*\(|\.listen\s*\()/.test(combined),
      "Pure-Node contract creates an HTTP listener.",
    );
    assert(
      !/\b(?:require\s*\(\s*["'](?:playwright|puppeteer|chrome-remote-interface)["']\s*\)|from\s+["'](?:playwright|puppeteer|chrome-remote-interface)["'])/.test(combined),
      "Pure-Node contract imports an alternate browser driver.",
    );
    assert(RECORD_GARDEN_E2E_SCHEME === "hapa-record-e2e", "Custom offline fixture scheme changed unexpectedly.");
    return {
      electronImported: false,
      httpListener: false,
      alternateBrowserDriver: false,
      fixtureScheme: RECORD_GARDEN_E2E_SCHEME,
      executableScope: "pure-node-contract-only",
    };
  });

  const blockedRuntimeEvidence = {
    status: "blocked-by-saved-execution-policy",
    electron: {
      attemptedBeforePolicyBlock: true,
      outcome: "SIGABRT before app.whenReady",
      failurePoint: "macOS AppKit _RegisterApplication",
      coalition: "com.openai.codex",
    },
    localFileBrowser: {
      attemptedByParentBeforeThisVerifier: true,
      outcome: "rejected by saved URL policy",
      instruction: "Do not work around the rejection with another browser or execution surface.",
    },
    notAttemptedAfterPolicyBlock: [
      "Electron launch",
      "alternate browser launch",
      "file URL navigation",
      "HTTP preview server",
      "custom-protocol renderer launch",
    ],
    notProven: [
      "nonblank live WebGL pixels",
      "desktop interaction journey",
      "phone touch journey",
      "computed touch-target dimensions",
      "runtime overlap and safe-area fit",
      "live audio playback and vinyl-angle parity",
      "live surface media fallback",
      "runtime Card click and receipt rendering",
      "screenshots",
    ],
  };

  const receipt = {
    schemaVersion: "hapa.echo-record-garden.offline-contract-acceptance.v1",
    generatedAt: new Date().toISOString(),
    scope: "pure-node-static-and-domain-runtime-contract",
    truthBoundary: "This receipt validates deterministic fixture media, API recovery contracts, domain composition/Card resolution, source contracts, and the built asset graph. It is not browser, Electron, WebGL, audio-device, touch, layout, or screenshot evidence.",
    source: {
      root: ROOT,
      head: gitValue(["rev-parse", "HEAD"]),
      branch: gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
      workingTree: gitValue(["status", "--short"]).split("\n").filter(Boolean),
    },
    transportContract: {
      fixtureScheme: RECORD_GARDEN_E2E_SCHEME,
      fixtureOrigin: RECORD_GARDEN_E2E_ORIGIN,
      httpListener: false,
      networkRequired: false,
    },
    checks,
    blockedRuntimeEvidence,
    artifacts: {
      fixtureMediaDirectory: FIXTURE_MEDIA,
      fixtureManifest: path.join(FIXTURE_MEDIA, "fixture-media-manifest.json"),
      screenshots: [],
    },
  };
  receipt.ok = checks.every((entry) => entry.status === "passed" || !entry.required);
  await fsp.writeFile(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: receipt.ok,
    scope: receipt.scope,
    checks: checks.length,
    failed: checks.filter((entry) => entry.status === "failed").map((entry) => entry.id),
    receipt: RECEIPT_PATH,
    runtimeEvidence: blockedRuntimeEvidence.status,
  }, null, 2)}\n`);
  if (!receipt.ok) process.exitCode = 1;
}

verify().catch(async (error) => {
  await fsp.mkdir(OUTPUT, { recursive: true }).catch(() => {});
  const failure = {
    schemaVersion: "hapa.echo-record-garden.offline-contract-acceptance-failure.v1",
    ok: false,
    generatedAt: new Date().toISOString(),
    scope: "pure-node-static-and-domain-runtime-contract",
    error: errorRecord(error),
    checks,
    runtimeLaunchAttempted: false,
  };
  await fsp.writeFile(RECEIPT_PATH, `${JSON.stringify(failure, null, 2)}\n`).catch(() => {});
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
