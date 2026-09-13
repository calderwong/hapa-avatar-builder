import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  compileIncrementalEchoReferenceGraph,
  createEchoReferenceClueEvent,
  createEchoReferenceClueLifecycleEvent,
  createEchoReferenceChallengeAppeal,
  createEchoReferenceChallengeResolution,
  createEchoReferenceContributionEvent,
  createEchoReferenceModerationAction,
  createEchoReferenceDecisionEvent,
  createEchoReferenceReviewDecision,
  createNextEchoReferenceCardRevision,
  echoReferenceDigest,
  filterEchoReferenceView,
  foldEchoReferenceContributionEvents,
  projectEchoReferenceRun,
  routeEchoReferenceProposal,
  runEchoReferenceMining,
  buildEchoReferenceModerationQueue,
  buildEchoReferenceContributionActivity,
  buildEchoReferenceNotifications,
  createEchoReferenceFollowSubscription,
} from "../src/domain/echo-reference-mining.js";
import {
  normalizeHapaReferenceCard,
  projectPublicHapaReferenceCard,
  validateHapaReferenceCard,
} from "../src/domain/hapa-reference-card.js";
import {
  applyEchoReferencePreviewFirstAuthority,
  attachEchoReferenceMedia,
  buildEchoReferenceTarotCards,
  mergeEchoReferenceRuntimeCoverage,
  selectEchoReferenceRuntimeRun,
} from "../src/domain/echo-reference-runtime.js";
import { buildEchoReferenceMiningPacket } from "../src/domain/echo-reference-mining.js";
import { buildEchoReferenceGptImageLibrary } from "../src/domain/echo-reference-gpt-image-library.js";

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readNdjson(filePath) {
  try {
    return String(await readFile(filePath, "utf8"))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function safeRunFileName(runId) {
  return String(runId || "run").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 180);
}

export function createEchoReferenceMiningStore(options = {}) {
  const root = path.resolve(options.root || "data/echo-reference-mining");
  const songStorePath = path.resolve(options.songStorePath || "data/hapa-songs-store.json");
  const latestPath = path.join(root, "latest.json");
  const researchProjectionPath = path.resolve(options.researchProjectionPath || "data/echo-reference-research-loop/projected-run.json");
  const animatedMediaPath = path.resolve(options.animatedMediaPath || "data/echo-reference-animated-media.json");
  const previewFirstAuthorityPath = path.resolve(
    options.previewFirstAuthorityPath || "data/echo-reference-governance/preview-first-authority.json"
  );
  const eventsPath = path.join(root, "events.ndjson");
  const revisionsPath = path.join(root, "card-revisions.ndjson");
  const auditPath = path.join(root, "audit.json");
  let revisionCache = null;
  let liveCatalogRunCache = null;
  let currentRunCache = null;
  const jsonCache = new Map();

  async function readJsonCached(filePath, fallback = null) {
    try {
      const info = await stat(filePath);
      const cached = jsonCache.get(filePath);
      if (cached?.mtimeMs === info.mtimeMs && cached?.size === info.size) return cached.value;
      const value = await readJson(filePath, fallback);
      jsonCache.set(filePath, { mtimeMs: info.mtimeMs, size: info.size, value });
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return fallback;
      throw error;
    }
  }

  async function readSongStore() {
    const store = await readJson(songStorePath);
    if (!store) throw new Error(`Echo song store not found: ${songStorePath}`);
    return store;
  }

  async function contributions() {
    return readNdjson(eventsPath);
  }

  async function cardRevisionEvents() {
    if (!revisionCache) revisionCache = await readNdjson(revisionsPath);
    return [...revisionCache];
  }

  async function appendCardRevision(input = {}) {
    const validation = validateHapaReferenceCard(input.card);
    if (!validation.ok) {
      const error = new Error(`Invalid Echo Reference Card revision: ${validation.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = validation.errors;
      throw error;
    }
    const card = validation.card;
    const actor = String(input.actor || "").trim();
    if (!actor) {
      const error = new Error("Echo Reference Card revision requires an actor");
      error.statusCode = 400;
      throw error;
    }
    const existing = await cardRevisionEvents();
    const duplicate = existing.find((event) => (
      event.cardId === card.id && event.revisionId === card.revisionId
    ));
    const contentDigest = echoReferenceDigest(card);
    if (duplicate) {
      if (duplicate.contentDigest !== contentDigest) {
        const error = new Error(`Revision identity collision: ${card.revisionId}`);
        error.statusCode = 409;
        throw error;
      }
      return { event: duplicate, idempotentReplay: true };
    }
    if (card.parentRevisionId && !existing.some((event) => event.revisionId === card.parentRevisionId)) {
      const error = new Error(`Unknown parent revision: ${card.parentRevisionId}`);
      error.statusCode = 409;
      throw error;
    }
    const createdAt = String(input.createdAt || card.provenance.createdAt || new Date().toISOString());
    const event = {
      schemaVersion: "hapa.echo-reference-card-revision-event.v1",
      id: `echo-reference-card-revision:${contentDigest.replace(":", "-")}`,
      eventType: "card_revision_stored",
      cardId: card.id,
      revisionId: card.revisionId,
      parentRevisionId: card.parentRevisionId,
      contentDigest,
      actor,
      createdAt,
      sourceRunReceipt: {
        runId: String(input.sourceRunId || card.provenance.sourceRunId || ""),
        packetHash: String(input.packetHash || card.provenance.sourcePacketHash || ""),
        configurationVersion: String(card.provenance.configurationVersion || ""),
      },
      authority: card.authority,
      custody: {
        ...card.custody,
        custodyStatus: String(card.custody.custodyStatus || "locally-derived"),
        impliesMint: false,
        impliesPublication: false,
        impliesCommerce: false,
        impliesCanon: false,
      },
      card,
    };
    await mkdir(root, { recursive: true });
    await appendFile(revisionsPath, `${JSON.stringify(event)}\n`);
    revisionCache = [...existing, event];
    return { event, idempotentReplay: false };
  }

  async function migrateRunCards(runInput = {}, migrationOptions = {}) {
    const receipts = [];
    for (const card of runInput.cards || []) {
      receipts.push(await appendCardRevision({
        card,
        actor: migrationOptions.actor || "local-deterministic-miner",
        createdAt: migrationOptions.createdAt || runInput.generatedAt,
        sourceRunId: runInput.runId,
        packetHash: runInput.packetHash,
      }));
    }
    return {
      total: receipts.length,
      created: receipts.filter((receipt) => !receipt.idempotentReplay).length,
      replayed: receipts.filter((receipt) => receipt.idempotentReplay).length,
      revisionIds: receipts.map((receipt) => receipt.event.revisionId),
    };
  }

  async function cardHistory(cardId = "") {
    return (await cardRevisionEvents())
      .filter((event) => event.cardId === cardId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || left.revisionId.localeCompare(right.revisionId));
  }

  async function reviseCard(input = {}) {
    const history = await cardHistory(input.cardId);
    const current = history.at(-1)?.card;
    if (!current) {
      const error = new Error(`Unknown Echo Reference Card: ${input.cardId}`);
      error.statusCode = 404;
      throw error;
    }
    const revision = createNextEchoReferenceCardRevision(current, input.patch || {}, {
      action: input.action || "revise",
      reason: input.reason,
      actor: input.actor,
      authority: input.authority || "local-reviewer",
    });
    if (!revision.ok) {
      const error = new Error(`Invalid Echo Reference Card revision: ${revision.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = revision.errors;
      throw error;
    }
    const receipt = await appendCardRevision({
      card: revision.card,
      actor: input.actor,
      createdAt: revision.decision.createdAt,
      sourceRunId: revision.card.provenance.sourceRunId,
      packetHash: revision.card.provenance.sourcePacketHash,
    });
    await appendDecision({
      ...revision.decision.decision,
      id: revision.decision.id,
    });
    return { ...receipt, decision: revision.decision };
  }

  async function rollbackCard(input = {}) {
    const history = await cardHistory(input.cardId);
    const current = history.at(-1)?.card;
    const target = history.find((event) => event.revisionId === input.toRevisionId)?.card;
    if (!current || !target) {
      const error = new Error(`Unknown rollback target: ${input.toRevisionId}`);
      error.statusCode = 404;
      throw error;
    }
    const restored = normalizeHapaReferenceCard({
      ...target,
      id: current.id,
      revisionId: current.revisionId,
      parentRevisionId: current.parentRevisionId,
    });
    return reviseCard({
      cardId: current.id,
      actor: input.actor,
      reason: input.reason || `Rollback to ${input.toRevisionId}`,
      authority: input.authority || "local-reviewer",
      action: "revise",
      patch: restored,
    });
  }

  async function projectCardRevisions(projectionOptions = {}) {
    const events = await cardRevisionEvents();
    const latestByCard = new Map();
    for (const event of events) latestByCard.set(event.cardId, event);
    const latestCards = [...latestByCard.values()].map((event) => event.card);
    if (projectionOptions.visibility === "public") {
      return latestCards.map(projectPublicHapaReferenceCard).filter(Boolean);
    }
    if (projectionOptions.approvedOnly === true) {
      return latestCards
        .filter((card) => (
          card.authority.reviewStatus === "approved"
          && !card.rightsAndPrivacy.containsPrivateClues
        ))
        .map((card) => ({
          ...card,
          citations: card.citations.filter((citation) => citation.visibility !== "private"),
          unresolved: [],
        }));
    }
    return latestCards;
  }

  async function currentRun(runOptions = {}) {
    const [latest, researchProjection, mediaCatalog, previewFirstAuthority, contributionEvents, songStore] = await Promise.all([
      readJsonCached(latestPath),
      readJsonCached(researchProjectionPath),
      readJsonCached(animatedMediaPath, { records: [] }),
      readJsonCached(previewFirstAuthorityPath, null),
      contributions(),
      readJsonCached(songStorePath),
    ]);
    if (!songStore) throw new Error(`Echo song store not found: ${songStorePath}`);
    const currentPacket = buildEchoReferenceMiningPacket(songStore, runOptions);
    let catalogRun = latest;
    if (!catalogRun || String(catalogRun.packetHash || "") !== String(currentPacket.packetHash || "")) {
      if (liveCatalogRunCache?.packetHash === currentPacket.packetHash) {
        catalogRun = liveCatalogRunCache;
      } else {
        catalogRun = runEchoReferenceMining(songStore, {
          ...runOptions,
          contributionEvents,
          apply: false,
        });
        liveCatalogRunCache = catalogRun;
      }
    }
    const selected = selectEchoReferenceRuntimeRun({
      localRun: catalogRun,
      researchRun: researchProjection,
    });
    if (selected.run) {
      const currentRunCacheKey = JSON.stringify([
        catalogRun?.runHash || "",
        researchProjection?.runHash || "",
        mediaCatalog?.updatedAt || "",
        mediaCatalog?.sourceManifestHash || "",
        previewFirstAuthority?.id || "",
        previewFirstAuthority?.approvedAt || "",
        contributionEvents.length,
        contributionEvents.at(-1)?.id || "",
        runOptions,
      ]);
      if (currentRunCache?.key === currentRunCacheKey) return currentRunCache.run;
      const contributionProjection = foldEchoReferenceContributionEvents(contributionEvents);
      const governed = applyEchoReferencePreviewFirstAuthority({
        ...selected.run,
        contributions: selected.run.contributions?.length
          ? selected.run.contributions
          : contributionProjection,
      }, mediaCatalog, previewFirstAuthority || {});
      const covered = selected.source === "external-research-projection"
        ? mergeEchoReferenceRuntimeCoverage(governed.run, catalogRun)
        : governed.run;
      const active = attachEchoReferenceMedia(covered, governed.mediaCatalog);
      const runtimeRun = {
        ...active,
        referenceRuntime: {
          ...active.referenceRuntime,
          source: active.runtimeCoverage
            ? "external-research-projection+current-canonical-album"
            : selected.source,
          localRunHash: String(latest?.runHash || ""),
          researchRunHash: String(researchProjection?.runHash || ""),
          catalogRunHash: String(catalogRun?.runHash || ""),
          catalogGeneratedAtReadTime: catalogRun !== latest,
          coverage: active.runtimeCoverage || {
            schemaVersion: "hapa.echo-reference-runtime-coverage.v1",
            primarySongCount: Array.isArray(active.packet?.songs) ? active.packet.songs.length : 0,
            catalogSongCount: Array.isArray(active.packet?.songs) ? active.packet.songs.length : 0,
            missingSongIdsRecovered: [],
          },
          authority: governed.authoritySummary,
        },
      };
      currentRunCache = { key: currentRunCacheKey, run: runtimeRun };
      return runtimeRun;
    }
    return runEchoReferenceMining(await readSongStore(), {
      ...runOptions,
      contributionEvents: await contributions(),
      apply: false,
    });
  }

  async function run(runOptions = {}) {
    const apply = runOptions.apply === true;
    const contributionEvents = await contributions();
    const store = await readSongStore();
    const latest = await readJson(latestPath);
    const selectedSongIds = Array.isArray(runOptions.songIds) ? runOptions.songIds.filter(Boolean) : [];
    const candidate = selectedSongIds.length && latest
      ? compileIncrementalEchoReferenceGraph(latest, store, {
        songIds: selectedSongIds,
        reason: "single-song-runtime-request",
      }, {
        ...runOptions,
        songIds: [],
        contributionEvents,
        apply,
      })
      : runEchoReferenceMining(store, {
        ...runOptions,
        songIds: apply && selectedSongIds.length && !latest ? [] : selectedSongIds,
        contributionEvents,
        apply,
      });
    const semanticallyIdentical = latest?.runId === candidate.runId
      && latest?.packetHash === candidate.packetHash
      && latest?.graph?.graphHash === candidate.graph?.graphHash
      && echoReferenceDigest(latest?.cards || []) === echoReferenceDigest(candidate.cards || [])
      && echoReferenceDigest(latest?.unresolved || []) === echoReferenceDigest(candidate.unresolved || []);
    if (apply && semanticallyIdentical) {
      return {
        ...latest,
        contributions: foldEchoReferenceContributionEvents(contributionEvents),
        idempotentReplay: true,
      };
    }
    if (!apply) return { ...candidate, idempotentReplay: false };

    await mkdir(path.join(root, "runs"), { recursive: true });
    await writeJsonAtomic(path.join(root, "runs", `${safeRunFileName(candidate.runId)}.json`), candidate);
    await writeJsonAtomic(latestPath, candidate);
    await writeJsonAtomic(auditPath, {
      schemaVersion: "hapa.echo-reference-mining-audit.v1",
      runId: candidate.runId,
      runHash: candidate.runHash,
      generatedAt: candidate.generatedAt,
      packetHash: candidate.packetHash,
      graphHash: candidate.graph.graphHash,
      audit: candidate.audit,
      paths: {
        latest: latestPath,
        events: eventsPath,
      },
    });
    return { ...candidate, idempotentReplay: false };
  }

  async function appendContribution(input = {}) {
    const duplicateRoute = routeEchoReferenceProposal(await currentRun(), input);
    if (duplicateRoute.duplicate && !input.targetId) {
      return {
        event: null,
        idempotentReplay: true,
        duplicateRoute: duplicateRoute.route,
      };
    }
    const result = createEchoReferenceContributionEvent(input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference contribution: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    await mkdir(root, { recursive: true });
    const existing = await contributions();
    const duplicate = existing.find((event) => (
      event.requestDigest === result.event.requestDigest
      || event.contentDigest === result.event.contentDigest
    ));
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function appendDecision(input = {}) {
    const result = createEchoReferenceDecisionEvent(input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference decision: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    await mkdir(root, { recursive: true });
    const existing = await contributions();
    const duplicate = existing.find((event) => event.id === result.event.id);
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function appendReviewDecision(input = {}) {
    const active = await currentRun();
    const card = (active.cards || []).find((item) => item.id === input.cardId);
    if (!card) {
      const error = new Error(`Unknown Echo Reference Card: ${input.cardId}`);
      error.statusCode = 404;
      throw error;
    }
    const result = createEchoReferenceReviewDecision(card, input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference review: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    const existing = await contributions();
    const duplicate = existing.find((event) => event.id === result.event.id);
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await mkdir(root, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function appendClue(input = {}) {
    const existing = await contributions();
    const prior = input.targetClueId
      ? existing.find((event) => event.id === input.targetClueId)
      : null;
    const result = ["withdraw", "correct"].includes(input.action)
      ? createEchoReferenceClueLifecycleEvent(prior, input)
      : createEchoReferenceClueEvent(input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference clue: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    const duplicate = existing.find((event) => event.id === result.event.id
      || event.contentDigest === result.event.contentDigest);
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await mkdir(root, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function moderationQueue(queueOptions = {}) {
    const events = await contributions();
    return buildEchoReferenceModerationQueue(events.filter((event) => (
      ["proposal_submitted", "challenge_submitted"].includes(event.eventType)
    )), queueOptions);
  }

  async function appendModerationAction(input = {}) {
    const queue = await moderationQueue({ now: input.createdAt });
    const item = queue.items.find((candidate) => candidate.id === input.itemId);
    const result = createEchoReferenceModerationAction(item, input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference moderation action: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    const existing = await contributions();
    const duplicate = existing.find((event) => event.id === result.event.id);
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await mkdir(root, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function appendChallengeResolution(input = {}) {
    const existing = await contributions();
    const challenge = existing.find((event) => event.id === input.challengeId);
    const result = createEchoReferenceChallengeResolution(challenge, input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference challenge resolution: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    const duplicate = existing.find((event) => event.id === result.event.id);
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await mkdir(root, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function appendChallengeAppeal(input = {}) {
    const existing = await contributions();
    const challenge = existing.find((event) => event.id === input.challengeId);
    const resolution = existing.find((event) => event.id === input.resolutionId);
    const result = createEchoReferenceChallengeAppeal(challenge, resolution, input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference challenge appeal: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    const duplicate = existing.find((event) => event.id === result.event.id);
    if (duplicate) return { event: duplicate, idempotentReplay: true };
    await mkdir(root, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify(result.event)}\n`);
    return { event: result.event, idempotentReplay: false };
  }

  async function activity(activityOptions = {}) {
    const [events, active] = await Promise.all([contributions(), currentRun()]);
    return buildEchoReferenceContributionActivity(events, {
      viewer: activityOptions.viewer,
      graphDiff: active.diff,
      revisionDiffs: activityOptions.revisionDiffs,
    });
  }

  async function appendFollowSubscription(input = {}) {
    const result = createEchoReferenceFollowSubscription(input);
    if (!result.ok) {
      const error = new Error(`Invalid Echo reference follow: ${result.errors.join(", ")}`);
      error.statusCode = 400;
      error.errors = result.errors;
      throw error;
    }
    const existing = await contributions();
    const duplicate = existing.find((event) => event.id === result.subscription.id);
    if (duplicate) return { subscription: duplicate, idempotentReplay: true };
    await mkdir(root, { recursive: true });
    await appendFile(eventsPath, `${JSON.stringify({
      ...result.subscription,
      eventType: "follow_subscription_created",
    })}\n`);
    return { subscription: result.subscription, idempotentReplay: false };
  }

  async function notifications(notificationOptions = {}) {
    const events = await contributions();
    const projectedActivity = await activity({ viewer: "public" });
    return buildEchoReferenceNotifications(
      projectedActivity,
      events.filter((event) => event.eventType === "follow_subscription_created"),
      notificationOptions,
    );
  }

  async function projection(projectionOptions = {}) {
    const active = await currentRun();
    const projected = projectEchoReferenceRun(active, {
      songId: projectionOptions.songId,
      includeCards: projectionOptions.includeCards !== false,
      includeGraph: projectionOptions.includeGraph !== false,
    });
    const mediaGallery = (active.cards || [])
      .filter((card) => card.presentationMedia?.image?.uri)
      .sort((left, right) => (
        String(left.occurrences?.[0]?.songTitle || "").localeCompare(String(right.occurrences?.[0]?.songTitle || ""))
        || String(left.title || "").localeCompare(String(right.title || ""))
      ))
      .slice(0, 24)
      .map((card) => ({
        id: card.id,
        title: card.title,
        revisionId: card.revisionId,
        authority: card.authority,
        presentationMedia: card.presentationMedia,
        occurrence: card.occurrences?.[0] || null,
      }));
    const withRuntime = {
      ...projected,
      runtime: active.referenceRuntime || null,
      mediaGallery,
    };
    if (!projectionOptions.lens && !projectionOptions.query) return withRuntime;
    return {
      ...withRuntime,
      filtered: filterEchoReferenceView(active, {
        songId: projectionOptions.songId,
        lens: projectionOptions.lens,
        query: projectionOptions.query,
      }),
    };
  }

  async function tarotCards(tarotOptions = {}) {
    const active = await currentRun();
    const songId = String(tarotOptions.songId || "").trim();
    const projected = projectEchoReferenceRun(active, {
      songId,
      includeCards: false,
      includeGraph: false,
    });
    const cards = buildEchoReferenceTarotCards(active, { songId });
    return {
      schemaVersion: "hapa.echo-reference-tarot-runtime.v1",
      runId: active.runId,
      runHash: active.runHash,
      runtime: active.referenceRuntime || null,
      song: projected.song || null,
      timeline: projected.song?.timeline || [],
      cards,
    };
  }

  async function gptImageLibrary() {
    const [active, mediaCatalog] = await Promise.all([
      currentRun(),
      readJsonCached(animatedMediaPath, { records: [] }),
    ]);
    return buildEchoReferenceGptImageLibrary(active, mediaCatalog);
  }

  return {
    root,
    latestPath,
    researchProjectionPath,
    animatedMediaPath,
    previewFirstAuthorityPath,
    eventsPath,
    revisionsPath,
    auditPath,
    currentRun,
    run,
    projection,
    tarotCards,
    gptImageLibrary,
    contributions,
    cardRevisionEvents,
    cardHistory,
    appendCardRevision,
    migrateRunCards,
    reviseCard,
    rollbackCard,
    projectCardRevisions,
    appendContribution,
    appendDecision,
    appendReviewDecision,
    appendClue,
    moderationQueue,
    appendModerationAction,
    appendChallengeResolution,
    appendChallengeAppeal,
    activity,
    appendFollowSubscription,
    notifications,
  };
}
