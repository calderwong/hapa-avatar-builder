import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  resolveEchoEnrichmentVariantPath,
  validateEchoEnrichmentSongId,
} from "../src/domain/echo-enrichment-path-safety.js";

test("accepts current Echo song IDs as one canonical path segment", () => {
  const songIds = [
    "dear-papa-song-wish-her-well",
    "dear-papa-song-11-23-meant-to-meet-thu",
    "dear-papa-song-bella-chiao-protocol-x-i-don-t-hear-voices-but-i-feel-like-mashup",
  ];

  for (const songId of songIds) assert.equal(validateEchoEnrichmentSongId(songId), songId);
});

test("song ID validation rejects empty, dot, separator, absolute, encoded, and NUL inputs", () => {
  const unsafeSongIds = [
    "",
    "   ",
    ".",
    "..",
    "/absolute-song",
    "C:\\absolute-song",
    "C:drive-relative-song",
    "nested/song",
    "nested\\song",
    "%2e%2e",
    "%2Fabsolute-song",
    "%5cnested",
    "%252e%252e",
    "safe%00song",
    " song-with-padding",
    "song-with-padding ",
    "song\0id",
  ];

  for (const songId of unsafeSongIds) {
    assert.throws(
      () => validateEchoEnrichmentSongId(songId),
      (error) => error instanceof TypeError && error.code === "ERR_ECHO_ENRICHMENT_UNSAFE_PATH",
      songId,
    );
  }
  for (const songId of [null, undefined, 42, {}, ["song"]]) {
    assert.throws(() => validateEchoEnrichmentSongId(songId), TypeError);
  }
});

test("resolves a nested current-style variant path beneath the resolved root", () => {
  const root = path.join(path.sep, "tmp", "echo-enrichment-variants", "nested", "..");
  const relative = "dear-papa-song-wish-her-well/intentional-enrichment-86779b6167b9.json";

  assert.equal(
    resolveEchoEnrichmentVariantPath(root, relative),
    path.join(path.resolve(root), "dear-papa-song-wish-her-well", "intentional-enrichment-86779b6167b9.json"),
  );
  assert.equal(
    resolveEchoEnrichmentVariantPath(root, "single-cut.json"),
    path.join(path.resolve(root), "single-cut.json"),
  );
});

test("treats either slash style as a relative separator without host-dependent behavior", () => {
  const root = path.join(path.sep, "tmp", "echo-enrichment-variants");
  assert.equal(
    resolveEchoEnrichmentVariantPath(root, "dear-papa-song-blue\\newest-cut.json"),
    path.join(root, "dear-papa-song-blue", "newest-cut.json"),
  );
});

test("variant resolution rejects absolute paths, traversal, ambiguous encoding, and NUL", () => {
  const root = path.join(path.sep, "tmp", "echo-enrichment-variants");
  const unsafePaths = [
    "",
    "   ",
    "/tmp/escape.json",
    "C:\\tmp\\escape.json",
    "C:drive-relative-escape.json",
    "\\\\server\\share\\escape.json",
    "../escape.json",
    "song/../escape.json",
    "song/./cut.json",
    "song//cut.json",
    "song/",
    "%2e%2e/escape.json",
    "song/%2e%2e/escape.json",
    "song%2fescape.json",
    "song%5cescape.json",
    "%252e%252e/escape.json",
    "safe%00path.json",
    "C%3a/escape.json",
    " path/variant.json",
    "path/variant.json ",
    "song\0cut.json",
  ];

  for (const relativePath of unsafePaths) {
    assert.throws(
      () => resolveEchoEnrichmentVariantPath(root, relativePath),
      (error) => error instanceof TypeError && error.code === "ERR_ECHO_ENRICHMENT_UNSAFE_PATH",
      relativePath,
    );
  }
  for (const relativePath of [null, undefined, 42, {}, ["cut.json"]]) {
    assert.throws(() => resolveEchoEnrichmentVariantPath(root, relativePath), TypeError);
  }
});

test("variant resolution fails closed for an invalid root", () => {
  for (const root of ["", "   ", "root\0path", null, undefined, 42]) {
    assert.throws(() => resolveEchoEnrichmentVariantPath(root, "song/cut.json"), TypeError);
  }
});
