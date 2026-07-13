import crypto from "node:crypto";

export const SEMANTIC_BLIND_CHOICES = ["A", "B", "TIE", "NEITHER"];

export function normalizeSemanticBlindBallot(packet, ballot = {}) {
  const ids = new Set((packet.comparisons || []).map((row) => row.id));
  const votes = {};
  for (const [id, choice] of Object.entries(ballot.votes || {})) if (ids.has(id) && SEMANTIC_BLIND_CHOICES.includes(choice)) votes[id] = choice;
  return {
    schemaVersion: "hapa.echo.semantic-blind-votes.v3",
    packetHash: ballot.packetHash || null,
    reviewerId: String(ballot.reviewerId || "anonymous-local-reviewer"),
    completedAt: ballot.completedAt || null,
    votes,
    notes: Object.fromEntries(Object.entries(ballot.notes || {}).filter(([id, note]) => ids.has(id) && String(note).trim()).map(([id, note]) => [id, String(note).trim().slice(0, 500)])),
  };
}

export function semanticBlindPacketHash(packet) {
  return crypto.createHash("sha256").update(JSON.stringify(packet)).digest("hex");
}

export function evaluateSemanticBlindBallots({ packet, answerKey, ballots = [] }) {
  const comparisons = new Map((packet.comparisons || []).map((row) => [row.id, row]));
  const answers = new Map((answerKey.sealedAnswers || []).map((row) => [row.id, row.answer]));
  const expectedHash = semanticBlindPacketHash(packet);
  const normalized = ballots.map((ballot) => normalizeSemanticBlindBallot(packet, ballot));
  const rows = [];
  for (const ballot of normalized) for (const [id, choice] of Object.entries(ballot.votes)) {
    const comparison = comparisons.get(id); const proposedSide = answers.get(id);
    if (!comparison || !proposedSide) continue;
    const outcome = choice === "TIE" ? "tie" : choice === "NEITHER" ? "neither" : choice === proposedSide ? "proposed" : "baseline";
    rows.push({ reviewerId: ballot.reviewerId, id, songId: comparison.songId, choice, outcome });
  }
  const summarize = (selected) => {
    const proposed = selected.filter((row) => row.outcome === "proposed").length; const baseline = selected.filter((row) => row.outcome === "baseline").length;
    const tie = selected.filter((row) => row.outcome === "tie").length; const neither = selected.filter((row) => row.outcome === "neither").length; const decisive = proposed + baseline;
    return { total: selected.length, proposed, baseline, tie, neither, decisive, proposedWinRate: decisive ? Number((proposed / decisive).toFixed(4)) : null };
  };
  const overall = summarize(rows);
  const bySong = [...new Set((packet.comparisons || []).map((row) => row.songId))].sort().map((songId) => ({ songId, ...summarize(rows.filter((row) => row.songId === songId)) }));
  const packetHashValid = normalized.every((ballot) => !ballot.packetHash || ballot.packetHash === expectedHash);
  const completedBallots = normalized.filter((ballot) => Object.keys(ballot.votes).length === comparisons.size).length;
  const promotionAllowed = packetHashValid && completedBallots > 0 && overall.decisive >= Math.ceil(comparisons.size * .67) && overall.proposed > overall.baseline && bySong.every((row) => row.decisive > 0 && row.proposed >= row.baseline);
  return {
    schemaVersion: "hapa.echo.semantic-blind-evaluation.v3", packetHash: expectedHash, packetHashValid,
    comparisons: comparisons.size, reviewers: normalized.length, completedBallots, overall, bySong,
    promotionGate: { allowed: promotionAllowed, requirements: ["at least one complete human ballot", "at least two-thirds decisive votes", "proposed beats baseline overall", "proposed does not lose any representative song", "ballot packet hashes match"], status: promotionAllowed ? "human-evidence-passes" : "awaiting-or-failed-human-evidence" },
    rows,
  };
}
