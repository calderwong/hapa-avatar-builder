export const ECHO_PLAYER_POOL_BUDGETS = Object.freeze([3, 5, 9]);
export function resolveEchoPlayerPoolLimit(value, fallback = 9) {
  const requested = Number(value);
  return ECHO_PLAYER_POOL_BUDGETS.includes(requested) ? requested : ECHO_PLAYER_POOL_BUDGETS.includes(fallback) ? fallback : 9;
}
// One immutable budget per mounted app session, shared by all pool consumers.
// The URL setting supports reproducible 3/5/9-player acceptance runs.
export const ECHO_PLAYER_POOL_LIMIT = resolveEchoPlayerPoolLimit(new URLSearchParams(globalThis.location?.search || "").get("echoPlayerBudget"));

export function canonicalEchoAssetKey(value = "") {
  return String(value || "").split("#")[0];
}

export function echoShotRuntimeUri(shot = {}) {
  if (shot?.media_contract?.type === "generated-visualizer" || shot?.media_id === "none") return "";
  return String(shot?.media_contract?.runtimeUri || shot?.runtime_media_uri || shot?.media_uri || "");
}

export function planEchoPlayerLeases(project = null, currentShotIndex = 0, limit = ECHO_PLAYER_POOL_LIMIT) {
  const timeline = Array.isArray(project?.timeline) ? project.timeline : [];
  const budget = Math.max(0, Math.min(9, Math.trunc(Number(limit) || 0)));
  if (!timeline.length || budget <= 0) return [];
  const start = Math.max(0, Math.min(timeline.length - 1, Number(currentShotIndex) || 0));
  const leases = [];
  const seenAssets = new Set();
  for (let offset = 0; offset < timeline.length && offset < budget; offset += 1) {
    const shotIndex = (start + offset) % timeline.length;
    const shot = timeline[shotIndex];
    const uri = echoShotRuntimeUri(shot);
    if (!uri) continue;
    const assetKey = canonicalEchoAssetKey(uri);
    if (!assetKey || seenAssets.has(assetKey)) continue;
    seenAssets.add(assetKey);
    leases.push({
      shotIndex,
      lookahead: offset,
      assetKey,
      uri,
      startSeconds: Number(shot.start_sec || 0),
    });
    if (leases.length >= budget) break;
  }
  return leases;
}

export function reconcileEchoPlayerSlots(slots = [], leases = [], protectedSlotIndex = -1) {
  const assignments = [];
  const claimedSlots = new Set();
  const claimedLeases = new Set();
  leases.forEach((lease, leaseIndex) => {
    const slotIndex = slots.findIndex((slot, index) => (
      !claimedSlots.has(index)
      && (index !== protectedSlotIndex || lease.lookahead === 0)
      && canonicalEchoAssetKey(slot?.key) === lease.assetKey
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
