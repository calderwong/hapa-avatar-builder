import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AvatarMediaCommentService,
  openAvatarMediaCommentService,
  verifyAvatarMediaCommentEvents,
} from "../server/avatar-media-comment-service.mjs";

function sourceCard() {
  return {
    id: "hapa-card:content:red-demo",
    cardId: "hapa-card:content:red-demo",
    title: "Creator Signal",
    cardRevisionId: "r7",
    cardCoreKey: "b".repeat(64),
    cardRecordDigest: "c".repeat(64),
    summary: "The exact source Card must remain unchanged.",
  };
}

function request(deviceKind = "browser_webcam") {
  return {
    sourceCard: sourceCard(),
    context: {
      timecode: { startSeconds: 12.5, endSeconds: 19.25 },
      formationDigest: "d".repeat(64),
      gateCommitment: "e".repeat(64),
      redactedAddress: "hapa-gate:v1:example…withheld",
    },
    actor: { actorId: "calder", actorType: "human", displayName: "Calder" },
    device: { kind: deviceKind, deviceId: `${deviceKind}-01`, displayLabel: deviceKind === "physical_phone" ? "Calder's iPhone" : "Builder Webcam" },
  };
}

test("consent is required before a separate proposed Comment Card can be finalized", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-avatar-comment-"));
  try {
    const service = new AvatarMediaCommentService({ root });
    const capture = await service.createCapture(request());
    await assert.rejects(() => service.finalizeCapture(capture.captureId, {
      bytes: Buffer.from("webm-comment"), mimeType: "video/webm", durationSeconds: 4, width: 640, height: 360,
      actorId: "calder", deviceId: "browser_webcam-01",
    }), /Explicit consent/);

    await service.grantConsent(capture.captureId, { authorityId: "calder", allowAudio: true, evidenceNote: "Checked in the Tarot Draw consent chamber" });
    const finalized = await service.finalizeCapture(capture.captureId, {
      bytes: Buffer.from("webm-comment"), mimeType: "video/webm", durationSeconds: 4, width: 640, height: 360,
      actorId: "calder", deviceId: "browser_webcam-01",
    });

    assert.equal(finalized.card.cardType, "comment_card");
    assert.notEqual(finalized.card.id, sourceCard().id);
    assert.equal(finalized.card.comment.sourceCardRef.revisionId, "r7");
    assert.equal(finalized.card.comment.excludedFromGateIdentity, true);
    assert.equal(finalized.originUnchanged, true);
    assert.equal(finalized.proposed, true);
    assert.equal(finalized.minted, false);
    assert.equal(finalized.lessonCard.cardType, "lesson_card");
    assert.equal(finalized.resultCard.results.sourceUnchanged, true);
    assert.equal(finalized.card.attributionEdges[0].actor.actorId, "calder");
    assert.match(finalized.card.summary, /source Card is unchanged/i);
    assert.equal(service.list().cardCount, 3);
    assert.equal(verifyAvatarMediaCommentEvents(service.events), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("physical phone capabilities are token-bound and stay distinct from independent device evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-avatar-phone-comment-"));
  try {
    const service = new AvatarMediaCommentService({ root });
    const capture = await service.createCapture(request("physical_phone"));
    assert.ok(capture.inviteToken);
    await assert.rejects(() => service.grantConsent(capture.captureId, { authorityId: "calder" }), /capability is invalid/);
    await service.grantConsent(capture.captureId, { authorityId: "calder", evidenceNote: "Confirmed on phone" }, { inviteToken: capture.inviteToken });
    const finalized = await service.finalizeCapture(capture.captureId, {
      bytes: Buffer.from("phone-mp4"), mimeType: "video/mp4", durationSeconds: 3.2, width: 1080, height: 1920,
      actorId: "calder", deviceId: "physical_phone-01", inviteToken: capture.inviteToken,
    });
    assert.match(finalized.physicalDeviceClaim, /independent physical-device demo evidence required/);
    assert.equal(finalized.card.comment.device.kind, "physical_phone");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("append-only Comment history reopens with byte-identical custody state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-avatar-comment-reopen-"));
  try {
    const first = new AvatarMediaCommentService({ root });
    const capture = await first.createCapture(request());
    await first.grantConsent(capture.captureId, { authorityId: "calder" });
    await first.finalizeCapture(capture.captureId, {
      bytes: Buffer.from("durable-webm"), mimeType: "video/webm", durationSeconds: 2, width: 640, height: 360,
      actorId: "calder", deviceId: "browser_webcam-01",
    });
    const before = first.list();
    const reopened = await openAvatarMediaCommentService({ root });
    const after = reopened.list();
    assert.equal(after.headEventHash, before.headEventHash);
    assert.deepEqual(after.cards, before.cards);
    assert.equal((await readFile(path.join(root, "events.ndjson"), "utf8")).trim().split("\n").length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("capture creation fails closed when the selected source lacks custody identity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-avatar-comment-invalid-"));
  try {
    const service = new AvatarMediaCommentService({ root });
    await assert.rejects(() => service.createCapture({ ...request(), sourceCard: { id: "ordinary-card", title: "Ordinary Card" } }), /sourceCard.revisionId is required/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
