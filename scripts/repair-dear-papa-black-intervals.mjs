#!/usr/bin/env node
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const DEFAULT_SOURCE = path.join(ROOT, "outputs/hyperframes-dear-papa-v2-foundation-demo/renders/dear-papa-foundation-production.mp4");
const DEFAULT_OUTPUT = path.join(ROOT, "outputs/dear-papa-production-repair/dear-papa-foundation-no-black.mp4");

async function sha256(filePath) {
  const bytes = await fsp.readFile(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function audioMd5(filePath) {
  const { stdout } = await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", filePath, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"], { maxBuffer: 8 * 1024 * 1024 });
  return String(stdout).trim().replace(/^MD5=/u, "");
}

export async function detectBlackIntervals(filePath) {
  let stderr = "";
  try {
    ({ stderr } = await exec("ffmpeg", ["-hide_banner", "-nostats", "-i", filePath, "-vf", "blackdetect=d=0.25:pix_th=0.10", "-an", "-f", "null", "-"], { maxBuffer: 32 * 1024 * 1024 }));
  } catch (error) {
    stderr = String(error?.stderr || "");
    if (!stderr.includes("black_start:")) throw error;
  }
  return [...String(stderr).matchAll(/black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/gu)].map((match) => ({ startSeconds: Number(match[1]), endSeconds: Number(match[2]), durationSeconds: Number(match[3]) }));
}

async function durationSeconds(filePath) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath]);
  return Number(String(stdout).trim());
}

export async function repairBlackIntervals({ source, output }) {
  const intervals = await detectBlackIntervals(source);
  if (!intervals.length) throw new Error("The source has no black intervals to repair.");
  const work = path.join(path.dirname(output), ".black-repair-work");
  await fsp.mkdir(work, { recursive: true });
  await fsp.mkdir(path.dirname(output), { recursive: true });
  const frames = [];
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    const frame = path.join(work, `neighbor-${index + 1}.png`);
    const sourceSeconds = Math.max(0, interval.startSeconds - 0.2);
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(sourceSeconds), "-i", source, "-frames:v", "1", frame]);
    frames.push({ frame, sourceSeconds, ...interval });
  }
  const temporary = `${output}.${process.pid}.tmp.mp4`;
  const inputs = ["-i", source, ...frames.flatMap((row) => ["-loop", "1", "-i", row.frame])];
  let prior = "0:v";
  const filters = [];
  frames.forEach((row, index) => {
    const next = `repair${index + 1}`;
    filters.push(`[${prior}][${index + 1}:v]overlay=shortest=1:enable='between(t,${row.startSeconds},${row.endSeconds})'[${next}]`);
    prior = next;
  });
  const duration = await durationSeconds(source);
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", `[${prior}]`, "-map", "0:a:0", "-t", String(duration), "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", temporary], { maxBuffer: 32 * 1024 * 1024 });
  await fsp.rename(temporary, output);
  const remaining = await detectBlackIntervals(output);
  const sourceAudioMd5 = await audioMd5(source);
  const outputAudioMd5 = await audioMd5(output);
  const receipt = {
    schemaVersion: "hapa.song-card.black-interval-repair.v1",
    ok: remaining.length === 0 && sourceAudioMd5 === outputAudioMd5,
    method: "neighboring-hapa-frame-hold-over-undeclared-black-interval",
    sourceSha256: await sha256(source),
    outputSha256: await sha256(output),
    sourceAudioMd5,
    outputAudioMd5,
    audioPacketsPreserved: sourceAudioMd5 === outputAudioMd5,
    repairedIntervals: frames.map(({ frame: _frame, ...row }) => row),
    remainingBlackIntervals: remaining,
    creativeDecisionRun: false,
    note: "Each undeclared black interval is covered by the last neighboring non-black Hapa frame; soundtrack packets remain byte-identical.",
  };
  await fsp.writeFile(path.join(path.dirname(output), "black-interval-repair-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  if (!receipt.ok) throw new Error(`Black repair verification failed: ${JSON.stringify(receipt)}`);
  return receipt;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = path.resolve(process.argv[2] || DEFAULT_SOURCE);
  const output = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const receipt = await repairBlackIntervals({ source, output });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
