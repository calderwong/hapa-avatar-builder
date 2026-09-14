#!/usr/bin/env node
const path = require("node:path");
const { app, safeStorage } = require("electron");
const { createProviderCredentialStore } = require("../electron/provider-credential-store.cjs");
const { createEchoReferenceIntelligence } = require("../electron/echo-reference-intelligence.cjs");

const ROOT = path.resolve(__dirname, "..");
const command = String(process.argv[2] || "status").trim().toLowerCase();

function loopbackApiBase(value) {
  const url = new URL(value || "http://127.0.0.1:8797");
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol)) throw new Error("The intelligence runner accepts only a loopback Hapa Avatar Builder API.");
  return url.origin;
}

function concise(status = {}) {
  return {
    ok: status.ok,
    runId: status.runId || "",
    state: status.state,
    model: status.model,
    reasoningEffort: status.reasoningEffort,
    concurrency: status.concurrency,
    album: status.album,
    counts: status.counts,
    failedSongs: (status.jobs || []).filter((job) => job.status === "failed").map((job) => ({ trackNumber: job.trackNumber, songTitle: job.songTitle, error: job.error })),
  };
}

async function main() {
  if (!["status", "pilot", "full", "refresh", "audit", "run", "resume"].includes(command)) throw new Error("Use status, pilot, full, refresh, audit, or resume.");
  app.setName("hapa-avatar-builder");
  app.setPath("userData", path.join(app.getPath("appData"), "hapa-avatar-builder"));
  await app.whenReady();
  const credentialStore = createProviderCredentialStore({ userDataPath: app.getPath("userData"), repositoryRoot: ROOT, safeStorage });
  const runner = createEchoReferenceIntelligence({
    userDataPath: app.getPath("userData"),
    credentialStore,
    sourceSongbookPath: path.join(ROOT, "data", "dear-papa-songbook.json"),
    concurrency: Number(process.env.HAPA_ECHO_INTELLIGENCE_CONCURRENCY || 8),
    model: process.env.HAPA_ECHO_INTELLIGENCE_MODEL || "gpt-5.5",
  });
  let status = await runner.status();
  if (command === "pilot" || command === "run") {
    status = await runner.start({ apiBase: loopbackApiBase(process.env.HAPA_AVATAR_API_BASE), mode: "pilot" });
    await runner._active();
    status = await runner.status();
  } else if (command === "full") {
    status = await runner.continueFull();
    await runner._active();
    status = await runner.status();
  } else if (command === "refresh") {
    status = await runner.refreshAll({ apiBase: loopbackApiBase(process.env.HAPA_AVATAR_API_BASE) });
    await runner._active();
    status = await runner.status();
  } else if (command === "audit") {
    status = await runner.audit();
  } else if (command === "resume") {
    status = await runner.resume();
    await runner._active();
    status = await runner.status();
  }
  process.stdout.write(`${JSON.stringify(concise(status), null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[Echo Reference Intelligence] ${String(error?.message || error).replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]")}\n`);
  process.exitCode = 1;
}).finally(() => app.quit());
