export const ECHO_PLAYER_POOL_LIMIT = 3;

export function canonicalEchoAssetKey(value = "") {
  return String(value || "").split("#")[0];
}

export function planEchoPlayerLeases(project = null, currentShotIndex = 0, limit = ECHO_PLAYER_POOL_LIMIT) {
  const timeline = Array.isArray(project?.timeline) ? project.timeline : [];
  if (!timeline.length || limit <= 0) return [];
  const start = Math.max(0, Math.min(timeline.length - 1, Number(currentShotIndex) || 0));
  const leases = [];
  const seenAssets = new Set();
  for (let offset = 0; offset < timeline.length && offset < 3; offset += 1) {
    const shotIndex = (start + offset) % timeline.length;
    const shot = timeline[shotIndex];
    if (!shot?.media_uri || shot.media_id === "none") continue;
    const assetKey = canonicalEchoAssetKey(shot.media_uri);
    if (!assetKey || seenAssets.has(assetKey)) continue;
    seenAssets.add(assetKey);
    leases.push({
      shotIndex,
      lookahead: offset,
      assetKey,
      uri: shot.media_uri,
      startSeconds: Number(shot.start_sec || 0),
    });
    if (leases.length >= Math.min(ECHO_PLAYER_POOL_LIMIT, limit)) break;
  }
  return leases;
}

export function reconcileEchoPlayerSlots(slots = [], leases = [], protectedSlotIndex = -1) {
  const assignments = [];
  const claimedSlots = new Set();
  const claimedLeases = new Set();
  leases.forEach((lease, leaseIndex) => {
    const slotIndex = slots.findIndex((slot, index) => (
      !claimedSlots.has(index) && canonicalEchoAssetKey(slot?.key) === lease.assetKey
    ));
    if (slotIndex >= 0) {
      claimedSlots.add(slotIndex);
      claimedLeases.add(leaseIndex);
      assignments.push({ slotIndex, leaseIndex, lease, reused: true });
    }
  });
  leases.forEach((lease, leaseIndex) => {
    if (claimedLeases.has(leaseIndex)) return;
    const slotIndex = slots.findIndex((slot, index) => (
      !claimedSlots.has(index)
      && index !== protectedSlotIndex
      && !leases.some((candidate) => candidate.assetKey === canonicalEchoAssetKey(slot?.key))
    ));
    if (slotIndex < 0) return;
    claimedSlots.add(slotIndex);
    claimedLeases.add(leaseIndex);
    assignments.push({ slotIndex, leaseIndex, lease, reused: false });
  });
  return {
    assignments: assignments.sort((a, b) => a.leaseIndex - b.leaseIndex),
    unassignedSlotIndices: slots.map((_, index) => index).filter((index) => !claimedSlots.has(index) && index !== protectedSlotIndex),
  };
}
