import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export const ECHO_SONG_INGEST_SCHEMA = "hapa.echo-song-ingest-run.v1";
export const ECHO_SONG_INGEST_STAGE_SCHEMA = "hapa.echo-song-ingest-stage.v1";

export const ECHO_SONG_INGEST_STAGES = Object.freeze([
  { id: "source", label: "Source custody", description: "Verify the WAV, MP3, stems archive, Suno identity, lyrics, and style metadata." },
  { id: "analysis", label: "Audio + lyric analysis", description: "Probe masters and stems, bind stem roles, and create explicitly provisional line/word timing for scripts." },
  { id: "references", label: "LLM references", description: "Create attributable reference reasoning and retain uncertainty, rights, and human-review boundaries." },
  { id: "prompts", label: "Card prompts", description: "Translate each accepted reference into a provider-safe, full-bleed Hapa story-card prompt." },
  { id: "images", label: "Reference cards", description: "Generate high-quality portrait cards through the existing encrypted image-generation lane." },
  { id: "loops", label: "Local H3 loops", description: "Queue source-anchored five-second MiniMax H3 loops and retain technical/motion review receipts." },
  { id: "director", label: "Director readiness", description: "Expose audio, stems, lyrics, timing, references, cards, and loops to script generation." },
]);

function text(value = "") { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function safeSlug(value = "") {
  return text(value).normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 96) || "untitled";
}
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function fileDigest(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return `sha256:${hash.digest("hex")}`;
}
function nowIso(now = () => new Date()) { return now().toISOString(); }
function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}
function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filePath);
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function mediaFiles(sourceDir) {
  const files = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(sourceDir, entry.name));
  const byExtension = (extension) => files.filter((file) => path.extname(file).toLowerCase() === extension);
  return { files, wav: byExtension(".wav")[0] || "", mp3: byExtension(".mp3")[0] || "", zip: byExtension(".zip")[0] || "" };
}
function ffprobe(filePath, exec = execFileSync) {
  if (!filePath) return null;
  const output = exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size,bit_rate:format_tags:stream=index,codec_name,codec_type,sample_rate,channels,channel_layout,bit_rate",
    "-of", "json",
    filePath,
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(output);
}
function registryIdFrom(...values) {
  for (const value of values) {
    const match = text(value).match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
    if (match) return match[0].toLowerCase();
  }
  return "";
}
function archiveEntries(zipPath, exec = execFileSync) {
  if (!zipPath) return [];
  const output = exec("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return output.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const normalized = entry.replaceAll("\\", "/");
    if (normalized.startsWith("/") || normalized.split("/").includes("..")) throw new Error(`Unsafe stems archive entry: ${entry}`);
    const extension = path.extname(normalized).toLowerCase();
    if (![".wav", ".mp3"].includes(extension)) throw new Error(`Unsupported stems archive entry: ${entry}`);
    const match = path.basename(normalized).match(/\(([^)]+)\)\.(wav|mp3)$/i);
    // Current Suno stem archives name files "0 Lead Vocals.wav"; keep the role name, not a file stub,
    // so the Audio Atlas can select the isolated vocal by role.
    const ordinalRole = text(path.basename(normalized, extension).replace(/^\d+\s*[-_. ]\s*/u, ""));
    return { entry, extension, stemType: text(match?.[1]) || (/^[A-Za-z][A-Za-z0-9 &'-]{0,79}$/u.test(ordinalRole) ? ordinalRole : safeSlug(path.basename(normalized, extension))) };
  });
}
function stageRows(overrides = {}) {
  return ECHO_SONG_INGEST_STAGES.map((stage, index) => ({
    schemaVersion: ECHO_SONG_INGEST_STAGE_SCHEMA,
    ...stage,
    ordinal: index + 1,
    status: index === 0 ? "ready" : "waiting",
    summary: "",
    samples: [],
    ...(overrides[stage.id] || {}),
  }));
}
function linesWithSections(lyrics = "") {
  const blocks = text(lyrics).split(/\n\s*\n/u).map((block) => block.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)).filter((block) => block.length);
  return blocks.flatMap((block, blockIndex) => block.map((line, lineIndex) => ({
    text: line,
    sectionId: `section-${blockIndex + 1}`,
    sectionLabel: `Lyric section ${blockIndex + 1}`,
    lineIndex,
  })));
}
export function buildProvisionalLyricTiming(lyrics, durationSeconds) {
  const rows = linesWithSections(lyrics);
  const duration = Math.max(0, Number(durationSeconds || 0));
  if (!rows.length || !duration) return [];
  const startAt = Math.min(4, duration * 0.04);
  const endAt = Math.max(startAt + 0.5, duration - Math.min(5, duration * 0.04));
  const weights = rows.map((row) => Math.max(1, row.text.split(/\s+/u).filter(Boolean).length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = startAt;
  return rows.map((row, index) => {
    const allocation = (endAt - startAt) * weights[index] / total;
    const lineStart = cursor;
    const lineEnd = index === rows.length - 1 ? endAt : Math.max(lineStart + 0.2, cursor + allocation);
    cursor = lineEnd;
    const words = row.text.split(/\s+/u).filter(Boolean);
    const wordDuration = (lineEnd - lineStart) / Math.max(1, words.length);
    return {
      id: `timed-line-${index + 1}`,
      start: Number(lineStart.toFixed(3)),
      end: Number(lineEnd.toFixed(3)),
      text: row.text,
      section: row.sectionLabel,
      section_id: row.sectionId,
      section_label: row.sectionLabel,
      confidence: 0.35,
      words: words.map((word, wordIndex) => ({
        word,
        index: wordIndex,
        start: Number((lineStart + wordDuration * wordIndex).toFixed(3)),
        end: Number((lineStart + wordDuration * (wordIndex + 1)).toFixed(3)),
        matched: false,
      })),
    };
  });
}
function normalizeKnowledge(metadata = {}, song = {}) {
  const authoredAt = text(metadata.authoredAt) || new Date().toISOString();
  const passId = text(metadata.passId) || `echo-song-ingest-${safeSlug(song.title)}-${authoredAt.slice(0, 10)}`;
  const references = list(metadata.references);
  const imagePrompts = list(metadata.imagePrompts);
  return {
    schemaVersion: "hapa.song-knowledge.v2",
    understandings: references.map((reference, index) => ({
      schemaVersion: "hapa.song-knowledge-entry.v2",
      id: text(reference.id) || `song-understanding-${safeSlug(passId)}-${index + 1}`,
      kind: "understanding",
      title: text(reference.title) || `Reference ${index + 1}`,
      body: text(reference.body || reference.notes),
      authorType: "agent",
      authorName: text(reference.authorName) || "OpenAI Codex",
      context: "Echo Album incremental song ingest",
      tags: [...new Set(["echo-album", "agent-authored", passId, ...list(reference.tags)])],
      passId,
      createdAt: authoredAt,
      updatedAt: authoredAt,
    })),
    notes: [], anecdotes: [], lessons: [], tarotRationales: [],
    researchReferences: references.map((reference, index) => ({
      schemaVersion: "hapa.song-research-reference.v2",
      id: text(reference.researchId) || `song-reference-${safeSlug(passId)}-${index + 1}`,
      label: text(reference.title) || `Reference ${index + 1}`,
      url: text(reference.url),
      notes: text(reference.notes || reference.body),
      referenceCardId: text(reference.referenceId),
      status: "research-understanding-proposed",
      sourceClass: text(reference.sourceClass) || "lyric-direct-agent-analysis",
      tags: [...new Set(["echo-album", "agent-authored", passId, ...list(reference.tags)])],
      authorType: "agent",
      authorName: text(reference.authorName) || "OpenAI Codex",
      passId,
      createdAt: authoredAt,
      updatedAt: authoredAt,
    })),
    songConnections: [],
    referenceImagePrompts: imagePrompts.map((prompt, index) => ({
      schemaVersion: "hapa.echo-reference-image-prompt.v1",
      id: text(prompt.id) || `echo-reference-image-prompt:${passId}:${song.trackNumber}:${index + 1}`,
      passId,
      author: { type: "agent", name: text(prompt.authorName) || "OpenAI Codex" },
      authoredAt,
      songId: song.id,
      songTitle: song.title,
      trackNumber: song.trackNumber,
      referenceId: text(prompt.referenceId),
      referenceTitle: text(prompt.referenceTitle || prompt.title) || `Lyric reference ${index + 1}`,
      evidenceClass: text(prompt.evidenceClass) || "lyric-direct-agent-analysis",
      lyricCue: text(prompt.lyricCue),
      theme: text(prompt.theme),
      lesson: text(prompt.lesson),
      symbols: text(prompt.symbols),
      palette: list(prompt.palette),
      relatedTarotCard: text(prompt.relatedTarotCard),
      targetModel: text(prompt.targetModel) || "gpt-image-2.5-sunburst",
      outputSettings: { size: "1024x1536", aspectRatio: "2:3", quality: "high", outputFormat: "png", background: "opaque" },
      reviewStatus: "staged-for-human-review",
      generationStatus: "not-started",
      canGenerate: true,
      prompt: text(prompt.prompt || prompt.generationPrompt),
      generationPrompt: text(prompt.generationPrompt || prompt.prompt),
    })).filter((prompt) => prompt.generationPrompt),
    passProvenance: [{
      schemaVersion: "hapa.echo-album-research-pass.v1",
      passId,
      authorType: "agent",
      authorName: "OpenAI Codex",
      authoredAt,
      sourceEdition: "incremental song ingest",
      authority: "reviewable-agent-proposal",
      boundaries: [
        "Lyric presence supports the allusion but not every interpretation.",
        "External references remain attributable research context, not Hapa authorship or endorsement.",
        "Generated images and loops remain human-review candidates until explicitly accepted.",
      ],
    }],
    updatedAt: authoredAt,
  };
}
function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
  return destination;
}
function extractArchive(zipPath, entries, destinationRoot, spawn = spawnSync) {
  return entries.map((entry, index) => {
    const filename = `${String(index + 1).padStart(2, "0")}-${safeSlug(entry.stemType)}${entry.extension}`;
    const destination = path.join(destinationRoot, filename);
    if (!isInside(destinationRoot, destination)) throw new Error("Stem destination escaped the ingest root.");
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    if (fs.existsSync(destination)) return { ...entry, localPath: destination, sha256: fileDigest(destination) };
    const descriptor = fs.openSync(destination, "wx", 0o600);
    try {
      const result = spawn("unzip", ["-p", zipPath, entry.entry], { stdio: ["ignore", descriptor, "pipe"], encoding: "utf8" });
      if (result.status !== 0) throw new Error(`Could not extract ${entry.entry}: ${text(result.stderr)}`);
    } finally { fs.closeSync(descriptor); }
    return { ...entry, localPath: destination, sha256: fileDigest(destination) };
  });
}
function updateStage(manifest, stageId, status, summary, samples = []) {
  const stage = manifest.stages.find((candidate) => candidate.id === stageId);
  if (!stage) throw new Error(`Unknown ingest stage: ${stageId}`);
  Object.assign(stage, { status, summary, samples, updatedAt: new Date().toISOString() });
}
function auditSongStore(songs = []) {
  return {
    songs: songs.length,
    withLyrics: songs.filter((song) => text(song.lyrics?.text)).length,
    withTimings: songs.filter((song) => list(song.lyricTimings).length).length,
    withStems: songs.filter((song) => list(song.stems).length).length,
    withReferencePrompts: songs.filter((song) => list(song.knowledge?.referenceImagePrompts).length).length,
  };
}

export function createEchoSongIngestService({
  root,
  runtimeRoot = path.join(homedir(), "Library", "Application Support", "hapa-avatar-builder", "Echo Song Ingest Runs"),
  now = () => new Date(),
  exec = execFileSync,
  spawn = spawnSync,
} = {}) {
  if (!root) throw new Error("Echo song ingest requires the Avatar Builder repository root.");
  const repositoryRoot = path.resolve(root);
  const runsRoot = path.resolve(runtimeRoot);
  const songbookPath = path.join(repositoryRoot, "data", "dear-papa-songbook.json");
  const songStorePath = path.join(repositoryRoot, "data", "hapa-songs-store.json");
  const manifestPath = (runId) => path.join(runsRoot, safeSlug(runId), "manifest.json");
  function persist(manifest) {
    manifest.updatedAt = nowIso(now);
    atomicWriteJson(manifestPath(manifest.runId), manifest);
    atomicWriteJson(path.join(runsRoot, "current-run.json"), { runId: manifest.runId, updatedAt: manifest.updatedAt });
    return manifest;
  }
  function get(runId = "") {
    let resolved = text(runId);
    if (!resolved) {
      try { resolved = text(readJson(path.join(runsRoot, "current-run.json")).runId); } catch { return null; }
    }
    const candidate = manifestPath(resolved);
    if (!isInside(runsRoot, candidate) || !fs.existsSync(candidate)) return null;
    return readJson(candidate);
  }
  function listRuns() {
    if (!fs.existsSync(runsRoot)) return [];
    return fs.readdirSync(runsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
      try { return readJson(path.join(runsRoot, entry.name, "manifest.json")); } catch { return null; }
    }).filter(Boolean).sort((left, right) => text(right.updatedAt).localeCompare(text(left.updatedAt)));
  }
  function inspect(input = {}) {
    const sourceDir = path.resolve(text(input.sourceDir));
    if (!sourceDir || !fs.statSync(sourceDir).isDirectory()) throw new Error(`Song source folder not found: ${sourceDir}`);
    const source = mediaFiles(sourceDir);
    if (!source.wav || !source.mp3 || !source.zip) throw new Error("The source folder must contain one WAV, one MP3, and one stems ZIP.");
    const [wavProbe, mp3Probe] = [ffprobe(source.wav, exec), ffprobe(source.mp3, exec)];
    const archive = archiveEntries(source.zip, exec);
    const mp3Tags = mp3Probe?.format?.tags || {};
    const registryTrackId = registryIdFrom(input.registryTrackId, input.songUrl, wavProbe?.format?.tags?.comment, mp3Tags.comment);
    if (!registryTrackId) throw new Error("A Suno registry UUID is required in the song URL or source media metadata.");
    const title = text(input.title || mp3Tags.title || path.basename(source.mp3, path.extname(source.mp3)));
    const songUrl = text(input.songUrl) || `https://suno.com/song/${registryTrackId}`;
    const lyrics = text(input.lyrics || mp3Tags["lyrics-eng"] || mp3Tags.lyrics);
    if (!lyrics) throw new Error("Visible or embedded lyrics are required for a vocal Echo Album song.");
    const songStore = readJson(songStorePath);
    const songbook = readJson(songbookPath);
    const existing = list(songStore.songs).find((song) => [song.audio?.registryTrackId, song.registryTrackId, song.lineage?.registryTrackId].includes(registryTrackId));
    const trackNumber = Number(input.trackNumber || existing?.trackNumber || Math.max(0, ...list(songStore.songs).map((song) => Number(song.trackNumber || 0))) + 1);
    const songId = text(input.songId) || safeSlug(title);
    const cardId = text(existing?.id) || `dear-papa-song-${songId}`;
    const authoredAt = nowIso(now);
    const runId = `echo-song-ingest-${safeSlug(title)}-${registryTrackId.slice(0, 8)}`;
    const manifest = {
      schemaVersion: ECHO_SONG_INGEST_SCHEMA,
      runId,
      state: "inspected",
      createdAt: authoredAt,
      updatedAt: authoredAt,
      source: {
        sourceDir,
        songUrl,
        registryTrackId,
        files: {
          wav: { path: source.wav, sha256: fileDigest(source.wav), probe: wavProbe },
          mp3: { path: source.mp3, sha256: fileDigest(source.mp3), probe: mp3Probe },
          stemsZip: { path: source.zip, sha256: fileDigest(source.zip), entries: archive },
        },
      },
      song: {
        id: cardId,
        cardId,
        songId,
        title,
        trackNumber,
        author: text(input.author) || "Calder",
        albumId: "dear-papa-album",
        albumTitle: "Dear Papa",
        duration: Number(wavProbe?.format?.duration || mp3Probe?.format?.duration || 0),
        model: text(input.model) || "v5.5",
        styles: list(input.styles).length ? input.styles.map(text).filter(Boolean) : text(input.style).split(",").map(text).filter(Boolean),
        bpm: Number(input.bpm || text(input.style).match(/(\d+(?:\.\d+)?)\s*BPM/i)?.[1] || 0),
        lyrics,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      },
      research: { references: list(input.references), imagePrompts: list(input.imagePrompts), passId: text(input.passId), authoredAt },
      custody: { sourceCopied: false, storeRegistered: Boolean(existing), repositoryMediaWrites: false, humanReviewRequired: true },
      stages: stageRows({
        source: { status: "complete", summary: `Verified WAV, MP3, and ${archive.length} stem files (${new Set(archive.map((entry) => entry.stemType)).size} roles).`, samples: [path.basename(source.wav), path.basename(source.mp3), path.basename(source.zip)] },
        analysis: { status: "ready", summary: `${Number(wavProbe?.format?.duration || 0).toFixed(2)} seconds · ${lyrics.split(/\s+/u).filter(Boolean).length} lyric words · ready to register and derive provisional timing.` },
        references: { status: list(input.references).length ? "ready" : "waiting", summary: list(input.references).length ? `${input.references.length} LLM-authored reference proposals supplied.` : "Waiting for an attributable LLM reference packet." },
        prompts: { status: list(input.imagePrompts).length ? "ready" : "waiting", summary: list(input.imagePrompts).length ? `${input.imagePrompts.length} high-quality card prompts supplied.` : "Waiting for reference-derived image prompts." },
      }),
      outputs: {},
    };
    return persist(manifest);
  }
  function register(runId = "") {
    const manifest = get(runId);
    if (!manifest) throw new Error(`Echo song ingest run not found: ${runId || "current"}`);
    if (manifest.custody?.sourceCopied && manifest.custody?.storeRegistered) {
      const currentStore = readJson(songStorePath);
      const registeredSong = list(currentStore.songs).find((song) => [song.audio?.registryTrackId, song.registryTrackId, song.lineage?.registryTrackId].includes(manifest.source.registryTrackId));
      if (registeredSong && list(registeredSong.stems).length && list(registeredSong.stems).every((stem) => stem.format === "wav")) return manifest;
    }
    const runRoot = path.dirname(manifestPath(manifest.runId));
    const assetRoot = path.join(runRoot, "assets");
    const sourceRoot = path.join(assetRoot, "source");
    const stemsRoot = path.join(assetRoot, "stems");
    const sourceMp3 = copyFile(manifest.source.files.mp3.path, path.join(sourceRoot, "song.mp3"));
    const sourceWav = copyFile(manifest.source.files.wav.path, path.join(sourceRoot, "song.wav"));
    const sourceZip = copyFile(manifest.source.files.stemsZip.path, path.join(sourceRoot, "stems.zip"));
    const extracted = extractArchive(sourceZip, manifest.source.files.stemsZip.entries, stemsRoot, spawn);
    fs.writeFileSync(path.join(sourceRoot, "lyrics.txt"), `${manifest.song.lyrics}\n`, { mode: 0o600 });
    fs.writeFileSync(path.join(sourceRoot, "style.txt"), `${manifest.song.styles.join(", ")}\n`, { mode: 0o600 });
    const preferredStems = [...new Map(extracted.sort((left, right) => Number(left.extension === ".wav") - Number(right.extension === ".wav")).map((stem) => [stem.stemType.toLowerCase(), stem])).values()]
      .sort((left, right) => left.stemType.localeCompare(right.stemType));
    const lyricTimings = buildProvisionalLyricTiming(manifest.song.lyrics, manifest.song.duration);
    const timestamp = nowIso(now);
    const store = readJson(songStorePath);
    const songbook = readJson(songbookPath);
    const storeIndex = list(store.songs).findIndex((song) => [song.audio?.registryTrackId, song.registryTrackId, song.lineage?.registryTrackId].includes(manifest.source.registryTrackId));
    const priorStoreSong = storeIndex >= 0 ? store.songs[storeIndex] : {};
    const knowledge = normalizeKnowledge({
      references: manifest.research.references,
      imagePrompts: manifest.research.imagePrompts,
      passId: manifest.research.passId,
      authoredAt: manifest.research.authoredAt,
    }, manifest.song);
    const lyricSha = sha256(manifest.song.lyrics);
    const storeSong = {
      ...priorStoreSong,
      schemaVersion: "hapa.song-card.v1",
      id: manifest.song.id,
      cardId: manifest.song.cardId,
      songId: manifest.song.songId,
      albumId: manifest.song.albumId,
      albumTitle: manifest.song.albumTitle,
      albumAliases: ["Dear Papa", "Echo Album"],
      trackNumber: manifest.song.trackNumber,
      title: manifest.song.title,
      author: manifest.song.author,
      status: "active",
      loreStatus: "hapa_lore_not_hard_canon",
      lyrics: { status: "available", text: manifest.song.lyrics, sha256: lyricSha, sourceKind: "suno-visible-and-embedded-lyrics", sourceId: manifest.source.registryTrackId, sourceTitle: manifest.song.title, sourceTextType: "lyrics", timingStatus: "audio-duration-shaped-provisional-needs-review" },
      lyricTimings,
      lyricTimingSource: { schemaVersion: "hapa.echo.lyric-timing-source.v1", source: "echo-song-ingest", timingSource: "audio-duration-shaped-provisional", registryTrackId: manifest.source.registryTrackId, confidence: 0.35, quality: { qualityStatus: "provisional-needs-forced-alignment", humanReviewed: false }, updatedAt: timestamp },
      audio: { registryTrackId: manifest.source.registryTrackId, sourceNode: "suno", mp3Uri: sourceMp3, wavUri: sourceWav, localPath: sourceWav, coverUri: "", duration: manifest.song.duration, model: manifest.song.model, localAvailable: true, bpm: manifest.song.bpm },
      stems: preferredStems.map((stem) => ({ id: `stem:${manifest.song.songId}:${safeSlug(stem.stemType)}`, stemType: stem.stemType, kind: safeSlug(stem.stemType), localPath: stem.localPath, format: stem.extension.slice(1), sha256: stem.sha256, sourceArchiveSha256: manifest.source.files.stemsZip.sha256 })),
      knowledge,
      referenceConnectors: list(priorStoreSong.referenceConnectors),
      attribution: { author: manifest.song.author, rightsStatus: "operator_authored_hapa_creative_commons", songRegistryTrackId: manifest.source.registryTrackId },
      lineage: { ...(priorStoreSong.lineage || {}), registryTrackId: manifest.source.registryTrackId, sourceRunId: manifest.runId, sourceDirectory: manifest.source.sourceDir, lyricsSha256: lyricSha, sourceAudioSha256: manifest.source.files.wav.sha256, sourceMp3Sha256: manifest.source.files.mp3.sha256, stemsArchiveSha256: manifest.source.files.stemsZip.sha256 },
      styles: manifest.song.styles,
      tags: [...new Set([...(priorStoreSong.tags || []), "echo-album", "suno", "incremental-ingest", ...manifest.song.styles.map(safeSlug)])],
      createdAt: priorStoreSong.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (storeIndex >= 0) store.songs[storeIndex] = storeSong; else store.songs.push(storeSong);
    store.songs.sort((left, right) => Number(left.trackNumber || 0) - Number(right.trackNumber || 0));
    store.audit = { ...(store.audit || {}), ...auditSongStore(store.songs), lastIncrementalIngestRunId: manifest.runId };
    store.updatedAt = timestamp;
    const bookIndex = list(songbook.songCards).findIndex((song) => [song.registryTrackId, song.lineage?.registryTrackId].includes(manifest.source.registryTrackId));
    const priorCard = bookIndex >= 0 ? songbook.songCards[bookIndex] : {};
    const card = {
      ...priorCard,
      id: manifest.song.cardId,
      schemaVersion: "hapa.foundation.song-lore-card.v1",
      cardType: "song_lore_card",
      albumId: manifest.song.albumId,
      albumTitle: manifest.song.albumTitle,
      trackNumber: manifest.song.trackNumber,
      songId: manifest.song.songId,
      registryTrackId: manifest.source.registryTrackId,
      sunoUrl: manifest.source.songUrl,
      title: manifest.song.title,
      author: manifest.song.author,
      lyrics: { ...storeSong.lyrics, timingLineCount: lyricTimings.length, timingConfidence: 0.35, timingQuality: storeSong.lyricTimingSource.quality },
      sourceAnchors: [{ id: `suno-song-${manifest.source.registryTrackId.slice(0, 8)}`, kind: "suno-song", title: manifest.song.title, path: runRoot, registryTrackId: manifest.source.registryTrackId, confidence: "hard" }],
      sync: { schemaVersion: "hapa.dear-papa-song-card-sync.v1", registryTrackId: manifest.source.registryTrackId, localPath: sourceWav, stemCount: preferredStems.length, stemTypes: preferredStems.map((stem) => stem.stemType), updatedAt: timestamp },
      lineage: storeSong.lineage,
      createdAt: priorCard.createdAt || timestamp,
      updatedAt: timestamp,
    };
    if (bookIndex >= 0) songbook.songCards[bookIndex] = card; else songbook.songCards.push(card);
    songbook.songCards.sort((left, right) => Number(left.trackNumber || 0) - Number(right.trackNumber || 0));
    songbook.summary = { ...(songbook.summary || {}), songCards: songbook.songCards.length, withLyrics: songbook.songCards.filter((song) => text(song.lyrics?.text)).length };
    songbook.updatedAt = timestamp;
    const backupRoot = path.join(repositoryRoot, "data", "backups", `${manifest.runId}-before-register-${timestamp.replace(/[:.]/g, "-")}`);
    fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    copyFile(songStorePath, path.join(backupRoot, "hapa-songs-store.json"));
    copyFile(songbookPath, path.join(backupRoot, "dear-papa-songbook.json"));
    atomicWriteJson(songStorePath, store);
    atomicWriteJson(songbookPath, songbook);
    Object.assign(manifest.custody, { sourceCopied: true, storeRegistered: true, repositoryMediaWrites: false, runtimeRoot: runRoot, backupRoot });
    manifest.outputs = { ...manifest.outputs, sourceRoot, stemsRoot, sourceMp3, sourceWav, sourceZip, stemCount: preferredStems.length, lyricTimingCount: lyricTimings.length, songStorePath, songbookPath };
    manifest.state = "registered";
    updateStage(manifest, "analysis", "complete", `${preferredStems.length} preferred stem roles bound; ${lyricTimings.length} provisional timed lyric lines are usable for scripting and explicitly await forced-alignment review.`, preferredStems.slice(0, 3).map((stem) => `${stem.stemType} · ${stem.extension.slice(1)}`));
    updateStage(manifest, "references", knowledge.understandings.length ? "complete" : "waiting", knowledge.understandings.length ? `${knowledge.understandings.length} attributable LLM reference proposals attached.` : "No LLM reference packet has been attached yet.", knowledge.understandings.slice(0, 3).map((entry) => entry.title));
    updateStage(manifest, "prompts", knowledge.referenceImagePrompts.length ? "complete" : "waiting", knowledge.referenceImagePrompts.length ? `${knowledge.referenceImagePrompts.length} provider-safe card prompts attached.` : "No image prompts have been attached yet.", knowledge.referenceImagePrompts.slice(0, 3).map((entry) => entry.referenceTitle));
    updateStage(manifest, "images", knowledge.referenceImagePrompts.length ? "ready" : "waiting", knowledge.referenceImagePrompts.length ? `Run the song-scoped image lane for ${manifest.song.id}.` : "Image generation waits for prompts.");
    updateStage(manifest, "director", "ready", "The Song Card, masters, stems, lyrics, provisional timing, and reference packet are available to Director planning; final readiness waits for card/loop completion.", [manifest.song.title, `${preferredStems.length} stems`, `${lyricTimings.length} timed lines`]);
    return persist(manifest);
  }
  function recordImageRun(runId, imageStatus = {}) {
    const manifest = get(runId);
    if (!manifest) throw new Error(`Echo song ingest run not found: ${runId}`);
    manifest.outputs.imageRun = imageStatus;
    const completedJobs = list(imageStatus.jobs).filter((job) => job.status === "completed");
    const completed = Number(imageStatus?.counts?.completed ?? completedJobs.length);
    updateStage(manifest, "images", completed > 0 ? "complete" : "queued", completed > 0 ? `${completed} reference cards generated in ${imageStatus.runId}.` : `Reference cards queued in ${imageStatus.runId || "the current image run"}.`, completedJobs.slice(0, 3).map((job) => job.referenceTitle || job.visualConceptTitle || job.id));
    updateStage(manifest, "loops", completed > 0 ? "ready" : "waiting", completed > 0 ? "Cards are ready for the local MiniMax H3 missing-loop queue." : "Loops wait for generated cards.");
    manifest.state = completed > 0 ? "cards-generated" : "cards-queued";
    return persist(manifest);
  }
  function recordLoopRun(runId, loopStatus = {}) {
    const manifest = get(runId);
    if (!manifest) throw new Error(`Echo song ingest run not found: ${runId}`);
    manifest.outputs.loopRun = loopStatus;
    const completed = Number(loopStatus?.counts?.completed || 0);
    const total = Number(loopStatus?.counts?.total || 0);
    updateStage(manifest, "loops", completed && completed === total ? "complete" : total ? "queued" : "waiting", total ? `${completed}/${total} local H3 loops completed; held motion candidates remain explicit.` : "No local H3 queue is attached yet.", list(loopStatus.jobs).filter((job) => job.status === "completed").slice(0, 3).map((job) => job.cardTitle || job.id));
    if (completed && completed === total) {
      updateStage(manifest, "director", "complete", "The incremental song now exposes the source, analysis, references, cards, and loops expected by the album media workflow.", [manifest.song.title, `${manifest.outputs.stemCount || 0} stems`, `${completed} card loops`]);
      manifest.state = "complete";
    } else manifest.state = "loops-queued";
    return persist(manifest);
  }
  return Object.freeze({ inspect, register, get, listRuns, recordImageRun, recordLoopRun, runsRoot });
}
