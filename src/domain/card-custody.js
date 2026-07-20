export const CARD_CUSTODY_RECEIPT_SCHEMA = "hapa.card-custody-receipt.v1";

const DIGEST = /^[a-f0-9]{64}$/u;

export function applyCardCustodyReceipt(card = {}, receipt = {}) {
  if (receipt.schemaVersion !== CARD_CUSTODY_RECEIPT_SCHEMA || !DIGEST.test(receipt.cardCoreKey || "") || !DIGEST.test(receipt.cardRecordDigest || "")) {
    throw new TypeError("A verified Hapa Card custody receipt is required");
  }
  const cardId = String(card.cardId || card.id || "").trim();
  if (!cardId) throw new TypeError("card.cardId is required");
  if (cardId !== receipt.cardId) throw new TypeError("Card custody receipt belongs to a different Card");
  return {
    ...card,
    cardId,
    cardCoreKey: receipt.cardCoreKey,
    cardRevisionId: receipt.cardRevisionId,
    cardRecordDigest: receipt.cardRecordDigest,
    recordDigest: receipt.cardRecordDigest,
    originPublicKey: receipt.originPublicKey,
    custody: {
      ...(card.custody && typeof card.custody === "object" ? card.custody : {}),
      ...receipt,
      identityBasis: "hypercore_origin_event",
      durableReceipt: true,
      hypercoreAppended: true,
      portableCustody: true,
      sourceMutation: false,
    },
  };
}
