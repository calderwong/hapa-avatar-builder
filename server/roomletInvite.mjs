import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_ROOMLET_ROOT = "/Users/calderwong/Documents/Codex/2026-06-29/can-you-research-and-review-1/outputs/hapa-roomlet";
export const ROOMLET_HOST_CONTROL_ACTIONS = ["mute", "remove", "promote", "archive"];

const ROOMLET_PARTICIPANT_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function compactId(value = "", fallback = "card") {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value = "", fallback = "", max = 140) {
  const text = String(value || fallback || "").replace(/\s+/g, " ").trim();
  return text.slice(0, max);
}

function cardType(entry = {}) {
  const raw = String(entry.card?.cardType || entry.card?.kind || entry.card?.type || entry.zone || "scene_card").toLowerCase();
  if (/webcam|camera|phone/.test(raw)) return "webcam_card";
  if (/presence|participant|chat/.test(raw)) return "presence_card";
  return "scene_card";
}

function sceneCard(entry = {}, index = 0) {
  const card = entry.card && typeof entry.card === "object" ? entry.card : {};
  const position = entry.position && typeof entry.position === "object" ? entry.position : {};
  return {
    id: compactId(entry.cardId || card.id || `scene-card-${index + 1}`, `scene-card-${index + 1}`),
    type: cardType(entry),
    title: String(entry.title || card.title || card.name || `Scene Card ${index + 1}`).slice(0, 140),
    position: [
      numeric(position.x, index * 0.35 - 0.7),
      numeric(position.y, 0),
      numeric(position.z, index * 0.18)
    ],
    meaning: String(card.meaning || card.summary || card.subtitle || entry.zone || "").slice(0, 500),
    sourceCardId: card.id || entry.cardId || "",
    zone: entry.zone || "field"
  };
}

function ensureWebcamCard(cards = []) {
  if (cards.some((card) => card.type === "webcam_card")) return cards;
  return [
    ...cards,
    {
      id: "webcam-card",
      type: "webcam_card",
      title: "Webcam Card",
      position: [1.2, 0, 0.2],
      meaning: "A participant may publish live media here.",
      zone: "field"
    }
  ];
}

function roomletParticipantSourceEvents(source = {}) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.events)) return source.events;
  if (Array.isArray(source?.presence) || Array.isArray(source?.chat)) return [...(source.presence || []), ...(source.chat || [])];
  if (Array.isArray(source?.participants)) {
    return source.participants.map((participant) => ({
      ...(participant.event || participant),
      participantCoreKey: participant.participantCoreKey || participant.event?.participantCoreKey || participant.coreKey || ""
    }));
  }
  return [];
}

function normalizeRoomletParticipantEvent(raw = {}) {
  const event = raw.event && typeof raw.event === "object" ? { ...raw.event } : { ...raw };
  const participantCoreKey = cleanText(
    raw.participantCoreKey ||
      event.participantCoreKey ||
      raw.coreKey ||
      event.coreKey ||
      raw.sourceParticipantCoreKey ||
      event.sourceParticipantCoreKey,
    "",
    96
  );
  if (!participantCoreKey) return null;
  return {
    ...event,
    participantCoreKey,
    type: event.type || "hapa.roomlet.participant.presence",
    createdAt: event.createdAt || raw.createdAt || new Date(0).toISOString()
  };
}

function sortRoomletParticipants(first, second) {
  const firstTime = Date.parse(first.lastEventAt || "") || 0;
  const secondTime = Date.parse(second.lastEventAt || "") || 0;
  if (firstTime !== secondTime) return firstTime - secondTime;
  return first.participantCoreKey.localeCompare(second.participantCoreKey);
}

export function roomletParticipantsFromRoomView(roomView = {}) {
  const participants = new Map();
  for (const event of roomletParticipantSourceEvents(roomView).map(normalizeRoomletParticipantEvent).filter(Boolean)) {
    const participantCoreKey = event.participantCoreKey;
    const current = participants.get(participantCoreKey) || {
      participantCoreKey,
      displayName: "",
      role: "",
      status: "",
      presence: "",
      media: null,
      lastChat: "",
      lastControl: null,
      eventCount: 0,
      lastEventAt: ""
    };
    current.eventCount += 1;
    current.lastEventAt = event.createdAt || current.lastEventAt;
    if (event.type === "hapa.roomlet.participant.presence") {
      current.displayName = cleanText(event.displayName, current.displayName || "Roomlet participant", 80);
      current.role = cleanText(event.role, current.role, 40);
      current.status = cleanText(event.status, current.status, 40);
      current.presence = cleanText(event.presence, current.presence, 60);
      current.media = event.media && typeof event.media === "object" ? event.media : current.media;
    } else if (event.type === "hapa.roomlet.chat.message") {
      current.displayName = cleanText(event.displayName, current.displayName || "Roomlet participant", 80);
      current.role = cleanText(event.role, current.role, 40);
      current.lastChat = cleanText(event.text, current.lastChat, 180);
    } else if (event.type === "hapa.roomlet.host.control") {
      current.lastControl = event;
    }
    participants.set(participantCoreKey, current);
  }
  return [...participants.values()].sort(sortRoomletParticipants);
}

function roomletParticipantPosition(index = 0, total = 1) {
  const safeTotal = Math.max(1, total);
  const angle = -Math.PI * 0.18 + (Math.PI * 0.36 * (index + 0.5)) / safeTotal;
  const radius = 1.56;
  return [
    Number((Math.cos(angle) * radius).toFixed(3)),
    0,
    Number((1.02 + Math.sin(angle) * radius * 0.58).toFixed(3))
  ];
}

export function buildRoomletParticipantCards(roomView = {}, { inviteId = "", limit = 12 } = {}) {
  const participants = roomletParticipantsFromRoomView(roomView).slice(0, Math.max(0, limit));
  return participants.map((participant, index) => {
    const key = participant.participantCoreKey;
    const isWebcam = participant.media?.kind === "webcam_card" || participant.presence === "webcam_card_live";
    const displayName = participant.displayName || `${participant.role || "Roomlet"} ${key.slice(0, 8)}`;
    const status = [participant.presence, participant.status, participant.lastChat ? `chat: ${participant.lastChat}` : ""]
      .filter(Boolean)
      .join("; ");
    return {
      id: `roomlet-participant-${compactId(key.slice(0, 16), `participant-${index + 1}`)}`,
      type: isWebcam ? "webcam_card" : "presence_card",
      title: displayName,
      position: roomletParticipantPosition(index, participants.length),
      meaning: cleanText(status, "Roomlet participant presence", 500),
      zone: "roomlet-participants",
      inviteId,
      participantCoreKey: key,
      role: participant.role || "participant",
      status: participant.status || "",
      presence: participant.presence || "",
      media: participant.media || null,
      lastChat: participant.lastChat || "",
      eventCount: participant.eventCount,
      lastEventAt: participant.lastEventAt,
      hostControls: ROOMLET_HOST_CONTROL_ACTIONS.map((action) => ({ action }))
    };
  });
}

export function buildRoomletHostControlEvent({
  inviteId = "",
  roomId = "",
  participantCoreKey = "",
  action = "",
  reason = "",
  actorRole = "host",
  actorPermissions = ["room.host.control"],
  createdAt = new Date().toISOString()
} = {}) {
  const normalizedAction = String(action || "").trim().toLowerCase();
  if (!ROOMLET_HOST_CONTROL_ACTIONS.includes(normalizedAction)) {
    throw new Error(`Unsupported Roomlet host control action: ${action || "(missing)"}`);
  }
  const permissions = Array.isArray(actorPermissions) ? actorPermissions.map((item) => String(item || "")) : [];
  const canControl = actorRole === "host" || actorRole === "owner" || permissions.includes("room.host.control");
  if (!canControl) throw new Error("Roomlet host control requires host role or room.host.control permission.");
  const key = cleanText(participantCoreKey, "", 96);
  if (!ROOMLET_PARTICIPANT_KEY_PATTERN.test(key)) throw new Error("Roomlet host control requires a 32-byte participant core key.");
  return {
    type: "hapa.roomlet.host.control",
    version: 1,
    inviteId: cleanText(inviteId, "", 96),
    roomId: cleanText(roomId, "", 140),
    participantCoreKey: key,
    action: normalizedAction,
    reason: cleanText(reason, "tarot-host-control", 220),
    actor: {
      role: cleanText(actorRole, "host", 40),
      permissions: permissions.filter(Boolean).slice(0, 16)
    },
    status: `${normalizedAction}_requested`,
    createdAt
  };
}

export function buildRoomletSceneRecord({ inviteId = "", cardId = "", title = "", avatarName = "", sceneSnapshot = null, roomletRoomView = null } = {}) {
  const snapshotCards = Array.isArray(sceneSnapshot?.cards) ? sceneSnapshot.cards : [];
  const participantCards = buildRoomletParticipantCards(
    roomletRoomView || sceneSnapshot?.roomletRoomView || sceneSnapshot?.roomletParticipants || [],
    { inviteId }
  );
  const cards = ensureWebcamCard([...snapshotCards.slice(0, 80).map(sceneCard), ...participantCards]);
  const createdAt = new Date().toISOString();
  const snapshotHash = sceneSnapshot ? createHash("sha256").update(JSON.stringify(sceneSnapshot)).digest("hex") : "";
  return {
    type: "hapa.scene.card",
    version: 1,
    title: title || sceneSnapshot?.title || "Hapa Tarot Draw Scene",
    createdAt,
    source: {
      app: "hapa-avatar-builder",
      feature: "TarotDraw3DView",
      mode: "roomlet-scene-invite",
      inviteId,
      cardId,
      avatarName,
      sceneSnapshotId: sceneSnapshot?.id || "",
      sceneSnapshotHash: snapshotHash
    },
    scene: {
      title: sceneSnapshot?.title || title || "Hapa Tarot Draw Scene",
      layout: "avatar-builder-tarot-draw",
      cards,
      effects: [
        {
          id: "table-ring",
          type: "ring",
          color: "#83d4d5",
          radius: 2.4
        }
      ],
      snapshot: sceneSnapshot || null
    }
  };
}

async function loadRoomletCreator(roomletRoot = "") {
  const root = roomletRoot || process.env.HAPA_ROOMLET_ROOT || DEFAULT_ROOMLET_ROOT;
  const modulePath = path.join(root, "sidecar/src/demo-room.js");
  const moduleUrl = pathToFileURL(modulePath).href;
  const mod = await import(moduleUrl);
  if (typeof mod.createDemoRoom !== "function") throw new Error(`Roomlet createDemoRoom not found at ${modulePath}`);
  return mod.createDemoRoom;
}

export async function createRoomletTarotInvite({
  dataDir,
  inviteDir = "",
  sceneDir = "",
  inviteId,
  cardId,
  title,
  avatarName,
  sceneSnapshot,
  roomletRoomView = null,
  iceServers = [],
  expiresAt = "",
  hostBridge = null,
  roomletRoot = ""
} = {}) {
  if (!dataDir) throw new Error("createRoomletTarotInvite requires dataDir.");
  if (!inviteId) throw new Error("createRoomletTarotInvite requires inviteId.");
  const createDemoRoom = await loadRoomletCreator(roomletRoot);
  const roomletDir = path.join(sceneDir || path.join(dataDir, "roomlet-scenes"), compactId(inviteId, "invite"));
  const invitePath = path.join(inviteDir || path.join(dataDir, "phone-bridge-invites"), `${compactId(inviteId, "invite")}.hapa-room`);
  const sceneRecord = buildRoomletSceneRecord({ inviteId, cardId, title, avatarName, sceneSnapshot, roomletRoomView });
  return createDemoRoom({
    demoRoot: roomletDir,
    hostStorageDir: path.join(roomletDir, "host-store"),
    invitePath,
    sceneCoreName: `tarot-scene-${compactId(inviteId, "invite")}`,
    roomId: `hapa-avatar-${compactId(inviteId, "invite")}`,
    title: title || sceneRecord.title,
    sceneRecord,
    clean: true,
    capability: expiresAt ? { expiresAt } : {},
    webrtc: {
      enabled: true,
      iceServers
    },
    extensions: hostBridge && typeof hostBridge === "object" ? {
      avatarBuilderPhoneBridge: hostBridge
    } : undefined
  });
}
