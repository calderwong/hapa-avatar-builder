import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPublicDemoGateCards,
  deriveStargate,
  redactedStargateAddress,
  resolveStargateCardIdentity,
  STARGATE_FORMATION_SCHEMA,
  STARGATE_PROTOCOL_VERSION,
  STARGATE_PUBLIC_DEMO_SECRET,
} from "../src/domain/tarot-stargate-derivation.js";

const EXPECTED_GOLDEN_DIGEST = "121814ebb6adad60af103fdce1cbfe0a70edcca8ef0846e6260b9f5c8a45be8f";
const EXPECTED_GOLDEN_ADDRESS = "hapa-gate:v1:72eeamh2g3mxe2jbnww44f4wbvrgl4o3od242ikj6mpmv3wn2gnq";

function publicDemoFormation() {
  return {
    schemaVersion: STARGATE_FORMATION_SCHEMA,
    purposeCode: "build-week-domino",
    members: buildPublicDemoGateCards().map((card, position) => resolveStargateCardIdentity(card, null, position).member),
  };
}

test("canonical Avatar Builder derivation stays byte-compatible with the tested public Stargate vector", () => {
  const result = deriveStargate({
    formation: publicDemoFormation(),
    protocolVersion: STARGATE_PROTOCOL_VERSION,
    privacyScope: "invite_only",
    cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET,
  });
  assert.equal(result.formationDigest, EXPECTED_GOLDEN_DIGEST);
  assert.equal(result.stargateAddress, EXPECTED_GOLDEN_ADDRESS);
  assert.equal(redactedStargateAddress(result.stargateAddress), "hapa-gate:v1:72eeamh2g3…v3wn2gnq");
  assert.equal(result.canonicalFormation.members.length, 4);
});

test("Card order changes the semantic and private destination", () => {
  const baselineFormation = publicDemoFormation();
  const baseline = deriveStargate({ formation: baselineFormation, protocolVersion: STARGATE_PROTOCOL_VERSION, privacyScope: "invite_only", cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET });
  const reordered = structuredClone(baselineFormation);
  const [first, second] = reordered.members;
  reordered.members[0] = { ...second, position: 0 };
  reordered.members[1] = { ...first, position: 1 };
  const changed = deriveStargate({ formation: reordered, protocolVersion: STARGATE_PROTOCOL_VERSION, privacyScope: "invite_only", cohortSecretBase64Url: STARGATE_PUBLIC_DEMO_SECRET });
  assert.notEqual(changed.formationDigest, baseline.formationDigest);
  assert.notEqual(changed.stargateAddress, baseline.stargateAddress);
});

test("an ordinary Card without custody identity fails visibly instead of receiving invented identity", () => {
  const identity = resolveStargateCardIdentity({ id: "ordinary-card", title: "Ordinary Card" }, null, 0);
  assert.equal(identity.ok, false);
  assert.deepEqual(identity.missing, ["cardCoreKey", "cardRevisionId", "cardRecordDigest"]);
  assert.equal(identity.member.cardId, "ordinary-card");
});

test("Tarot Draw source exposes the hero action, truth states, safe diagnostics, and reduced-motion path", async () => {
  const [component, visual, css] = await Promise.all([
    readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/domain/tarot-stargate-visual.js", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);
  for (const token of ["toggleStargateMode", "dialStargate", "loadStargateDemoFormation", "needs_identity", "dialing", "active", "stale", "expired", "disconnected", "privateTopicWithheld", "cohortSecretWithheld"]) {
    assert.match(component, new RegExp(token));
  }
  for (const token of ["stargateAperture", "stargateIris", "stargateEventHorizon", "stargateEnergyRibbon", "stargateDestinationConstellation", "uOpen", "reducedMotion"]) {
    assert.match(visual, new RegExp(token));
  }
  assert.match(css, /\.tarot-stargate-status/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(component, /stargateResult\.rendezvousTopic/);
});
