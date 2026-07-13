export const SONG_CONTEXT_PACKET_SCHEMA = "hapa.director.song-context-packet.v1";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function contextHash(value) {
  let a = 2166136261; let b = 2654435761;
  for (const char of stable(value)) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b ^ char.charCodeAt(0), 2246822519); }
  const part = `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
  return part.repeat(4);
}

function exactPaths(value, needle, path = "") {
  if (value === needle) return [path || "/"];
  if (Array.isArray(value)) return value.flatMap((item, index) => exactPaths(item, needle, `${path}/${index}`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => exactPaths(item, needle, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
  return [];
}

function compactNode(kind, record, sourceFile, linkPaths = []) {
  const id = record.id || record.songId;
  const canonStatus = record.canonStatus || record.loreStatus || record.status || "unverified";
  const media = [...(record.mediaAssets || []), ...(record.assets || []), ...(record.mediaSlots || record.slots || []).filter((row) => row.assetId).map((row) => ({ id: row.assetId, slotId: row.id, kind: row.requirementId, truthStatus: "attached-id-unverified-media" }))].slice(0, 24);
  const node = { kind, id, title: record.title || record.primaryName || record.name || id, summary: record.summary || record.quickPitch || record.lore?.summary || "", canonStatus, humanVerified: ["hard_canon", "hard", "verified"].includes(canonStatus), tags: (record.tags || []).slice(0, 24), source: { file: sourceFile, recordId: id, linkPaths }, mediaAttachPack: media.map((row) => ({ id: row.id || row.assetId, type: row.type || row.kind || "unknown", uri: row.uri || row.path || null, truthStatus: row.truthStatus || "attached-unverified" })) };
  return { ...node, nodeHash: contextHash(node) };
}

function linked(records, songId, title) {
  return records.flatMap((record) => {
    const paths = [...exactPaths(record, songId), ...exactPaths(record, title)].filter((value, index, all) => all.indexOf(value) === index);
    return paths.length ? [{ record, paths }] : [];
  });
}

export function buildSongContextPacket({ song, avatars = [], itemCards = [], tarotCards = [], scenes = [], prelinked = {}, sourceFiles = {} } = {}) {
  const songId = song.id;
  const performerId = song.performancePerspective?.avatar_id || song.performancePerspective?.avatarId || null;
  const linkedAvatars = avatars.filter((avatar) => avatar.id === performerId);
  const linkedItems = prelinked.itemCards || linked(itemCards, songId, song.title);
  const linkedTarot = prelinked.tarotCards || linked(tarotCards, songId, song.title);
  const linkedScenes = prelinked.scenes || linked(scenes, songId, song.title);
  const songNode = compactNode("song", song, sourceFiles.songs || "data/dear-papa-songbook.json", ["/songCards"]);
  const characters = linkedAvatars.map((record) => compactNode("avatar-card", record, sourceFiles.avatars || "data/avatar-store.json", ["/avatars"]));
  const cards = [...linkedItems.map(({ record, paths }) => compactNode("item-card", record, sourceFiles.itemCards || "data/item-manager-store.json", paths)), ...linkedTarot.map(({ record, paths }) => compactNode("tarot-card", record, sourceFiles.tarotCards || "data/tarot-store.json", paths))].slice(0, 32);
  const sceneNodes = linkedScenes.map(({ record, paths }) => compactNode("scene", record, sourceFiles.scenes || "data/scene-store.json", paths)).slice(0, 24);
  const relationshipFocus = (song.performancePerspective?.relationship_focus || []).map((relationship) => ({ fromId: performerId, toId: songId, relationship, source: `${songId}#/performancePerspective/relationship_focus`, truthStatus: song.loreStatus || "soft" }));
  const nodes = [songNode, ...characters, ...cards, ...sceneNodes];
  const nodeHashes = Object.fromEntries(nodes.map((node) => [`${node.kind}:${node.id}`, node.nodeHash]));
  const packetBase = { schemaVersion: SONG_CONTEXT_PACKET_SCHEMA, songId, title: song.title, truthStatus: "context-only-ranking-input", rankingStatus: "proposed-pending-human-blind-review", song: songNode, allowedCharacters: characters.map((node) => ({ id: node.id, title: node.title, canonStatus: node.canonStatus, source: node.source })), relationships: relationshipFocus, cards, scenes: sceneNodes, negativeConstraints: [{ id: "no-unlisted-character-promotion", rule: "Characters outside allowedCharacters cannot receive a positive canon/character score." }, { id: "no-soft-canon-promotion", rule: "Soft/scaffold context remains soft/scaffold; packet inclusion does not promote canon." }, { id: "no-unverified-media-confidence", rule: "Unverified attach-pack media cannot support high-confidence semantic claims." }], nodeHashes, gaps: [...(!characters.length ? ["no-explicit-performance-avatar-record"] : []), ...(!cards.length ? ["no-exact-linked-card-records"] : []), ...(!sceneNodes.length ? ["no-exact-linked-scene-records"] : [])] };
  return { ...packetBase, packetHash: contextHash(packetBase), decisionFamilyHashes: { song: contextHash(songNode), characters: contextHash(characters), relationships: contextHash(relationshipFocus), cards: contextHash(cards), scenes: contextHash(sceneNodes), mediaAttachPacks: contextHash(nodes.flatMap((node) => node.mediaAttachPack)) } };
}

export function diffSongContextPackets(before, after) {
  const families = Object.keys(after.decisionFamilyHashes || {});
  const changedFamilies = families.filter((family) => before.decisionFamilyHashes?.[family] !== after.decisionFamilyHashes?.[family]);
  const keys = new Set([...Object.keys(before.nodeHashes || {}), ...Object.keys(after.nodeHashes || {})]);
  const changedNodeIds = [...keys].filter((key) => before.nodeHashes?.[key] !== after.nodeHashes?.[key]);
  return { schemaVersion: "hapa.director.song-context-invalidation.v1", changed: before.packetHash !== after.packetHash, changedNodeIds, changedDecisionFamilies: changedFamilies, unaffectedDecisionFamilies: families.filter((family) => !changedFamilies.includes(family)) };
}
