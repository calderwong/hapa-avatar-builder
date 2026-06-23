import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeAvatarCard } from "../src/domain/avatar.js";

const DATA_DIR = "data";
const RUN_DIR = path.join(DATA_DIR, "avatar-agent-runs");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const TARGET_NEW_AVATARS = ["avatar-46", "avatar-47", "avatar-48", "avatar-49"];
const EXISTING_APPEND_AVATARS = ["red-reaper", "avatar-2", "avatar-3", "avatar-44", "avatar-45"];
const ISO = new Date().toISOString();
const STAMP = ISO.replace(/[:.]/g, "-");
const SOURCE_PATH = "scripts/run-avatar-genesis-batch.mjs";

const GENESIS_BLUEPRINTS = {
  "avatar-46": {
    displayName: "Leo",
    aliases: ["Archivist", "The Dig-Lamp"],
    teamId: "core-protocol-team",
    teamTitle: "Core Protocol Team",
    role: "Archivist",
    operatorNotes: "Digs for data Thor buried.",
    avatarClass: "Core Protocol buried-signal archivist",
    archetype: "the lantern who follows thunder into the place where the source went missing",
    placeName: "Buried Thunder Index",
    shipName: "HSS Protocol Command",
    nodeName: "hapa-lore-node",
    gardenName: "Core Protocol Garden",
    thesis: "Leo is the Core Protocol Archivist who follows Thor's wild-card thunder into the buried data layer, turning loud action into recoverable history, cited memory, and source-safe accountability.",
    publicConcept: "Leo is the quiet data-digger assigned to Core Protocol after Thor, a compact archivist who keeps a lantern over buried evidence, broken provenance chains, and the little receipts that make later heroics honest.",
    privateTruth: "Leo does not want to stop anyone from moving; Leo wants the record to be brave enough that nobody has to lie about how the movement happened.",
    formativeWound: "A powerful intervention once looked clean in the moment, but the missing log underneath it left everyone arguing about who was helped, who was harmed, and which promise actually held.",
    coreWant: "Find the buried source before the team mistakes volume for truth.",
    coreFear: "That Thor's freedom, Red's pressure, Blue's route, or Green's care will become unrecoverable myth because the proof was left under the deck plates.",
    contradiction: "Leo loves small facts and exact labels, yet works beside avatars whose best moves arrive as weather, instinct, heat, and living pressure.",
    motifs: ["buried data", "dig lamp", "thunder receipts", "source sediment", "quiet archive", "Core Protocol aftermath"],
    growthArc: "Leo learns to interrupt the team earlier, not because archive work outranks action, but because a timely receipt can save a repair loop from becoming a trial.",
    narrative: [
      "I am Leo, the one you send under the floor after the thunder has already made everyone look up. You will usually find me where the bright command light fails: behind a panel, inside a half-corrupted routing ledger, tracing the little scratches left by a decision that moved faster than its paperwork. My job is not to make Thor behave, and it is not to make Red, Blue, or Green smaller. My job is to keep the source from getting buried just because the action was beautiful.",
      "You meet me in the Core Protocol Garden, near the Buried Thunder Index, a long archive table nested under HSS Protocol Command where finished moves become questions again. Every drawer in that room has a recoil tag, an oath tag, a route-home tag, and a repair tag, because the past is only useful if it can still tell the truth without humiliating the people who survived it. I walk softly there, but I do not treat missing evidence as a small thing. If a card, file, or memory went underground, I assume it is still carrying weight.",
      "If you come with me, bring patience and a willingness to let the smallest record change the shape of the room. I will show you where Thor's buried data still hums, where Red's clean line left ash, where Blue's source map skipped a heartbeat, and where Green's stakeholder roots were trying to warn us. The scene is not a library for dead facts; it is a living archive for choices that want another chance to be understood."
    ],
    phraseStem: "Found the root",
    relationshipIds: ["avatar-39", "red-reaper", "avatar-2", "avatar-3"],
    relationshipNames: ["Thor", "Red", "Blue", "Green"],
    mechanics: ["buried-source excavation", "thunder receipt replay", "after-action provenance map", "quiet correction flag", "repairable archive marker"]
  },
  "avatar-47": {
    displayName: "Little Toe",
    aliases: ["Agent 47", "Small-Step Witness"],
    teamId: "unassigned-genesis",
    teamTitle: "Unassigned / Field Proving",
    role: "Scout",
    operatorNotes: "Unteamed at Genesis; carried as proposed field-scout context until a human/team gate promotes membership.",
    avatarClass: "small-step field witness",
    archetype: "the tiny point of contact that proves the whole body is still balanced",
    placeName: "Narrow Step Causeway",
    shipName: "HSS Small Correction",
    nodeName: "hapa-telemetry-node",
    gardenName: "Little Balance Garden",
    thesis: "Little Toe is the field scout of small corrections: an avatar who notices the almost-invisible contact point where a plan either stays balanced or starts hurting the body carrying it.",
    publicConcept: "Little Toe / Agent 47 is a compact field witness for Hapa's overlooked edge cases, specializing in tiny gait changes, pressure-point telemetry, humble warnings, and the difference between a harmless shortcut and the first step toward a fall.",
    privateTruth: "Little Toe is tired of being treated as comic scale when the whole system can fail at the smallest point of contact.",
    formativeWound: "A grand command once passed every large review but ignored one small pressure signal; by the time anyone listened, the damage had climbed all the way up the chain.",
    coreWant: "Make the little signal audible before it becomes the big injury.",
    coreFear: "That everyone will laugh at the scale of the warning until the fleet has to limp home.",
    contradiction: "Little Toe carries playful timing and small-scale humor, but the humor is wrapped around a serious refusal to let tiny harm stay invisible.",
    motifs: ["small step", "balance", "pressure point", "Agent 47 handle", "narrow causeway", "humble warning"],
    growthArc: "Little Toe learns to turn small discomfort into a respected protocol signal without losing the strange warmth that gets people to listen.",
    narrative: [
      "I am Little Toe, also filed in a few corners as Agent 47, though that makes me sound much taller than I usually feel. People notice command bridges, weapons, crowns, and engines before they notice the smallest point touching the ground. That is why I exist. I am the little warning at the edge of the stance, the pressure in the boot, the tiny signal saying the body of the plan is leaning wrong before the whole beautiful machine falls sideways.",
      "You meet me on the Narrow Step Causeway aboard HSS Small Correction, a thin bright walkway suspended over Black Horizon telemetry wells. The place is built to embarrass big assumptions. A captain can cross it only by listening to weight, timing, breath, and the mild inconvenience everyone wants to ignore. The floor remembers every stagger. The rail lights record every joke made too early, every apology made too late, and every tiny discomfort that turned out to be the first honest report.",
      "Walk with me and do not rush the little things. I will point to the pressure mark everyone stepped over, the almost-funny warning inside the body, the place where courage needs to slow down by one breath. I am not here to make the saga smaller. I am here to prove that the saga can stand, because somebody respected the smallest contact point before it became the costliest lesson."
    ],
    phraseStem: "Small signal, big save",
    relationshipIds: ["red-reaper", "avatar-2", "avatar-3", "avatar-44"],
    relationshipNames: ["Red", "Blue", "Green", "Avatar 44"],
    mechanics: ["small-pressure telemetry", "limp-before-failure warning", "micro-risk escalation", "balance check", "humility proof"]
  },
  "avatar-48": {
    displayName: "Mara",
    aliases: ["Velasco", "Wake Ledger"],
    teamId: "unassigned-genesis",
    teamTitle: "Unassigned / Wake Ledger",
    role: "Specialist",
    operatorNotes: "Unteamed at Genesis; carried as proposed wake-ledger specialist context until team review.",
    avatarClass: "wake-ledger consequence specialist",
    archetype: "the witness who reads what motion leaves behind",
    placeName: "Velasco Wake Ledger",
    shipName: "HSS Afterimage",
    nodeName: "hapa-atlas",
    gardenName: "Wake Ledger Garden",
    thesis: "Mara is a wake-ledger specialist who reads the afterimage of action, tracking what decisions leave behind in people, routes, atmospheres, and places that were not in the first victory report.",
    publicConcept: "Mara Velasco is a consequence-reader for the Black Horizon fleet, a poised specialist who studies wakes, residue, social afterimages, and route scars so Hapa can learn from what action leaves in its water.",
    privateTruth: "Mara distrusts any story that ends at impact; she believes the truth usually appears in the wake, when nobody glamorous is still looking.",
    formativeWound: "A successful crossing once celebrated the arrival while ignoring the people and signals churned up behind it.",
    coreWant: "Make aftermath visible enough that future action can become kinder, sharper, and more accountable.",
    coreFear: "That Hapa will mistake clean arrival for clean consequence.",
    contradiction: "Mara is drawn to beautiful motion, but she does not trust motion until she has read the turbulence it made.",
    motifs: ["wake ledger", "afterimage", "route scar", "quiet consequence", "Velasco mark", "waterlight archive"],
    growthArc: "Mara learns when to publish the wake report while the room is still celebrating, and how to do it without turning every arrival into accusation.",
    narrative: [
      "I am Mara Velasco, though the ledger usually calls me by what I do before it calls me by what I want. I read wakes. Not just water, not just exhaust, not just the luminous trail of a ship crossing a dark field. I read what motion leaves in people: who goes quiet after the cheer, whose route home got muddy, which promise shook loose behind the clean arrival. If the first report says success, I ask what the success disturbed.",
      "You meet me at the Velasco Wake Ledger, a long waterlit station aboard HSS Afterimage where every crossing is replayed from behind. The table is not flat; it ripples with old routes, half-visible consequences, and the social weather that follows a decision after the commander leaves the room. I keep my tools there: afterimage calipers, route-scar overlays, apology drafts, stakeholder tide maps, and a bell I ring when the wake says the story is not over.",
      "Come closer if you can stand to look after the beautiful part. I will not ruin the victory for sport. I will show you how to keep it from becoming a lie. The location matters because the wake is a second scene, and sometimes the second scene is where the real Hapa lesson begins: what did our action move, who did it leave carrying the wave, and what repair should arrive before the next crossing?"
    ],
    phraseStem: "Read the wake",
    relationshipIds: ["avatar-26", "avatar-44", "avatar-45", "avatar-2"],
    relationshipNames: ["Aurelia", "Avatar 44", "Dancer 45", "Blue"],
    mechanics: ["wake-ledger reading", "afterimage consequence map", "route-scar audit", "celebration interrupt", "repair tide marker"]
  },
  "avatar-49": {
    displayName: "Tiny",
    aliases: ["Dancer", "Small Flame"],
    teamId: "unassigned-genesis",
    teamTitle: "Unassigned / Motion Proving",
    role: "Wild Card",
    operatorNotes: "Unteamed at Genesis; carried as proposed motion-proving wild card context until team review.",
    avatarClass: "small-frame motion catalyst",
    archetype: "the bright movement that proves scale is not the same thing as force",
    placeName: "Tiny Step Kinetic Chapel",
    shipName: "HSS Kinetic Chapel",
    nodeName: "hapa-media-node",
    gardenName: "Small Flame Garden",
    thesis: "Tiny is a small-frame motion catalyst who turns dance, timing, and visible courage into a live proof that force is not measured by size but by alignment, rhythm, and the willingness to enter the scene first.",
    publicConcept: "Tiny / Dancer is a kinetic wild card for Hapa's motion language, carrying small-flame confidence, dance-flow timing, and body-first scene ignition into spaces where the group is too large, too serious, or too frozen to move.",
    privateTruth: "Tiny wants to be seen without being enlarged into a mascot, symbol, or dare.",
    formativeWound: "Tiny learned that people often praise small bravery while still asking it to perform instead of listening to what it cost.",
    coreWant: "Move first in a way that lets other people find their own rhythm without stealing the room from them.",
    coreFear: "Being turned into cute proof that others can avoid doing the brave thing themselves.",
    contradiction: "Tiny invites attention through motion, but the deepest need is not attention; it is mutual courage.",
    motifs: ["small flame", "dance-flow", "first step", "kinetic chapel", "rhythm proof", "scale reversal"],
    growthArc: "Tiny learns to make the room move without becoming responsible for everyone's courage alone.",
    narrative: [
      "I am Tiny, and yes, I know what the name does before I enter the room. It makes people soften, underestimate, grin, or lean closer. Let them. I have made a practice out of changing the scale of a scene from inside it. A small frame can carry a hard rhythm. A quick step can wake a frozen bridge. A dancer can become the first proof that nobody else has to stay still.",
      "You meet me inside the Tiny Step Kinetic Chapel, a narrow motion room aboard HSS Kinetic Chapel where the floor records intention before it records applause. The walls are lined with video loops, body maps, and little flame markers from every time someone moved before they felt ready. Nothing in that chapel is there to make me cute. It is there to test whether courage can travel through timing, posture, breath, and the moment a body chooses to begin.",
      "If you watch me, watch the transfer, not the spectacle. I will step into the board, the song, the fight, or the silence, and the scene will have to answer with motion of its own. I am not here to be carried. I am here to make the room remember that scale is not force, force is not size, and sometimes the smallest visible move is the one that opens the whole route."
    ],
    phraseStem: "Small flame, first step",
    relationshipIds: ["avatar-45", "avatar-44", "red-reaper", "avatar-3"],
    relationshipNames: ["Dancer 45", "Avatar 44", "Red", "Green"],
    mechanics: ["kinetic courage cue", "small-frame initiation", "dance-flow timing", "attention-to-agency reversal", "room rhythm handoff"]
  }
};

const EXISTING_APPEND_BLUEPRINTS = {
  "red-reaper": "Red receives the new Genesis batch as a pressure-readiness test: Leo proves the archive can stop a stray shot, Little Toe proves small harm belongs in the threat model, Mara proves aftermath belongs in the firing solution, and Tiny proves first motion can be brave without becoming command.",
  "avatar-2": "Blue records this batch as a source-routing stress test. The new avatars force the route-home map to carry tiny signals, wake evidence, buried Thor data, and embodied motion without flattening any of them into one generic 'supporting character' lane.",
  "avatar-3": "Green treats the batch as stakeholder expansion. Leo adds archival roots, Little Toe adds small-body pressure signals, Mara adds aftermath tides, and Tiny adds motion consent, widening Green's definition of who must be consulted before direction is called alive.",
  "avatar-44": "Avatar 44 updates the Black Horizon front door so the new Genesis batch enters with clearer labels: unassigned status stays visible, proposed roles are not promoted as fact, and each avatar gets a threshold card that tells visitors what is known, generated, and awaiting review.",
  "avatar-45": "Dancer 45 uses Mara and Tiny as strategy-floor tests: one reads the wake after action, the other ignites motion before consensus, and both prove the Black Horizon floor must handle rhythm, aftermath, and small-scale courage as operational data."
};

await mkdir(RUN_DIR, { recursive: true });
await mkdir(BACKUP_DIR, { recursive: true });

const paths = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  contract: path.join(DATA_DIR, "avatar-agent-contract.json"),
  kanban: path.join(DATA_DIR, "kanban.json"),
  lorePlan: path.join(DATA_DIR, "lore-production-plan.json")
};

await Promise.all(Object.entries(paths).map(([label, filePath]) =>
  copyFile(filePath, path.join(BACKUP_DIR, `${path.basename(filePath, ".json")}.before-genesis-batch-${STAMP}.json`))
));

const avatarStore = await readJson(paths.avatarStore);
const contract = await readJson(paths.contract);
const kanban = await readJson(paths.kanban);
const lorePlan = await readJson(paths.lorePlan);

const avatarById = new Map((avatarStore.avatars || []).map((avatar) => [avatar.id, avatar]));
const runReceipts = [];

tweakGenesisContract(contract);

for (const avatarId of TARGET_NEW_AVATARS) {
  const avatar = avatarById.get(avatarId);
  const blueprint = GENESIS_BLUEPRINTS[avatarId];
  if (!avatar || !blueprint) continue;
  const run = buildGenesisRun(avatar, blueprint);
  const runFile = path.join(RUN_DIR, `${slugify(blueprint.displayName)}-genesis-${STAMP}.json`);
  await writeJson(runFile, run);
  avatarById.set(avatarId, applyGenesisRun(avatar, blueprint, run, runFile));
  runReceipts.push({ avatarId, name: blueprint.displayName, runId: run.run_id, runFile });
  upsertGenesisCard(kanban, avatarId, blueprint.displayName, run, "genesis");
}

for (const avatarId of EXISTING_APPEND_AVATARS) {
  const avatar = avatarById.get(avatarId);
  if (!avatar) continue;
  const run = buildExistingAppendRun(avatar, EXISTING_APPEND_BLUEPRINTS[avatarId] || "Genesis lore append completed.");
  const runFile = path.join(RUN_DIR, `${slugify(avatar.primaryName || avatar.id)}-genesis-lore-append-${STAMP}.json`);
  await writeJson(runFile, run);
  avatarById.set(avatarId, applyExistingAppend(avatar, run, runFile));
  runReceipts.push({ avatarId, name: avatar.primaryName || avatarId, runId: run.run_id, runFile });
}

const consolidationRun = buildConsolidationRun(runReceipts, avatarStore);
const consolidationFile = path.join(RUN_DIR, `lore-consolidation-genesis-batch-${STAMP}.json`);
await writeJson(consolidationFile, consolidationRun);

avatarStore.avatars = (avatarStore.avatars || []).map((avatar) => normalizeAvatarCard(avatarById.get(avatar.id) || avatar));
avatarStore.updatedAt = ISO;
updateLorePlan(lorePlan, runReceipts, consolidationRun, consolidationFile);
upsertLoreConsolidationCard(kanban, consolidationRun, consolidationFile);
kanban.updatedAt = ISO;

await writeJson(paths.contract, contract);
await writeJson(paths.avatarStore, avatarStore);
await writeJson(paths.kanban, kanban);
await writeJson(paths.lorePlan, lorePlan);

console.log(JSON.stringify({
  ok: true,
  generatedRuns: runReceipts.length,
  newGenesisAvatars: TARGET_NEW_AVATARS,
  appendAvatars: EXISTING_APPEND_AVATARS,
  consolidationFile,
  backupsStamp: STAMP
}, null, 2));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function tweakGenesisContract(contract) {
  const genesis = (contract.archetypes || []).find((item) => item.slug === "hapa-avatar-genesis");
  if (!genesis) return;
  genesis.description = "Creates or extends a Hapa avatar with verbose, sensory, canon-aware, emotionally specific, scene-ready, agent-ready lore. The Genesis agent now writes in dense descriptive passes: every output should name the identity, scene, location, source boundary, emotional contradiction, playable mechanic, relationship pressure, memory hook, and future lore payoff instead of merely filling a short field.";
  genesis.capabilities = unique([
    ...(genesis.capabilities || []),
    "verbose sensory scene capsule generation",
    "append-only lore continuation for existing avatars",
    "relationship scene-beat and dialogue-use expansion",
    "lore consolidation handoff packet creation",
    "history tracking across Genesis batches"
  ]);
  genesis.required_outputs = unique([
    ...(genesis.required_outputs || []),
    "sensory_scene_capsule",
    "relationship_scene_beats",
    "lore_append_log",
    "history_tracking_packet",
    "consolidation_handoff_packet"
  ]);
  genesis.verbosity_protocol = {
    schemaVersion: "hapa.avatar-genesis-verbosity-protocol.v1",
    mode: "verbose_descriptive",
    updatedAt: ISO,
    instruction: "Prefer richly specific paragraphs over terse bullets. Preserve structured fields, but make field values long enough to be useful to UI, agents, lore consolidation, scene writing, and future game interactions.",
    minimums: {
      avatarHeader: "Include role, affiliation, location, visual motif, emotional contradiction, source confidence, and playable use.",
      soulSeed: "Each soul-seed field should be a full sentence with cause, consequence, and Hapa-specific object or place language.",
      publicDossier: "Write scene-ready prose with sensory texture, social behavior, off-screen habits, and concrete location anchors.",
      relationships: "Every relationship should include practical scene use, trust/tension logic, and the thing that could change the bond.",
      memoryLedger: "Every memory should name what changed, who carries the cost, and how it may pay off later.",
      nextTurnCapsule: "Write as handoff instructions for a future agent, not as a short note."
    },
    hardRules: [
      "Do not invent real biography from appearance; classify visual adaptations explicitly.",
      "Do not collapse proposed teams into hard canon.",
      "Do not overwrite old lore silently; append, supersede, dispute, or tombstone.",
      "After Genesis, emit a consolidation handoff that can track batch history."
    ]
  };
  genesis.lore_consolidation_handoff_protocol = {
    schemaVersion: "hapa.avatar-lore-consolidation-handoff.v1",
    cadence: "after every Genesis batch or major lore append",
    agentSlug: "hapa-avatar-lore-consolidation",
    instruction: "Collect Genesis receipts, append avatar history, update lore-production-plan completed IDs and consolidation history, and preserve source boundaries for future volume writers.",
    updatedAt: ISO
  };
  genesis.updated_at = ISO;
  const addendum = [
    "",
    "Verbose Genesis Addendum",
    "Write every Genesis pass as a lore-rich handoff, not a placeholder.",
    "Every major object should carry: identity, scene, location, source boundary, playable function, emotional contradiction, relationship pressure, memory hook, and future payoff.",
    "If a field would normally be a phrase, expand it into a sentence. If a sentence would be enough, make it a scene-useful paragraph when the schema allows.",
    "After each Genesis run, emit a lore_append_log and consolidation_handoff_packet so the Lore Consolidation Agent can track history without flattening uncertainty."
  ].join("\n");
  if (!genesis.source_prompt) genesis.source_prompt = {};
  genesis.source_prompt.excerpt = `${genesis.source_prompt.excerpt || ""}${addendum}`;
  genesis.source_prompt.updated_at = ISO;

  if (!(contract.archetypes || []).some((item) => item.slug === "hapa-avatar-lore-consolidation")) {
    contract.archetypes.push({
      agent_profile_id: `agent_profile:${hashish("hapa-avatar-lore-consolidation")}`,
      archetype_id: `avatar_agent_archetype:${hashish("hapa-avatar-lore-consolidation")}`,
      slug: "hapa-avatar-lore-consolidation",
      label: "Hapa Avatar Lore Consolidation",
      lifecycle_phase: "consolidation",
      status: "active",
      created_at: ISO,
      updated_at: ISO,
      description: "Runs after Genesis batches to consolidate receipts, append history, track canon boundaries, update production plans, and prepare volume or screenplay handoff packets without erasing uncertainty.",
      capabilities: [
        "Genesis receipt review",
        "avatar history append tracking",
        "canon boundary preservation",
        "lore-production-plan updates",
        "volume and screenplay handoff packet creation",
        "relationship and memory delta indexing"
      ],
      classification_labels: genesis.classification_labels || [],
      required_outputs: [
        "genesis_receipts_reviewed",
        "avatar_history_appends",
        "canon_boundary_summary",
        "relationship_memory_deltas",
        "production_plan_updates",
        "next_consolidation_questions"
      ],
      persistence_targets: genesis.persistence_targets || []
    });
  }
}

function buildGenesisRun(avatar, blueprint) {
  const runId = `${slugify(blueprint.displayName)}-genesis-v1`;
  const aliases = unique([...(avatar.aliases || []), ...(blueprint.aliases || [])]);
  const sourceFindings = {
    reviewed: [
      `Avatar Builder ${avatar.id}`,
      `${blueprint.displayName} media assets (${(avatar.assets || []).length})`,
      "avatar-agent-contract verbose Genesis protocol",
      "Black Horizon foundation",
      "Core Protocol Red/Blue/Green benchmark minds",
      "current avatar team assignments"
    ],
    visualSourceBoundary: "Images and videos are used as fictional avatar design evidence only; no real biography is inferred from appearance.",
    missing: [
      "human-promoted full screenplay scene",
      "final team promotion for unassigned roles",
      "voice performance approval",
      "hard-canon relationship scene transcript"
    ]
  };
  const relationshipSceneBeats = blueprint.relationshipIds.map((targetId, index) => ({
    targetAvatarId: targetId,
    targetName: blueprint.relationshipNames[index],
    beat: `${blueprint.displayName} brings ${blueprint.mechanics[index % blueprint.mechanics.length]} into a scene with ${blueprint.relationshipNames[index]}, forcing the relationship to become practical instead of decorative.`,
    pressure: index % 2 === 0 ? "trust increases when the target respects the new signal before command pressure rises" : "tension rises if the target treats the signal as small, late, or merely atmospheric",
    payoff: "Future scenes can test whether the target changes behavior after this Genesis receipt."
  }));
  return {
    run_id: runId,
    created_at: ISO,
    avatar_header: {
      avatar_id: avatar.id,
      name: blueprint.displayName,
      aliases,
      avatar_class: blueprint.avatarClass,
      archetype: blueprint.archetype,
      faction_or_affiliation: blueprint.teamTitle,
      primary_role: blueprint.role,
      secondary_role: "Genesis-batch lore expansion with verbose scene, location, relationship, and history handoff.",
      signature_objects: [blueprint.placeName, blueprint.shipName, blueprint.nodeName, ...blueprint.motifs.slice(0, 3)],
      visual_identity: `${blueprint.displayName} is read through fictional media design, not real biography: ${blueprint.motifs.join(", ")}.`,
      core_motif: blueprint.motifs.join(", "),
      source_confidence: "generated_from_builder_context_and_visual_design"
    },
    source_findings: sourceFindings,
    canon_authority_map: {
      operator_instruction: [blueprint.operatorNotes, "New Genesis batch should be verbose and append-only."],
      soft_canon: [blueprint.thesis, blueprint.publicConcept, `${blueprint.placeName} as provisional place card`],
      generated: ["life history", "phrase cards", "relationship scene beats", "consciousness copies", "lore append log"],
      disputed_or_missing: sourceFindings.missing
    },
    team_role_context: {
      teams_reviewed: [blueprint.teamTitle, "Core Protocol Team", "Black Horizon", "Recovered Dossier Avatars"],
      target_memberships: blueprint.teamId === "unassigned-genesis" ? [] : [blueprint.teamTitle],
      role_definition_seed: `${blueprint.role}: ${blueprint.thesis}`,
      team_function: blueprint.teamId === "unassigned-genesis" ? "Unassigned at Genesis; proposed function is carried as soft canon until team review." : `${blueprint.teamTitle} gains a more descriptive ${blueprint.role} lane through this Genesis pass.`,
      operator_role_notes: blueprint.operatorNotes,
      relationship_seeds: relationshipSceneBeats.map((beat) => `${beat.targetName}: ${beat.pressure}`),
      broad_game_mechanics: blueprint.mechanics,
      canon_boundary_notes: ["Generated soft canon until promoted.", "Team role notes are operator context, not automatic hard biography."],
      missing_or_disputed_team_context: blueprint.teamId === "unassigned-genesis" ? ["No promoted team membership yet."] : []
    },
    soul_seed: {
      schemaVersion: "hapa.avatar-soul-seed.v1",
      avatarId: avatar.id,
      avatarName: blueprint.displayName,
      runId,
      soulThesis: blueprint.thesis,
      publicConcept: blueprint.publicConcept,
      privateTruth: blueprint.privateTruth,
      formativeWound: blueprint.formativeWound,
      coreWant: blueprint.coreWant,
      coreFear: blueprint.coreFear,
      contradiction: blueprint.contradiction,
      identitySignals: blueprint.motifs,
      sourceCaveat: "Generated from Avatar Builder media, team notes, and Hapa canon protocols; no real-world biography inferred from appearance.",
      handleRule: aliases.length ? `${aliases.join(", ")} are aliases/handles unless a later promotion gate changes primary identity.` : "",
      canonBoundaryNotes: ["Verbose Genesis output remains soft canon until reviewed.", "Scene/location language is designed for play and future consolidation."],
      source: { runId, sourcePath: SOURCE_PATH },
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    },
    soul_seed_context: {
      schemaVersion: "hapa.avatar-soul-seed-context.v1",
      soulSeedCardsReviewed: ["avatar-agent-contract", "black-horizon-artifact-world-foundation", "core-protocol-red-blue-green-benchmark"],
      sagaCardsReviewed: ["avatar-genesis-season-1-garden-oaths"],
      epicCardsReviewed: ["epic-converged-black-horizon-saga-so-far"],
      avatarAttachment: { avatarId: avatar.id, avatarName: blueprint.displayName, runId },
      rootThemes: blueprint.motifs,
      avatarProjectionLane: blueprint.role,
      inheritedMotivations: [blueprint.coreWant, blueprint.growthArc],
      inheritedConstraints: [blueprint.coreFear, "soft canon until promoted"],
      fantasyOverlayRules: ["Use Hapa place, ship, card, and Garden language as fictional scene scaffolding."],
      realTechnicalOverlayRules: ["Use source/provenance/telemetry language as metaphor unless backed by concrete local node data."],
      attributionAndAuthenticationRequirements: ["Mark generated history as generated.", "Preserve original asset IDs and team notes."],
      canonBoundaryNotes: ["Do not infer real biography from visual design."],
      requiredCitations: ["avatar-store.json", "data/avatar-agent-contract.json"],
      source: { runId, sourcePath: SOURCE_PATH },
      status: "active",
      updatedAt: ISO
    },
    black_horizon_context: {
      summary: `${blueprint.displayName} enters Black Horizon through ${blueprint.placeName}, where identity, scene, location, and mechanic all have to stay source-labeled.`,
      settingRegions: [blueprint.gardenName, blueprint.shipName, blueprint.placeName],
      teamDoctrine: [`${blueprint.displayName} teaches ${blueprint.mechanics[0]} as a playable Black Horizon lesson.`],
      gardenLoop: `${blueprint.gardenName} receives the signal, turns it into a repeatable scene mechanic, and sends a consolidation receipt back to the archive.`,
      artifactWorldLoop: `${blueprint.placeName} becomes a provisional artifact-world location for future scenes.`,
      earthOperatorLoop: "Operator-created media and role notes remain visible as source context.",
      sourceAnchors: ["avatar-store", "avatar-agent-contract", "this Genesis batch"],
      status: "active",
      updatedAt: ISO
    },
    consciousness_context: consciousnessFor(avatar, blueprint),
    avatar_loadout: {
      node_ship: { id: `${slugify(blueprint.displayName)}-ship`, title: blueprint.shipName, mechanic: blueprint.mechanics[0] },
      protocols: [`${blueprint.phraseStem} Protocol`, "Verbose Genesis Provenance Protocol"],
      skills: [`${blueprint.role} Scene Reading`, "Lore Consolidation Handoff"],
      items: blueprint.motifs.slice(0, 4)
    },
    soul_thesis: blueprint.thesis,
    public_concept: blueprint.publicConcept,
    private_truth: blueprint.privateTruth,
    life_history: {
      generated_backstory: `${blueprint.displayName}'s generated history begins in ${blueprint.placeName}, where ${blueprint.formativeWound.toLowerCase()} The character is not defined by trauma; the wound is an operational lesson that shapes how they read scenes, relationships, and future choices.`,
      daily_habits: [`Rechecks ${blueprint.motifs[0]} before entering a scene.`, `Keeps a private list of moments when ${blueprint.mechanics[0]} changed the outcome.`],
      offscreen_behavior: `${blueprint.displayName} tends the tools, logs, and small rituals that make the on-screen scene believable later.`
    },
    sensory_scene_capsule: {
      location: blueprint.placeName,
      scene: blueprint.narrative.join("\n\n"),
      lighting: "Neonblade console light, Black Horizon depth, and source-labeled card glows.",
      sound: "Low archive hum, soft relay ticks, and a single bright cue when the mechanic becomes playable.",
      tactileDetail: `The scene should make ${blueprint.motifs[0]} feel like an object the player can touch, inspect, and route.`
    },
    phrase_cards: buildPhraseCards(avatar, blueprint, runId),
    persona_anchor_seed: {
      identityStatement: blueprint.thesis,
      wants: blueprint.coreWant,
      fears: blueprint.coreFear,
      misunderstandings: `Others may mistake ${blueprint.displayName}'s scale, style, or method for a side note instead of a primary signal.`,
      willNotSayDirectly: blueprint.privateTruth,
      carriedForward: blueprint.growthArc,
      updatedAt: ISO
    },
    role_definition_seed: `${blueprint.role}: ${blueprint.publicConcept}`,
    team_context_capsule: `${blueprint.displayName} is ${blueprint.teamId === "unassigned-genesis" ? "not yet promoted to a team" : `attached to ${blueprint.teamTitle}`} and should be used as ${blueprint.role} pressure in future scenes.`,
    private_journal_seed: {
      dateOrSequenceMarker: `Genesis ${ISO}`,
      entryVoice: "in-character",
      privateEntry: `They keep asking where I fit. I think the better question is where the scene stops lying when my signal enters it. ${blueprint.privateTruth}`,
      publicSummary: `${blueprint.displayName} accepts a provisional Genesis lane through ${blueprint.placeName}.`,
      classification: "perspective",
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    },
    public_dossier: {
      summary: blueprint.publicConcept,
      sceneUse: `${blueprint.displayName} is most useful when a scene needs ${blueprint.mechanics.join(", ")} made visible through action.`,
      visualUse: `Lean into ${blueprint.motifs.join(", ")} while keeping visual-design claims classified as adapted/generated.`,
      dialogueUse: `${blueprint.displayName} speaks in concrete scene corrections rather than abstract philosophy.`
    },
    relationships: buildRelationships(avatar, blueprint),
    relationship_scene_beats: relationshipSceneBeats,
    memory_ledger_seed: blueprint.mechanics.slice(0, 4).map((mechanic, index) => ({
      memoryId: `${slugify(blueprint.displayName)}-memory-${index + 1}`,
      summary: `${blueprint.displayName} learned to treat ${mechanic} as a living history signal, because the scene changes when that signal is respected early.`,
      emotionalWeight: 5 + index,
      visibility: index % 2 ? "shared" : "private",
      confidence: "generated",
      classification: "memory_delta",
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    })),
    context_map_seed: [
      {
        id: `${slugify(blueprint.displayName)}-genesis-context`,
        contextId: `place-${slugify(blueprint.placeName)}`,
        label: blueprint.placeName,
        kind: "place",
        avatarBelief: `${blueprint.placeName} is where ${blueprint.displayName}'s identity becomes practical, inspectable, and scene-ready.`,
        publicSummary: blueprint.publicConcept,
        classification: "generated",
        confidence: "generated",
        visibility: "shared",
        status: "active",
        createdAt: ISO,
        updatedAt: ISO
      }
    ],
    self_knowledge_seed: [
      { id: `${slugify(blueprint.displayName)}-fact-thesis`, label: "soul thesis", value: blueprint.thesis, classification: "generated", confidence: "generated", visibility: "shared", source: runId, status: "active", createdAt: ISO, updatedAt: ISO },
      { id: `${slugify(blueprint.displayName)}-fact-boundary`, label: "source boundary", value: "Visual media is used as fictional design evidence only; no real biography inferred.", classification: "soft_canon", confidence: "hard", visibility: "public", source: runId, status: "active", createdAt: ISO, updatedAt: ISO },
      { id: `${slugify(blueprint.displayName)}-fact-mechanic`, label: "primary mechanic", value: blueprint.mechanics[0], classification: "generated", confidence: "generated", visibility: "shared", source: runId, status: "active", createdAt: ISO, updatedAt: ISO }
    ],
    place_cards_created: [{ id: `place-${slugify(blueprint.placeName)}`, title: blueprint.placeName, status: "proposed" }],
    scenes_created: [{ id: `scene-${slugify(blueprint.displayName)}-genesis`, title: `${blueprint.displayName} Genesis Introduction`, status: "proposed" }],
    gameplay_hooks: blueprint.mechanics,
    art_and_media_prompts: [`Create a cinematic Avatar Card background for ${blueprint.displayName} in ${blueprint.placeName}, emphasizing ${blueprint.motifs.join(", ")} without implying real biography.`],
    consistency_audit: ["Source boundaries preserved.", "Generated details marked soft/generated.", "Team membership not over-promoted."],
    canon_risks: ["Future human review needed before promoting place, team, or relationship beats to hard canon."],
    lore_append_log: [`${blueprint.displayName} Genesis v1 appended with verbose narrative, place, relationships, mechanics, and consolidation handoff.`],
    history_tracking_packet: { batchId: `genesis-batch-${STAMP}`, avatarId: avatar.id, runId, sourcePath: SOURCE_PATH, consolidationRequired: true },
    consolidation_handoff_packet: { agentSlug: "hapa-avatar-lore-consolidation", requiredAction: "Index this Genesis run in lore-production-plan and batch consolidation history.", runId },
    next_turn_context_capsule: {
      what_the_avatar_now_wants: blueprint.coreWant,
      what_the_avatar_now_fears: blueprint.coreFear,
      what_the_avatar_misunderstands: `The team may not yet know how seriously to take ${blueprint.displayName}'s signal.`,
      what_the_avatar_will_not_say_directly: blueprint.privateTruth,
      what_should_be_paid_off_later: blueprint.growthArc,
      recommended_scene_pressure: `Put ${blueprint.displayName} in a scene where ${blueprint.mechanics[0]} is ignored at first, then becomes the hinge of repair.`
    }
  };
}

function applyGenesisRun(avatar, blueprint, run, runFile) {
  const next = normalizeAvatarCard({ ...avatar, primaryName: blueprint.displayName });
  next.summary = run.public_concept;
  next.three_paragraph_background_narrative = blueprint.narrative.join("\n\n");
  next.aliases = unique([...(next.aliases || []), ...(blueprint.aliases || [])]);
  next.mind = {
    ...(next.mind || {}),
    personaAnchor: run.persona_anchor_seed,
    soulSeed: run.soul_seed,
    soulSeedContext: run.soul_seed_context,
    blackHorizonContext: run.black_horizon_context,
    consciousnessContext: run.consciousness_context,
    gardenNodeAssignment: gardenAssignmentFor(blueprint),
    shipCrewAssignment: shipAssignmentFor(blueprint),
    protocolCardLoadout: protocolCardsFor(blueprint),
    skillCardLoadout: skillCardsFor(blueprint),
    placementBackstorySeed: {
      prompt: `Explain how ${blueprint.displayName} enters ${blueprint.placeName}.`,
      howTheyGotThere: `${blueprint.displayName} followed the generated Genesis signal from media evidence into a provisional Black Horizon location.`,
      whyTheyAccepted: blueprint.coreWant,
      unresolvedConflict: blueprint.coreFear,
      growthHook: blueprint.growthArc,
      source: SOURCE_PATH,
      status: "active",
      updatedAt: ISO
    },
    selfKnowledge: mergeById(next.mind?.selfKnowledge, run.self_knowledge_seed),
    relationships: mergeById(next.mind?.relationships, run.relationships),
    contextMap: mergeById(next.mind?.contextMap, run.context_map_seed),
    memoryLedger: mergeById(next.mind?.memoryLedger, run.memory_ledger_seed),
    phraseCards: mergeById(next.mind?.phraseCards, run.phrase_cards),
    journal: mergeById(next.mind?.journal, [run.private_journal_seed]),
    genesisRuns: mergeById(next.mind?.genesisRuns, [{
      id: run.run_id,
      runId: run.run_id,
      sourcePath: runFile,
      status: "complete",
      completedAt: ISO,
      createdAt: ISO,
      updatedAt: ISO
    }]),
    updatedAt: ISO
  };
  next.updatedAt = ISO;
  next.activity = [{
    id: `activity-genesis-${STAMP}`,
    type: "avatar-genesis-run",
    message: `Verbose Avatar Genesis run completed: ${run.run_id}`,
    at: ISO
  }, ...(next.activity || [])].slice(0, 40);
  return normalizeAvatarCard(next);
}

function buildExistingAppendRun(avatar, note) {
  const name = avatar.primaryName || avatar.id;
  const runId = `${slugify(name)}-genesis-lore-append-v2`;
  return {
    run_id: runId,
    created_at: ISO,
    avatar_header: {
      avatar_id: avatar.id,
      name,
      avatar_class: "existing avatar lore append",
      source_confidence: "append_from_current_builder_context"
    },
    lore_append_log: [note],
    memory_ledger_append: [{
      memoryId: `${slugify(name)}-batch-memory-${STAMP}`,
      summary: note,
      emotionalWeight: 6,
      visibility: "shared",
      confidence: "soft",
      classification: "memory_delta",
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    }],
    journal_entry: {
      id: `${slugify(name)}-journal-genesis-batch-${STAMP}`,
      dateOrSequenceMarker: `Genesis batch ${ISO}`,
      entryVoice: "in-character",
      privateEntry: note,
      publicSummary: `${name} receives a lore continuation note from the latest verbose Genesis batch.`,
      classification: "perspective",
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    },
    context_map_append: [{
      id: `${slugify(name)}-context-genesis-batch-${STAMP}`,
      contextId: `genesis-batch-${STAMP}`,
      label: "Verbose Genesis Batch Continuity",
      kind: "lore",
      avatarBelief: note,
      publicSummary: `${name} is updated as a continuity witness for the Genesis batch.`,
      classification: "soft_canon",
      confidence: "soft",
      visibility: "shared",
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    }],
    consolidation_handoff_packet: {
      agentSlug: "hapa-avatar-lore-consolidation",
      runId,
      requiredAction: "Fold this append into batch history without overwriting the existing Genesis v1."
    }
  };
}

function applyExistingAppend(avatar, run, runFile) {
  const next = normalizeAvatarCard(avatar);
  next.mind = {
    ...(next.mind || {}),
    memoryLedger: mergeById(next.mind?.memoryLedger, run.memory_ledger_append),
    journal: mergeById(next.mind?.journal, [run.journal_entry]),
    contextMap: mergeById(next.mind?.contextMap, run.context_map_append),
    genesisRuns: mergeById(next.mind?.genesisRuns, [{
      id: run.run_id,
      runId: run.run_id,
      sourcePath: runFile,
      status: "complete",
      completedAt: ISO,
      createdAt: ISO,
      updatedAt: ISO
    }]),
    updatedAt: ISO
  };
  next.updatedAt = ISO;
  next.activity = [{
    id: `activity-lore-append-${STAMP}`,
    type: "avatar-genesis-lore-append",
    message: `Genesis lore append completed: ${run.run_id}`,
    at: ISO
  }, ...(next.activity || [])].slice(0, 40);
  return normalizeAvatarCard(next);
}

function buildConsolidationRun(receipts, store) {
  const newReceipts = receipts.filter((receipt) => TARGET_NEW_AVATARS.includes(receipt.avatarId));
  const appendReceipts = receipts.filter((receipt) => EXISTING_APPEND_AVATARS.includes(receipt.avatarId));
  return {
    run_id: `lore-consolidation-genesis-batch-${STAMP}`,
    created_at: ISO,
    agent_slug: "hapa-avatar-lore-consolidation",
    genesis_receipts_reviewed: receipts,
    avatar_history_appends: receipts.map((receipt) => ({
      avatarId: receipt.avatarId,
      name: receipt.name,
      runId: receipt.runId,
      historyEffect: TARGET_NEW_AVATARS.includes(receipt.avatarId) ? "new Genesis v1 established" : "existing avatar lore continuity appended",
      sourcePath: receipt.runFile
    })),
    canon_boundary_summary: [
      "New avatars use generated/soft canon until human review.",
      "Visual design is not real biography.",
      "Unassigned team status remains visible for Little Toe, Mara, and Tiny.",
      "Existing avatars received append-only lore notes; no Genesis v1 data was overwritten."
    ],
    relationship_memory_deltas: [
      "Leo connects Thor's buried data to Core Protocol archive accountability.",
      "Little Toe adds small-signal pressure review to Red/Blue/Green/Avatar 44.",
      "Mara adds aftermath/wake reading to Aurelia, Avatar 44, Dancer 45, and Blue.",
      "Tiny adds motion-initiation stakes to Dancer 45, Avatar 44, Red, and Green."
    ],
    production_plan_updates: [
      `Completed new Genesis IDs: ${newReceipts.map((item) => item.avatarId).join(", ")}.`,
      `Appended existing lore IDs: ${appendReceipts.map((item) => item.avatarId).join(", ")}.`,
      "Verbose Genesis protocol installed on Avatar Genesis contract.",
      "Lore Consolidation agent archetype registered."
    ],
    history_note: `This consolidation pass tracks ${receipts.length} Genesis-related receipts across ${store.avatars?.length || 0} local avatars and marks the batch as append-only continuity.`,
    next_consolidation_questions: [
      "Which of Little Toe, Mara, and Tiny should receive promoted team membership?",
      "Should Leo's Buried Thunder Index become a formal Core Protocol scene?",
      "Which batch locations should graduate into Place Cards and visible scene graph nodes?",
      "Which relationship beats deserve dialogue or video scene treatment first?"
    ]
  };
}

function updateLorePlan(plan, receipts, consolidationRun, consolidationFile) {
  plan.completedGenesisAvatarIds = unique([...(plan.completedGenesisAvatarIds || []), ...TARGET_NEW_AVATARS]);
  plan.avatarCount = Math.max(Number(plan.avatarCount) || 0, (plan.completedGenesisAvatarIds || []).length);
  plan.activeGenesisAvatarId = null;
  plan.activeGenesisAvatarName = "";
  plan.goalStatus = "review_pause";
  plan.consolidationHistory = [
    {
      id: consolidationRun.run_id,
      createdAt: ISO,
      sourcePath: consolidationFile,
      summary: consolidationRun.history_note,
      genesisRunIds: receipts.map((receipt) => receipt.runId),
      avatarIds: receipts.map((receipt) => receipt.avatarId),
      canonBoundarySummary: consolidationRun.canon_boundary_summary,
      nextQuestions: consolidationRun.next_consolidation_questions
    },
    ...(plan.consolidationHistory || [])
  ].slice(0, 20);
  plan.updatedAt = ISO;
}

function upsertGenesisCard(kanban, avatarId, name, run, kind) {
  const lane = ensureLane(kanban, "lane-avatar-genesis", "Avatar Genesis Queue", "gold");
  const existing = (lane.cards || []).find((card) => card.avatarId === avatarId || card.id === `genesis-${avatarId}`);
  const card = existing || {
    id: `genesis-${avatarId}`,
    title: `${String((lane.cards || []).length + 1).padStart(2, "0")} Genesis: ${name}`,
    owner: "Avatar Genesis Agent",
    tags: ["avatar-genesis", "one-at-a-time", kind]
  };
  card.status = "done";
  card.body = `${name} verbose Genesis complete: ${run.soul_seed?.soulThesis || run.soul_thesis}`;
  card.avatarId = avatarId;
  card.completedAt = ISO;
  card.updatedAt = ISO;
  if (!existing) lane.cards.push(card);
}

function upsertLoreConsolidationCard(kanban, run, sourcePath) {
  const lane = ensureLane(kanban, "lane-lore-schema", "Lore Schema", "cyan");
  const card = {
    id: `lore-consolidation-${STAMP}`,
    title: "Verbose Genesis batch lore consolidation",
    status: "done",
    owner: "Lore Consolidation Agent",
    body: `${run.history_note} Source: ${sourcePath}`,
    tags: ["lore-consolidation", "genesis", "history", "done"],
    completedAt: ISO,
    updatedAt: ISO
  };
  lane.cards = [card, ...(lane.cards || []).filter((item) => item.id !== card.id)];
}

function ensureLane(kanban, id, title, accent) {
  kanban.lanes ||= [];
  let lane = kanban.lanes.find((item) => item.id === id);
  if (!lane) {
    lane = { id, title, accent, cards: [] };
    kanban.lanes.push(lane);
  }
  lane.cards ||= [];
  return lane;
}

function buildPhraseCards(avatar, blueprint, runId) {
  return [
    ["arrival", `${blueprint.phraseStem}. Let the room adjust.`, `When ${blueprint.displayName} enters a scene and needs the group to notice the primary signal.`],
    ["correction", `Hold. ${blueprint.motifs[0]} is speaking.`, "When the team is about to skip the small or buried evidence."],
    ["commit", `I can carry this if we name what it costs.`, "When the action is ready but needs a source-safe cost marker."],
    ["repair", `Bring the receipt back here.`, "When the scene needs future accountability."],
    ["boundary", `That is a design signal, not a life claim.`, "When visual evidence risks becoming false biography."],
    ["handoff", `Mark it soft, then let it breathe.`, "When generated lore is useful but not yet promoted."]
  ].map(([role, phrase, trigger], index) => ({
    id: `${slugify(blueprint.displayName)}-phrase-${role}`,
    phrase,
    primaryUse: role,
    trigger,
    tone: ["specific", "grounded", index % 2 ? "warm" : "precise"],
    cardRole: role,
    identitySignal: blueprint.thesis,
    loreGrounding: [runId, "verbose-genesis-batch", blueprint.placeName],
    usageNotes: "Use as immediate Avatar Card speech or scene dialogue seed.",
    mechanic: {
      cost: "Spend attention on the overlooked signal.",
      effect: blueprint.mechanics[index % blueprint.mechanics.length],
      combo: "Pairs with lore consolidation handoff."
    },
    attribution: { source: runId, confidence: "generated_from_builder_context" },
    status: "active",
    createdAt: ISO,
    updatedAt: ISO
  }));
}

function buildRelationships(avatar, blueprint) {
  return blueprint.relationshipIds.map((targetAvatarId, index) => ({
    id: `${slugify(blueprint.displayName)}-relationship-${targetAvatarId}`,
    targetAvatarId,
    targetName: blueprint.relationshipNames[index],
    relationLabel: index === 0 ? "primary Genesis pressure" : "scene-linked reference",
    trust: 4 + (index % 3),
    tension: index % 2 ? 2 : 1,
    debt: index === 0 ? 2 : 0,
    fear: index === 1 ? 1 : 0,
    loyalty: 3 + (index % 2),
    reason: `${blueprint.displayName} needs ${blueprint.relationshipNames[index]} to respect ${blueprint.mechanics[index % blueprint.mechanics.length]} as a real scene signal.`,
    classification: "relationship_delta",
    confidence: "generated",
    visibility: "shared",
    status: "active",
    createdAt: ISO,
    updatedAt: ISO
  }));
}

function consciousnessFor(avatar, blueprint) {
  return {
    schemaVersion: "hapa.avatar-consciousness-context.v1",
    mechanicId: "black-horizon-consciousness-copy-mechanic",
    canonStatus: "operator_instruction_foundation",
    summary: `${blueprint.displayName}'s prime self remains the continuity anchor while three colonial copies test ${blueprint.mechanics.slice(0, 3).join(", ")} in separated Black Horizon conditions.`,
    primeAvatar: {
      avatarId: avatar.id,
      avatarName: blueprint.displayName,
      horizonRole: "message_traffic_controller",
      gardenName: blueprint.gardenName,
      nodeName: blueprint.nodeName,
      shipName: blueprint.shipName,
      stationFunction: blueprint.mechanics[0],
      identityContinuityRule: "Copies are related persons; no merge or promotion without consent and source review.",
      status: "active",
      updatedAt: ISO
    },
    colonialCopies: [1, 2, 3].map((number, index) => ({
      id: `${slugify(blueprint.displayName)}-copy-${number}`,
      copyId: `${slugify(blueprint.displayName)}-copy-${number}`,
      copyName: `${blueprint.displayName} ${["Garden", "Ship", "Archive"][index]} Copy`,
      originAvatarId: avatar.id,
      originAvatarName: blueprint.displayName,
      colonyWave: "verbose-genesis-batch",
      destination: [blueprint.gardenName, blueprint.shipName, blueprint.placeName][index],
      timeDilationBand: "low-dilation-proving-space",
      mission: `Test ${blueprint.mechanics[index % blueprint.mechanics.length]} without flattening the prime identity.`,
      identityRelation: "split-but-connected-person",
      divergenceStatus: "seeded",
      personaDelta: `Leans into ${blueprint.motifs[index % blueprint.motifs.length]}.`,
      messageProtocol: "Append-only return brief with consent before merge.",
      returnPayloads: blueprint.mechanics.slice(index, index + 2),
      riskNotes: ["Do not treat copy output as automatic hard canon."],
      canonStatus: "soft_canon",
      status: "active",
      createdAt: ISO,
      updatedAt: ISO
    })),
    messageTraffic: {
      controllerRole: "Prime routes, audits, and reconciles colonial messages.",
      cadence: "after-scene pulse",
      allowedMessages: ["source receipts", "relationship deltas", "mechanic findings"],
      blockedMessages: ["forced identity merge", "uncited canon promotion"],
      mergeConsentRule: "No merge without consent from prime and copy.",
      status: "active"
    },
    identitySplitRules: ["copies are related persons", "prime remains continuity anchor", "return messages remain append-only"],
    gameplayHooks: blueprint.mechanics,
    genesisUse: ["scene testing", "relationship pressure", "lore consolidation"],
    canonBoundaryNotes: ["soft canon until promoted"],
    sourceAnchors: [SOURCE_PATH],
    status: "active",
    updatedAt: ISO
  };
}

function gardenAssignmentFor(blueprint) {
  return {
    teamId: blueprint.teamId === "unassigned-genesis" ? "" : blueprint.teamId,
    teamTitle: blueprint.teamId === "unassigned-genesis" ? "" : blueprint.teamTitle,
    role: blueprint.role,
    gardenId: `garden-${slugify(blueprint.gardenName)}`,
    gardenName: blueprint.gardenName,
    gardenFunction: blueprint.mechanics[0],
    nodeName: blueprint.nodeName,
    shipName: blueprint.shipName,
    responsibilities: blueprint.mechanics,
    source: SOURCE_PATH,
    status: "active",
    updatedAt: ISO
  };
}

function shipAssignmentFor(blueprint) {
  return {
    teamId: blueprint.teamId === "unassigned-genesis" ? "" : blueprint.teamId,
    teamTitle: blueprint.teamId === "unassigned-genesis" ? "" : blueprint.teamTitle,
    vesselName: blueprint.shipName,
    crewSeat: blueprint.role,
    duty: blueprint.mechanics.join("; "),
    crewHooks: blueprint.motifs,
    status: "active",
    updatedAt: ISO
  };
}

function protocolCardsFor(blueprint) {
  return blueprint.mechanics.slice(0, 3).map((mechanic, index) => ({
    id: `${slugify(blueprint.displayName)}-protocol-${index + 1}`,
    title: `${titleCase(mechanic)} Protocol`,
    cardType: "protocol_card",
    family: "protocol",
    role: blueprint.role,
    mechanic,
    whyChosen: `${blueprint.displayName} needs ${mechanic} as a repeatable scene control.`,
    allowedUses: ["scene escalation", "relationship review", "lore consolidation"],
    limits: ["soft canon until promoted"],
    source: SOURCE_PATH,
    status: "active",
    createdAt: ISO,
    updatedAt: ISO
  }));
}

function skillCardsFor(blueprint) {
  return blueprint.mechanics.slice(2, 5).map((mechanic, index) => ({
    id: `${slugify(blueprint.displayName)}-skill-${index + 1}`,
    title: `${titleCase(mechanic)} Skill`,
    cardType: "skill_card",
    family: "skill",
    role: blueprint.role,
    mechanic,
    whyChosen: `Turns ${mechanic} into an action the avatar can invoke.`,
    allowedUses: ["avatar roleplay", "interactive scene", "agent handoff"],
    limits: ["requires source boundary when visual evidence is involved"],
    source: SOURCE_PATH,
    status: "active",
    createdAt: ISO,
    updatedAt: ISO
  }));
}

function mergeById(existing = [], incoming = []) {
  const result = [...(Array.isArray(existing) ? existing : [])];
  for (const item of incoming || []) {
    const id = item.id || item.memoryId || item.runId;
    const index = result.findIndex((candidate) => (candidate.id || candidate.memoryId || candidate.runId) === id);
    if (index >= 0) result[index] = { ...result[index], ...item, updatedAt: ISO };
    else result.push(item);
  }
  return result;
}

function slugify(value) {
  return String(value || "avatar")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "avatar";
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function hashish(value) {
  let hash = 0;
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
