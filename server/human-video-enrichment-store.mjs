import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  attachHumanEnrichmentToDirectorProject,
  createHumanVideoEnrichmentStore,
  normalizeHumanVideoEnrichmentStore,
  upsertHumanVideoEnrichment,
} from "../src/domain/human-video-enrichment.js";

export function openHumanVideoEnrichmentStore({ filePath, eventPath, clock = () => new Date().toISOString() } = {}) {
  if (!filePath) throw new Error("Human video enrichment store requires a file path.");
  const resolvedFilePath = path.resolve(filePath);
  const resolvedEventPath = path.resolve(eventPath || path.join(path.dirname(resolvedFilePath), "human-video-enrichment-events.ndjson"));
  let writeQueue = Promise.resolve();

  async function read() {
    try {
      return normalizeHumanVideoEnrichmentStore(JSON.parse(await readFile(resolvedFilePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return createHumanVideoEnrichmentStore();
      error.code ||= "human_enrichment_store_invalid";
      error.statusCode ||= 500;
      throw error;
    }
  }

  async function update(input = {}, options = {}) {
    const operation = writeQueue.then(async () => {
      const current = await read();
      const now = clock();
      const result = upsertHumanVideoEnrichment(current, input, {
        now,
        actorId: options.actorId || input.updatedBy || "local-human-operator",
      });
      await writeAtomic(resolvedFilePath, result.store);
      await appendEvent(resolvedEventPath, {
        schemaVersion: "hapa.human-video-enrichment-event.v1",
        eventId: `${result.record.key}:r${result.record.revision}`,
        action: "human-video-enrichment.updated",
        occurredAt: now,
        actorId: result.record.updatedBy,
        videoKey: result.record.key,
        revision: result.record.revision,
        quality: result.record.quality,
        hasDescription: Boolean(result.record.description),
        categoryCount: result.record.categories.length,
        tagCount: result.record.tags.length,
        avatarMentionCount: result.record.avatarMentions.length,
        referenceCount: result.record.references.length,
        hasDirectorNotes: Boolean(result.record.directorNotes),
        agentReviewId: result.record.agentReviewLineage?.reviewId || null,
        authority: "human-direction-only",
      });
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function attachToDirectorProject(project = {}) {
    return attachHumanEnrichmentToDirectorProject(project, await read());
  }

  return {
    filePath: resolvedFilePath,
    eventPath: resolvedEventPath,
    read,
    update,
    attachToDirectorProject,
  };
}

async function writeAtomic(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function appendEvent(filePath, event) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}
