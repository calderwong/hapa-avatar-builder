#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const DATA_DIR = "data";
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const TIMELINE_DIR = path.join(DATA_DIR, "avatar-life-journal-timeline");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const LORE_PLAN_PATH = path.join(DATA_DIR, "lore-production-plan.json");
const CONTRACT_PATH = path.join(DATA_DIR, "avatar-agent-contract.json");
const LAST_LIGHT_PACKET_PATH = path.join(DATA_DIR, "last-light-archive", "last-light-archive-packet.json");
const TIMELINE_ID = "avatar-life-canon-timeline";
const INGRESS_DATE = "2026-06-21";
const INGRESS_YEAR = 2026;
const TIMELINE_PATH = path.join(TIMELINE_DIR, "life-journal-timeline.json");
const DIGEST_PATH = path.join(TIMELINE_DIR, "life-journal-digest.md");
const WIKI_DIGEST_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Avatar Life Journal Timeline.md";
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const now = new Date().toISOString();
const runStamp = now.replace(/[:.]/g, "-");
const batchReportPath = path.join(RUN_DIR, `avatar-life-journal-batch-${runStamp}.json`);

await main();

async function main() {
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(TIMELINE_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = await readJson(ITEM_STORE_PATH).catch(() => ({ cards: [] }));
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const songbook = await readJson(SONGBOOK_PATH).catch(() => ({ songCards: [] }));
  const lorePlan = await readJson(LORE_PLAN_PATH).catch(() => ({}));
  const contract = await readJson(CONTRACT_PATH).catch(() => ({}));
  const lastLightPacket = await readJson(LAST_LIGHT_PACKET_PATH).catch(() => ({
    id: "last-light-archive-canon-packet",
    title: "The Last Light Archive",
    thesis: "Dear Papa is a damaged ritual archive carried by Red, Green, and Blue.",
    canonLine: "Nothing loved is truly lost, but Love must keep learning the Truth about what found means.",
    concepts: []
  }));

  const avatars = (avatarStore.avatars || []).filter((avatar) => avatar?.id).map((avatar) => normalizeAvatarCard(avatar));
  if (!avatars.length) throw new Error("No avatars found.");

  const context = buildContext({ avatars, itemStore, sceneStore, songbook, lorePlan, lastLightPacket });
  const { avatarPatches, events, runReceipts } = buildAvatarLifeJournals(avatars, context);
  const nextAvatarStore = applyAvatarPatches(avatarStore, avatarPatches, runReceipts);
  const timeline = buildUnifiedTimeline(events, context);
  const nextSceneStore = applyTimelineToSceneStore(sceneStore, timeline);
  const nextContract = updateContract(contract, context, timeline);
  const nextLorePlan = updateLorePlan(lorePlan, context, timeline);
  const digest = buildDigest(timeline, context, avatarPatches);
  const batchReport = {
    schemaVersion: "hapa.avatar-life-journal-batch.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-avatar-life-journal-pass.mjs",
    ingressDate: INGRESS_DATE,
    timelineId: TIMELINE_ID,
    avatarCount: avatars.length,
    eventCount: events.length,
    journalEntryCount: events.length,
    averageYearsPerAvatar: Number((events.length / avatars.length).toFixed(2)),
    sourceRefs: context.sourceRefs,
    runReceipts: runReceipts.map(({ run, ...receipt }) => receipt),
    timelinePath: path.resolve(TIMELINE_PATH),
    digestPath: path.resolve(DIGEST_PATH),
    wikiDigestPath: WIKI_DIGEST_PATH
  };

  if (!dryRun) {
    await backupStores();
    await Promise.all(runReceipts.map((receipt) => writeJson(receipt.runFile, receipt.run)));
    await writeJson(AVATAR_STORE_PATH, nextAvatarStore);
    await writeJson(SCENE_STORE_PATH, nextSceneStore);
    await writeJson(CONTRACT_PATH, nextContract);
    await writeJson(LORE_PLAN_PATH, nextLorePlan);
    await writeJson(TIMELINE_PATH, timeline);
    await writeJson(batchReportPath, batchReport);
    await writeMarkdown(DIGEST_PATH, digest);
    await writeMarkdown(WIKI_DIGEST_PATH, digest);
    await appendSubscriberEvent("avatar.life-journal-timeline-updated", {
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      timelinePath: path.resolve(TIMELINE_PATH),
      batchReportPath: path.resolve(batchReportPath),
      digestPath: path.resolve(DIGEST_PATH),
      wikiDigestPath: WIKI_DIGEST_PATH,
      timelineId: TIMELINE_ID,
      ingressDate: INGRESS_DATE,
      avatarCount: avatars.length,
      eventCount: events.length
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    avatarCount: avatars.length,
    eventCount: events.length,
    timelineId: TIMELINE_ID,
    ingressDate: INGRESS_DATE,
    timelinePath: TIMELINE_PATH,
    digestPath: DIGEST_PATH,
    batchReportPath
  }, null, 2));
}

function buildContext({ avatars, itemStore, sceneStore, songbook, lorePlan, lastLightPacket }) {
  const teamMap = new Map();
  for (const avatar of avatars) {
    const key = teamId(avatar) || "unassigned";
    teamMap.set(key, [...(teamMap.get(key) || []), avatar]);
  }
  const lastLightCards = (itemStore.cards || []).filter((card) => String(card.id || "").startsWith("last-light-"));
  return {
    teamMap,
    lastLightCards,
    sceneCount: (sceneStore.scenes || []).length,
    songCount: (songbook.songCards || []).length,
    lorePlanStatus: lorePlan.goalStatus || "",
    lastLightPacket,
    sourceRefs: [
      AVATAR_STORE_PATH,
      ITEM_STORE_PATH,
      SCENE_STORE_PATH,
      SONGBOOK_PATH,
      LORE_PLAN_PATH,
      CONTRACT_PATH,
      LAST_LIGHT_PACKET_PATH
    ]
  };
}

function buildAvatarLifeJournals(avatars, context) {
  const avatarPatches = [];
  const events = [];
  const runReceipts = [];
  for (const avatar of avatars) {
    const span = chronicleYearsForAvatar(avatar);
    const peersByYear = Array.from({ length: span + 1 }, (_, year) => selectPeerReviewers(avatar, avatars, context.teamMap, year));
    const entries = [];
    let previousEventId = "";
    for (let lifeYear = 0; lifeYear <= span; lifeYear += 1) {
      const entry = buildJournalEntry(avatar, {
        lifeYear,
        span,
        reviewers: peersByYear[lifeYear],
        previousEventId,
        context
      });
      entries.push(entry);
      events.push(journalEntryToEvent(avatar, entry, previousEventId));
      previousEventId = entry.timelineEventId;
    }
    for (let index = 0; index < events.length; index += 1) {
      if (events[index].avatarId !== avatar.id) continue;
      const next = events.find((event) => event.avatarId === avatar.id && event.lifeYear === events[index].lifeYear + 1);
      events[index].causalityOutputs = next ? [next.id] : [];
    }
    const run = buildAvatarRun(avatar, entries, context);
    const runFile = path.join(RUN_DIR, `${slugify(avatarName(avatar)) || avatar.id}-life-journal-${runStamp}.json`);
    runReceipts.push({
      avatarId: avatar.id,
      avatarName: avatarName(avatar),
      runId: run.runId,
      runFile,
      entryCount: entries.length,
      run
    });
    avatarPatches.push({ avatarId: avatar.id, entries, run, runFile });
  }
  return { avatarPatches, events: events.sort(compareEvents), runReceipts };
}

function buildJournalEntry(avatar, { lifeYear, span, reviewers, previousEventId, context }) {
  const name = avatarName(avatar);
  const lane = avatarLane(avatar);
  const role = avatarRole(avatar);
  const teamTitle = avatarTeamTitle(avatar);
  const localYear = INGRESS_YEAR - (span - lifeYear);
  const relativeYear = lifeYear === span ? "INGRESS" : `Y-${String(span - lifeYear).padStart(2, "0")}`;
  const phase = lifePhase(lifeYear, span);
  const responsibilities = avatarResponsibilities(avatar);
  const skills = avatarSkills(avatar, lane);
  const reviewersText = reviewers.map(avatarName).join(", ");
  const lastLight = context.lastLightPacket;
  const previousLine = previousEventId
    ? `The prior registered event, ${previousEventId}, remains the causal input: ${name} is not allowed to leap into a new power, bond, or wound without carrying what the last year changed.`
    : `This is ${name}'s first registered life event, so the cause is source emergence: a person-shaped signal becomes stable enough to keep a memory.`;
  const ingressLine = lifeYear === span
    ? `On ${INGRESS_DATE}, ${name} reaches ingress and accepts the ${role} seat on ${teamTitle}; this is the present-tense point where their backstory becomes operational responsibility.`
    : `The year does not end in arrival yet; it creates one necessary condition for the eventual ${role} seat on ${teamTitle}.`;
  const conflict = phaseConflict(phase, lane, role);
  const oath = lastLight.canonLine || "Nothing loved is truly lost, but Love must keep learning the Truth about what found means.";
  const publicSummary = `${name} life year ${lifeYear} (${localYear}) records ${phase.label.toLowerCase()} as a causal step toward ${teamTitle} / ${role}, reviewed against ${reviewersText || "the team ledger"}.`;
  const privateEntry = [
    `${name} records Life Year ${String(lifeYear).padStart(2, "0")} as ${phase.label}. The memory begins in the ${lane.toUpperCase()} lane: ${laneDuty(lane)}. ${avatarObjective(avatar)} is already present, but it is not yet disciplined enough to become a job. ${conflict}`,
    `Before ${name} accepts this as personal canon, they review the records of ${reviewersText || "the shared Hapa witnesses"}. That review matters because Hapa is inter-dimensional: a memory can arrive from a Garden, a ship, a song, a card, or a converged timeline, but it still has to answer to witnesses. ${name} keeps the parts that agree with source, marks the parts that are perspective, and lets disagreement become drama instead of a broken timeline.`,
    `The practical lesson of the year is ${skills.slice(0, 3).join(", ")}. ${name} learns that responsibilities like ${responsibilities.slice(0, 3).join(", ")} are not labels; they are promises that must survive pressure, relationships, and repair. The team shape is visible before the team exists: ${teamTitle} will need ${name} as ${role} because this year proves what they can carry and what they still mishandle.`,
    `${previousLine} ${ingressLine} ${oath} The causal rule for the next year is simple: no dramatic revelation counts unless it changes what ${name} protects, remembers, repairs, or refuses to simplify.`
  ].join("\n\n");
  return {
    id: `life-journal-${avatar.id}-y${String(lifeYear).padStart(2, "0")}`,
    schemaVersion: "hapa.avatar-journal-entry.v1",
    journalType: "annual-life-canon",
    timelineId: TIMELINE_ID,
    timelineEventId: `life-event-${avatar.id}-y${String(lifeYear).padStart(2, "0")}`,
    lifeYear,
    age: lifeYear,
    calendarYear: localYear,
    relativeYear,
    dateOrSequenceMarker: lifeYear === span
      ? `Life Year ${String(lifeYear).padStart(2, "0")} / ${INGRESS_DATE} / Ingress`
      : `Life Year ${String(lifeYear).padStart(2, "0")} / ${localYear}`,
    entryVoice: "in-character",
    privateEntry,
    publicSummary,
    classification: "soft_canon",
    canonStatus: lifeYear === span ? "personal_canon_ingress" : "personal_canon_draft",
    causalityStatus: "causal-reviewed",
    reviewedAvatarIds: reviewers.map((reviewer) => reviewer.id),
    reviewedAvatarNames: reviewers.map(avatarName),
    linkedTeamId: teamId(avatar),
    linkedTeamTitle: teamTitle,
    linkedRole: role,
    responsibilityTags: responsibilities,
    skillTags: skills,
    sourceRefs: context.sourceRefs,
    paragraphCount: 4,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function journalEntryToEvent(avatar, entry, previousEventId) {
  return {
    id: entry.timelineEventId,
    schemaVersion: "hapa.avatar-life-timeline-event.v1",
    timelineId: TIMELINE_ID,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    lifeYear: entry.lifeYear,
    age: entry.age,
    calendarYear: entry.calendarYear,
    relativeYear: entry.relativeYear,
    order: entry.calendarYear * 100000 + entry.lifeYear * 100 + (stableNumber(avatar.id) % 100),
    title: `${avatarName(avatar)} ${entry.dateOrSequenceMarker}`,
    summary: entry.publicSummary,
    journalEntryId: entry.id,
    teamId: entry.linkedTeamId,
    teamTitle: entry.linkedTeamTitle,
    role: entry.linkedRole,
    reviewedAvatarIds: entry.reviewedAvatarIds,
    reviewedAvatarNames: entry.reviewedAvatarNames,
    causalityInputs: previousEventId ? [previousEventId] : [],
    causalityOutputs: [],
    canonStatus: entry.canonStatus,
    causalityStatus: entry.causalityStatus,
    sourceRefs: entry.sourceRefs,
    createdAt: now,
    updatedAt: now
  };
}

function buildAvatarRun(avatar, entries, context) {
  return {
    schemaVersion: "hapa.avatar-life-journal-run.v1",
    runId: `avatar-life-journal-${avatar.id}-${runStamp}`,
    avatarId: avatar.id,
    avatarName: avatarName(avatar),
    status: "complete",
    completedAt: now,
    source: "scripts/run-avatar-life-journal-pass.mjs",
    ingressDate: INGRESS_DATE,
    reviewedContext: {
      sourceRefs: context.sourceRefs,
      lastLightArchive: context.lastLightPacket?.id || "",
      lastLightThesis: context.lastLightPacket?.thesis || "",
      lorePlanStatus: context.lorePlanStatus,
      sceneCount: context.sceneCount,
      songCount: context.songCount,
      lastLightCardCount: context.lastLightCards.length
    },
    entryCount: entries.length,
    entries,
    reviewProtocol: [
      "Read shared Hapa lore, Last Light Archive, team context, song/card context, and peer avatar entries.",
      "Write each annual memory as personal canon draft until causality, source, and peer review are visible.",
      "Keep inter-dimensional flexibility while preserving causal inputs and outputs.",
      "End the final entry at ingress on 2026-06-21 with team, role, responsibilities, and skills."
    ]
  };
}

function applyAvatarPatches(avatarStore, avatarPatches, runReceipts) {
  const patchByAvatar = new Map(avatarPatches.map((patch) => [patch.avatarId, patch]));
  return {
    ...avatarStore,
    avatars: (avatarStore.avatars || []).map((avatar) => {
      const normalized = normalizeAvatarCard(avatar);
      const patch = patchByAvatar.get(normalized.id);
      if (!patch) return normalized;
      const mind = normalized.mind || {};
      const entryIds = new Set(patch.entries.map((entry) => entry.id));
      const existingJournal = (mind.journal || []).filter((entry) => !entryIds.has(entry.id));
      const contextEntry = {
        id: `context-${normalized.id}-life-journal-timeline`,
        contextId: TIMELINE_ID,
        label: "Avatar Life Canon Timeline",
        kind: "saga",
        avatarBelief: `${avatarName(normalized)} registered ${patch.entries.length} annual life-journal entries before ingress on ${INGRESS_DATE}, reviewing peers before adding each memory to personal canon.`,
        publicSummary: `${avatarName(normalized)}'s annual journals now connect personal canon, team role, responsibilities, skills, peer review, and causality.`,
        classification: "soft_canon",
        confidence: "generated",
        visibility: "shared",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      const memoryEntry = {
        memoryId: `memory-${normalized.id}-life-journal-${runStamp}`,
        summary: `${avatarName(normalized)} wrote annual life journals from Life Year 00 to ingress, registering them on ${TIMELINE_ID}.`,
        emotionalWeight: 5,
        visibility: "shared",
        confidence: "generated",
        classification: "memory_delta",
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      const genesisRun = {
        id: patch.run.runId,
        runId: patch.run.runId,
        sourcePath: patch.runFile,
        status: "complete",
        completedAt: now,
        createdAt: now,
        updatedAt: now
      };
      return normalizeAvatarCard({
        ...normalized,
        mind: {
          ...mind,
          personaAnchor: {
            ...(mind.personaAnchor || {}),
            carriedForward: appendSentence(mind.personaAnchor?.carriedForward, `Annual life journals registered on ${TIMELINE_ID}; personal canon now requires peer review and causal links before ingress.`),
            updatedAt: now
          },
          selfKnowledge: mergeById([
            ...(mind.selfKnowledge || []),
            {
              id: `life-journal-fact-${normalized.id}`,
              label: "Life journal canon spine",
              value: `${avatarName(normalized)} has an annual personal-canon timeline ending at ingress on ${INGRESS_DATE}. Each entry records peer review, causality, team role, responsibilities, and skills.`,
              classification: "soft_canon",
              confidence: "generated",
              visibility: "shared",
              source: TIMELINE_PATH,
              status: "active",
              createdAt: now,
              updatedAt: now
            }
          ]),
          contextMap: mergeById([...(mind.contextMap || []), contextEntry]),
          memoryLedger: mergeById([...(mind.memoryLedger || []), memoryEntry], "memoryId"),
          journal: mergeById([...patch.entries, ...existingJournal]),
          genesisRuns: mergeById([...(mind.genesisRuns || []), genesisRun]),
          updatedAt: now
        },
        updatedAt: now
      });
    }),
    lifeJournalRunReceipts: runReceipts.map(({ run, ...receipt }) => receipt),
    updatedAt: now
  };
}

function buildUnifiedTimeline(events, context) {
  const sortedEvents = events.slice().sort(compareEvents);
  return {
    schemaVersion: "hapa.avatar-life-canon-timeline.v1",
    id: TIMELINE_ID,
    name: "Avatar Life Canon Timeline",
    description: "Unified inter-dimensional avatar life timeline. Annual entries remain flexible in origin but causal in registration: each year points to prior memory, peer review, role formation, and ingress.",
    ingressDate: INGRESS_DATE,
    ingressYear: INGRESS_YEAR,
    generatedAt: now,
    source: "scripts/run-avatar-life-journal-pass.mjs",
    sourceRefs: context.sourceRefs,
    eventCount: sortedEvents.length,
    avatarCount: unique(sortedEvents.map((event) => event.avatarId)).length,
    reviewEdgeCount: sortedEvents.reduce((total, event) => total + event.reviewedAvatarIds.length, 0),
    causalityRule: "Every avatar annual journal event links to the previous life-year event and names reviewed avatars before becoming personal canon.",
    events: sortedEvents
  };
}

function applyTimelineToSceneStore(sceneStore, timeline) {
  const graph = normalizeSceneGraph(sceneStore);
  const existing = (graph.timelines || []).filter((item) => item.id !== TIMELINE_ID);
  graph.timelines = [
    ...existing,
    {
      id: TIMELINE_ID,
      name: timeline.name,
      description: timeline.description,
      ingressDate: timeline.ingressDate,
      eventCount: timeline.eventCount,
      avatarCount: timeline.avatarCount,
      reviewEdgeCount: timeline.reviewEdgeCount,
      sourcePath: path.resolve(TIMELINE_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      events: timeline.events.map((event) => ({
        id: event.id,
        avatarId: event.avatarId,
        avatarName: event.avatarName,
        lifeYear: event.lifeYear,
        calendarYear: event.calendarYear,
        order: event.order,
        journalEntryId: event.journalEntryId,
        teamId: event.teamId,
        role: event.role,
        reviewedAvatarIds: event.reviewedAvatarIds,
        causalityInputs: event.causalityInputs,
        causalityOutputs: event.causalityOutputs,
        canonStatus: event.canonStatus
      })),
      createdAt: now,
      updatedAt: now
    }
  ];
  graph.updatedAt = now;
  return normalizeSceneGraph(graph);
}

function updateContract(contract, context, timeline) {
  return {
    ...contract,
    avatarLifeJournalProtocol: {
      schemaVersion: "hapa.avatar-life-journal-protocol.v1",
      id: "avatar-life-journal-protocol",
      timelineId: TIMELINE_ID,
      ingressDate: INGRESS_DATE,
      sourcePath: path.resolve(TIMELINE_PATH),
      requiredOutputs: [
        "annual_life_journal_entries",
        "peer_reviewed_personal_canon",
        "causality_inputs_outputs",
        "team_role_responsibility_skill_exposition",
        "ingress_entry"
      ],
      contextRefs: context.sourceRefs,
      updatedAt: now
    },
    updatedAt: now
  };
}

function updateLorePlan(lorePlan, context, timeline) {
  return {
    ...lorePlan,
    goalStatus: "avatar_life_journal_timeline_complete",
    avatarLifeJournalTimeline: {
      schemaVersion: "hapa.avatar-life-journal-plan.v1",
      timelineId: TIMELINE_ID,
      ingressDate: INGRESS_DATE,
      timelinePath: path.resolve(TIMELINE_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiDigestPath: WIKI_DIGEST_PATH,
      eventCount: timeline.eventCount,
      avatarCount: timeline.avatarCount,
      reviewEdgeCount: timeline.reviewEdgeCount,
      sourceRefs: context.sourceRefs,
      completedAt: now
    },
    consolidationHistory: [
      ...(Array.isArray(lorePlan.consolidationHistory) ? lorePlan.consolidationHistory : []),
      {
        id: `consolidation-avatar-life-journal-${runStamp}`,
        type: "avatar-life-journal-timeline",
        summary: `Generated ${timeline.eventCount} annual avatar journal entries across ${timeline.avatarCount} avatars, registered on ${TIMELINE_ID}.`,
        timelinePath: path.resolve(TIMELINE_PATH),
        digestPath: path.resolve(DIGEST_PATH),
        wikiDigestPath: WIKI_DIGEST_PATH,
        confidence: "generated",
        completedAt: now
      }
    ],
    updatedAt: now
  };
}

function buildDigest(timeline, context, avatarPatches) {
  const teamCounts = {};
  for (const event of timeline.events) teamCounts[event.teamTitle || "Unassigned"] = (teamCounts[event.teamTitle || "Unassigned"] || 0) + 1;
  const teamLines = Object.entries(teamCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([team, count]) => `- ${team}: ${count} registered annual entries`)
    .join("\n");
  const sampleLines = avatarPatches.slice(0, 12).map((patch) => {
    const final = patch.entries[patch.entries.length - 1];
    return `- ${final.publicSummary}`;
  }).join("\n");
  return `# Avatar Life Journal Timeline

Generated: ${now}
Timeline: ${TIMELINE_ID}
Ingress date: ${INGRESS_DATE}

## Purpose

This pass gives every avatar an annual personal-canon journal spine leading to ingress. The lore remains inter-dimensional, but each annual entry has causal registration: prior year, reviewed peers, team/role/responsibility/skill context, and a final ingress point.

## Context Reviewed

${context.sourceRefs.map((ref) => `- ${ref}`).join("\n")}

## Counts

- Avatars: ${timeline.avatarCount}
- Annual journal events: ${timeline.eventCount}
- Peer-review edges: ${timeline.reviewEdgeCount}
- Last Light cards reviewed: ${context.lastLightCards.length}

## Teams

${teamLines}

## Sample Ingress Summaries

${sampleLines}

## Causality Rule

${timeline.causalityRule}
`;
}

function chronicleYearsForAvatar(avatar) {
  const role = avatarRole(avatar).toLowerCase();
  let years = 8 + (stableNumber(avatar.id) % 5);
  if (/core protocol|red|blue|green/.test(`${teamId(avatar)} ${avatarTeamTitle(avatar)}`.toLowerCase())) years += 2;
  if (/lead|anchor|archivist|strategist/.test(role)) years += 2;
  if (/calder|red|blue|green/.test(avatarName(avatar).toLowerCase())) years += 2;
  return Math.max(8, Math.min(16, years));
}

function selectPeerReviewers(avatar, avatars, teamMap, year) {
  const sameTeam = (teamMap.get(teamId(avatar) || "unassigned") || []).filter((item) => item.id !== avatar.id);
  const laneTargets = avatars.filter((item) => item.id !== avatar.id && avatarLane(item) !== avatarLane(avatar));
  const pool = uniqueByAvatar([...sameTeam, ...laneTargets, ...avatars.filter((item) => item.id !== avatar.id)]);
  const count = Math.min(4, Math.max(2, pool.length));
  return Array.from({ length: count }, (_, index) => pool[(stableNumber(`${avatar.id}:${year}:${index}`) + index) % pool.length]).filter(Boolean);
}

function lifePhase(lifeYear, span) {
  const ratio = span ? lifeYear / span : 1;
  if (lifeYear === 0) return { id: "origin", label: "Origin Signal" };
  if (ratio < 0.22) return { id: "first-memory", label: "First Memory Pressure" };
  if (ratio < 0.42) return { id: "skill", label: "Skill Formation" };
  if (ratio < 0.62) return { id: "relationship", label: "Relationship Collision" };
  if (ratio < 0.82) return { id: "team", label: "Team Gravity" };
  if (lifeYear < span) return { id: "threshold", label: "Ingress Threshold" };
  return { id: "ingress", label: "Ingress Day" };
}

function phaseConflict(phase, lane, role) {
  const laneRisk = lane === "red" ? "speed wants to outrun consent"
    : lane === "blue" ? "truth wants to freeze into fixation"
    : "care wants to become invisible labor";
  const roleRisk = /lead|strategist/i.test(role) ? "authority arrives before trust is fully earned"
    : /archivist/i.test(role) ? "the record wants to sound cleaner than the witness"
    : /scout|wild/i.test(role) ? "discovery arrives before the map knows how to protect it"
    : "usefulness tries to hide the private cost";
  return `The dramatic pressure is that ${laneRisk}, while ${roleRisk}.`;
}

function avatarSkills(avatar, lane) {
  const explicit = [
    ...(avatar.mind?.skillCardLoadout || []).map((card) => card.title || card.id),
    ...(avatar.mind?.protocolCardLoadout || []).map((card) => card.title || card.id),
    ...(avatar.mind?.gardenNodeAssignment?.functions || []),
    ...(avatar.mind?.gardenNodeAssignment?.produces || [])
  ];
  const laneSkills = lane === "red"
    ? ["protected action", "rollback planning", "pressure testing", "repair-aware escalation"]
    : lane === "blue"
      ? ["source review", "route mapping", "uncertainty tracking", "witness preservation"]
      : ["stakeholder care", "repair loops", "shelter design", "cultivation review"];
  return unique([...explicit, ...laneSkills]).slice(0, 10);
}

function avatarResponsibilities(avatar) {
  return unique([
    ...(avatar.mind?.gardenNodeAssignment?.responsibilities || []),
    avatar.mind?.shipCrewAssignment?.duty,
    avatar.mind?.placementBackstorySeed?.whyTheyAccepted,
    avatar.mind?.personaAnchor?.wants,
    "review peer canon before personal canon promotion",
    "connect backstory to team responsibility"
  ]).filter(Boolean).slice(0, 10);
}

function avatarObjective(avatar) {
  return avatar.mind?.soulSeed?.coreWant ||
    avatar.mind?.personaAnchor?.wants ||
    avatar.summary ||
    "become useful to Hapa without losing source boundaries";
}

function laneDuty(lane) {
  if (lane === "red") return "move when action is needed, but keep rollback and repair visible";
  if (lane === "blue") return "preserve names, sources, uncertainty, and the route home";
  return "carry people, repair conditions, and make arrival livable";
}

function avatarLane(avatar) {
  const text = [
    avatar.id,
    avatarName(avatar),
    teamId(avatar),
    avatarTeamTitle(avatar),
    avatarRole(avatar),
    avatar.mind?.dearPapaSongContext?.performancePerspective?.teamColor,
    avatar.mind?.dearPapaSongContext?.performancePerspective?.team_color,
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.soulSeed?.soulThesis
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bred\b|fire|motion|pressure|action|liberty/.test(text)) return "red";
  if (/\bgreen\b|care|repair|garden|stakeholder|cultivation|shelter/.test(text)) return "green";
  if (/\bblue\b|archive|memory|truth|route|source|signal|harbor/.test(text)) return "blue";
  return ["red", "blue", "green"][stableNumber(avatar.id || avatarName(avatar)) % 3];
}

function teamId(avatar) {
  return avatar.mind?.gardenNodeAssignment?.teamId || avatar.mind?.shipCrewAssignment?.teamId || avatar.teamId || "";
}

function avatarTeamTitle(avatar) {
  return avatar.mind?.gardenNodeAssignment?.teamTitle || avatar.mind?.shipCrewAssignment?.teamTitle || "Unassigned Team";
}

function avatarRole(avatar) {
  return avatar.mind?.gardenNodeAssignment?.role || avatar.mind?.shipCrewAssignment?.crewSeat || avatar.role || "Crew";
}

function compareEvents(left, right) {
  return Number(left.order || 0) - Number(right.order || 0) || left.avatarName.localeCompare(right.avatarName);
}

function uniqueByAvatar(avatars) {
  const byId = new Map();
  for (const avatar of avatars) if (avatar?.id) byId.set(avatar.id, avatar);
  return [...byId.values()];
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-life-journal-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-life-journal-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `avatar-agent-contract.before-life-journal-${runStamp}.json`), await readJson(CONTRACT_PATH));
  await writeJson(path.join(BACKUP_DIR, `lore-production-plan.before-life-journal-${runStamp}.json`), await readJson(LORE_PLAN_PATH));
}

async function appendSubscriberEvent(action, payload = {}) {
  const event = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    source: "hapa-avatar-builder",
    at: now,
    subscribers: SUBSCRIBERS,
    payload,
    avatar: {
      atlasEntityId: "hapa-avatar:all",
      sourcePath: path.resolve(AVATAR_STORE_PATH)
    },
    scenes: {
      atlasEntityId: "hapa-scenes:scene-graph",
      sourcePath: path.resolve(SCENE_STORE_PATH)
    },
    lore: {
      atlasEntityId: `hapa-lore:${TIMELINE_ID}`,
      sourcePath: path.resolve(TIMELINE_PATH),
      digestPath: path.resolve(DIGEST_PATH),
      wikiDigestPath: WIKI_DIGEST_PATH
    }
  };
  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await writeJson(path.join(SUBSCRIBER_DIR, "latest.json"), event);
  await writeJson(path.join(SUBSCRIBER_DIR, "latest-summary.json"), {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action: event.action,
    at: event.at,
    subscribers: event.subscribers,
    avatarStorePath: path.resolve(AVATAR_STORE_PATH),
    sceneStorePath: path.resolve(SCENE_STORE_PATH),
    timelinePath: path.resolve(TIMELINE_PATH),
    digestPath: path.resolve(DIGEST_PATH),
    wikiDigestPath: WIKI_DIGEST_PATH
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeMarkdown(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function appendSentence(existing = "", sentence = "") {
  const text = String(existing || "").trim();
  if (!sentence) return text;
  if (text.includes(sentence)) return text;
  return text ? `${text} ${sentence}` : sentence;
}

function mergeById(items = [], key = "id") {
  const byId = new Map();
  for (const item of items) {
    const id = item?.[key] || item?.id || item?.memoryId;
    if (!id) continue;
    byId.set(id, item);
  }
  return [...byId.values()];
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.name || avatar.id || "Avatar";
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}

function stableNumber(value) {
  return Number.parseInt(stableHash(value).slice(0, 8), 16);
}

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      map.set(key, true);
    } else {
      map.set(key, next);
      index += 1;
    }
  }
  return map;
}
