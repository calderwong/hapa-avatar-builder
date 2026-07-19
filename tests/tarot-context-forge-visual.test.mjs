import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  beginTarotContextForge,
  createTarotContextForgeRig,
  setTarotContextForgeStage,
  updateTarotContextForgeRig,
} from "../src/domain/tarot-context-forge-visual.js";

test("Context Forge makes ordered source rails converge and reveals distinct scaffold/provider proposals", () => {
  const rig = createTarotContextForgeRig();
  assert.equal(rig.group.visible, false);
  beginTarotContextForge(rig, { sourceCount: 4, mode: "deterministic_scaffold", elapsed: 0 });
  assert.equal(rig.group.visible, true);
  assert.equal(rig.glyphs.length, 4);
  assert.equal(rig.rails.length, 4);
  updateTarotContextForgeRig(rig, { delta: 0.016, elapsed: 3, gateOpen: true });
  assert.ok(rig.glyphs[0].position.distanceTo(rig.glyphs[0].userData.start) > 0.5);
  setTarotContextForgeStage(rig, { state: "scaffold", packetDigest: "a".repeat(64), runDigest: "b".repeat(64), elapsed: 3 });
  updateTarotContextForgeRig(rig, { delta: 0.016, elapsed: 5, gateOpen: true });
  assert.ok(rig.proposal.scale.x > 0.9);
  assert.equal(rig.proposalPlate.material.color.getHex(), 0x45f2c8);

  beginTarotContextForge(rig, { sourceCount: 3, mode: "ollama_local", elapsed: 6 });
  setTarotContextForgeStage(rig, { state: "proposal", elapsed: 6 });
  updateTarotContextForgeRig(rig, { delta: 0.016, elapsed: 8, gateOpen: true });
  assert.equal(rig.proposalPlate.material.color.getHex(), 0xff6df2);
  assert.ok(rig.proposal.scale.x > 0.9);
});

test("Tarot UI exposes the two-step Context Forge and explicit truth boundary", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);
  for (const token of ["Stargate Context Forge", "Freeze Context Packet", "Materialize Proposal", "No generation claim", "Ollama Local", "No auto-mint", "contextForgeDraft", "completeContextGeneration"]) assert.match(component, new RegExp(token));
  for (const token of ["tarot-context-forge-chamber", "tarot-context-forge-machine", "tarot-context-source-fan", "tarot-context-provider-orb", "tarot-context-result-print"]) assert.match(css, new RegExp(token));
});
