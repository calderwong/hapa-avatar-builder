import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { SONG_CARD_PLAN_JSON_BYTES, SONG_CARD_PLAN_WIRE_BYTES } from "../src/domain/song-card-plan-transport.js";

const unzip = promisify(gunzip);
function failure(message, statusCode) { return Object.assign(new Error(message), { statusCode }); }

export async function readSongCardPlanRequest(req, { signal } = {}) {
  const encoding = String(req.headers["content-encoding"] || "identity").trim().toLowerCase();
  if (!["identity", "gzip"].includes(encoding)) throw failure("unsupported_plan_content_encoding", 415);
  const limit = encoding === "gzip" ? SONG_CARD_PLAN_WIRE_BYTES : SONG_CARD_PLAN_JSON_BYTES;
  if (Number(req.headers["content-length"] || 0) > limit) throw failure(`request_body_too_large: limit=${limit}`, 413);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    signal?.throwIfAborted();
    size += chunk.length;
    if (size > limit) throw failure(`request_body_too_large: limit=${limit}`, 413);
    chunks.push(chunk);
  }
  signal?.throwIfAborted();
  let bytes = Buffer.concat(chunks);
  if (encoding === "gzip") {
    try { bytes = await unzip(bytes, { maxOutputLength: SONG_CARD_PLAN_JSON_BYTES }); }
    catch (error) {
      if (error.code === "ERR_BUFFER_TOO_LARGE") throw failure(`request_body_too_large: limit=${SONG_CARD_PLAN_JSON_BYTES}`, 413);
      throw failure("invalid_gzip_plan_request", 400);
    }
  }
  signal?.throwIfAborted();
  try { return bytes.length ? JSON.parse(bytes.toString("utf8")) : {}; }
  catch { throw failure("invalid_json_plan_request", 400); }
}
