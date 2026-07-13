import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getBuilderOvercardManagementTarget } from "../src/overcard/hostTargets.js";

test("management destinations come from HostTarget metadata rather than canonical package routes", async () => {
  assert.equal(getBuilderOvercardManagementTarget("hand"), null);
  assert.equal(getBuilderOvercardManagementTarget("deck").launchAction.view, "tarot-library");
  assert.equal(getBuilderOvercardManagementTarget("set").launchAction.view, "creator-sets");
  assert.equal(getBuilderOvercardManagementTarget("library").launchAction.view, "tarot-library");
  const canonical = await readFile("/Users/calderwong/Desktop/hapa-overcard/src/react/hand.ts", "utf8");
  assert.doesNotMatch(canonical, /tarot-library|creator-sets|hapa-avatar-builder/);
});

test("Header ingress uses push/back routing while the provider and held state remain mounted", async () => {
  const [app, hand, main] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/BuilderHeaderHand.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /getBuilderOvercardManagementTarget\(kind\)/);
  assert.match(app, /history\?\.pushState/);
  assert.match(app, /addEventListener\?\.\("popstate"/);
  assert.match(hand, /onOpenManager=\{onOpenManager\}/);
  assert.match(hand, /onOpenLibrary=\{onOpenLibrary\}/);
  assert.match(main, /<OvercardProvider[\s\S]*<App/);
});
