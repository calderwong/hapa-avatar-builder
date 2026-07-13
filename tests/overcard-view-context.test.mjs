import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveBuilderViewContext } from "../src/overcard/viewContext.js";

function attachment(hostId, entityType, entityId, status = "active") { return { id: `${hostId}:${entityId}`, status, host: { nodeId: "hapa-avatar-builder", hostId }, entity: { schema: "hapa.entity-ref.v2", sourceSystem: "test", entityType, entityId, availability: "available", label: entityId } }; }

test("non-executing hosts resolve only safe selection/filter actions", () => {
  const cases = [
    ["builder", "avatar", "select-avatar"], ["mind", "avatar", "select-avatar"], ["scenes", "scene", "select-scene"],
    ["items", "card", "select-item"], ["loops", "media", "select-loop"], ["lookbook", "avatar", "select-avatar"],
    ["lore", "scene", "select-scene"], ["songs", "song", "select-song"], ["echos", "song", "select-song"],
    ["kanban", "avatar", "select-avatar"], ["protocol", "avatar", "select-avatar"], ["bank", "avatar", "select-avatar"],
    ["tarot-library", "deck", "select-tarot-deck"], ["creator-sets", "set", "select-creator-set"],
  ];
  for (const [route, type, expected] of cases) {
    const result = resolveBuilderViewContext(route, [attachment(route, type, `${route}-entity`)]);
    assert.equal(result.actions[0].action, expected, route);
    assert.equal(result.attachments.length, 1);
  }
});

test("paused/detached records do not shape views and unsupported behavior is explicitly inert", () => {
  assert.equal(resolveBuilderViewContext("items", [attachment("items", "card", "card-a", "paused")]).attachments.length, 0);
  const unsupported = resolveBuilderViewContext("kanban", [attachment("kanban", "task", "task-a")]);
  assert.equal(unsupported.actions.length, 0);
  assert.match(unsupported.unsupported[0].reason, /context-only and inert/);
  assert.equal(resolveBuilderViewContext("hell-week", [attachment("hell-week", "avatar", "red")]).inert, true);
  assert.equal(resolveBuilderViewContext("tarot", [attachment("tarot", "card", "tarot-a")]).inert, true);
});

test("App applies source-available actions, shows shaping context, and restores captured defaults on detach", async () => {
  const [app, creator, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CreatorCardSetsView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /viewContextPreviousRef\.current\.set/);
  assert.match(app, /viewContextPreviousRef\.current\.delete/);
  assert.match(app, /setSelectedAvatarId\(previous\.avatarId\)/);
  assert.match(app, /setSelectedItemId\(action\.entityId\)/);
  assert.match(app, /setSelectedSceneId\(action\.entityId\)/);
  assert.match(app, /setSelectedTarotDeckId\(tarotDeckCollectionId/);
  assert.match(app, /builder-view-context-status/);
  assert.match(creator, /if \(contextSetId\) setSelectedSetId/);
  assert.match(css, /\.builder-view-context-status/);
});
