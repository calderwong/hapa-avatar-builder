import {
  OvercardAdapterLoadError,
  OvercardSyncAdapter,
  defaultRecordCodec,
} from "@hapa/overcard/react";

export const DEFAULT_OVERCARD_HOST_URL = "http://127.0.0.1:8794";

export function describeOvercardHostLoadFailure(error, {
  baseUrl = DEFAULT_OVERCARD_HOST_URL,
  rendererOrigin = globalThis.location?.origin || "unknown renderer origin",
} = {}) {
  const cause = error instanceof Error ? error.message : String(error || "Unknown transport failure.");
  const normalized = cause.toLowerCase();
  const endpoint = String(baseUrl).replace(/\/+$/, "");

  if (/aborted|aborterror/.test(normalized)) {
    return `Shared Overcard connection to ${endpoint} was cancelled. Cause: ${cause}`;
  }
  if (/http 401|unauthor/.test(normalized)) {
    return `Shared Overcard host at ${endpoint} rejected authorization for ${rendererOrigin}. Cause: ${cause}`;
  }
  if (/http 403|origin|cors/.test(normalized)) {
    return `Shared Overcard host at ${endpoint} rejected renderer origin ${rendererOrigin}. Verify the host's exact-origin registration. Cause: ${cause}`;
  }
  if (/http 404|wrong.service|does not expose/.test(normalized)) {
    return `The service at ${endpoint} is not a compatible Shared Overcard host for ${rendererOrigin}. Cause: ${cause}`;
  }
  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|enotfound|socket/.test(normalized)) {
    return `Shared Overcard transport to ${endpoint} failed from ${rendererOrigin}. The host is unreachable from this surface; use Reconnect host for a typed diagnosis. Cause: ${cause}`;
  }
  return `Shared Overcard host load failed at ${endpoint} from ${rendererOrigin}. Cause: ${cause}`;
}

export function createAvatarBuilderOvercardAdapter({
  baseUrl = DEFAULT_OVERCARD_HOST_URL,
  token,
  actor = "hapa-avatar-builder",
  reconnect,
  rendererOrigin = globalThis.location?.origin || "unknown renderer origin",
  catalogUrl = "/api/overcard/catalog?limit=500",
  hostTargetsUrl = "/api/overcard/host-targets",
} = {}) {
  const shared = new OvercardSyncAdapter({
    baseUrl,
    token,
    actor,
    reconnect,
    queuePolicy: "reject",
  });
  let catalogProjection = { catalog: {}, hostTargets: [] };

  async function refreshCatalog(signal) {
    const [catalogResponse, targetsResponse] = await Promise.all([fetch(catalogUrl, { signal }), fetch(hostTargetsUrl, { signal })]);
    if (!catalogResponse.ok) throw new Error(`Builder catalog failed with HTTP ${catalogResponse.status}.`);
    if (!targetsResponse.ok) throw new Error(`Builder HostTargets failed with HTTP ${targetsResponse.status}.`);
    catalogProjection = { ...projectBuilderCatalog(await catalogResponse.json()), hostTargets: (await targetsResponse.json()).targets || [] };
    return catalogProjection;
  }

  function withCatalog(patch) {
    const hostTargets = new Map([...(catalogProjection.hostTargets || []), ...(patch.hostTargets || [])].map((target) => [target.id || `${target.nodeId}:${target.hostId}:${target.socketId || ""}`, target]));
    return {
      ...catalogProjection,
      ...patch,
      catalog: { ...catalogProjection.catalog, ...(patch.catalog || {}) },
      hostTargets: [...hostTargets.values()],
    };
  }

  return {
    async load(signal) {
      const [hostResult, catalogResult] = await Promise.allSettled([
        shared.load(signal),
        refreshCatalog(signal),
      ]);
      if (catalogResult.status === "fulfilled") catalogProjection = catalogResult.value;
      if (hostResult.status === "rejected") {
        const failure = new OvercardAdapterLoadError(
          describeOvercardHostLoadFailure(hostResult.reason, { baseUrl, rendererOrigin }),
          catalogProjection,
        );
        failure.cause = hostResult.reason;
        failure.baseUrl = baseUrl;
        failure.rendererOrigin = rendererOrigin;
        throw failure;
      }
      return withCatalog(hostResult.value);
    },
    async commit(command, signal) {
      return withCatalog(await shared.commit(command, signal));
    },
    subscribe(listener, signal) {
      return shared.subscribe((patch) => listener(withCatalog(patch)), signal);
    },
    pendingCommands: () => shared.pendingCommands(),
    retryPending: (queueId, options) => shared.retryPending(queueId, options),
    discardPending: (queueId) => shared.discardPending(queueId),
  };
}

export function projectOvercardHostSnapshot(snapshot) {
  return defaultRecordCodec.project(snapshot);
}

export function projectBuilderCatalog(response) {
  const catalog = {};
  for (const entry of response?.entities ?? []) {
    if (!entry?.ref?.sourceSystem || !entry.ref.entityType || !entry.ref.entityId) continue;
    const key = `${entry.ref.sourceSystem}:${entry.ref.entityType}:${entry.ref.entityId}`;
    catalog[key] = {
      ...entry.ref,
      rendererId: entry.rendererId,
      sourceOwner: entry.sourceOwner,
      detailUri: entry.detailUri,
      attachPackUri: entry.attachPackUri,
      readOnly: entry.readOnly,
      placementAllowed: entry.placementAllowed !== false,
    };
  }
  return { catalog };
}
