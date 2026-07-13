export const TAROT_SONG_CARD_PRINT_RESOLUTION_SCHEMA = "hapa.song-card.tarot-print-resolution.v1";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function latestSongCardEdition(headPayload = {}) {
  return Number(headPayload.latestEdition || headPayload.head?.latestEdition || headPayload.card?.latestEdition || 0);
}

export function resolveAuthoritativeTarotSongCardPrint({ headPayload = {}, cardsAtTime = {}, printResult = {}, songId = "", timestampMs = 0 } = {}) {
  const edition = latestSongCardEdition(headPayload);
  if (!(edition > 0)) fail("song_card_not_minted", "Song Card has no immutable edition.");
  const primary = cardsAtTime.primary || cardsAtTime.active?.[cardsAtTime.active.length - 1] || null;
  if (!primary?.snapshot && !primary?.card) fail("no_printable_card", "Song Card timestamp has no printable historical snapshot.");
  const card = printResult.card;
  const receipt = card?.songCardPrint;
  if (!receipt) fail("authoritative_print_receipt_missing", "Authoritative Song Card print receipt is missing.");
  if (Number(receipt.edition) !== edition || String(receipt.songId || "") !== String(songId) || Number(receipt.timestampMs) !== Math.round(Number(timestampMs))) {
    fail("authoritative_print_receipt_mismatch", "Authoritative Song Card print receipt does not match the selected edition and media clock.");
  }
  if (primary.appearanceId && receipt.appearanceId !== primary.appearanceId) fail("authoritative_print_appearance_mismatch", "Printed Card does not match the selected historical appearance.");
  return { schemaVersion: TAROT_SONG_CARD_PRINT_RESOLUTION_SCHEMA, edition, timestampMs: Math.round(Number(timestampMs)), card, receipt, primary, active: cardsAtTime.active || [] };
}

export function buildTruthfulUnmintedVisualizerCard({ visualizer, songId = "", timestampMs = 0 } = {}) {
  if (!visualizer?.id) fail("visualizer_card_missing", "No live visualizer card is available.");
  return {
    ...structuredClone(visualizer),
    songCardPrint: {
      schemaVersion: "hapa.song-card.unminted-print.v1",
      truthStatus: "live-editor-not-immutable-edition",
      songId: String(songId),
      timestampMs: Math.round(Number(timestampMs)),
    },
  };
}
