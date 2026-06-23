#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeAvatarCard, slugify } from "../src/domain/avatar.js";
import { normalizeItemManagerStore } from "../src/domain/item.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";

const DATA_DIR = "data";
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const TIMELINE_DIR = path.join(DATA_DIR, "avatar-life-journal-timeline");
const SUBSCRIBER_DIR = path.join(DATA_DIR, "subscribers");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const CONTRACT_PATH = path.join(DATA_DIR, "avatar-agent-contract.json");
const LORE_PLAN_PATH = path.join(DATA_DIR, "lore-production-plan.json");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const LAST_LIGHT_PACKET_PATH = path.join(DATA_DIR, "last-light-archive", "last-light-archive-packet.json");
const LIFE_TIMELINE_PATH = path.join(TIMELINE_DIR, "life-journal-timeline.json");
const CONSOLIDATION_PATH = path.join(TIMELINE_DIR, "lorekeeper-life-saga-consolidation.json");
const SAGA_MARKDOWN_PATH = path.join(TIMELINE_DIR, "lorekeeper-life-saga-cards.md");
const EPIC_MARKDOWN_PATH = path.join(TIMELINE_DIR, "avatar-ingress-chronicle-epic.md");
const WIKI_SAGA_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Avatar Life Saga Cards.md";
const WIKI_EPIC_PATH = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki/Sagas/Avatar Ingress Chronicle.md";
const TIMELINE_ID = "avatar-life-canon-timeline";
const COLLECTION_ID = "avatar-life-lorekeeper-consolidation";
const EPIC_CARD_ID = "lorekeeper-epic-avatar-ingress-chronicle";
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki", "hapa-avatar-builder"];

const ERA_DEFS = [
  {
    id: "origin-signals",
    title: "Origin Signals",
    start: 2010,
    end: 2012,
    teaching: "Names and first memories become durable enough to enter the Hapa archive.",
    pressure: "Identity is still flexible, so the canon risk is treating a signal as a finished person too early."
  },
  {
    id: "first-memory-pressure",
    title: "First Memory Pressure",
    start: 2013,
    end: 2015,
    teaching: "Early witnesses teach the avatars that personal canon needs review before it can become shared lore.",
    pressure: "A memory that wants to be believed must still carry source, witness, and correction rights."
  },
  {
    id: "skill-formation",
    title: "Skill Formation",
    start: 2016,
    end: 2018,
    teaching: "Abilities become responsibilities; roles begin forming before teams officially assemble.",
    pressure: "Usefulness can hide private cost if no one records who pays for the skill."
  },
  {
    id: "relationship-collision",
    title: "Relationship Collision",
    start: 2019,
    end: 2021,
    teaching: "Backstory turns relational: trust, tension, witness, and repair start binding the ensemble.",
    pressure: "Inter-dimensional flexibility becomes dangerous when relationship consequences are skipped."
  },
  {
    id: "team-gravity",
    title: "Team Gravity",
    start: 2022,
    end: 2024,
    teaching: "The avatars start orbiting teams, ships, Gardens, songs, and cards that make their jobs legible.",
    pressure: "Team utility has to deepen character instead of flattening people into functions."
  },
  {
    id: "ingress-threshold",
    title: "Ingress Threshold",
    start: 2025,
    end: 2026,
    teaching: "The annual journals converge into present-tense ingress and operational responsibility.",
    pressure: "Every avatar arrives with a story, a role, a team, and a future obligation that must remain causal."
  }
];

const args = parseArgs(process.argv.slice(2));
const dryRun = args.has("dry-run") || args.has("no-write");
const now = new Date().toISOString();
const runStamp = now.replace(/[:.]/g, "-");
const batchReportPath = path.join(RUN_DIR, `lorekeeper-life-saga-consolidation-${runStamp}.json`);

await main();

async function main() {
  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(RUN_DIR, { recursive: true });
  await mkdir(TIMELINE_DIR, { recursive: true });
  await mkdir(SUBSCRIBER_DIR, { recursive: true });

  const avatarStore = await readJson(AVATAR_STORE_PATH);
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const sceneStore = normalizeSceneGraph(await readJson(SCENE_STORE_PATH));
  const contract = await readJson(CONTRACT_PATH).catch(() => ({}));
  const lorePlan = await readJson(LORE_PLAN_PATH).catch(() => ({}));
  const songbook = await readJson(SONGBOOK_PATH).catch(() => ({ songCards: [] }));
  const lastLightPacket = await readJson(LAST_LIGHT_PACKET_PATH).catch(() => ({}));
  const timeline = await readJson(LIFE_TIMELINE_PATH);
  const avatars = (avatarStore.avatars || []).filter((avatar) => avatar?.id).map((avatar) => normalizeAvatarCard(avatar));
  if (!avatars.length) throw new Error("No avatars found.");
  if (!Array.isArray(timeline.events) || !timeline.events.length) throw new Error("No avatar life timeline events found.");

  const analysis = buildLorekeeperAnalysis({ avatars, timeline, itemStore, sceneStore, songbook, lastLightPacket });
  const cards = buildConsolidationCards(analysis);
  const epicNarrative = analysis.epicNarrative;
  const nextItemStore = applyCards(itemStore, cards);
  const nextAvatarStore = applyAvatarCrossoverNotes(avatarStore, avatars, analysis);
  const nextSceneStore = applySceneConsolidation(sceneStore, analysis, cards, epicNarrative);
  const nextContract = updateContract(contract, analysis);
  const nextLorePlan = updateLorePlan(lorePlan, analysis, cards);
  const packet = buildConsolidationPacket(analysis, cards);
  const sagaMarkdown = buildSagaMarkdown(analysis, cards);
  const epicMarkdown = buildEpicMarkdown(analysis, cards, epicNarrative);
  const batchReport = {
    schemaVersion: "hapa.lorekeeper-life-saga-consolidation-batch.v1",
    generatedAt: now,
    dryRun,
    source: "scripts/run-lorekeeper-life-saga-consolidation.mjs",
    timelineId: TIMELINE_ID,
    avatarCount: avatars.length,
    timelineEventCount: analysis.events.length,
    yearCount: analysis.yearSummaries.length,
    decadeCount: analysis.decadeSummaries.length,
    eraCount: analysis.eraSummaries.length,
    crossoverCount: analysis.crossovers.length,
    cardCount: cards.length,
    epicCardId: EPIC_CARD_ID,
    canonAuditStatus: analysis.canonAudit.status,
    outputPaths: {
      consolidationPath: path.resolve(CONSOLIDATION_PATH),
      sagaMarkdownPath: path.resolve(SAGA_MARKDOWN_PATH),
      epicMarkdownPath: path.resolve(EPIC_MARKDOWN_PATH),
      wikiSagaPath: WIKI_SAGA_PATH,
      wikiEpicPath: WIKI_EPIC_PATH
    }
  };

  if (!dryRun) {
    await backupStores();
    await writeJson(AVATAR_STORE_PATH, nextAvatarStore);
    await writeJson(ITEM_STORE_PATH, nextItemStore);
    await writeJson(SCENE_STORE_PATH, nextSceneStore);
    await writeJson(CONTRACT_PATH, nextContract);
    await writeJson(LORE_PLAN_PATH, nextLorePlan);
    await writeJson(CONSOLIDATION_PATH, packet);
    await writeJson(batchReportPath, batchReport);
    await writeMarkdown(SAGA_MARKDOWN_PATH, sagaMarkdown);
    await writeMarkdown(EPIC_MARKDOWN_PATH, epicMarkdown);
    await writeMarkdown(WIKI_SAGA_PATH, sagaMarkdown);
    await writeMarkdown(WIKI_EPIC_PATH, epicMarkdown);
    await appendSubscriberEvent("avatar.life-saga-lorekeeper-consolidation-updated", {
      avatarStorePath: path.resolve(AVATAR_STORE_PATH),
      itemStorePath: path.resolve(ITEM_STORE_PATH),
      sceneStorePath: path.resolve(SCENE_STORE_PATH),
      contractPath: path.resolve(CONTRACT_PATH),
      lorePlanPath: path.resolve(LORE_PLAN_PATH),
      timelinePath: path.resolve(LIFE_TIMELINE_PATH),
      consolidationPath: path.resolve(CONSOLIDATION_PATH),
      batchReportPath: path.resolve(batchReportPath),
      sagaMarkdownPath: path.resolve(SAGA_MARKDOWN_PATH),
      epicMarkdownPath: path.resolve(EPIC_MARKDOWN_PATH),
      wikiSagaPath: WIKI_SAGA_PATH,
      wikiEpicPath: WIKI_EPIC_PATH,
      epicCardId: EPIC_CARD_ID,
      cardCount: cards.length,
      crossoverCount: analysis.crossovers.length,
      canonAuditStatus: analysis.canonAudit.status
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    avatarCount: avatars.length,
    timelineEventCount: analysis.events.length,
    yearCount: analysis.yearSummaries.length,
    decadeCount: analysis.decadeSummaries.length,
    eraCount: analysis.eraSummaries.length,
    crossoverCount: analysis.crossovers.length,
    cardCount: cards.length,
    epicCardId: EPIC_CARD_ID,
    canonAuditStatus: analysis.canonAudit.status,
    structuralIssueCount: analysis.canonAudit.structuralIssues.length,
    pressureCount: analysis.canonAudit.canonPressures.length,
    batchReportPath,
    consolidationPath: CONSOLIDATION_PATH,
    epicMarkdownPath: EPIC_MARKDOWN_PATH,
    wikiEpicPath: WIKI_EPIC_PATH
  }, null, 2));
}

function buildLorekeeperAnalysis({ avatars, timeline, itemStore, sceneStore, songbook, lastLightPacket }) {
  const events = (timeline.events || []).slice().sort(compareEvents);
  const avatarById = new Map(avatars.map((avatar) => [avatar.id, avatar]));
  const sourceRefs = [
    AVATAR_STORE_PATH,
    ITEM_STORE_PATH,
    SCENE_STORE_PATH,
    SONGBOOK_PATH,
    LAST_LIGHT_PACKET_PATH,
    LIFE_TIMELINE_PATH
  ];
  const crossovers = buildCrossovers(events, avatarById);
  const yearSummaries = buildYearSummaries(events, crossovers);
  const decadeSummaries = buildDecadeSummaries(yearSummaries);
  const eraSummaries = buildEraSummaries(events, crossovers);
  const canonAudit = auditCanon({ avatars, events, timeline });
  const teamSummaries = buildTeamSummaries(events);
  const epicNarrative = buildEpicNarrative({
    avatars,
    events,
    yearSummaries,
    decadeSummaries,
    eraSummaries,
    teamSummaries,
    canonAudit,
    crossovers,
    lastLightPacket
  });
  return {
    schemaVersion: "hapa.lorekeeper-life-saga-analysis.v1",
    generatedAt: now,
    source: "scripts/run-lorekeeper-life-saga-consolidation.mjs",
    timeline,
    timelineId: timeline.id || TIMELINE_ID,
    sourceRefs,
    avatars,
    avatarById,
    events,
    itemCount: (itemStore.cards || []).length,
    sceneCount: (sceneStore.scenes || []).length,
    songCount: (songbook.songCards || []).length,
    lastLightPacket,
    crossovers,
    yearSummaries,
    decadeSummaries,
    eraSummaries,
    teamSummaries,
    canonAudit,
    epicNarrative,
    narrativeSha256: sha256(epicNarrative)
  };
}

function buildYearSummaries(events, crossovers) {
  return [...groupBy(events, "calendarYear").entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([year, yearEvents], index) => {
      const teamCounts = countBy(yearEvents, "teamTitle");
      const phaseCounts = countValues(yearEvents.map((event) => phaseFromSummary(event.summary)));
      const roles = countBy(yearEvents, "role");
      const yearCrossovers = crossovers.filter((crossover) => crossover.calendarYear === Number(year)).slice(0, 10);
      const dominantTeam = topEntries(teamCounts, 3).map(([team]) => team).join(", ");
      const dominantPhase = topEntries(phaseCounts, 1)[0]?.[0] || "annual canon";
      return {
        id: `life-saga-year-${year}`,
        sequence: index + 1,
        year: Number(year),
        title: `${year}: ${toTitleCase(dominantPhase)}`,
        summary: `${year} consolidates ${yearEvents.length} avatar life-journal events, led by ${dominantTeam || "the shared archive"}, with ${yearCrossovers.length} highlighted crossover links.`,
        dominantPhase,
        eventCount: yearEvents.length,
        avatarIds: unique(yearEvents.map((event) => event.avatarId)),
        avatarNames: unique(yearEvents.map((event) => event.avatarName)).sort(),
        teamCounts: objectFromEntriesSorted(teamCounts),
        phaseCounts: objectFromEntriesSorted(phaseCounts),
        roleCounts: objectFromEntriesSorted(roles),
        crossovers: yearCrossovers,
        canonCheck: yearCanonCheck(yearEvents, yearCrossovers),
        exposition: yearExposition(Number(year), yearEvents, yearCrossovers, dominantPhase, dominantTeam)
      };
    });
}

function buildDecadeSummaries(yearSummaries) {
  return [...groupBy(yearSummaries, (summary) => `${Math.floor(summary.year / 10) * 10}s`).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([decade, summaries], index) => {
      const eventCount = summaries.reduce((total, summary) => total + summary.eventCount, 0);
      const avatarIds = unique(summaries.flatMap((summary) => summary.avatarIds));
      const phaseCounts = mergeCountObjects(summaries.map((summary) => summary.phaseCounts));
      const teamCounts = mergeCountObjects(summaries.map((summary) => summary.teamCounts));
      const crossovers = summaries.flatMap((summary) => summary.crossovers).slice(0, 18);
      return {
        id: `life-saga-decade-${decade}`,
        sequence: index + 1,
        decade,
        title: `${decade}: ${decade === "2010s" ? "Signals Become Roles" : "Threshold Becomes Ingress"}`,
        summary: `${decade} consolidates ${eventCount} events across ${avatarIds.length} avatars, showing how ${topEntries(phaseCounts, 3).map(([phase]) => phase).join(", ")} became team history.`,
        eventCount,
        avatarIds,
        teamCounts,
        phaseCounts,
        crossovers,
        canonCheck: crossovers.length
          ? `${decade} remains structurally consistent; crossover pressure is relational rather than contradictory.`
          : `${decade} has no highlighted crossover gaps beyond source-review pressure.`,
        exposition: `${decade} is where the Lorekeepers stop reading isolated lives and start seeing a coordinated ensemble. ${topEntries(teamCounts, 4).map(([team, count]) => `${team} carries ${count} beats`).join("; ")}.`
      };
    });
}

function buildEraSummaries(events, crossovers) {
  return ERA_DEFS.map((era, index) => {
    const eraEvents = events.filter((event) => Number(event.calendarYear) >= era.start && Number(event.calendarYear) <= era.end);
    const eraCrossovers = crossovers.filter((crossover) => crossover.calendarYear >= era.start && crossover.calendarYear <= era.end).slice(0, 18);
    const teamCounts = countBy(eraEvents, "teamTitle");
    const phaseCounts = countValues(eraEvents.map((event) => phaseFromSummary(event.summary)));
    return {
      ...era,
      sequence: index + 1,
      cardId: `life-saga-era-${era.id}`,
      eventCount: eraEvents.length,
      avatarIds: unique(eraEvents.map((event) => event.avatarId)),
      avatarNames: unique(eraEvents.map((event) => event.avatarName)).sort(),
      teamCounts: objectFromEntriesSorted(teamCounts),
      phaseCounts: objectFromEntriesSorted(phaseCounts),
      crossovers: eraCrossovers,
      canonCheck: eraCanonCheck(era, eraEvents, eraCrossovers),
      exposition: `${era.title} covers ${era.start}-${era.end}. ${era.teaching} ${era.pressure} The most active teams are ${topEntries(teamCounts, 4).map(([team, count]) => `${team} (${count})`).join(", ")}.`
    };
  });
}

function buildTeamSummaries(events) {
  return [...groupBy(events, "teamTitle").entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([teamTitle, teamEvents]) => {
      const roles = countBy(teamEvents, "role");
      const years = unique(teamEvents.map((event) => Number(event.calendarYear))).sort((a, b) => a - b);
      const avatarIds = unique(teamEvents.map((event) => event.avatarId));
      return {
        teamTitle: teamTitle || "Unassigned Team",
        eventCount: teamEvents.length,
        avatarIds,
        yearRange: [years[0], years[years.length - 1]],
        topRoles: topEntries(roles, 5).map(([role, count]) => ({ role, count })),
        summary: `${teamTitle || "Unassigned Team"} contributes ${teamEvents.length} events across ${avatarIds.length} avatars from ${years[0]} to ${years[years.length - 1]}.`
      };
    });
}

function buildCrossovers(events, avatarById) {
  const byAvatarYear = new Map(events.map((event) => [`${event.avatarId}:${event.calendarYear}`, event]));
  const seen = new Set();
  const crossovers = [];
  for (const event of events) {
    for (const reviewerId of event.reviewedAvatarIds || []) {
      const peer = byAvatarYear.get(`${reviewerId}:${event.calendarYear}`);
      if (!peer || peer.avatarId === event.avatarId) continue;
      const pairKey = [event.id, peer.id].sort().join("::");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const score = crossoverScore(event, peer, avatarById);
      const reason = crossoverReason(event, peer);
      crossovers.push({
        id: `crossover-${event.calendarYear}-${event.avatarId}-${peer.avatarId}`,
        schemaVersion: "hapa.lorekeeper-crossover.v1",
        calendarYear: Number(event.calendarYear),
        sourceEventId: event.id,
        targetEventId: peer.id,
        avatarIds: [event.avatarId, peer.avatarId],
        avatarNames: [event.avatarName, peer.avatarName],
        teams: unique([event.teamTitle || "Unassigned Team", peer.teamTitle || "Unassigned Team"]),
        roles: [event.role || "Crew", peer.role || "Crew"],
        phases: [phaseFromSummary(event.summary), phaseFromSummary(peer.summary)],
        summary: `While ${event.avatarName} was ${phaseClause(event)}, ${peer.avatarName} was ${phaseClause(peer)}. This matters because ${reason}`,
        canonUse: "Append as soft-canon crossover context; promote only if later scenes or human review confirm the relationship beat.",
        score,
        createdAt: now,
        updatedAt: now
      });
    }
  }
  return crossovers.sort((a, b) => b.score - a.score || a.calendarYear - b.calendarYear || a.id.localeCompare(b.id));
}

function crossoverScore(left, right, avatarById) {
  let score = 0;
  if (left.calendarYear === 2026) score += 8;
  if (left.calendarYear === 2010) score += 4;
  if (left.teamId && left.teamId === right.teamId) score += 4;
  if (left.teamId && right.teamId && left.teamId !== right.teamId) score += 2;
  if (left.role === "Lead" || right.role === "Lead") score += 2;
  if (/core protocol/i.test(`${left.teamTitle} ${right.teamTitle}`)) score += 3;
  const leftAvatar = avatarById.get(left.avatarId);
  const rightAvatar = avatarById.get(right.avatarId);
  if (avatarLane(leftAvatar) !== avatarLane(rightAvatar)) score += 2;
  return score;
}

function crossoverReason(left, right) {
  if (left.teamId && left.teamId === right.teamId) {
    return `${left.teamTitle} becomes a reciprocal team memory instead of two isolated resumes: ${left.avatarName}'s ${left.role} seat needs ${right.avatarName}'s ${right.role} pressure to make the role believable.`;
  }
  if (/core protocol/i.test(`${left.teamTitle} ${right.teamTitle}`)) {
    return `Core Protocol needs witnesses from outside a single lane; ${left.avatarName}'s story can move only because ${right.avatarName}'s parallel year keeps source, care, or action honest.`;
  }
  return `the peer-review edge lets ${left.avatarName} inherit a witness outside their own center of gravity, while ${right.avatarName} gains a future callback into ${left.teamTitle || "the shared archive"}.`;
}

function auditCanon({ avatars, events, timeline }) {
  const knownAvatarIds = new Set(avatars.map((avatar) => avatar.id));
  const eventIds = new Set();
  const duplicateEventIds = [];
  for (const event of events) {
    if (eventIds.has(event.id)) duplicateEventIds.push(event.id);
    eventIds.add(event.id);
  }
  const structuralIssues = [];
  const canonPressures = [];
  const missingAvatarRefs = events.filter((event) => !knownAvatarIds.has(event.avatarId));
  if (missingAvatarRefs.length) structuralIssues.push(issue("missing-avatar-refs", "Timeline events reference unknown avatars.", missingAvatarRefs.length));
  if (duplicateEventIds.length) structuralIssues.push(issue("duplicate-event-ids", "Timeline includes duplicate event ids.", duplicateEventIds.length));
  const unknownReviewers = [];
  for (const event of events) {
    for (const reviewerId of event.reviewedAvatarIds || []) {
      if (!knownAvatarIds.has(reviewerId)) unknownReviewers.push({ eventId: event.id, reviewerId });
    }
  }
  if (unknownReviewers.length) structuralIssues.push(issue("unknown-reviewers", "Peer-review links reference unknown avatars.", unknownReviewers.length));
  const continuityGaps = [];
  for (const avatar of avatars) {
    const avatarEvents = events.filter((event) => event.avatarId === avatar.id).sort((a, b) => Number(a.lifeYear) - Number(b.lifeYear));
    if (!avatarEvents.length) {
      structuralIssues.push(issue(`missing-events-${avatar.id}`, `${avatar.primaryName || avatar.id} has no timeline events.`, 1));
      continue;
    }
    const maxYear = Math.max(...avatarEvents.map((event) => Number(event.lifeYear)));
    for (let year = 0; year <= maxYear; year += 1) {
      if (!avatarEvents.some((event) => Number(event.lifeYear) === year)) continuityGaps.push({ avatarId: avatar.id, avatarName: avatarName(avatar), lifeYear: year });
    }
    const ingress = avatarEvents.filter((event) => event.relativeYear === "INGRESS");
    if (ingress.length !== 1) continuityGaps.push({ avatarId: avatar.id, avatarName: avatarName(avatar), lifeYear: "INGRESS", count: ingress.length });
    for (const event of avatarEvents) {
      if (Number(event.lifeYear) > 0 && !(event.causalityInputs || []).length) continuityGaps.push({ avatarId: avatar.id, avatarName: avatarName(avatar), eventId: event.id, issue: "missing input" });
      if (Number(event.lifeYear) < maxYear && !(event.causalityOutputs || []).length) continuityGaps.push({ avatarId: avatar.id, avatarName: avatarName(avatar), eventId: event.id, issue: "missing output" });
    }
  }
  if (continuityGaps.length) structuralIssues.push(issue("continuity-gaps", "Avatar life-year continuity has missing years or causality edges.", continuityGaps.length));
  const reviewGaps = events.filter((event) => (event.reviewedAvatarIds || []).length < 2);
  if (reviewGaps.length) structuralIssues.push(issue("review-gaps", "Some events have fewer than two peer reviewers.", reviewGaps.length));

  const duplicateNames = [...groupBy(avatars, (avatar) => avatarName(avatar)).entries()].filter(([, list]) => list.length > 1);
  if (duplicateNames.length) {
    canonPressures.push(issue(
      "duplicate-display-names",
      `Duplicate avatar display names require ID-aware continuity: ${duplicateNames.map(([name, list]) => `${name} (${list.length})`).join(", ")}.`,
      duplicateNames.length
    ));
  }
  const unassigned = events.filter((event) => !event.teamId || !event.teamTitle || event.teamTitle === "Unassigned Team");
  if (unassigned.length) canonPressures.push(issue("unassigned-team-events", "Some annual entries remain in Unassigned Team; treat as staging until team placement is confirmed.", unassigned.length));
  const nonIngressDrafts = events.filter((event) => event.canonStatus !== "personal_canon_ingress" && event.canonStatus !== "personal_canon_draft");
  if (nonIngressDrafts.length) canonPressures.push(issue("unexpected-canon-status", "Some events use canon statuses outside the expected annual journal set.", nonIngressDrafts.length));
  const softStatus = events.filter((event) => event.canonStatus === "personal_canon_draft").length;
  canonPressures.push(issue("soft-canon-majority", `${softStatus} pre-ingress annual entries remain personal-canon drafts until scene play or human review promotes them.`, softStatus));

  return {
    schemaVersion: "hapa.lorekeeper-canon-audit.v1",
    generatedAt: now,
    timelineId: timeline.id || TIMELINE_ID,
    status: structuralIssues.length ? "needs_repair" : "consistent_with_soft_canon_pressure",
    structuralIssues,
    canonPressures,
    duplicateNameClusters: duplicateNames.map(([name, list]) => ({ name, avatarIds: list.map((avatar) => avatar.id) })),
    metrics: {
      avatars: avatars.length,
      events: events.length,
      duplicateEventIds: duplicateEventIds.length,
      unknownReviewers: unknownReviewers.length,
      continuityGaps: continuityGaps.length,
      reviewGaps: reviewGaps.length,
      unassignedEvents: unassigned.length
    }
  };
}

function buildConsolidationCards(analysis) {
  const yearCards = analysis.yearSummaries.map((summary) => buildSagaCard({
    id: summary.id,
    title: `Life Saga Year ${summary.title}`,
    sequence: summary.sequence,
    scope: "year",
    timeframe: String(summary.year),
    summary: summary.summary,
    exposition: summary.exposition,
    canonCheck: summary.canonCheck,
    avatarIds: summary.avatarIds,
    eventIds: summary.crossovers.flatMap((crossover) => [crossover.sourceEventId, crossover.targetEventId]),
    crossovers: summary.crossovers,
    sections: [
      section("Year Overview", summary.exposition),
      section("Teams Active", countLines(summary.teamCounts)),
      section("Phase Mix", countLines(summary.phaseCounts)),
      section("Canon Check", summary.canonCheck),
      section("Crossover Notes", summary.crossovers.slice(0, 5).map((crossover) => crossover.summary).join("\n"))
    ],
    tags: ["life-saga-year", `year-${summary.year}`],
    qualityLevel: summary.eventCount,
    qualityDurability: summary.crossovers.length
  }));
  const decadeCards = analysis.decadeSummaries.map((summary) => buildSagaCard({
    id: summary.id,
    title: `Life Saga Decade ${summary.title}`,
    sequence: 100 + summary.sequence,
    scope: "decade",
    timeframe: summary.decade,
    summary: summary.summary,
    exposition: summary.exposition,
    canonCheck: summary.canonCheck,
    avatarIds: summary.avatarIds,
    eventIds: summary.crossovers.flatMap((crossover) => [crossover.sourceEventId, crossover.targetEventId]),
    crossovers: summary.crossovers,
    sections: [
      section("Decade Overview", summary.exposition),
      section("Teams Active", countLines(summary.teamCounts)),
      section("Phase Mix", countLines(summary.phaseCounts)),
      section("Canon Check", summary.canonCheck),
      section("Crossover Notes", summary.crossovers.slice(0, 8).map((crossover) => crossover.summary).join("\n"))
    ],
    tags: ["life-saga-decade", slugify(summary.decade)],
    qualityLevel: summary.eventCount,
    qualityDurability: summary.crossovers.length
  }));
  const eraCards = analysis.eraSummaries.map((summary) => buildSagaCard({
    id: summary.cardId,
    title: `Life Saga Era: ${summary.title}`,
    sequence: 200 + summary.sequence,
    scope: "era",
    timeframe: `${summary.start}-${summary.end}`,
    summary: `${summary.title} consolidates ${summary.eventCount} events. ${summary.teaching}`,
    exposition: summary.exposition,
    canonCheck: summary.canonCheck,
    avatarIds: summary.avatarIds,
    eventIds: summary.crossovers.flatMap((crossover) => [crossover.sourceEventId, crossover.targetEventId]),
    crossovers: summary.crossovers,
    sections: [
      section("Era Overview", summary.exposition),
      section("Lore Teaching", summary.teaching),
      section("Canon Pressure", summary.pressure),
      section("Teams Active", countLines(summary.teamCounts)),
      section("Crossover Notes", summary.crossovers.slice(0, 8).map((crossover) => crossover.summary).join("\n"))
    ],
    tags: ["life-saga-era", slugify(summary.id)],
    qualityLevel: summary.eventCount,
    qualityDurability: summary.crossovers.length
  }));
  const epicCard = buildEpicCard(analysis, [...yearCards, ...decadeCards, ...eraCards]);
  return [...yearCards, ...decadeCards, ...eraCards, epicCard];
}

function buildSagaCard(input) {
  const title = input.title;
  return {
    id: input.id,
    schemaVersion: "hapa.item-card.v1",
    cardType: "saga_card",
    kind: "system",
    title,
    name: title,
    status: "active",
    canonStatus: "soft_canon",
    summary: input.summary,
    description: `${input.exposition}\n\nCanon check: ${input.canonCheck}`,
    lore: input.exposition,
    utility: ["Lorekeeper consolidation", input.scope, input.timeframe, "Avatar Mind Journal", "Hapa canon education"],
    broadGameMechanics: [
      "year-decade-era consolidation",
      "canon consistency audit",
      "avatar crossover registration",
      "new-reader exposition",
      "soft-canon promotion queue"
    ],
    tags: unique(["lorekeeper-consolidation", "avatar-life-saga", "saga-card", ...input.tags]),
    rank: "Saga",
    quality: {
      rank: "Saga",
      confidence: "generated",
      power: 7,
      complexity: 7,
      reuse: 10,
      risk: 3,
      completeness: 96,
      level: input.qualityLevel,
      durability: input.qualityDurability,
      connectedMediaCount: input.crossovers.length,
      score: input.qualityDurability ? Number((input.qualityLevel / Math.max(1, input.qualityDurability)).toFixed(2)) : input.qualityLevel,
      qualityRank: "Saga",
      updatedAt: now
    },
    locationState: {
      currentSystemName: "Hapa Lore Node",
      state: "lorekeeper-consolidated",
      notes: `${input.scope} consolidation for ${input.timeframe}`
    },
    connections: {
      avatarIds: input.avatarIds,
      sceneIds: ["scene-lorekeeper-ingress-chronicle-table"],
      itemIds: [EPIC_CARD_ID],
      eventIds: input.eventIds
    },
    mediaPrompts: promptsForCard(title, input.summary),
    sourceRefs: sourceRefsForConsolidation(),
    mediaAssets: [],
    tarotCard: cardDetails({
      mainType: "saga_card",
      title,
      rank: "Saga",
      sequence: input.sequence,
      scope: input.scope,
      timeframe: input.timeframe,
      summary: input.summary,
      exposition: input.exposition,
      canonCheck: input.canonCheck,
      sections: input.sections,
      avatarIds: input.avatarIds,
      crossovers: input.crossovers
    }),
    history: [{
      label: "Lorekeeper life saga consolidation",
      eventId: `history-${input.id}-${runStamp}`,
      happenedAt: now,
      notes: `${title} generated from ${LIFE_TIMELINE_PATH}.`
    }],
    createdAt: now,
    updatedAt: now
  };
}

function buildEpicCard(analysis, sagaCards) {
  const title = "Avatar Ingress Chronicle";
  const sections = [
    section("Five Page Reader Brief", analysis.epicNarrative),
    section("Canon Audit", canonAuditText(analysis.canonAudit)),
    section("Era Cards", analysis.eraSummaries.map((era) => `${era.title}: ${era.eventCount} events, ${era.crossovers.length} crossover notes.`).join("\n")),
    section("Team Starts", analysis.teamSummaries.slice(0, 10).map((team) => team.summary).join("\n")),
    section("Saga Inputs", sagaCards.map((card) => card.title).join("\n"))
  ];
  return {
    id: EPIC_CARD_ID,
    schemaVersion: "hapa.item-card.v1",
    cardType: "epic_card",
    kind: "system",
    title,
    name: title,
    status: "active",
    canonStatus: "soft_canon",
    summary: `A five-page Lorekeeper exposition card that catches a brand new reader up on ${analysis.avatars.length} avatars, ${analysis.events.length} annual journal beats, and their ingress into teams, songs, cards, and causality.`,
    description: analysis.epicNarrative,
    lore: analysis.epicNarrative,
    utility: ["new-reader onboarding", "Lorekeeper epic", "Avatar Genesis context", "canon consistency briefing"],
    broadGameMechanics: ["reader catch-up", "ensemble exposition", "canon audit", "saga-card index", "future scene seed"],
    tags: ["lorekeeper-consolidation", "avatar-ingress-chronicle", "epic-card", "new-reader-brief", "avatar-life-saga"],
    rank: "Epic",
    quality: {
      rank: "Epic",
      confidence: "generated",
      power: 10,
      complexity: 9,
      reuse: 10,
      risk: 4,
      completeness: 98,
      level: analysis.events.length,
      durability: analysis.crossovers.length,
      connectedMediaCount: sagaCards.length,
      score: Number((analysis.events.length / Math.max(1, analysis.crossovers.length)).toFixed(2)),
      qualityRank: "Epic",
      updatedAt: now
    },
    locationState: {
      currentSystemName: "Hapa Lore Node",
      state: "epic-reader-brief",
      notes: `Narrative sha256:${analysis.narrativeSha256}`
    },
    connections: {
      avatarIds: analysis.avatars.map((avatar) => avatar.id),
      sceneIds: ["scene-lorekeeper-ingress-chronicle-table"],
      itemIds: sagaCards.map((card) => card.id),
      eventIds: analysis.events.map((event) => event.id)
    },
    mediaPrompts: promptsForCard(title, "The ensemble arrives at ingress with journals, teams, songs, cards, and a visible causality board."),
    sourceRefs: sourceRefsForConsolidation(),
    mediaAssets: [],
    tarotCard: cardDetails({
      mainType: "epic_card",
      title,
      rank: "Epic",
      sequence: 999,
      scope: "epic",
      timeframe: "2010-2026",
      summary: `The full exposition spine for the Avatar Life Saga leading into ingress on 2026-06-21.`,
      exposition: analysis.epicNarrative,
      canonCheck: canonAuditText(analysis.canonAudit),
      sections,
      avatarIds: analysis.avatars.map((avatar) => avatar.id),
      crossovers: analysis.crossovers.slice(0, 30)
    }),
    history: [{
      label: "Lorekeeper epic consolidation",
      eventId: `history-${EPIC_CARD_ID}-${runStamp}`,
      happenedAt: now,
      notes: `${title} generated as the five-page reader brief from the Avatar Life Journal Timeline.`
    }],
    createdAt: now,
    updatedAt: now
  };
}

function cardDetails({ mainType, title, rank, sequence, scope, timeframe, summary, exposition, canonCheck, sections, avatarIds, crossovers }) {
  return {
    schemaVersion: "hapa.tarot-card-details.v1",
    mainType,
    title,
    subtitle: `${rank} Card`,
    archetype: "Lorekeeper consolidation",
    keywords: ["lorekeeper", "avatar life saga", "canon audit", "crossover", scope, timeframe],
    flavorText: "Inter-dimensional flexibility is allowed; causality still has to answer to witness.",
    effectTitle: `${rank} Consolidation Effect`,
    effectText: "Read before promoting personal canon, drafting scenes, or onboarding a new reader into Hapa's ensemble start.",
    catalog: {
      collectionId: COLLECTION_ID,
      collectionTitle: "Avatar Life Lorekeeper Consolidation",
      family: "Avatar Life Saga",
      typeLabel: `${rank} Card`,
      sequence,
      sourceFolder: path.resolve(TIMELINE_DIR),
      sourceHash: sha256(`${title}:${summary}:${canonCheck}`),
      pairingKey: slugify(title),
      confidence: "generated"
    },
    identity: {
      systemName: "Hapa Lore System",
      deckName: "Avatar Life Saga",
      arcana: `${rank} Canon`,
      tarotType: title,
      tarotCardName: title,
      printedTitle: title,
      displayTitle: title,
      functionalType: rank,
      functionalTypeSlug: slugify(rank),
      cardTypeName: `${rank} Card`,
      typeStack: unique([rank, mainType, scope, timeframe, COLLECTION_ID]),
      confidence: "generated"
    },
    cardFace: {
      titleLine: title,
      subtitleLine: `${rank} / ${scope} / ${timeframe}`,
      typeLine: `${rank} Lorekeeper Card`,
      keywordLine: ["journal", "timeline", "canon", "crossover"].join(" / "),
      coreMeaning: summary,
      uprightText: exposition,
      mechanicsText: "Use as source-grounded ensemble exposition. Check structural issues first, then use canon pressures as scene fuel.",
      sections
    },
    attribution: {
      author: "Calder + Codex Lorekeepers",
      shop: "Hapa Lore Node",
      albumTitle: "Dear Papa",
      rightsStatus: "operator_authored_hapa_creative_commons",
      sourceTool: "Codex Lorekeeper Life Saga Consolidation pass",
      sourcePaths: [LIFE_TIMELINE_PATH, AVATAR_STORE_PATH, ITEM_STORE_PATH, SCENE_STORE_PATH, LAST_LIGHT_PACKET_PATH],
      notes: `Generated ${now}; narrative/canon consolidation remains soft-canon until human promotion.`
    },
    mechanics: {
      broadGameMechanic: "Lorekeeper reads personal-canon journals, checks continuity, appends crossovers, and creates Saga/Epic onboarding cards.",
      deckUse: "Draw before scene writing, Avatar Genesis reruns, or Mind Journal canon promotion.",
      surfaceUse: "Place in the center of the board to connect avatars by year, era, team, and reviewed crossover edges.",
      relationshipUse: "Use crossover notes to decide which avatars should matter to each other before the next scene starts.",
      skillUse: "Use for canon audit, source provenance, new-reader exposition, and story planning.",
      effects: ["creates consolidated Saga/Epic context", "surfaces canon pressure", "adds crossover notes to Avatar Mind"],
      limits: ["soft canon unless human-promoted", "duplicate display names must be resolved by avatarId", "unassigned teams remain staging pressure"],
      procedures: ["read annual journals", "group by year/decade/era", "audit causality", "append crossovers", "write saga cards", "write epic brief"],
      actions: ["review", "consolidate", "audit", "append", "onboard"],
      resources: ["Avatar Mind Journal", "The Last Light Archive", "Dear Papa Songbook", "Hapa Scene Graph"]
    },
    lore: {
      summary,
      canonStatus: "soft_canon",
      characterHooks: crossovers.slice(0, 12).map((crossover) => crossover.summary),
      relationshipHooks: crossovers.slice(0, 12).map((crossover) => crossover.canonUse),
      protocolTeaching: "Personal canon can be inter-dimensional, but shared saga needs source, witness, causality, and explicit pressure labels.",
      futureSeed: "Use these cards to stage the first ensemble scenes after ingress.",
      visualLanguage: ["neonblade timeline", "year nodes", "reviewer links", "RGB archive light", "Dear Papa waveform"],
      sourceClaims: [summary, canonCheck]
    },
    typeDetails: {
      label: `${rank} Card Details`,
      tarotType: title,
      functionalType: rank,
      functionalTypeSlug: slugify(rank),
      role: "Lorekeeper consolidation card",
      focus: summary,
      command: "Get a new reader caught up without erasing source pressure or causality.",
      procedureFlow: ["year grouping", "decade grouping", "era grouping", "canon audit", "crossover append", "epic exposition"],
      actions: ["read", "teach", "stage", "promote-with-review"],
      resources: [LIFE_TIMELINE_PATH, CONSOLIDATION_PATH, EPIC_MARKDOWN_PATH],
      sections
    },
    songLinks: [],
    sceneLinks: [{
      id: `scene-link-${slugify(title)}-lorekeeper-ingress-table`,
      sceneId: "scene-lorekeeper-ingress-chronicle-table",
      sceneTitle: "Lorekeeper Ingress Chronicle Table",
      why: "The table scene is where the Saga and Epic cards are read, challenged, and used to set future story obligations.",
      confidence: "generated",
      createdAt: now,
      updatedAt: now
    }],
    avatarLoreLinks: avatarIds.slice(0, 80).map((avatarId) => ({
      id: `avatar-lore-${slugify(title)}-${avatarId}`,
      avatarId,
      cardId: slugify(title),
      whyChosen: "Lorekeeper consolidation links this avatar to the shared life-saga timeline.",
      canonReason: "Soft-canon generated from annual journal entries and peer-review edges.",
      sourcePath: LIFE_TIMELINE_PATH,
      confidence: "generated",
      createdAt: now,
      updatedAt: now
    })),
    mediaLinks: [],
    ocr: {
      engine: "lorekeeper-timeline-reader",
      confidence: 1,
      rawText: `${title}\n${summary}\n${canonCheck}`,
      lines: [title, summary, canonCheck].map((text) => ({ text, confidence: 1 })),
      parsedAt: now,
      refreshedAt: now,
      sourceImagePaths: [],
      sourceVideoPaths: [],
      sourceFramePaths: [],
      sourceMediaUris: [LIFE_TIMELINE_PATH],
      sources: [{
        id: "avatar-life-canon-timeline",
        kind: "timeline_json",
        path: LIFE_TIMELINE_PATH,
        confidence: 1,
        lineCount: 0,
        text: summary
      }]
    }
  };
}

function buildEpicNarrative({ avatars, events, yearSummaries, decadeSummaries, eraSummaries, teamSummaries, canonAudit, crossovers, lastLightPacket }) {
  const topTeams = teamSummaries.slice(0, 8);
  const originYears = yearSummaries.slice(0, 3);
  const thresholdYears = yearSummaries.slice(-2);
  const exampleCrossovers = crossovers.slice(0, 14);
  const canonLine = lastLightPacket?.canonLine || "Nothing loved is truly lost, but Love must keep learning the Truth about what found means.";
  const thesis = lastLightPacket?.thesis || "Dear Papa operates as a damaged ritual archive where songs, cards, and avatars keep returning to what must be moved, remembered, and carried.";
  const pages = [
    [
      "Page One: The Archive Opens",
      `A new reader enters Hapa at the moment called ingress: June 21, 2026. The board already looks alive. Cards are not only pictures, songs are not only tracks, and avatars are not only character sheets. Hapa is a working story system where people, protocols, media, Gardens, ships, and memories become tools for making causality visible. The Avatar Mind Journal pass created ${events.length} annual journal entries across ${avatars.length} avatars, and the Lorekeepers have now read those entries as one ensemble timeline instead of isolated biographies.`,
      `The first rule is generous but demanding: Hapa is inter-dimensional, so a life can begin as a signal, a future echo, a Garden copy, a song memory, a ship assignment, or a Tarot card pressure. That flexibility is not a license to skip cause. Every avatar year now has a previous or next causal edge, every ingress has a role, and every personal-canon entry names peers who reviewed it before the avatar lets it become part of their foundation.`,
      `The emotional engine comes from ${thesis} The Last Light Archive gives the ensemble its central vow: ${canonLine} In practical terms, love is not proof by itself. It has to keep learning. Red asks what must move. Blue asks what is true. Green asks who must be carried and how repair survives after the door opens.`,
      `That is why the journals are written as years of life rather than one biography paragraph per avatar. Backstory is not trivia here. It is the pressure that explains why an avatar can sit on a team, hold a role, choose a song, draw a card, protect a boundary, or refuse a tempting shortcut. A new reader should not memorize all ${avatars.length} names at once. They should understand the grammar: each person arrives with a wound, a skill, a team obligation, and a witness chain.`
    ],
    [
      "Page Two: Years Become Sagas",
      `The early years, ${originYears.map((year) => year.year).join(", ")}, are not childhood in the ordinary sense. They are origin signals. ${originYears.map((year) => year.summary).join(" ")} The Lorekeepers treat these years as first contact between identity and archive: names begin to stabilize, but no one is allowed to pretend the first signal is the whole person.`,
      `By the middle years, the timeline starts teaching skill as consequence. ${eraSummaries.slice(1, 3).map((era) => `${era.title} says: ${era.teaching}`).join(" ")} A skill in Hapa is not a badge. It is the thing an avatar can be trusted to do under pressure, and the thing that might hurt them if the team takes it for granted. This is where leads learn the cost of command, scouts learn that discovery can endanger people, archivists learn that records can over-clean a witness, and support roles learn that usefulness can turn into invisibility.`,
      `The decade view confirms the pattern. ${decadeSummaries.map((decade) => decade.summary).join(" ")} The 2010s make signals into roles; the 2020s make roles answer to teams. There are no blocking structural breaks in the timeline audit, which matters because the system can now safely use the annual journals as a source packet. ${canonPressureNarrative(canonAudit)}`,
      `This is also where crossovers begin doing real narrative work. ${exampleCrossovers.slice(0, 4).map((crossover) => crossover.summary).join(" ")} These are not random mentions. They tell writers and Genesis agents which lives were already touching before the characters knew how to explain the connection.`
    ],
    [
      "Page Three: Teams Become Gravity",
      `By the time the timeline reaches team gravity, the ensemble stops looking like a list and starts looking like an operating system. ${topTeams.map((team) => team.summary).join(" ")} Each team gives a different reason for existing. Core Protocol Team holds the review table. Red Team turns pressure into protected action. Blue Team preserves source, route, and uncertainty. Green Team makes repair and cultivation operational. Artifact Away Team carries risk into fieldwork. Old Earth Recruits, Black Horizon groups, and the Colonial Navy widen the setting so Hapa does not collapse into one room.`,
      `Roles matter because they translate emotion into duty. A Lead does not merely lead; they carry the burden of moving when delay would hurt someone. A Strategist does not merely plan; they preserve enough future to keep the present from becoming a trap. An Anchor keeps the personhood of the team from dissolving under mission pressure. A Scout makes discovery useful without pretending maps are harmless. Archivists and Specialists keep source, memory, and application braided together.`,
      `The crossover notes deepen this team gravity. ${exampleCrossovers.slice(4, 9).map((crossover) => crossover.summary).join(" ")} The useful reading is not that every avatar already knows every other avatar intimately. The useful reading is that personal canon has peer-review seams. When one avatar arrives at a role, another avatar's same-year pressure explains why the first role cannot be played as a solo destiny.`,
      `Hapa's drama comes from that interdependence. Red can be right about motion and still wrong about timing. Blue can be right about uncertainty and still wrong to freeze. Green can be right about care and still wrong to disappear into labor. Teams exist because no single lane can keep love, truth, and repair honest alone.`
    ],
    [
      "Page Four: The Last Light, Songs, and Cards",
      `The Last Light Archive enters as the emotional and procedural memory layer. Dear Papa songs are living archive entities: they carry vibe, proof, recurrence, and future obligation. When an avatar chooses a song, the question is no longer simply whether the song matches their mood. The question is what the song remembers, what it permits, what it cannot prove, and what future scene it forces the avatar to answer for.`,
      `Tarot and protocol cards work the same way. Mimi's Card Shop and the Hapa card schemas let images, videos, OCR, mechanics, attribution, and lore become playable. A card can be a relationship pressure, a skill, a protocol, a place, a ship, a saga, or an epic. The Lorekeeper consolidation creates Saga Cards by year, decade, and era so the board can show not just who is present, but why the present has weight.`,
      `The canon audit is intentionally visible. ${canonAuditText(canonAudit)} The Lorekeepers found no structural continuity break that blocks use of the timeline. ${canonPressureWriterNote(canonAudit)} This keeps the system honest without making the story brittle.`,
      `The most important practical result is that crossovers have now been appended back into Avatar Mind context. A future Genesis agent can look at an avatar and see not only "what happened to me," but "who was becoming relevant to me at the same time." ${exampleCrossovers.slice(9, 12).map((crossover) => crossover.summary).join(" ")}`
    ],
    [
      "Page Five: Where Everyone Starts Now",
      `Ingress is the starting line for a new reader. The avatars arrive today with pasts that are comprehensive enough to support drama and loose enough to keep discovery alive. ${thresholdYears.map((year) => year.summary).join(" ")} At ingress, the journals stop being backstory and become responsibilities: teams form, roles become active, cards can be drawn, songs can be played, and scenes can finally test whether the person can live up to the reason they were written.`,
      `The reader should understand Hapa as a causality theater. The surface is a neon board of cards, media, avatars, songs, and connectors. Underneath it is a provenance engine asking who made a claim, who witnessed it, what it changed, and whether it can be repaired if wrong. That is why the Lorekeepers consolidated by year, decade, and era: the story needs a beautiful entrance, but the system needs traceable pressure.`,
      `For the Core Protocol triad, Red, Blue, and Green are not just colors. They are checks on one another. Red says action has a moral cost when inaction would abandon someone. Blue says truth has a moral cost when certainty would erase a person. Green says care has a moral cost when rescue would become ownership. The ensemble grows around that triad, with every team adding a different way of testing the same oath.`,
      `What happens next should be scene-driven. Use the Saga Cards to choose a year, decade, or era. Use the Epic Card to orient the reader. Use the crossover notes to decide who needs to meet, argue, recognize, protect, or revise each other. Then let the avatars continue: journaling, choosing songs, drawing cards, forming relationships, taking responsibilities, and proving that an inter-dimensional story can stay emotionally true because its causes are recorded.`
    ]
  ];
  return pages.map(([heading, ...paragraphs]) => `## ${heading}\n\n${paragraphs.join("\n\n")}`).join("\n\n");
}

function applyCards(itemStore, cards) {
  const cardIds = new Set(cards.map((card) => card.id));
  return normalizeItemManagerStore({
    ...itemStore,
    cards: [...(itemStore.cards || []).filter((card) => !cardIds.has(card.id)), ...cards],
    updatedAt: now
  });
}

function applyAvatarCrossoverNotes(avatarStore, avatars, analysis) {
  const crossoversByAvatar = new Map();
  for (const crossover of analysis.crossovers) {
    for (const avatarId of crossover.avatarIds) {
      crossoversByAvatar.set(avatarId, [...(crossoversByAvatar.get(avatarId) || []), crossover]);
    }
  }
  return {
    ...avatarStore,
    avatars: (avatarStore.avatars || []).map((avatar) => {
      const normalized = normalizeAvatarCard(avatar);
      const selected = selectAvatarCrossovers(normalized.id, crossoversByAvatar.get(normalized.id) || []);
      const contextEntries = selected.map((crossover) => crossoverContextForAvatar(normalized, crossover));
      const memoryEntries = selected.map((crossover) => crossoverMemoryForAvatar(normalized, crossover));
      const selfFact = {
        id: `life-saga-crossover-fact-${normalized.id}`,
        label: "Lorekeeper crossover canon",
        value: `${avatarName(normalized)} has ${selected.length} highlighted cross-avatar timeline notes from the Lorekeeper life-saga consolidation. These are soft-canon scene seeds until played, reviewed, or promoted.`,
        classification: "soft_canon",
        confidence: "generated",
        visibility: "shared",
        source: CONSOLIDATION_PATH,
        status: "active",
        createdAt: now,
        updatedAt: now
      };
      const mind = normalized.mind || {};
      return normalizeAvatarCard({
        ...normalized,
        mind: {
          ...mind,
          personaAnchor: {
            ...(mind.personaAnchor || {}),
            carriedForward: appendSentence(mind.personaAnchor?.carriedForward, "Lorekeeper consolidation now links personal canon to year/decade/era Saga Cards and cross-avatar witness notes."),
            updatedAt: now
          },
          selfKnowledge: mergeById([...(mind.selfKnowledge || []), selfFact]),
          contextMap: mergeById([...(mind.contextMap || []), ...contextEntries]),
          memoryLedger: mergeById([...(mind.memoryLedger || []), ...memoryEntries], "memoryId"),
          updatedAt: now
        },
        updatedAt: now
      });
    }),
    lorekeeperLifeSagaRun: {
      schemaVersion: "hapa.lorekeeper-life-saga-run.v1",
      runId: `lorekeeper-life-saga-${runStamp}`,
      status: "complete",
      completedAt: now,
      consolidationPath: path.resolve(CONSOLIDATION_PATH),
      epicCardId: EPIC_CARD_ID,
      crossoverCount: analysis.crossovers.length
    },
    updatedAt: now
  };
}

function applySceneConsolidation(sceneStore, analysis, cards, epicNarrative) {
  const graph = normalizeSceneGraph(sceneStore);
  const avatarIds = analysis.avatars.map((avatar) => avatar.id);
  const sagaCardIds = cards.filter((card) => card.cardType === "saga_card").map((card) => card.id);
  const volume = {
    id: "volume-avatar-ingress-chronicle",
    title: "Avatar Ingress Chronicle",
    volumeNumber: 4,
    seasonTitle: "Avatar Genesis Season 1",
    quickPitch: "Lorekeepers consolidate annual Avatar Mind journals into year, decade, and era Saga Cards plus one Epic reader brief.",
    episodeIds: ["episode-lorekeeper-life-saga-consolidation"],
    archivistAgent: {
      avatarId: "avatar-16",
      avatarName: "Red-Thu",
      role: "Lorekeeper / Archivist consolidator",
      cadence: "after life-journal, card, song, or scene Genesis passes",
      loreInstruction: "Group by year, decade, and era; check canon pressure; append useful crossovers; keep all outputs source-traceable."
    },
    screenplayPitch: "The avatars gather around the timeline table and watch their separate life journals become one playable ensemble saga.",
    screenplayPrompt: "Write the Avatar Ingress Chronicle as a luminous but source-grounded Hapa opener. Teach the reader the triad, the teams, the card/song system, and the causality rule.",
    canonConsolidationPlan: "Use Saga Cards for granular timeline education and the Epic Card as the five-page new-reader onboarding spine.",
    summary: `Consolidates ${analysis.events.length} annual journal events, ${analysis.crossovers.length} crossover notes, and ${cards.length} Saga/Epic cards.`,
    overallNarrative: "Personal canon becomes shared saga when every avatar's backstory is read through source, witness, team role, and causality.",
    episodeSummaries: [{
      episodeId: "episode-lorekeeper-life-saga-consolidation",
      title: "The Timeline Learns Everyone",
      quickPitch: "Lorekeepers audit the life-journal timeline and turn it into Saga/Epic cards.",
      sceneCount: 1,
      avatarCount: analysis.avatars.length
    }],
    screenplayOutline: [
      "Open on a table of annual journal nodes.",
      "Lorekeepers group years into decades and eras.",
      "Canon issues are split into structural blockers and useful pressure.",
      "Crossover links appear between avatars.",
      "The Epic Card is read as the reader's first full orientation."
    ],
    screenplayDraft: epicNarrative,
    canonDeltas: [
      { id: "delta-life-saga-cards", summary: `${sagaCardIds.length} Saga Cards now index the life timeline.`, sourcePath: CONSOLIDATION_PATH, confidence: "generated" },
      { id: "delta-ingress-epic-card", summary: "Avatar Ingress Chronicle now acts as the new-reader Epic Card.", sourcePath: EPIC_MARKDOWN_PATH, confidence: "generated" },
      { id: "delta-crossover-contexts", summary: `${analysis.crossovers.length} crossover links were considered; top notes were appended to Avatar Mind context maps.`, sourcePath: CONSOLIDATION_PATH, confidence: "generated" }
    ],
    relationshipCollisions: analysis.crossovers.slice(0, 12).map((crossover) => crossover.summary),
    placesFeatured: ["place-last-light-archive-stacks"],
    artifactPaths: [path.resolve(CONSOLIDATION_PATH), path.resolve(SAGA_MARKDOWN_PATH), path.resolve(EPIC_MARKDOWN_PATH), WIKI_EPIC_PATH],
    canonStatus: "soft_canon",
    status: "done",
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };
  const episode = {
    id: "episode-lorekeeper-life-saga-consolidation",
    title: "The Timeline Learns Everyone",
    volumeId: volume.id,
    episodeNumber: 1,
    quickPitch: "Year, decade, and era cards let the ensemble backstory become navigable.",
    overallNarrative: "The Lorekeepers read the Avatar Mind journals aloud, challenge the canon pressure, and decide which crossovers belong in personal canon.",
    settingTimeline: "after Avatar Mind Journal Genesis pass",
    expositionGoal: "Teach the new reader how Hapa starts: annual journals, teams, roles, songs, cards, canon audit, and ingress.",
    mechanicsTaught: ["life-journal timeline", "canon audit", "crossover append", "Saga/Epic cards"],
    managementSkills: ["source review", "knowledge synthesis", "continuity triage"],
    avatarIds,
    sceneIds: ["scene-lorekeeper-ingress-chronicle-table"],
    placeIds: ["place-last-light-archive-stacks"],
    canonStatus: "soft_canon",
    status: "done",
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };
  const maxOrder = Math.max(0, ...(graph.scenes || []).map((scene) => Number(scene.canonicalTime?.order || 0)));
  const scene = {
    id: "scene-lorekeeper-ingress-chronicle-table",
    title: "Lorekeeper Ingress Chronicle Table",
    placeId: "place-last-light-archive-stacks",
    episodeId: episode.id,
    volumeId: volume.id,
    summary: "Lorekeepers consolidate the annual Avatar Mind journals into Saga Cards and one Epic reader brief.",
    quickPitch: "The whole cast's starts become visible at once.",
    overallNarrative: "Every avatar's life nodes glow on a shared table; year, decade, and era cards stack into the Epic Card that catches a new reader up.",
    narrativeText: "The table does not flatten the cast. It shows why each person arrives with a role, a witness, a song, a card, and a causal obligation.",
    expositionBeats: analysis.eraSummaries.map((era) => `${era.title}: ${era.teaching}`),
    actionBeats: ["Saga cards are dealt by year.", "Crossover lines light up.", "The Epic Card opens as a reader brief."],
    characterGrowth: ["Avatars learn that personal canon becomes stronger when witnessed and contextualized."],
    learningObjectives: ["Read Saga Cards", "Check canon pressure", "Use crossovers as scene seeds"],
    hapaMechanics: ["Lorekeeper consolidation", "Avatar Mind Journal", "Epic Card onboarding"],
    managementSkills: ["canon triage", "timeline synthesis", "source provenance"],
    avatarIds,
    itemCardRefs: [EPIC_CARD_ID, ...sagaCardIds.slice(0, 24)],
    canonEventIds: ["event-lorekeeper-life-saga-consolidation"],
    tags: ["scene", "lorekeeper", "avatar-life-saga", "epic-card"],
    canonicalTime: { timelineId: "canonical-timeline", order: maxOrder + 1, label: "Lorekeeper Life Saga 001" },
    playlist: [],
    nodes: cards.slice(0, 24).map((card) => ({ id: `node-${card.id}`, type: "lore-card", label: card.title, cardId: card.id })),
    canonStatus: "soft_canon",
    status: "done",
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };
  graph.volumes = mergeById([...(graph.volumes || []).filter((item) => item.id !== volume.id), volume]);
  graph.episodes = mergeById([...(graph.episodes || []).filter((item) => item.id !== episode.id), episode]);
  graph.scenes = mergeById([...(graph.scenes || []).filter((item) => item.id !== scene.id), scene]);
  graph.updatedAt = now;
  return normalizeSceneGraph(graph);
}

function updateContract(contract, analysis) {
  return {
    ...contract,
    lorekeeperLifeSagaConsolidationProtocol: {
      schemaVersion: "hapa.lorekeeper-life-saga-protocol.v1",
      id: "lorekeeper-life-saga-consolidation-protocol",
      timelineId: TIMELINE_ID,
      epicCardId: EPIC_CARD_ID,
      requiredOutputs: [
        "year_saga_cards",
        "decade_saga_cards",
        "era_saga_cards",
        "canon_consistency_audit",
        "avatar_crossover_contexts",
        "five_page_epic_reader_brief"
      ],
      sourceRefs: [LIFE_TIMELINE_PATH, AVATAR_STORE_PATH, ITEM_STORE_PATH, SCENE_STORE_PATH, LAST_LIGHT_PACKET_PATH],
      canonRule: "Inter-dimensional flexibility is valid only when source, witness, causality, and pressure labels remain visible.",
      updatedAt: now
    },
    updatedAt: now
  };
}

function updateLorePlan(lorePlan, analysis, cards) {
  return {
    ...lorePlan,
    goalStatus: "lorekeeper_life_saga_consolidation_complete",
    lorekeeperLifeSagaConsolidation: {
      schemaVersion: "hapa.lorekeeper-life-saga-plan.v1",
      timelineId: TIMELINE_ID,
      epicCardId: EPIC_CARD_ID,
      generatedCardIds: cards.map((card) => card.id),
      yearCount: analysis.yearSummaries.length,
      decadeCount: analysis.decadeSummaries.length,
      eraCount: analysis.eraSummaries.length,
      crossoverCount: analysis.crossovers.length,
      canonAuditStatus: analysis.canonAudit.status,
      consolidationPath: path.resolve(CONSOLIDATION_PATH),
      sagaMarkdownPath: path.resolve(SAGA_MARKDOWN_PATH),
      epicMarkdownPath: path.resolve(EPIC_MARKDOWN_PATH),
      wikiSagaPath: WIKI_SAGA_PATH,
      wikiEpicPath: WIKI_EPIC_PATH,
      completedAt: now
    },
    consolidationHistory: [
      ...(Array.isArray(lorePlan.consolidationHistory) ? lorePlan.consolidationHistory : []),
      {
        id: `consolidation-lorekeeper-life-saga-${runStamp}`,
        type: "lorekeeper-life-saga-consolidation",
        summary: `Generated ${cards.length} Saga/Epic cards, audited ${analysis.events.length} annual events, and appended Avatar Mind crossover context.`,
        epicCardId: EPIC_CARD_ID,
        consolidationPath: path.resolve(CONSOLIDATION_PATH),
        confidence: "generated",
        completedAt: now
      }
    ],
    updatedAt: now
  };
}

function buildConsolidationPacket(analysis, cards) {
  return {
    schemaVersion: "hapa.lorekeeper-life-saga-consolidation.v1",
    id: "lorekeeper-life-saga-consolidation",
    generatedAt: now,
    source: "scripts/run-lorekeeper-life-saga-consolidation.mjs",
    timelineId: TIMELINE_ID,
    collectionId: COLLECTION_ID,
    epicCardId: EPIC_CARD_ID,
    sourceRefs: analysis.sourceRefs,
    counts: {
      avatars: analysis.avatars.length,
      events: analysis.events.length,
      years: analysis.yearSummaries.length,
      decades: analysis.decadeSummaries.length,
      eras: analysis.eraSummaries.length,
      crossovers: analysis.crossovers.length,
      cards: cards.length
    },
    canonAudit: analysis.canonAudit,
    yearSummaries: analysis.yearSummaries,
    decadeSummaries: analysis.decadeSummaries,
    eraSummaries: analysis.eraSummaries,
    teamSummaries: analysis.teamSummaries,
    crossovers: analysis.crossovers,
    cards: cards.map((card) => ({ id: card.id, title: card.title, cardType: card.cardType, rank: card.rank, summary: card.summary })),
    epicNarrative: analysis.epicNarrative,
    narrativeSha256: analysis.narrativeSha256
  };
}

function buildSagaMarkdown(analysis, cards) {
  const sagaCards = cards.filter((card) => card.cardType === "saga_card");
  return `# Avatar Life Saga Cards

Generated: ${now}
Timeline: ${TIMELINE_ID}

## Canon Audit

${canonAuditText(analysis.canonAudit)}

## Year Cards

${analysis.yearSummaries.map((summary) => `- ${summary.id}: ${summary.summary}`).join("\n")}

## Decade Cards

${analysis.decadeSummaries.map((summary) => `- ${summary.id}: ${summary.summary}`).join("\n")}

## Era Cards

${analysis.eraSummaries.map((summary) => `- ${summary.cardId}: ${summary.exposition}`).join("\n")}

## Highlight Crossovers

${analysis.crossovers.slice(0, 40).map((crossover) => `- ${crossover.summary}`).join("\n")}

## Generated Saga Card Ids

${sagaCards.map((card) => `- ${card.id} - ${card.title}`).join("\n")}
`;
}

function buildEpicMarkdown(analysis, cards, epicNarrative) {
  const epicCard = cards.find((card) => card.id === EPIC_CARD_ID);
  return `# Avatar Ingress Chronicle

Generated: ${now}
Epic card: ${epicCard?.id || EPIC_CARD_ID}
Timeline: ${TIMELINE_ID}
Narrative sha256: ${analysis.narrativeSha256}

## Reader Brief

${epicNarrative}

## Canon Audit

${canonAuditText(analysis.canonAudit)}

## Generated Cards

${cards.map((card) => `- ${card.id}: ${card.title}`).join("\n")}
`;
}

function selectAvatarCrossovers(avatarId, crossovers) {
  const byPeer = new Map();
  for (const crossover of crossovers) {
    const peerId = crossover.avatarIds.find((id) => id !== avatarId) || "";
    const existing = byPeer.get(peerId);
    if (!existing || crossoverPriority(crossover) > crossoverPriority(existing)) byPeer.set(peerId, crossover);
  }
  return [...byPeer.values()].sort((a, b) => crossoverPriority(b) - crossoverPriority(a) || a.calendarYear - b.calendarYear).slice(0, 3);
}

function crossoverPriority(crossover) {
  return crossover.score + (crossover.calendarYear === 2026 ? 20 : 0) + (crossover.calendarYear === 2010 ? 8 : 0);
}

function crossoverContextForAvatar(avatar, crossover) {
  const peerName = crossover.avatarNames.find((name) => name !== avatarName(avatar)) || crossover.avatarNames[0] || "another avatar";
  return {
    id: `context-${avatar.id}-life-saga-crossover-${crossover.calendarYear}-${slugify(peerName)}`,
    contextId: crossover.id,
    label: `Lorekeeper Crossover ${crossover.calendarYear}: ${peerName}`,
    kind: "saga",
    avatarBelief: `${avatarName(avatar)} keeps this as a soft-canon crossover seed: ${crossover.summary}`,
    publicSummary: `${avatarName(avatar)} and ${peerName} have a ${crossover.calendarYear} timeline resonance that can become a future scene, relationship beat, or canon callback.`,
    classification: "soft_canon",
    confidence: "generated",
    visibility: "shared",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function crossoverMemoryForAvatar(avatar, crossover) {
  const peerName = crossover.avatarNames.find((name) => name !== avatarName(avatar)) || crossover.avatarNames[0] || "another avatar";
  return {
    memoryId: `memory-${avatar.id}-life-saga-crossover-${crossover.calendarYear}-${slugify(peerName)}`,
    summary: `Lorekeepers linked ${avatarName(avatar)} to ${peerName} in ${crossover.calendarYear}: ${crossover.summary}`,
    emotionalWeight: crossover.calendarYear === 2026 ? 6 : 4,
    visibility: "shared",
    confidence: "generated",
    classification: "memory_delta",
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

function yearCanonCheck(yearEvents, crossovers) {
  const missingInputs = yearEvents.filter((event) => Number(event.lifeYear) > 0 && !(event.causalityInputs || []).length).length;
  const missingReviews = yearEvents.filter((event) => (event.reviewedAvatarIds || []).length < 2).length;
  if (missingInputs || missingReviews) return `Needs review: ${missingInputs} missing causal inputs, ${missingReviews} weak peer-review records.`;
  return `Consistent: ${yearEvents.length} entries retain causal inputs/outputs where expected and ${crossovers.length} highlighted crossover notes remain soft-canon scene seeds.`;
}

function eraCanonCheck(era, eraEvents, crossovers) {
  if (!eraEvents.length) return `${era.title} has no events; keep the era as a planning label only.`;
  const ingressEvents = eraEvents.filter((event) => event.relativeYear === "INGRESS").length;
  return `${era.title} is structurally usable: ${eraEvents.length} events, ${crossovers.length} crossover notes, ${ingressEvents} ingress events. Pressure: ${era.pressure}`;
}

function yearExposition(year, events, crossovers, dominantPhase, dominantTeam) {
  const sample = events.slice(0, 4).map((event) => event.summary).join(" ");
  const crossoverText = crossovers.length ? `Lorekeeper crossover: ${crossovers[0].summary}` : "No highlighted crossover needs immediate scene attention, so this year remains a clean timeline rung.";
  return `${year} reads as ${dominantPhase}. ${events.length} avatars register annual canon, with ${dominantTeam || "the shared archive"} carrying the strongest team signal. ${sample} ${crossoverText}`;
}

function phaseClause(event) {
  return `recording ${phaseFromSummary(event.summary)} toward ${event.teamTitle || "Unassigned Team"} / ${event.role || "Crew"}`;
}

function phaseFromSummary(summary = "") {
  const match = String(summary).match(/records (.*?) as a causal step/i);
  return (match?.[1] || "annual canon").trim();
}

function promptsForCard(title, summary) {
  return {
    heroImage: `${title} as a Hapa neonblade Lorekeeper card: visible timeline nodes, avatar portraits as small light tags, year/era labels, and readable causality connectors.`,
    twoD: `Readable ${title} Saga/Epic card, with Hapa neonblade frame, timeline glyphs, and clear source-provenance labels. ${summary}`,
    threeD: `${title} as a spatial card on the Avatar Builder board, connected to year nodes, avatar nodes, songs, and scene hooks.`,
    comicPanel: `Lorekeepers reading ${title} at a luminous timeline table while avatars challenge canon pressure and accept useful crossovers.`,
    explainerVideo: `Short animated Lorekeeper explainer for ${title}: year/decade/era grouping, canon audit, crossover notes, and reader onboarding.`,
    wikiEntry: `Wiki entry for ${title} with source refs, canon status, timeline grouping, crossovers, and future scene use.`,
    negativePrompt: "avoid generic fantasy, avoid unreadable microtext, avoid hard-canon promotion without review"
  };
}

function sourceRefsForConsolidation() {
  return [
    { label: "Avatar Life Journal Timeline", uri: LIFE_TIMELINE_PATH, confidence: "generated" },
    { label: "Avatar Store", uri: AVATAR_STORE_PATH, confidence: "generated" },
    { label: "Item Store", uri: ITEM_STORE_PATH, confidence: "generated" },
    { label: "Scene Store", uri: SCENE_STORE_PATH, confidence: "generated" },
    { label: "Last Light Archive Packet", uri: LAST_LIGHT_PACKET_PATH, confidence: "soft" }
  ];
}

function canonAuditText(audit) {
  const structural = audit.structuralIssues.length
    ? audit.structuralIssues.map((item) => `${item.type}: ${item.summary} (${item.count})`).join(" ")
    : "No blocking structural continuity breaks found.";
  const pressures = audit.canonPressures.map((item) => `${item.type}: ${item.summary}`).join(" ");
  return `${audit.status}. ${structural} Canon pressures: ${pressures}`;
}

function canonPressureNarrative(audit) {
  const pressureTypes = new Set((audit.canonPressures || []).map((pressure) => pressure.type));
  const clauses = [];
  if (pressureTypes.has("duplicate-display-names")) clauses.push("duplicate display names need ID-aware continuity");
  if (pressureTypes.has("unassigned-team-events")) clauses.push("unassigned team entries should be staged as unresolved placement rather than ignored");
  if (pressureTypes.has("soft-canon-majority")) clauses.push("soft-canon drafts should remain drafts until scenes, human review, or future Genesis passes promote them");
  if (!clauses.length) return "The remaining pressure is purely creative: decide which clean causal links should become scenes first.";
  return `The remaining pressures are story fuel: ${clauses.join("; ")}.`;
}

function canonPressureWriterNote(audit) {
  const pressureTypes = new Set((audit.canonPressures || []).map((pressure) => pressure.type));
  const clauses = [];
  if (pressureTypes.has("duplicate-display-names")) clauses.push("duplicate names must be resolved by avatar ID");
  if (pressureTypes.has("unassigned-team-events")) clauses.push("unassigned team beats should become placement scenes");
  if (pressureTypes.has("soft-canon-majority")) clauses.push("soft-canon drafts should remain drafts until scenes, human review, or future Genesis passes promote them");
  if (!clauses.length) return "They found no additional canon pressure beyond choosing which scene to write first.";
  return `They did find pressures that writers should keep: ${clauses.join("; ")}.`;
}

function issue(type, summary, count = 0) {
  return { type, summary, count };
}

function section(label, value) {
  return { label, value: String(value || ""), confidence: "generated" };
}

function countLines(counts = {}) {
  return Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join("\n");
}

function objectFromEntriesSorted(map) {
  return Object.fromEntries(topEntries(map, 100));
}

function topEntries(mapOrObject, limit = 5) {
  const entries = mapOrObject instanceof Map ? [...mapOrObject.entries()] : Object.entries(mapOrObject || {});
  return entries.sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0]))).slice(0, limit);
}

function countBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    map.set(value || "Unassigned", (map.get(value || "Unassigned") || 0) + 1);
  }
  return map;
}

function countValues(values) {
  const map = new Map();
  for (const value of values) map.set(value || "Unassigned", (map.get(value || "Unassigned") || 0) + 1);
  return map;
}

function mergeCountObjects(objects) {
  const result = {};
  for (const object of objects) {
    for (const [key, value] of Object.entries(object || {})) result[key] = (result[key] || 0) + Number(value || 0);
  }
  return objectFromEntriesSorted(result);
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = typeof key === "function" ? key(item) : item[key];
    map.set(value, [...(map.get(value) || []), item]);
  }
  return map;
}

function compareEvents(left, right) {
  return Number(left.order || 0) - Number(right.order || 0) || String(left.avatarName).localeCompare(String(right.avatarName));
}

function avatarLane(avatar = {}) {
  const text = [
    avatar.id,
    avatarName(avatar),
    avatar.mind?.gardenNodeAssignment?.teamTitle,
    avatar.mind?.shipCrewAssignment?.teamTitle,
    avatar.mind?.gardenNodeAssignment?.role,
    avatar.mind?.personaAnchor?.identityStatement,
    avatar.mind?.soulSeed?.soulThesis
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bred\b|fire|motion|pressure|action|liberty/.test(text)) return "red";
  if (/\bgreen\b|care|repair|garden|stakeholder|cultivation|shelter/.test(text)) return "green";
  if (/\bblue\b|archive|memory|truth|route|source|signal|harbor/.test(text)) return "blue";
  return ["red", "blue", "green"][stableNumber(avatar.id || avatarName(avatar)) % 3];
}

function avatarName(avatar = {}) {
  return avatar.primaryName || avatar.names?.[0]?.name || avatar.name || avatar.id || "Avatar";
}

function toTitleCase(value = "") {
  return String(value).replace(/[-_]+/g, " ").replace(/\w\S*/g, (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
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

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function stableNumber(value) {
  return Number.parseInt(createHash("sha1").update(String(value)).digest("hex").slice(0, 8), 16);
}

async function backupStores() {
  await writeJson(path.join(BACKUP_DIR, `avatar-store.before-lorekeeper-life-saga-${runStamp}.json`), await readJson(AVATAR_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `item-manager-store.before-lorekeeper-life-saga-${runStamp}.json`), await readJson(ITEM_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `scene-store.before-lorekeeper-life-saga-${runStamp}.json`), await readJson(SCENE_STORE_PATH));
  await writeJson(path.join(BACKUP_DIR, `avatar-agent-contract.before-lorekeeper-life-saga-${runStamp}.json`), await readJson(CONTRACT_PATH));
  await writeJson(path.join(BACKUP_DIR, `lore-production-plan.before-lorekeeper-life-saga-${runStamp}.json`), await readJson(LORE_PLAN_PATH));
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
    lore: {
      atlasEntityId: `hapa-lore:${COLLECTION_ID}`,
      sourcePath: path.resolve(CONSOLIDATION_PATH),
      epicMarkdownPath: path.resolve(EPIC_MARKDOWN_PATH),
      wikiEpicPath: WIKI_EPIC_PATH
    },
    avatar: {
      atlasEntityId: "hapa-avatar:all",
      sourcePath: path.resolve(AVATAR_STORE_PATH)
    },
    cards: {
      atlasEntityId: `hapa-cards:${COLLECTION_ID}`,
      sourcePath: path.resolve(ITEM_STORE_PATH),
      epicCardId: EPIC_CARD_ID
    }
  };
  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
  await Promise.all(SUBSCRIBERS.map((subscriber) => appendFile(
    path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`),
    `${JSON.stringify({ ...event, subscriber, status: "queued" })}\n`,
    "utf8"
  )));
  await writeJson(path.join(SUBSCRIBER_DIR, "latest.json"), event);
  await writeJson(path.join(SUBSCRIBER_DIR, "latest-summary.json"), {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    action,
    at: now,
    subscribers: SUBSCRIBERS,
    itemStorePath: path.resolve(ITEM_STORE_PATH),
    avatarStorePath: path.resolve(AVATAR_STORE_PATH),
    consolidationPath: path.resolve(CONSOLIDATION_PATH),
    epicMarkdownPath: path.resolve(EPIC_MARKDOWN_PATH),
    wikiEpicPath: WIKI_EPIC_PATH
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
