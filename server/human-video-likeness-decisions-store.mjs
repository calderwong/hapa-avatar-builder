// Human Video Likeness Decisions — durable store (Avatar Likeness
// Assignment, layer L4). Mirrors the Quick Sort decision store discipline:
// one in-process serialized write chain, a cross-process file lock around
// decide(), tmp-file + rename landing, and append-only event receipts.
//
// This is the human gate in front of the Director: likeness placements
// only become consumable after a human records a decision here.

import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { withLocalJsonFileLock } from "./local-json-file-lock.mjs";
import {
  createHumanVideoLikenessDecisionsStore,
  HUMAN_VIDEO_LIKENESS_DECISION_EVENT_SCHEMA,
  normalizeHumanVideoLikenessDecisionsStore,
  upsertHumanVideoLikenessDecision,
} from "../src/domain/human-video-likeness-decisions.js";

export function openHumanVideoLikenessDecisionsStore({ filePath, eventPath, clock = () => new Date().toISOString() } = {}) {
  if (!filePath) throw new Error("Human video likeness decisions store requires a file path.");
  const resolvedFilePath = path.resolve(filePath);
  const resolvedEventPath = path.resolve(eventPath || path.join(path.dirname(resolvedFilePath), "human-video-likeness-decisions-events.ndjson"));
  let writeQueue = Promise.resolve();

  async function read() {
    try {
      return normalizeHumanVideoLikenessDecisionsStore(JSON.parse(await readFile(resolvedFilePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return createHumanVideoLikenessDecisionsStore();
      error.code ||= "human_video_likeness_decisions_store_invalid";
      error.statusCode ||= 500;
      throw error;
    }
  }

  async function decide(input = {}, options = {}) {
    return enqueue(() => withLocalJsonFileLock(`${resolvedFilePath}.lock`, async () => {
      const now = clock();
      const result = upsertHumanVideoLikenessDecision(await read(), input, { now, actorId: options.actorId });
      if (!result.changed) return result;
      await writeAtomic(resolvedFilePath, result.store);
      await appendEvent(resolvedEventPath, {
        schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_EVENT_SCHEMA,
        eventId: `${result.decision.videoKey}:r${result.decision.revision}`,
        action: `human-video-likeness.${result.decision.state}`,
        occurredAt: now,
        actorId: result.decision.actorId,
        videoKey: result.decision.videoKey,
        revision: result.decision.revision,
        authority: "human-likeness-acceptance-only",
      });
      return result;
    }, { errorCode: "human_video_likeness_decisions_store_locked", errorMessage: "The likeness decision ledger is busy in another process; retry this decision." }));
  }

  function enqueue(operation) {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  return { filePath: resolvedFilePath, eventPath: resolvedEventPath, read, decide };
}

async function writeAtomic(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function appendEvent(filePath, event) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`);
}
