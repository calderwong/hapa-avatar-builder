import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  beginTarotWisdomCouncil,
  completeTarotWisdomCouncil,
  createTarotWisdomCouncilRig,
  failTarotWisdomCouncil,
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
