import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createTarotCard } from "../src/domain/tarot.js";
import {
  ECHO_RECORD_GARDEN_RECORDING_MAX_BYTES,
  ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS,
  buildEchoRecordGardenRecordingCard,
  echoRecordGardenRecordingBytesMatch,
  echoRecordGardenRecordingFileName,
  finalizeEchoRecordGardenRecordingCard,
  inspectEchoRecordGardenWebM,
  normalizeEchoRecordGardenRecordingRequest,
  runEchoRecordGardenRecordingTransaction,
  sha256Hex,
  validateEchoRecordGardenRecordingIdempotencyKey,
} from "../server/echo-record-garden-recording-card.mjs";

const IDS = {
  ebml: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
  docType: Buffer.from([0x42, 0x82]),
  segment: Buffer.from([0x18, 0x53, 0x80, 0x67]),
  tracks: Buffer.from([0x16, 0x54, 0xae, 0x6b]),
  trackEntry: Buffer.from([0xae]),
  trackNumber: Buffer.from([0xd7]),
  trackType: Buffer.from([0x83]),
  codecId: Buffer.from([0x86]),
  cluster: Buffer.from([0x1f, 0x43, 0xb6, 0x75]),
  timestamp: Buffer.from([0xe7]),
  cues: Buffer.from([0x1c, 0x53, 0xbb, 0x6b]),
  simpleBlock: Buffer.from([0xa3]),
  blockGroup: Buffer.from([0xa0]),
  block: Buffer.from([0xa1]),
  void: Buffer.from([0xec]),
};

function encodeEbmlSize(size) {
  const value = BigInt(size);
  for (let length = 1; length <= 8; length += 1) {
    const maximum = (1n << BigInt(7 * length)) - 2n;
    if (value > maximum) continue;
    const bytes = Buffer.alloc(length);
    let remainder = value;
    for (let index = length - 1; index >= 0; index -= 1) {
      bytes[index] = Number(remainder & 0xffn);
      remainder >>= 8n;
    }
    bytes[0] |= 1 << (8 - length);
    return bytes;
  }
  throw new TypeError("Test EBML element is too large.");
}

function element(id, payload = Buffer.alloc(0)) {
  return Buffer.concat([id, encodeEbmlSize(payload.length), payload]);
}

function unknownMaster(id, payload = Buffer.alloc(0)) {
  return Buffer.concat([id, Buffer.from([0xff]), payload]);
}

function trackEntry(number, type, codecId) {
  return element(IDS.trackEntry, Buffer.concat([
    element(IDS.trackNumber, Buffer.from([number])),
    element(IDS.trackType, Buffer.from([type])),
    element(IDS.codecId, Buffer.from(codecId, "utf8")),
  ]));
}

function simpleBlock(trackNumber, marker = 0) {
  return element(IDS.simpleBlock, Buffer.from([0x80 | trackNumber, 0x00, 0x00, 0x80, marker]));
}

function simpleBlockPayload(trackNumber, payload = Buffer.alloc(0)) {
  return element(IDS.simpleBlock, Buffer.concat([
    Buffer.from([0x80 | trackNumber, 0x00, 0x00, 0x80]),
    payload,
  ]));
}

function webmFixture({
  docType = "webm",
  videoCodec = "V_VP9",
  audioCodec = "A_OPUS",
  videoTracks = 1,
  audioTracks = 1,
  videoFrames = true,
  audioFrames = true,
  marker = "",
} = {}) {
  const entries = [];
  const blocks = [];
  let trackNumber = 1;
  for (let index = 0; index < videoTracks; index += 1, trackNumber += 1) {
    entries.push(trackEntry(trackNumber, 1, videoCodec));
    if (videoFrames) blocks.push(simpleBlock(trackNumber, 0x10 + index));
  }
  for (let index = 0; index < audioTracks; index += 1, trackNumber += 1) {
    entries.push(trackEntry(trackNumber, 2, audioCodec));
    if (audioFrames) blocks.push(simpleBlock(trackNumber, 0x20 + index));
  }
  const segmentPayload = Buffer.concat([
    element(IDS.tracks, Buffer.concat(entries)),
    element(IDS.cluster, Buffer.concat(blocks)),
    ...(marker ? [element(IDS.void, Buffer.from(marker, "utf8"))] : []),
  ]);
  return Buffer.concat([
    element(IDS.ebml, element(IDS.docType, Buffer.from(docType, "utf8"))),
    element(IDS.segment, segmentPayload),
  ]);
}

function streamingWebmFixture({ unknownSegment = false, includeCues = false } = {}) {
  const entries = Buffer.concat([
    trackEntry(1, 1, "V_VP9"),
    trackEntry(2, 2, "A_OPUS"),
  ]);
  const clusters = [];
  for (let index = 0; index < 10; index += 1) {
    const trackNumber = index % 2 === 0 ? 1 : 2;
    const payload = index === 4
      ? Buffer.from([0x1f, 0x43, 0xb6, 0x75, 0xff])
      : Buffer.from([0x40 + index]);
    clusters.push(unknownMaster(IDS.cluster, Buffer.concat([
      element(IDS.timestamp, Buffer.from([index])),
      simpleBlockPayload(trackNumber, payload),
    ])));
    if (includeCues && index === 4) clusters.push(element(IDS.cues));
  }
  const segmentPayload = Buffer.concat([
    element(IDS.tracks, entries),
    ...clusters,
  ]);
  return Buffer.concat([
    element(IDS.ebml, element(IDS.docType, Buffer.from("webm", "utf8"))),
    unknownSegment ? unknownMaster(IDS.segment, segmentPayload) : element(IDS.segment, segmentPayload),
  ]);
}

function requestHeaders(overrides = {}) {
  return {
    "content-type": "video/webm;codecs=vp9,opus",
    "x-hapa-recording-id": "record-garden-session-test-0001",
    "x-hapa-recording-title": encodeURIComponent("Dear Papa · Record Garden Session"),
    "x-hapa-recording-duration": "12.500",
    "x-hapa-recording-width": "1280",
    "x-hapa-recording-height": "720",
    "x-hapa-recording-fps": "30",
    "x-hapa-recording-song-id": "dear-papa-song",
    "x-hapa-recording-song-title": encodeURIComponent("Dear Papa"),
    "x-hapa-recording-cut-id": "director-cut-0007",
    "x-hapa-recording-cut-title": encodeURIComponent("Garden Bloom Cut"),
    "x-hapa-recording-weather": "golden-hour",
    "x-hapa-recording-rights": "review-required-before-public-release",
    "x-hapa-recording-audio-tracks": "1",
    ...overrides,
  };
}

function normalizedRecording({ bytes = webmFixture(), headers = {} } = {}) {
  return normalizeEchoRecordGardenRecordingRequest({ headers: requestHeaders(headers), bytes });
}

function custodyReceipt(cardId, overrides = {}) {
  return {
    schemaVersion: "hapa.card-custody-receipt.v1",
    cardId,
    cardCoreKey: "a".repeat(64),
    cardRevisionId: "created-test-recording",
    cardRecordDigest: "b".repeat(64),
    originPublicKey: "c".repeat(64),
    createdAt: "2026-08-01T12:00:00.000Z",
    lifecycleStatus: "draft",
    custodyState: "origin_appended",
    minted: false,
    catalogPublished: false,
    canonical: false,
    commerceEligible: false,
    ...overrides,
  };
}

test("normalization verifies WebM MIME, document type, codecs, and real video/audio Tracks", () => {
  const bytes = webmFixture();
  const inspected = inspectEchoRecordGardenWebM(bytes);
  assert.deepEqual(inspected.videoCodecs, ["V_VP9"]);
  assert.deepEqual(inspected.audioCodecs, ["A_OPUS"]);
  assert.deepEqual(inspected.sampledTrackNumbers, [1, 2]);

  const recording = normalizedRecording({ bytes });
  assert.equal(recording.mimeType, "video/webm");
  assert.equal(recording.videoTracks, 1);
  assert.equal(recording.audioTracks, 1);
  assert.deepEqual(recording.videoCodecs, ["V_VP9"]);
  assert.deepEqual(recording.audioCodecs, ["A_OPUS"]);
  assert.equal(recording.contentHash, sha256Hex(bytes));
  assert.equal(echoRecordGardenRecordingBytesMatch(bytes, recording), true);
});

test("streaming WebM accepts flat unknown-size sibling Clusters with known or unknown Segment size", () => {
  for (const bytes of [
    streamingWebmFixture(),
    streamingWebmFixture({ unknownSegment: true }),
    streamingWebmFixture({ unknownSegment: true, includeCues: true }),
  ]) {
    const inspected = inspectEchoRecordGardenWebM(bytes);
    assert.equal(inspected.videoTracks, 1);
    assert.equal(inspected.audioTracks, 1);
    assert.deepEqual(inspected.sampledTrackNumbers, [1, 2]);
  }
});

test("streaming WebM unknown-size descendants and oversized Cluster scans fail closed", () => {
  const entries = Buffer.concat([
    trackEntry(1, 1, "V_VP9"),
    trackEntry(2, 2, "A_OPUS"),
  ]);
  const unknownBlockGroup = Buffer.concat([
    element(IDS.ebml, element(IDS.docType, Buffer.from("webm", "utf8"))),
    element(IDS.segment, Buffer.concat([
      element(IDS.tracks, entries),
      unknownMaster(IDS.cluster, unknownMaster(IDS.blockGroup, element(
        IDS.block,
        Buffer.from([0x81, 0x00, 0x00, 0x80, 0x01]),
      ))),
    ])),
  ]);
  assert.throws(
    () => inspectEchoRecordGardenWebM(unknownBlockGroup),
    (error) => error.code === "record_garden_recording_container_invalid" && /only.+Segment and Cluster.+unknown/iu.test(error.message),
  );

  const repeatedVoids = Buffer.alloc(2 * 131_073);
  for (let offset = 0; offset < repeatedVoids.length; offset += 2) {
    repeatedVoids[offset] = 0xec;
    repeatedVoids[offset + 1] = 0x80;
  }
  const overBudget = Buffer.concat([
    element(IDS.ebml, element(IDS.docType, Buffer.from("webm", "utf8"))),
    element(IDS.segment, Buffer.concat([
      element(IDS.tracks, entries),
      unknownMaster(IDS.cluster, repeatedVoids),
    ])),
  ]);
  assert.throws(
    () => inspectEchoRecordGardenWebM(overBudget),
    (error) => error.code === "record_garden_recording_container_invalid" && /bounded EBML element budget/iu.test(error.message),
  );
});

test("normalization rejects MIME/container/codec claims that do not describe the bytes", () => {
  const bytes = webmFixture();
  assert.throws(
    () => normalizedRecording({ bytes, headers: { "content-type": "video/mp4" } }),
    (error) => error.code === "record_garden_recording_mime_unsupported" && error.statusCode === 415,
  );
  assert.throws(
    () => normalizedRecording({ bytes: webmFixture({ docType: "matroska" }) }),
    (error) => error.code === "record_garden_recording_container_invalid",
  );
  assert.throws(
    () => normalizedRecording({ bytes, headers: { "content-type": "video/webm;codecs=vp8,opus" } }),
    (error) => error.code === "record_garden_recording_codec_mismatch",
  );
  assert.throws(
    () => normalizeEchoRecordGardenRecordingRequest({ headers: requestHeaders(), bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]) }),
    (error) => error.code === "record_garden_recording_container_invalid",
  );
});

test("normalization requires an actual audio track and matching declared track count", () => {
  assert.throws(
    () => normalizedRecording({ bytes: webmFixture({ audioTracks: 0 }) }),
    (error) => error.code === "record_garden_recording_container_invalid" && /audio track/iu.test(error.message),
  );
  assert.throws(
    () => normalizedRecording({ bytes: webmFixture({ audioFrames: false }) }),
    (error) => error.code === "record_garden_recording_container_invalid" && /audio track has no media frames/iu.test(error.message),
  );
  assert.throws(
    () => normalizedRecording({ bytes: webmFixture({ audioTracks: 2 }), headers: { "x-hapa-recording-audio-tracks": "1" } }),
    (error) => error.code === "record_garden_recording_audio_mismatch",
  );
  assert.throws(
    () => normalizedRecording({ headers: { "x-hapa-recording-audio-tracks": "0" } }),
    (error) => error.code === "record_garden_recording_metadata_invalid",
  );
});

test("normalization requires explicit safe song and Director cut identifiers", () => {
  for (const [header, value] of [
    ["x-hapa-recording-song-id", ""],
    ["x-hapa-recording-song-id", "short"],
    ["x-hapa-recording-song-id", "unsafe song id"],
    ["x-hapa-recording-cut-id", ""],
    ["x-hapa-recording-cut-id", "cut"],
    ["x-hapa-recording-cut-id", "unsafe/cut"],
  ]) {
    assert.throws(
      () => normalizedRecording({ headers: { [header]: value } }),
      (error) => error.code === "record_garden_recording_lineage_invalid" && error.statusCode === 422,
    );
  }
});

test("duration, dimensions, frame rate, declared digest, and maximum size fail closed", () => {
  assert.equal(
    normalizedRecording({ headers: { "x-hapa-recording-duration": String(ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS + 1) } }).durationSeconds,
    ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS + 1,
    "the bounded one-second MediaRecorder finalization tolerance remains explicit",
  );
  for (const duration of ["", "0", "NaN", String(ECHO_RECORD_GARDEN_RECORDING_MAX_SECONDS + 1.001)]) {
    assert.throws(
      () => normalizedRecording({ headers: { "x-hapa-recording-duration": duration } }),
      (error) => ["record_garden_recording_metadata_invalid", "record_garden_recording_duration_invalid"].includes(error.code),
    );
  }
  assert.throws(
    () => normalizedRecording({ headers: { "x-hapa-recording-width": "0" } }),
    (error) => error.code === "record_garden_recording_metadata_invalid",
  );
  assert.throws(
    () => normalizedRecording({ headers: { "x-hapa-recording-fps": "30.5" } }),
    (error) => error.code === "record_garden_recording_metadata_invalid",
  );
  assert.throws(
    () => normalizedRecording({ headers: { "x-hapa-recording-sha256": "f".repeat(64) } }),
    (error) => error.code === "record_garden_recording_digest_mismatch" && error.statusCode === 409,
  );
  const oversized = Buffer.allocUnsafe(ECHO_RECORD_GARDEN_RECORDING_MAX_BYTES + 1);
  assert.throws(
    () => normalizeEchoRecordGardenRecordingRequest({ headers: requestHeaders(), bytes: oversized }),
    (error) => error.code === "record_garden_recording_too_large" && error.statusCode === 413,
  );
});

test("filename and Card identity are deterministic from content plus declared song/cut lineage", () => {
  const bytes = webmFixture({ marker: "identity-a" });
  const first = normalizedRecording({ bytes });
  const retry = normalizedRecording({
    bytes,
    headers: { "x-hapa-recording-id": "record-garden-session-test-9999" },
  });
  const mediaUri = `/media/${echoRecordGardenRecordingFileName(first)}`;
  const firstCard = buildEchoRecordGardenRecordingCard({
    recording: first,
    mediaUri,
    createdAt: "2026-08-01T12:00:00.000Z",
    actorId: "calder",
  });
  const retryCard = buildEchoRecordGardenRecordingCard({
    recording: retry,
    mediaUri,
    createdAt: "2026-08-02T12:00:00.000Z",
    actorId: "another-local-operator",
  });
  assert.equal(echoRecordGardenRecordingFileName(first), `echo-record-garden-${sha256Hex(bytes)}.webm`);
  assert.equal(retryCard.id, firstCard.id, "session and wall-clock metadata do not fork content identity");

  const changedBytes = webmFixture({ marker: "identity-b" });
  const changed = normalizedRecording({ bytes: changedBytes });
  const changedCard = buildEchoRecordGardenRecordingCard({
    recording: changed,
    mediaUri: `/media/${echoRecordGardenRecordingFileName(changed)}`,
  });
  assert.notEqual(changedCard.id, firstCard.id);
  assert.throws(
    () => buildEchoRecordGardenRecordingCard({ recording: first, mediaUri: "/media/not-content-addressed.webm" }),
    /content-addressed/iu,
  );
});

test("the proposed Card binds content lineage and exposes a full-bleed looping presentation without claiming durability", () => {
  const recording = normalizedRecording();
  const card = buildEchoRecordGardenRecordingCard({
    recording,
    mediaUri: `/media/${echoRecordGardenRecordingFileName(recording)}`,
    createdAt: "2026-08-01T12:00:00.000Z",
    actorId: "calder",
  });
  assert.equal(card.truthStatus, "proposed-unminted-recording-card");
  assert.equal(card.minted, false);
  assert.equal(card.published, false);
  assert.equal(card.canonical, false);
  assert.equal(card.commerceEligible, false);
  assert.equal(card.sourceRefs[0].recordDigest, recording.contentHash);
  assert.equal(card.lineage.sourceSongId, "dear-papa-song");
  assert.equal(card.lineage.sourceCutId, "director-cut-0007");
  assert.equal(card.echoRecordAttachment.presentation.playbackMode, "loop");
  assert.equal(card.echoRecordAttachment.presentation.clockLocked, false);
  assert.equal(card.echoRecordAttachment.presentation.videoUri, card.assets[0].uri);
  assert.equal(card.assets[0].metadata.audioTracks, 1);
  assert.deepEqual(card.assets[0].metadata.audioCodecs, ["A_OPUS"]);
});

test("custody finalization rehydrates the persisted Tarot projection while preserving the false mint boundary", () => {
  const recording = normalizedRecording();
  const proposed = buildEchoRecordGardenRecordingCard({
    recording,
    mediaUri: `/media/${echoRecordGardenRecordingFileName(recording)}`,
    createdAt: "2026-08-01T12:00:00.000Z",
    actorId: "calder",
  });
  const receipt = custodyReceipt(proposed.id);
  const persistedProjection = createTarotCard({
    ...proposed,
    cardCoreKey: receipt.cardCoreKey,
    cardRevisionId: receipt.cardRevisionId,
    cardRecordDigest: receipt.cardRecordDigest,
    custody: receipt,
  });
  const finalized = finalizeEchoRecordGardenRecordingCard({ card: persistedProjection, receipt });
  assert.equal(finalized.truthStatus, "durable-local-card");
  assert.equal(finalized.minted, false);
  assert.equal(finalized.published, false);
  assert.equal(finalized.canonical, false);
  assert.equal(finalized.commerceEligible, false);
  assert.equal(finalized.authorityState.custody, "origin_appended");
  assert.equal(finalized.echoRecordAttachment.presentation.playbackMode, "loop");
  assert.equal(finalized.echoRecordAttachment.sourceRevisionId, recording.contentHash);
  assert.equal(finalized.sourceRefs[0].recordDigest, recording.contentHash);
  assert.equal(finalized.lineage.captureSessionId, recording.sessionId);
  assert.throws(
    () => finalizeEchoRecordGardenRecordingCard({ card: persistedProjection, receipt: custodyReceipt(proposed.id, { minted: true }) }),
    /must remain unminted/iu,
  );
});

test("idempotency keys are mandatory, exact, and transaction operations remain serialized after failure", async () => {
  const sessionId = "record-garden-session-test-0001";
  assert.equal(
    validateEchoRecordGardenRecordingIdempotencyKey(`record-garden:${sessionId}`, sessionId),
    `record-garden:${sessionId}`,
  );
  assert.throws(
    () => validateEchoRecordGardenRecordingIdempotencyKey("", sessionId),
    (error) => error.code === "record_garden_recording_idempotency_required" && error.statusCode === 428,
  );
  assert.throws(
    () => validateEchoRecordGardenRecordingIdempotencyKey("record-garden:different-session", sessionId),
    (error) => error.code === "record_garden_recording_idempotency_mismatch" && error.statusCode === 409,
  );

  const order = [];
  const first = runEchoRecordGardenRecordingTransaction(async () => {
    order.push("first:start");
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push("first:end");
  });
  const failed = runEchoRecordGardenRecordingTransaction(async () => {
    order.push("failed:start");
    throw new Error("expected transaction failure");
  });
  const last = runEchoRecordGardenRecordingTransaction(async () => {
    order.push("last:start");
    order.push("last:end");
  });
  await first;
  await assert.rejects(failed, /expected transaction failure/);
  await last;
  assert.deepEqual(order, ["first:start", "first:end", "failed:start", "last:start", "last:end"]);
});

test("the API route durably binds the full request before custody and checkpoints deterministic subscriber delivery", async () => {
  const apiSource = await readFile(new URL("../server/api.mjs", import.meta.url), "utf8");
  const start = apiSource.indexOf('if (pathname === "/api/echo-record-garden/recordings"');
  const end = apiSource.indexOf('if (pathname === "/api/media"', start);
  assert.ok(start >= 0 && end > start, "recording route is present");
  const route = apiSource.slice(start, end);
  assert.match(route, /requireAdmin\(req, res\)/);
  assert.match(route, /validateEchoRecordGardenRecordingIdempotencyKey\(req\.headers\["idempotency-key"\], recording\.sessionId\)/);
  assert.match(route, /runEchoRecordGardenRecordingTransaction\(async \(\) =>/);
  assert.match(route, /echoRecordGardenRecordingTransactionLedger\.begin\(\{/);
  assert.match(route, /echoRecordGardenRecordingBytesMatch\(existingBytes, recording\)/);
  assert.match(route, /record_garden_recording_idempotency_conflict/);
  assert.doesNotMatch(route, /if \(idempotencyKey &&/);

  const ledgerAt = route.indexOf("echoRecordGardenRecordingTransactionLedger.begin");
  const mediaAt = route.indexOf("await mkdir(MEDIA_DIR");
  const custodyAt = route.indexOf("avatarCardCustodyService.ensure");
  const finalizeAt = route.indexOf("finalizeEchoRecordGardenRecordingCard", custodyAt);
  const addAt = route.indexOf("addTarotCard", finalizeAt);
  const writeAt = route.indexOf("writeTarotStore", addAt);
  assert.ok(ledgerAt >= 0 && ledgerAt < mediaAt && ledgerAt < custodyAt, "the durable request ledger precedes media and custody");
  assert.ok(custodyAt >= 0 && custodyAt < finalizeAt, "custody precedes durable truth projection");
  assert.ok(finalizeAt < addAt && addAt < writeAt, "custody-backed Card is normalized before store persistence");
  assert.match(route, /createdAt: recordingTransaction\.cardCreatedAt/);
  assert.match(route, /eventId: recordingTransaction\.subscriberEventId/);
  assert.match(route, /occurredAt: recordingTransaction\.subscriberOccurredAt/);
  assert.match(route, /step: "subscriber"/);
  assert.ok(
    route.indexOf("appendSubscriberRegistration") < route.indexOf('step: "subscriber"'),
    "the exact deterministic subscriber event is appended before its checkpoint",
  );
  assert.match(route, /minted: false/);
  assert.match(route, /Public mint, canon, publication, and commerce remain separate explicit authority actions/);
});
