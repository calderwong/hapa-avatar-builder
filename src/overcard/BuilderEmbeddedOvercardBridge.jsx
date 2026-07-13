import { useEffect, useRef } from "react";
import { useOvercardAttachments } from "@hapa/overcard/react";
import { EMBED_SCHEMAS, allowedEmbedOrigins, authorizeEmbeddedAction, negotiateEmbeddedHandshake } from "./embeddedBridge.js";

export default function BuilderEmbeddedOvercardBridge() {
  const attachments = useOvercardAttachments(); const sessions = useRef(new WeakMap());
  useEffect(() => {
    const origins = allowedEmbedOrigins(window.location.origin, import.meta.env?.VITE_HAPA_EMBED_ORIGINS || "");
    const onMessage = (event) => {
      if (!event.source || !event.data || typeof event.data !== "object") return;
      if (event.data.schema === EMBED_SCHEMAS.handshake) {
        const result = negotiateEmbeddedHandshake(event.data, { origin: event.origin, allowedOrigins: origins, attachments, sessionId: globalThis.crypto?.randomUUID?.() || `embed-${Date.now()}` });
        if (result.accepted) sessions.current.set(event.source, { sessionId: result.sessionId, surfaceId: result.surfaceId, grantedActions: result.grantedActions, origin: event.origin });
        event.source.postMessage(result, event.origin); return;
      }
      if (event.data.schema === EMBED_SCHEMAS.action) {
        const session = sessions.current.get(event.source);
        const result = event.origin === session?.origin ? authorizeEmbeddedAction(event.data, session) : { schema: EMBED_SCHEMAS.rejection, protocol: "hapa.overcard.v1", version: 1, accepted: false, code: "origin_denied", message: "Action origin does not match its handshake.", surfaceId: event.data.surfaceId, requestId: event.data.requestId };
        if (result.accepted) window.dispatchEvent(new CustomEvent("hapa-overcard-embed-action", { detail: result }));
        event.source.postMessage(result, event.origin);
      }
    };
    window.addEventListener("message", onMessage); return () => window.removeEventListener("message", onMessage);
  }, [attachments]);
  return null;
}
