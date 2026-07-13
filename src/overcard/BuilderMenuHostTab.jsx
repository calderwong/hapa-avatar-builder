import { useMemo, useState } from "react";
import { OvercardHostSlots, useOvercardAttachments, useOvercardCatalog, useOvercardPickup, useOvercardResponsibility, useOvercardSnapshot, useOvercardStore, useOvercardTelemetry } from "@hapa/overcard/react";
import { builderHostTargetRegistrations } from "./hostTargets.js";
import { getBuilderProcessAdapter } from "./processAdapters.js";
import { createActiveHellWeekBinding } from "./hellWeekResponsibility.js";
import BuilderAttachmentNavigation from "./BuilderAttachmentNavigation.jsx";

export default function BuilderMenuHostTab({ target, active, onActivate, icon }) {
  const [open, setOpen] = useState(false);
  const pickup = useOvercardPickup();
  const snapshot = useOvercardSnapshot();
  const store = useOvercardStore();
  const attachments = useOvercardAttachments();
  const catalog = useOvercardCatalog();
  const bindings = useOvercardResponsibility();
  const telemetry = useOvercardTelemetry();
  const registration = useMemo(() => builderHostTargetRegistrations().find((entry) => entry.id === target.id), [target.id]);
  const processAdapter = useMemo(() => getBuilderProcessAdapter(target.adapterId || target.processId), [target.adapterId, target.processId]);
  const attached = registration ? Object.values(attachments).filter((item) => item.host.nodeId === registration.nodeId && item.host.hostId === registration.hostId) : [];
  const health = snapshot.sync.connection === "offline" ? "offline" : snapshot.status === "degraded" || attached.some((item) => item.status === "degraded" || item.status === "conflict") ? "degraded" : "healthy";
  const effective = attached.filter((item) => item.status === "active").map((item) => item.entity.label || item.entity.entityId);
  return (
    <div className={`builder-menu-host${open ? " is-open" : ""}`} data-host-id={target.id}>
      <button role="tab" data-overcard-host-target={target.id} data-context-mode={target.contextMode} title={target.effectExplanation} aria-selected={active} className={active ? "active" : ""} onClick={onActivate}>{icon} {target.label}</button>
      <button className="builder-menu-host__slot-toggle" type="button" aria-label={`${target.label} attachments: ${attached.length}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">◇</span><em>{attached.length}</em>
      </button>
      {open && registration && (
        <div className="builder-menu-host__popover" role="dialog" aria-label={`${target.label} Overcard attachments`}>
          <p className="builder-menu-host__effect"><strong>{target.contextMode}</strong> · {target.effectExplanation}</p>
          {processAdapter && <div className="builder-menu-host__runtime" data-runtime-mode={processAdapter.mode}>
            <p><strong>{processAdapter.mode}</strong> · owned by {processAdapter.ownerNodeId}</p>
            <p>Fallback: {processAdapter.fallback}. Context is frozen only when a run starts.</p>
            <div><a href={processAdapter.launch.uri}>Launch</a><a href={processAdapter.inspect.uri}>Inspect capability</a></div>
          </div>}
          <OvercardHostSlots
            target={registration}
            slots={target.slots}
            actor="calder"
            held={pickup.held?.entity || null}
            onHeldChange={(entity) => { if (!entity) pickup.setHeld(null); }}
            runtime={{ health, input: pickup.held ? `Held: ${pickup.held.entity.label || pickup.held.entity.entityId}` : "No held entity", output: target.effectExplanation, effectiveContext: effective, fallback: target.fallback }}
            requestResponsibility={async ({ entity, attachment }) => {
              if (target.processId !== "hell-week") return null;
              const binding = createActiveHellWeekBinding({ principal: entity, attachment, actor: "calder", contextAttachments: attached.filter((item) => item.id !== attachment.id && item.status === "active") });
              await store.dispatch("state.upsert", { record: { kind: "responsibility-binding", id: binding.id, value: binding, summary: `${entity.label || entity.entityId} manages the next Hell Week run` } });
              return { bindingId: binding.id };
            }}
            renderInspectorExtra={(attachment) => <BuilderAttachmentNavigation attachment={attachment} catalog={catalog} bindings={bindings} telemetry={telemetry} processAdapter={processAdapter} />}
          />
        </div>
      )}
    </div>
  );
}
