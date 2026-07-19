import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  beginTarotProposalReview,
  beginTarotWisdomCouncil,
  completeTarotProposalMint,
  completeTarotWisdomCouncil,
  createTarotWisdomCouncilRig,
  failTarotWisdomCouncil,
  recordTarotProposalDecision,
  updateTarotWisdomCouncilRig,
} from "../src/domain/tarot-wisdom-council-visual.js";

test("Wisdom Council rig stages three isolated sentinels, five dissent fault lines, and human authority", () => {
  const rig = createTarotWisdomCouncilRig();
  assert.equal(rig.group.visible, false);
  assert.equal(rig.seats.length, 3);
  assert.equal(rig.partitions.length, 2);
  assert.equal(rig.faultLines.length, 5);
  assert.ok(rig.humanDais.scale.x < 0.01);

  beginTarotWisdomCouncil(rig, { seatCount: 3, elapsed: 0 });
  updateTarotWisdomCouncilRig(rig, { delta: 0.016, elapsed: 2, gateOpen: true });
  assert.equal(rig.group.visible, true);
  assert.ok(rig.seats.every((seat) => seat.group.visible));
  assert.ok(rig.beams.every(({ beam, packet }) => beam.visible && packet.visible));

  completeTarotWisdomCouncil(rig, { countsByCategory: { scope: 1, goal: 1, evidence: 1, mechanism: 1, "true-tradeoff": 1 }, creativeDirectorCount: 1, elapsed: 2 });
  updateTarotWisdomCouncilRig(rig, { delta: 0.016, elapsed: 4, gateOpen: true });
  assert.ok(rig.faultLines.every(({ fracture, shard }) => fracture.material.opacity > 0 && shard.material.opacity > 0));
  assert.ok(rig.humanDais.scale.x > 0.9);
  assert.ok(rig.sealRing.material.opacity > 0);

  failTarotWisdomCouncil(rig, { elapsed: 4 });
  assert.equal(rig.state, "failed");
  assert.ok(rig.faultLines.every(({ fracture, shard }) => fracture.material.opacity === 0 && shard.material.opacity === 0));
});

test("Mint Gate rig moves one proposal through four custody beacons into one Result Card portal", () => {
  const rig = createTarotWisdomCouncilRig();
  beginTarotProposalReview(rig, { elapsed: 1 });
  updateTarotWisdomCouncilRig(rig, { delta: 0.016, elapsed: 2, gateOpen: true });
  assert.equal(rig.mintGate.visible, true);
  assert.equal(rig.mintNodes.length, 4);
  assert.ok(rig.proposalToken.scale.x > 0.9);
  assert.ok(rig.resultPortal.scale.x < 0.01);

  recordTarotProposalDecision(rig, { decision: "approve", elapsed: 2 });
  updateTarotWisdomCouncilRig(rig, { delta: 0.016, elapsed: 5, gateOpen: true });
  assert.equal(rig.mintState, "minting");
  assert.ok(rig.mintProgress > 0.6 && rig.mintProgress < 1);
  assert.ok(rig.mintNodes.filter((node) => node.active).length >= 3);

  completeTarotProposalMint(rig, { elapsed: 6.5 });
  updateTarotWisdomCouncilRig(rig, { delta: 0.016, elapsed: 7, gateOpen: true });
  assert.equal(rig.mintState, "peer_announced");
  assert.equal(rig.mintNodes.filter((node) => node.active).length, 4);
  assert.ok(rig.resultPortal.scale.x > 0.9);
});

test("Tarot UI, CSS, API, and CLI expose the same Council truth boundary", async () => {
  const [component, css, api, cli] = await Promise.all([
    readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../cli/avatar-builder.mjs", import.meta.url), "utf8"),
  ]);
  for (const token of ["Stargate Wisdom Council", "PEER-BLIND CHAMBERS", "DISSENT SEALED", "No sibling prompts", "No averaged verdict", "HUMAN AUTHORITY", "proposed only", "beginWisdomCouncil", "completeWisdomCouncil"]) assert.match(component, new RegExp(token, "i"));
  for (const token of ["tarot-wisdom-council-chamber", "tarot-wisdom-seat", "tarot-wisdom-blind-walls", "tarot-wisdom-dissent-spectrum", "tarot-wisdom-human-dais"]) assert.match(css, new RegExp(token));
  assert.match(api, /\/api\/wisdom-councils/);
  assert.match(api, /\/api\/wisdom-councils\/runs/);
  assert.match(cli, /wisdom-foundation/);
  assert.match(cli, /wisdom-councils/);
  assert.match(cli, /wisdom-council-run/);
});

test("Tarot UI, CSS, API, and CLI expose the same explicit Mint Gate decisions", async () => {
  const [component, css, api, cli] = await Promise.all([
    readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../cli/avatar-builder.mjs", import.meta.url), "utf8"),
  ]);
  for (const token of ["Human Mint Gate", "Revise", "Reject", "Defer", "Approve \\+ Mint", "Human → Origin → Overwind → Catalog → distinct local peer", "beginProposalReview", "completeProposalMint"]) assert.match(component, new RegExp(token, "i"));
  for (const token of ["tarot-proposal-mint-gate", "tarot-mint-authority-door", "tarot-mint-custody-rail", "tarot-mint-result-card", "tarot-mint-card-crossing"]) assert.match(css, new RegExp(token));
  assert.match(api, /\/api\/proposal-reviews\/open/);
  assert.match(api, /\/api\/proposal-reviews\/decisions/);
  assert.match(cli, /proposal-review-open/);
  assert.match(cli, /proposal-decide/);
});
