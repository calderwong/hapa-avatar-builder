#!/usr/bin/env node
const path = require("node:path");
const { app, safeStorage } = require("electron");
const { createProviderCredentialStore } = require("../electron/provider-credential-store.cjs");
const {
  createEchoTarotLoopGeneration,
  MAIN_COUPLE_LOOP_PROFILE,
  MAIN_MAN_LOOP_PROFILE,
  MAIN_WOMAN_LOOP_PROFILE,
  REFERENCE_ATLAS_LOOP_PROFILE,
} = require("../electron/echo-tarot-loop-generation.cjs");

const ROOT = path.resolve(__dirname, "..");
const command = String(process.argv[2] || "status").trim().toLowerCase();
const profileId = String(process.argv[3] || "main-woman").trim().toLowerCase();
const allowedCommands = new Set(["status", "pilot", "budget", "full", "resume", "repair"]);
const profiles = new Map([
  [MAIN_WOMAN_LOOP_PROFILE.id, MAIN_WOMAN_LOOP_PROFILE],
  [MAIN_MAN_LOOP_PROFILE.id, MAIN_MAN_LOOP_PROFILE],
  [MAIN_COUPLE_LOOP_PROFILE.id, MAIN_COUPLE_LOOP_PROFILE],
  [REFERENCE_ATLAS_LOOP_PROFILE.id, REFERENCE_ATLAS_LOOP_PROFILE],
]);
const profile = profiles.get(profileId);

function summary(status) {
  return {
    ok: status.ok,
    runId: status.runId || "",
    sourceImageRunId: status.sourceImageRunId || "",
    profile: status.profileLabel || profile?.label || profileId,
    state: status.state,
    model: status.model,
    durationSeconds: status.durationSeconds,
    resolution: status.resolution,
    promptExpansionMode: status.promptExpansionMode,
    localConcurrency: status.localConcurrency,
    credentialConfigured: status.credentialConfigured,
    sourceAvailable: status.sourceAvailable,
    counts: status.counts,
    elapsedSeconds: status.elapsedSeconds || 0,
    throughputPerMinute: status.throughputPerMinute || 0,
    usage: status.usage,
    budget: status.budget || null,
    blocker: status.blocker || null,
  };
}

async function main() {
  if (!allowedCommands.has(command)) throw new Error(`Unknown command “${command}”. Use status, pilot, budget, full, resume, or repair.`);
  if (!profile) throw new Error(`Unknown loop profile “${profileId}”. Use main-woman, main-man, or main-couple.`);
  app.setName("hapa-avatar-builder");
  app.setPath("userData", path.join(app.getPath("appData"), "hapa-avatar-builder"));
  await app.whenReady();
  const credentialStore = createProviderCredentialStore({
    userDataPath: app.getPath("userData"),
    repositoryRoot: ROOT,
    safeStorage,
  });
  const requestedConcurrency = Number(process.env.HAPA_TAROT_LOOP_CONCURRENCY || 12);
  const runner = createEchoTarotLoopGeneration({
    userDataPath: app.getPath("userData"),
    credentialStore,
    profile,
    localConcurrency: Number.isFinite(requestedConcurrency) ? requestedConcurrency : 12,
    maxSpendUsd: Number(process.env.HAPA_TAROT_LOOP_MAX_SPEND_USD || Number.POSITIVE_INFINITY),
  });
  let status = await runner.status();

  if (command === "pilot" || command === "budget") {
    status = await runner.start();
    await runner._active();
    status = await runner.status();
  } else if (command === "full") {
    status = await runner.continueFull({ note: "Three pilot loops visually reviewed and approved before CLI album continuation." });
    await runner._active();
    status = await runner.status();
  } else if (command === "resume") {
    status = await runner.resume();
    await runner._active();
    status = await runner.status();
  } else if (command === "repair") {
    status = await runner.repairCompletedOutputs();
  }

  process.stdout.write(`${JSON.stringify(summary(status), null, 2)}\n`);
}

main().catch((error) => {
  const message = String(error?.message || error || "FAL loop runner failed.")
    .replace(/(?:Bearer|Key)\s+[^\s"']+/gi, (match) => `${match.split(/\s+/)[0]} [redacted]`)
    .replace(/\b[a-zA-Z0-9_-]{12,}:[a-zA-Z0-9_-]{12,}\b/g, "[redacted]");
  process.stderr.write(`[Echo Tarot Loop · ${profile?.label || profileId}] ${message}\n`);
  process.exitCode = 1;
}).finally(() => app.quit());
