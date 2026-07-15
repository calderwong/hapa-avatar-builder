import assert from "node:assert/strict";
import test from "node:test";
import { prepareEchoProjectForPersistence } from "../server/echo-project-persistence.mjs";

test("GET-hydrated Echo delivery state never enters the authoring source on save", () => {
  const hydrated = {
    song_id: "save-round-trip",
    output_profile: "vertical",
    timeline: [{ start_sec: 0, end_sec: 2 }],
    director_detail_profile: "editor-bounded-v1",
    selected_direction_script_variant_id: "cut-1",
    director_show_graph: { tracks: [{ id: "delivery-only" }] },
    director_show_graph_receipt: { status: "ready" },
    runtime_shader_repair_receipt: { status: "repaired" },
    execution_preview: { status: "ready" },
    direction_script_variants: [{ id: "cut-1", variant_source: { kind: "append-only-project-variant" } }],
  };
  const persisted = prepareEchoProjectForPersistence(hydrated);
  assert.equal(persisted.output_profile.id, "vertical");
  assert.equal(persisted.output_profile.width, 1080);
  assert.equal(persisted.director_detail_profile, undefined);
  assert.equal(persisted.selected_direction_script_variant_id, undefined);
  assert.equal(persisted.director_show_graph, undefined);
  assert.equal(persisted.director_show_graph_receipt, undefined);
  assert.equal(persisted.runtime_shader_repair_receipt, undefined);
  assert.equal(persisted.execution_preview, undefined);
  assert.equal(persisted.direction_script_variants, undefined);
  assert.deepEqual(hydrated.director_show_graph, { tracks: [{ id: "delivery-only" }] }, "source payload remains immutable");
});
