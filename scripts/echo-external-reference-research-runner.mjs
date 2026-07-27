#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA,
  ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
  buildEchoExternalReferenceCycle,
  claimEchoExternalReferenceJobs,
  resolveEchoExternalReferenceJob,
  submitEchoExternalReferenceResult,
} from "../src/domain/echo-external-reference-loop.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "status";
const apply = args.includes("--apply");
const runnerId = "codex-cli-web-research-worker.v1";

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
}

function numberOption(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function slug(value = "") {
  return text(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizedPhrase(value = "") {
  return text(String(value || ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clueOf(job = {}) {
  return list(job.candidateClues)[0] || {};
}

function clusterKey(job = {}) {
  const clue = clueOf(job);
  return text(clue.key || clue.phrase || job.id).toLowerCase();
}

function terminal(job = {}) {
  return [
    "integrated",
    "resolved-existing-reference",
    "resolved-no-reference",
    "resolved-ambiguous",
  ].includes(job.status);
}

function summarize(loop = {}) {
  const statuses = {};
  for (const job of list(loop.jobs)) statuses[job.status] = (statuses[job.status] || 0) + 1;
  const queued = list(loop.jobs).filter((job) => job.status === "queued");
  const clusters = new Set(queued.map(clusterKey));
  return {
    jobs: list(loop.jobs).length,
    statuses,
    queuedClusters: clusters.size,
    completedJobs: list(loop.jobs).filter(terminal).length,
    cycles: list(loop.cycles).length,
  };
}

function contextForJob(run = {}, job = {}) {
  const clue = clueOf(job);
  const song = list(run.packet?.songs).find((candidate) => candidate.id === job.songId);
  const lineNumber = Number(clue.lineNumber || 0);
  const context = list(song?.lyrics)
    .filter((line) => !line.isSectionHeading && Math.abs(Number(line.lineNumber) - lineNumber) <= 1)
    .map((line) => ({ lineNumber: line.lineNumber, text: line.text }));
  return {
    jobId: job.id,
    songId: job.songId,
    songTitle: job.songTitle,
    clue: {
      phrase: clue.phrase,
      lineNumber,
      lyricText: clue.lyricText,
      detector: clue.detector,
      recurrence: clue.recurrence,
    },
    neighboringLyrics: context,
    internalContext: list(job.internalContext).slice(0, 8).map((route) => ({
      relationType: route.relationType,
      relatedSongs: list(route.relatedSongs).map((song) => ({
        songId: song.songId,
        title: song.title,
      })),
      sharedLanguage: {
        literal: list(route.sharedLanguage?.literal).slice(0, 8),
        phonetic: list(route.sharedLanguage?.phonetic).slice(0, 8),
        orthographic: list(route.sharedLanguage?.orthographic).slice(0, 8),
        multilingual: list(route.sharedLanguage?.multilingual).slice(0, 8),
        mechanics: list(route.sharedLanguage?.mechanics).slice(0, 8),
        themes: list(route.sharedLanguage?.themes).slice(0, 8),
        emotions: list(route.sharedLanguage?.emotions).slice(0, 8),
      },
    })),
    researchQuestion: list(job.researchQuestions)[0] || "",
  };
}

function relevantExistingReferences(run = {}, phrase = "") {
  const tokens = new Set(text(phrase).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
  return list(run.cards)
    .filter((card) => card.id?.startsWith("reference:"))
    .map((card) => ({
      id: card.id,
      title: card.title,
      aliases: list(card.aliases),
      overlap: [card.title, ...list(card.aliases)]
        .join(" ")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => tokens.has(token)).length,
    }))
    .filter((card) => card.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.title.localeCompare(right.title))
    .slice(0, 20)
    .map(({ overlap, ...card }) => card);
}

const candidateSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "clusterKey",
    "disposition",
    "reference",
    "sources",
    "jobAnalyses",
    "sharedLanguage",
    "signals",
    "searchQueries",
    "researchNotes",
  ],
  properties: {
    schemaVersion: { type: "string", enum: ["hapa.echo-external-reference-worker-candidate.v1"] },
    clusterKey: { type: "string" },
    disposition: {
      type: "string",
      enum: ["external-reference", "no-supported-reference", "ambiguous"],
    },
    reference: {
      type: "object",
      additionalProperties: false,
      required: ["title", "aliases", "referenceType", "publicContext"],
      properties: {
        title: { type: "string" },
        aliases: { type: "array", items: { type: "string" } },
        referenceType: { type: "string" },
        publicContext: { type: "string" },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "url",
          "sourceClass",
          "publisher",
          "author",
          "publishedAt",
          "retrievedAt",
          "supportsClaim",
          "confidence",
        ],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          url: { type: "string" },
          sourceClass: {
            type: "string",
            enum: [
              "primary-source",
              "official-source",
              "official-franchise-page",
              "authoritative-reference",
              "scholarly-source",
              "government-source",
              "museum-or-archive",
            ],
          },
          publisher: { type: "string" },
          author: { type: "string" },
          publishedAt: { type: "string" },
          retrievedAt: { type: "string" },
          supportsClaim: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    jobAnalyses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "jobId",
          "matchedText",
          "withoutContext",
          "withContext",
          "narrativeConsequence",
          "themeEffect",
          "themeTakeaway",
          "alternativeReading",
          "confidence",
          "caveat",
        ],
        properties: {
          jobId: { type: "string" },
          matchedText: { type: "string" },
          withoutContext: { type: "string" },
          withContext: { type: "string" },
          narrativeConsequence: { type: "string" },
          themeEffect: {
            type: "string",
            enum: ["reinforces", "reframes", "complicates", "contradicts", "extends", "open-question"],
          },
          themeTakeaway: { type: "string" },
          alternativeReading: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          caveat: { type: "string" },
        },
      },
    },
    sharedLanguage: {
      type: "object",
      additionalProperties: false,
      required: ["symbols", "themes", "characters", "narrativeBeats", "mechanics", "emotions", "audioMotifs"],
      properties: Object.fromEntries([
        "symbols",
        "themes",
        "characters",
        "narrativeBeats",
        "mechanics",
        "emotions",
        "audioMotifs",
      ].map((key) => [key, { type: "array", items: { type: "string" } }])),
    },
    signals: {
      type: "object",
      additionalProperties: false,
      required: ["literal", "phonetic", "orthographic", "multilingual", "mechanical"],
      properties: Object.fromEntries([
        "literal",
        "phonetic",
        "orthographic",
        "multilingual",
        "mechanical",
      ].map((key) => [key, { type: "array", items: { type: "string" } }])),
    },
    searchQueries: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
    researchNotes: { type: "string" },
  },
};

function buildPrompt(run, jobs) {
  const phrase = clueOf(jobs[0]).phrase || clusterKey(jobs[0]);
  const packet = {
    clusterKey: clusterKey(jobs[0]),
    candidatePhrase: phrase,
    jobs: jobs.map((job) => contextForJob(run, job)),
    potentiallyRelatedExistingReferences: relevantExistingReferences(run, phrase),
  };
  return `You are the sourced External Canon Research worker for the Hapa Echo Album Reference Atlas.

Use live web search. Research whether the candidate lyric phrase calls an external public work, person, place, event, game, song, history, philosophy, language, or other recoverable canon.

Return one JSON object conforming exactly to the supplied schema.

Rules:
1. Prefer primary, official, scholarly, government, museum, archive, or authoritative sources. Use direct page URLs, not search-result URLs.
2. A capitalized phrase is not automatically a reference. Metadata, section headings, generic words, internal Hapa language, and private names should be "no-supported-reference" unless public canon is genuinely supported.
3. Use "ambiguous" when a public reference is plausible but cannot be responsibly selected.
4. Use "external-reference" only when at least one supplied source establishes the public canon and the exact lyric has a defensible context delta.
5. Source facts establish the external canon, not exclusive songwriter intent. Keep authorial intent non-canon and preserve alternatives.
6. Do not quote lyrics beyond the exact supplied line. Do not return copyrighted passages from source works.
7. Every clustered job needs one jobAnalyses entry with its exact jobId.
8. Explain how canon changes symbols, themes, characters, narrative beats, mechanics, emotions, or audio language. Fill at least three shared-language channels for an external reference.
9. If a matching existing Reference Card is listed, normalize the reference title to that Card's title when it is the same canon.
10. For a no-supported or ambiguous result, leave reference fields empty, sources may be empty, and give concrete search queries and a concise research record in researchNotes.

Research packet:
${JSON.stringify(packet, null, 2)}`;
}

function runCodexResearch(prompt, { timeoutMs = 600_000 } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-echo-reference-research-"));
  const schemaPath = path.join(temporaryRoot, "candidate.schema.json");
  const outputPath = path.join(temporaryRoot, "candidate.json");
  fs.writeFileSync(schemaPath, `${JSON.stringify(candidateSchema, null, 2)}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn("/Applications/Codex.app/Contents/Resources/codex", [
      "exec",
      "--ephemeral",
      "--search",
      "--sandbox",
      "read-only",
      "--ask-for-approval",
      "never",
      "--skip-git-repo-check",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath,
      "--color",
      "never",
      "-C",
      temporaryRoot,
      "-",
    ], {
      cwd: temporaryRoot,
      env: {
        ...process.env,
        HAPA_ECHO_REFERENCE_RESEARCH_WORKER: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-40_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-40_000);
    });
    const terminate = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(terminate);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(terminate);
      if (code !== 0 || !fs.existsSync(outputPath)) {
        reject(new Error(`Codex research worker failed (${code ?? signal}): ${stderr || stdout}`));
        return;
      }
      try {
        resolve(JSON.parse(fs.readFileSync(outputPath, "utf8")));
      } catch (error) {
        reject(new Error(`Codex research worker returned invalid JSON: ${error.message}\n${stderr || stdout}`));
      }
    });
    child.stdin.end(prompt);
  });
}

function validateCandidate(candidate, jobs) {
  const errors = [];
  if (candidate.schemaVersion !== "hapa.echo-external-reference-worker-candidate.v1") errors.push("invalid-schema");
  if (candidate.clusterKey !== clusterKey(jobs[0])) errors.push("cluster-key-mismatch");
  const expected = new Set(jobs.map((job) => job.id));
  const actual = new Set(list(candidate.jobAnalyses).map((analysis) => analysis.jobId));
  for (const jobId of expected) if (!actual.has(jobId)) errors.push(`missing-job-analysis:${jobId}`);
  for (const jobId of actual) if (!expected.has(jobId)) errors.push(`unexpected-job-analysis:${jobId}`);
  if (candidate.disposition === "external-reference") {
    if (!text(candidate.reference?.title)) errors.push("missing-reference-title");
    if (!list(candidate.sources).length) errors.push("missing-sources");
    const channels = Object.values(candidate.sharedLanguage || {}).filter((values) => list(values).length).length;
    if (channels < 3) errors.push("insufficient-shared-language");
  }
  return errors;
}

function researchResult(candidate, job, researchedAt) {
  const analysis = list(candidate.jobAnalyses).find((row) => row.jobId === job.id);
  const clue = clueOf(job);
  return {
    schemaVersion: ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA,
    jobId: job.id,
    reference: candidate.reference,
    sources: candidate.sources,
    lyricEvidence: [{
      songId: job.songId,
      lineNumber: Number(clue.lineNumber),
      lyricText: clue.lyricText,
      matchedText: analysis.matchedText || clue.phrase,
      confidence: analysis.confidence,
    }],
    reading: {
      withoutContext: analysis.withoutContext,
      withContext: analysis.withContext,
      narrativeConsequence: analysis.narrativeConsequence,
    },
    themeDelta: {
      effect: analysis.themeEffect,
      takeaway: analysis.themeTakeaway,
    },
    alternativeReadings: [{ summary: analysis.alternativeReading }],
    sharedLanguage: candidate.sharedLanguage,
    signals: candidate.signals,
    confidence: analysis.confidence,
    caveat: analysis.caveat,
    authority: {
      authorialIntentEstablished: false,
      canonStatus: "non-canon",
    },
    researcher: {
      id: runnerId,
      model: "codex-configured-model-with-web-search",
    },
    researchedAt,
  };
}

function jobResolution(candidate, job, researchedAt) {
  return {
    schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
    jobId: job.id,
    disposition: candidate.disposition,
    rationale: candidate.researchNotes,
    searchQueries: candidate.searchQueries,
    caveat: candidate.disposition === "ambiguous"
      ? "A public reference remains plausible, but current evidence does not justify selecting one canon."
      : "No attributable external canon was established; this does not prove that no private or future-resolvable reference exists.",
    researcher: {
      id: runnerId,
      model: "codex-configured-model-with-web-search",
    },
    resolvedAt: researchedAt,
  };
}

function publicCitation(citation = {}) {
  try {
    const url = new URL(citation.url);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function localSourceMatches(run = {}, job = {}) {
  const query = normalizedPhrase(clueOf(job).phrase);
  if (!query) return [];
  return list(run.cards)
    .filter((card) => card.id?.startsWith("reference:") && list(card.citations).some(publicCitation))
    .flatMap((card) => {
      const candidates = [
        { type: "title", value: card.title },
        ...list(card.aliases).map((value) => ({ type: "alias", value })),
        ...list(card.signalLexicon?.literal).map((value) => ({ type: "literal", value })),
      ];
      const match = candidates.find(({ type, value }) => {
        const signal = normalizedPhrase(value);
        if (!signal) return false;
        if (signal === query) return true;
        const multiword = signal.includes(" ");
        return query.includes(signal) && (["title", "alias"].includes(type) || multiword);
      });
      return match ? [{ card, match }] : [];
    });
}

function occurrenceAtJob(card = {}, job = {}) {
  const lineNumber = Number(clueOf(job).lineNumber || 0);
  return list(card.occurrences).find((occurrence) => (
    occurrence.songId === job.songId
    && Number(occurrence.lyricSpan?.lineStart || 0) <= lineNumber
    && Number(occurrence.lyricSpan?.lineEnd || 0) >= lineNumber
  ));
}

function claimTextForCitation(card = {}, citation = {}) {
  const claimIds = new Set(list(citation.claimIds));
  const claim = list(card.claims).find((candidate) => (
    claimIds.has(candidate.id)
    || list(candidate.citationIds).includes(citation.id)
  ));
  return text(
    claim?.text,
    `${text(citation.label, card.title)} supplies attributable public context for ${card.title}.`,
  );
}

function localReuseResult(card, job, researchedAt) {
  const clue = clueOf(job);
  const interpretation = list(card.interpretations)[0] || {};
  const layers = interpretation.readingLayers || {};
  const literalSignals = list(card.signalLexicon?.literal);
  const symbols = list(card.research?.symbols).length
    ? list(card.research.symbols)
    : literalSignals.slice(0, 8);
  return {
    schemaVersion: ECHO_EXTERNAL_REFERENCE_RESEARCH_RESULT_SCHEMA,
    jobId: job.id,
    reference: {
      title: card.title,
      aliases: list(card.aliases),
      referenceType: text(card.referenceType, "external-reference"),
      publicContext: text(card.publicContext || card.summary),
    },
    sources: list(card.citations).filter(publicCitation).map((citation, index) => ({
      id: text(citation.id, `${slug(card.title)}:local-source-${index + 1}`),
      label: text(citation.label, card.title),
      url: citation.url,
      sourceClass: text(citation.sourceClass, "authoritative-reference"),
      publisher: text(citation.publisher),
      author: text(citation.author),
      publishedAt: text(citation.publishedAt),
      retrievedAt: text(citation.retrievedAt || citation.freshness?.checkedAt, researchedAt.slice(0, 10)),
      supportsClaim: claimTextForCitation(card, citation),
      confidence: 0.9,
    })),
    lyricEvidence: [{
      songId: job.songId,
      lineNumber: Number(clue.lineNumber),
      lyricText: clue.lyricText,
      matchedText: clue.phrase,
      confidence: 0.9,
    }],
    reading: {
      withoutContext: `Without loading ${card.title}, “${clue.phrase}” can be read as literal or album-internal language.`,
      withContext: text(layers.contextual || interpretation.summary || card.publicContext || card.summary),
      narrativeConsequence: text(
        layers.narrative,
        `The existing ${card.title} Card becomes a comparison lens for this exact lyric moment.`,
      ),
    },
    themeDelta: {
      effect: "extends",
      takeaway: text(
        layers.thematic,
        list(card.themes).join(", "),
      ),
    },
    alternativeReadings: [{
      summary: "The matched phrase may also carry private, album-internal, literal, or other public meanings; source reuse does not prove exclusive authorial intent.",
    }],
    sharedLanguage: {
      symbols,
      themes: list(card.themes),
      characters: list(card.research?.characters || card.mediaEntities),
      narrativeBeats: [text(layers.narrative)].filter(Boolean),
      mechanics: list(card.mechanics),
      emotions: list(card.emotions),
      audioMotifs: list(card.research?.audioMotifs),
    },
    signals: {
      literal: list(card.signalLexicon?.literal),
      phonetic: list(card.signalLexicon?.phonetic),
      orthographic: list(card.signalLexicon?.orthographic),
      multilingual: list(card.signalLexicon?.multilingual),
      mechanical: list(card.signalLexicon?.mechanical),
    },
    confidence: 0.9,
    caveat: "This result reuses an already attributable Reference Card and exact lyric match; it does not establish exclusive songwriter intent.",
    authority: {
      authorialIntentEstablished: false,
      canonStatus: "non-canon",
    },
    researcher: {
      id: "local-reference-card-reconciler.v1",
      model: "deterministic-source-reuse",
    },
    researchedAt,
  };
}

function releaseFailedClaims(loop, jobs, error) {
  const selected = new Set(jobs.map((job) => job.id));
  return {
    ...loop,
    jobs: list(loop.jobs).map((job) => selected.has(job.id) && job.status === "claimed" ? {
      ...job,
      status: "queued",
      claim: null,
      history: [...list(job.history), {
        event: "worker-failed-requeued",
        at: new Date().toISOString(),
        error: text(error?.message || error).slice(0, 1_000),
      }],
    } : job),
  };
}

function integrateValidated(loop, sourceRun, projectedRun, runtimeRoot, limit = Number.MAX_SAFE_INTEGER) {
  const prior = list(loop.cycles).at(-1) || null;
  const acceptedJobs = list(loop.jobs)
    .filter((job) => job.status === "validated" && !list(job.history).some((event) => event.event === "integrated"))
    .slice(0, limit);
  if (!acceptedJobs.length) return { loop, projectedRun, cycle: null };
  const acceptedResults = acceptedJobs.map((job) => job.result);
  const cycle = buildEchoExternalReferenceCycle({
    sourceRun: prior?.projectedRun || projectedRun || sourceRun,
    previousCycle: prior,
    acceptedResults,
  });
  const accepted = new Map(acceptedJobs.map((job, index) => [job.id, cycle.acceptedResultHashes[index]]));
  const nextLoop = {
    ...loop,
    jobs: list(loop.jobs).map((job) => accepted.has(job.id) ? {
      ...job,
      status: "integrated",
      resultHash: accepted.get(job.id),
      history: [...list(job.history), {
        event: "integrated",
        at: new Date().toISOString(),
        cycleId: cycle.cycleId,
      }],
    } : job),
    cycles: [...list(loop.cycles), cycle],
  };
  const sequence = String(nextLoop.cycles.length).padStart(3, "0");
  atomicWriteJson(path.join(runtimeRoot, "cycles", `${sequence}.json`), cycle);
  atomicWriteJson(path.join(runtimeRoot, "cycles", `${sequence}-gpt-image-manifest.json`), cycle.artManifest);
  atomicWriteJson(path.join(runtimeRoot, "latest-cycle.json"), cycle);
  atomicWriteJson(path.join(runtimeRoot, "projected-run.json"), cycle.projectedRun);
  atomicWriteJson(path.join(runtimeRoot, "gpt-image-manifest.json"), cycle.artManifest);
  return { loop: nextLoop, projectedRun: cycle.projectedRun, cycle };
}

const runtimeRoot = path.resolve(option(
  "--runtime-root",
  path.join(ROOT, "data", "echo-reference-research-loop"),
));
const loopPath = path.resolve(option("--loop", path.join(runtimeRoot, "loop.json")));
const sourceRunPath = path.resolve(option("--source-run", path.join(runtimeRoot, "source-run.json")));
const projectedRunPath = path.resolve(option("--projected-run", path.join(runtimeRoot, "projected-run.json")));

if (!fs.existsSync(loopPath) || !fs.existsSync(sourceRunPath)) {
  throw new Error("Research loop and source run must be seeded before using the worker.");
}

let loop = readJson(loopPath);
const sourceRun = readJson(sourceRunPath);
let projectedRun = fs.existsSync(projectedRunPath) ? readJson(projectedRunPath) : sourceRun;

if (command === "status") {
  console.log(JSON.stringify({ ok: true, command, runnerId, ...summarize(loop) }, null, 2));
} else if (command === "plan") {
  const queued = list(loop.jobs).filter((job) => job.status === "queued");
  const groups = [...Map.groupBy(queued, clusterKey)]
    .sort((left, right) => (
      Math.max(...right[1].map((job) => Number(job.priority || 0)))
      - Math.max(...left[1].map((job) => Number(job.priority || 0)))
      || left[0].localeCompare(right[0])
    ));
  const limit = Math.max(1, numberOption("--limit", 10));
  console.log(JSON.stringify({
    ok: true,
    command,
    ...summarize(loop),
    clusters: groups.slice(0, limit).map(([key, jobs]) => ({
      clusterKey: key,
      phrase: clueOf(jobs[0]).phrase,
      jobs: jobs.length,
      songs: jobs.map((job) => job.songTitle),
      priority: Math.max(...jobs.map((job) => Number(job.priority || 0))),
    })),
  }, null, 2));
} else if (command === "reconcile-local") {
  if (!apply) throw new Error("Local reconciliation requires --apply.");
  const limit = Math.max(1, numberOption("--limit", Number.MAX_SAFE_INTEGER));
  const candidates = list(loop.jobs)
    .filter((job) => job.status === "queued")
    .flatMap((job) => {
      const matches = localSourceMatches(projectedRun, job);
      return matches.length === 1 ? [{ job, ...matches[0] }] : [];
    })
    .slice(0, limit);
  if (!candidates.length) {
    console.log(JSON.stringify({
      ok: true,
      command,
      message: "No unambiguous local source matches remain.",
      ...summarize(loop),
    }, null, 2));
    process.exit(0);
  }
  const backupPath = path.join(
    ROOT,
    "data",
    "backups",
    `echo-reference-local-reconcile-${new Date().toISOString().replace(/[:.]/g, "-")}-loop.json`,
  );
  atomicWriteJson(backupPath, loop);
  const receipts = [];
  for (const candidate of candidates) {
    const claim = claimEchoExternalReferenceJobs(loop, {
      runner: "local-reference-card-reconciler.v1",
      limit: 1,
      jobIds: [candidate.job.id],
    });
    loop = claim.loop;
    const job = claim.claimed[0];
    const existing = occurrenceAtJob(candidate.card, job);
    if (existing) {
      const resolution = resolveEchoExternalReferenceJob(loop, {
        resolution: {
          schemaVersion: ECHO_EXTERNAL_REFERENCE_RESOLUTION_SCHEMA,
          jobId: job.id,
          disposition: "existing-reference",
          targetCardId: candidate.card.id,
          occurrenceId: existing.id,
          rationale: `The exact lyric target is already connected to the attributable ${candidate.card.title} Reference Card.`,
          searchQueries: [],
          caveat: "This closes duplicate queue work; it does not promote the interpretation or Card to canon.",
          researcher: {
            id: "local-reference-card-reconciler.v1",
            model: "deterministic-source-reuse",
          },
        },
      });
      if (!resolution.valid) throw new Error(`Local resolution failed: ${resolution.errors.join(", ")}`);
      loop = resolution.loop;
      receipts.push({
        jobId: job.id,
        action: "resolved-existing-occurrence",
        cardId: candidate.card.id,
        occurrenceId: existing.id,
      });
      continue;
    }
    const submission = submitEchoExternalReferenceResult(loop, projectedRun, {
      result: localReuseResult(candidate.card, job, new Date().toISOString()),
    });
    if (!submission.validation.valid) {
      loop = releaseFailedClaims(loop, [job], new Error(submission.validation.errors.join(", ")));
      receipts.push({
        jobId: job.id,
        action: "held-local-reuse",
        cardId: candidate.card.id,
        validation: submission.validation,
      });
      continue;
    }
    loop = submission.loop;
    receipts.push({
      jobId: job.id,
      action: "validated-local-reuse",
      cardId: candidate.card.id,
      qualityScore: submission.validation.qualityScore,
      warnings: submission.validation.warnings,
    });
  }
  const integrated = integrateValidated(loop, sourceRun, projectedRun, runtimeRoot);
  loop = integrated.loop;
  projectedRun = integrated.projectedRun;
  atomicWriteJson(loopPath, loop);
  console.log(JSON.stringify({
    ok: receipts.every((receipt) => receipt.action !== "held-local-reuse"),
    command,
    backupPath,
    receipts,
    cycle: integrated.cycle ? {
      cycleId: integrated.cycle.cycleId,
      metrics: integrated.cycle.metrics,
      delta: integrated.cycle.delta,
      quality: integrated.cycle.quality,
    } : null,
    ...summarize(loop),
  }, null, 2));
} else if (command === "run") {
  if (!apply) throw new Error("Research run requires --apply.");
  const limit = Math.max(1, numberOption("--limit", 1));
  const timeoutMs = Math.max(60_000, numberOption("--timeout-ms", 600_000));
  const onlyCluster = text(option("--cluster")).toLowerCase();
  const queued = list(loop.jobs).filter((job) => job.status === "queued");
  const groups = [...Map.groupBy(queued, clusterKey)]
    .filter(([key]) => !onlyCluster || key === onlyCluster)
    .sort((left, right) => (
      Math.max(...right[1].map((job) => Number(job.priority || 0)))
      - Math.max(...left[1].map((job) => Number(job.priority || 0)))
      || left[0].localeCompare(right[0])
    ))
    .slice(0, limit);
  if (!groups.length) throw new Error("No queued research clusters match the request.");
  const backupPath = path.join(
    ROOT,
    "data",
    "backups",
    `echo-reference-research-runner-${new Date().toISOString().replace(/[:.]/g, "-")}-loop.json`,
  );
  atomicWriteJson(backupPath, loop);
  const receipts = [];
  for (const [key, jobs] of groups) {
    const claim = claimEchoExternalReferenceJobs(loop, {
      runner: runnerId,
      limit: jobs.length,
      jobIds: jobs.map((job) => job.id),
      leaseSeconds: Math.ceil(timeoutMs / 1_000) + 300,
    });
    loop = claim.loop;
    atomicWriteJson(loopPath, loop);
    try {
      const candidate = await runCodexResearch(buildPrompt(projectedRun, claim.claimed), { timeoutMs });
      const candidateErrors = validateCandidate(candidate, claim.claimed);
      if (candidateErrors.length) throw new Error(`Worker candidate failed validation: ${candidateErrors.join(", ")}`);
      const researchedAt = new Date().toISOString();
      const validations = [];
      if (candidate.disposition === "external-reference") {
        for (const job of claim.claimed) {
          const submission = submitEchoExternalReferenceResult(loop, projectedRun, {
            result: researchResult(candidate, job, researchedAt),
          });
          loop = submission.loop;
          validations.push({
            jobId: job.id,
            valid: submission.validation.valid,
            errors: submission.validation.errors,
            warnings: submission.validation.warnings,
            qualityScore: submission.validation.qualityScore,
          });
        }
      } else {
        for (const job of claim.claimed) {
          const resolution = resolveEchoExternalReferenceJob(loop, {
            resolution: jobResolution(candidate, job, researchedAt),
          });
          if (!resolution.valid) throw new Error(`Resolution failed: ${resolution.errors.join(", ")}`);
          loop = resolution.loop;
          validations.push({ jobId: job.id, valid: true, disposition: candidate.disposition });
        }
      }
      atomicWriteJson(loopPath, loop);
      const candidatePath = path.join(runtimeRoot, "worker-candidates", `${slug(key)}-${Date.now()}.json`);
      atomicWriteJson(candidatePath, candidate);
      receipts.push({
        clusterKey: key,
        disposition: candidate.disposition,
        referenceTitle: candidate.reference?.title || "",
        jobs: claim.claimed.length,
        validations,
        candidatePath,
      });
    } catch (error) {
      loop = releaseFailedClaims(loop, claim.claimed, error);
      atomicWriteJson(loopPath, loop);
      receipts.push({
        clusterKey: key,
        error: text(error.message || error),
        jobs: claim.claimed.length,
      });
      break;
    }
  }
  const integrated = integrateValidated(loop, sourceRun, projectedRun, runtimeRoot);
  loop = integrated.loop;
  projectedRun = integrated.projectedRun;
  atomicWriteJson(loopPath, loop);
  console.log(JSON.stringify({
    ok: receipts.every((receipt) => !receipt.error),
    command,
    backupPath,
    receipts,
    cycle: integrated.cycle ? {
      cycleId: integrated.cycle.cycleId,
      metrics: integrated.cycle.metrics,
      delta: integrated.cycle.delta,
      quality: integrated.cycle.quality,
    } : null,
    ...summarize(loop),
  }, null, 2));
} else {
  throw new Error(`Unknown command ${command}. Expected status, plan, reconcile-local, or run.`);
}
