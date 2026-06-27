import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEchoGapsReport } from "../src/domain/echos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const REPORT_PATH = path.join(DATA_DIR, "echos-gaps-report.json");

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || args.has("--check");
  const outputArg = getArgValue("--output");
  const reportPath = outputArg ? path.resolve(ROOT, outputArg) : REPORT_PATH;

  try {
    const [book, itemStore, sceneStore] = await Promise.all([
      readJson(SONGBOOK_PATH),
      readJson(ITEM_STORE_PATH),
      readJson(SCENE_STORE_PATH),
    ]);

    const report = buildEchoGapsReport({ songbook: book, itemStore, sceneStore });

    if (dryRun) {
      console.log(JSON.stringify({
        schemaVersion: report.schemaVersion,
        scoring: report.scoring,
        overallScore: report.overallScore,
        rawPresenceOverallScore: report.rawPresenceOverallScore,
        summary: report.summary,
      }, null, 2));
      console.log("Dry run complete. No files were written.");
      return;
    }

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`Audit complete. Gap report saved to: ${path.relative(ROOT, reportPath)}`);
    console.log(`Truth Completeness: ${report.overallScore}% (raw presence: ${report.rawPresenceOverallScore}%)`);
    console.log(`- Songs: ${report.summary.averageSongCompleteness}% truth / ${report.summary.averageSongRawPresence}% raw`);
    console.log(`- Videos: ${report.summary.averageVideoCompleteness}% truth / ${report.summary.averageVideoRawPresence}% raw`);
    console.log(`- Placeholder songs: ${report.summary.placeholderSongs}`);
    console.log(`- Placeholder videos: ${report.summary.placeholderVideos}`);
  } catch (err) {
    console.error("Audit failed:", err);
    process.exitCode = 1;
  }
}

main();
