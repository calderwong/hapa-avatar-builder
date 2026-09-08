function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function normalizeEchoStemFocus(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["leadvocals", "leadvoice", "voice"].includes(normalized)) return "vocals";
  if (["backingvocals", "backgroundvocals", "bgvocals"].includes(normalized)) return "backingvocals";
  if (["mastermix", "mix", "fullmix"].includes(normalized)) return "master";
  return normalized;
}

function requestedStemFocus(card = null) {
  return String(card?.visualization?.card?.stemFocus || card?.provenance?.stemFocus || "master").trim() || "master";
}

export function resolveVerifiedEchoStemBinding(showGraph = null, card = null) {
  const requested = requestedStemFocus(card);
  const requestedKey = normalizeEchoStemFocus(requested);
  if (!requestedKey || requestedKey === "master") {
    return { requested, requestedKey: "master", status: "master", bus: null, registryStem: null, fallbackReason: "" };
  }
  const nativeStatus = String(showGraph?.stems?.nativeStatus || "");
  if (nativeStatus && !["verified-local-registry-paths", "partial-local-paths"].includes(nativeStatus)) {
    return { requested, requestedKey, status: "master-fallback", bus: null, registryStem: null, fallbackReason: "graph-stems-not-verified" };
  }
  const buses = Array.isArray(showGraph?.directorV2?.stemBuses) ? showGraph.directorV2.stemBuses : [];
  const bus = buses.find((candidate) => [candidate?.id?.replace(/^bus:/i, ""), candidate?.stemId, candidate?.stemType]
    .some((value) => normalizeEchoStemFocus(value) === requestedKey));
  if (!bus) return { requested, requestedKey, status: "master-fallback", bus: null, registryStem: null, fallbackReason: "requested-stem-not-found" };

  const registryStems = Array.isArray(showGraph?.stems?.items) ? showGraph.stems.items : [];
  const registryStem = registryStems.find((candidate) => (
    String(candidate?.audioPath || "") === String(bus.audioPath || "")
    && (
      String(candidate?.id || "") === String(bus.stemId || "")
      || normalizeEchoStemFocus(candidate?.stemType) === requestedKey
    )
  ));
  if (bus.truthStatus !== "verified_registry_path" || !bus.audioPath || !registryStem) {
    return { requested, requestedKey, status: "master-fallback", bus: null, registryStem: null, fallbackReason: "requested-stem-path-unverified" };
  }
  return { requested, requestedKey, status: "verified-stem", bus, registryStem, fallbackReason: "" };
}

// The browser-safe frame runtime owns this shared Preview/export projection.
export { echoVisualizerAudioEnvelope, echoVisualizerLayerPresentation, echoVisualizerRecipeMix } from "./hyperframes-visualizer-runtime.js";
