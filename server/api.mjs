#!/usr/bin/env node
import { createServer } from "node:http";
import { appendFile, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditAvatar,
  backgroundlessPlaybackForAsset,
  createAttachPack,
  createAvatarMindAttachPack,
  createAvatarMindSummary,
  createAvatarScaffold,
  createHealingPromptPacket,
  createHealingQueue,
  createHealingPlan,
  assignAssetToSlot,
  createKanbanFromAudit,
  normalizeAvatarCard,
  registerBackgroundlessVideoVariant,
  videoBackgroundlessSummary,
  upsertAvatarMind
} from "../src/domain/avatar.js";
import {
  attachSceneMedia,
  createPlace,
  createScene,
  createSceneAttachPack,
  createSceneGraphScaffold,
  normalizeSceneGraph
} from "../src/domain/scene.js";
import { normalizeAvatarTeams } from "../src/domain/avatarTeams.js";
import {
  addTarotCard,
  addTarotDeck,
  addTarotSet,
  attachTarotCardMedia,
  createTarotAttachPack,
  createTarotLibraryDashboard,
  createTarotStore,
  linkTarotCardAvatar,
  normalizeTarotStore,
  summarizeTarotStore,
  unlinkTarotCardAvatar,
  updateTarotCard,
  updateTarotDeck,
  updateTarotSet
} from "../src/domain/tarot.js";
import {
  createSystemMediaLibrary,
  normalizeSystemMediaLibrary
} from "../src/domain/systemMedia.js";
import {
  createInventoryAttachPack,
  createInventoryStoreScaffold,
  createItemCard,
  createItemManagerScaffold,
  equipItemCard,
  normalizeInventoryStore,
  normalizeItemManagerStore
} from "../src/domain/item.js";
import {
  attachSongMedia,
  createHapaSongStoreFromDearPapaSongbook,
  normalizeHapaSong,
  normalizeHapaSongStore,
  upsertSongInStore
} from "../src/domain/song.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const KANBAN_PATH = process.env.HAPA_KANBAN_STORE || path.join(ROOT, "data/kanban.json");
const SCENE_STORE_PATH = process.env.HAPA_SCENE_STORE || path.join(ROOT, "data/scene-store.json");
const TAROT_STORE_PATH = process.env.HAPA_TAROT_STORE || path.join(ROOT, "data/tarot-store.json");
const SYSTEM_MEDIA_PATH = process.env.HAPA_MEDIA_LIBRARY || path.join(ROOT, "data/media-library.json");
const ITEM_STORE_PATH = process.env.HAPA_ITEM_STORE || path.join(ROOT, "data/item-manager-store.json");
const INVENTORY_STORE_PATH = process.env.HAPA_INVENTORY_STORE || path.join(ROOT, "data/inventory-store.json");
const DEAR_PAPA_SONGBOOK_PATH = process.env.HAPA_DEAR_PAPA_SONGBOOK || path.join(ROOT, "data/dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = process.env.HAPA_SONG_STORE || path.join(ROOT, "data/hapa-songs-store.json");
const SONG_REGISTRY_ROOT = process.env.HAPA_SONG_REGISTRY_ROOT || "/Users/calderwong/Desktop/hapa-song-registry";
const SONG_REGISTRY_DATA_PATH = process.env.HAPA_SONG_REGISTRY_DATA || path.join(SONG_REGISTRY_ROOT, "data/registry.json");
const DEAR_PAPA_PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const SUBSCRIBER_DIR = process.env.HAPA_SUBSCRIBER_DIR || path.join(ROOT, "data/subscribers");
const SUBSCRIBERS = ["hapa-atlas", "hapa-second-brain", "hapa-worldbuilding-wiki"];
const OVERWIND_DIR = process.env.HAPA_OVERWIND_DIR || path.join(ROOT, "data/overwind");
const OVERWIND_BOOTSTRAP_PATH = path.join(OVERWIND_DIR, "avatar-builder-bootstrap.json");
const OVERWIND_ENTITY_NAMES = [
  "agent_archetype",
  "prompt_contract",
  "schema",
  "harness",
  "persistence_target",
  "avatar_card",
  "scene_card",
  "item_card",
  "tarot_card"
];

const rawJsonCache = new Map();
const normalizedJsonCache = new Map();
let overwindBootstrapCache = null;

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    args.set(arg.slice(2), process.argv[index + 1]?.startsWith("--") ? true : process.argv[index + 1] || true);
  }
}

const port = Number(args.get("port") || process.env.PORT || 8787);
const staticDir = args.get("static") ? path.resolve(ROOT, String(args.get("static"))) : null;

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Hapa Avatar Builder API listening on http://127.0.0.1:${port}`);
  warmOverwindBootstrap();
});

function warmOverwindBootstrap() {
  readOverwindBootstrap(null, false)
    .then((projection) => {
      console.log(`Overwind bootstrap ready at ${OVERWIND_BOOTSTRAP_PATH} (${projection.counts?.avatars || 0} avatars, ${projection.counts?.cards || 0} cards)`);
    })
    .catch((error) => {
      console.warn(`Overwind bootstrap warmup skipped: ${error instanceof Error ? error.message : String(error)}`);
    });
}

async function route(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || `127.0.0.1:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "hapa-avatar-builder",
      store: STORE_PATH,
      time: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/requirements") {
    const { MEDIA_REQUIREMENTS, TAG_LIBRARY } = await import("../src/domain/avatar.js");
    sendJson(res, 200, { requirements: MEDIA_REQUIREMENTS, tags: TAG_LIBRARY });
    return;
  }

  if (pathname === "/api/overwind/bootstrap" && req.method === "GET") {
    sendJson(res, 200, await readOverwindBootstrap(
      url.searchParams.get("avatarId") || null,
      url.searchParams.get("fullAvatar") === "1"
    ));
    return;
  }

  if (pathname === "/api/kanban") {
    const board = await readJson(KANBAN_PATH);
    sendJson(res, 200, board);
    return;
  }

  if (pathname === "/api/hapa-songs" && req.method === "GET") {
    sendJson(res, 200, await readHapaSongStore());
    return;
  }

  if (pathname === "/api/song-registry/dear-papa" && req.method === "GET") {
    const limit = Math.max(1, Math.min(5000, Number(url.searchParams.get("limit") || 500)));
    sendJson(res, 200, await readDearPapaRegistrySongs(limit));
    return;
  }

  const registrySongMatch = pathname.match(/^\/api\/song-registry\/songs\/([^/]+)$/);
  if (registrySongMatch && req.method === "GET") {
    const song = await findRegistrySong(registrySongMatch[1]);
    if (!song) {
      sendJson(res, 404, { error: "song_not_found", id: registrySongMatch[1] });
      return;
    }
    sendJson(res, 200, compactRegistrySong(song, { detail: true }));
    return;
  }

  const registryAudioMatch = pathname.match(/^\/api\/song-registry\/audio\/([^/]+)$/);
  if (registryAudioMatch && req.method === "GET") {
    const song = await findRegistrySong(registryAudioMatch[1]);
    if (!song?.localPath) {
      sendJson(res, 404, { error: "audio_not_found", id: registryAudioMatch[1] });
      return;
    }
    await serveLocalFile(song.localPath, req, res);
    return;
  }

  const registryCoverMatch = pathname.match(/^\/api\/song-registry\/covers\/([^/]+)$/);
  if (registryCoverMatch && req.method === "GET") {
    const song = await findRegistrySong(registryCoverMatch[1]);
    const coverPath = song?.raw?._hapaPlaylistExport?.coverPath;
    if (!coverPath) {
      sendJson(res, 404, { error: "cover_not_found", id: registryCoverMatch[1] });
      return;
    }
    await serveLocalFile(coverPath, req, res);
    return;
  }

  if (pathname === "/api/hapa-songs" && req.method === "PUT") {
    const songbook = await readDearPapaSongbook();
    const store = normalizeHapaSongStore(await readBody(req), songbook);
    await writeHapaSongStore(store);
    await appendSubscriberRegistration("songs.updated", { songStore: store });
    sendJson(res, 200, store);
    return;
  }

  const songMediaMatch = pathname.match(/^\/api\/hapa-songs\/([^/]+)\/media$/);
  if (songMediaMatch && req.method === "POST") {
    const songId = decodeURIComponent(songMediaMatch[1]);
    const body = await readBody(req);
    const store = await readHapaSongStore();
    const song = findSongInStore(store, songId);
    if (!song) {
      sendJson(res, 404, { error: "song_not_found", id: songId });
      return;
    }
    const persisted = body.dataUrl ? await persistMedia(body) : body.asset || body;
    const nextSong = attachSongMedia(song, persisted, body.options || body);
    const songbook = await readDearPapaSongbook();
    const nextStore = upsertSongInStore(store, nextSong, songbook);
    await writeHapaSongStore(nextStore);
    await appendSubscriberRegistration("songs.media-attached", { songStore: nextStore, media: persisted });
    sendJson(res, 201, { song: nextSong, media: persisted, store: nextStore });
    return;
  }

  const songMatch = pathname.match(/^\/api\/hapa-songs\/([^/]+)$/);
  if (songMatch && req.method === "PUT") {
    const songId = decodeURIComponent(songMatch[1]);
    const songbook = await readDearPapaSongbook();
    const store = await readHapaSongStore();
    const currentSong = findSongInStore(store, songId) || {};
    const incomingBody = await readBody(req);
    const incomingSong = normalizeHapaSong({ ...currentSong, ...incomingBody, id: currentSong.id || incomingBody.id || songId });
    const nextStore = upsertSongInStore(store, incomingSong, songbook);
    await writeHapaSongStore(nextStore);
    await appendSubscriberRegistration("songs.song-updated", { songStore: nextStore });
    sendJson(res, 200, findSongInStore(nextStore, songId) || incomingSong);
    return;
  }

  if (pathname === "/api/world" && req.method === "GET") {
    sendJson(res, 200, await readSceneStore());
    return;
  }

  if (pathname === "/api/system-media" && req.method === "GET") {
    const library = await readSystemMediaLibrary();
    sendJson(res, 200, url.searchParams.get("full") === "1" ? library : compactSystemMediaLibrary(library));
    return;
  }

  const systemMediaRecordMatch = pathname.match(/^\/api\/system-media\/records\/([^/]+)$/);
  if (systemMediaRecordMatch && req.method === "PATCH") {
    const library = await patchSystemMediaRecord(systemMediaRecordMatch[1], await readBody(req));
    sendJson(res, 200, compactSystemMediaLibrary(library));
    return;
  }

  if (pathname === "/api/world" && req.method === "PUT") {
    const graph = normalizeSceneGraph(await readBody(req));
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.updated", { sceneGraph: graph });
    sendJson(res, 200, graph);
    return;
  }

  if (pathname === "/api/world/places" && req.method === "POST") {
    const body = await readBody(req);
    const graph = createPlace(await readSceneStore(), body);
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.place-created", { sceneGraph: graph });
    sendJson(res, 201, graph);
    return;
  }

  if (pathname === "/api/world/scenes" && req.method === "POST") {
    const body = await readBody(req);
    const graph = createScene(await readSceneStore(), body);
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.scene-created", { sceneGraph: graph });
    sendJson(res, 201, graph);
    return;
  }

  if (pathname === "/api/world/attach" && req.method === "GET") {
    const graph = await readSceneStore();
    sendJson(res, 200, createSceneAttachPack(graph, url.searchParams.get("sceneId") || null));
    return;
  }

  if (pathname === "/api/items" && req.method === "GET") {
    sendJson(res, 200, await readItemStore());
    return;
  }

  if (pathname === "/api/items" && req.method === "PUT") {
    const itemStore = normalizeItemManagerStore(await readBody(req));
    await writeItemStore(itemStore);
    await appendSubscriberRegistration("items.updated", { itemStore });
    sendJson(res, 200, itemStore);
    return;
  }

  if (pathname === "/api/items/cards" && req.method === "POST") {
    const body = await readBody(req);
    const itemStore = await readItemStore();
    const card = createItemCard(body.card || body);
    itemStore.cards = [card, ...itemStore.cards.filter((item) => item.id !== card.id)];
    itemStore.updatedAt = new Date().toISOString();
    await writeItemStore(itemStore);
    await appendSubscriberRegistration("items.card-upserted", { itemStore });
    sendJson(res, 201, normalizeItemManagerStore(itemStore));
    return;
  }

  if (pathname === "/api/items/attach" && req.method === "GET") {
    const itemStore = await readItemStore();
    const inventoryStore = await readInventoryStore();
    sendJson(res, 200, createInventoryAttachPack(inventoryStore, itemStore, url.searchParams.get("avatarId") || null));
    return;
  }

  if (pathname === "/api/inventory" && req.method === "GET") {
    sendJson(res, 200, await readInventoryStore());
    return;
  }

  if (pathname === "/api/inventory" && req.method === "PUT") {
    const store = await readStore();
    const itemStore = await readItemStore();
    const inventoryStore = normalizeInventoryStore(await readBody(req), store.avatars || [], itemStore.cards || []);
    await writeInventoryStore(inventoryStore);
    await appendSubscriberRegistration("inventory.updated", { inventoryStore });
    sendJson(res, 200, inventoryStore);
    return;
  }

  if (pathname === "/api/inventory/equip" && req.method === "POST") {
    const body = await readBody(req);
    const store = await readStore();
    const itemStore = await readItemStore();
    const inventoryStore = await readInventoryStore();
    const avatar = (store.avatars || []).find((item) => item.id === body.avatarId || item.id === body.avatar_id);
    const card = (itemStore.cards || []).find((item) => item.id === body.cardId || item.id === body.card_id);
    if (!avatar || !card) {
      sendJson(res, 404, { error: "inventory_target_not_found", avatarId: body.avatarId || body.avatar_id, cardId: body.cardId || body.card_id });
      return;
    }
    const nextInventoryStore = equipItemCard(
      inventoryStore,
      { avatarId: avatar.id, avatarName: avatar.primaryName },
      card,
      body.hardpointId || body.hardpoint_id || "items",
      body.zone || "equipped"
    );
    await writeInventoryStore(nextInventoryStore);
    await appendSubscriberRegistration("inventory.card-equipped", { inventoryStore: nextInventoryStore, itemStore });
    sendJson(res, 200, nextInventoryStore);
    return;
  }

  if (pathname === "/api/media/backgroundless" && req.method === "GET") {
    const store = await readStore();
    sendJson(res, 200, createBackgroundlessVideoLibrarySummary(store));
    return;
  }

  if (pathname === "/api/media" && req.method === "POST") {
    const body = await readBody(req);
    const saved = await persistMedia(body);
    await appendSubscriberRegistration("media.persisted", { media: saved });
    sendJson(res, 201, saved);
    return;
  }

  if (pathname === "/api/tarot" && req.method === "GET") {
    sendJson(res, 200, await readTarotStore());
    return;
  }

  if (pathname === "/api/tarot" && req.method === "PUT") {
    const store = normalizeTarotStore(await readBody(req));
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.updated", { tarot: store });
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/tarot/dashboard" && req.method === "GET") {
    sendJson(res, 200, createTarotLibraryDashboard(await readTarotStore()));
    return;
  }

  if (pathname === "/api/tarot/decks" && req.method === "POST") {
    const body = await readBody(req);
    const store = addTarotDeck(await readTarotStore(), body);
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.deck-created", { tarot: store });
    sendJson(res, 201, store);
    return;
  }

  const tarotDeckMatch = pathname.match(/^\/api\/tarot\/decks\/([^/]+)$/);
  if (tarotDeckMatch && req.method === "PUT") {
    const deckId = tarotDeckMatch[1];
    const store = updateTarotDeck(await readTarotStore(), deckId, await readBody(req));
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.deck-updated", { tarot: store });
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/tarot/sets" && req.method === "POST") {
    const body = await readBody(req);
    const store = addTarotSet(await readTarotStore(), body);
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.set-created", { tarot: store });
    sendJson(res, 201, store);
    return;
  }

  const tarotSetMatch = pathname.match(/^\/api\/tarot\/sets\/([^/]+)$/);
  if (tarotSetMatch && req.method === "PUT") {
    const setId = tarotSetMatch[1];
    const store = updateTarotSet(await readTarotStore(), setId, await readBody(req));
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.set-updated", { tarot: store });
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/tarot/cards" && req.method === "POST") {
    const body = await readBody(req);
    const store = addTarotCard(await readTarotStore(), body);
    await writeTarotStore(store);
    await appendSubscriberRegistration("tarot.card-created", { tarot: store, media: body.asset || null });
    sendJson(res, 201, store);
    return;
  }

  const tarotCardMatch = pathname.match(/^\/api\/tarot\/cards\/([^/]+)(?:\/([^/]+))?$/);
  if (tarotCardMatch) {
    const cardId = tarotCardMatch[1];
    const action = tarotCardMatch[2];

    if (!action && req.method === "PUT") {
      const store = updateTarotCard(await readTarotStore(), cardId, await readBody(req));
      await writeTarotStore(store);
      await appendSubscriberRegistration("tarot.card-updated", { tarot: store });
      sendJson(res, 200, store);
      return;
    }

    if (action === "media" && req.method === "POST") {
      const body = await readBody(req);
      const asset = body.asset || body;
      const role = body.role || body.tarotMediaRole || null;
      const store = attachTarotCardMedia(await readTarotStore(), cardId, asset, role);
      await writeTarotStore(store);
      await appendSubscriberRegistration("tarot.card-media-attached", { tarot: store, media: asset });
      sendJson(res, 200, store);
      return;
    }

    if (action === "avatars" && req.method === "POST") {
      const body = await readBody(req);
      const store = body.detach
        ? unlinkTarotCardAvatar(await readTarotStore(), cardId, body.avatarId)
        : linkTarotCardAvatar(await readTarotStore(), cardId, body.avatarId, body);
      await writeTarotStore(store);
      await appendSubscriberRegistration(body.detach ? "tarot.avatar-unlinked" : "tarot.avatar-linked", { tarot: store });
      sendJson(res, 200, store);
      return;
    }
  }

  if (pathname === "/api/tarot/attach" && req.method === "GET") {
    sendJson(res, 200, createTarotAttachPack(await readTarotStore(), {
      deckId: url.searchParams.get("deckId") || null,
      setId: url.searchParams.get("setId") || null,
      cardId: url.searchParams.get("cardId") || null,
      target: url.searchParams.get("target") || "agent"
    }));
    return;
  }

  if (pathname === "/api/subscribers/status" && req.method === "GET") {
    sendJson(res, 200, await readSubscriberStatus());
    return;
  }

  if (pathname === "/api/subscribers/events" && req.method === "GET") {
    const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") || 50)));
    sendJson(res, 200, await readSubscriberEvents(limit));
    return;
  }

  if (pathname === "/api/avatar-teams" && req.method === "GET") {
    const store = await readStore();
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-teams.v1",
      teams: store.teams || [],
      updatedAt: store.updatedAt || null
    });
    return;
  }

  if (pathname === "/api/avatar-teams" && req.method === "PUT") {
    const body = await readBody(req);
    const store = await readStore();
    const teams = normalizeAvatarTeams(body.teams || body, store.avatars || [], { seedCore: false });
    const nextStore = {
      ...store,
      teams,
      updatedAt: new Date().toISOString()
    };
    await writeStore(nextStore);
    await appendSubscriberRegistration("avatar.teams-updated");
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-teams.v1",
      teams,
      updatedAt: nextStore.updatedAt
    });
    return;
  }

  if (pathname === "/api/avatars" && req.method === "GET") {
    const store = await readStore();
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/avatars" && req.method === "PUT") {
    const body = await readBody(req);
    const currentStore = await readStore();
    const avatars = (Array.isArray(body.avatars) ? body.avatars : currentStore.avatars)
      .map((avatar) => normalizeAvatarCard(avatar));
    const store = {
      ...currentStore,
      ...body,
      schemaVersion: body.schemaVersion || currentStore.schemaVersion || "hapa.avatar-store.v1",
      avatars,
      teams: normalizeAvatarTeams(body.teams || currentStore.teams || [], avatars),
      updatedAt: new Date().toISOString()
    };
    await writeStore(store);
    await appendSubscriberRegistration("avatar.store-updated");
    sendJson(res, 200, store);
    return;
  }

  if (pathname === "/api/mind" && req.method === "GET") {
    const store = await readStore();
    sendJson(res, 200, {
      schemaVersion: "hapa.avatar-mind-library.v1",
      avatarCount: store.avatars.length,
      avatars: store.avatars.map((avatar) => createAvatarMindSummary(avatar, store.avatars)),
      generatedAt: new Date().toISOString()
    });
    return;
  }

  if (pathname === "/api/avatars" && req.method === "POST") {
    const body = await readBody(req);
    const store = await readStore();
    const avatar = createAvatarScaffold(body);
    if (store.avatars.some((item) => item.id === avatar.id)) {
      sendJson(res, 409, { error: "avatar_exists", id: avatar.id });
      return;
    }
    store.avatars.push(avatar);
    await writeStore(store);
    await appendSubscriberRegistration("avatar.created", { avatar });
    sendJson(res, 201, avatar);
    return;
  }

  const avatarMatch = pathname.match(/^\/api\/avatars\/([^/]+)(?:\/([^/]+))?$/);
  if (avatarMatch) {
    const avatarId = avatarMatch[1];
    const action = avatarMatch[2];
    const store = await readStore();
    const avatarIndex = store.avatars.findIndex((item) => item.id === avatarId);
    const avatar = store.avatars[avatarIndex];

    if (!avatar) {
      sendJson(res, 404, { error: "avatar_not_found", id: avatarId });
      return;
    }

    if (!action && req.method === "GET") {
      sendJson(res, 200, avatar);
      return;
    }

    if (!action && req.method === "PUT") {
      const nextAvatar = await readBody(req);
      if (isStaleAvatarUpdate(avatar, nextAvatar)) {
        sendJson(res, 409, {
          error: "stale_avatar_update",
          id: avatar.id,
          currentUpdatedAt: avatar.updatedAt || null,
          incomingUpdatedAt: nextAvatar?.updatedAt || null
        });
        return;
      }
      store.avatars[avatarIndex] = {
        ...nextAvatar,
        id: avatar.id,
        updatedAt: new Date().toISOString()
      };
      await writeStore(store);
      await appendSubscriberRegistration("avatar.updated", { avatar: store.avatars[avatarIndex] });
      sendJson(res, 200, store.avatars[avatarIndex]);
      return;
    }

    if (action === "audit" && req.method === "GET") {
      sendJson(res, 200, auditAvatar(avatar));
      return;
    }

    if (action === "attach" && req.method === "GET") {
      sendJson(res, 200, createAttachPack(avatar, url.searchParams.get("target") || "agent"));
      return;
    }

    if (action === "mind" && req.method === "GET") {
      sendJson(res, 200, createAvatarMindAttachPack(avatar, store.avatars));
      return;
    }

    if (action === "mind" && req.method === "PUT") {
      const body = await readBody(req);
      const nextAvatar = upsertAvatarMind(avatar, body.mind || body);
      store.avatars[avatarIndex] = nextAvatar;
      await writeStore(store);
      await appendSubscriberRegistration("avatar.mind-updated", { avatar: nextAvatar });
      sendJson(res, 200, {
        avatar: nextAvatar,
        pack: createAvatarMindAttachPack(nextAvatar, store.avatars)
      });
      return;
    }

    if (action === "heal-plan" && req.method === "GET") {
      sendJson(res, 200, {
        avatarId,
        tasks: createHealingPlan(avatar)
      });
      return;
    }

    if (action === "heal-queue" && req.method === "GET") {
      sendJson(res, 200, createHealingQueue(avatar));
      return;
    }

    if (action === "heal-prompt" && req.method === "GET") {
      const selector = url.searchParams.get("jobId") || url.searchParams.get("slotId") || url.searchParams.get("requirementId") || "";
      const packet = createHealingPromptPacket(avatar, selector, {
        extraInstruction: url.searchParams.get("instruction") || ""
      });
      if (!packet) {
        sendJson(res, 404, { error: "healing_task_not_found", avatarId, selector });
        return;
      }
      sendJson(res, 200, packet);
      return;
    }

    if (action === "kanban" && req.method === "GET") {
      sendJson(res, 200, {
        avatarId,
        lanes: createKanbanFromAudit(avatar)
      });
      return;
    }

    if (action === "backgroundless" && req.method === "GET") {
      sendJson(res, 200, videoBackgroundlessSummary(avatar));
      return;
    }

    if (action === "backgroundless" && req.method === "POST") {
      const body = await readBody(req);
      const videoAssetId = body.videoAssetId || body.assetId || body.video_asset_id || body.id;
      if (!videoAssetId) {
        sendJson(res, 400, { error: "missing_video_asset_id", avatarId });
        return;
      }
      const currentVideo = (avatar.assets || []).find((asset) => asset.id === videoAssetId || asset.assetId === videoAssetId);
      if (!currentVideo || currentVideo.type !== "video") {
        sendJson(res, 404, { error: "video_asset_not_found", avatarId, videoAssetId });
        return;
      }
      const nextAvatar = registerBackgroundlessVideoVariant(avatar, videoAssetId, body.variant || body.backgroundless || body);
      const updatedAsset = (nextAvatar.assets || []).find((asset) => asset.id === videoAssetId) || null;
      store.avatars[avatarIndex] = nextAvatar;
      await writeStore(store);
      await appendSubscriberRegistration("avatar.backgroundless-video-updated", { avatar: nextAvatar, media: updatedAsset });
      sendJson(res, 200, {
        avatar: nextAvatar,
        media: updatedAsset,
        playback: updatedAsset ? backgroundlessPlaybackForAsset(updatedAsset) : null,
        summary: videoBackgroundlessSummary(nextAvatar)
      });
      return;
    }

    if (action === "assets" && req.method === "POST") {
      const body = await readBody(req);
      const nextAvatar = assignAssetToSlot(avatar, body.asset || body, body.slotId || null);
      store.avatars[avatarIndex] = nextAvatar;
      await writeStore(store);
      await appendSubscriberRegistration("avatar.asset-attached", { avatar: nextAvatar, media: body.asset || body });
      sendJson(res, 200, nextAvatar);
      return;
    }
  }

  const sceneMediaMatch = pathname.match(/^\/api\/world\/scenes\/([^/]+)\/media$/);
  if (sceneMediaMatch && req.method === "POST") {
    const sceneId = sceneMediaMatch[1];
    const body = await readBody(req);
    const graph = attachSceneMedia(await readSceneStore(), sceneId, body.asset || body, body.slotId || null);
    await writeSceneStore(graph);
    await appendSubscriberRegistration("world.scene-media-attached", { sceneGraph: graph, media: body.asset || body });
    sendJson(res, 200, graph);
    return;
  }

  if (pathname.startsWith("/media/")) {
    const served = await serveMedia(pathname, req, res);
    if (served) return;
  }

  if (staticDir) {
    const served = await serveStatic(staticDir, pathname, res);
    if (served) return;
  }

  sendJson(res, 404, { error: "not_found", path: pathname });
}

async function readStore() {
  return readNormalizedJson(STORE_PATH, "avatar-store", (store) => {
    const avatars = (store.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
    return {
      ...store,
      avatars,
      teams: normalizeAvatarTeams(store.teams, avatars)
    };
  });
}

async function writeStore(store) {
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  invalidateJsonCache(STORE_PATH);
}

function isStaleAvatarUpdate(currentAvatar, incomingAvatar) {
  const currentTime = Date.parse(currentAvatar?.updatedAt || "");
  const incomingTime = Date.parse(incomingAvatar?.updatedAt || "");
  if (!Number.isFinite(currentTime) || !Number.isFinite(incomingTime)) return false;
  return incomingTime < currentTime;
}

async function readSceneStore() {
  try {
    return await readNormalizedJson(SCENE_STORE_PATH, "scene-store", normalizeSceneGraph);
  } catch {
    const graph = createSceneGraphScaffold();
    await writeSceneStore(graph);
    return graph;
  }
}

async function writeSceneStore(graph) {
  await mkdir(path.dirname(SCENE_STORE_PATH), { recursive: true });
  await writeFile(SCENE_STORE_PATH, `${JSON.stringify(normalizeSceneGraph(graph), null, 2)}\n`, "utf8");
  invalidateJsonCache(SCENE_STORE_PATH);
}

async function readTarotStore() {
  try {
    return await readNormalizedJson(TAROT_STORE_PATH, "tarot-store", normalizeTarotStore);
  } catch {
    const store = createTarotStore();
    await writeTarotStore(store);
    return store;
  }
}

async function writeTarotStore(store) {
  await mkdir(path.dirname(TAROT_STORE_PATH), { recursive: true });
  await writeFile(TAROT_STORE_PATH, `${JSON.stringify(normalizeTarotStore(store), null, 2)}\n`, "utf8");
  invalidateJsonCache(TAROT_STORE_PATH);
}

async function readSystemMediaLibrary() {
  try {
    return await readNormalizedJson(SYSTEM_MEDIA_PATH, "system-media-library", normalizeSystemMediaLibrary);
  } catch {
    return createSystemMediaLibrary();
  }
}

async function writeSystemMediaLibrary(library) {
  await mkdir(path.dirname(SYSTEM_MEDIA_PATH), { recursive: true });
  await writeFile(SYSTEM_MEDIA_PATH, `${JSON.stringify(normalizeSystemMediaLibrary(library), null, 2)}\n`, "utf8");
  invalidateJsonCache(SYSTEM_MEDIA_PATH);
}

async function patchSystemMediaRecord(recordId, patch = {}) {
  const library = await readSystemMediaLibrary();
  const decodedId = decodeURIComponent(recordId);
  const index = library.records.findIndex((record) => record.id === decodedId);
  if (index < 0) {
    const error = new Error(`System media record not found: ${decodedId}`);
    error.statusCode = 404;
    throw error;
  }
  const current = library.records[index];
  const next = {
    ...current,
    ...pickSystemMediaPatch(patch),
    relationships: patch.relationships ? uniqueSystemMediaRelationships(patch.relationships) : current.relationships || [],
    tags: patch.tags ? uniqueStrings(patch.tags) : current.tags || [],
    updatedAt: new Date().toISOString()
  };
  if (next.asset) {
    next.asset = {
      ...next.asset,
      tags: uniqueStrings([...(next.asset.tags || []), ...(patch.tags || [])]),
      metadata: {
        ...(next.asset.metadata || {}),
        systemMedia: {
          ...(next.asset.metadata?.systemMedia || {}),
          documentKind: next.documentKind,
          reviewPriority: next.reviewPriority,
          reviewStatus: next.reviewStatus,
          relationships: next.relationships,
          updatedAt: next.updatedAt
        }
      }
    };
  }
  library.records[index] = next;
  library.updatedAt = next.updatedAt;
  await writeSystemMediaLibrary(library);
  return library;
}

function pickSystemMediaPatch(patch = {}) {
  const allowed = {};
  for (const key of ["documentKind", "reviewPriority", "reviewStatus", "notes", "match"]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
  }
  return allowed;
}

function compactSystemMediaLibrary(library) {
  const normalized = normalizeSystemMediaLibrary(library);
  return {
    ...normalized,
    records: normalized.records.map((record) => ({
      id: record.id,
      sourceKind: record.sourceKind,
      name: record.name,
      mediaType: record.mediaType,
      uri: record.uri,
      thumbnailUri: record.thumbnailUri,
      sourcePath: record.sourcePath,
      sourceRoots: record.sourceRoots,
      sourceRelativePaths: record.sourceRelativePaths,
      contentFingerprint: record.contentFingerprint,
      sizeBytes: record.sizeBytes,
      width: record.width,
      height: record.height,
      duration: record.duration,
      documentKind: record.documentKind,
      reviewPriority: record.reviewPriority,
      tags: (record.tags || []).slice(0, 24),
      relationships: record.relationships || [],
      match: record.match || null,
      reviewStatus: record.reviewStatus || null,
      notes: record.notes || "",
      asset: compactSystemMediaAsset(record.asset),
      intelligence: compactMediaIntelligence(record.intelligence),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }))
  };
}

function compactSystemMediaAsset(asset = null) {
  if (!asset) return null;
  const frames = asset.metadata?.frames || asset.state?.keyframes || [];
  return {
    id: asset.id,
    name: asset.name,
    uri: asset.uri,
    type: asset.type,
    requirementId: asset.requirementId,
    tags: asset.tags || [],
    source: asset.source,
    notes: asset.notes || "",
    metadata: {
      originalFileName: asset.metadata?.originalFileName,
      mimeType: asset.metadata?.mimeType,
      sizeBytes: asset.metadata?.sizeBytes,
      width: asset.metadata?.width,
      height: asset.metadata?.height,
      duration: asset.metadata?.duration,
      format: asset.metadata?.format,
      thumbnail: asset.metadata?.thumbnail || null,
      thumbnailUri: asset.metadata?.thumbnailUri || null,
      frames: frames.map((frame) => ({
        id: frame.id,
        marker: frame.marker,
        label: frame.label,
        role: frame.role,
        time: frame.time,
        uri: frame.uri,
        width: frame.width,
        height: frame.height,
        mimeType: frame.mimeType,
        thumbnail: frame.thumbnail || null,
        thumbnailUri: frame.thumbnailUri || frame.thumbnail?.uri || null,
        fingerprint: frame.fingerprint || null,
        createdAt: frame.createdAt || null
      })),
      folderIngest: asset.metadata?.folderIngest || null,
      systemMedia: asset.metadata?.systemMedia || null,
      storage: asset.metadata?.storage ? {
        kind: asset.metadata.storage.kind,
        fileName: asset.metadata.storage.fileName,
        targetPath: asset.metadata.storage.targetPath
      } : null
    },
    state: asset.state?.keyframes ? {
      ...asset.state,
      keyframes: asset.state.keyframes.map((frame) => ({
        id: frame.id,
        marker: frame.marker,
        label: frame.label,
        role: frame.role,
        time: frame.time,
        uri: frame.uri,
        width: frame.width,
        height: frame.height,
        mimeType: frame.mimeType,
        thumbnail: frame.thumbnail || null,
        thumbnailUri: frame.thumbnailUri || frame.thumbnail?.uri || null,
        fingerprint: frame.fingerprint || null,
        createdAt: frame.createdAt || null
      }))
    } : asset.state || null,
    processing: asset.processing || {}
  };
}

function compactMediaIntelligence(intelligence = null) {
  if (!intelligence) return null;
  return {
    schemaVersion: intelligence.schemaVersion,
    status: intelligence.status,
    provider: intelligence.provider,
    model: intelligence.model,
    source: intelligence.source,
    confidence: intelligence.confidence,
    ocr: intelligence.ocr ? {
      status: intelligence.ocr.status,
      lineCount: intelligence.ocr.lineCount || 0,
      lines: (intelligence.ocr.lines || []).slice(0, 16),
      sourceLanguage: intelligence.ocr.sourceLanguage
    } : null,
    vision: intelligence.vision ? {
      status: intelligence.vision.status,
      labels: (intelligence.vision.labels || []).slice(0, 16),
      description: intelligence.vision.description
    } : null,
    classifications: intelligence.classifications || {},
    attributes: intelligence.attributes ? {
      dimensions: intelligence.attributes.dimensions,
      palette: intelligence.attributes.palette,
      textDensity: intelligence.attributes.textDensity,
      visualLabelCount: intelligence.attributes.visualLabelCount,
      productionUse: intelligence.attributes.productionUse
    } : {},
    rankings: intelligence.rankings || {},
    tarotCandidates: (intelligence.tarotCandidates || []).slice(0, 8),
    sheetSignals: {
      identity: (intelligence.sheetSignals?.identity || []).slice(0, 8),
      lore: (intelligence.sheetSignals?.lore || []).slice(0, 8),
      skills: (intelligence.sheetSignals?.skills || []).slice(0, 8),
      persona: (intelligence.sheetSignals?.persona || []).slice(0, 8)
    },
    gaps: (intelligence.gaps || []).slice(0, 8)
  };
}

function uniqueSystemMediaRelationships(relationships = []) {
  const byKey = new Map();
  for (const rel of Array.isArray(relationships) ? relationships : []) {
    if (!rel?.ownerType && !rel?.ownerId) continue;
    byKey.set(`${rel.ownerType}:${rel.ownerId}:${rel.role || ""}`, {
      ownerType: rel.ownerType || "unknown",
      ownerId: rel.ownerId || null,
      ownerName: rel.ownerName || rel.ownerId || "Unknown",
      role: rel.role || "media"
    });
  }
  return [...byKey.values()];
}

function uniqueStrings(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

async function readItemStore() {
  try {
    return await readNormalizedJson(ITEM_STORE_PATH, "item-store", normalizeItemManagerStore);
  } catch {
    const store = createItemManagerScaffold();
    await writeItemStore(store);
    return store;
  }
}

async function writeItemStore(store) {
  await mkdir(path.dirname(ITEM_STORE_PATH), { recursive: true });
  await writeFile(ITEM_STORE_PATH, `${JSON.stringify(normalizeItemManagerStore(store), null, 2)}\n`, "utf8");
  invalidateJsonCache(ITEM_STORE_PATH);
}

async function readInventoryStore() {
  try {
    const store = await readStore();
    const itemStore = await readItemStore();
    return await readNormalizedJson(
      INVENTORY_STORE_PATH,
      `inventory-store:${store.updatedAt || ""}:${itemStore.updatedAt || ""}`,
      (inventory) => normalizeInventoryStore(inventory, store.avatars || [], itemStore.cards || [])
    );
  } catch {
    const store = await readStore();
    const itemStore = await readItemStore();
    const inventoryStore = createInventoryStoreScaffold({
      avatars: store.avatars || [],
      itemCards: itemStore.cards || []
    });
    await writeInventoryStore(inventoryStore);
    return inventoryStore;
  }
}

async function writeInventoryStore(store) {
  await mkdir(path.dirname(INVENTORY_STORE_PATH), { recursive: true });
  await writeFile(INVENTORY_STORE_PATH, `${JSON.stringify(normalizeInventoryStore(store), null, 2)}\n`, "utf8");
  invalidateJsonCache(INVENTORY_STORE_PATH);
}

async function readDearPapaSongbook() {
  return readJson(DEAR_PAPA_SONGBOOK_PATH);
}

async function readHapaSongStore() {
  const songbook = await readDearPapaSongbook();
  try {
    return await readNormalizedJson(HAPA_SONG_STORE_PATH, "hapa-song-store", (store) => normalizeHapaSongStore(store, songbook));
  } catch {
    const store = createHapaSongStoreFromDearPapaSongbook(songbook);
    await writeHapaSongStore(store);
    return store;
  }
}

async function writeHapaSongStore(store) {
  const songbook = await readDearPapaSongbook();
  const normalizedStore = normalizeHapaSongStore(store, songbook);
  await mkdir(path.dirname(HAPA_SONG_STORE_PATH), { recursive: true });
  await writeFile(HAPA_SONG_STORE_PATH, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8");
  invalidateJsonCache(HAPA_SONG_STORE_PATH);
}

function findSongInStore(store, songId) {
  return (store.songs || []).find((song) => song.id === songId || song.songId === songId || song.cardId === songId) || null;
}

async function readSongRegistry() {
  return readJson(SONG_REGISTRY_DATA_PATH);
}

async function readDearPapaRegistrySongs(limit = 500) {
  const registry = await readSongRegistry();
  const allSongs = (registry.songs || []).filter(isDearPapaRegistrySong)
    .slice()
    .sort((a, b) =>
      Number(a.raw?._hapaPlaylistExport?.trackNumber || 0) - Number(b.raw?._hapaPlaylistExport?.trackNumber || 0)
      || String(a.title || "").localeCompare(String(b.title || ""))
    );
  const songs = allSongs.slice(0, limit);
  return {
    schemaVersion: "hapa.song-registry.api.songs.v1",
    collection: "dear-papa",
    source: {
      registry: "hapa-song-registry",
      registryPath: SONG_REGISTRY_DATA_PATH,
      playlistId: DEAR_PAPA_PLAYLIST_ID,
      proxy: "hapa-avatar-builder"
    },
    total: allSongs.length,
    songs: songs.map(compactRegistrySong)
  };
}

async function findRegistrySong(id) {
  const registry = await readSongRegistry();
  const decoded = decodeURIComponent(id);
  return (registry.songs || []).find((song) => song.id === decoded || song.title === decoded) || null;
}

function compactRegistrySong(song, options = {}) {
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  const audioUri = song.localPath ? `/api/song-registry/audio/${encodeURIComponent(song.id)}` : song.audioUrl || null;
  const coverUri = exportInfo.coverPath ? `/api/song-registry/covers/${encodeURIComponent(song.id)}` : song.imageUrl || null;
  const payload = {
    id: song.id,
    title: song.title,
    authors: song.authors || [],
    duration: song.duration || null,
    createdAt: song.createdAt || null,
    model: song.model || null,
    majorModelVersion: song.majorModelVersion || null,
    contentType: song.contentType || "song",
    stemCount: song.stemCount || 0,
    stemTypes: song.stemTypes || [],
    tags: song.tags || "",
    localAvailable: Boolean(song.localPath),
    audioUri,
    coverUri,
    lyrics: song.lyrics || "",
    source: {
      registry: "hapa-song-registry",
      collection: isDearPapaRegistrySong(song) ? "dear-papa" : "song-registry",
      playlistId: playlistIdForRegistrySong(song),
      localPath: song.localPath || null
    }
  };
  if (options.detail) {
    payload.lyricTiming = song.lyricTiming || song.lyricTimings || null;
    payload.promptGroupId = song.promptGroupId || null;
    payload.lyricMasterId = song.lyricMasterId || null;
    payload.facets = song.facets || {};
    payload.rawExport = exportInfo;
  }
  return payload;
}

function isDearPapaRegistrySong(song) {
  const exportInfo = song.raw?._hapaPlaylistExport || {};
  return exportInfo.kind === "song" && String(exportInfo.songDir || "").includes(`/playlists/${DEAR_PAPA_PLAYLIST_ID}/songs/`);
}

function playlistIdForRegistrySong(song) {
  const songDir = song.raw?._hapaPlaylistExport?.songDir || "";
  const match = String(songDir).match(/\/playlists\/([^/]+)\/songs\//);
  return match ? match[1] : null;
}

async function appendSubscriberRegistration(action, { avatar = null, media = null, sceneGraph = null, itemStore = null, inventoryStore = null, songStore = null, tarot = null } = {}) {
  await mkdir(SUBSCRIBER_DIR, { recursive: true });
  const occurredAt = new Date().toISOString();
  const baseEvent = {
    schemaVersion: "hapa.subscriber-registration.v1",
    id: `subscriber-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source: "hapa-avatar-builder",
    action,
    occurredAt,
    subscribers: SUBSCRIBERS,
    avatar: avatar ? compactAvatarRegistration(avatar) : null,
    media: media ? compactMediaRegistration(media) : null,
    world: sceneGraph ? compactSceneGraphRegistration(sceneGraph) : null,
    items: itemStore ? compactItemStoreRegistration(itemStore) : null,
    inventory: inventoryStore ? compactInventoryRegistration(inventoryStore) : null,
    songs: songStore ? compactSongStoreRegistration(songStore) : null,
    tarot: tarot ? compactTarotRegistration(tarot) : null
  };

  await appendFile(path.join(SUBSCRIBER_DIR, "events.ndjson"), `${JSON.stringify(baseEvent)}\n`, "utf8");
  await Promise.all(SUBSCRIBERS.map((subscriber) => appendFile(
    path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`),
    `${JSON.stringify({ ...baseEvent, subscriber, status: "queued" })}\n`,
    "utf8"
  )));
  await writeFile(path.join(SUBSCRIBER_DIR, "latest.json"), `${JSON.stringify(baseEvent, null, 2)}\n`, "utf8");
  await writeFile(path.join(SUBSCRIBER_DIR, "latest-summary.json"), `${JSON.stringify(summarizeSubscriberEvent(baseEvent), null, 2)}\n`, "utf8");
}

function compactSceneGraphRegistration(graph) {
  const normalized = normalizeSceneGraph(graph);
  return {
    atlasEntityId: "hapa-world:scene-graph",
    secondBrainPathHint: "world/scene-graph.md",
    schemaVersion: normalized.schemaVersion,
    places: normalized.places.length,
    scenes: normalized.scenes.length,
    episodes: normalized.episodes?.length || 0,
    volumes: normalized.volumes?.length || 0,
    placeCards: (normalized.places || []).filter((place) => place.placeCard?.id).length,
    timelines: normalized.timelines.length,
    updatedAt: normalized.updatedAt,
    sceneAttachEndpoints: normalized.scenes.slice(0, 24).map((scene) => ({
      sceneId: scene.id,
      title: scene.title,
      endpoint: `/api/world/attach?sceneId=${encodeURIComponent(scene.id)}`
    }))
  };
}

function compactItemStoreRegistration(store) {
  const normalized = normalizeItemManagerStore(store);
  return {
    atlasEntityId: "hapa-items:item-manager",
    secondBrainPathHint: "items/item-manager.md",
    schemaVersion: normalized.schemaVersion,
    total: normalized.cards.length,
    byKind: normalized.audit.byKind,
    byCanonStatus: normalized.audit.byCanonStatus,
    withPrompts: normalized.audit.withPrompts,
    updatedAt: normalized.updatedAt,
    attachEndpoint: "/api/items/attach",
    sampleCards: normalized.cards.slice(0, 24).map((card) => ({
      id: card.id,
      title: card.title,
      kind: card.kind,
      canonStatus: card.canonStatus,
      avatarIds: card.connections.avatarIds,
      placeIds: card.connections.placeIds
    }))
  };
}

function compactInventoryRegistration(store) {
  const normalized = normalizeInventoryStore(store);
  return {
    atlasEntityId: "hapa-inventory:avatar-card-inventory",
    secondBrainPathHint: "items/avatar-inventory.md",
    schemaVersion: normalized.schemaVersion,
    avatarCount: normalized.avatarInventories.length,
    equippedCards: normalized.audit.equippedCards,
    totalEquipments: normalized.audit.totalEquipments,
    libraryCards: normalized.audit.libraryCards,
    updatedAt: normalized.updatedAt,
    attachEndpoint: "/api/items/attach",
    avatarSamples: normalized.avatarInventories.slice(0, 24).map((inventory) => ({
      avatarId: inventory.avatarId,
      avatarName: inventory.avatarName,
      library: inventory.library.length,
      equipped: inventory.hardpoints.reduce((count, hardpoint) => count + hardpoint.cardIds.length, 0)
    }))
  };
}

function compactSongStoreRegistration(store) {
  const songs = Array.isArray(store.songs) ? store.songs : [];
  const audit = store.audit || {};
  return {
    atlasEntityId: "hapa-songs:dear-papa",
    secondBrainPathHint: "songs/dear-papa.md",
    schemaVersion: store.schemaVersion,
    scope: store.scope,
    album: store.album,
    total: songs.length,
    withLyrics: audit.withLyrics || songs.filter((song) => Boolean(song.lyrics?.text)).length,
    withTimings: audit.withTimings || songs.filter((song) => (song.lyricTimings || []).length).length,
    withAvatars: audit.withAvatars || songs.filter((song) => (song.attachments?.avatarLinks || []).length).length,
    withScenes: audit.withScenes || songs.filter((song) => (song.attachments?.sceneLinks || []).length).length,
    withMedia: audit.withMedia || songs.filter((song) => (song.media || []).length).length,
    withVisualizers: audit.withVisualizers || songs.filter((song) => (song.visualizers || []).length).length,
    updatedAt: store.updatedAt,
    attachEndpoint: "/api/hapa-songs",
    sampleSongs: songs.slice(0, 24).map((song) => ({
      id: song.id,
      songId: song.songId,
      title: song.title,
      author: song.author,
      trackNumber: song.trackNumber,
      avatarIds: (song.attachments?.avatarLinks || []).map((link) => link.avatarId).filter(Boolean),
      sceneIds: (song.attachments?.sceneLinks || []).map((link) => link.sceneId).filter(Boolean),
      mediaCount: song.media?.length || 0,
      visualizerCount: song.visualizers?.length || 0,
      lyricsStatus: song.lyrics?.status || "missing"
    }))
  };
}

function compactTarotRegistration(store) {
  const normalized = normalizeTarotStore(store);
  const summary = summarizeTarotStore(normalized);
  return {
    atlasEntityId: "hapa-tarot:library",
    secondBrainPathHint: "tarot/library.md",
    schemaVersion: normalized.schemaVersion,
    updatedAt: normalized.updatedAt,
    summary,
    attachPack: {
      schemaVersion: "hapa.tarot-attach-pack.v1",
      endpoint: "/api/tarot/attach?target=hapa-subscriber",
      cardCount: normalized.cards.length,
      deckCount: normalized.decks.length,
      setCount: normalized.sets.length,
      cardBackCount: summary.cardBacks,
      loopVideoCount: summary.loopVideos
    },
    dashboard: createTarotLibraryDashboard(normalized),
    decks: normalized.decks.slice(0, 24).map((deck) => ({
      atlasEntityId: `hapa-tarot-deck:${deck.id}`,
      id: deck.id,
      title: deck.title,
      status: deck.status,
      cards: deck.cardIds.length,
      backCardId: deck.backCardId,
      endpoint: `/api/tarot/attach?deckId=${encodeURIComponent(deck.id)}&target=hapa-subscriber`
    })),
    sets: normalized.sets.slice(0, 24).map((set) => ({
      atlasEntityId: `hapa-tarot-set:${set.id}`,
      id: set.id,
      title: set.title,
      status: set.status,
      cards: set.cardIds.length,
      endpoint: `/api/tarot/attach?setId=${encodeURIComponent(set.id)}&target=hapa-subscriber`
    })),
    cards: normalized.cards.slice(0, 48).map((card) => ({
      atlasEntityId: `hapa-tarot-card:${card.id}`,
      id: card.id,
      title: card.title,
      status: card.status,
      cardType: card.cardType,
      deckIds: card.deckIds,
      setIds: card.setIds,
      avatarLinks: card.avatarLinks,
      media: card.asset ? compactMediaRegistration(card.asset) : null,
      assetCount: card.assets.length,
      loopVideoCount: card.assets.filter((asset) => asset.type === "video").length,
      endpoint: `/api/tarot/attach?cardId=${encodeURIComponent(card.id)}&target=hapa-subscriber`
    }))
  };
}

function compactAvatarRegistration(avatar) {
  const normalized = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalized);
  const attachPack = createAttachPack(normalized, "hapa-subscriber");
  const mindSummary = createAvatarMindSummary(normalized);
  const media = (normalized.assets || []).map(compactMediaRegistration);
  return {
    atlasEntityId: `hapa-avatar:${normalized.id}`,
    secondBrainPathHint: `avatars/${normalized.id}.md`,
    id: normalized.id,
    primaryName: normalized.primaryName,
    names: normalized.names?.map((item) => item.name) || [normalized.primaryName],
    grade: audit.grade,
    percent: audit.percent,
    required: audit.required,
    filled: audit.filled,
    missing: audit.missing,
    updatedAt: normalized.updatedAt,
    attachPack: {
      schemaVersion: attachPack.schemaVersion,
      avatarCardId: attachPack.avatarCardId,
      target: attachPack.target,
      grade: attachPack.completeness?.grade || audit.grade,
      endpoint: `/api/avatars/${normalized.id}/attach?target=hapa-subscriber`,
      baseReferenceCount: attachPack.baseReferences.length,
      modelReferenceCount: attachPack.modelReferences.length,
      videoBranchCount: attachPack.videoBranches.length,
      backgroundlessReadyCount: media.filter((asset) => asset.backgroundless?.ready).length,
      videoLinkCount: attachPack.videoLinks.length,
      videoMatchQueueCount: attachPack.videoMatchQueue.length
    },
    mind: {
      schemaVersion: mindSummary.schemaVersion,
      endpoint: `/api/avatars/${normalized.id}/mind`,
      updatedAt: mindSummary.updatedAt,
      counts: mindSummary.counts,
      knownOthers: mindSummary.knownOthers.slice(0, 24),
      contextCount: mindSummary.context.length
    },
    media,
    relationships: [
      ...media.map((asset) => ({
        from: `hapa-avatar:${normalized.id}`,
        type: "HAS_MEDIA_ASSET",
        to: asset.atlasEntityId,
        role: asset.requirementId || "media"
      })),
      ...mindSummary.knownOthers.map((relationship) => ({
        from: `hapa-avatar:${normalized.id}`,
        type: "HAS_MIND_RELATIONSHIP",
        to: relationship.id ? `hapa-avatar:${relationship.id}` : `hapa-avatar-name:${slugify(relationship.name)}`,
        role: relationship.relationLabel || "known-other",
        trust: relationship.trust,
        tension: relationship.tension,
        loyalty: relationship.loyalty,
        confidence: relationship.confidence,
        classification: relationship.classification
      }))
    ]
  };
}

function compactMediaRegistration(media) {
  const playback = backgroundlessPlaybackForAsset(media);
  return {
    atlasEntityId: `hapa-media:${media.id || slugify(media.name || media.uri || "asset")}`,
    id: media.id || null,
    name: media.name || null,
    type: media.type || media.mimeType || null,
    uri: media.uri || null,
    playbackUri: playback.ready ? playback.uri : media.uri || null,
    backgroundless: compactBackgroundlessPlayback(playback),
    requirementId: media.requirementId || media.metadata?.sectionRequirementId || null,
    tags: media.tags || [],
    sizeBytes: media.sizeBytes || media.metadata?.sizeBytes || null,
    width: media.metadata?.width || null,
    height: media.metadata?.height || null,
    thumbnail: media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null,
    storage: media.storage || media.metadata?.storage || null,
    updatedAt: media.updatedAt || media.processing?.attachedAt || media.processing?.processedAt || null
  };
}

function compactBackgroundlessPlayback(playback = {}) {
  if (!playback?.state) return null;
  return {
    schemaVersion: playback.state.schemaVersion,
    status: playback.status,
    ready: playback.ready,
    hasAlpha: playback.hasAlpha,
    uri: playback.ready ? playback.uri : null,
    sourceUri: playback.sourceUri,
    posterUri: playback.posterUri || null,
    variantCount: playback.state.variants?.length || 0,
    taskId: playback.state.taskId || null,
    sourceVideoHash: playback.state.sourceVideoHash || null,
    backend: playback.state.backend || null,
    keyer: playback.state.keyer || null,
    codec: playback.state.codec || null,
    updatedAt: playback.state.updatedAt || null
  };
}

function createBackgroundlessVideoLibrarySummary(store = {}) {
  const avatars = (store.avatars || []).map((avatar) => videoBackgroundlessSummary(avatar));
  return {
    schemaVersion: "hapa.backgroundless-video-library.v1",
    generatedAt: new Date().toISOString(),
    avatarCount: avatars.length,
    total: avatars.reduce((sum, avatar) => sum + avatar.total, 0),
    ready: avatars.reduce((sum, avatar) => sum + avatar.ready, 0),
    queued: avatars.reduce((sum, avatar) => sum + avatar.queued, 0),
    processing: avatars.reduce((sum, avatar) => sum + avatar.processing, 0),
    failed: avatars.reduce((sum, avatar) => sum + avatar.failed, 0),
    missing: avatars.reduce((sum, avatar) => sum + avatar.missing, 0),
    avatars
  };
}

async function readOverwindBootstrap(selectedAvatarId = null, includeSelectedAvatar = false) {
  const signature = await createOverwindBootstrapSignature(selectedAvatarId, includeSelectedAvatar);
  if (overwindBootstrapCache?.signature === signature) {
    return overwindBootstrapCache.payload;
  }
  const persistedProjection = await readPersistedOverwindProjection(signature);
  if (persistedProjection) {
    overwindBootstrapCache = {
      signature,
      payload: persistedProjection
    };
    return persistedProjection;
  }
  const [store, board, graph, itemStore, inventoryStore] = await Promise.all([
    readStore(),
    readJson(KANBAN_PATH).catch(() => ({ schemaVersion: "hapa.kanban.v1", lanes: [] })),
    readSceneStore(),
    readItemStore(),
    readInventoryStore()
  ]);
  const selectedAvatar = (store.avatars || []).find((avatar) => avatar.id === selectedAvatarId) || store.avatars?.[0] || null;
  const projection = {
    schemaVersion: "hapa.overwind.avatar-builder-bootstrap.v1",
    generatedAt: new Date().toISOString(),
    sourceSignature: signature,
    source: {
      app: "hapa-avatar-builder",
      avatarStore: STORE_PATH,
      worldStore: SCENE_STORE_PATH,
      itemStore: ITEM_STORE_PATH,
      inventoryStore: INVENTORY_STORE_PATH,
      kanbanStore: KANBAN_PATH
    },
    persistence_target: {
      id: "hapa_overwind",
      path: OVERWIND_BOOTSTRAP_PATH,
      entityNames: OVERWIND_ENTITY_NAMES,
      servingMode: "compact-bootstrap-plus-lazy-detail"
    },
    counts: {
      avatars: store.avatars?.length || 0,
      teams: store.teams?.length || 0,
      places: graph.places?.length || 0,
      scenes: graph.scenes?.length || 0,
      cards: itemStore.cards?.length || 0,
      inventories: inventoryStore.avatarInventories?.length || 0
    },
    avatars: (store.avatars || []).map(compactAvatarForOverwind),
    selectedAvatar: includeSelectedAvatar ? selectedAvatar : null,
    selectedAvatarId: selectedAvatar?.id || null,
    teams: store.teams || [],
    world: compactSceneGraphForOverwind(graph),
    items: compactItemStoreForOverwind(itemStore),
    inventory: inventoryStore,
    kanban: board
  };
  await persistOverwindProjection(projection);
  overwindBootstrapCache = {
    signature,
    payload: projection
  };
  return projection;
}

async function readPersistedOverwindProjection(signature) {
  try {
    const payload = JSON.parse(await readFile(OVERWIND_BOOTSTRAP_PATH, "utf8"));
    return payload?.sourceSignature === signature ? payload : null;
  } catch {
    return null;
  }
}

async function createOverwindBootstrapSignature(selectedAvatarId, includeSelectedAvatar) {
  const sourceFiles = [STORE_PATH, KANBAN_PATH, SCENE_STORE_PATH, ITEM_STORE_PATH, INVENTORY_STORE_PATH];
  const fileParts = await Promise.all(sourceFiles.map(async (filePath) => {
    try {
      const fileStat = await stat(filePath);
      return [path.resolve(filePath), fileStat.mtimeMs, fileStat.size];
    } catch {
      return [path.resolve(filePath), 0, 0];
    }
  }));
  return JSON.stringify({
    selectedAvatarId: selectedAvatarId || "",
    includeSelectedAvatar: Boolean(includeSelectedAvatar),
    files: fileParts
  });
}

async function persistOverwindProjection(projection) {
  await mkdir(OVERWIND_DIR, { recursive: true });
  await writeFile(OVERWIND_BOOTSTRAP_PATH, `${JSON.stringify(projection)}\n`, "utf8");
}

function compactAvatarForOverwind(avatar) {
  const normalized = normalizeAvatarCard(avatar);
  const audit = auditAvatar(normalized);
  const mindSummary = createAvatarMindSummary(normalized);
  return {
    schemaVersion: normalized.schemaVersion,
    id: normalized.id,
    primaryName: normalized.primaryName,
    names: normalized.names || [],
    aliases: normalized.aliases || [],
    status: normalized.status || "active",
    role: normalized.role || normalized.mind?.shipCrewAssignment?.role || "",
    summary: truncateText(normalized.summary || normalized.operatorNotes || normalized.three_paragraph_background_narrative?.paragraphs?.[0] || "", 420),
    operatorNotes: truncateText(normalized.operatorNotes || "", 420),
    updatedAt: normalized.updatedAt || null,
    slots: (normalized.slots || []).map(compactAvatarSlotForOverwind),
    assets: (normalized.assets || []).map(compactMediaForOverwind),
    mind: {
      schemaVersion: normalized.mind?.schemaVersion || mindSummary.schemaVersion,
      endpoint: `/api/avatars/${encodeURIComponent(normalized.id)}/mind`,
      updatedAt: mindSummary.updatedAt,
      counts: mindSummary.counts,
      personaAnchor: truncateText(normalized.mind?.personaAnchor || "", 420),
      shipCrewAssignment: normalized.mind?.shipCrewAssignment || null,
      gardenNodeAssignment: normalized.mind?.gardenNodeAssignment || null,
      journalCount: Array.isArray(normalized.mind?.journalEntries) ? normalized.mind.journalEntries.length : 0,
      knownOthers: mindSummary.knownOthers.slice(0, 12)
    },
    audit: {
      grade: audit.grade,
      percent: audit.percent,
      required: audit.required,
      filled: audit.filled,
      missing: audit.missing
    },
    overwindProjection: "compact",
    overwind: {
      persistenceTarget: "hapa_overwind",
      detailEndpoint: `/api/avatars/${encodeURIComponent(normalized.id)}`
    }
  };
}

function compactAvatarSlotForOverwind(slot) {
  return {
    id: slot.id,
    requirementId: slot.requirementId,
    label: slot.label,
    required: slot.required !== false,
    assetId: slot.assetId || null,
    preferredTags: slot.preferredTags || []
  };
}

function compactMediaForOverwind(media) {
  const compact = compactMediaRegistration(media);
  return {
    ...compact,
    mimeType: media.mimeType || media.type || null,
    metadata: {
      width: media.metadata?.width || null,
      height: media.metadata?.height || null,
      duration: media.metadata?.duration || media.metadata?.durationSeconds || null,
      posterUri: media.metadata?.posterUri || media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null,
      thumbnailUri: media.metadata?.thumbnail?.uri || media.metadata?.thumbnailUri || null
    }
  };
}

function compactSceneGraphForOverwind(graph) {
  const normalized = normalizeSceneGraph(graph);
  return {
    schemaVersion: normalized.schemaVersion,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    overwindProjection: "compact",
    places: (normalized.places || []).map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      summary: truncateText(place.summary || place.lore || "", 520),
      tags: place.tags || [],
      sceneIds: place.sceneIds || [],
      updatedAt: place.updatedAt || null
    })),
    scenes: (normalized.scenes || []).map((scene) => ({
      id: scene.id,
      title: scene.title,
      placeId: scene.placeId,
      timelineId: scene.timelineId,
      summary: truncateText(scene.summary || scene.narrativeText || scene.lore || "", 620),
      tags: scene.tags || [],
      avatarIds: scene.avatarIds || scene.connections?.avatarIds || [],
      itemIds: scene.itemIds || scene.connections?.itemIds || [],
      mediaAssets: compactMediaList(scene.mediaAssets || scene.assets || [], 6),
      canonicalTime: scene.canonicalTime || null,
      updatedAt: scene.updatedAt || null
    })),
    episodes: (normalized.episodes || []).map((episode) => ({
      id: episode.id,
      title: episode.title,
      summary: truncateText(episode.summary || "", 520),
      sceneIds: episode.sceneIds || [],
      updatedAt: episode.updatedAt || null
    })),
    volumes: (normalized.volumes || []).map((volume) => ({
      id: volume.id,
      title: volume.title,
      summary: truncateText(volume.summary || "", 520),
      episodeIds: volume.episodeIds || [],
      updatedAt: volume.updatedAt || null
    })),
    timelines: normalized.timelines || []
  };
}

function compactItemStoreForOverwind(store) {
  const normalized = normalizeItemManagerStore(store);
  return {
    schemaVersion: normalized.schemaVersion,
    title: normalized.title,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    audit: normalized.audit,
    agents: normalized.agents || [],
    auditRuns: [],
    overwindProjection: "compact",
    cards: (normalized.cards || []).map(compactItemCardForOverwind)
  };
}

function compactItemCardForOverwind(card) {
  return {
    id: card.id,
    schemaVersion: card.schemaVersion,
    cardType: card.cardType,
    kind: card.kind,
    title: card.title,
    name: card.name,
    status: card.status,
    canonStatus: card.canonStatus,
    summary: truncateText(card.summary || card.description || card.lore || "", 420),
    description: truncateText(card.description || "", 260),
    lore: truncateText(card.lore || "", 360),
    utility: compactStringList(card.utility, 6, 120),
    broadGameMechanics: compactStringList(card.broadGameMechanics, 6, 120),
    tags: card.tags || [],
    rank: card.rank,
    quality: card.quality || {},
    locationState: card.locationState || {},
    connections: compactConnectionsForOverwind(card.connections || {}),
    mediaAssets: compactMediaList(card.mediaAssets || [], 2),
    tarotCard: compactTarotDetailsForOverwind(card.tarotCard),
    shipCard: compactShipDetailsForOverwind(card.shipCard),
    sourceRefs: compactSourceRefsForOverwind(card.sourceRefs || [], 2),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    overwindProjection: "compact"
  };
}

function compactConnectionsForOverwind(connections = {}) {
  return {
    avatarIds: (connections.avatarIds || []).slice(0, 12),
    sceneIds: (connections.sceneIds || []).slice(0, 12),
    placeIds: (connections.placeIds || []).slice(0, 12),
    itemIds: (connections.itemIds || []).slice(0, 12),
    songIds: (connections.songIds || []).slice(0, 12)
  };
}

function compactTarotDetailsForOverwind(tarot = null) {
  if (!tarot || typeof tarot !== "object") return null;
  return {
    name: tarot.name || tarot.title || tarot.cardName || tarot.card_name || "",
    title: tarot.title || tarot.name || tarot.cardName || tarot.card_name || "",
    system: tarot.system || tarot.tarotSystem || tarot.tarot_system || "",
    type: tarot.type || tarot.cardType || tarot.card_type || "",
    types: compactStringList(tarot.types || tarot.cardTypes || tarot.card_types, 6, 80),
    arcana: tarot.arcana || tarot.arcanaType || tarot.arcana_type || "",
    suit: tarot.suit || "",
    rank: tarot.rank || tarot.number || "",
    catalog: compactPlainObject(tarot.catalog || tarot.cataloging, 12, 160),
    attribution: compactPlainObject(tarot.attribution, 12, 160),
    mechanics: compactPlainObject(tarot.mechanics, 16, 160),
    lore: truncateText(tarot.lore || tarot.meaning || tarot.description || "", 420),
    ocr: {
      confidence: tarot.ocr?.confidence || tarot.ocrConfidence || tarot.ocr_confidence || null,
      preview: truncateText(tarot.ocr?.text || tarot.ocr?.rawText || tarot.ocrText || tarot.ocr_text || "", 420)
    }
  };
}

function compactShipDetailsForOverwind(shipCard = null) {
  if (!shipCard || typeof shipCard !== "object") return null;
  return compactPlainObject(shipCard, 16, 160);
}

function compactSourceRefsForOverwind(sourceRefs = [], limit = 2) {
  return (Array.isArray(sourceRefs) ? sourceRefs : []).slice(0, limit).map((sourceRef) => ({
    id: sourceRef.id || null,
    label: sourceRef.label || sourceRef.title || sourceRef.name || "",
    type: sourceRef.type || sourceRef.kind || "",
    uri: sourceRef.uri || sourceRef.url || "",
    summary: truncateText(sourceRef.summary || sourceRef.description || "", 160)
  }));
}

function compactMediaList(mediaList, limit = 8) {
  return (Array.isArray(mediaList) ? mediaList : []).slice(0, limit).map(compactMediaForOverwind);
}

function compactStringList(values = [], limit = 8, maxLength = 160) {
  return (Array.isArray(values) ? values : [values])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .slice(0, limit)
    .map((value) => truncateText(value, maxLength));
}

function compactPlainObject(value = null, limit = 12, maxLength = 180) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value ? truncateText(value, maxLength) : null;
  }
  return Object.fromEntries(Object.entries(value).slice(0, limit).map(([key, entry]) => {
    if (Array.isArray(entry)) return [key, compactStringList(entry, 8, maxLength)];
    if (entry && typeof entry === "object") return [key, compactPlainObject(entry, 8, maxLength)];
    return [key, truncateText(entry, maxLength)];
  }));
}

function truncateText(value, maxLength = 600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

async function readSubscriberStatus() {
  const targetCounts = {};
  for (const subscriber of SUBSCRIBERS) {
    targetCounts[subscriber] = await countNdjson(path.join(SUBSCRIBER_DIR, `${subscriber}.ndjson`));
  }
  const latest = await readLatestSubscriberSummary();
  return {
    schemaVersion: "hapa.subscriber-status.v1",
    subscriberDir: SUBSCRIBER_DIR,
    subscribers: SUBSCRIBERS,
    eventCount: await countNdjson(path.join(SUBSCRIBER_DIR, "events.ndjson")),
    targetCounts,
    latest
  };
}

async function readSubscriberEvents(limit = 50) {
  const events = await readNdjson(path.join(SUBSCRIBER_DIR, "events.ndjson"));
  return {
    schemaVersion: "hapa.subscriber-events.v1",
    subscriberDir: SUBSCRIBER_DIR,
    total: events.length,
    events: events.slice(-limit).reverse().map(summarizeSubscriberEvent)
  };
}

async function countNdjson(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    if (!text.trim()) return 0;
    return text.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function readLatestSubscriberSummary() {
  try {
    return JSON.parse(await readFile(path.join(SUBSCRIBER_DIR, "latest-summary.json"), "utf8"));
  } catch {
    const latest = await readLatestNdjson(path.join(SUBSCRIBER_DIR, "events.ndjson"));
    return latest ? summarizeSubscriberEvent(latest) : null;
  }
}

async function readLatestNdjson(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const latestLine = text.trimEnd().split("\n").filter(Boolean).at(-1);
    return latestLine ? JSON.parse(latestLine) : null;
  } catch {
    return null;
  }
}

function summarizeSubscriberEvent(event) {
  if (!event) return null;
  return {
    schemaVersion: "hapa.subscriber-summary.v1",
    id: event.id,
    source: event.source,
    action: event.action,
    occurredAt: event.occurredAt,
    subscribers: event.subscribers || [],
    avatar: event.avatar ? {
      atlasEntityId: event.avatar.atlasEntityId,
      secondBrainPathHint: event.avatar.secondBrainPathHint,
      id: event.avatar.id,
      primaryName: event.avatar.primaryName,
      grade: event.avatar.grade,
      percent: event.avatar.percent,
      required: event.avatar.required,
      filled: event.avatar.filled,
      missing: event.avatar.missing,
      mediaCount: event.avatar.media?.length || 0,
      relationshipCount: event.avatar.relationships?.length || 0,
      mindEndpoint: event.avatar.mind?.endpoint || `/api/avatars/${event.avatar.id}/mind`,
      mindCounts: event.avatar.mind?.counts || null,
      attachPackEndpoint: event.avatar.attachPack?.endpoint || `/api/avatars/${event.avatar.id}/attach?target=hapa-subscriber`
    } : null,
    media: event.media ? {
      atlasEntityId: event.media.atlasEntityId,
      id: event.media.id,
      name: event.media.name,
      type: event.media.type,
      requirementId: event.media.requirementId,
      uri: event.media.uri
    } : null,
    world: event.world ? {
      atlasEntityId: event.world.atlasEntityId,
      secondBrainPathHint: event.world.secondBrainPathHint,
      schemaVersion: event.world.schemaVersion,
      places: event.world.places,
      scenes: event.world.scenes,
      timelines: event.world.timelines,
      updatedAt: event.world.updatedAt
    } : null,
    items: event.items ? {
      atlasEntityId: event.items.atlasEntityId,
      secondBrainPathHint: event.items.secondBrainPathHint,
      schemaVersion: event.items.schemaVersion,
      total: event.items.total,
      byKind: event.items.byKind,
      withPrompts: event.items.withPrompts,
      updatedAt: event.items.updatedAt
    } : null,
    inventory: event.inventory ? {
      atlasEntityId: event.inventory.atlasEntityId,
      secondBrainPathHint: event.inventory.secondBrainPathHint,
      schemaVersion: event.inventory.schemaVersion,
      avatarCount: event.inventory.avatarCount,
      equippedCards: event.inventory.equippedCards,
      totalEquipments: event.inventory.totalEquipments,
      updatedAt: event.inventory.updatedAt
    } : null,
    songs: event.songs ? {
      atlasEntityId: event.songs.atlasEntityId,
      secondBrainPathHint: event.songs.secondBrainPathHint,
      schemaVersion: event.songs.schemaVersion,
      total: event.songs.total,
      withLyrics: event.songs.withLyrics,
      withAvatars: event.songs.withAvatars,
      withScenes: event.songs.withScenes,
      withMedia: event.songs.withMedia,
      withVisualizers: event.songs.withVisualizers,
      updatedAt: event.songs.updatedAt
    } : null,
    tarot: event.tarot ? {
      atlasEntityId: event.tarot.atlasEntityId,
      secondBrainPathHint: event.tarot.secondBrainPathHint,
      schemaVersion: event.tarot.schemaVersion,
      updatedAt: event.tarot.updatedAt,
      summary: event.tarot.summary,
      attachPackEndpoint: event.tarot.attachPack?.endpoint || "/api/tarot/attach?target=hapa-subscriber"
    } : null
  };
}

async function readNdjson(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function readJson(filePath) {
  return (await readCachedJson(filePath)).value;
}

async function readCachedJson(filePath) {
  const resolvedPath = path.resolve(filePath);
  const fileStat = await stat(resolvedPath);
  const cached = rawJsonCache.get(resolvedPath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return cached;
  }
  const value = JSON.parse(await readFile(resolvedPath, "utf8"));
  const entry = {
    value,
    mtimeMs: fileStat.mtimeMs,
    size: fileStat.size
  };
  rawJsonCache.set(resolvedPath, entry);
  return entry;
}

async function readNormalizedJson(filePath, cacheKey, normalizer) {
  const entry = await readCachedJson(filePath);
  const resolvedPath = path.resolve(filePath);
  const normalizedKey = `${cacheKey}:${resolvedPath}`;
  const cached = normalizedJsonCache.get(normalizedKey);
  if (cached && cached.mtimeMs === entry.mtimeMs && cached.size === entry.size) {
    return cached.value;
  }
  const value = normalizer(entry.value);
  normalizedJsonCache.set(normalizedKey, {
    value,
    mtimeMs: entry.mtimeMs,
    size: entry.size
  });
  return value;
}

function invalidateJsonCache(filePath) {
  rawJsonCache.delete(path.resolve(filePath));
  normalizedJsonCache.clear();
  overwindBootstrapCache = null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

function setCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function persistMedia(body) {
  const dataUrl = String(body.dataUrl || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    const error = new Error("Expected dataUrl in data:<mime>;base64,<payload> format");
    error.statusCode = 400;
    throw error;
  }

  const mimeType = body.mimeType || match[1];
  const bytes = Buffer.from(match[2], "base64");
  const baseName = slugify(path.basename(body.name || body.id || `media-${Date.now()}`, path.extname(body.name || ""))) || `media-${Date.now()}`;
  const ext = extensionForMime(mimeType, body.name);
  const fileName = `${baseName}-${Date.now()}-${bytes.length}.${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(filePath, bytes);

  return {
    id: body.id || baseName,
    uri: `/media/${fileName}`,
    name: body.name || fileName,
    mimeType,
    sizeBytes: bytes.length,
    storage: {
      kind: "local-file",
      fileName,
      path: filePath
    }
  };
}

async function serveMedia(pathname, req, res) {
  const root = path.resolve(MEDIA_DIR);
  const relativePath = decodeURIComponent(pathname.replace(/^\/media\/?/, ""));
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return false;
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const range = parseRange(req.headers.range, info.size);
    if (range) {
      res.writeHead(206, {
        "Content-Type": contentType(filePath),
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable"
      });
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
      return true;
    }
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable"
    });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

async function serveLocalFile(filePath, req, res) {
  try {
    const safePath = path.resolve(filePath);
    const info = await stat(safePath);
    if (!info.isFile()) {
      sendJson(res, 404, { error: "file_not_found" });
      return false;
    }
    const range = parseRange(req.headers.range, info.size);
    if (range) {
      res.writeHead(206, {
        "Content-Type": contentType(safePath),
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600"
      });
      createReadStream(safePath, { start: range.start, end: range.end }).pipe(res);
      return true;
    }
    res.writeHead(200, {
      "Content-Type": contentType(safePath),
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600"
    });
    createReadStream(safePath).pipe(res);
    return true;
  } catch {
    sendJson(res, 404, { error: "file_not_found" });
    return false;
  }
}

function parseRange(rangeHeader, size) {
  if (!rangeHeader || !/^bytes=/.test(rangeHeader)) return null;
  const [startText, endText] = rangeHeader.replace(/^bytes=/, "").split("-");
  const start = startText ? Number(startText) : 0;
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return {
    start,
    end: Math.min(end, size - 1)
  };
}

async function serveStatic(root, pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.resolve(root, `.${safePath}`);
  if (!filePath.startsWith(root)) return false;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(root, "index.html");
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".zip": "application/zip",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json"
  }[ext] || "application/octet-stream";
}

function extensionForMime(mimeType, name = "") {
  const fromName = path.extname(name).replace(".", "").toLowerCase();
  if (fromName) return fromName;
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
    "model/gltf-binary": "glb",
    "model/gltf+json": "gltf"
  }[mimeType] || "bin";
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
