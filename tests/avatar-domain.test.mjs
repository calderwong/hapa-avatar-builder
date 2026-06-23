import test from "node:test";
import assert from "node:assert/strict";
import {
  auditAvatar,
  appendAssetNode,
  attachAvatarModel,
  backgroundlessPlaybackForAsset,
  createAttachPack,
  createAvatarMindAttachPack,
  createAvatarScaffold,
  createVideoFrameMatchQueue,
  createHealingPromptPacket,
  createHealingQueue,
  createHealingPlan,
  connectVideoEndFrame,
  attachVideoBranch,
  assignAssetToSlot,
  detachAssetFromAvatar,
  moveAssetToRequirement,
  normalizeAvatarCard,
  registerBackgroundlessVideoVariant,
  renameAvatarIdentity,
  reorderRequirementAssets,
  tagDefinitionById,
  tagQualityForAsset,
  setAssetDirection,
  setAvatarModelDefaultAnimation,
  setAvatarModelStats,
  setVideoReverseLoopValidation,
  videoBackgroundlessSummary,
  upsertAvatarMind,
  upsertContextMapping,
  upsertMindFact,
  upsertRelationshipMapping
} from "../src/domain/avatar.js";

test("scaffold creates the full Red/Reaper slot contract", () => {
  const avatar = createAvatarScaffold({ names: ["Red", "Reaper"], primaryName: "Red" });
  assert.equal(avatar.slots.length, 43);
  assert.equal(auditAvatar(avatar).required, 43);
  assert.equal(auditAvatar(avatar).complete, false);
  assert.equal(avatar.mind.schemaVersion, "hapa.avatar-mind.v1");
  assert.equal(avatar.three_paragraph_background_narrative, "");
});

test("avatar schema preserves the three paragraph background narrative", () => {
  const narrative = [
    "I am Red, and I keep the line bright enough to act.",
    "You meet me aboard HSS Red Forge, where every order must name its source.",
    "If you follow me, bring proof, repair, and the courage to stop."
  ].join("\n\n");
  const avatar = createAvatarScaffold({
    names: ["Red"],
    primaryName: "Red",
    three_paragraph_background_narrative: `\n${narrative}\n`
  });
  const normalized = normalizeAvatarCard({ ...avatar, three_paragraph_background_narrative: `\n${narrative}\n` });
  assert.equal(avatar.three_paragraph_background_narrative, narrative);
  assert.equal(normalized.three_paragraph_background_narrative, narrative);
  assert.equal(normalized.three_paragraph_background_narrative.split(/\n\s*\n/).length, 3);
});

test("avatar mind tracks self facts, relationships, and context mappings", () => {
  let avatar = createAvatarScaffold({ id: "red", names: ["Red"], primaryName: "Red", summary: "Red carries a blade and a debt." });
  const blue = createAvatarScaffold({ id: "blue", names: ["Blue"], primaryName: "Blue" });

  avatar = upsertMindFact(avatar, {
    label: "private vow",
    value: "Red will not leave Blue behind.",
    classification: "hard_canon",
    confidence: "hard"
  });
  avatar = upsertRelationshipMapping(avatar, {
    targetAvatarId: blue.id,
    targetName: blue.primaryName,
    relationLabel: "ally",
    trust: 4,
    tension: -1,
    loyalty: 5,
    reason: "Blue guarded the gate."
  });
  avatar = upsertContextMapping(avatar, {
    contextId: "scene-gate",
    label: "Gate scene",
    kind: "scene",
    avatarBelief: "The gate was a trap.",
    classification: "perspective"
  });
  avatar = upsertAvatarMind(avatar, {
    blackHorizonContext: {
      summary: "Red serves the Black Horizon foundation loop.",
      settingRegions: ["Black Horizon Gardens", "Artifact Planet"],
      teamDoctrine: ["Red Team explores weaknesses for common good"]
    },
    consciousnessContext: {
      summary: "Red Prime routes one colonial Red copy through the Proto-Fleet loop.",
      primeAvatar: {
        avatarId: "red",
        avatarName: "Red",
        horizonRole: "message_traffic_controller",
        gardenName: "Red Forge Garden",
        nodeId: "hapa-anvil-node",
        shipName: "HSS Red Forge",
        identityContinuityRule: "The Black Horizon prime is continuity anchor; colonial copies are related persons, not disposable instances."
      },
      colonialCopies: [{
        id: "copy-red-forge-1",
        copyId: "copy-red-forge-1",
        copyName: "Red Forge-Scout",
        originAvatarId: "red",
        originAvatarName: "Red",
        colonyWave: "proto-fleet-test",
        destination: "Outer forge colony",
        timeDilationBand: "low-dilation-colony-space",
        mission: "Find failure modes before the fleet relies on them.",
        divergenceStatus: "seeded",
        messageProtocol: "Append-only return brief with consent before merge."
      }],
      messageTraffic: {
        cadence: "after-action pulse",
        mergeConsentRule: "No merge without consent from both prime and colonial copy."
      },
      identitySplitRules: ["copies are related persons", "prime routes messages without flattening identity"]
    },
    gardenNodeAssignment: {
      teamId: "red-team",
      teamTitle: "Red Team",
      role: "Lead",
      gardenId: "red-forge-garden",
      gardenName: "Red Forge Garden",
      nodeId: "hapa-anvil-node",
      shipName: "HSS Red Forge",
      responsibilities: ["stress-test card proposals"]
    },
    shipCrewAssignment: {
      teamId: "red-team",
      teamTitle: "Red Team",
      vesselName: "HSS Red Forge",
      crewSeat: "Lead",
      duty: "Expose weaknesses before they hurt the fleet"
    },
    protocolCardLoadout: [{
      id: "protocol-red-team-weakness-probe",
      title: "Red Team Weakness Probe",
      cardType: "protocol_card",
      family: "protocol",
      mechanic: "Find the exploit before the exploit finds the system"
    }],
    skillCardLoadout: [{
      id: "skill-hapa-protocol",
      title: "hapa-protocol",
      cardType: "skill_card",
      family: "skill",
      mechanic: "Boot the operating rules before acting"
    }],
    placementBackstorySeed: {
      prompt: "Explain how Red got assigned to the Red Forge Garden.",
      whyTheyAccepted: "The fleet needed somebody willing to test hard truths."
    },
    dearPapaSongContext: {
      albumTitle: "Dear Papa",
      author: "Calder",
      loreStatus: "hapa_lore_not_hard_canon",
      performancePerspective: {
        teamColor: "red",
        avatarId: "red",
        avatarName: "Red",
        voiceFunction: "protective pressure"
      },
      selectedSongCards: [{
        id: "song-card-red-black-hole-spins",
        songId: "black-hole-spins",
        cardId: "dear-papa-song-black-hole-spins",
        title: "Black Hole Spins",
        author: "Calder",
        perspective: {
          teamColor: "red",
          avatarId: "red",
          avatarName: "Red"
        },
        whySelected: "Red treats the song as pressure under gravity.",
        genesisInstruction: "Use the song as Red's high-pressure courage cue.",
        communicationUse: "intro_outro",
        lyricsSha256: "abc123"
      }],
      relationshipPrompts: [{
        id: "songbook-blue-counterpoint",
        targetAvatarId: "blue",
        targetName: "Blue",
        relationLabel: "songbook-counterpoint",
        prompt: "Ask Blue to prove the signal inside the pressure.",
        songIds: ["black-hole-spins"]
      }]
    },
    phraseCards: [{
      id: "phrase-red-vector-clean",
      phrase: "Vector clean. Take the shot.",
      primaryUse: "decision",
      trigger: "The council has enough truth to move.",
      tone: ["precise", "protective"],
      cardRole: "commit",
      identitySignal: "Red converts verified stakes into disciplined action.",
      loreGrounding: ["saga-origin-learning-and-truth"],
      mechanic: {
        cost: "Spend one verified threat.",
        effect: "Convert deliberation into protected action."
      },
      attribution: {
        source: "Genesis + Soul Seed + existing Avatar Mind",
        confidence: "generated_from_canon_context"
      }
    }]
  });

  const pack = createAvatarMindAttachPack(avatar, [avatar, blue]);
  assert.equal(pack.mind.personaAnchor.identityStatement, "Red carries a blade and a debt.");
  assert.equal(pack.summary.counts.selfKnowledge, 1);
  assert.equal(pack.summary.counts.relationships, 1);
  assert.equal(pack.summary.counts.context, 1);
  assert.equal(pack.summary.counts.phraseCards, 1);
  assert.equal(pack.summary.counts.songCards, 1);
  assert.equal(pack.summary.counts.consciousnessCopies, 1);
  assert.equal(pack.summary.counts.protocolCards, 1);
  assert.equal(pack.summary.counts.skillCards, 1);
  assert.equal(pack.summary.phraseCards[0].phrase, "Vector clean. Take the shot.");
  assert.equal(pack.summary.dearPapaSongContext.author, "Calder");
  assert.equal(pack.summary.loadout.songCards[0].title, "Black Hole Spins");
  assert.equal(pack.summary.consciousnessCopies[0].copyName, "Red Forge-Scout");
  assert.equal(pack.summary.gardenNodeAssignment.nodeId, "hapa-anvil-node");
  assert.equal(pack.summary.loadout.protocolCards[0].title, "Red Team Weakness Probe");
  assert.equal(pack.mind.placementBackstorySeed.whyTheyAccepted, "The fleet needed somebody willing to test hard truths.");
  assert.equal(pack.summary.knownOthers[0].name, "Blue");
  assert.equal(pack.summary.knownOthers[0].trust, 4);
  assert.equal(createAttachPack(avatar).mind.counts.relationships, 1);
  assert.equal(createAttachPack(avatar).mind.counts.phraseCards, 1);
  assert.equal(createAttachPack(avatar).mind.counts.songCards, 1);
  assert.equal(createAttachPack(avatar).mind.counts.consciousnessCopies, 1);
});

test("avatar mind summary consolidates duplicate relationship targets", () => {
  let avatar = createAvatarScaffold({ id: "red", names: ["Red"], primaryName: "Red" });
  const blue = createAvatarScaffold({ id: "blue", names: ["Blue"], primaryName: "Blue" });
  const green = createAvatarScaffold({ id: "green", names: ["Green"], primaryName: "Green" });

  avatar = upsertAvatarMind(avatar, {
    relationships: [
      {
        id: "rel-blue-command",
        targetAvatarId: "blue",
        targetName: "Blue",
        relationLabel: "command partner",
        trust: 8,
        tension: 2,
        loyalty: 6,
        confidence: "soft",
        classification: "relationship_delta"
      },
      {
        id: "rel-blue-ally",
        targetAvatarId: "blue",
        targetName: "Blue",
        relationLabel: "ally",
        trust: 4,
        tension: -2,
        loyalty: 10,
        confidence: "hard",
        classification: "soft_canon"
      },
      {
        id: "rel-green",
        targetAvatarId: "green",
        targetName: "Green",
        relationLabel: "repair partner",
        trust: 3,
        tension: 0,
        loyalty: 5
      }
    ]
  });

  const pack = createAvatarMindAttachPack(avatar, [avatar, blue, green]);
  const blueSummary = pack.summary.knownOthers.find((item) => item.id === "blue");

  assert.equal(pack.mind.relationships.length, 3);
  assert.equal(pack.summary.counts.relationshipRecords, 3);
  assert.equal(pack.summary.counts.relationships, 2);
  assert.equal(blueSummary.name, "Blue");
  assert.equal(blueSummary.relationLabel, "ally");
  assert.equal(blueSummary.sourceCount, 2);
  assert.deepEqual(blueSummary.relationshipIds.sort(), ["rel-blue-ally", "rel-blue-command"]);
  assert.equal(blueSummary.trust, 6);
  assert.equal(blueSummary.tension, 0);
  assert.equal(blueSummary.loyalty, 8);
});

test("avatar mind preserves tarot deck choices with Dear Papa song rationale", () => {
  let avatar = createAvatarScaffold({ id: "red", names: ["Red"], primaryName: "Red" });
  avatar = upsertAvatarMind(avatar, {
    tarotCardDeck: [{
      id: "mimi-choice-red-fool",
      cardId: "mimi-tarot-the-fool",
      cardTitle: "The Fool",
      cardType: "relationship_tarot_card",
      tarotMainType: "relationship_tarot_card",
      role: "genesis-deck-choice",
      whyChosen: "Red needs a clean threshold card.",
      canonReason: "Soft canon until promoted.",
      loreContext: "Reviewed Mimi cards, protocol cards, and Red's mind.",
      objectiveFit: "Helps Red begin a hard scene.",
      deckInfluence: "Adds a relationship pile draw cue.",
      futureInfluence: "Future chapters can test trust at a threshold.",
      songId: "dear-papa-first-step",
      songTitle: "First Step",
      songWhy: "The song carries the threshold mood.",
      vibe: "open road",
      sourcePath: "data/avatar-agent-runs/red-mimi-card-shop-genesis.json"
    }]
  });

  const normalized = normalizeAvatarCard(avatar);
  const pack = createAvatarMindAttachPack(normalized, [normalized]);
  assert.equal(normalized.mind.tarotCardDeck[0].schemaVersion, "hapa.avatar-tarot-card-choice.v1");
  assert.equal(normalized.mind.tarotCardDeck[0].songTitle, "First Step");
  assert.equal(pack.summary.counts.tarotCards, 1);
  assert.equal(pack.summary.loadout.tarotCards[0].cardTitle, "The Fool");
  assert.equal(pack.summary.loadout.tarotCards[0].deckInfluence.includes("relationship pile"), true);
});

test("avatar journal entries preserve life timeline and peer review metadata", () => {
  let avatar = createAvatarScaffold({ id: "red", names: ["Red"], primaryName: "Red" });
  avatar = upsertAvatarMind(avatar, {
    journal: [{
      id: "life-journal-red-y03",
      journalType: "annual-life-canon",
      timelineId: "avatar-life-canon-timeline",
      timelineEventId: "life-event-red-y03",
      lifeYear: 3,
      age: 3,
      calendarYear: 2017,
      relativeYear: "Y-9",
      dateOrSequenceMarker: "Life Year 03 / 2017",
      entryVoice: "in-character",
      privateEntry: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
      publicSummary: "Red learns to review other avatars before canonizing the memory.",
      classification: "soft_canon",
      canonStatus: "personal_canon_draft",
      causalityStatus: "causal-reviewed",
      reviewedAvatarIds: ["blue", "green"],
      reviewedAvatarNames: ["Blue", "Green"],
      linkedTeamId: "core-protocol-team",
      linkedTeamTitle: "Core Protocol Team",
      linkedRole: "Lead",
      responsibilityTags: ["fire-control", "rollback"],
      skillTags: ["source review", "protected action"],
      sourceRefs: ["data/avatar-life-journal-timeline/life-journal-timeline.json"]
    }]
  });

  const normalized = normalizeAvatarCard(avatar);
  const entry = normalized.mind.journal[0];
  assert.equal(entry.schemaVersion, "hapa.avatar-journal-entry.v1");
  assert.equal(entry.journalType, "annual-life-canon");
  assert.equal(entry.timelineId, "avatar-life-canon-timeline");
  assert.equal(entry.lifeYear, 3);
  assert.equal(entry.calendarYear, 2017);
  assert.equal(entry.paragraphCount, 3);
  assert.deepEqual(entry.reviewedAvatarNames, ["Blue", "Green"]);
  assert.equal(entry.causalityStatus, "causal-reviewed");
});

test("avatar journal entries preserve weekly narrative Critic and tag metadata", () => {
  let avatar = createAvatarScaffold({ id: "green", names: ["Green"], primaryName: "Green" });
  avatar = upsertAvatarMind(avatar, {
    journal: [{
      id: "weekly-green-w100",
      journalType: "weekly-five-page-reflective-narrative",
      timelineId: "calder-familia-weekly-narrative-timeline",
      weeklyCycleId: "calder-familia-week-100",
      weekIndex: 100,
      weekStartDate: "2024-07-22",
      weekEndDate: "2024-07-28",
      pageTarget: 5,
      pageCount: 5,
      privateEntry: "Page one teaches no lost sheep.\n\nPage two names a Consul pair.",
      criticStatus: "critic-approved-soft-canon",
      criticName: "The Master Critic",
      criticNotes: "Keep Bella adoption reciprocal and source-visible.",
      reviewCycleStatus: "impacted-avatar-review-queued",
      mentionedAvatarIds: ["red", "blue"],
      mentionedAvatarNames: ["Red", "Blue"],
      placeTags: ["Mirror Ledger Room"],
      itemTags: ["Bella Oath"],
      familyTags: ["Calder Familia", "No Lost Sheep"],
      sceneTags: ["Consul adoption"],
      eventTags: ["Week 100"],
      lexiconTerms: ["foundling light", "consul braid"],
      weeklyArc: {
        id: "weekly-arc-name-trial",
        title: "Name Trial",
        sequence: 2,
        focus: "testing whether a codename gives power without flattening the person underneath it",
        scene: "Mirror Ledger Room",
        event: "codename trial",
        artifact: "Mirror Ledger Quill",
        familyPressure: "name without capture",
        protocolLesson: "A name is a living handle, not a verdict."
      },
      readingList: [{
        id: "reading:123",
        title: "The Men Who Stare at Goats",
        creator: "Jon Ronson",
        medium: "reading",
        sourceSystem: "reading",
        sourceList: "amazon_reading_list",
        sourcePath: "reading_inventory_enriched.csv",
        themes: ["history and civilization"]
      }],
      watchingList: [{
        id: "youtube:abc123",
        title: "After Rome - The War For Britain",
        creator: "History Time",
        medium: "video",
        sourceSystem: "hapa_wiki",
        sourceList: "youtube_watch_history",
        sourcePath: "YouTube/Videos/after-rome.md",
        themes: ["history and civilization"]
      }],
      mediaConsumption: {
        source: "Hapa Second Brain + Hapa Worldbuilding Wiki",
        weeklyLearning: "Green learns to let source material slow the scene down.",
        pastApplication: "A past rescue needed more source humility.",
        presentApplication: "The current Consul scene uses media as a third witness.",
        futureApplication: "Future Bella scenes must name what source changed the plan.",
        innerStateDelta: "Green feels less pressure to already know.",
        interactionPrompt: "Ask Red what the documentary changes.",
        sceneUse: "Use the reading as a quiet lens.",
        lexiconTerms: ["source-fed-inner-state"],
        tags: ["media-consumption", "reading-list"]
      },
      balladOfBellaContext: {
        packetId: "ballad-of-bella-protocol",
        sourceHash: "abc123",
        mechanics: ["there-goes-a-super-root-key-song", "association-continuity", "root-depth-rgb"],
        shortRule: "There Goes a Super is a Root-Key Song.",
        rootDepthLayers: ["Childhood", "Guild", "Convergence", "Post-Convergence"],
        threeHarbors: ["herself", "the Guild", "chosen partner if she wants that"],
        sourcePath: "/Users/calderwong/Documents/Ballad of Bella v2/source.md",
        packetPath: "data/ballad-of-bella/ballad-of-bella-packet.json"
      },
      revisionOfJournalId: "older-green-note",
      revisionReason: "append-only Bella framing",
      affectedAvatarIds: ["red", "blue"],
      sourceRefs: [{ label: "Program", uri: "data/calder-familia-weekly-journals/weekly-journal-program.json", confidence: "generated" }]
    }]
  });

  const entry = normalizeAvatarCard(avatar).mind.journal[0];
  assert.equal(entry.journalType, "weekly-five-page-reflective-narrative");
  assert.equal(entry.weeklyCycleId, "calder-familia-week-100");
  assert.equal(entry.weekIndex, 100);
  assert.equal(entry.pageTarget, 5);
  assert.equal(entry.pageCount, 5);
  assert.equal(entry.criticStatus, "critic-approved-soft-canon");
  assert.deepEqual(entry.mentionedAvatarNames, ["Red", "Blue"]);
  assert.deepEqual(entry.familyTags, ["Calder Familia", "No Lost Sheep"]);
  assert.deepEqual(entry.lexiconTerms, ["foundling light", "consul braid"]);
  assert.equal(entry.weeklyArc.title, "Name Trial");
  assert.equal(entry.weeklyArc.familyPressure, "name without capture");
  assert.equal(entry.readingList[0].title, "The Men Who Stare at Goats");
  assert.equal(entry.watchingList[0].sourceList, "youtube_watch_history");
  assert.equal(entry.mediaConsumption.weeklyLearning, "Green learns to let source material slow the scene down.");
  assert.equal(entry.mediaConsumption.innerStateDelta, "Green feels less pressure to already know.");
  assert.equal(entry.balladOfBellaContext.packetId, "ballad-of-bella-protocol");
  assert.equal(entry.balladOfBellaContext.mechanics.includes("root-depth-rgb"), true);
  assert.deepEqual(entry.balladOfBellaContext.rootDepthLayers, ["Childhood", "Guild", "Convergence", "Post-Convergence"]);
  assert.deepEqual(entry.balladOfBellaContext.threeHarbors, ["herself", "the Guild", "chosen partner if she wants that"]);
  assert.equal(entry.sourceRefs[0].uri, "data/calder-familia-weekly-journals/weekly-journal-program.json");
  assert.equal(entry.revisionReason, "append-only Bella framing");
});

test("renaming an avatar preserves media and updates identity references", () => {
  let avatar = createAvatarScaffold({ id: "avatar-2", names: ["Avatar 2"], primaryName: "Avatar 2" });
  avatar = assignAssetToSlot(avatar, {
    id: "portrait",
    name: "portrait.png",
    uri: "/media/portrait.png",
    requirementId: "closeup_emotions",
    tags: ["neutral", "close-up"]
  });

  const renamed = renameAvatarIdentity(avatar, {
    primaryName: "Blue",
    aliases: ["Warden"]
  });
  const pack = createAttachPack(renamed, "agent");

  assert.equal(renamed.id, "avatar-2");
  assert.equal(renamed.primaryName, "Blue");
  assert.deepEqual(renamed.names.map((item) => item.name), ["Blue", "Warden"]);
  assert.deepEqual(renamed.aliases, ["Warden"]);
  assert.equal(renamed.assets.some((asset) => asset.id === "portrait"), true);
  assert.equal(auditAvatar(renamed).required, 43);
  assert.deepEqual(pack.names, ["Blue", "Warden"]);
});

test("assigning media fills the next matching slot and changes progress", () => {
  const avatar = createAvatarScaffold({ names: ["Red", "Reaper"], primaryName: "Red" });
  const next = assignAssetToSlot(avatar, {
    id: "asset-front",
    name: "front.png",
    uri: "/front.png",
    requirementId: "fullbody_backgroundless",
    tags: ["front", "backgroundless"]
  });
  const audit = auditAvatar(next);
  assert.equal(audit.filled, 1);
  assert.equal(audit.byRequirement.find((item) => item.id === "fullbody_backgroundless").filled, 1);
});

test("assigned local preview assets keep processing metadata on the Avatar Card", () => {
  const avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  const next = assignAssetToSlot(avatar, {
    id: "local-reference",
    name: "reference.png",
    uri: "data:image/png;base64,abc",
    requirementId: "closeup_emotions",
    tags: ["local", "preview"],
    source: "file-picker",
    metadata: {
      originalFileName: "reference.png",
      mimeType: "image/png",
      width: 1280,
      height: 720
    },
    processing: {
      status: "previewed",
      attachedToCard: false
    }
  }, "closeup_emotions-1");
  const asset = next.assets.find((item) => item.id === "local-reference");
  assert.equal(asset.metadata.width, 1280);
  assert.equal(asset.processing.status, "attached");
  assert.equal(asset.processing.attachedToCard, true);
  assert.equal(asset.processing.slotId, "closeup_emotions-1");
  assert.equal(asset.name, "close-up-emotion-shots-image-1");
  assert.equal(asset.metadata.originalFileName, "reference.png");
  assert.equal(asset.metadata.defaultForSection, true);
});

test("dropping more concept art on a filled slot preserves the existing images", () => {
  let avatar = createAvatarScaffold({ names: ["Wulan"], primaryName: "Wulan" });
  for (let index = 1; index <= 3; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `concept-${index}`,
      name: `concept-${index}.png`,
      uri: `/media/concept-${index}.png`,
      requirementId: "fullbody_concept_art",
      tags: ["concept-art", "cinematic"],
      metadata: { originalFileName: `concept-${index}.png` }
    }, "fullbody_concept_art-1");
  }

  const conceptSlots = avatar.slots.filter((slot) => slot.requirementId === "fullbody_concept_art" && slot.assetId);
  const conceptAudit = auditAvatar(avatar).byRequirement.find((item) => item.id === "fullbody_concept_art");

  assert.equal(conceptSlots.length, 3);
  assert.equal(conceptAudit.filled, 3);
  assert.deepEqual(new Set(conceptSlots.map((slot) => slot.assetId)), new Set(["concept-1", "concept-2", "concept-3"]));
  assert.equal(avatar.assets.find((asset) => asset.id === "concept-1").metadata.originalFileName, "concept-1.png");
});

test("attach pack prioritizes production references", () => {
  const avatar = assignAssetToSlot(
    createAvatarScaffold({ names: ["Red", "Reaper"], primaryName: "Red" }),
    {
      id: "asset-dossier",
      name: "dossier.png",
      uri: "/dossier.png",
      requirementId: "character_dossier",
      tags: ["canon"]
    }
  );
  const pack = createAttachPack(avatar, "comic");
  assert.equal(pack.target, "comic");
  assert.equal(pack.baseReferences.length, 1);
  assert.equal(pack.baseReferences[0].role, "character_dossier");
});

test("healing plan creates one task for each missing slot", () => {
  const avatar = createAvatarScaffold({ names: ["Red", "Reaper"], primaryName: "Red" });
  const tasks = createHealingPlan(avatar);
  assert.equal(tasks.length, 43);
  assert.equal(tasks.some((task) => task.requirementId === "kit_items"), true);
});

test("healing queue creates Codex GPT Image 2 prompt packets with references", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "dossier-ref",
    name: "red-dossier.png",
    uri: "/media/red-dossier.png",
    requirementId: "character_dossier",
    tags: ["canon", "identity"]
  });
  avatar = assignAssetToSlot(avatar, {
    id: "emotion-ref",
    name: "red-neutral.png",
    uri: "/media/red-neutral.png",
    requirementId: "closeup_emotions",
    tags: ["neutral", "face"]
  });

  const packet = createHealingPromptPacket(avatar, "fullbody_backgroundless-1");
  const queue = createHealingQueue(avatar);

  assert.equal(packet.model, "gpt-image-2");
  assert.equal(packet.codexTool, "image_gen");
  assert.equal(packet.attachPlan.slotId, "fullbody_backgroundless-1");
  assert.equal(packet.attachPlan.registrationTargets.includes("hapa-atlas"), true);
  assert.equal(packet.attachPlan.tags.includes("gpt-image-2"), true);
  assert.equal(packet.referencePolicy.roles[0], "fullbody_backgroundless");
  assert.equal(packet.variation.primaryTag, "front");
  assert.match(packet.variation.duplicateAvoidance, /Do not simply redraw/);
  assert.match(packet.prompt, /GPT Image 2/);
  assert.match(packet.prompt, /Variation directive/);
  assert.equal(packet.referenceImages.length >= 2, true);
  assert.equal(packet.referenceImages.some((reference) => reference.localPathHint === "data/media/red-dossier.png"), true);
  assert.equal(queue.jobs.some((job) => job.promptPacket?.target.slotId === "fullbody_backgroundless-1"), true);
});

test("overfill slots attach extra assets without changing the standard target", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  for (let index = 0; index < 4; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `two-thirds-${index}`,
      name: `two-thirds-${index}.png`,
      uri: `/two-thirds-${index}.png`,
      requirementId: "backgroundless_two_thirds",
      tags: ["two-thirds", "backgroundless"]
    });
  }
  const audit = auditAvatar(avatar);
  const item = audit.byRequirement.find((requirement) => requirement.id === "backgroundless_two_thirds");
  assert.equal(item.required, 3);
  assert.equal(item.filled, 3);
  assert.equal(item.overfill, 1);
});

test("section order creates default heroes and relabels images without changing file names", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "pose-a",
    name: "red action source.png",
    uri: "/media/red-action-source.png",
    requirementId: "kit_poses",
    tags: ["action"],
    metadata: { originalFileName: "red action source.png" }
  });
  avatar = assignAssetToSlot(avatar, {
    id: "pose-b",
    name: "red ready source.png",
    uri: "/media/red-ready-source.png",
    requirementId: "kit_poses",
    tags: ["ready"],
    metadata: { originalFileName: "red ready source.png" }
  });

  let poseA = avatar.assets.find((asset) => asset.id === "pose-a");
  let poseB = avatar.assets.find((asset) => asset.id === "pose-b");
  assert.equal(poseA.name, "kit-poses-image-1");
  assert.equal(poseB.name, "kit-poses-image-2");
  assert.equal(poseA.metadata.originalFileName, "red action source.png");
  assert.equal(poseA.metadata.defaultForSection, true);

  const sourceSlot = avatar.slots.find((slot) => slot.assetId === "pose-b");
  const targetSlot = avatar.slots.find((slot) => slot.assetId === "pose-a");
  avatar = reorderRequirementAssets(avatar, "kit_poses", sourceSlot.id, targetSlot.id);
  poseA = avatar.assets.find((asset) => asset.id === "pose-a");
  poseB = avatar.assets.find((asset) => asset.id === "pose-b");
  const pack = createAttachPack(avatar, "comic");
  const defaultPoseRef = pack.allReferences.find((ref) => ref.role === "kit_poses" && ref.defaultForSection);

  assert.equal(poseB.name, "kit-poses-image-1");
  assert.equal(poseB.metadata.originalFileName, "red ready source.png");
  assert.equal(poseB.metadata.defaultForSection, true);
  assert.equal(poseA.name, "kit-poses-image-2");
  assert.equal(defaultPoseRef.name, "kit-poses-image-1");
  assert.equal(defaultPoseRef.originalFileName, "red ready source.png");
});

test("overfill images can move into the section default order", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  for (let index = 0; index < 10; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `kit-item-${index}`,
      name: `kit-item-${index}.png`,
      uri: `/media/kit-item-${index}.png`,
      requirementId: "kit_items",
      tags: ["kit", "prop"]
    });
  }

  const overfillSourceSlot = avatar.slots.find((slot) => slot.assetId === "kit-item-9");
  const firstTargetSlot = avatar.slots.find((slot) => slot.assetId === "kit-item-0");
  assert.equal(overfillSourceSlot.required, false);

  avatar = reorderRequirementAssets(avatar, "kit_items", overfillSourceSlot.id, firstTargetSlot.id);
  const firstSlot = avatar.slots.find((slot) => slot.id === firstTargetSlot.id);
  const newOverfillSlot = avatar.slots.find((slot) => slot.id === overfillSourceSlot.id);
  const movedAsset = avatar.assets.find((asset) => asset.id === "kit-item-9");
  const displacedAsset = avatar.assets.find((asset) => asset.id === "kit-item-8");
  const audit = auditAvatar(avatar);
  const kitAudit = audit.byRequirement.find((requirement) => requirement.id === "kit_items");

  assert.equal(firstSlot.assetId, "kit-item-9");
  assert.equal(newOverfillSlot.assetId, "kit-item-8");
  assert.equal(movedAsset.name, "kit-items-image-1");
  assert.equal(movedAsset.metadata.defaultForSection, true);
  assert.equal(movedAsset.processing.slotId, firstTargetSlot.id);
  assert.equal(displacedAsset.name, "kit-items-image-10");
  assert.equal(displacedAsset.processing.slotId, overfillSourceSlot.id);
  assert.equal(kitAudit.required, 9);
  assert.equal(kitAudit.filled, 9);
  assert.equal(kitAudit.overfill, 1);
});

test("detaching assets clears required slots and removes empty overfill slots", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  for (let index = 0; index < 4; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `two-thirds-${index}`,
      name: `two-thirds-${index}.png`,
      uri: `/two-thirds-${index}.png`,
      requirementId: "backgroundless_two_thirds",
      tags: ["two-thirds"]
    });
  }

  const afterRequiredDetach = detachAssetFromAvatar(avatar, "two-thirds-0");
  const requiredItem = auditAvatar(afterRequiredDetach).byRequirement.find((item) => item.id === "backgroundless_two_thirds");
  assert.equal(requiredItem.filled, 2);
  assert.equal(requiredItem.overfill, 1);

  const afterOverfillDetach = detachAssetFromAvatar(avatar, "two-thirds-3");
  const overfillItem = auditAvatar(afterOverfillDetach).byRequirement.find((item) => item.id === "backgroundless_two_thirds");
  assert.equal(overfillItem.filled, 3);
  assert.equal(overfillItem.overfill, 0);
  assert.equal(afterOverfillDetach.slots.some((slot) => slot.id.includes("overfill") && !slot.assetId), false);
});

test("moving overfill images between sections updates source and target counters", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  for (let index = 0; index < 7; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `emotion-${index}`,
      name: `emotion-${index}.png`,
      uri: `/media/emotion-${index}.png`,
      requirementId: "closeup_emotions",
      tags: ["close-up", "emotion"]
    });
  }
  avatar = assignAssetToSlot(avatar, {
    id: "two-thirds-base",
    name: "two-thirds-base.png",
    uri: "/media/two-thirds-base.png",
    requirementId: "backgroundless_two_thirds",
    tags: ["backgroundless", "two-thirds"]
  });

  const before = auditAvatar(avatar);
  assert.equal(before.byRequirement.find((item) => item.id === "closeup_emotions").overfill, 1);
  assert.equal(before.byRequirement.find((item) => item.id === "backgroundless_two_thirds").filled, 1);

  const moved = moveAssetToRequirement(avatar, "emotion-6", "backgroundless_two_thirds");
  const sourceAudit = auditAvatar(moved).byRequirement.find((item) => item.id === "closeup_emotions");
  const targetAudit = auditAvatar(moved).byRequirement.find((item) => item.id === "backgroundless_two_thirds");
  const movedAsset = moved.assets.find((asset) => asset.id === "emotion-6");

  assert.equal(sourceAudit.filled, 6);
  assert.equal(sourceAudit.overfill, 0);
  assert.equal(targetAudit.filled, 2);
  assert.equal(targetAudit.overfill, 0);
  assert.equal(movedAsset.requirementId, "backgroundless_two_thirds");
  assert.equal(movedAsset.metadata.sectionRequirementId, "backgroundless_two_thirds");
  assert.equal(movedAsset.name, "backgroundless-2-3rds-shots-image-2");
  assert.equal(moved.slots.some((slot) => slot.requirementId === "closeup_emotions" && slot.required === false && !slot.assetId), false);
});

test("moving into a full section creates target overfill and delete cleans it up", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  for (let index = 0; index < 7; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `emotion-full-${index}`,
      name: `emotion-full-${index}.png`,
      uri: `/media/emotion-full-${index}.png`,
      requirementId: "closeup_emotions",
      tags: ["emotion"]
    });
  }
  for (let index = 0; index < 3; index += 1) {
    avatar = assignAssetToSlot(avatar, {
      id: `two-thirds-full-${index}`,
      name: `two-thirds-full-${index}.png`,
      uri: `/media/two-thirds-full-${index}.png`,
      requirementId: "backgroundless_two_thirds",
      tags: ["two-thirds"]
    });
  }

  const moved = moveAssetToRequirement(avatar, "emotion-full-6", "backgroundless_two_thirds");
  const afterMoveTarget = auditAvatar(moved).byRequirement.find((item) => item.id === "backgroundless_two_thirds");
  const movedSlot = moved.slots.find((slot) => slot.assetId === "emotion-full-6");
  assert.equal(afterMoveTarget.filled, 3);
  assert.equal(afterMoveTarget.overfill, 1);
  assert.equal(movedSlot.required, false);

  const detached = detachAssetFromAvatar(moved, "emotion-full-6");
  const afterDeleteTarget = auditAvatar(detached).byRequirement.find((item) => item.id === "backgroundless_two_thirds");
  assert.equal(afterDeleteTarget.filled, 3);
  assert.equal(afterDeleteTarget.overfill, 0);
  assert.equal(detached.slots.some((slot) => slot.requirementId === "backgroundless_two_thirds" && slot.required === false && !slot.assetId), false);
});

test("video branches attach to image states without changing completeness", () => {
  const imageAvatar = assignAssetToSlot(createAvatarScaffold({ names: ["Red"], primaryName: "Red" }), {
    id: "state-image",
    name: "red-front.png",
    uri: "/media/red-front.png",
    requirementId: "fullbody_backgroundless",
    tags: ["front", "backgroundless"]
  });
  const before = auditAvatar(imageAvatar);
  const branched = attachVideoBranch(imageAvatar, {
    id: "motion-branch",
    name: "red-front-run.mp4",
    uri: "/media/red-front-run.mp4",
    type: "video",
    tags: ["run", "camera-move"],
    metadata: {
      duration: 4.2,
      width: 1280,
      height: 720
    }
  }, "state-image");
  const after = auditAvatar(branched);
  const video = branched.assets.find((asset) => asset.id === "motion-branch");
  const pack = createAttachPack(branched, "video");

  assert.equal(after.filled, before.filled);
  assert.equal(video.parentAssetId, "state-image");
  assert.equal(video.state.kind, "video-branch");
  assert.equal(video.processing.attachedToCard, true);
  assert.equal(pack.videoBranches.length, 1);
  assert.equal(pack.videoBranches[0].startFrame.id, "state-image");
  assert.equal(pack.stateGraph[0].videoBranchIds[0], "motion-branch");

  const detached = detachAssetFromAvatar(branched, "state-image");
  assert.equal(detached.assets.some((asset) => asset.id === "motion-branch"), false);
});

test("direction tags are structured and included in attach packs", () => {
  const imageAvatar = assignAssetToSlot(createAvatarScaffold({ names: ["Red"], primaryName: "Red" }), {
    id: "state-image",
    name: "red-three-quarter.png",
    uri: "/media/red-three-quarter.png",
    requirementId: "fullbody_backgroundless",
    tags: ["three-quarter-left", "backgroundless"]
  });
  const tagged = setAssetDirection(
    setAssetDirection(
      setAssetDirection(imageAvatar, "state-image", "gaze", "front"),
      "state-image",
      "body",
      "three-quarter-left"
    ),
    "state-image",
    "head",
    "front"
  );
  const asset = tagged.assets.find((item) => item.id === "state-image");
  const pack = createAttachPack(tagged, "comic");

  assert.equal(asset.metadata.direction.gaze, "front");
  assert.equal(asset.metadata.direction.body, "three-quarter-left");
  assert.equal(asset.tags.includes("gaze:front"), true);
  assert.equal(pack.baseReferences[0].direction.body, "three-quarter-left");
  assert.equal(pack.baseReferences[0].tagQuality.groups.some((group) => group.id === "direction"), true);
  assert.equal("tags" in pack.baseReferences[0].tagQuality.groups[0], false);
});

test("tag hierarchy scores quality groups and exposes emotion icons", () => {
  const quality = tagQualityForAsset({
    id: "closeup-happy",
    name: "happy close-up.png",
    type: "image",
    requirementId: "closeup_emotions",
    tags: ["happy", "close-up", "cinematic", "backgroundless", "canon"],
    source: "file-picker",
    metadata: {
      direction: {
        gaze: "front",
        head: "front"
      }
    }
  });
  const emotionGroup = quality.groups.find((group) => group.id === "emotion");
  const directionGroup = quality.groups.find((group) => group.id === "direction");

  assert.equal(tagDefinitionById("happy").icon, "😄");
  assert.equal(emotionGroup.state, "complete");
  assert.equal(directionGroup.required, 2);
  assert.equal(directionGroup.state, "complete");
  assert.equal(quality.rank, "A");
});

test("3D avatar model attachments do not change media completeness", () => {
  const avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  const before = auditAvatar(avatar);
  const withModel = attachAvatarModel(avatar, {
    id: "red-rig",
    name: "red-rig.glb",
    uri: "/media/red-rig.glb",
    type: "model",
    tags: ["walk", "rig"],
    metadata: {
      mimeType: "model/gltf-binary",
      sizeBytes: 1024
    }
  });
  const inspected = setAvatarModelStats(withModel, "red-rig", {
    animations: 2,
    clips: [{ name: "Idle", duration: 1.2 }],
    vertices: 1200
  });
  const after = auditAvatar(inspected);
  const pack = createAttachPack(inspected, "scene");

  assert.equal(after.required, before.required);
  assert.equal(after.filled, before.filled);
  assert.equal(pack.modelReferences.length, 1);
  assert.equal(pack.modelReferences[0].active, true);
  assert.equal(pack.modelReferences[0].model.animations, 2);
});

test("3D avatar models persist a default animation for viewers and attach packs", () => {
  const avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  const withModel = attachAvatarModel(avatar, {
    id: "red-rig",
    name: "red-rig.glb",
    uri: "/media/red-rig.glb",
    type: "model",
    metadata: {
      mimeType: "model/gltf-binary",
      sizeBytes: 1024
    }
  });
  const inspected = setAvatarModelStats(withModel, "red-rig", {
    animations: 2,
    clips: [
      { name: "Idle", duration: 1.2 },
      { name: "Run", duration: 0.9 }
    ],
    vertices: 1200
  });
  const withDefault = setAvatarModelDefaultAnimation(inspected, "red-rig", "Run");
  const model = withDefault.assets.find((asset) => asset.id === "red-rig");
  const pack = createAttachPack(withDefault, "scene");

  assert.equal(model.state.defaultAnimation, "Run");
  assert.equal(model.metadata.model.defaultAnimation, "Run");
  assert.equal(model.metadata.model.defaultClip.duration, 0.9);
  assert.equal(pack.modelReferences[0].state.defaultAnimation, "Run");
  assert.equal(pack.modelReferences[0].model.defaultAnimation, "Run");
});

test("video branches carry first mid last frames into attach packs", () => {
  const imageAvatar = assignAssetToSlot(createAvatarScaffold({ names: ["Red"], primaryName: "Red" }), {
    id: "state-image",
    name: "red-front.png",
    uri: "/media/red-front.png",
    requirementId: "fullbody_backgroundless",
    tags: ["front", "backgroundless"]
  });
  const branched = attachVideoBranch(imageAvatar, {
    id: "motion-branch",
    name: "red-front-turn.mp4",
    uri: "/media/red-front-turn.mp4",
    type: "video",
    tags: ["turn"],
    metadata: {
      duration: 3,
      frames: [
        { id: "frame-first", marker: "first", label: "First frame", time: 0, uri: "/media/first.jpg", width: 640, height: 360 },
        { id: "frame-mid", marker: "mid", label: "Mid frame", time: 1.5, uri: "/media/mid.jpg", width: 640, height: 360 },
        { id: "frame-last", marker: "last", label: "Last frame", time: 2.9, uri: "/media/last.jpg", width: 640, height: 360 }
      ]
    }
  }, "state-image");
  const video = branched.assets.find((asset) => asset.id === "motion-branch");
  const pack = createAttachPack(branched, "video-map");

  assert.equal(video.metadata.frames.length, 3);
  assert.equal(video.state.keyframes.find((frame) => frame.marker === "last").uri, "/media/last.jpg");
  assert.equal(pack.videoBranches[0].frames.length, 3);
  assert.equal(pack.videoBranches[0].frames[2].marker, "last");
});

test("video end-frame links describe transitions for humans and agents", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "state-image",
    name: "red-front.png",
    uri: "/media/red-front.png",
    requirementId: "fullbody_backgroundless",
    tags: ["front"]
  });
  avatar = assignAssetToSlot(avatar, {
    id: "next-image",
    name: "red-close-up.png",
    uri: "/media/red-close-up.png",
    requirementId: "closeup_emotions",
    tags: ["close-up"]
  });
  avatar = attachVideoBranch(avatar, {
    id: "motion-branch",
    name: "red-front-look.mp4",
    uri: "/media/red-front-look.mp4",
    type: "video",
    metadata: {
      duration: 2,
      frames: [
        { id: "look-first", marker: "first", uri: "/media/look-first.jpg" },
        { id: "look-mid", marker: "mid", uri: "/media/look-mid.jpg" },
        { id: "look-last", marker: "last", uri: "/media/look-last.jpg" }
      ]
    }
  }, "state-image");

  const linked = connectVideoEndFrame(avatar, "motion-branch", "next-image", {
    fromFrame: "mid",
    targetFrame: "image",
    targetFrameAssetId: "next-image",
    targetFrameUri: "/media/red-close-up.png",
    linkType: "match-cut",
    humanLabel: "Look resolves to close-up",
    reason: "The final eye-line matches the close-up angle.",
    agentInstruction: "Use the selected source frame as continuity reference before cutting to the close-up image."
  });
  const video = linked.assets.find((asset) => asset.id === "motion-branch");
  const pack = createAttachPack(linked, "sequence");

  assert.equal(video.state.outLinks.length, 1);
  assert.equal(video.state.outLinks[0].targetAssetId, "next-image");
  assert.equal(video.state.outLinks[0].fromFrame, "mid");
  assert.equal(video.state.outLinks[0].targetFrameUri, "/media/red-close-up.png");
  assert.equal(pack.videoLinks.length, 1);
  assert.equal(pack.videoLinks[0].linkType, "match-cut");
  assert.equal(pack.videoLinks[0].fromFrameAsset.uri, "/media/look-mid.jpg");
  assert.equal(pack.videoLinks[0].targetFrameAsset.uri, "/media/red-close-up.png");
  assert.equal(pack.videoLinks[0].agentInstruction.includes("continuity"), true);
  assert.equal(pack.stateGraph.find((state) => state.assetId === "next-image").incomingEndLinkIds.length, 1);

  const cleaned = detachAssetFromAvatar(linked, "next-image");
  const cleanedVideo = cleaned.assets.find((asset) => asset.id === "motion-branch");
  assert.equal(cleanedVideo.state.outLinks.length, 0);
});

test("video reverse loop validation stores playback mode and route quality tags", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "state-image",
    name: "red-front.png",
    uri: "/media/red-front.png",
    requirementId: "fullbody_backgroundless",
    tags: ["front"]
  });
  avatar = attachVideoBranch(avatar, {
    id: "motion-branch",
    name: "red-pingpong.mp4",
    uri: "/media/red-pingpong.mp4",
    type: "video",
    metadata: {
      duration: 2,
      frames: [
        { id: "loop-first", marker: "first", uri: "/media/loop-first.jpg" },
        { id: "loop-last", marker: "last", uri: "/media/loop-last.jpg" }
      ]
    }
  }, "state-image");

  const reviewed = setVideoReverseLoopValidation(avatar, "motion-branch", {
    mode: "triple-pass",
    acceptable: true,
    note: "Clean enough for a reverse ping-pong route."
  });
  const video = reviewed.assets.find((asset) => asset.id === "motion-branch");

  assert.equal(video.state.loop.reversePlayback.mode, "triple-pass");
  assert.equal(video.state.loop.reversePlayback.acceptable, true);
  assert.equal(video.state.loop.reversePlayback.note.includes("ping-pong"), true);
  assert.equal(video.tags.includes("reverse-loop"), true);
  assert.equal(video.tags.includes("reverse-loop-validated"), true);
});

test("video frame match queue uses high-likeness first and last frame candidates", () => {
  const fingerprint = { kind: "luma-grid", size: 2, luma: [22, 24, 25, 23] };
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "seed-a",
    name: "seed-a.png",
    uri: "/media/seed-a.png",
    requirementId: "fullbody_backgroundless",
    tags: ["front", "backgroundless"]
  });
  avatar = attachVideoBranch(avatar, {
    id: "video-a",
    name: "red-route-a.mp4",
    uri: "/media/red-route-a.mp4",
    type: "video",
    tags: ["loopable", "smooth"],
    metadata: {
      duration: 2,
      frames: [
        { id: "a-first", marker: "first", uri: "/media/a-first.jpg", width: 640, height: 360, fingerprint: { kind: "luma-grid", size: 2, luma: [80, 80, 82, 82] } },
        { id: "a-mid", marker: "mid", uri: "/media/a-mid.jpg", width: 640, height: 360 },
        { id: "a-last", marker: "last", uri: "/media/a-last.jpg", width: 640, height: 360, fingerprint }
      ]
    }
  }, "seed-a");
  avatar = attachVideoBranch(avatar, {
    id: "video-b",
    name: "red-route-b.mp4",
    uri: "/media/red-route-b.mp4",
    type: "video",
    tags: ["loopable", "smooth"],
    metadata: {
      duration: 2,
      frames: [
        { id: "b-first", marker: "first", uri: "/media/b-first.jpg", width: 640, height: 360, fingerprint },
        { id: "b-mid", marker: "mid", uri: "/media/b-mid.jpg", width: 640, height: 360 },
        { id: "b-last", marker: "last", uri: "/media/b-last.jpg", width: 640, height: 360, fingerprint: { kind: "luma-grid", size: 2, luma: [180, 180, 182, 182] } }
      ]
    }
  }, "seed-a");

  const queue = createVideoFrameMatchQueue(avatar, { threshold: 0.9 });
  assert.equal(queue.some((candidate) => candidate.fromVideoId === "video-a" && candidate.toVideoId === "video-b"), true);
  assert.equal(queue[0].score >= 0.9, true);
  assert.equal(queue[0].fromFrame, "last");
  assert.equal(queue[0].toFrame, "first");
});

test("look book asset nodes persist into attach packs", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "seed-note",
    name: "seed-note.png",
    uri: "/media/seed-note.png",
    requirementId: "backgroundless_two_thirds",
    tags: ["seed-frame", "two-thirds"]
  });
  avatar = appendAssetNode(avatar, "seed-note", {
    type: "route-note",
    label: "Route note",
    body: "Use this as a convergence point after helmet turn videos."
  });
  const asset = avatar.assets.find((item) => item.id === "seed-note");
  const pack = createAttachPack(avatar, "lookbook");

  assert.equal(asset.metadata.nodes.length, 1);
  assert.equal(pack.baseReferences[0].nodes[0].body.includes("convergence"), true);
  assert.equal(pack.stateGraph.every((state) => Array.isArray(state.nodes)), true);
});

test("backgroundless video registration is append-only and preserves source media", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "emotion-loop",
    name: "red-emotion-loop.mp4",
    uri: "/media/red-emotion-loop.mp4",
    type: "video",
    requirementId: "closeup_emotions",
    tags: ["close-up", "neutral", "solid-background"]
  });

  const registered = registerBackgroundlessVideoVariant(avatar, "emotion-loop", {
    taskId: "task-alpha-1",
    webUri: "/media/red-emotion-loop.backgroundless.webm",
    alphaUri: "/media/red-emotion-loop.alpha.mov",
    sourceVideoHash: "sha256-source",
    backend: "hapa-video-alpha-node",
    keyer: "colorkey",
    codec: "webm-alpha"
  });
  const original = registered.assets.find((asset) => asset.id === "emotion-loop");
  const playback = backgroundlessPlaybackForAsset(original);

  assert.equal(original.uri, "/media/red-emotion-loop.mp4");
  assert.equal(original.metadata.backgroundless.status, "ready");
  assert.equal(playback.ready, true);
  assert.equal(playback.uri, "/media/red-emotion-loop.backgroundless.webm");
  assert.equal(playback.sourceUri, "/media/red-emotion-loop.mp4");
  assert.equal(original.tags.includes("has-backgroundless-video"), true);
});

test("backgroundless video state is exported through summaries and attach packs", () => {
  let avatar = createAvatarScaffold({ names: ["Red"], primaryName: "Red" });
  avatar = assignAssetToSlot(avatar, {
    id: "hero-loop",
    name: "red-hero-loop.mp4",
    uri: "/media/red-hero-loop.mp4",
    type: "video",
    requirementId: "fullbody_concept_art",
    tags: ["hero", "loop"]
  });
  avatar = registerBackgroundlessVideoVariant(avatar, "hero-loop", {
    webUri: "/media/red-hero-loop.alpha.webm",
    sourceVideoHash: "hero-hash"
  });

  const summary = videoBackgroundlessSummary(avatar);
  const pack = createAttachPack(avatar, "video");
  const branch = pack.videoBranches.find((item) => item.id === "hero-loop");

  assert.equal(summary.total, 1);
  assert.equal(summary.ready, 1);
  assert.equal(summary.items[0].playbackUri, "/media/red-hero-loop.alpha.webm");
  assert.equal(branch.uri, "/media/red-hero-loop.mp4");
  assert.equal(branch.playbackUri, "/media/red-hero-loop.alpha.webm");
  assert.equal(branch.backgroundless.ready, true);
  assert.equal(branch.backgroundless.sourceUri, "/media/red-hero-loop.mp4");
});
