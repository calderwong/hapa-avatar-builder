import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createHumanVideoAgentReviewStore,
  decideHumanVideoAgentReview,
  HUMAN_VIDEO_AGENT_REVIEW_EVENT_SCHEMA,
  normalizeHumanVideoAgentReviewStore,
  upsertHumanVideoAgentReview,
} from "../src/domain/human-video-agent-review.js";

export function openHumanVideoAgentReviewStore({ filePath, eventPath, clock = () => new Date().toISOString() } = {}) {
  if (!filePath) throw new Error("Human video agent review store requires a file path.");
  const resolvedFilePath = path.resolve(filePath);
  const resolvedEventPath = path.resolve(eventPath || path.join(path.dirname(resolvedFilePath), "human-video-agent-review-events.ndjson"));
  let writeQueue = Promise.resolve();

  async function read() {
    try {
      return normalizeHumanVideoAgentReviewStore(JSON.parse(await readFile(resolvedFilePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return createHumanVideoAgentReviewStore();
      error.code ||= "human_video_agent_review_store_invalid";
      error.statusCode ||= 500;
      throw error;
    }
  }

  async function submit(input = {}, options = {}) {
    return enqueue(async () => {
      const now = clock();
      const result = upsertHumanVideoAgentReview(await read(), input, { now, agentId: options.agentId });
      await writeAtomic(resolvedFilePath, result.store);
      await appendEvent(resolvedEventPath, {
        schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_EVENT_SCHEMA,
        action: "human-video-agent-review.submitted",
        occurredAt: now,
        reviewId: result.review.id,
        videoKey: result.review.videoKey,
        revision: result.review.revision,
        agentId: result.review.reviewer.agentId,
        taskId: result.review.reviewer.taskId,
        inspectedFrameCount: result.review.evidence.inspectedFrameCount,
        semanticJudgmentAutomation: false,
      });
      return result;
    });
  }

  async function decide(reviewId, input = {}, options = {}) {
    return enqueue(async () => {
      const now = clock();
      const result = decideHumanVideoAgentReview(await read(), reviewId, input, { now, actorId: options.actorId });
      await writeAtomic(resolvedFilePath, result.store);
      await appendEvent(resolvedEventPath, {
        schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_EVENT_SCHEMA,
        action: `human-video-agent-review.${result.review.status}`,
        occurredAt: now,
        reviewId: result.review.id,
        videoKey: result.review.videoKey,
        revision: result.review.revision,
        actorId: result.review.humanDecision?.actorId || options.actorId || "local-human-operator",
      });
      return result;
    });
  }

  function enqueue(operation) {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  return { filePath: resolvedFilePath, eventPath: resolvedEventPath, read, submit, decide };
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
