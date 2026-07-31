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

test("the Echo board UI serializes full-board writes and exposes unsupported states accessibly", async () => {
  const source = await readFile(
    new URL("../src/components/HapaEchosView.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /planEchoKanbanManualStatusTransition\(card\.status\)/);
  assert.match(source, /if \(!transition\.allowed\)/);
  assert.match(source, /boardMutationPendingRef/);
  assert.match(source, /finally\s*\{/);
  assert.match(source, /lanes:\s*board\.lanes\.map/);
  assert.match(source, /const cardInteractionDisabled = boardMutationPending \|\| !transition\.allowed/);
  assert.match(source, /const interactionLabel = cardInteractionDisabled/);
  assert.match(source, /aria-disabled=\{cardInteractionDisabled\}/);
  assert.match(source, /role="button"/);
  assert.match(source, /onKeyDown=\{\(event\) =>/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.doesNotMatch(source, /card\.status = statusCycle\[card\.status\] \|\| 'todo'/);
});
