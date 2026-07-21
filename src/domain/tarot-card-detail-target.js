export function isTarotCardDetailTargetSettled(entry) {
  return Boolean(
    entry &&
    entry.state === "placed" &&
    !entry.drawAnim &&
    (entry.delay || 0) <= 0
  );
}

export function resolveTarotCardDetailTargetEntry({
  selectedEntry = null,
  hoveredEntry = null,
  heldEntry = null,
} = {}) {
  if (selectedEntry?.detailsOpen || heldEntry) return null;
  if (isTarotCardDetailTargetSettled(hoveredEntry)) return hoveredEntry;
  if (isTarotCardDetailTargetSettled(selectedEntry)) return selectedEntry;
  return null;
}
