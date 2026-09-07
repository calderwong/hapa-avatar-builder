import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHumanVideoBenchmarkComparison } from "../src/domain/human-video-benchmark-comparison.js";

const ACCEPTED_OUTPUT_FILE = "all-40-accepted-optical-output.sanitized.json";

export function openHumanVideoBenchmarkComparison(options = {}) {
  const root = path.resolve(String(options.root || ""));
  const runId = String(options.runId || "human-enricher-mechanical-benchmark");
  return Object.freeze({
    root,
    runId,
    async read(catalogVideos = []) {
      if (!options.root) throw comparisonUnavailable("Set HAPA_HUMAN_VIDEO_BENCHMARK_ROOT to the completed benchmark's `full` artifact directory.");
      const [report, dispatcher, acceptedOutput] = await Promise.all([
        readJson(path.join(root, "report.json")),
        readJson(path.join(root, "store.json")),
        readJson(path.join(root, "readable-output", ACCEPTED_OUTPUT_FILE)),
      ]);
      return createHumanVideoBenchmarkComparison({
        runId,
        report,
        dispatcher,
        acceptedOutput,
        catalogVideos,
        generatedAt: new Date().toISOString(),
      });
    },
  });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw comparisonUnavailable(`Required benchmark artifact is missing: ${path.basename(filePath)}.`);
    const wrapped = new Error(`Could not read the completed benchmark artifact ${path.basename(filePath)}: ${error?.message || error}`);
    wrapped.code = "human_video_benchmark_comparison_read_failed";
    wrapped.statusCode = 500;
    throw wrapped;
  }
}

function comparisonUnavailable(message) {
  const error = new Error(message);
  error.code = "human_video_benchmark_comparison_unavailable";
  error.statusCode = 503;
  return error;
}
