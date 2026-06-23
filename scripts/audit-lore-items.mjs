#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../src/domain/avatar.js";
import { normalizeSceneGraph } from "../src/domain/scene.js";
import {
  createInventoryStoreScaffold,
  createItemCard,
  createItemManagerScaffold,
  equipItemCard,
  normalizeInventoryStore,
  normalizeItemManagerStore
} from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = "/Users/calderwong/Documents/Codex/2026-06-18/review-the-hapa-ecosystem-and-isolate";
const DATA_DIR = path.join(ROOT, "data");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "outputs");
const WIKI_ROOT = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki";
const SECOND_BRAIN_WIKI = "/Users/calderwong/Documents/Codex/2026-05-25/can-you-grab-my-1-amazon/hapa_second_brain/wiki_articles";

const PATHS = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  sceneStore: path.join(DATA_DIR, "scene-store.json"),
  blackHorizon: path.join(DATA_DIR, "black-horizon-foundation.json"),
  lorePlan: path.join(DATA_DIR, "lore-production-plan.json"),
  agentContract: path.join(DATA_DIR, "avatar-agent-contract.json"),
  kanban: path.join(DATA_DIR, "kanban.json"),
  itemStore: path.join(DATA_DIR, "item-manager-store.json"),
  inventoryStore: path.join(DATA_DIR, "inventory-store.json")
};

const now = new Date().toISOString();
const runId = `lore-object-audit-${now.replace(/[:.]/g, "-")}`;

await mkdir(OUTPUT_DIR, { recursive: true });

const avatarStore = await readJson(PATHS.avatarStore);
const sceneStore = normalizeSceneGraph(await readJson(PATHS.sceneStore));
const blackHorizon = await readJson(PATHS.blackHorizon).catch(() => ({}));
const previousItemStore = await readJson(PATHS.itemStore).catch(() => createItemManagerScaffold());
const previousInventoryStore = await readJson(PATHS.inventoryStore).catch(() => createInventoryStoreScaffold());
const lorePlan = await readJson(PATHS.lorePlan).catch(() => ({}));
const kanban = await readJson(PATHS.kanban).catch(() => ({ schemaVersion: "hapa.kanban-board.v1", lanes: [] }));
const agentContract = await readJson(PATHS.agentContract).catch(() => null);

await backupFile(PATHS.itemStore);
await backupFile(PATHS.inventoryStore);
await backupFile(PATHS.lorePlan);
await backupFile(PATHS.kanban);
await backupFile(PATHS.avatarStore);
await backupFile(PATHS.sceneStore);
if (agentContract) await backupFile(PATHS.agentContract);

const avatars = Array.isArray(avatarStore.avatars) ? avatarStore.avatars : [];
const itemCardsById = new Map((previousItemStore.cards || []).map((card) => [card.id, createItemCard(card)]));
const discoveryStats = {
  gardens: 0,
  ships: 0,
  systems: 0,
  kitItems: 0,
  protocolObjects: 0,
  skillObjects: 0,
  placeObjects: 0
};

seedSystemCards();
seedTeamProfileCards();
seedScenePlaceCards();
seedAvatarCards();

const itemStore = normalizeItemManagerStore({
  ...previousItemStore,
  cards: [...itemCardsById.values()].sort((a, b) => `${a.kind}:${a.title}`.localeCompare(`${b.kind}:${b.title}`)),
  agents: buildItemAgents(previousItemStore.agents),
  auditRuns: [
    {
      id: runId,
      agentId: "agent-lore-object-auditor",
      status: "done",
      startedAt: now,
      completedAt: now,
      sourceCounts: {
        avatars: avatars.length,
        scenes: sceneStore.scenes.length,
        places: sceneStore.places.length
      },
      discoveryStats
    },
    ...(previousItemStore.auditRuns || [])
  ],
  updatedAt: now
});

let inventoryStore = normalizeInventoryStore(previousInventoryStore, avatars, itemStore.cards);
inventoryStore = equipDiscoveredCards(inventoryStore, itemStore.cards);
inventoryStore = normalizeInventoryStore({ ...inventoryStore, updatedAt: now }, avatars, itemStore.cards);

const sceneStoreWithEvents = stampSceneEvents(sceneStore);
const featureFilm = buildFeatureFilmPlot(sceneStoreWithEvents, itemStore, avatars);
const nextLorePlan = buildLoreProductionPlan(lorePlan, itemStore, inventoryStore, sceneStoreWithEvents, featureFilm);
const nextKanban = drainKanban(kanban, itemStore, inventoryStore);
const nextAvatarStore = appendFeatureFilmGenesisContext(avatarStore, featureFilm);
const nextAgentContract = agentContract ? updateAgentContract(agentContract) : null;

await writeJson(PATHS.itemStore, itemStore);
await writeJson(PATHS.inventoryStore, inventoryStore);
await writeJson(PATHS.sceneStore, sceneStoreWithEvents);
await writeJson(PATHS.lorePlan, nextLorePlan);
await writeJson(PATHS.kanban, nextKanban);
await writeJson(PATHS.avatarStore, nextAvatarStore);
if (nextAgentContract) await writeJson(PATHS.agentContract, nextAgentContract);

const report = buildReport(itemStore, inventoryStore, sceneStoreWithEvents, nextLorePlan, nextKanban, featureFilm);
const reportJsonPath = path.join(OUTPUT_DIR, `${runId}.json`);
const reportMdPath = path.join(OUTPUT_DIR, `${runId}.md`);
await writeJson(reportJsonPath, report);
await writeText(reportMdPath, renderReportMarkdown(report));
await mirrorWiki(report);

console.log(JSON.stringify({
  ok: true,
  runId,
  itemCards: itemStore.cards.length,
  inventoryEquipments: inventoryStore.audit.totalEquipments,
  scenesTimestamped: sceneStoreWithEvents.scenes.length,
  kanbanCards: nextKanban.lanes.reduce((sum, lane) => sum + (lane.cards || []).length, 0),
  reportJsonPath,
  reportMdPath
}, null, 2));

function seedSystemCards() {
  const settings = blackHorizon.foundational_canon?.settings || [
    "Black Horizon Gardens around a supermassive black hole",
    "less-dilated colonized worlds",
    "Artifact Planet arena world between black holes",
    "Earth-present operator collaboration layer"
  ];
  for (const setting of settings) {
    const title = setting
      .replace("around a supermassive black hole", "")
      .replace("arena world between black holes", "Arena World")
      .replace("operator collaboration layer", "Operator Layer")
      .trim();
    discoveryStats.systems += 1;
    upsertCard({
      id: `system-${slugify(title)}`,
      kind: "system",
      title,
      canonStatus: "soft_canon",
      summary: setting,
      description: `${setting}. This system card anchors item, scene, inventory, and feature-film references for agents.`,
      lore: blackHorizon.foundational_canon?.time_dilation_strategy_loop || "",
      broadGameMechanics: [
        "timespace layer",
        "strategic production context",
        "canon routing surface"
      ],
      tags: ["system", "black-horizon", "foundation"],
      mediaPrompts: promptsFor(title, "system", "vast establishing vista"),
      sourceRefs: [{ label: "black-horizon-foundation.foundational_canon.settings", confidence: "soft" }]
    });
  }

  upsertCard({
    id: "system-proto-fleet-copy-loop",
    kind: "system",
    title: "Proto-Fleet Copy Loop",
    canonStatus: "soft_canon",
    summary: "Gardens expend energy to copy the Proto-Fleet, send lower-dilation crews outward, and receive returned knowledge and resources.",
    description: "Strategic production loop connecting Black Horizon 4X decisions, colonial identity splits, and Artifact arena growth.",
    lore: blackHorizon.foundational_canon?.time_dilation_strategy_loop || "",
    broadGameMechanics: ["fleet copy production", "return payloads", "consciousness split", "resource loop"],
    tags: ["system", "proto-fleet", "time-dilation"],
    mediaPrompts: promptsFor("Proto-Fleet Copy Loop", "system", "fleet-copy launch diagram"),
    sourceRefs: [{ label: "black-horizon-foundation.time_dilation_strategy_loop", confidence: "soft" }]
  });
}

function seedTeamProfileCards() {
  const profiles = blackHorizon.team_profiles || {};
  for (const [teamId, profile] of Object.entries(profiles)) {
    if (Array.isArray(profile.garden)) {
      const [gardenId, gardenName, gardenFunction] = profile.garden;
      discoveryStats.gardens += 1;
      upsertCard({
        id: `garden-${slugify(gardenId || gardenName)}`,
        kind: "garden",
        title: gardenName,
        canonStatus: "soft_canon",
        summary: gardenFunction,
        description: `${gardenName} maps ${profile.node?.[1] || profile.node?.[0] || "a Hapa node"} into a Black Horizon Garden that produces ${list(profile.produces)}.`,
        lore: profile.doctrine || "",
        utility: profile.functions || [],
        broadGameMechanics: ["Garden as node", "4X production", "team doctrine", "training station"],
        tags: ["garden", teamId, profile.key].filter(Boolean),
        locationState: {
          currentSystemName: "Black Horizon",
          currentGardenName: gardenName,
          state: "stationary-orbit"
        },
        connections: {
          teamIds: [teamId],
          nodeIds: [profile.node?.[0], profile.node?.[1]].filter(Boolean)
        },
        mediaPrompts: promptsFor(gardenName, "garden", "massive stationary habitat orbiting a black hole"),
        sourceRefs: [{ label: `black-horizon-foundation.team_profiles.${teamId}`, confidence: "soft" }]
      });
    }

    if (Array.isArray(profile.node)) {
      const shipName = profile.node[2];
      const shipClass = profile.node[3] || "Hapa node ship";
      if (shipName) {
        discoveryStats.ships += 1;
        upsertCard({
          id: `ship-${slugify(shipName)}`,
          kind: "ship",
          title: shipName,
          canonStatus: "soft_canon",
          summary: `${shipClass} paired with ${profile.node[1] || profile.node[0]}.`,
          description: `${shipName} is the ship-side expression of ${profile.node[1] || profile.node[0]}, crewed by avatars who learn the node by operating the vessel.`,
          lore: profile.doctrine || "",
          utility: profile.functions || [],
          broadGameMechanics: ["node ship mapping", "crew responsibility", "fleet role", "training deck"],
          tags: ["ship", "node-ship", teamId, profile.key].filter(Boolean),
          locationState: {
            currentSystemName: "Black Horizon",
            currentGardenId: profile.garden?.[0] || "",
            currentGardenName: profile.garden?.[1] || "",
            currentShipName: shipName,
            state: "assigned"
          },
          connections: {
            teamIds: [teamId],
            nodeIds: [profile.node[0], profile.node[1]].filter(Boolean)
          },
          mediaPrompts: promptsFor(shipName, "ship", shipClass),
          sourceRefs: [{ label: `black-horizon-foundation.team_profiles.${teamId}.node`, confidence: "soft" }]
        });
      }
    }
  }
}

function seedScenePlaceCards() {
  for (const place of sceneStore.places || []) {
    const placeKind = placeKindFor(place);
    if (!placeKind) continue;
    discoveryStats.placeObjects += 1;
    upsertCard({
      id: `${placeKind}-${slugify(place.id || place.name)}`,
      kind: placeKind,
      title: place.name,
      canonStatus: place.placeCard?.canonStatus || place.canonStatus || "scaffold",
      summary: place.summary || `${place.name} appears in the scene graph.`,
      description: place.lore || place.summary || "",
      lore: place.lore || "",
      broadGameMechanics: ["place card backrefs", "scene continuity", "avatar location context"],
      tags: ["place-derived", placeKind, ...(place.tags || [])],
      locationState: {
        currentPlaceId: place.id,
        currentPlaceName: place.name,
        currentSystemName: "Black Horizon",
        locatedAvatarIds: place.avatarIds || [],
        state: "scene-place"
      },
      connections: {
        avatarIds: place.avatarIds || [],
        placeIds: [place.id],
        sceneIds: place.sceneIds || [],
        itemIds: []
      },
      mediaPrompts: {
        ...promptsFor(place.name, placeKind, place.visualDescription || "scene-place production reference"),
        twoD: place.imagePrompt || promptsFor(place.name, placeKind, "2D environment card").twoD
      },
      sourceRefs: [{ label: `scene-store.places.${place.id}`, confidence: place.placeCard?.canonStatus === "soft_canon" ? "soft" : "generated" }]
    });
  }
}

function seedAvatarCards() {
  for (const avatar of avatars) {
    const mind = avatar.mind || {};
    const garden = mind.gardenNodeAssignment || {};
    const ship = mind.shipCrewAssignment || {};

    if (garden.gardenId || garden.gardenName) {
      const gardenId = `garden-${slugify(garden.gardenId || garden.gardenName)}`;
      discoveryStats.gardens += 1;
      upsertCard({
        id: gardenId,
        kind: "garden",
        title: garden.gardenName || garden.gardenId,
        canonStatus: "soft_canon",
        summary: garden.gardenFunction || `Garden assignment for ${avatar.primaryName}.`,
        description: `${garden.gardenName || garden.gardenId} is ${avatar.primaryName}'s Garden/Node assignment for ${garden.teamTitle || "their team"}.`,
        lore: garden.responsibilities?.join(" ") || "",
        utility: garden.functions || [],
        broadGameMechanics: ["avatar station", "node responsibility", "training context"],
        tags: ["garden", garden.teamId, garden.nodeId].filter(Boolean),
        locationState: {
          currentSystemName: "Black Horizon",
          currentGardenId: garden.gardenId,
          currentGardenName: garden.gardenName,
          holderAvatarIds: [avatar.id],
          state: "assigned"
        },
        connections: {
          avatarIds: [avatar.id],
          teamIds: [garden.teamId].filter(Boolean),
          nodeIds: [garden.nodeId, garden.nodeName].filter(Boolean),
          shipIds: [slugify(garden.shipName)].filter(Boolean)
        },
        mediaPrompts: promptsFor(garden.gardenName || garden.gardenId, "garden", garden.gardenFunction || "Garden node habitat"),
        sourceRefs: [{ label: `avatar-store.${avatar.id}.mind.gardenNodeAssignment`, confidence: "soft" }]
      });
    }

    const vesselName = ship.vesselName || garden.shipName;
    if (vesselName) {
      discoveryStats.ships += 1;
      upsertCard({
        id: `ship-${slugify(vesselName)}`,
        kind: "ship",
        title: vesselName,
        canonStatus: "soft_canon",
        summary: ship.duty || `${vesselName} is assigned to ${avatar.primaryName}.`,
        description: `${vesselName} carries ${avatar.primaryName} as ${ship.crewSeat || garden.role || "crew"} for ${ship.teamTitle || garden.teamTitle || "their team"}.`,
        lore: (ship.crewHooks || []).join(" "),
        utility: garden.functions || [],
        broadGameMechanics: ["ship as node", "crew loadout", "operational responsibility"],
        tags: ["ship", ship.teamId || garden.teamId, garden.nodeId].filter(Boolean),
        locationState: {
          currentSystemName: "Black Horizon",
          currentGardenId: garden.gardenId,
          currentGardenName: garden.gardenName,
          currentShipName: vesselName,
          holderAvatarIds: [avatar.id],
          state: "assigned"
        },
        connections: {
          avatarIds: [avatar.id],
          teamIds: [ship.teamId || garden.teamId].filter(Boolean),
          nodeIds: [garden.nodeId, garden.nodeName].filter(Boolean),
          shipIds: [slugify(vesselName)]
        },
        mediaPrompts: promptsFor(vesselName, "ship", garden.shipClass || "Hapa node ship"),
        sourceRefs: [{ label: `avatar-store.${avatar.id}.mind.shipCrewAssignment`, confidence: "soft" }]
      });
    }

    for (const card of mind.protocolCardLoadout || []) {
      discoveryStats.protocolObjects += 1;
      upsertLoadoutObject(card, avatar, "protocols");
    }
    for (const card of mind.skillCardLoadout || []) {
      discoveryStats.skillObjects += 1;
      upsertLoadoutObject(card, avatar, "skills");
    }
    for (const asset of (avatar.assets || []).filter((item) => item.requirementId === "kit_items")) {
      discoveryStats.kitItems += 1;
      upsertKitItem(asset, avatar);
    }
  }
}

function upsertLoadoutObject(loadoutCard, avatar, hardpointId) {
  const title = loadoutCard.title || loadoutCard.id || "Loadout Card";
  upsertCard({
    id: `object-${slugify(loadoutCard.id || title)}`,
    kind: "object",
    title,
    canonStatus: "soft_canon",
    summary: loadoutCard.learningThing || loadoutCard.mechanic || "",
    description: loadoutCard.whyChosen || loadoutCard.role || "",
    lore: loadoutCard.mechanic || "",
    utility: [loadoutCard.role, loadoutCard.mechanic].filter(Boolean),
    broadGameMechanics: ["card loadout", hardpointId, "avatar training deck"],
    tags: ["object", hardpointId, loadoutCard.family, loadoutCard.cardType].filter(Boolean),
    connections: {
      avatarIds: [avatar.id],
      teamIds: [avatar.mind?.gardenNodeAssignment?.teamId].filter(Boolean),
      nodeIds: [avatar.mind?.gardenNodeAssignment?.nodeId].filter(Boolean)
    },
    equipment: {
      hardpointHints: [hardpointId],
      effects: [loadoutCard.mechanic].filter(Boolean),
      limits: loadoutCard.limits || []
    },
    mediaPrompts: promptsFor(title, "object", `${hardpointId} card artifact`),
    sourceRefs: [{ label: `avatar-store.${avatar.id}.mind.${hardpointId === "protocols" ? "protocolCardLoadout" : "skillCardLoadout"}`, confidence: "soft" }]
  });
}

function upsertKitItem(asset, avatar) {
  const title = kitItemTitle(asset, avatar);
  upsertCard({
    id: `item-${slugify(avatar.id)}-${slugify(asset.id || title)}`,
    kind: "item",
    title,
    canonStatus: "soft_canon",
    summary: `${title} is a kit item associated with ${avatar.primaryName}.`,
    description: asset.notes || `Kit item extracted from ${avatar.primaryName}'s avatar media.`,
    lore: `${avatar.primaryName} carries or references this kit item in their Avatar Builder dossier. Treat it as a usable prop until more canon is written.`,
    utility: ["avatar kit reference", "prop continuity", "equipment context"],
    broadGameMechanics: ["RPG inventory", "visual continuity", "loadout identity"],
    tags: ["item", "kit-item", avatar.id, ...(asset.tags || [])],
    locationState: {
      holderAvatarIds: [avatar.id],
      currentSystemName: "Black Horizon",
      currentShipName: avatar.mind?.shipCrewAssignment?.vesselName || avatar.mind?.gardenNodeAssignment?.shipName || "",
      currentGardenName: avatar.mind?.gardenNodeAssignment?.gardenName || "",
      state: "held"
    },
    connections: {
      avatarIds: [avatar.id],
      teamIds: [avatar.mind?.gardenNodeAssignment?.teamId].filter(Boolean),
      nodeIds: [avatar.mind?.gardenNodeAssignment?.nodeId].filter(Boolean)
    },
    mediaPrompts: {
      heroImage: `Hero product render of ${title}, a Hapa kit item for ${avatar.primaryName}, with readable silhouette and material detail.`,
      twoD: `Clean 2D item-card illustration of ${title}, associated with ${avatar.primaryName}; preserve these visual tags: ${(asset.tags || []).slice(0, 8).join(", ")}.`,
      threeD: `Game-ready 3D prop model of ${title}; isolated object, readable scale, PBR materials, simple topology, usable as avatar equipment.`,
      comicPanel: `${avatar.primaryName} uses or reveals ${title} during a scene, making the item's utility readable in one comic panel.`,
      explainerVideo: `Short turntable and usage breakdown for ${title}, showing what it does and how it supports ${avatar.primaryName}'s role.`,
      wikiEntry: `Document ${title} as a kit item, including holder, source asset, visual tags, and current canon status.`,
      negativePrompt: "avoid unreadable tiny details, avoid changing avatar identity, avoid ungrounded brand marks"
    },
    mediaAssets: [{
      id: `media-${slugify(asset.id || title)}`,
      title: asset.name || title,
      type: asset.type || "image",
      uri: asset.uri || "",
      thumbnailUri: asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri || "",
      sourceAssetId: asset.id || "",
      avatarId: avatar.id,
      requirementId: asset.requirementId || "",
      mimeType: asset.metadata?.mimeType || "",
      width: asset.metadata?.width || 0,
      height: asset.metadata?.height || 0,
      tags: asset.tags || [],
      confidence: "soft",
      notes: "Linked from the avatar kit item source asset."
    }],
    equipment: {
      hardpointHints: ["items", "equipment"],
      effects: ["adds kit context to avatar generation"],
      limits: ["source asset is visual/reference canon unless promoted"]
    },
    sourceRefs: [{ label: `avatar-store.${avatar.id}.assets.${asset.id}`, uri: asset.uri || "", confidence: "soft" }]
  });
}

function equipDiscoveredCards(store, cards) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  let next = store;
  for (const avatar of avatars) {
    const mind = avatar.mind || {};
    const gardenId = `garden-${slugify(mind.gardenNodeAssignment?.gardenId || mind.gardenNodeAssignment?.gardenName || "")}`;
    const shipId = `ship-${slugify(mind.shipCrewAssignment?.vesselName || mind.gardenNodeAssignment?.shipName || "")}`;
    for (const [cardId, hardpointId] of [[gardenId, "node_ship"], [shipId, "node_ship"], [gardenId, "location"]]) {
      const card = cardsById.get(cardId);
      if (card) next = equipItemCard(next, { avatarId: avatar.id, avatarName: avatar.primaryName }, card, hardpointId, "equipped");
    }

    for (const loadout of mind.protocolCardLoadout || []) {
      const card = cardsById.get(`object-${slugify(loadout.id || loadout.title || "")}`);
      if (card) next = equipItemCard(next, { avatarId: avatar.id, avatarName: avatar.primaryName }, card, "protocols", "equipped");
    }
    for (const loadout of mind.skillCardLoadout || []) {
      const card = cardsById.get(`object-${slugify(loadout.id || loadout.title || "")}`);
      if (card) next = equipItemCard(next, { avatarId: avatar.id, avatarName: avatar.primaryName }, card, "skills", "equipped");
    }
    for (const asset of (avatar.assets || []).filter((item) => item.requirementId === "kit_items")) {
      const card = cardsById.get(`item-${slugify(avatar.id)}-${slugify(asset.id || kitItemTitle(asset, avatar))}`);
      if (card) next = equipItemCard(next, { avatarId: avatar.id, avatarName: avatar.primaryName }, card, "items", "equipped");
    }
  }
  return next;
}

function stampSceneEvents(graph) {
  const next = normalizeSceneGraph(graph);
  const placeById = new Map(next.places.map((place) => [place.id, place]));
  next.scenes = next.scenes
    .slice()
    .sort((a, b) => Number(a.canonicalTime?.order || 0) - Number(b.canonicalTime?.order || 0))
    .map((scene, index) => {
      const sequence = index + 1;
      const place = placeById.get(scene.placeId);
      const actions = [...(scene.expositionBeats || []), ...(scene.actionBeats || [])];
      return {
        ...scene,
        eventTimestamp: {
          schemaVersion: "hapa.event-timestamp.v1",
          eventId: `event-avatar-genesis-s1-${String(sequence).padStart(4, "0")}`,
          timelineId: scene.timelineId || scene.canonicalTime?.timelineId || "canonical-timeline",
          sequence,
          order: Number(scene.canonicalTime?.order || sequence),
          timespace: timespaceForPlace(place),
          localTimestamp: `S1.EVT.${String(sequence).padStart(4, "0")}`,
          dilationBand: dilationBandForPlace(place),
          mutableUntil: "canon-lock",
          placeId: scene.placeId,
          confidence: "draft",
          notes: "Draft event timing generated by Lore Object Audit Agent; mutable until canon lock."
        },
        eventActions: actions.length ? actions.map((label, actionIndex) => ({
          id: `event-avatar-genesis-s1-${String(sequence).padStart(4, "0")}-action-${actionIndex + 1}`,
          sequence: actionIndex + 1,
          label,
          avatarIds: (scene.avatarTags || []).map((tag) => tag.avatarId).filter(Boolean),
          itemIds: [],
          canonStatus: "draft",
          notes: "Derived from scene exposition/action beats."
        })) : [{
          id: `event-avatar-genesis-s1-${String(sequence).padStart(4, "0")}-action-1`,
          sequence: 1,
          label: scene.quickPitch || scene.summary || scene.title,
          avatarIds: (scene.avatarTags || []).map((tag) => tag.avatarId).filter(Boolean),
          itemIds: [],
          canonStatus: "draft",
          notes: "Scene-level action placeholder."
        }],
        updatedAt: now
      };
    });
  next.updatedAt = now;
  return normalizeSceneGraph(next);
}

function buildLoreProductionPlan(previous, itemStore, inventoryStore, sceneGraph, featureFilm) {
  return {
    ...previous,
    schemaVersion: previous.schemaVersion || "hapa.avatar-lore-production-plan.v1",
    objective: "Item Manager, Inventory, Narrative Agent Team, Event Timeline, and Feature Film sharpening pass.",
    goalStatus: "review_pause",
    itemManager: {
      schemaVersion: "hapa.item-manager-link.v1",
      itemStorePath: PATHS.itemStore,
      inventoryStorePath: PATHS.inventoryStore,
      itemCardCount: itemStore.cards.length,
      inventoryEquipments: inventoryStore.audit.totalEquipments,
      auditAgentRunId: runId,
      status: "ready_for_review"
    },
    narrativeAgentTeam: narrativeAgents(),
    eventTimingProtocol: eventTimingProtocol(),
    featureFilm,
    genesisRerunProtocol: {
      schemaVersion: "hapa.genesis-rerun-from-feature-film.v1",
      oneGenesisAtATime: true,
      mode: "append_only_backstory_context",
      sourcePlotId: featureFilm.id,
      instruction: "Use the feature plot to append motive, relationship collision, and introduction hooks only when they improve canon and education goals. Do not rewrite existing Soul Seeds without explicit promotion.",
      status: "draft_appended_for_review"
    },
    pauseForReview: {
      requestedBy: "Calder",
      status: "paused_after_sharpening_pass",
      reviewFocus: [
        "Item Manager card shape",
        "inventory/equipment hardpoints",
        "event timing vocabulary",
        "feature-film plotline",
        "avatar backstory append hooks"
      ],
      updatedAt: now
    },
    generatedAt: previous.generatedAt || now,
    updatedAt: now
  };
}

function buildFeatureFilmPlot(sceneGraph, itemStore, avatars) {
  const volumes = sceneGraph.volumes || [];
  const episodeSummaries = (sceneGraph.episodes || []).map((episode) => ({
    episodeId: episode.id,
    title: episode.title,
    quickPitch: episode.quickPitch,
    avatarIds: episode.avatarIds,
    sceneIds: episode.sceneIds
  }));
  const mainAvatars = ["red-reaper", "avatar-2", "avatar-3", "avatar-4", "avatar-16", "avatar-36"]
    .map((id) => avatars.find((avatar) => avatar.id === id))
    .filter(Boolean)
    .map((avatar) => ({ avatarId: avatar.id, name: avatar.primaryName, role: avatar.mind?.gardenNodeAssignment?.role || "" }));
  return {
    schemaVersion: "hapa.feature-film-plot.v1",
    id: "feature-film-black-horizon-garden-holds-v1",
    title: "Black Horizon: The Garden Holds",
    runtimeTargetMinutes: 120,
    logline: "When the Black Horizon Gardens prepare the first Proto-Fleet copy-wave, Red, Blue, Green, Beth, Red-Thu, and the team-origin crews must prove that power, truth, care, memory, and identity can survive being turned into a fleet.",
    quickPitch: "A high-production feature that introduces the Black Horizon, Garden/Node/Ship mechanics, consciousness copies, team roles, item cards, and the emotional stakes of making Hapa's protocol playable.",
    mainCharacters: mainAvatars,
    educationObjectives: [
      "Understand Gardens as functional Hapa nodes.",
      "Understand ships as node responsibilities with avatar crews.",
      "Understand Protocol, Skill, and Item cards as reusable control surfaces.",
      "Understand inventory/equipment as context loading for avatar behavior.",
      "Understand time dilation, Proto-Fleet copies, and consciousness split mechanics.",
      "Understand Red/Blue/Green operating doctrine through character conflict."
    ],
    acts: [
      {
        act: "I",
        title: "The Garden Must Prove Itself",
        targetMinutes: 35,
        beats: [
          "Earth-present Calder opens the Avatar Builder and the Black Horizon answers as a living operations layer.",
          "Red, Blue, and Green argue over whether the Proto-Fleet can launch without source, repair, and stakeholder proof.",
          "Beth discovers the message traffic problem: copied crews will become related persons, not disposable echoes.",
          "Item cards become visible as context keys; equipping a ship, protocol, skill, or object changes what an avatar can remember and do."
        ]
      },
      {
        act: "II",
        title: "The Fleet Learns to Split",
        targetMinutes: 55,
        beats: [
          "Team-origin episodes collide as Red pressure, Blue proof, Green consent, and Colonial Navy timing all block each other for good reasons.",
          "The Lore Object Audit Agent identifies named Gardens, ships, systems, and kit items as cards so the crew can stop arguing in abstractions.",
          "A copy-wave simulation sends colonial identities into lower-dilation worlds, returning with resources and contradictions.",
          "On the Artifact path, arena pressure offers fast growth but threatens to turn unresolved identity into spectacle."
        ]
      },
      {
        act: "III",
        title: "The Garden Holds",
        targetMinutes: 30,
        beats: [
          "Red refuses a clean shot until Blue can trace it and Green can name who carries the consequence.",
          "Beth routes the first copy-wave messages without flattening the senders.",
          "Red-Thu records the season into a Volume, making the archival act part of the story.",
          "The Proto-Fleet launches only after every equipped card has a source, a holder, a use, and a review path."
        ]
      }
    ],
    relationshipCollisions: [
      "Red vs Blue: action speed against source proof.",
      "Green vs everyone: stakeholder weight against momentum.",
      "Beth vs the fleet: message efficiency against personhood.",
      "Red-Thu vs chaos: archive discipline against living story.",
      "Colonial Navy vs Artifact Away Team: launch logistics against boundary lore."
    ],
    sourceEpisodes: episodeSummaries,
    sourceVolumes: volumes.map((volume) => ({ id: volume.id, title: volume.title, quickPitch: volume.quickPitch })),
    itemManagerInputs: {
      itemCardCount: itemStore.cards.length,
      gardenCards: itemStore.audit.byKind.garden || 0,
      shipCards: itemStore.audit.byKind.ship || 0,
      systemCards: itemStore.audit.byKind.system || 0,
      objectCards: itemStore.audit.byKind.object || 0,
      itemCards: itemStore.audit.byKind.item || 0
    },
    bruceLeeReviewProtocol: {
      absorb: [
        "clear character desire",
        "source-visible mechanics",
        "Garden/Ship/Item visual clarity",
        "relationship collision that teaches protocol"
      ],
      discard: [
        "bloated exposition",
        "uncited canon jumps",
        "mechanics that do not change choices",
        "drama that makes the system less learnable"
      ],
      add: [
        "uniquely Hapa identity continuity",
        "card/equipment context as visible action",
        "operator-to-avatar reciprocity",
        "archival acts inside the story"
      ],
      cadence: "review every canon/lore pass before promotion"
    },
    sharpeningPasses: [
      {
        id: `${runId}-feature-sharpen-pass-1`,
        status: "done",
        note: "Plotline assembled from completed volumes, scene graph, item manager, and current avatar backstory state.",
        completedAt: now
      }
    ],
    status: "draft_for_review",
    updatedAt: now
  };
}

function appendFeatureFilmGenesisContext(store, featureFilm) {
  const next = JSON.parse(JSON.stringify(store));
  next.avatars = (next.avatars || []).map((avatar) => {
    const teamTitle = avatar.mind?.gardenNodeAssignment?.teamTitle || "Unassigned";
    const gardenName = avatar.mind?.gardenNodeAssignment?.gardenName || "a Black Horizon Garden";
    const shipName = avatar.mind?.shipCrewAssignment?.vesselName || avatar.mind?.gardenNodeAssignment?.shipName || "a Hapa node ship";
    const existing = avatar.mind?.featureFilmGenesisAppend || {};
    return {
      ...avatar,
      mind: {
        ...(avatar.mind || {}),
        featureFilmGenesisAppend: {
          ...existing,
          schemaVersion: "hapa.avatar-feature-film-genesis-append.v1",
          sourcePlotId: featureFilm.id,
          roleInFeature: `${avatar.primaryName} introduces ${teamTitle} through ${gardenName} and ${shipName}.`,
          introductionBeat: `${avatar.primaryName} should be introduced doing their job, with their equipped cards visible as choices rather than exposition.`,
          backstoryAppend: `Use ${avatar.primaryName}'s existing Soul Seed and team role to connect their placement on ${shipName} to the Garden Holds launch crisis. Keep all new detail soft canon until promoted.`,
          relationshipCollisionPrompt: relationshipPromptForAvatar(avatar),
          educationObjective: "Teach Garden/Node/Ship responsibility, inventory context, and team doctrine through character action.",
          bruceLeeNote: "Absorb useful existing canon, discard bloated or unsupported biography, add only uniquely Hapa motive and choice pressure.",
          status: "draft_for_review",
          updatedAt: now
        },
        updatedAt: now
      },
      updatedAt: now
    };
  });
  next.updatedAt = now;
  return next;
}

function drainKanban(board, itemStore, inventoryStore) {
  const lanes = Array.isArray(board.lanes) ? board.lanes.filter((lane) => lane.id !== "lane-item-inventory-lore") : [];
  lanes.push({
    id: "lane-item-inventory-lore",
    title: "Item, Inventory, Timeline, Feature Film",
    accent: "gold",
    cards: [
      cardDone("item-schema-api", "Item Manager schema and API", "Created item-card, inventory, hardpoint, attach-pack, and local API surfaces."),
      cardDone("item-manager-dashboard", "Top-level Item Manager dashboard", "Added catalog, editor, filters, inventory zones, and equip controls to Avatar Builder."),
      cardDone("lore-object-audit-agent", "Lore Object Audit Agent run", `Backfilled ${itemStore.cards.length} Item Manager cards from avatars, scenes, kit items, and Black Horizon context.`),
      cardDone("inventory-equipment-hardpoints", "Avatar inventory/equipment hardpoints", `Equipped ${inventoryStore.audit.totalEquipments} card hardpoint placements across avatar inventories.`),
      cardDone("narrative-agent-team", "Archivist/Narrator/Author/Lore writer agents", "Added narrative agent team scaffolding and canon review cadence."),
      cardDone("event-timespace-protocol", "Event timing protocol", "Stamped every scene with draft event timestamp and action records."),
      cardDone("feature-film-plotline", "2-hour feature film plotline", "Assembled Black Horizon: The Garden Holds feature plot and Bruce Lee review protocol."),
      cardDone("genesis-feature-append", "Avatar Genesis backstory append pass", "Appended feature-film Genesis hooks to avatar minds without rewriting Soul Seeds."),
      cardDone("feature-sharpen-review-pause", "Sharpen feature and pause for review", "Feature plot sharpened once from updated backstory context; review checkpoint created.")
    ]
  });
  return {
    ...board,
    lanes,
    updatedAt: now
  };
}

function updateAgentContract(contract) {
  const next = JSON.parse(JSON.stringify(contract));
  next.archetypes = Array.isArray(next.archetypes) ? next.archetypes : [];
  const genesis = next.archetypes.find((agent) => agent.slug === "hapa-avatar-genesis");
  if (genesis) {
    genesis.capabilities = unique([
      ...(genesis.capabilities || []),
      "Item Manager card and inventory/equipment context integration",
      "feature-film plotline backstory append review",
      "event timestamp and timespace placement review"
    ]);
    genesis.required_outputs = unique([
      ...(genesis.required_outputs || []),
      "item_inventory_context",
      "feature_film_backstory_append",
      "event_timing_context"
    ]);
    genesis.item_inventory_protocol = {
      schemaVersion: "hapa.genesis-item-inventory-protocol.v1",
      itemManagerStorePath: PATHS.itemStore,
      inventoryStorePath: PATHS.inventoryStore,
      instruction: "Before generating or updating an avatar, load equipped Node/Ship, Protocol, Skill, Item, Location, and Equipment hardpoints as context. Treat equipped cards as soft canon unless their card says hard_canon.",
      updatedAt: now
    };
    genesis.bruce_lee_review_protocol = featureBruceLeeProtocol();
    genesis.updated_at = now;
  }
  for (const agent of narrativeAgents()) {
    upsertArchetype(next.archetypes, {
      agent_profile_id: `agent_profile:${agent.id}`,
      archetype_id: `avatar_agent_archetype:${agent.id}`,
      slug: agent.id,
      label: agent.title,
      lifecycle_phase: "lore-production",
      description: agent.description,
      capabilities: agent.capabilities,
      classification_labels: ["hard_canon", "soft_canon", "generated", "perspective", "disputed", "relationship_delta", "memory_delta"],
      required_outputs: agent.outputs,
      status: "active",
      bruce_lee_review_protocol: featureBruceLeeProtocol(),
      updated_at: now,
      created_at: now
    });
  }
  next.counts = {
    ...(next.counts || {}),
    archetypes: next.archetypes.length
  };
  next.generatedAt = next.generatedAt || now;
  next.updatedAt = now;
  return next;
}

function buildItemAgents(existing = []) {
  const agents = [
    {
      id: "agent-lore-object-auditor",
      title: "Lore Object Audit Agent",
      role: "Audit backstory canon, scenes, and kit assets into Item Manager records.",
      cadence: "after Genesis, episode, volume, kit, or canon updates",
      inputs: ["avatar-store", "scene-store", "black-horizon-foundation", "kit-items"],
      outputs: ["item cards", "inventory states", "image prompts", "source refs"],
      instructions: [
        "Extract named Gardens, Ships, Systems, Items, and Objects.",
        "Classify source confidence and canon status.",
        "Generate 2D and 3D prompts.",
        "Attach avatar, place, scene, source, and inventory backrefs."
      ],
      status: "active",
      updatedAt: now
    },
    ...narrativeAgents().map((agent) => ({
      id: agent.id,
      title: agent.title,
      role: agent.role,
      cadence: agent.cadence,
      inputs: agent.inputs,
      outputs: agent.outputs,
      instructions: agent.capabilities,
      status: "active",
      updatedAt: now
    }))
  ];
  const byId = new Map((existing || []).map((agent) => [agent.id, agent]));
  for (const agent of agents) byId.set(agent.id, { ...(byId.get(agent.id) || {}), ...agent });
  return [...byId.values()];
}

function narrativeAgents() {
  return [
    {
      id: "agent-archivist-volume-compiler",
      title: "Archivist Volume Compiler",
      role: "Season and Volume consolidation",
      description: "Turns 6 to 8 completed episodes into Volumes, season summaries, canon deltas, and screenplay prompts.",
      cadence: "after every 6 to 8 completed episodes",
      inputs: ["episodes", "scenes", "place cards", "avatar minds", "item cards"],
      outputs: ["volume summary", "canon deltas", "screenplay package", "wiki mirror"],
      capabilities: ["volume synthesis", "canon delta extraction", "screenplay prompt writing", "archive-as-story execution"]
    },
    {
      id: "agent-narrator-scene-threader",
      title: "Narrator Scene Threader",
      role: "Episode scene continuity and dialogue direction",
      description: "Writes 20-comic-page visual/dialog descriptions per education objective and character introduction in smaller canon-safe chunks.",
      cadence: "per objective or introduction arc",
      inputs: ["feature plot", "scene graph", "avatar relationships", "item inventory"],
      outputs: ["comic page beats", "dialogue pass", "visual prompts", "learning mechanic notes"],
      capabilities: ["scene chunking", "dialogue drafting", "visual prompt direction", "relationship collision threading"]
    },
    {
      id: "agent-author-episode-writer",
      title: "Author Episode Writer",
      role: "Narrative prose and episode drafting",
      description: "Consolidates character backstory and relationship mechanics into episodic narratives that teach Hapa through action.",
      cadence: "after scene-thread chunks are accepted",
      inputs: ["scene chunks", "avatar dossiers", "item cards", "event timestamps"],
      outputs: ["episode draft", "canon risk notes", "character arc deltas", "education objective receipts"],
      capabilities: ["episode drafting", "character arc writing", "teaching-through-story", "canon risk review"]
    },
    {
      id: "agent-timeline-event-editor",
      title: "Timeline Event Editor",
      role: "Timespace and sequence governance",
      description: "Maintains mutable event timestamps until canon lock and checks avatar timelines against global sequence.",
      cadence: "every scene, episode, Genesis, and feature pass",
      inputs: ["scene events", "avatar memories", "places", "feature plot"],
      outputs: ["event timestamp patches", "sequence conflicts", "timeline map", "canon-lock candidates"],
      capabilities: ["timespace timestamping", "sequence conflict detection", "dilation-band labeling", "canon-lock review"]
    },
    {
      id: "agent-feature-film-sharpener",
      title: "Feature Film Sharpener",
      role: "2-hour film plotline and Bruce Lee review",
      description: "Reviews every canon/lore pass against the feature film, absorbing useful story, cutting bloat, and adding uniquely Hapa mechanics.",
      cadence: "every canon/lore pass",
      inputs: ["feature plot", "volumes", "episodes", "avatar backstory appends", "item manager"],
      outputs: ["sharpening notes", "feature plot patch", "character introduction patch", "review pause checklist"],
      capabilities: ["feature plotting", "Bruce Lee compression", "theme-mechanic alignment", "review checkpoint creation"]
    }
  ];
}

function eventTimingProtocol() {
  return {
    schemaVersion: "hapa.event-timing-protocol.v1",
    mutableUntil: "canon-lock",
    timestampFormat: "S{season}.EVT.{sequence}",
    timespaces: [
      "black-horizon",
      "lower-dilation-colony",
      "artifact-world",
      "earth-present",
      "archive-volume"
    ],
    fields: ["eventId", "timelineId", "sequence", "order", "timespace", "localTimestamp", "dilationBand", "placeId", "confidence"],
    rule: "Draft event timestamps may move to make canon coherent until a later lock pass promotes them.",
    updatedAt: now
  };
}

function featureBruceLeeProtocol() {
  return {
    absorb: "what clarifies character, mechanics, source, and choice",
    discard: "what is false, bloated, unsupported, or mechanically inert",
    add: "what is uniquely Hapa, playable, attributable, and emotionally specific",
    cadence: "every canon and lore pass"
  };
}

function buildReport(itemStore, inventoryStore, sceneGraph, lorePlan, board, featureFilm) {
  return {
    schemaVersion: "hapa.lore-object-audit-report.v1",
    runId,
    generatedAt: now,
    itemStore: {
      path: PATHS.itemStore,
      cards: itemStore.cards.length,
      audit: itemStore.audit
    },
    inventoryStore: {
      path: PATHS.inventoryStore,
      audit: inventoryStore.audit
    },
    sceneStore: {
      path: PATHS.sceneStore,
      scenes: sceneGraph.scenes.length,
      events: sceneGraph.scenes.filter((scene) => scene.eventTimestamp?.eventId).length
    },
    lorePlan: {
      path: PATHS.lorePlan,
      narrativeAgents: lorePlan.narrativeAgentTeam.length,
      featureFilmId: featureFilm.id,
      pauseStatus: lorePlan.pauseForReview.status
    },
    kanban: {
      path: PATHS.kanban,
      lanes: board.lanes.length,
      cards: board.lanes.reduce((sum, lane) => sum + (lane.cards || []).length, 0),
      newLane: "lane-item-inventory-lore",
      newLaneCards: board.lanes.find((lane) => lane.id === "lane-item-inventory-lore")?.cards.length || 0
    },
    featureFilm,
    discoveryStats,
    reviewCheckpoint: lorePlan.pauseForReview
  };
}

function renderReportMarkdown(report) {
  return `---
title: "Lore Object Audit ${runId}"
type: hapa-lore-object-audit-report
status: done
updated: "${now}"
---

# Lore Object Audit ${runId}

## Summary

- Item cards: ${report.itemStore.cards}
- Equipped placements: ${report.inventoryStore.audit.totalEquipments}
- Scenes timestamped: ${report.sceneStore.events}
- Narrative agents: ${report.lorePlan.narrativeAgents}
- Feature plot: ${report.featureFilm.title}
- Review state: ${report.reviewCheckpoint.status}

## Feature Film

${report.featureFilm.logline}

## Bruce Lee Review

- Absorb: ${report.featureFilm.bruceLeeReviewProtocol.absorb.join("; ")}
- Discard: ${report.featureFilm.bruceLeeReviewProtocol.discard.join("; ")}
- Add: ${report.featureFilm.bruceLeeReviewProtocol.add.join("; ")}

## Paths

- Item store: ${report.itemStore.path}
- Inventory store: ${report.inventoryStore.path}
- Scene store: ${report.sceneStore.path}
- Lore plan: ${report.lorePlan.path}
- Kanban: ${report.kanban.path}
`;
}

async function mirrorWiki(report) {
  const markdown = renderReportMarkdown(report);
  const worldPath = path.join(WIKI_ROOT, "Lore/Avatar Genesis/Hapa Item Manager And Feature Film Scaffolding.md");
  const secondBrainPath = path.join(SECOND_BRAIN_WIKI, "hapa-item-manager-and-feature-film-scaffolding.md");
  await writeText(worldPath, markdown);
  await writeText(secondBrainPath, markdown);
}

function upsertCard(input) {
  const incoming = createItemCard(input);
  const existing = itemCardsById.get(incoming.id);
  if (!existing) {
    itemCardsById.set(incoming.id, incoming);
    return;
  }
  itemCardsById.set(incoming.id, mergeCard(existing, incoming));
}

function mergeCard(existing, incoming) {
  return createItemCard({
    ...incoming,
    ...existing,
    summary: existing.summary || incoming.summary,
    description: existing.description || incoming.description,
    lore: existing.lore || incoming.lore,
    utility: unique([...(existing.utility || []), ...(incoming.utility || [])]),
    broadGameMechanics: unique([...(existing.broadGameMechanics || []), ...(incoming.broadGameMechanics || [])]),
    tags: unique([...(existing.tags || []), ...(incoming.tags || [])]),
    locationState: {
      ...incoming.locationState,
      ...existing.locationState,
      holderAvatarIds: unique([...(existing.locationState?.holderAvatarIds || []), ...(incoming.locationState?.holderAvatarIds || [])]),
      locatedAvatarIds: unique([...(existing.locationState?.locatedAvatarIds || []), ...(incoming.locationState?.locatedAvatarIds || [])])
    },
    connections: {
      avatarIds: unique([...(existing.connections?.avatarIds || []), ...(incoming.connections?.avatarIds || [])]),
      teamIds: unique([...(existing.connections?.teamIds || []), ...(incoming.connections?.teamIds || [])]),
      placeIds: unique([...(existing.connections?.placeIds || []), ...(incoming.connections?.placeIds || [])]),
      sceneIds: unique([...(existing.connections?.sceneIds || []), ...(incoming.connections?.sceneIds || [])]),
      episodeIds: unique([...(existing.connections?.episodeIds || []), ...(incoming.connections?.episodeIds || [])]),
      volumeIds: unique([...(existing.connections?.volumeIds || []), ...(incoming.connections?.volumeIds || [])]),
      itemIds: unique([...(existing.connections?.itemIds || []), ...(incoming.connections?.itemIds || [])]),
      nodeIds: unique([...(existing.connections?.nodeIds || []), ...(incoming.connections?.nodeIds || [])]),
      shipIds: unique([...(existing.connections?.shipIds || []), ...(incoming.connections?.shipIds || [])])
    },
    mediaPrompts: {
      heroImage: existing.mediaPrompts?.heroImage || incoming.mediaPrompts?.heroImage,
      twoD: existing.mediaPrompts?.twoD || incoming.mediaPrompts?.twoD,
      threeD: existing.mediaPrompts?.threeD || incoming.mediaPrompts?.threeD,
      comicPanel: existing.mediaPrompts?.comicPanel || incoming.mediaPrompts?.comicPanel,
      explainerVideo: existing.mediaPrompts?.explainerVideo || incoming.mediaPrompts?.explainerVideo,
      wikiEntry: existing.mediaPrompts?.wikiEntry || incoming.mediaPrompts?.wikiEntry,
      negativePrompt: existing.mediaPrompts?.negativePrompt || incoming.mediaPrompts?.negativePrompt
    },
    mediaAssets: uniqueByKey([...(existing.mediaAssets || []), ...(incoming.mediaAssets || [])], (asset) => asset.uri || asset.thumbnailUri || asset.id),
    sourceRefs: uniqueByKey([...(existing.sourceRefs || []), ...(incoming.sourceRefs || [])], (source) => `${source.label || ""}:${source.uri || ""}`),
    history: [...(existing.history || []), ...(incoming.history || [])],
    equipment: {
      hardpointHints: unique([...(existing.equipment?.hardpointHints || []), ...(incoming.equipment?.hardpointHints || [])]),
      equipRules: unique([...(existing.equipment?.equipRules || []), ...(incoming.equipment?.equipRules || [])]),
      effects: unique([...(existing.equipment?.effects || []), ...(incoming.equipment?.effects || [])]),
      limits: unique([...(existing.equipment?.limits || []), ...(incoming.equipment?.limits || [])])
    },
    updatedAt: now
  });
}

function promptsFor(title, kind, visualCue) {
  return {
    heroImage: `High-production hero image of ${title}, a Hapa ${kind}, with ${visualCue}, readable silhouette, clear scale, and Black Horizon context.`,
    twoD: `2D card illustration of ${title}; show what it is, where it belongs, and how an avatar would use it.`,
    threeD: `Game-ready 3D asset prompt for ${title}; ${visualCue}; usable in a strategy/arena scene, clean geometry, readable materials.`,
    comicPanel: `Comic panel where avatars interact with ${title} and its utility is visually obvious.`,
    explainerVideo: `Explainer video showing ${title}, its Hapa function, who uses it, and how it maps to game mechanics.`,
    wikiEntry: `Wiki entry for ${title} with canon status, source refs, visual description, connections, and prompts.`,
    negativePrompt: "avoid generic stock sci-fi, avoid unreadable silhouettes, avoid unsupported canon details"
  };
}

function placeKindFor(place) {
  const haystack = `${place.name} ${place.type}`.toLowerCase();
  if (place.type === "garden" || haystack.includes("garden")) return "garden";
  if (place.type === "ship" || haystack.includes("ship")) return "ship";
  if (place.type === "planet" || haystack.includes("artifact") || haystack.includes("horizon")) return "system";
  if (haystack.includes("dock") || haystack.includes("ring") || haystack.includes("station") || haystack.includes("forge") || haystack.includes("vault")) return "object";
  return null;
}

function kitItemTitle(asset, avatar) {
  const usefulTags = (asset.tags || [])
    .filter((tag) => !["extracted", "healed", "needs-review", "reference", "kit-item", "generated", avatar.id].includes(tag))
    .slice(-3);
  if (usefulTags.length) return `${avatar.primaryName} ${usefulTags.map(titleCase).join(" ")}`;
  return `${avatar.primaryName} ${asset.name || "Kit Item"}`;
}

function relationshipPromptForAvatar(avatar) {
  const team = avatar.mind?.gardenNodeAssignment?.teamTitle || "their team";
  if (team.includes("Red")) return "Put them in conflict with Blue proof or Green stakeholder limits before action.";
  if (team.includes("Blue")) return "Make them choose between a clean source trail and an emotionally urgent but messy signal.";
  if (team.includes("Green")) return "Make them defend the stakeholder or repair path that everyone else is skipping.";
  if (team.includes("Colonial")) return "Make timing, manifests, and fleet safety the emotional problem, not just logistics.";
  if (team.includes("Artifact")) return "Make public/private boundary lore matter under arena pressure.";
  return "Tie their team role to the Proto-Fleet launch crisis through one concrete choice.";
}

function timespaceForPlace(place = {}) {
  const name = `${place.name || ""} ${place.type || ""}`.toLowerCase();
  if (name.includes("earth")) return "earth-present";
  if (name.includes("artifact")) return "artifact-world";
  if (name.includes("colony") || name.includes("colonial")) return "lower-dilation-colony";
  if (name.includes("archive") || name.includes("volume")) return "archive-volume";
  return "black-horizon";
}

function dilationBandForPlace(place = {}) {
  const timespace = timespaceForPlace(place);
  if (timespace === "black-horizon") return "extreme-dilation-garden-orbit";
  if (timespace === "lower-dilation-colony") return "low-dilation-colony-space";
  if (timespace === "artifact-world") return "artifact-arena-pressure";
  if (timespace === "earth-present") return "operator-real-time";
  return "archive-review-time";
}

function cardDone(id, title, body) {
  return {
    id,
    title,
    status: "done",
    owner: "Codex / Lore Object Audit Agent",
    body,
    tags: ["item-manager", "inventory", "lore", "done"],
    completedAt: now,
    updatedAt: now
  };
}

function upsertArchetype(archetypes, incoming) {
  const index = archetypes.findIndex((agent) => agent.slug === incoming.slug || agent.archetype_id === incoming.archetype_id);
  if (index >= 0) archetypes[index] = { ...archetypes[index], ...incoming };
  else archetypes.push(incoming);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

async function backupFile(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const backupPath = path.join(path.dirname(filePath), "backups", `${path.basename(filePath)}.before-${runId}.bak`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, text, "utf8");
  } catch {
    // Missing files are expected on the first item/inventory run.
  }
}

function titleCase(value) {
  return String(value || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function list(values = []) {
  return (values || []).filter(Boolean).join(", ");
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueByKey(values = [], getKey = (value) => value?.id) {
  const byKey = new Map();
  for (const value of values.filter(Boolean)) {
    const key = getKey(value);
    if (!key) continue;
    byKey.set(key, value);
  }
  return [...byKey.values()];
}
