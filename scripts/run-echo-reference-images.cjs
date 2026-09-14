#!/usr/bin/env node
const path = require("node:path");
const { app, safeStorage } = require("electron");
const { createProviderCredentialStore } = require("../electron/provider-credential-store.cjs");
const { createEchoReferenceImageGeneration } = require("../electron/echo-reference-image-generation.cjs");

const ROOT = path.resolve(__dirname, "..");
const command = String(process.argv[2] || "status").trim().toLowerCase();
const allowed = new Set(["status", "pilot", "refresh-pilot", "full", "resume"]);

function loopbackApiBase(value) {
  const url = new URL(value || "http://127.0.0.1:8797");
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error("The runner accepts only a loopback Hapa Avatar Builder API.");
  return url.origin;
}

function summary(status) {
  return {
    ok: status.ok,
    runId: status.runId || "",
    passId: status.passId || "",
    mode: status.mode || "",
    state: status.state,
    model: status.model,
    size: status.size,
    quality: status.quality,
    credentialConfigured: status.credentialConfigured,
    counts: status.counts,
    concurrency: status.concurrency,
    performance: status.performance,
    usage: status.usage,
    blocker: status.blocker || null,
  };
}

async function main() {
  if (!allowed.has(command)) throw new Error(`Unknown command “${command}”. Use status, pilot, refresh-pilot, full, or resume.`);
  app.setName("hapa-avatar-builder");
  app.setPath("userData", path.join(app.getPath("appData"), "hapa-avatar-builder"));
  await app.whenReady();
  const credentialStore = createProviderCredentialStore({ userDataPath: app.getPath("userData"), repositoryRoot: ROOT, safeStorage });
  const runner = createEchoReferenceImageGeneration({ userDataPath: app.getPath("userData"), credentialStore, pilotConcurrency: 6, fullConcurrency: 12, pilotCount: 6 });
  const apiBase = loopbackApiBase(process.env.HAPA_AVATAR_API_BASE);
  let status = await runner.status();
  if (command === "pilot") {
    if (status.state !== "not-started") throw new Error(`A current run already exists in state “${status.state}”; inspect it before replacing it.`);
    status = await runner.start({ apiBase });
    await runner._active();
    status = await runner.status();
  } else if (command === "refresh-pilot") {
    status = await runner.refreshPilot({ apiBase });
    await runner._active();
    status = await runner.status();
  } else if (command === "full") {
    status = await runner.continueFull({ apiBase });
    await runner._active();
    status = await runner.status();
  } else if (command === "resume") {
    status = await runner.resume();
    await runner._active();
    status = await runner.status();
  }
  process.stdout.write(`${JSON.stringify(summary(status), null, 2)}\n`);
}

main().catch((error) => {
  const message = String(error?.message || error || "Generation runner failed.").replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]");
  process.stderr.write(`[Echo Reference Images] ${message}\n`);
  process.exitCode = 1;
}).finally(() => app.quit());
