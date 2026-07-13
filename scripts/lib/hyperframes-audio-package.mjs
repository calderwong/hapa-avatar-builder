import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SUPPORTED_AUDIO = new Map([
  [".mp3", { extension: ".mp3", mimeType: "audio/mpeg" }],
  [".wav", { extension: ".wav", mimeType: "audio/wav" }],
  [".wave", { extension: ".wav", mimeType: "audio/wav" }],
  [".m4a", { extension: ".m4a", mimeType: "audio/mp4" }],
  [".mp4", { extension: ".mp4", mimeType: "audio/mp4" }],
  [".aac", { extension: ".aac", mimeType: "audio/aac" }],
  [".flac", { extension: ".flac", mimeType: "audio/flac" }],
  [".ogg", { extension: ".ogg", mimeType: "audio/ogg" }],
  [".oga", { extension: ".ogg", mimeType: "audio/ogg" }],
  [".opus", { extension: ".opus", mimeType: "audio/ogg; codecs=opus" }],
  [".webm", { extension: ".webm", mimeType: "audio/webm" }],
]);

function sha256File(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function regularFile(filePath) {
  try { return fs.statSync(filePath).isFile(); } catch { return false; }
}

export function packageHyperFramesAudio({ sourcePath, outputDirectory, ffmpeg = "ffmpeg" } = {}) {
  if (!sourcePath || !path.isAbsolute(sourcePath) || !regularFile(sourcePath)) return null;
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const name of fs.readdirSync(outputDirectory)) {
    if (/^full_mix\./u.test(name)) fs.rmSync(path.join(outputDirectory, name), { force: true });
  }

  const sourceSha256 = sha256File(sourcePath);
  const supported = SUPPORTED_AUDIO.get(path.extname(sourcePath).toLowerCase());
  const format = supported || { extension: ".wav", mimeType: "audio/wav" };
  const destination = path.join(outputDirectory, `full_mix${format.extension}`);
  let operation = "copy";

  if (supported) {
    fs.copyFileSync(sourcePath, destination);
  } else {
    operation = "transcode-pcm-s16le-48khz-stereo";
    const temporary = `${destination}.tmp.wav`;
    fs.rmSync(temporary, { force: true });
    const result = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", sourcePath,
      "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-map_metadata", "-1", "-map_chapters", "-1",
      "-fflags", "+bitexact", "-flags:a", "+bitexact",
      "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le",
      temporary,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (result.error || result.status !== 0 || !regularFile(temporary)) {
      fs.rmSync(temporary, { force: true });
      throw new Error(`Unable to transcode the master audio into a truthful WAV package: ${String(result.stderr || result.error?.message || "ffmpeg failed").trim()}`);
    }
    fs.renameSync(temporary, destination);
  }

  return {
    sourcePath,
    sourceSha256,
    destination,
    uri: `assets/audio/${path.basename(destination)}`,
    mimeType: format.mimeType,
    extension: format.extension,
    operation,
    sha256: sha256File(destination),
  };
}
