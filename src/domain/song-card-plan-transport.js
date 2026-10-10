// Transport limits do not change the saved plan or its semantic fingerprint.
export const SONG_CARD_PLAN_WIRE_BYTES = 8 * 1024 * 1024;
export const SONG_CARD_PLAN_JSON_BYTES = 32 * 1024 * 1024;

export async function prepareSongCardPlanRequest(input, init = {}) {
  if (String(init.method || "GET").toUpperCase() !== "POST"
    || !/\/api\/song-cards\/[^/?#]+\/plan(?:[?#]|$)/u.test(String(input))
    || typeof init.body !== "string") return init;
  init.signal?.throwIfAborted();
  const headers = new Headers(init.headers);
  if (headers.has("content-encoding")) return init;
  const bytes = new TextEncoder().encode(init.body);
  if (bytes.length > SONG_CARD_PLAN_JSON_BYTES) {
    throw new Error("This Song Card plan exceeds the 32 MiB planning limit. Reduce its embedded source detail before retrying.");
  }
  if (bytes.length < 128 * 1024 || typeof CompressionStream !== "function") return init;
  const compressed = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  init.signal?.throwIfAborted();
  if (compressed.byteLength >= bytes.length) return init;
  if (compressed.byteLength > SONG_CARD_PLAN_WIRE_BYTES) {
    throw new Error("This compressed Song Card plan exceeds the 8 MiB transfer limit. Reduce its embedded source detail before retrying.");
  }
  headers.set("Content-Encoding", "gzip");
  headers.set("Content-Type", "application/json");
  return { ...init, headers, body: compressed };
}
