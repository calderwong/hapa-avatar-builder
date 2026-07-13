import { contextHash } from "./song-context-packet.js";

export function buildMediaDiversityReport(graph) {
  const cards = (graph.tracks || []).flatMap((track) => (track.cards || []).filter((card) => card.media && !card.knockedOut).map((card) => ({ ...card, role: track.role || track.id })));
  const duration = Number(graph.song?.durationSeconds || 0);
  const budgets = { minClipSpacingSeconds: Number(Math.max(6, duration / 24).toFixed(3)), minFamilySpacingSeconds: Number(Math.max(4, duration / 32).toFixed(3)), maxUnmotivatedClipRepeats: Math.max(1, Math.floor(duration / 90)), maxFamilyShare: .35, roleCoverageTarget: ["foundation", "visualizer", "accent"] };
  const lastByMedia = new Map(); const lastByFamily = new Map(); const clipCounts = new Map(); const familyCounts = new Map(); const callbacks = []; const penalties = [];
  for (const card of [...cards].sort((a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id))) {
    const mediaId = card.media.id;
    const family = card.media.groupId || card.media.sourceKind || "unknown";
    const previous = lastByMedia.get(mediaId);
    const familyPrevious = lastByFamily.get(family);
    clipCounts.set(mediaId, (clipCounts.get(mediaId) || 0) + 1); familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    if (previous) {
      const spacing = Number(card.startSeconds) - Number(previous.startSeconds);
      const chorusCallback = /chorus|hook/i.test(String(card.media.groupName || "")) && /chorus|hook/i.test(String(previous.media.groupName || ""));
      if (chorusCallback) callbacks.push({ motifId: `motif:${contextHash({ mediaId, family }).slice(0, 16)}`, mediaId, fromCardId: previous.id, toCardId: card.id, spacingSeconds: spacing, reason: "intentional-chorus-callback" });
      else if (spacing < budgets.minClipSpacingSeconds || clipCounts.get(mediaId) > budgets.maxUnmotivatedClipRepeats + 1) penalties.push({ cardId: card.id, mediaId, kind: "accidental-clip-repeat", spacingSeconds: spacing, penalty: .18, reason: "repeat-without-motif-id" });
    }
    if (familyPrevious && Number(card.startSeconds) - Number(familyPrevious.startSeconds) < budgets.minFamilySpacingSeconds && familyPrevious.media.id !== mediaId) penalties.push({ cardId: card.id, family, kind: "family-spacing", spacingSeconds: Number(card.startSeconds) - Number(familyPrevious.startSeconds), penalty: .08, reason: "family-reused-before-budget" });
    lastByMedia.set(mediaId, card); lastByFamily.set(family, card);
  }
  const uniqueMedia = clipCounts.size; const uniqueFamilies = familyCounts.size; const roles = [...new Set(cards.map((card) => card.role))];
  const fatigue = cards.length ? penalties.reduce((sum, row) => sum + row.penalty, 0) / cards.length : 0;
  return { schemaVersion: "hapa.director.media-diversity-report.v1", variantId: graph.directorV2?.variantId || null, deterministic: true, budgets, totals: { cards: cards.length, uniqueMedia, uniqueFamilies, uniqueMediaRatio: cards.length ? Number((uniqueMedia / cards.length).toFixed(4)) : 0 }, familySpacing: [...familyCounts].map(([family, count]) => ({ family, count, share: cards.length ? Number((count / cards.length).toFixed(4)) : 0, overShareBudget: cards.length ? count / cards.length > budgets.maxFamilyShare : false })), roleCoverage: { roles, target: budgets.roleCoverageTarget, missing: budgets.roleCoverageTarget.filter((role) => !roles.includes(role)) }, callbacks, penalties, reuseFatigue: Number(fatigue.toFixed(4)) };
}

export function compareMediaDiversityReports(reports = []) { return { schemaVersion: "hapa.director.media-diversity-comparison.v1", variants: reports.map((report) => ({ variantId: report.variantId, uniqueMedia: report.totals.uniqueMedia, uniqueMediaRatio: report.totals.uniqueMediaRatio, minimumFamilySpacing: report.budgets.minFamilySpacingSeconds, roleCoverage: report.roleCoverage.roles, callbacks: report.callbacks.length, accidentalRepeats: report.penalties.filter((row) => row.kind === "accidental-clip-repeat").length, reuseFatigue: report.reuseFatigue })) }; }
