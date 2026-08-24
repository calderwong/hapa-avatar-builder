#!/usr/bin/env node
// Avatar Likeness match batch (L3).
//
// Signs the durable Human Enricher accepted set into media likeness
// signatures and matches each against every Avatar likeness profile,
// persisting gated verdicts. The batch is the PROPOSAL layer: verdicts
// are ranked candidates for the human likeness lane (layer L4), never
// auto-applied placements.
//
// Usage:
//   node scripts/avatar-likeness-match.mjs [--apply] [--limit <n>]
//     [--concurrency <n>] [--top <n>] [--data-root <dir>]
//     [--likeness-dir <dir>] [--json]
//   node scripts/avatar-likeness-match.mjs calibrate [--max-per-avatar <n>]
//     [--concurrency <n>] [--json]
//
// Calibrate mode builds a self-labeled set from the Avatars' own
// identity-class media (preferencing assets that were sampled OUT of the
// profile, so the ground truth is not already inside the profile) and
// reports the observed true-vs-best-other separation used to set the
// verdict gate.
//
// No npm script on purpose: package.json is owned by concurrent work.

import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createSystemMediaDashboard } from "../src/domain/systemMedia.js";
import {
  createHumanVideoEnricherDashboard,
  humanVideoKey,
  humanVideoAliasKeys,
} from "../src/domain/human-video-enrichment.js";
import { createAvatarLikenessStore } from "../server/avatar-likeness-store.mjs";
import { mediaPathForAsset } from "../server/avatar-likeness-build.mjs";
import {
  AVATAR_LIKENESS_MATCH_GATE,
  AVATAR_LIKENESS_MATCH_WEIGHTS,
  matchMediaToAvatars,
  prepareLikenessState,
  scoreMediaAgainstAvatar,
  colorWordsFromPalette,
  AVATAR_LIKENESS_MATCH_SCHEMA,
  AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
} from "../src/domain/avatar-likeness-match.js";
import {
  createMediaLikenessSignatureStore,
  createAvatarLikenessVerdictStore,
} from "../server/avatar-likeness-media-stores.mjs";
import {
  buildMediaLikenessSignature,
  mediaFileForVideo,
  mediaSignatureIsFresh,
  mediaFingerprint,
} from "../server/avatar-likeness-media-signature.mjs";
import { createMediaVisualSignature } from "../server/media-visual-signature-extract.mjs";
import { AVATAR_LIKENESS_SIGNER_VERSION, classifyAssetWeightClass } from "../src/domain/avatar-likeness-profile.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readableAt(filePath) {
  if (!filePath) return null;
  try {
    const info = await stat(filePath);
    return info?.isFile() && info.size > 0 ? filePath : null;
  } catch {
    return null;
  }
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(Math.trunc(concurrency) || 8, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error: error?.message || String(error) };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function usage() {
  return `Avatar Likeness match batch (L3) — signs the Human Enricher accepted set and matches it against Avatar likeness profiles.

Commands:
  (default)      sign + match + (optionally) persist verdicts
  calibrate      build the self-labeled identity-media set and report the
                 observed separation behind the verdict gate

Flags:
  --apply            persist signature + verdict stores (default: dry-run)
  --limit <n>        process at most n accepted media (smoke testing)
  --concurrency <n>  ffmpeg pool size (default 8)
  --top <n>          candidates to persist per media (default 5)
  --data-root <dir>  (default: <repo>/data)
  --likeness-dir <dir> profile/signature/verdict store dir (default: <data>/avatar-likeness)
  --max-per-avatar <n> calibrate: labeled media per Avatar (default 2)
  --json             machine-readable summary

The batch never writes the enricher ledger; verdicts are proposals for
the human likeness lane (L4). GitHub freeze: local work only.
`;
}

async function loadDashboard({ dataRoot }) {
  const read = (name, fallback) => readJson(path.join(dataRoot, name), fallback);
  const [avatarStore, tarotStore, sceneStore, mediaLibrary, itemStore, songStore, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore] = await Promise.all([
    read("avatar-store.json", { avatars: [] }),
    read("tarot-store.json", {}),
    read("scene-store.json", {}),
    read("media-library.json", { records: [] }),
    read("item-manager-store.json", { cards: [] }),
    read("hapa-songs-store.json", { songs: [] }),
    read("human-video-enrichments.json", { records: [] }),
    read("human-video-agent-reviews.json", { reviews: [] }),
    read("human-video-quick-sort-decisions.json", { decisions: [] }),
    read("human-video-reference-reviews.json", { reviews: [] }),
  ]);
  const mediaDashboard = createSystemMediaDashboard({
    avatars: avatarStore.avatars || [],
    tarotStore,
    sceneGraph: sceneStore,
    mediaLibrary,
    itemStore,
    songStore,
  });
  const dashboard = createHumanVideoEnricherDashboard({
    mediaDashboard,
    enrichmentStore,
    agentReviewStore,
    quickSortStore,
    referenceReviewStore,
    avatars: avatarStore.avatars || [],
    songs: songStore.songs || [],
  });
  return { avatarStore, dashboard };
}

async function backupStoreFiles(likenessDir, stamp, backupsRoot) {
  const backupDir = path.join(backupsRoot, `avatar-likeness-${stamp}`);
  let backedUp = false;
  for (const fileName of ["media-signatures.json", "verdicts.json"]) {
    try {
      await stat(path.join(likenessDir, fileName));
      await mkdir(backupDir, { recursive: true });
      await copyFile(path.join(likenessDir, fileName), path.join(backupDir, fileName));
      backedUp = true;
    } catch {
      // nothing to back up yet
    }
  }
  return backedUp ? backupDir : null;
}

async function runMatch(options) {
  const dataRoot = path.resolve(options["data-root"] || path.join(REPO_ROOT, "data"));
  const likenessDir = path.resolve(options["likeness-dir"] || path.join(dataRoot, "avatar-likeness"));
  const apply = Boolean(options.apply);
  const concurrency = Math.max(1, Math.trunc(Number(options.concurrency) || 8));
  const top = Math.max(1, Math.trunc(Number(options.top) || 5));
  const limit = options.limit ? Math.max(1, Math.trunc(Number(options.limit))) : null;
  const runId = `avatar-likeness-match-${timestamp()}`;
  const startedAt = Date.now();

  const { dashboard } = await loadDashboard({ dataRoot });
  let accepted = dashboard.videos
    .filter((video) => video.quickSortDecision?.state === "accepted")
    .map((video) => ({ ...video, humanVideoKey: video.humanVideoKey || humanVideoKey(video), humanVideoAliases: video.humanVideoAliases || humanVideoAliasKeys(video) }))
    .sort((a, b) => String(a.humanVideoKey).localeCompare(String(b.humanVideoKey)));
  if (limit) accepted = accepted.slice(0, limit);

  const profileStore = createAvatarLikenessStore({ dir: likenessDir });
  const profiles = await profileStore.list();
  const profiled = profiles.filter((profile) => profile.status === "profiled");
  if (!profiled.length) {
    throw new Error(`No profiled Avatars in ${profileStore.filePath} — run "node cli/avatar-builder.mjs avatar-likeness-profile --apply" first.`);
  }
  // Pre-parsed avatar states (scoreMediaAgainstAvatar reuses __state).
  for (const profile of profiled) profile.__state = prepareLikenessState({ signature: profile.media, text: profile.text });

  const signatureStore = createMediaLikenessSignatureStore({ dir: likenessDir });
  const verdictStore = createAvatarLikenessVerdictStore({ dir: likenessDir });
  // Backups BEFORE any mutation (repo convention).
  const backupPath = apply ? await backupStoreFiles(likenessDir, runId, path.join(dataRoot, "backups")) : null;

  // Stage A — signatures (content-hash keyed, signer-versioned freshness).
  const mediaDocuments = new Map(); // key → signature document
  const stageA = { fresh: 0, signed: 0, unreadable: 0, failed: 0 };
  const signatureWork = await mapPool(
    accepted,
    async (video) => {
      const key = video.humanVideoKey;
      const existing = await signatureStore.get(key);
      const file = await readableAt(mediaFileForVideo(video, { dataRoot }));
      if (!file) {
        // The file is gone: a stored signature from a previous run cannot
        // be re-verified, so it is matched but flagged stale in the receipt.
        stageA.unreadable += 1;
        if (existing) mediaDocuments.set(key, { ...existing, __stale: true });
        return { key, outcome: "unreadable" };
      }
      const fingerprint = await mediaFingerprint(file);
      if (existing && mediaSignatureIsFresh(existing, video, fingerprint)) {
        stageA.fresh += 1;
        mediaDocuments.set(key, existing);
        return { key, outcome: "fresh" };
      }
      try {
        const built = await buildMediaLikenessSignature(video, { dataRoot, filePath: file, precomputedFingerprint: fingerprint });
        if (built.error) {
          stageA.failed += 1;
          mediaDocuments.set(key, existing || undefined);
          return { key, outcome: "failed", error: built.error };
        }
        stageA.signed += 1;
        mediaDocuments.set(key, built.signature);
        if (apply) await signatureStore.upsert(key, built.signature);
        return { key, outcome: "signed" };
      } catch (error) {
        stageA.failed += 1;
        mediaDocuments.set(key, existing || undefined);
        return { key, outcome: "failed", error: error?.message || String(error) };
      }
    },
    concurrency,
  );
  for (const result of signatureWork) {
    if (!result.ok) stageA.failed += 1;
  }

  // Stage B — matching (pure domain math, one pass over all media).
  // Each media's state is parsed exactly once (not per candidate pair).
  const verdicts = [];
  for (const [key, doc] of mediaDocuments) {
    if (!doc) continue;
    const result = matchMediaToAvatars({ ...doc, __state: prepareLikenessState(doc) }, profiled, {
      gate: AVATAR_LIKENESS_MATCH_GATE,
      weights: AVATAR_LIKENESS_MATCH_WEIGHTS,
      top,
    });
    verdicts.push({
      schemaVersion: AVATAR_LIKENESS_MATCH_SCHEMA,
      key,
      videoId: doc.videoId,
      videoName: doc.videoName,
      contentFingerprint: doc.contentFingerprint,
      signerVersion: doc.signerVersion,
      ...(doc.__stale ? { staleSignature: true } : {}),
      runId,
      verdict: result.verdict,
      reasons: result.reasons,
      primary: result.primary,
      secondary: result.secondary,
      candidates: result.candidates,
      excludedProfileless: result.excludedProfileless,
      matchedAt: new Date().toISOString(),
    });
  }
  if (apply) {
    for (const verdict of verdicts) await verdictStore.upsert(verdict.key, verdict);
  }

  const byVerdict = verdicts.reduce((map, verdict) => {
    map[verdict.verdict] = (map[verdict.verdict] || 0) + 1;
    return map;
  }, {});
  const byReason = verdicts.filter((verdict) => verdict.verdict === "unresolved").reduce((map, verdict) => {
    for (const reason of verdict.reasons) map[reason] = (map[reason] || 0) + 1;
    return map;
  }, {});

  const report = {
    schemaVersion: "hapa.avatar-likeness-match-report.v1",
    runId,
    mode: apply ? "apply" : "dry-run",
    gate: { ...AVATAR_LIKENESS_MATCH_GATE },
    weights: { ...AVATAR_LIKENESS_MATCH_WEIGHTS },
    acceptedTotal: dashboard.videos.filter((video) => video.quickSortDecision?.state === "accepted").length,
    acceptedProcessed: accepted.length,
    profiles: { total: profiles.length, profiled: profiled.length, profileless: profiles.length - profiled.length },
    signatures: stageA,
    staleSignaturesKept: [...mediaDocuments.values()].filter((doc) => doc?.__stale).length,
    verdicts: { total: verdicts.length, ...byVerdict, unresolvedReasons: byReason },
    topAssigned: verdicts
      .filter((verdict) => verdict.verdict === "assigned")
      .sort((a, b) => (b.primary?.score || 0) - (a.primary?.score || 0))
      .slice(0, 10)
      .map((verdict) => ({ key: verdict.key, videoName: verdict.videoName, avatar: verdict.primary?.name, avatarId: verdict.primary?.avatarId, score: verdict.primary?.score, margin: verdict.primary ? Number((verdict.primary.score - (verdict.candidates[1]?.score || 0)).toFixed(4)) : null })),
    ms: Date.now() - startedAt,
    stores: apply
      ? { signatures: signatureStore.filePath, verdicts: verdictStore.filePath }
      : null,
    backupPath,
  };
  if (process.env.HAPA_LIKENESS_DEBUG_VERDICTS) report.verdictsDebug = verdicts;
  await persistReports(report, { dataRoot });
  return { report, verdicts };
}

/**
 * Reports land in both conventional locations (both gitignored runtime
 * state): data/merge-reports/ for batch reports and artifacts/enrichment/
 * for enrichment-adjacent receipts.
 */
async function persistReports(report, { dataRoot }) {
  const name = `${report.runId || `avatar-likeness-match-${timestamp()}`}.json`;
  const written = [];
  for (const dir of [path.join(dataRoot, "merge-reports"), path.join(REPO_ROOT, "artifacts", "enrichment")]) {
    try {
      await mkdir(dir, { recursive: true });
      const filePath = path.join(dir, name);
      await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      written.push(filePath);
    } catch {
      // report persistence is best-effort; the stdout copy is primary
    }
  }
  if (written.length) report.reportPaths = written;
  return written;
}

// ---------------------------------------------------------------------------
// Calibration — set the gate from observed separation, not vibes.
//
// Ground truth comes from the Avatars' own identity-class attached media
// (media that IS the Avatar, by construction). Where possible the labeled
// asset is one that Phase 2 sampled OUT of the profile, so the media is
// not already folded into the profile it is scored against.
// ---------------------------------------------------------------------------

async function runCalibrate(options) {
  const dataRoot = path.resolve(options["data-root"] || path.join(REPO_ROOT, "data"));
  const mediaDir = path.resolve(process.env.HAPA_MEDIA_DIR || path.join(dataRoot, "media"));
  const likenessDir = path.resolve(options["likeness-dir"] || path.join(dataRoot, "avatar-likeness"));
  const maxPerAvatar = Math.max(1, Math.trunc(Number(options["max-per-avatar"]) || 2));
  const concurrency = Math.max(1, Math.trunc(Number(options.concurrency) || 8));
  const startedAt = Date.now();

  const { avatarStore } = await loadDashboard({ dataRoot });
  const profileStore = createAvatarLikenessStore({ dir: likenessDir });
  const profiles = await profileStore.list();
  const profiled = profiles.filter((profile) => profile.status === "profiled");
  if (!profiled.length) throw new Error(`No profiled Avatars in ${profileStore.filePath} — run the L2 profile build first.`);
  for (const profile of profiled) profile.__state = prepareLikenessState({ signature: profile.media, text: profile.text });

  const avatarById = new Map((avatarStore.avatars || []).map((avatar) => [String(avatar.id), avatar]));

  // Collect labeled assets: prefer sampled-out identity media (fair),
  // then any identity media, up to maxPerAvatar per Avatar.
  const labeled = [];
  for (const profile of profiled) {
    const avatar = avatarById.get(profile.avatarId);
    if (!avatar) continue;
    const sourceAssets = profile.sourceAssets || [];
    const identity = (avatar.assets || []).filter((asset) => classifyAssetWeightClass(asset) === "identity" && asset.id);
    const sampledOutIds = new Set(sourceAssets.filter((entry) => entry.status === "sampled-out").map((entry) => entry.assetId));
    const candidates = [
      ...identity.filter((asset) => sampledOutIds.has(String(asset.id))),
      ...identity.filter((asset) => !sampledOutIds.has(String(asset.id))),
    ].slice(0, maxPerAvatar);
    for (const asset of candidates) {
      const filePath = mediaPathForAsset(asset, mediaDir);
      if (!filePath) continue;
      labeled.push({ trueAvatarId: profile.avatarId, trueAvatarName: profile.name, assetId: String(asset.id), filePath, inProfile: !sampledOutIds.has(String(asset.id)) });
    }
  }

  const observations = [];
  const work = await mapPool(
    labeled,
    async (item) => {
      if (!(await readableAt(item.filePath))) return { ...item, outcome: "unreadable" };
      let built;
      try {
        built = await createMediaVisualSignature({ path: item.filePath });
      } catch (error) {
        return { ...item, outcome: "failed", error: error?.code || "decode_failed" };
      }
      const colorWords = colorWordsFromPalette(built.merged.palette);
      const mediaDoc = {
        schemaVersion: AVATAR_LIKENESS_MEDIA_SIGNATURE_SCHEMA,
        key: `calibrate:${item.trueAvatarId}:${item.assetId}`,
        videoId: item.assetId,
        videoName: path.basename(item.filePath),
        mediaType: built.type,
        source: "calibration",
        signerVersion: AVATAR_LIKENESS_SIGNER_VERSION,
        signature: { palette: built.merged.palette, dHashes: built.merged.dHashes, tone: built.merged.tone },
        text: { terms: [], colorWords },
      };
      mediaDoc.__state = prepareLikenessState(mediaDoc);
      // Score against every profile (this is the raw channel data the
      // grid search needs, independent of the current gate constants).
      const scored = profiled
        .map((profile) => scoreMediaAgainstAvatar(mediaDoc, profile, { weights: AVATAR_LIKENESS_MATCH_WEIGHTS }))
        .filter((candidate) => candidate.avatarId)
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      const runnerUp = scored[1] || null;
      const trueEntry = scored.find((candidate) => candidate.avatarId === item.trueAvatarId) || null;
      const trueIndex = scored.findIndex((candidate) => candidate.avatarId === item.trueAvatarId);
      return {
        ...item,
        outcome: "signed",
        bestId: best?.avatarId,
        bestScore: best?.score,
        margin: best ? Number((best.score - (runnerUp?.score || 0)).toFixed(4)) : null,
        trueRank: trueIndex + 1 || null,
        trueScore: trueEntry?.score ?? null,
        top5: scored.slice(0, 5).map((candidate) => ({ avatarId: candidate.avatarId, name: candidate.name, score: candidate.score })),
      };
    },
    concurrency,
  );
  for (const result of work) {
    if (result.ok) observations.push(result.value);
  }

  const usable = observations.filter((observation) => observation.outcome === "signed");
  const top1Hits = usable.filter((observation) => observation.bestId === observation.trueAvatarId);
  const inProfileUsable = usable.filter((observation) => observation.inProfile);
  const outOfProfileUsable = usable.filter((observation) => !observation.inProfile);

  // Grid search: which (score, margin) gate minimizes false assignments
  // while keeping the top-1 hit rate high? A "would assign" decision is
  // false when the gated best candidate is not the true Avatar.
  const grid = [];
  for (let score = 0.3; score <= 0.9001; score += 0.05) {
    for (let margin = 0; margin <= 0.3001; margin += 0.05) {
      let assigned = 0;
      let falseAssigned = 0;
      for (const observation of usable) {
        const bestScore = observation.bestScore || 0;
        if (bestScore < score) continue;
        if ((observation.margin ?? bestScore) < margin) continue;
        assigned += 1;
        if (observation.bestId !== observation.trueAvatarId) falseAssigned += 1;
      }
      grid.push({
        score: Number(score.toFixed(2)),
        margin: Number(margin.toFixed(2)),
        assigned,
        falseAssigned,
        falseRate: assigned ? Number((falseAssigned / assigned).toFixed(4)) : 0,
        hitRate: usable.length ? Number((assigned ? (assigned - falseAssigned) / usable.length : 0).toFixed(4)) : 0,
      });
    }
  }
  // Deterministic choice: fewest false assignments, ties broken by more
  // true assignments, then lower score floor (less gate risk).
  grid.sort((a, b) => a.falseAssigned - b.falseAssigned || (assignedTrue(b) - assignedTrue(a)) || a.score - b.score);
  const recommended = grid[0];
  function assignedTrue(entry) {
    return entry.assigned - entry.falseAssigned;
  }

  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  // Observed separation behind the gate: for each usable observation, the
  // true Avatar's score vs the best NON-true score. In-profile labels are
  // inflated by construction (the media is inside its own profile), so the
  // margin distribution — not the absolute floor — is the transferable
  // signal; both are recorded here, split by in/out-of-profile.
  const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
  const separationBlock = (obs) => {
    const trueScores = obs.map((o) => o.trueScore).filter((v) => v !== null).sort((a, b) => a - b);
    // Best NON-true score: the runner-up when the best IS the true Avatar
    // (margin = best − runnerUp), else the best itself.
    const bestFalse = obs.map((o) => {
      const runnerUp = o.bestScore !== null && o.margin !== null ? o.bestScore - o.margin : null;
      if (o.bestId === o.trueAvatarId) return runnerUp;
      return o.bestScore ?? runnerUp;
    }).filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
    const margins = obs.map((o) => o.margin).filter((v) => v !== null).sort((a, b) => a - b);
    return {
      n: obs.length,
      trueScore: { min: trueScores[0] ?? null, p25: quantile(trueScores, 0.25), p50: quantile(trueScores, 0.5), p75: quantile(trueScores, 0.75), max: trueScores[trueScores.length - 1] ?? null },
      bestFalseScore: { min: bestFalse[0] ?? null, p25: quantile(bestFalse, 0.25), p50: quantile(bestFalse, 0.5), p75: quantile(bestFalse, 0.75), max: bestFalse[bestFalse.length - 1] ?? null },
      margin: { min: margins[0] ?? null, p25: quantile(margins, 0.25), p50: quantile(margins, 0.5), p75: quantile(margins, 0.75), max: margins[margins.length - 1] ?? null },
    };
  };
  // Where do the non-hits land? Records the same-family confusion the
  // margin gate is supposed to absorb.
  const confusion = usable.filter((o) => o.bestId !== o.trueAvatarId)
    .map((o) => ({ true: o.trueAvatarId, best: o.bestId, bestScore: o.bestScore, margin: o.margin }))
    .sort((a, b) => (b.bestScore || 0) - (a.bestScore || 0))
    .slice(0, 12);
  const report = {
    schemaVersion: "hapa.avatar-likeness-match-calibration.v1",
    labeledTotal: labeled.length,
    usable: usable.length,
    inProfile: inProfileUsable.length,
    outOfProfile: outOfProfileUsable.length,
    top1HitRate: usable.length ? Number((top1Hits.length / usable.length).toFixed(4)) : 0,
    separation: { all: separationBlock(usable), inProfile: separationBlock(inProfileUsable), outOfProfile: separationBlock(outOfProfileUsable) },
    confusionTop: confusion,
    trueScore: {
      mean: Number(mean(usable.map((observation) => observation.trueScore || 0)).toFixed(4)),
      inProfile: Number(mean(inProfileUsable.map((observation) => observation.trueScore || 0)).toFixed(4)),
      outOfProfile: Number(mean(outOfProfileUsable.map((observation) => observation.trueScore || 0)).toFixed(4)),
    },
    currentGate: { ...AVATAR_LIKENESS_MATCH_GATE },
    currentGateStats: gateStats(AVATAR_LIKENESS_MATCH_GATE.assignedScore, AVATAR_LIKENESS_MATCH_GATE.assignedMargin),
    recommendedGate: { assignedScore: recommended.score, assignedMargin: recommended.margin, secondaryScore: recommended.score },
    recommendedGateStats: gateStats(recommended.score, recommended.margin),
    gridTop: grid.slice(0, 8),
    ms: Date.now() - startedAt,
  };
  report.runId = `avatar-likeness-match-calibrate-${timestamp()}`;
  await persistReports(report, { dataRoot });
  function gateStats(score, margin) {
    let assigned = 0;
    let falseAssigned = 0;
    for (const observation of usable) {
      if ((observation.bestScore || 0) < score) continue;
      if (((observation.margin ?? observation.bestScore) ?? 0) < margin) continue;
      assigned += 1;
      if (observation.bestId !== observation.trueAvatarId) falseAssigned += 1;
    }
    return { assigned, falseAssigned, trueAssigned: assigned - falseAssigned };
  }
  return { report, observations: usable };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options._.includes("help")) {
    process.stdout.write(usage());
    return;
  }
  const command = options._[0];
  const result = command === "calibrate" ? await runCalibrate(options) : await runMatch(options);
  const report = result.report;
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const lines = [
      `avatar-likeness-match [${report.mode || "calibrate"}] ${report.runId || ""}`.trim(),
    ];
    if (report.verdicts) {
      lines.push(`  accepted: ${report.acceptedProcessed}/${report.acceptedTotal} | profiles: ${report.profiles.profiled} profiled / ${report.profiles.profileless} profileless`);
      lines.push(`  signatures: ${report.signatures.signed} signed, ${report.signatures.fresh} fresh, ${report.signatures.unreadable} unreadable, ${report.signatures.failed} failed`);
      lines.push(`  verdicts: ${report.verdicts.assigned || 0} assigned, ${report.verdicts.unresolved || 0} unresolved ${JSON.stringify(report.verdicts.unresolvedReasons || {})}`);
      if (report.topAssigned?.length) {
        lines.push("  top assigned:");
        for (const entry of report.topAssigned.slice(0, 5)) {
          lines.push(`    ${entry.score?.toFixed(3)} ${entry.avatar} ← ${entry.videoName}`);
        }
      }
    }
    if (report.recommendedGate) {
      lines.push(`  labeled: ${report.usable}/${report.labeledTotal} usable (in-profile ${report.inProfile}, out-of-profile ${report.outOfProfile}) | top-1 hit rate ${report.top1HitRate}`);
      lines.push(`  true-score mean: in-profile ${report.trueScore.inProfile} | out-of-profile ${report.trueScore.outOfProfile}`);
      lines.push(`  current gate ${JSON.stringify(report.currentGate)} → ${JSON.stringify(report.currentGateStats)}`);
      lines.push(`  RECOMMENDED gate ${JSON.stringify(report.recommendedGate)} → ${JSON.stringify(report.recommendedGateStats)}`);
    }
    lines.push(`  ${Math.round((report.ms || 0) / 1000)}s`);
    process.stdout.write(`${lines.join("\n")}\n`);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`avatar-likeness-match failed: ${error?.stack || error}\n`);
  process.exitCode = 1;
}
