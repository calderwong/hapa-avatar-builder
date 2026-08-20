import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { withLocalJsonFileLock } from "./local-json-file-lock.mjs";
import {
  createHumanVideoQuickSortStore,
  HUMAN_VIDEO_QUICK_SORT_EVENT_SCHEMA,
  normalizeHumanVideoQuickSortStore,
  upsertHumanVideoQuickSortDecision,
} from "../src/domain/human-video-quick-sort.js";

export function openHumanVideoQuickSortStore({ filePath, eventPath, clock = () => new Date().toISOString() } = {}) {
  if (!filePath) throw new Error("Human video Quick Sort store requires a file path.");
  const resolvedFilePath = path.resolve(filePath);
  const resolvedEventPath = path.resolve(eventPath || path.join(path.dirname(resolvedFilePath), "human-video-quick-sort-events.ndjson"));
  let writeQueue = Promise.resolve();

  async function read() {
    try {
      return normalizeHumanVideoQuickSortStore(JSON.parse(await readFile(resolvedFilePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return createHumanVideoQuickSortStore();
      error.code ||= "human_video_quick_sort_store_invalid";
      error.statusCode ||= 500;
      throw error;
    }
  }

  async function decide(input = {}, options = {}) {
    return enqueue(() => withLocalJsonFileLock(`${resolvedFilePath}.lock`, async () => {
      const now = clock();
      const result = upsertHumanVideoQuickSortDecision(await read(), input, { now, actorId: options.actorId });
      if (!result.changed) return result;
      await writeAtomic(resolvedFilePath, result.store);
      await appendEvent(resolvedEventPath, {
        schemaVersion: HUMAN_VIDEO_QUICK_SORT_EVENT_SCHEMA,
        eventId: `${result.decision.videoKey}:r${result.decision.revision}`,
        action: `human-video-quick-sort.${result.decision.state}`,
        occurredAt: now,
        actorId: result.decision.actorId,
        videoKey: result.decision.videoKey,
        revision: result.decision.revision,
        authority: "human-media-triage-only",
      });
      return result;
    }, { errorCode: "human_video_quick_sort_store_locked", errorMessage: "The Quick Sort ledger is busy in another process; retry this decision." }));
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
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}
