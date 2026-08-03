import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createHumanVideoReferenceReviewStore,
  HUMAN_VIDEO_REFERENCE_REVIEW_EVENT_SCHEMA,
  normalizeHumanVideoReferenceReviewStore,
  upsertHumanVideoReferenceReview,
} from "../src/domain/human-video-reference-review.js";

export function openHumanVideoReferenceReviewStore({ filePath, eventPath, clock = () => new Date().toISOString() } = {}) {
  if (!filePath) throw new Error("Human video reference review store requires a file path.");
  const resolvedFilePath = path.resolve(filePath);
  const resolvedEventPath = path.resolve(eventPath || path.join(path.dirname(resolvedFilePath), "human-video-reference-review-events.ndjson"));
  let writeQueue = Promise.resolve();

  async function read() {
    try {
      return normalizeHumanVideoReferenceReviewStore(JSON.parse(await readFile(resolvedFilePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return createHumanVideoReferenceReviewStore();
      error.code ||= "human_video_reference_review_store_invalid";
      error.statusCode ||= 500;
      throw error;
    }
  }

  async function submit(input = {}, options = {}) {
    const operation = async () => {
      const now = clock();
      const result = upsertHumanVideoReferenceReview(await read(), input, { ...options, now });
      await writeAtomic(resolvedFilePath, result.store);
      await mkdir(path.dirname(resolvedEventPath), { recursive: true });
      await appendFile(resolvedEventPath, `${JSON.stringify({
        schemaVersion: HUMAN_VIDEO_REFERENCE_REVIEW_EVENT_SCHEMA,
        action: "human-video-reference-review.submitted",
        occurredAt: now,
        reviewId: result.review.id,
        videoKey: result.review.videoKey,
        revision: result.review.revision,
        opticalReviewId: result.review.opticalReview.id,
        cardPacketId: result.review.packet.id,
        cardPacketDigest: result.review.packet.digest,
        agentId: result.review.reviewer.agentId,
        model: result.review.reviewer.model,
        reasoningEffort: result.review.reviewer.reasoningEffort,
      })}\n`, "utf8");
      return result;
    };
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  return { read, submit, filePath: resolvedFilePath, eventPath: resolvedEventPath };
}

async function writeAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}
