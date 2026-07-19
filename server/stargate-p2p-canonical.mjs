import { sha256 as sha256Bytes } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Ported from hapa-tarot-stargate-reference@9e59305. Keep byte-compatible.
function normalize(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => normalize(entry, `${path}[${index}]`));
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Undefined value at ${path}.${key}`);
      return [key, normalize(value[key], `${path}.${key}`)];
    }));
  }
  throw new TypeError(`Unsupported ${typeof value} value at ${path}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function sha256(value) {
  const bufferLike = typeof globalThis.Buffer !== "undefined" && globalThis.Buffer.isBuffer?.(value);
  const bytes = bufferLike
    ? new Uint8Array(value)
    : new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  return bytesToHex(sha256Bytes(bytes));
}
