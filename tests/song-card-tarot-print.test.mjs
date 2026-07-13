import assert from "node:assert/strict";
import test from "node:test";
import { buildTruthfulUnmintedVisualizerCard, resolveAuthoritativeTarotSongCardPrint } from "../src/domain/song-card-tarot-print.js";

function fixture(timestampMs = 6100) {
  const appearance = { appearanceId: "appearance:e2", snapshot: { id: "card:a", title: "Historical A" }, sourceDigest: "sha256:a" };
  return {
    headPayload: { latestEdition: 2 },
    cardsAtTime: { truthStatus: "printable", primary: appearance, active: [appearance] },
    printResult: { card: { ...appearance.snapshot, songCardPrint: { songId: "dear-papa", edition: 2, timestampMs, appearanceId: appearance.appearanceId, sourceDigest: appearance.sourceDigest } } },
    songId: "dear-papa",
    timestampMs,
  };
}

test("paused, sought, and transition timestamps resolve only authoritative edition-pinned print receipts", () => {
  for (const timestampMs of [0, 5999, 6000, 6100, 11849, 11850, 12100]) {
    const resolved = resolveAuthoritativeTarotSongCardPrint(fixture(timestampMs));
    assert.equal(resolved.edition, 2);
    assert.equal(resolved.timestampMs, timestampMs);
    assert.equal(resolved.card.songCardPrint.appearanceId, "appearance:e2");
  }
});

test("missing, stale, or mismatched print responses fail closed instead of substituting a local snapshot", () => {
  const missing = fixture(); missing.printResult = { card: missing.cardsAtTime.primary.snapshot };
  assert.throws(() => resolveAuthoritativeTarotSongCardPrint(missing), { code: "authoritative_print_receipt_missing" });
  const stale = fixture(); stale.printResult.card.songCardPrint.edition = 1;
  assert.throws(() => resolveAuthoritativeTarotSongCardPrint(stale), { code: "authoritative_print_receipt_mismatch" });
  const drift = fixture(); drift.printResult.card.songCardPrint.appearanceId = "appearance:mutable-new";
  assert.throws(() => resolveAuthoritativeTarotSongCardPrint(drift), { code: "authoritative_print_appearance_mismatch" });
});

test("pure-IVF live fallback is explicitly unminted and never impersonates an edition", () => {
  const card = buildTruthfulUnmintedVisualizerCard({ visualizer: { id: "ivf:echo", title: "Echo" }, songId: "dear-papa", timestampMs: 2500 });
  assert.equal(card.songCardPrint.truthStatus, "live-editor-not-immutable-edition");
  assert.equal(card.songCardPrint.edition, undefined);
});
