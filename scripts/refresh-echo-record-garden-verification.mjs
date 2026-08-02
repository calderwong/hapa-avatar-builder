#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { inspectEchoDeliveryRuntimeBuildIdentity } from "../server/echo-delivery-runtime-build.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LEDGER = "docs/echo-record-garden-verification.json";
const DELIVERY_RECEIPT = "dist/hapa-echo-delivery-build.json";
const OFFLINE_RECEIPT = "artifacts/echo-record-garden/e2e/offline-contract-receipt.json";
const FULL_REVISION = /^[a-f0-9]{40}$/u;
const SHA256 = /^(?:sha256:)?([a-f0-9]{64})$/u;
const RECORD_GARDEN_CHUNK = /(?:^|\/)EchoRecordGarden3DView-[^/]+\.js$/u;

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizedSha256(value) {
  const match = String(value || "").toLowerCase().match(SHA256);
  if (!match) throw new Error(`Expected a SHA-256 digest, received ${String(value || "<empty>")}.`);
  return `sha256:${match[1]}`;
}

function bareSha256(value) {
  return normalizedSha256(value).slice("sha256:".length);
}

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round(Number(value) * scale) / scale;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  return values.filter((entry) => {
    const value = String(entry);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function withinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function relativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function currentOfflineAcceptance({ root, implementationRevision, receipt, receiptBytes }) {
  const checks = Array.isArray(receipt?.checks) ? receipt.checks : [];
  const requiredChecks = checks.filter((entry) => entry?.required !== false);
  const exactRevision = receipt?.source?.head === implementationRevision;
  const allRequiredPassed = requiredChecks.length > 0
    && requiredChecks.every((entry) => entry?.status === "passed");
  if (receipt?.ok === true && exactRevision && allRequiredPassed && receiptBytes) {
    const fixtureManifestSha256 = checks
      .find((entry) => entry?.id === "fixture-media.generated-offline")
      ?.evidence?.manifestDigest || null;
    return {
      status: "passed-current-implementation-revision",
      scope: String(receipt.scope || "pure-node-static-and-domain-runtime-contract"),
      truthBoundary: String(receipt.truthBoundary || "Offline evidence is not browser or device evidence."),
      checks: requiredChecks.length,
      passed: requiredChecks.length,
      failed: 0,
      receiptPath: OFFLINE_RECEIPT,
      receiptSha256: sha256Hex(receiptBytes),
      fixtureManifestSha256,
      boundHead: implementationRevision,
      generatedAt: receipt.generatedAt || null,
    };
  }
  return {
    status: "current-implementation-revision-run-not-recorded",
    scope: "pure-node-static-and-domain-runtime-contract",
    evidenceRecordedByRefresh: false,
    staleReceiptIgnored: Boolean(receiptBytes),
    observedReceiptHead: FULL_REVISION.test(String(receipt?.source?.head || ""))
      ? receipt.source.head
      : null,
    requiredCommand: "node scripts/verify-record-garden-offline-contract.mjs",
    note: "Run the offline verifier on the current implementation revision, then refresh this ledger again.",
  };
}

export function createEchoRecordGardenVerificationLedger({
  previous = {},
  root,
  implementationRevision,
  workingTreeChangeCount,
  identity,
  component,
  componentBytes,
  deliveryReceipt,
  deliveryReceiptBytes,
  offlineReceipt = null,
  offlineReceiptBytes = null,
  generatedAt = new Date().toISOString(),
}) {
  if (!FULL_REVISION.test(String(implementationRevision || ""))) {
    throw new Error("The verification ledger requires the full current Git implementation revision.");
  }
  if (!component?.path || !componentBytes?.length) {
    throw new Error("The current Record Garden component chunk is missing or empty.");
  }
  const componentIdentitySha256 = normalizedSha256(component.sha256);
  const componentFileSha256 = `sha256:${sha256Hex(componentBytes)}`;
  if (componentIdentitySha256 !== componentFileSha256) {
    throw new Error("The Record Garden component changed while its verification ledger was being refreshed.");
  }
  for (const field of [
    "schemaVersion",
    "contractVersion",
    "sourceSha256",
    "servedBundleSha256",
    "buildToolSha256",
    "semanticSha256",
    "generatedAt",
  ]) {
    if (!deliveryReceipt?.[field]) throw new Error(`The delivery receipt is missing ${field}.`);
  }
  for (const field of ["sourceSha256", "servedBundleSha256", "buildToolSha256", "semanticSha256"]) {
    const inspectedValue = identity?.buildReceipt?.[field];
    if (!inspectedValue || normalizedSha256(deliveryReceipt[field]) !== normalizedSha256(inspectedValue)) {
      throw new Error(`The delivery receipt does not match the inspected ${field}.`);
    }
  }

  const existingPlayback = previous.playback || {};
  const existingRepairs = Array.isArray(previous?.mediaStabilization?.repairs)
    ? uniqueStrings(previous.mediaStabilization.repairs.filter((entry) => !/display triptych/iu.test(String(entry))))
    : [];
  const humanEvidenceNotProven = [
    "current-revision-live-webgl-pixels",
    "desktop-pointer-and-keyboard-journey",
    "phone-touch-journey-and-computed-target-geometry",
    "live-audio-device-playback",
    "live-vinyl-angle-and-seek-parity",
    "runtime-video-decoder-fallback",
    "runtime-card-click-and-receipt-rendering",
    "current-revision-screenshots",
    "long-duration-gpu-decoder-soak",
  ];

  return {
    ...previous,
    schemaVersion: "hapa.echo-record-garden.verification.v6",
    feature: {
      id: "echo-record-garden",
      programId: previous?.feature?.programId || "echo-record-garden-2026-07-30",
      stage: "first-pass-implementation-complete-guided-acceptance-pending",
      route: "/?view=echo-records",
      guidedAcceptanceRoute: "/?view=echo-records&recordGardenReview=1",
      implementationState: "complete-for-guided-testing",
      acceptanceState: "exact-build-guided-human-acceptance-pending",
    },
    source: {
      canonicalImplementationRevision: implementationRevision,
      canonicalCheckout: root,
      revisionAuthority: "git-rev-parse-HEAD",
      buildSourceAuthority: DELIVERY_RECEIPT,
      workingTreeClean: Number(workingTreeChangeCount) === 0,
      workingTreeChangeCount: Number(workingTreeChangeCount) || 0,
      unrelatedWorkingTreeChangesPreserved: true,
      truthBoundary: "The Git revision identifies committed implementation history; the delivery receipt independently binds the exact built source and served files.",
    },
    playback: {
      ...existingPlayback,
      clockAuthority: "HTMLAudioElement.currentTime",
      physicalScreens: 1,
      screenPresentation: "single-cinematic-horizontal-director-composite",
      surfaceCandidateLimit: 4,
      warmMediaPoolLimit: 14,
      visibleMediaSlots: 1,
      upcomingDirectorVideoWarmSlots: 1,
      dedicatedRecordFaceMediaSlots: 1,
      presentationSurfaces: ["screen-1", "record-face"],
      firstDecodedFrameReadiness: "HAVE_CURRENT_DATA",
      posterHeldUntilDecodedFrame: true,
      lastDecodedFrameHeldDuringBufferingAndTimelineGaps: true,
    },
    mediaStabilization: {
      ...(previous.mediaStabilization || {}),
      repairs: uniqueStrings([
        ...existingRepairs,
        "Project the exact current Director composite onto one large horizontal screen and the same physical record face.",
        "Keep one visible Director composite plus one upcoming warm source inside a bounded fourteen-resource decoder and shader pool.",
      ]),
      currentPresentation: {
        cinematicScreens: 1,
        recordFaces: 1,
        directorPreviewParityTarget: true,
        warmMediaPoolLimit: 14,
      },
    },
    guidedAcceptanceGate: {
      status: "implemented-current-build-human-observation-pending",
      route: "/?view=echo-records&recordGardenReview=1",
      manualOnly: true,
      currentBuildRequired: true,
      browserLoadedChunkHashedAtStartAndEnd: true,
      serverContextSigned: "HMAC-SHA256-process-scoped-12-hour-maximum",
      serverLedgerFailsClosedOnBuildDrift: true,
      receiptStorage: "append-only-content-addressed-integrity-sealed",
      boardMutation: false,
      contractSignals: [
        "exact-current-build",
        "same-build-start-and-finish",
        "browser-loaded-chunk-identity",
        "one-live-webgl-garden",
        "one-cinematic-director-screen",
        "one-current-record-face",
        "bounded-fourteen-resource-media-pool",
        "recent-non-legacy-director-cut",
        "exact-card-lineage-or-fail-closed",
        "desktop-and-compact-input-proof",
      ],
      privacy: {
        queryAndFragmentStored: false,
        browserUserAgentStoredByDefault: false,
        webglVendorAndRendererStored: false,
        localPathsAndSecretsRedacted: true,
      },
    },
    cardResolution: {
      ...(previous.cardResolution || {}),
      resolver: "createEchoRecordVisualCardResolver",
      resolutionPolicy: "exact-id-or-fail",
      authoritativeTimedPrint: true,
      exactCardRevisionRequired: true,
      localSubstituteAllowed: false,
      confirmedMissingLocalProjectionOnly: false,
      serviceFailureFailsClosed: true,
      mintClaimed: false,
    },
    focusedTests: {
      status: "current-implementation-revision-run-not-recorded",
      script: "npm run test:echo-record-garden",
      evidenceRecordedByRefresh: false,
      note: "This build-identity refresh never carries forward test totals from an earlier revision.",
    },
    summaryAndDetailApi: {
      status: "current-service-run-not-recorded",
      evidenceRecordedByRefresh: false,
      note: "Live catalog and exact-cut counts must come from a separate current service probe.",
    },
    productionBuild: {
      status: "current-delivery-identity-verified",
      verification: "strict-static-import-graph-and-served-bundle-identity",
      recordGardenChunk: {
        file: component.path,
        bytes: componentBytes.length,
        viteSizeKb: round(componentBytes.length / 1000),
        viteGzipKb: round(gzipSync(componentBytes).length / 1000),
        sha256: bareSha256(componentFileSha256),
      },
      deliveryReceipt: {
        schemaVersion: deliveryReceipt.schemaVersion,
        contractVersion: deliveryReceipt.contractVersion,
        sourceSha256: normalizedSha256(deliveryReceipt.sourceSha256),
        servedBundleSha256: normalizedSha256(deliveryReceipt.servedBundleSha256),
        buildToolSha256: normalizedSha256(deliveryReceipt.buildToolSha256),
        semanticSha256: normalizedSha256(deliveryReceipt.semanticSha256),
        fileSha256: sha256Hex(deliveryReceiptBytes),
        generatedAt: deliveryReceipt.generatedAt,
      },
      warning: "Record Garden remains independently lazy-loaded; this refresh makes no size claim about unrelated application chunks.",
    },
    offlineAcceptance: currentOfflineAcceptance({
      root,
      implementationRevision,
      receipt: offlineReceipt,
      receiptBytes: offlineReceiptBytes,
    }),
    broadRepositorySuite: {
      status: "current-implementation-revision-run-not-recorded",
      evidenceRecordedByRefresh: false,
      blanketCurrentRevisionGreenClaimed: false,
      note: "This refresh intentionally removes broad-suite totals that are not bound to the current implementation revision.",
    },
    liveService: {
      status: "not-observed-by-verification-refresh",
      configuredPort: 8797,
      pid: null,
      observedAt: null,
      startedAt: null,
      acceptanceContextStatus: null,
      acceptanceContextSigned: null,
      acceptanceContextExactBuild: null,
      restartRequiredAfterLedgerRefresh: true,
      note: "Restart and probe the canonical service separately; this script never carries forward a PID, health result, uptime, or acceptance-context status.",
    },
    runtimeEvidence: {
      currentRevisionAutomation: "exact-production-build-identity-recorded; focused, broad, service, and browser evidence remain separate",
      manualAcceptance: "pending",
      guidedAcceptanceRoute: "http://127.0.0.1:8797/?view=echo-records&recordGardenReview=1",
      receiptSchema: "hapa.echo-record-garden.operator-acceptance.v1",
      operatorChecklist: "docs/ECHO_RECORD_GARDEN_OPERATOR_ACCEPTANCE.md",
      notProven: humanEvidenceNotProven,
    },
    board: {
      historyPolicy: "append-only",
      status: "not-observed-or-mutated-by-build-refresh",
      implementationState: "complete-for-guided-testing",
      humanBrowserAcceptance: "pending",
      fullyDrained: false,
      note: "Board completion evidence is owned by the append-only Kanban ledger, not inferred by this build refresh.",
    },
    releaseBoundaries: {
      ...(previous.releaseBoundaries || {}),
      publicDeployment: "not-requested-and-not-performed",
      publicProductionReadiness: false,
      mediaRightsCleared: false,
      mintAuthorityClaimed: false,
    },
    generatedAt,
  };
}

async function readJsonWithBytes(filePath, { optional = false } = {}) {
  try {
    const bytes = await readFile(filePath);
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch (error) {
    if (optional && error?.code === "ENOENT") return { bytes: null, value: null };
    throw error;
  }
}

async function gitSnapshot(root) {
  const [{ stdout: headOutput }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: root, encoding: "utf8" }),
    execFileAsync("git", ["status", "--porcelain=v1", "-z"], { cwd: root, encoding: "utf8" }),
  ]);
  const head = headOutput.trim().toLowerCase();
  if (!FULL_REVISION.test(head)) throw new Error("Git did not return a full current implementation revision.");
  return {
    head,
    workingTreeChangeCount: statusOutput.split("\0").filter(Boolean).length,
  };
}

async function atomicJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function refreshEchoRecordGardenVerification({
  root = SCRIPT_ROOT,
  ledgerPath = DEFAULT_LEDGER,
  dryRun = false,
  generatedAt = new Date().toISOString(),
} = {}) {
  const resolvedRoot = await realpath(path.resolve(root));
  const resolvedLedgerPath = path.resolve(resolvedRoot, ledgerPath);
  if (!withinRoot(resolvedRoot, resolvedLedgerPath)) {
    throw new Error("The verification ledger path must remain inside the project root.");
  }
  const [ledger, delivery, offline, git, identity] = await Promise.all([
    readJsonWithBytes(resolvedLedgerPath),
    readJsonWithBytes(path.join(resolvedRoot, DELIVERY_RECEIPT)),
    readJsonWithBytes(path.join(resolvedRoot, OFFLINE_RECEIPT), { optional: true }),
    gitSnapshot(resolvedRoot),
    inspectEchoDeliveryRuntimeBuildIdentity({ root: resolvedRoot, strict: true, refresh: true }),
  ]);
  const components = (identity?.servedBundle?.files || []).filter((entry) => RECORD_GARDEN_CHUNK.test(entry?.path || ""));
  if (components.length !== 1) {
    throw new Error(`Expected exactly one current Record Garden component chunk, found ${components.length}.`);
  }
  const component = components[0];
  const componentPath = path.resolve(resolvedRoot, component.path);
  if (!withinRoot(resolvedRoot, componentPath)) throw new Error("The Record Garden component path escaped the project root.");
  const componentBytes = await readFile(componentPath);
  const refreshed = createEchoRecordGardenVerificationLedger({
    previous: ledger.value,
    root: resolvedRoot,
    implementationRevision: git.head,
    workingTreeChangeCount: git.workingTreeChangeCount,
    identity,
    component,
    componentBytes,
    deliveryReceipt: delivery.value,
    deliveryReceiptBytes: delivery.bytes,
    offlineReceipt: offline.value,
    offlineReceiptBytes: offline.bytes,
    generatedAt,
  });
  if (!dryRun) await atomicJson(resolvedLedgerPath, refreshed);
  return {
    ok: true,
    dryRun,
    ledger: relativePath(resolvedRoot, resolvedLedgerPath),
    implementationRevision: git.head,
    workingTreeChangeCount: git.workingTreeChangeCount,
    chunk: refreshed.productionBuild.recordGardenChunk,
    deliveryReceipt: refreshed.productionBuild.deliveryReceipt,
    offlineAcceptance: refreshed.offlineAcceptance.status,
    manualAcceptance: refreshed.runtimeEvidence.manualAcceptance,
    liveService: refreshed.liveService.status,
    focusedTests: refreshed.focusedTests.status,
    broadRepositorySuite: refreshed.broadRepositorySuite.status,
  };
}

function parseArguments(argv) {
  const options = { root: SCRIPT_ROOT, ledgerPath: DEFAULT_LEDGER, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--root") options.root = argv[++index];
    else if (argument === "--ledger") options.ledgerPath = argv[++index];
    else if (argument === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
    if ((argument === "--root" || argument === "--ledger") && !argv[index]) {
      throw new Error(`${argument} requires a value.`);
    }
  }
  return options;
}

function usage() {
  return [
    "Usage: node scripts/refresh-echo-record-garden-verification.mjs [options]",
    "",
    "Options:",
    "  --dry-run        Inspect and print the current identity without writing the ledger.",
    "  --root PATH      Project root (defaults to the script's project).",
    `  --ledger PATH    Ledger path within the project (defaults to ${DEFAULT_LEDGER}).`,
    "  --help           Show this help.",
  ].join("\n");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) process.stdout.write(`${usage()}\n`);
    else process.stdout.write(`${JSON.stringify(await refreshEchoRecordGardenVerification(options), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: error?.code || "echo_record_garden_verification_refresh_failed",
      message: error?.message || String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
