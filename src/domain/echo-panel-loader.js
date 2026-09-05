/** Independent panel lifetimes: optional panels cannot gate song selection.
 * Abort superseded requests and guard callbacks even when a transport ignores
 * cancellation. A slow notice appears while a cold catalog is still building.
 */
export function createEchoPanelLoader({ fetchImpl = globalThis.fetch, onStatus = () => {}, slowMs = 3000, timeoutMs = 30_000 } = {}) {
  const requests = new Map();
  let disposed = false;
  return {
    async load(key, url, onData) {
      if (disposed) return;
      requests.get(key)?.controller.abort();
      const request = { controller: new AbortController() };
      requests.set(key, request);
      const current = () => !disposed && requests.get(key) === request;
      const status = value => { if (current()) onStatus(key, value); };
      status({ state: "loading", message: "Loading…" });
      const slow = setTimeout(() => status({ state: "slow", message: "Still loading. Other panels remain available." }), slowMs);
      const timeout = setTimeout(() => {
        status({ state: "error", message: "Request timed out. Retry to check the prepared catalog." });
        request.controller.abort();
      }, timeoutMs);
      let onAbort;
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(new DOMException("Panel request cancelled", "AbortError"));
        request.controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        const response = await Promise.race([fetchImpl(url, { signal: request.controller.signal, cache: "no-store" }), aborted]);
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = await Promise.race([response.json(), aborted]);
        if (!current() || request.controller.signal.aborted) return;
        await onData(data);
        const omitted = Number(response.headers?.get?.("x-hapa-echo-catalog-errors") || 0);
        status(omitted ? { state: "partial", message: `${omitted} unavailable song summaries. Retry after source repair.` } : { state: "ready", message: "Ready" });
      } catch (error) {
        if (!request.controller.signal.aborted) status({ state: "error", message: error?.message || "Could not load panel" });
      } finally {
        clearTimeout(slow);
        clearTimeout(timeout);
        request.controller.signal.removeEventListener("abort", onAbort);
        if (current()) requests.delete(key);
      }
    },
    dispose() {
      disposed = true;
      for (const request of requests.values()) request.controller.abort();
      requests.clear();
    },
  };
}
