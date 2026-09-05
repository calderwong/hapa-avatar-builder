import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ECHO_KANBAN_MANUAL_STATUS_CYCLE,
  planEchoKanbanManualStatusTransition,
} from "../src/domain/echo-kanban-status.js";

test("ordinary Echo board cards keep the explicit three-state manual cycle", () => {
  assert.deepEqual(ECHO_KANBAN_MANUAL_STATUS_CYCLE, {
    todo: "in_progress",
    in_progress: "done",
    done: "todo",
  });
  assert.equal(planEchoKanbanManualStatusTransition("todo").nextStatus, "in_progress");
  assert.equal(planEchoKanbanManualStatusTransition("in_progress").nextStatus, "done");
  assert.equal(planEchoKanbanManualStatusTransition("done").nextStatus, "todo");
});

test("blocked and unknown Echo board states cannot be silently reset to todo", () => {
  assert.deepEqual(planEchoKanbanManualStatusTransition("blocked"), {
    allowed: false,
    currentStatus: "blocked",
    nextStatus: "blocked",
    reason: "explicit-unblock-required",
  });
  assert.deepEqual(planEchoKanbanManualStatusTransition("review"), {
    allowed: false,
    currentStatus: "review",
    nextStatus: "review",
    reason: "unsupported-status",
  });
});

test("the Echo board inspects on selection and saves only explicit revision-checked commands", async () => {
  const source = await readFile(new URL("../src/components/EchoKanbanBoard.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-label=\{`Inspect/);
  assert.match(source, /onClick=\{\(\) => inspect\(lane.id, card\)\}/);
  assert.match(source, /<form onSubmit=\{changeStatus\}/);
  assert.match(source, /expectedRevision: board\._sync\?\.revision/);
  assert.match(source, /commandId: crypto.randomUUID\(\)/);
  assert.match(source, /body: JSON.stringify\(retryCommand.current.body\)/);
  assert.match(source, /echo_board_revision_conflict/);
  assert.doesNotMatch(source, /JSON.stringify\(board\)/);
  assert.doesNotMatch(source, /planEchoKanbanManualStatusTransition/);
});
