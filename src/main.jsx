import React from "react";
import { createRoot } from "react-dom/client";
import { OvercardProvider, OvercardTelemetryBadge } from "@hapa/overcard/react";
import "@hapa/overcard/styles.css";
import App from "./App.jsx";
import { createAvatarBuilderOvercardAdapter, DEFAULT_OVERCARD_HOST_URL } from "./overcard/hostAdapter.js";
import { avatarBuilderOvercardRenderers } from "./overcard/renderers.jsx";
import InventoryCollectionBridge from "./overcard/InventoryCollectionBridge.jsx";
import BuilderPickupDelegator from "./overcard/BuilderPickupDelegator.jsx";
import BuilderEmbeddedOvercardBridge from "./overcard/BuilderEmbeddedOvercardBridge.jsx";
import "./index.css";

const publicBuildWeekDemo = new URLSearchParams(globalThis.location?.search || "").get("stargateDemo") === "1";
const publicDemoOvercardAdapter = {
  async load() {
    return {
      status: "offline",
      lastError: null,
      sync: { connection: "offline", pendingCount: 0, conflictCount: 0, lastEventRevision: 0 }
    };
  },
  async commit() {
    return { status: "offline" };
  },
  subscribe() {
    return () => {};
  }
};
const overcardAdapter = publicBuildWeekDemo
  ? publicDemoOvercardAdapter
  : createAvatarBuilderOvercardAdapter({
      baseUrl: globalThis.hapaOvercard?.baseUrl || import.meta.env.VITE_HAPA_OVERCARD_HOST_URL || DEFAULT_OVERCARD_HOST_URL,
      catalogUrl: `${["5177", "5178"].includes(globalThis.location?.port) ? "http://127.0.0.1:8787" : ""}/api/overcard/catalog?limit=500`,
      hostTargetsUrl: `${["5177", "5178"].includes(globalThis.location?.port) ? "http://127.0.0.1:8787" : ""}/api/overcard/host-targets`,
    });

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OvercardProvider
      adapter={overcardAdapter}
      renderers={avatarBuilderOvercardRenderers}
      theme={{ accent: "#26d9ff", surface: "#071221", text: "#e8f8ff" }}
    >
      {!publicBuildWeekDemo && <InventoryCollectionBridge />}
      {!publicBuildWeekDemo && <BuilderPickupDelegator />}
      {!publicBuildWeekDemo && <BuilderEmbeddedOvercardBridge />}
      <OvercardTelemetryBadge className="builder-overcard-telemetry" />
      <App overcardAdapter={overcardAdapter} />
    </OvercardProvider>
  </React.StrictMode>
);
