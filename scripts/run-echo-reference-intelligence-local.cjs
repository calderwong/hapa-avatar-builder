#!/usr/bin/env node
const os = require("node:os");
const path = require("node:path");
const { createEchoReferenceIntelligence } = require("../electron/echo-reference-intelligence.cjs");

const ROOT = path.resolve(__dirname, "..");
const command = String(process.argv[2] || "status").trim().toLowerCase();
const userDataPath = path.resolve(process.env.HAPA_AVATAR_USER_DATA || path.join(os.homedir(), "Library", "Application Support", "hapa-avatar-builder"));

function concise(status = {}) {
  return {
    ok: status.ok,
    runId: status.runId || "",
    state: status.state,
    authoringProvider: status.authoringProvider,
    model: status.model,
    reasoningEffort: status.reasoningEffort,
    concurrency: status.concurrency,
    counts: status.counts,
    failedSongs: (status.jobs || []).filter((job) => job.status === "failed").map((job) => ({ trackNumber: job.trackNumber, songTitle: job.songTitle, error: job.error })),
  };
}

async function main() {
  if (!["status", "audit", "local-pilot", "local-resume"].includes(command)) throw new Error("Use status, audit, local-pilot, or local-resume.");
  const runner = createEchoReferenceIntelligence({
    userDataPath,
    credentialStore: { read: async () => { throw new Error("The local authoring runner must never read a paid-provider credential."); } },
    sourceSongbookPath: path.join(ROOT, "data", "dear-papa-songbook.json"),
    concurrency: 1,
  });
  let status = await runner.status();
  if (command === "audit") status = await runner.audit();
  if (command === "local-pilot" || command === "local-resume") {
    status = await runner.resumeLocal({ limit: command === "local-pilot" ? Number(process.argv[3] || process.env.HAPA_ECHO_LOCAL_PILOT_SONGS || 3) : 0 });
    await runner._active();
    status = await runner.status();
  }
  process.stdout.write(`${JSON.stringify(concise(status), null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[Echo Local Reference Intelligence] ${String(error?.message || error).replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]")}\n`);
  process.exitCode = 1;
});
