export const ECHO_KANBAN_MANUAL_STATUS_CYCLE = Object.freeze({
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
});

export function planEchoKanbanManualStatusTransition(status) {
  const currentStatus = String(status || "").trim().toLowerCase();

  if (currentStatus === "blocked") {
    return {
      allowed: false,
      currentStatus,
      nextStatus: currentStatus,
      reason: "explicit-unblock-required",
    };
  }

  const nextStatus = ECHO_KANBAN_MANUAL_STATUS_CYCLE[currentStatus] || null;
  if (!nextStatus) {
    return {
      allowed: false,
      currentStatus: currentStatus || "unknown",
      nextStatus: currentStatus || "unknown",
      reason: "unsupported-status",
    };
  }

  return {
    allowed: true,
    currentStatus,
    nextStatus,
    reason: "manual-status-cycle",
  };
}
