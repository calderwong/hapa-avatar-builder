import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EchoRecordGardenRecordingTransactionLedger,
  echoRecordGardenRecordingRequestFingerprint,
} from "../server/echo-record-garden-recording-transaction.mjs";

function recordingFixture(overrides = {}) {
  return {
    sessionId: "record-garden-session-ledger-0001",
    title: "Dear Papa · Record Garden Session",
    songId: "dear-papa-song",
    songTitle: "Dear Papa",
    cutId: "director-cut-0007",
    cutTitle: "Garden Bloom Cut",
    weatherPhase: "golden-hour",
    rightsStatus: "review-required-before-public-release",
    durationSeconds: 12.5,
    width: 1280,
    height: 720,
    fps: 30,
    videoTracks: 1,
    audioTracks: 1,
    mimeType: "video/webm",
    contentType: "video/webm;codecs=vp9,opus",
    videoCodecs: ["V_VP9"],
    audioCodecs: ["A_OPUS"],
    sizeBytes: 8192,
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

function checkpoint(ledger, transaction, step, details = {}) {
  return ledger.checkpoint({
    sessionId: transaction.sessionId,
    requestFingerprint: transaction.requestFingerprint,
    step,
    details,
  });
}

test("the durable transaction fingerprint binds every normalized request field and actor", () => {
  const recording = recordingFixture();
  const baseline = echoRecordGardenRecordingRequestFingerprint(recording, { actorId: "local-operator" });
  for (const changed of [
    recordingFixture({ title: "Changed title" }),
    recordingFixture({ durationSeconds: 12.6 }),
    recordingFixture({ weatherPhase: "night" }),
    recordingFixture({ rightsStatus: "cleared-for-public-release" }),
    recordingFixture({ width: 1920 }),
    recordingFixture({ contentHash: "b".repeat(64) }),
  ]) {
    assert.notEqual(echoRecordGardenRecordingRequestFingerprint(changed, { actorId: "local-operator" }), baseline);
  }
  assert.notEqual(
    echoRecordGardenRecordingRequestFingerprint(recording, { actorId: "another-operator" }),
    baseline,
  );
});

test("a crash between durable steps resumes the same transaction and changed replay fails before another effect", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "record-garden-transaction-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let tick = 0;
  const now = () => `2026-08-01T12:00:0${tick++}.000Z`;
  const firstProcess = new EchoRecordGardenRecordingTransactionLedger({ root, now });
  const recording = recordingFixture();
  const opened = await firstProcess.begin({
    recording,
    actorId: "local-operator",
    cardId: "record-garden-card-ledger-0001",
    mediaUri: "/media/record-garden-ledger-0001.webm",
  });
  assert.equal(opened.created, true);
  let transaction = await checkpoint(firstProcess, opened.transaction, "prepared", {
    cardPreexisting: false,
    subscriberAction: "tarot.card-created",
  });
  transaction = await checkpoint(firstProcess, transaction, "media", {
    mediaUri: transaction.mediaUri,
    sha256: recording.contentHash,
    sizeBytes: recording.sizeBytes,
  });

  // Simulate custody succeeding externally and the process stopping before its ledger checkpoint.
  let custodyEffects = 1;
  const restarted = new EchoRecordGardenRecordingTransactionLedger({ root, now });
  const replay = await restarted.begin({
    recording,
    actorId: "local-operator",
    cardId: transaction.cardId,
    mediaUri: transaction.mediaUri,
  });
  assert.equal(replay.created, false);
  assert.ok(replay.transaction.steps.media);
  assert.equal(replay.transaction.steps.custody, undefined);
  assert.equal(replay.transaction.cardCreatedAt, opened.transaction.cardCreatedAt);
  assert.equal(replay.transaction.subscriberEventId, opened.transaction.subscriberEventId);

  await assert.rejects(
    restarted.begin({
      recording: recordingFixture({ rightsStatus: "cleared-for-public-release" }),
      actorId: "local-operator",
      cardId: transaction.cardId,
      mediaUri: transaction.mediaUri,
    }),
    (error) => error.code === "record_garden_recording_idempotency_conflict" && error.statusCode === 409,
  );
  assert.equal(custodyEffects, 1, "a changed replay is rejected before a second custody effect");

  custodyEffects += 1;
  transaction = await checkpoint(restarted, replay.transaction, "custody", {
    cardId: transaction.cardId,
    cardCoreKey: "b".repeat(64),
    cardRecordDigest: "c".repeat(64),
  });
  transaction = await checkpoint(restarted, transaction, "tarot", {
    cardId: transaction.cardId,
    cardCoreKey: "b".repeat(64),
    cardRecordDigest: "c".repeat(64),
  });
  transaction = await checkpoint(restarted, transaction, "subscriber", {
    action: "tarot.card-created",
    eventId: transaction.subscriberEventId,
  });
  transaction = await checkpoint(restarted, transaction, "complete", {
    cardId: transaction.cardId,
    cardCoreKey: "b".repeat(64),
    cardRecordDigest: "c".repeat(64),
  });
  assert.ok(transaction.steps.complete);

  const durableBytes = await readFile(restarted.transactionPath(recording.sessionId), "utf8");
  const durable = JSON.parse(durableBytes);
  assert.equal(durable.requestFingerprint, replay.transaction.requestFingerprint);
  assert.equal(durable.steps.subscriber.eventId, durable.subscriberEventId);
  assert.equal(custodyEffects, 2, "the same Card custody operation may be safely re-ensured after the crash boundary");
});

test("checkpoint order and durable evidence remain fail-closed across retries", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "record-garden-checkpoint-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ledger = new EchoRecordGardenRecordingTransactionLedger({ root });
  const opened = await ledger.begin({
    recording: recordingFixture(),
    actorId: "local-operator",
    cardId: "record-garden-card-ledger-0001",
    mediaUri: "/media/record-garden-ledger-0001.webm",
  });
  await assert.rejects(
    checkpoint(ledger, opened.transaction, "custody", {}),
    (error) => error.code === "record_garden_recording_transaction_step_invalid" && error.statusCode === 500,
  );
  let transaction = await checkpoint(ledger, opened.transaction, "prepared", {
    cardPreexisting: false,
    subscriberAction: "tarot.card-created",
  });
  transaction = await checkpoint(ledger, transaction, "media", {
    mediaUri: transaction.mediaUri,
    sha256: transaction.request.contentHash,
    sizeBytes: transaction.request.sizeBytes,
  });
  await assert.rejects(
    checkpoint(ledger, transaction, "media", {
      mediaUri: transaction.mediaUri,
      sha256: "f".repeat(64),
      sizeBytes: transaction.request.sizeBytes,
    }),
    (error) => error.code === "record_garden_recording_transaction_step_conflict" && error.statusCode === 409,
  );
});
