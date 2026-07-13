#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { inspectOfflineManifest, simulateBoundedSetPass } from "../src/domain/showcase-soak-rehearsal.js";

const arg = (name) => path.resolve(process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3));
const output = arg("output"); const packageRoot = arg("package"); const liveSetPath = arg("live-set");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "release-manifest.json"), "utf8")); const liveSet = JSON.parse(fs.readFileSync(liveSetPath, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const observed = manifest.offlineReplay.requiredFiles.filter((rel) => fs.existsSync(path.join(packageRoot, rel))).map((rel) => ({ path: rel, sha256: sha256(path.join(packageRoot, rel)) }));
const offline = inspectOfflineManifest(manifest, observed);
const injectedObserved = observed.filter((row) => row.path !== manifest.offlineReplay.requiredFiles[0]).map((row, index) => index === 0 ? { ...row, sha256: "injected-corrupt-hash" } : row);
const failureDiscovery = inspectOfflineManifest(manifest, injectedObserved);
const contractPasses = [
  simulateBoundedSetPass(liveSet, [{ entryId: "live:1", kind: "renderer-failure", atSeconds: 45 }]),
  simulateBoundedSetPass(liveSet, [{ entryId: "live:0", kind: "asset-failure", atSeconds: 12 }, { entryId: "live:2", kind: "renderer-failure", atSeconds: 30 }]),
];
const automatedChecksPass = offline.ready && failureDiscovery.missing.length === 1 && failureDiscovery.corrupt.length === 1 && contractPasses.every((row) => row.completed);
const proof = { schemaVersion: "hapa.showcase-soak.partial-proof.v1", status: "partial-awaiting-production-rehearsal", automatedChecksPass, scopeTruth: { releasePackageSongs: 1, liveSetContractEntries: liveSet.entries.length, albumSongs: 79, productionPlaybackExecuted: false, thermalMeasured: false, audioDeviceContinuityMeasured: false, displaySleepWakeMeasured: false }, offlineLaunch: offline, injectedDependencyDiscovery: failureDiscovery, contractPasses, acceptance: { offlineManifestNamesEveryDependency: offline.ready && failureDiscovery.missing.length === 1 && failureDiscovery.corrupt.length === 1, failedRendererOrAssetFallsBackAtSafeCueWithReceipt: contractPasses.every((row) => row.completed && row.receipts.every((receipt) => receipt.outcome === "completed" || receipt.receiptRecorded)), fullSetTwiceInProduction: false }, remainingAcceptance: ["Export and creatively approve all 79 set entries.", "Run the full approved set twice in the production/kiosk environment.", "Capture real black-frame, audio continuity, memory, thermal, display/audio-device, sleep/wake, offline, and restart telemetry."] };
fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "partial-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ automatedChecksPass, status: proof.status, offlineReady: offline.ready, namedInjectedMissing: failureDiscovery.missing, namedInjectedCorrupt: failureDiscovery.corrupt, contractPasses: contractPasses.map((row) => ({ completed: row.completed, entries: row.entries, receipts: row.receipts.length })), remaining: proof.remainingAcceptance }, null, 2));
if (!automatedChecksPass) process.exitCode = 1;
