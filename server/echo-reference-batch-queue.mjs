import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildEchoReferenceMiningPacket,
  echoReferenceDigest,
  projectEchoReferenceRunReceipt,
} from "../src/domain/echo-reference-mining.js";
import { createEchoReferenceMiningStore } from "./echo-reference-mining-store.mjs";

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function queueCounts(jobs = []) {
  const states = ["pending", "researching", "synthesizing", "review-ready", "failed", "paused", "complete"];
  return Object.fromEntries(states.map((state) => [
    state,
    jobs.filter((job) => job.status === state).length,
  ]));
}

function validateSongForQueue(song = {}) {
  const errors = [];
  if (!song.id) errors.push("song-id");
  if (!song.title) errors.push("song-title");
  if (!Array.isArray(song.lyrics) || !song.lyrics.length) errors.push("lyrics");
  return errors;
}

export function createEchoReferenceBatchQueue(options = {}) {
  const root = path.resolve(options.root || "data/echo-reference-mining/queue");
  const songStorePath = path.resolve(options.songStorePath || "data/hapa-songs-store.json");
  const miningStore = options.miningStore || createEchoReferenceMiningStore({
    root: path.dirname(root),
    songStorePath,
  });

  async function sourcePacket() {
    const store = JSON.parse(await readFile(songStorePath, "utf8"));
    return { store, packet: buildEchoReferenceMiningPacket(store) };
  }

  async function preview(previewOptions = {}) {
    const { packet } = await sourcePacket();
    const maxPairs = Math.max(1, Number(previewOptions.maxPairs || packet.album.pairCount));
    return {
      schemaVersion: "hapa.echo-reference-batch-preview.v1",
      packetHash: packet.packetHash,
      scope: "complete-album",
      songCount: packet.album.songCount,
      pairCount: packet.album.pairCount,
      boundedPairCount: Math.min(packet.album.pairCount, maxPairs),
      estimatedLocalWorkUnits: packet.album.songCount + Math.min(packet.album.pairCount, maxPairs),
      estimatedPaidExternalRequests: 0,
      estimatedPaidExternalUsd: 0,
      publicActivation: false,
      canonPromotion: false,
    };
  }

  async function create(createOptions = {}) {
    const { packet } = await sourcePacket();
    const configuration = {
      maxPairs: Math.max(1, Number(createOptions.maxPairs || packet.album.pairCount)),
      maxCandidatesPerSong: Math.max(1, Number(createOptions.maxCandidatesPerSong || 8)),
      maxConcurrency: Math.max(1, Math.min(8, Number(createOptions.maxConcurrency || 2))),
      allowExternalResearch: false,
    };
    const queueId = `echo-reference-batch:${echoReferenceDigest({
      packetHash: packet.packetHash,
      configuration,
    }).replace(":", "-")}`;
    const filePath = path.join(root, `${queueId.replace(/[^a-z0-9._-]+/gi, "-")}.json`);
    const existing = await readJson(filePath);
    if (existing) return { ...existing, idempotentReplay: true };
    const createdAt = String(createOptions.createdAt || new Date().toISOString());
    const queue = {
      schemaVersion: "hapa.echo-reference-batch-queue.v1",
      queueId,
      packetHash: packet.packetHash,
      createdAt,
      updatedAt: createdAt,
      status: "pending",
      configuration,
      jobs: packet.songs.map((song) => ({
        id: `echo-reference-song-job:${song.id}`,
        songId: song.id,
        title: song.title,
        sourceDigest: echoReferenceDigest(song),
        status: "pending",
        attempts: 0,
        failure: null,
        receipt: null,
      })),
      counts: queueCounts(packet.songs.map(() => ({ status: "pending" }))),
      finalReceipt: null,
      interruptionReceipts: [],
      filePath,
    };
    await writeJsonAtomic(filePath, queue);
    return { ...queue, idempotentReplay: false };
  }

  async function load(queueId = "") {
    const filePath = path.join(root, `${String(queueId).replace(/[^a-z0-9._-]+/gi, "-")}.json`);
    const queue = await readJson(filePath);
    if (!queue) {
      const error = new Error(`Unknown Echo reference batch: ${queueId}`);
      error.statusCode = 404;
      throw error;
    }
    return queue;
  }

  async function process(queueId = "", processOptions = {}) {
    const queue = await load(queueId);
    if (queue.status === "complete") return { ...queue, idempotentReplay: true };
    const { packet } = await sourcePacket();
    if (packet.packetHash !== queue.packetHash) {
      const error = new Error("Echo reference batch source packet changed; create a new queue.");
      error.statusCode = 409;
      throw error;
    }
    const songById = new Map(packet.songs.map((song) => [song.id, song]));
    const maxConcurrency = Math.max(1, Math.min(
      queue.configuration.maxConcurrency,
      Number(processOptions.maxConcurrency || queue.configuration.maxConcurrency)
    ));
    const remainingBudget = Math.max(0, Number(
      processOptions.maxSongs ?? Number.MAX_SAFE_INTEGER
    ));
    const candidates = queue.jobs.filter((job) => job.status === "pending").slice(0, remainingBudget);
    let cursor = 0;
    async function worker() {
      while (cursor < candidates.length) {
        const job = candidates[cursor];
        cursor += 1;
        job.status = "researching";
        job.attempts += 1;
        try {
          if ((processOptions.failSongIds || []).includes(job.songId)) {
            throw new Error("injected-song-isolation-test-failure");
          }
          const song = songById.get(job.songId);
          const errors = validateSongForQueue(song);
          if (errors.length) throw new Error(errors.join(","));
          job.status = "synthesizing";
          job.receipt = {
            schemaVersion: "hapa.echo-reference-song-preflight-receipt.v1",
            songId: job.songId,
            sourceDigest: job.sourceDigest,
            packetHash: queue.packetHash,
            errors: [],
            paidExternalRequests: 0,
          };
          job.status = "review-ready";
          job.failure = null;
        } catch (error) {
          job.status = "failed";
          job.failure = {
            message: error instanceof Error ? error.message : String(error),
            isolated: true,
          };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, candidates.length || 1) }, () => worker()));
    const hasPending = queue.jobs.some((job) => job.status === "pending");
    const hasFailed = queue.jobs.some((job) => job.status === "failed");
    if (hasPending) {
      queue.status = "paused";
      queue.interruptionReceipts.push({
        at: String(processOptions.updatedAt || new Date().toISOString()),
        reason: "budget-stop",
        completedJobIds: candidates.filter((job) => job.status === "review-ready").map((job) => job.id),
      });
    } else if (hasFailed) {
      queue.status = "review-ready";
    } else {
      const run = await miningStore.run({
        apply: processOptions.apply === true,
        maxPairs: queue.configuration.maxPairs,
        maxCandidatesPerSong: queue.configuration.maxCandidatesPerSong,
        allowExternalResearch: false,
        generatedAt: processOptions.generatedAt,
      });
      if (processOptions.apply === true) {
        await miningStore.migrateRunCards(run, {
          actor: "local-deterministic-miner",
          createdAt: run.generatedAt,
        });
      }
      queue.finalReceipt = projectEchoReferenceRunReceipt(run, processOptions.apply ? miningStore : {});
      queue.jobs.forEach((job) => {
        if (job.status === "review-ready") job.status = "complete";
      });
      queue.status = "complete";
    }
    queue.updatedAt = String(processOptions.updatedAt || new Date().toISOString());
    queue.counts = queueCounts(queue.jobs);
    await writeJsonAtomic(queue.filePath, queue);
    return { ...queue, idempotentReplay: false };
  }

  async function retry(queueId = "", retryOptions = {}) {
    const queue = await load(queueId);
    const selected = new Set(retryOptions.songIds || []);
    for (const job of queue.jobs) {
      if (job.status !== "failed" || (selected.size && !selected.has(job.songId))) continue;
      job.status = "pending";
      job.failure = null;
    }
    queue.status = "pending";
    queue.updatedAt = String(retryOptions.updatedAt || new Date().toISOString());
    queue.counts = queueCounts(queue.jobs);
    await writeJsonAtomic(queue.filePath, queue);
    return queue;
  }

  return {
    root,
    preview,
    create,
    load,
    process,
    retry,
  };
}
