import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCardOriginAnnouncementProof } from "../server/card-origin-announcement-proof.mjs";

test("one exact signed origin event reaches and is stored by a distinct local peer", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-origin-announcement-"));
  const proof = await runCardOriginAnnouncementProof({
    profileRoot: root,
    origin: {
      cardId: "hapa-card:v1:test:proposal",
      revision: 1,
      eventId: "hapa-card-event:v1:test:1",
      eventDigest: `sha256:${"a".repeat(64)}`,
      originSequence: 1,
      contentDigest: `sha256:${"b".repeat(64)}`
    },
    decisionDigest: "c".repeat(64),
    timeoutMs: 45_000
  });
  assert.equal(proof.status, "passed");
  assert.equal(proof.isolation.distinctOperatingSystemProcesses, true);
  assert.equal(proof.isolation.distinctStableNodeIds, true);
  assert.equal(proof.transport.hyperswarmConnectionObserved, true);
  assert.equal(proof.transport.noiseEncryptedStreamObserved, true);
  assert.equal(proof.announcement.applicationSignatureVerified, true);
  assert.equal(proof.announcement.receiverAcknowledgementVerified, true);
  assert.equal(proof.announcement.exactReceiverCopyStored, true);
  assert.equal(proof.transport.geographicallyRemotePeerClaimed, false);
});
