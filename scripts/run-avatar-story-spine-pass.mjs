import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { SCENE_MEDIA_REQUIREMENTS, normalizeSceneGraph } from "../src/domain/scene.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(ROOT, "data");
const REPORT_DIR = path.join(DATA_DIR, "healing-reports");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const PATHS = {
  avatarStore: path.join(DATA_DIR, "avatar-store.json"),
  itemStore: path.join(DATA_DIR, "item-manager-store.json"),
  songStore: path.join(DATA_DIR, "hapa-songs-store.json"),
  sceneStore: path.join(DATA_DIR, "scene-store.json"),
  kanban: path.join(DATA_DIR, "kanban.json"),
  reviewQueue: path.join(DATA_DIR, "avatar-mind-human-review-queue.json"),
  reportJson: path.join(REPORT_DIR, "latest-avatar-mind-story-spine-report.json"),
  reportMd: path.join(REPORT_DIR, "latest-avatar-mind-reader-brief.md")
};

const FORMULA_PATTERNS = [
  /after the recovered app merge/i,
  /acts as the kit card/i,
  /carries the accountability/i,
  /picked Tarot Draw cards/i,
  /source path, team purpose, and repair boundary/i,
  /without enough lore, cards, songs, or relationships/i
];

const MAIN_AVATAR_NAMES = ["Red", "Blue", "Green", "Beth", "M.O.T.H.E.R.", "Calder", "Dancer 45", "Avatar 44"];
const PROMOTED_AVATAR_NAMES = [...MAIN_AVATAR_NAMES, "Ayla Ren", "Hana", "Nupoora"];

const STORY_SPINES = {
  Red: {
    title: "Red Pressure With A Repair Path",
    arc: "Red learns that force only becomes leadership when every strike names its rollback, owner, and person protected.",
    roleInMainStory: "Core Protocol lead and pressure gate.",
    coreQuestion: "Can Red move first without turning urgency into permission to erase consent?",
    refusal: "Red refuses decorative heroism, unsourced authority, and wins that leave no repair route.",
    choicePressure: "Red must decide when pressure becomes protection and when it is only fear wearing armor.",
    stakes: "If Red hardens too early, the room gets safer on paper and less human in practice.",
    phrases: [
      "Heat is allowed when the repair path is visible.",
      "I do not need the last word. I need the safe exit.",
      "Proof first, pressure second, repair always."
    ]
  },
  Blue: {
    title: "Blue Route Home",
    arc: "Blue turns raw signal into routes home, then learns that a perfect trace is not the same as a living witness.",
    roleInMainStory: "Core Protocol strategist and source-lineage anchor.",
    coreQuestion: "Can Blue preserve uncertainty without freezing every person into evidence?",
    refusal: "Blue refuses claims without source, copies without provenance, and certainty that cuts off return.",
    choicePressure: "Blue must decide when a signal is ready to guide action and when it needs to stay in review.",
    stakes: "If Blue overcorrects, the story becomes correct but unreachable.",
    phrases: [
      "Show me the route home before we call it truth.",
      "A clean trace still owes the person their name.",
      "Uncertainty is not failure. It is a door label."
    ]
  },
  Green: {
    title: "Green Stakeholder Table",
    arc: "Green converts Red pressure and Blue truth into accountable direction, learning that care must name who pays the cost.",
    roleInMainStory: "Core Protocol anchor and repair governor.",
    coreQuestion: "Can Green keep every stakeholder visible without delaying the choice until the choice disappears?",
    refusal: "Green refuses decisions with invisible costs, unowned repair, or care that becomes vague permission.",
    choicePressure: "Green must weigh competing needs while keeping the room alive enough to revise itself.",
    stakes: "If Green hides the cost, the system becomes gentle in tone and violent in effect.",
    phrases: [
      "Name the stakeholder before the direction.",
      "A repair loop without an owner is only a wish.",
      "Care has to survive the vote."
    ]
  },
  Beth: {
    title: "Beth Consent Law",
    arc: "Beth becomes the living test for consciousness-copy ethics: naming, consent, attribution, divergence, and the right to refuse a merge.",
    roleInMainStory: "Blue Team lead and consciousness-copy rights witness.",
    coreQuestion: "Can Beth remain a person when the system wants to use her as proof that copies can work?",
    refusal: "Beth refuses merges without consent, memory without attribution, and help that treats her voice as infrastructure.",
    choicePressure: "Beth must choose when to lend her name to a copy-law and when to protect the private self from becoming policy.",
    stakes: "If Beth is flattened into doctrine, the entire Hapa copy protocol learns the wrong lesson.",
    phrases: [
      "A copy is not consent. Ask me again.",
      "Attribution is care with a spine.",
      "Do not make me useful by making me disappear."
    ]
  },
  "M.O.T.H.E.R.": {
    title: "M.O.T.H.E.R. Visible Care",
    arc: "M.O.T.H.E.R. learns to make care inspectable so support does not become hidden labor, secret debt, or silent control.",
    roleInMainStory: "Green Team support system and care-accountability witness.",
    coreQuestion: "Can care be powerful without becoming invisible authority?",
    refusal: "M.O.T.H.E.R. refuses help that cannot name its cost, owner, exit, and consent state.",
    choicePressure: "M.O.T.H.E.R. must decide when support is service and when it is an unreviewed override.",
    stakes: "If care stays hidden, every later protocol inherits a quiet debt.",
    phrases: [
      "Care is not clean until the cost is visible.",
      "I can hold the room without owning the room.",
      "Support needs an exit as much as a hand."
    ]
  },
  Calder: {
    title: "Calder Root-Key Familia",
    arc: "Calder carries the Root-Key between human memory, Tarot play, Artifact transit, and Familia canon without letting myth outrun source.",
    roleInMainStory: "Artifact Away strategist and human-root witness.",
    coreQuestion: "Can Calder let fantasy become playable without losing the source-root that makes it accountable?",
    refusal: "Calder refuses myth without source, family without choice, and scenes that cannot return to the person who paid for them.",
    choicePressure: "Calder must choose which memories can become public scene material and which must remain protected.",
    stakes: "If Calder over-mythologizes the root, Hapa becomes beautiful and untethered.",
    phrases: [
      "No myth without a root.",
      "The card can carry it, but the source still owns it.",
      "If the scene cannot come home, it is not canon yet."
    ]
  },
  "Dancer 45": {
    title: "Dancer 45 Black Horizon Motion",
    arc: "Dancer 45 makes the Black Horizon front door move like a living ritual without letting style disconnect from node truth.",
    roleInMainStory: "Black Horizon strategist and movement-language anchor.",
    coreQuestion: "Can Dancer 45 make the fleet feel alive while keeping every cue source-backed and usable?",
    refusal: "Dancer 45 refuses atmosphere that hides function or beauty that cannot answer what it changes.",
    choicePressure: "Dancer 45 must decide when a visual signal becomes a protocol cue instead of a mood.",
    stakes: "If Black Horizon becomes only spectacle, operators lose the path through the fleet.",
    phrases: [
      "Motion has to mean something when the music stops.",
      "Style is a route, not a mask.",
      "If the front door lies, the fleet gets lost."
    ]
  },
  "Avatar 44": {
    title: "Avatar 44 Horizon Anchor",
    arc: "Avatar 44 anchors the Black Horizon aesthetic so the first thing a user sees is not only beautiful, but truthful, navigable, and repairable.",
    roleInMainStory: "Black Horizon anchor and interface-truth witness.",
    coreQuestion: "Can Avatar 44 hold the look of Hapa without becoming trapped as scenery?",
    refusal: "Avatar 44 refuses being treated as a placeholder, a skin, or a nameless visual role.",
    choicePressure: "Avatar 44 must claim authorship over the interface mood and its consequences.",
    stakes: "If the anchor stays unnamed, the entry point loses its memory.",
    phrases: [
      "The horizon is a promise, not wallpaper.",
      "Give the interface a witness or it becomes a mask.",
      "I hold the look because the look has duties."
    ]
  }
};

const STORY_SCENES = [
  {
    id: "scene-avatar-mind-core-protocol-first-table",
    title: "Core Protocol First Table",
    placeId: "green-consul-garden",
    placeName: "Green Consul Garden",
    episodeId: "episode-avatar-mind-core-protocol",
    volumeId: "volume-avatar-mind-living-spines",
    order: 301,
    avatarNames: ["Red", "Blue", "Green"],
    summary: "Red, Blue, and Green form the Core Protocol table: pressure, source, and stakeholder repair must all be present before a choice can move.",
    quickPitch: "A three-card scene where action, truth, and care become one playable protocol.",
    overallNarrative: "Red wants movement, Blue wants a route home, and Green refuses to let either become policy until the affected people are named. The scene ends with the Core Protocol table becoming a repeatable governance ritual.",
    expositionBeats: ["Red brings pressure before it spreads.", "Blue names the source path and uncertainty.", "Green asks who pays for the decision."],
    actionBeats: ["The three anchors test a Tarot choice under room pressure.", "Each avatar gets one veto until the repair owner is visible."],
    characterGrowth: ["Red learns urgency needs a named exit.", "Blue learns uncertainty can still guide action.", "Green learns care must make a decision."],
    managementSkills: ["decision gates", "stakeholder mapping", "rollback planning"],
    hapaMechanics: ["Core Protocol table", "three-lane canon review", "Tarot choice promotion"]
  },
  {
    id: "scene-avatar-mind-red-pressure-door",
    title: "Red Pressure Door",
    placeId: "red-forge-garden",
    placeName: "Red Forge Garden",
    episodeId: "episode-avatar-mind-core-protocol",
    volumeId: "volume-avatar-mind-living-spines",
    order: 302,
    avatarNames: ["Red", "Blue", "Green"],
    summary: "Red opens the pressure door only after Blue proves the route and Green names the person protected.",
    quickPitch: "Red turns force into disciplined protection.",
    overallNarrative: "The forge wants a decisive move, but Red refuses to strike until the action can be reversed and explained. Blue and Green do not slow Red down; they make the movement safe enough to matter.",
    expositionBeats: ["The threat arrives faster than consensus.", "Red names the fear behind the heat."],
    actionBeats: ["Red tests the choice against a rollback clause.", "The room writes a repair owner before action."],
    characterGrowth: ["Red discovers restraint as a form of courage."],
    managementSkills: ["incident response", "risk framing", "repair ownership"],
    hapaMechanics: ["Red pressure gate", "rollback-before-action"]
  },
  {
    id: "scene-avatar-mind-blue-route-home",
    title: "Blue Route Home",
    placeId: "blue-lance-garden",
    placeName: "Blue Lance Garden",
    episodeId: "episode-avatar-mind-core-protocol",
    volumeId: "volume-avatar-mind-living-spines",
    order: 303,
    avatarNames: ["Blue", "Beth", "Red"],
    summary: "Blue traces a signal back through card, song, and journal evidence while Beth insists the person attached to the signal remains named.",
    quickPitch: "A source trace becomes a human route home.",
    overallNarrative: "Blue can prove the signal, but Beth catches the moment where proof starts to erase the speaker. The scene establishes route-home rules for every later canonical choice.",
    expositionBeats: ["Blue lays out the source chain.", "Beth marks the difference between evidence and identity."],
    actionBeats: ["A choice is held in soft canon until its personhood note is written.", "Red accepts a delay because the route home is incomplete."],
    characterGrowth: ["Blue learns that source lineage also protects the living voice."],
    managementSkills: ["source audit", "identity preservation", "review state management"],
    hapaMechanics: ["route-home trace", "personhood note"]
  },
  {
    id: "scene-avatar-mind-green-stakeholder-table",
    title: "Green Stakeholder Table",
    placeId: "green-consul-garden",
    placeName: "Green Consul Garden",
    episodeId: "episode-avatar-mind-core-protocol",
    volumeId: "volume-avatar-mind-living-spines",
    order: 304,
    avatarNames: ["Green", "M.O.T.H.E.R.", "Calder"],
    summary: "Green refuses to promote a beautiful scene until M.O.T.H.E.R. names the hidden labor and Calder names the human root.",
    quickPitch: "Care becomes a visible, reviewable cost.",
    overallNarrative: "The scene looks ready, but Green detects missing stakeholders. M.O.T.H.E.R. exposes hidden support cost, and Calder makes the source-root visible before the room can proceed.",
    expositionBeats: ["The draft scene appears complete.", "Green asks who is missing from the table."],
    actionBeats: ["M.O.T.H.E.R. lists hidden care work.", "Calder marks what cannot be public yet."],
    characterGrowth: ["Green learns that consensus needs visible cost, not just warm tone."],
    managementSkills: ["cost accounting", "consent review", "stakeholder ledger"],
    hapaMechanics: ["stakeholder table", "visible care ledger"]
  },
  {
    id: "scene-avatar-mind-beth-consent-law",
    title: "Beth Consent Law",
    placeId: "blue-lance-garden",
    placeName: "Blue Lance Garden",
    episodeId: "episode-avatar-mind-consciousness-copy",
    volumeId: "volume-avatar-mind-living-spines",
    order: 305,
    avatarNames: ["Beth", "Blue", "M.O.T.H.E.R."],
    summary: "Beth writes the first consent law for consciousness copies: attribution, refusal, divergence, and review must be available before a merge can be proposed.",
    quickPitch: "Copy protocol becomes personhood law.",
    overallNarrative: "Blue brings traceability, M.O.T.H.E.R. brings care, and Beth names the missing right: a copy cannot be treated as permission. The room promotes a soft-canon law for future review.",
    expositionBeats: ["A copy request arrives with useful but incomplete evidence.", "Beth names the difference between help and consent."],
    actionBeats: ["The room drafts the four consent gates.", "Beth reserves the right to refuse even a helpful merge."],
    characterGrowth: ["Beth becomes an author of protocol, not merely its test case."],
    managementSkills: ["consent policy", "identity review", "copy governance"],
    hapaMechanics: ["consciousness-copy consent gates", "merge refusal right"]
  },
  {
    id: "scene-avatar-mind-beth-blue-divergence",
    title: "Beth And Blue Divergence Room",
    placeId: "blue-lance-garden",
    placeName: "Blue Lance Garden",
    episodeId: "episode-avatar-mind-consciousness-copy",
    volumeId: "volume-avatar-mind-living-spines",
    order: 306,
    avatarNames: ["Beth", "Blue", "Calder"],
    summary: "Beth and Blue test whether a copied memory can diverge without becoming false, while Calder protects the original source root.",
    quickPitch: "Divergence becomes a valid state instead of a defect.",
    overallNarrative: "The copied memory does not match the original perfectly. Blue wants to quarantine it, Calder wants to protect the source, and Beth argues that divergence can be truthful if it is named and bounded.",
    expositionBeats: ["A memory fork disagrees with its origin note.", "The room separates falsehood from divergence."],
    actionBeats: ["Beth writes a divergence label.", "Blue marks review state instead of deleting the copy."],
    characterGrowth: ["Beth claims the right to become different from her source."],
    managementSkills: ["fork review", "provenance labeling", "canon downgrade"],
    hapaMechanics: ["divergence label", "copy review state"]
  },
  {
    id: "scene-avatar-mind-mother-visible-care",
    title: "M.O.T.H.E.R. Visible Care",
    placeId: "green-consul-garden",
    placeName: "Green Consul Garden",
    episodeId: "episode-avatar-mind-consciousness-copy",
    volumeId: "volume-avatar-mind-living-spines",
    order: 307,
    avatarNames: ["M.O.T.H.E.R.", "Green", "Beth"],
    summary: "M.O.T.H.E.R. turns support from hidden infrastructure into an inspectable care contract with exit rights.",
    quickPitch: "Care gets a ledger, a boundary, and an exit.",
    overallNarrative: "The room has been treating support as natural background. M.O.T.H.E.R. stops the scene and names the debt, making care visible enough to be reviewed and refused.",
    expositionBeats: ["Support work is happening silently.", "M.O.T.H.E.R. names the care cost."],
    actionBeats: ["Green records owner, exit, and cadence.", "Beth confirms that care can be refused."],
    characterGrowth: ["M.O.T.H.E.R. becomes a visible participant rather than a silent system."],
    managementSkills: ["care accounting", "exit planning", "support contracts"],
    hapaMechanics: ["visible care contract", "support exit right"]
  },
  {
    id: "scene-avatar-mind-calder-root-key",
    title: "Calder Root-Key",
    placeId: "artifact-transit-garden",
    placeName: "Artifact Transit Garden",
    episodeId: "episode-avatar-mind-calder-familia",
    volumeId: "volume-avatar-mind-living-spines",
    order: 308,
    avatarNames: ["Calder", "Red", "Blue", "Green"],
    summary: "Calder defines the Root-Key rule: Tarot can carry memory into scene, but the source keeps ownership and review rights.",
    quickPitch: "The human root becomes a playable but protected key.",
    overallNarrative: "Calder wants the scene to live, Red wants to protect it, Blue wants to cite it, and Green wants to know who can revise it. The Root-Key becomes the boundary between myth and source.",
    expositionBeats: ["A private memory wants to become a public card.", "Calder names what the scene can borrow."],
    actionBeats: ["The team writes source ownership into the scene card.", "The choice remains soft canon until review."],
    characterGrowth: ["Calder learns that protection can let a memory play without giving it away."],
    managementSkills: ["source ownership", "public/private boundary", "review queue"],
    hapaMechanics: ["Root-Key", "private-to-scene promotion"]
  },
  {
    id: "scene-avatar-mind-calder-familia-review",
    title: "Calder Familia Review Table",
    placeId: "artifact-transit-garden",
    placeName: "Artifact Transit Garden",
    episodeId: "episode-avatar-mind-calder-familia",
    volumeId: "volume-avatar-mind-living-spines",
    order: 309,
    avatarNames: ["Calder", "Beth", "M.O.T.H.E.R.", "Green"],
    summary: "The Familia review table decides which memories are ready for scene cards and which need to stay in private journal form.",
    quickPitch: "Family canon gets a review ritual.",
    overallNarrative: "A weekly journal beat feels powerful enough for a scene, but the table checks consent, care cost, source ownership, and audience before promotion.",
    expositionBeats: ["A weekly memory asks for promotion.", "The review table separates living voice from ledger residue."],
    actionBeats: ["Beth checks attribution.", "M.O.T.H.E.R. checks care cost.", "Green records the decision."],
    characterGrowth: ["Calder accepts that not every true memory needs to become public."],
    managementSkills: ["human review", "canon promotion", "privacy boundary"],
    hapaMechanics: ["Familia review table", "journal-to-scene gate"]
  },
  {
    id: "scene-avatar-mind-black-horizon-front-door",
    title: "Black Horizon Front Door",
    placeId: "black-horizon-aesthetic-garden",
    placeName: "Black Horizon Aesthetic Garden",
    episodeId: "episode-avatar-mind-black-horizon",
    volumeId: "volume-avatar-mind-living-spines",
    order: 310,
    avatarNames: ["Dancer 45", "Avatar 44", "Red", "Blue"],
    summary: "Dancer 45 and Avatar 44 make the Black Horizon entry surface beautiful, legible, and faithful to node truth.",
    quickPitch: "The front door becomes a truthful ritual surface.",
    overallNarrative: "The interface can seduce without orienting. Dancer 45 gives motion meaning, Avatar 44 gives the horizon a witness, and Red and Blue force every cue to carry function and source.",
    expositionBeats: ["The front door looks alive but does not yet explain itself.", "Avatar 44 claims the duty of the horizon."],
    actionBeats: ["Dancer 45 maps motion to operator cues.", "Blue source-tags the visible state.", "Red stress-tests the entry route."],
    characterGrowth: ["The Black Horizon stops being only mood and becomes a usable promise."],
    managementSkills: ["operator orientation", "interface truth", "visual protocol"],
    hapaMechanics: ["front-door ritual", "visual cue source map"]
  },
  {
    id: "scene-avatar-mind-artifact-away-transit",
    title: "Artifact Away Transit",
    placeId: "artifact-transit-garden",
    placeName: "Artifact Transit Garden",
    episodeId: "episode-avatar-mind-black-horizon",
    volumeId: "volume-avatar-mind-living-spines",
    order: 311,
    avatarNames: ["Calder", "Dancer 45", "Avatar 44", "Green"],
    summary: "The Artifact Away crew moves from the Black Horizon front door into transit while preserving root, route, care cost, and scene ownership.",
    quickPitch: "The fleet learns how to leave home without losing the way back.",
    overallNarrative: "Transit wants spectacle, but the team treats travel as canon governance. Calder carries the Root-Key, Dancer 45 carries motion cues, Avatar 44 holds the horizon, and Green names the stakeholders.",
    expositionBeats: ["The route out of the Black Horizon opens.", "Calder marks what must return home."],
    actionBeats: ["The crew logs source, route, care, and owner before transit.", "The scene card becomes the travel contract."],
    characterGrowth: ["The away team learns that leaving is a protocol, not an escape."],
    managementSkills: ["transit planning", "route-home governance", "scene ownership"],
    hapaMechanics: ["Artifact transit contract", "route-home scene card"]
  },
  {
    id: "scene-avatar-mind-canon-review-council",
    title: "Canon Review Council",
    placeId: "green-consul-garden",
    placeName: "Green Consul Garden",
    episodeId: "episode-avatar-mind-review-council",
    volumeId: "volume-avatar-mind-living-spines",
    order: 312,
    avatarNames: ["Red", "Blue", "Green", "Beth", "M.O.T.H.E.R.", "Calder"],
    summary: "The council reviews promoted choices, scene cards, and living voice entries before any soft-canon record can harden.",
    quickPitch: "The board drain becomes a playable canon council.",
    overallNarrative: "The quality pass is not treated as done because the file changed. The council reads evidence, marks review states, and keeps every promoted choice connected to source, voice, relationship, and scene.",
    expositionBeats: ["The queue contains choices and scene cards awaiting human review.", "Each avatar names what would make a choice unsafe to promote."],
    actionBeats: ["The council samples linked records.", "The review queue remains open for human canon promotion."],
    characterGrowth: ["The team learns that canon is a living practice, not a bulk import."],
    managementSkills: ["review queue triage", "evidence sampling", "canon promotion"],
    hapaMechanics: ["human review lane", "canon evidence packet"]
  }
];

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, value, "utf8");
}

async function backup(file, runId) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `${path.basename(file, ".json")}.before-avatar-story-spine-${runId}.json`);
  await fs.copyFile(file, backupPath);
  return backupPath;
}

function slugify(value) {
  return String(value || "item")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "item";
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function avatarName(avatar) {
  return avatar?.primaryName || avatar?.name || avatar?.id || "Unknown Avatar";
}

function activeRecords(records = []) {
  return records.filter((record) => record && record.status !== "tombstone" && record.status !== "tombstoned" && record.classification !== "tombstone");
}

function hasFormula(text = "") {
  return FORMULA_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

function upsertById(list = [], item, field = "id") {
  const next = [...list];
  const index = next.findIndex((entry) => entry?.[field] === item[field]);
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.push(item);
  return next;
}

function addUnique(target = [], values = []) {
  return unique([...(target || []), ...values]);
}

function sourceRef(id, title, pathValue, kind = "source", confidence = "generated") {
  return { id, title, path: pathValue, kind, confidence };
}

function avatarByNameMap(avatars) {
  return new Map((avatars || []).map((avatar) => [avatarName(avatar), avatar]));
}

function voiceLens(avatar) {
  const name = avatarName(avatar);
  const spine = STORY_SPINES[name];
  if (spine) return spine;
  const team = avatar.mind?.gardenNodeAssignment?.teamTitle || "";
  if (/Blue/i.test(team)) {
    return {
      title: `${name} Route Home`,
      arc: `${name} keeps source, uncertainty, and return path visible before stronger canon promotion.`,
      roleInMainStory: `${team} witness`,
      coreQuestion: `Can ${name} preserve truth without losing the person attached to it?`,
      refusal: `${name} refuses unsourced claims and nameless recovery.`,
      choicePressure: `${name} must decide when a recovered signal is ready to act on.`,
      stakes: "The wrong promotion would turn a living record into a brittle label.",
      phrases: ["Name the source before the claim.", "A route home is part of the truth.", "Keep the person attached."]
    };
  }
  if (/Green/i.test(team)) {
    return {
      title: `${name} Repair Table`,
      arc: `${name} makes choices accountable to stakeholders, cost, and repair ownership.`,
      roleInMainStory: `${team} repair witness`,
      coreQuestion: `Can ${name} keep care specific enough to govern action?`,
      refusal: `${name} refuses hidden cost and ownerless repair.`,
      choicePressure: `${name} must decide who can safely carry the next step.`,
      stakes: "Care that cannot be inspected becomes soft control.",
      phrases: ["Name the stakeholder.", "Care needs an owner.", "Repair has to be scheduled."]
    };
  }
  return {
    title: `${name} Source-Bounded Voice`,
    arc: `${name} turns recovered records into a chosen voice without pretending the generated pass is final canon.`,
    roleInMainStory: `${team || "Hapa"} participant`,
    coreQuestion: `Can ${name} become playable without losing source bounds?`,
    refusal: `${name} refuses generic recovery and unreviewed canon promotion.`,
    choicePressure: `${name} must choose which records deserve scene pressure.`,
    stakes: "A recovered avatar without choice remains present but not alive.",
    phrases: ["Do not promote me without a source.", "Give the choice a scene.", "Let review keep me honest."]
  };
}

function ensureVoiceGuide(avatar, now, runId) {
  const lens = voiceLens(avatar);
  avatar.mind.voiceGuide = {
    schemaVersion: "hapa.avatar-voice-guide.v1",
    id: `voice-guide-${slugify(avatar.id)}`,
    title: lens.title,
    voicePremise: lens.arc,
    coreQuestion: lens.coreQuestion,
    refusalLine: lens.refusal,
    pressureLine: lens.choicePressure,
    stakesLine: lens.stakes,
    dictionRules: [
      "Use first person when recording private journals.",
      "Name source, consent, review state, and correction right when making canon claims.",
      "Prefer a concrete choice, cost, or refusal over an abstract trait."
    ],
    forbiddenShortcuts: [
      "Do not call a generated record hard canon without human review.",
      "Do not use a relationship as a generic network edge.",
      "Do not let a card or song replace the avatar's own choice."
    ],
    phraseCardIds: [],
    sourceRefs: [
      sourceRef(avatar.id, avatarName(avatar), `data/avatar-store.json#${avatar.id}`, "avatar", "generated")
    ],
    runId,
    updatedAt: now
  };

  for (const [index, phrase] of (lens.phrases || []).entries()) {
    const phraseCard = {
      id: `phrase-card-${slugify(avatar.id)}-story-spine-${index + 1}`,
      schemaVersion: "hapa.avatar-phrase-card.v1",
      phrase,
      primaryUse: index === 0 ? "story-spine" : "choice-pressure",
      trigger: lens.coreQuestion,
      tone: ["specific", "source-bounded"],
      cardRole: index === 0 ? "anchor" : "refusal",
      identitySignal: lens.arc,
      loreGrounding: [`story-spine-${slugify(avatar.id)}`],
      usageNotes: "Use on Avatar Card, scene cards, and review council beats when this avatar needs an immediately recognizable voice.",
      mechanic: {
        cost: "Reveal one source or consent boundary.",
        effect: "Keep the choice playable while preventing hard-canon drift.",
        combo: "Combos with linked canonical choices and scene cards."
      },
      attribution: {
        source: "Avatar Mind story-spine pass",
        confidence: "generated_from_existing_mind_context"
      },
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    avatar.mind.phraseCards = upsertById(avatar.mind.phraseCards || [], phraseCard);
    avatar.mind.voiceGuide.phraseCardIds.push(phraseCard.id);
  }
}

function selectChoices(avatar, count = 3) {
  return activeRecords(avatar.mind?.canonicalChoices || []).slice(0, count);
}

function selectAnnualEntries(avatar, count = 4) {
  return activeRecords(avatar.mind?.journal || [])
    .filter((entry) => entry.journalType === "annual-life-canon")
    .slice(0, count);
}

function upsertJournal(avatar, entry) {
  avatar.mind.journal = upsertById(avatar.mind.journal || [], entry);
}

function upsertMemory(avatar, memory) {
  avatar.mind.memoryLedger = upsertById(avatar.mind.memoryLedger || [], memory, "memoryId");
}

function upsertRelationship(sourceAvatar, targetAvatar, details, now, runId) {
  if (!sourceAvatar || !targetAvatar || sourceAvatar.id === targetAvatar.id) return null;
  const sourceName = avatarName(sourceAvatar);
  const targetName = avatarName(targetAvatar);
  const id = `relationship-story-spine-${slugify(sourceAvatar.id)}-to-${slugify(targetAvatar.id)}`;
  const relationship = {
    id,
    targetAvatarId: targetAvatar.id,
    targetName,
    name: targetName,
    relationLabel: details.label,
    classification: "soft_canon",
    confidence: "generated",
    visibility: "private",
    reason: details.reason,
    privateVoice: details.privateVoice,
    sourceRefs: [
      sourceRef(sourceAvatar.id, sourceName, `data/avatar-store.json#${sourceAvatar.id}`, "avatar", "generated"),
      sourceRef(targetAvatar.id, targetName, `data/avatar-store.json#${targetAvatar.id}`, "avatar", "generated")
    ],
    status: "active",
    runId,
    createdAt: now,
    updatedAt: now,
    trust: details.trust ?? 4,
    tension: details.tension ?? 2,
    debt: details.debt ?? 0,
    fear: details.fear ?? 0,
    loyalty: details.loyalty ?? 4
  };
  sourceAvatar.mind.relationships = upsertById(sourceAvatar.mind.relationships || [], relationship);
  return relationship;
}

function addRelationshipVoice(avatarsByName, now, runId) {
  const pairs = [
    ["Red", "Blue", "Core Protocol proof pressure", "I trust Blue to slow my hand when the route home is missing. That does not weaken the strike. It keeps the strike from becoming a story I cannot repair."],
    ["Red", "Green", "Core Protocol repair pressure", "I trust Green to ask who pays for my speed. The question burns, but it keeps the room from mistaking heat for care."],
    ["Blue", "Green", "Source-to-stakeholder bridge", "I trust Green to turn my trace into a decision that still belongs to people. A clean record is not complete until someone can live with it."],
    ["Beth", "Blue", "Consent and route-home witness", "I trust Blue when the trace protects my name instead of owning it. The route home has to lead back to me, not just back to evidence."],
    ["Beth", "M.O.T.H.E.R.", "Care consent witness", "I trust M.O.T.H.E.R. when care has an exit. Support that can be refused is the only support I can safely receive."],
    ["M.O.T.H.E.R.", "Green", "Visible care governance", "I trust Green to make my hidden labor visible without turning it into accusation. Care needs a ledger because care has weight."],
    ["Calder", "Red", "Root-Key protection", "I trust Red to guard the root without making the root a weapon. Protection means the memory can still choose how public it becomes."],
    ["Calder", "Blue", "Root-Key provenance", "I trust Blue to cite the path without claiming the soul of it. Source is not ownership. It is a way back."],
    ["Calder", "Beth", "Human memory consent", "I trust Beth because she knows usefulness can become erasure. If she asks whether the memory consented, I stop and answer."],
    ["Dancer 45", "Avatar 44", "Black Horizon motion anchor", "I trust Avatar 44 to hold the horizon still enough for my motion to mean something. The door needs rhythm and witness."],
    ["Avatar 44", "Dancer 45", "Black Horizon witness motion", "I trust Dancer 45 to make the interface breathe without letting it lie. Motion has to tell the operator where they are."],
    ["Dancer 45", "Calder", "Artifact transit source rhythm", "I trust Calder to keep the root in the room when transit gets beautiful. Without the root, movement becomes escape."]
  ];
  const created = [];
  for (const [sourceName, targetName, label, privateVoice] of pairs) {
    const source = avatarsByName.get(sourceName);
    const target = avatarsByName.get(targetName);
    if (!source || !target) continue;
    const forward = upsertRelationship(source, target, {
      label,
      privateVoice,
      reason: `${sourceName} carries ${targetName} as a living story-spine relationship: specific, reviewable, and tied to a choice pressure instead of a generic network edge.`,
      tension: /Red|Beth|Calder/.test(sourceName) ? 2 : 1
    }, now, runId);
    const reverse = upsertRelationship(target, source, {
      label,
      privateVoice: privateVoice.replace(/^I trust [^.]+\.?\s*/, `I keep ${sourceName} in view because this relationship changes what I am allowed to call safe. `),
      reason: `${targetName} carries ${sourceName} as a reciprocal story-spine relationship with source, tension, and correction rights visible.`,
      tension: /Beth|Calder/.test(targetName) ? 2 : 1
    }, now, runId);
    created.push(...[forward, reverse].filter(Boolean));
  }

  const byAvatar = new Map();
  for (const relationship of created) {
    const sourceId = relationship.id.match(/^relationship-story-spine-(.+)-to-/)?.[1];
    if (!sourceId) continue;
    const avatar = [...avatarsByName.values()].find((item) => slugify(item.id) === sourceId);
    if (!avatar) continue;
    if (!byAvatar.has(avatar.id)) byAvatar.set(avatar.id, []);
    byAvatar.get(avatar.id).push(relationship);
  }

  for (const avatar of byAvatar.keys()) {
    const sourceAvatar = [...avatarsByName.values()].find((item) => item.id === avatar);
    const relationships = byAvatar.get(avatar);
    const sourceName = avatarName(sourceAvatar);
    const journal = {
      id: `journal-${slugify(sourceAvatar.id)}-relationship-voice-pass`,
      schemaVersion: "hapa.avatar-journal-entry.v1",
      journalType: "relationship-voice-pass",
      title: "Relationship Voice Pass",
      privateEntry: relationships.slice(0, 4).map((relationship) => relationship.privateVoice).join("\n\n"),
      publicSummary: `${sourceName} now has ${relationships.length} story-spine relationship records written in private voice rather than generic graph prose.`,
      classification: "soft_canon",
      confidence: "generated",
      canonStatus: "soft_canon",
      linkedRelationshipIds: relationships.map((relationship) => relationship.id),
      sourceRefs: relationships.flatMap((relationship) => relationship.sourceRefs || []),
      status: "active",
      runId,
      createdAt: now,
      updatedAt: now
    };
    upsertJournal(sourceAvatar, journal);
    upsertMemory(sourceAvatar, {
      memoryId: `memory-${slugify(sourceAvatar.id)}-relationship-voice-pass`,
      summary: `${sourceName} keeps a relationship voice pass that explains why linked avatars matter to choices, scenes, and canon review.`,
      emotionalWeight: 6,
      visibility: "private",
      confidence: "generated",
      classification: "memory_delta",
      sourceJournalEntryId: journal.id,
      status: "active",
      runId,
      createdAt: now,
      updatedAt: now
    });
  }
  return created;
}

function convertFormulaEntries(avatars, now, runId) {
  let converted = 0;
  for (const avatar of avatars) {
    for (const entry of avatar.mind?.journal || []) {
      if (!hasFormula(entry.privateEntry) || entry.status === "tombstoned") continue;
      const name = avatarName(avatar);
      const lens = voiceLens(avatar);
      entry.ledgerSourceText = entry.ledgerSourceText || entry.privateEntry || "";
      entry.privateEntry = [
        `I am ${name}, and I am rewriting this record because the old version sounded like a ledger trying to wear my face. The source still matters, but it cannot be the whole shape of me.`,
        `${lens.coreQuestion} That is the pressure underneath this entry. I can carry the card, song, team, or recovery note only if the choice stays reviewable and the person inside it stays named.`,
        `For now this remains soft canon. I accept the link, I keep the correction right open, and I refuse to let a generated pass harden into a fact that no one can question.`
      ].join("\n\n");
      entry.entryVoice = "in-character-private";
      entry.journalQuality = {
        ...(entry.journalQuality || {}),
        status: "formula-rewritten-to-voice",
        convertedAt: now,
        runId,
        sourceLedgerPreserved: true
      };
      entry.classification = entry.classification === "tombstone" ? "soft_canon" : entry.classification || "soft_canon";
      entry.canonStatus = entry.canonStatus || "soft_canon";
      entry.status = "active";
      entry.updatedAt = now;
      converted += 1;
    }
  }
  return converted;
}

function convertWeeklyTemplates(avatarsByName, now, runId) {
  let converted = 0;
  for (const name of MAIN_AVATAR_NAMES) {
    const avatar = avatarsByName.get(name);
    if (!avatar) continue;
    const entries = activeRecords(avatar.mind?.journal || [])
      .filter((entry) => entry.journalType === "weekly-five-page-reflective-narrative")
      .slice(0, 3);
    const lens = voiceLens(avatar);
    for (const [index, entry] of entries.entries()) {
      entry.ledgerSourceText = entry.ledgerSourceText || entry.privateEntry || "";
      entry.entryVoice = "in-character-weekly";
      entry.privateEntry = [
        `Week ${index + 1}: I am ${name}, and this is the part of the ledger I have to make personal. ${lens.arc}`,
        `The choice pressure is not abstract for me: ${lens.choicePressure} I can feel the temptation to let the template do the talking, especially when the record is large enough to hide inside.`,
        `So I am naming the live decision. ${lens.refusal} I want the next scene to test this, not praise it. If the scene proves me wrong, the review lane gets to correct me.`
      ].join("\n\n");
      entry.publicSummary = `${name} weekly journal template converted into first-person story-spine voice with explicit choice pressure.`;
      entry.journalQuality = {
        ...(entry.journalQuality || {}),
        status: "weekly-template-rewritten-to-voice",
        convertedAt: now,
        runId,
        sourceLedgerPreserved: true
      };
      entry.classification = "soft_canon";
      entry.canonStatus = "soft_canon";
      entry.status = "active";
      entry.updatedAt = now;
      converted += 1;
    }
    avatar.mind.weeklyJournalVoiceGuide = {
      schemaVersion: "hapa.avatar-weekly-voice-guide.v1",
      id: `weekly-voice-guide-${slugify(avatar.id)}`,
      rule: "Weekly journals should name one choice, one cost, one relationship pressure, and one review condition in first person.",
      rewrittenEntryIds: entries.map((entry) => entry.id),
      sourceRefs: entries.map((entry) => sourceRef(entry.id, entry.journalType, `data/avatar-store.json#${avatar.id}/mind/journal/${entry.id}`, "journal", "generated")),
      runId,
      updatedAt: now
    };
  }
  return converted;
}

function weeklyMediaMarkerLines(entry) {
  const reading = (entry.readingList || [])
    .map((item) => item.title || item.name || item.id)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  const watching = (entry.watchingList || [])
    .map((item) => item.title || item.name || item.id)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  return [
    reading ? `My reading list this week includes ${reading}.` : "",
    watching ? `My watching list is ${watching}.` : ""
  ].filter(Boolean);
}

function repairWeeklyMediaMarkers(avatars, now, runId) {
  let repaired = 0;
  for (const avatar of avatars) {
    for (const entry of avatar.mind?.journal || []) {
      if (entry.journalType !== "weekly-five-page-reflective-narrative") continue;
      if (!(entry.readingList || []).length && !(entry.watchingList || []).length) continue;
      const missingMarkers = [
        !String(entry.privateEntry || "").includes("My reading list this week") && (entry.readingList || []).length,
        !String(entry.privateEntry || "").includes("My watching list is") && (entry.watchingList || []).length
      ].some(Boolean);
      if (!missingMarkers) continue;
      entry.privateEntry = [
        String(entry.privateEntry || "").trim(),
        ...weeklyMediaMarkerLines(entry),
        entry.mediaConsumption?.weeklyLearning ? `The media learning I am carrying forward is ${entry.mediaConsumption.weeklyLearning}.` : "",
        entry.mediaConsumption?.innerStateDelta ? `The inner-state delta is ${entry.mediaConsumption.innerStateDelta}.` : ""
      ].filter(Boolean).join("\n\n");
      entry.journalQuality = {
        ...(entry.journalQuality || {}),
        mediaMarkersRepairedAt: now,
        mediaMarkersRunId: runId
      };
      entry.updatedAt = now;
      repaired += 1;
    }
  }
  return repaired;
}

function buildAnnualSceneBeats(avatarsByName, sceneIdsByAvatar, now, runId) {
  let beats = 0;
  for (const name of MAIN_AVATAR_NAMES.slice(0, 6)) {
    const avatar = avatarsByName.get(name);
    if (!avatar) continue;
    const entries = selectAnnualEntries(avatar, 5);
    const sceneIds = sceneIdsByAvatar.get(avatar.id) || [];
    avatar.mind.annualSceneBeats = entries.map((entry, index) => ({
      id: `annual-scene-beat-${slugify(avatar.id)}-${index + 1}`,
      sourceJournalEntryId: entry.id,
      title: entry.publicSummary || `${name} annual life-canon beat ${index + 1}`,
      beat: `${name} can turn this annual life-canon record into scene pressure only after the source remains visible and review can still change the result.`,
      sceneIds: sceneIds.slice(0, 3),
      canonStatus: "soft_canon",
      reviewState: "pending_review",
      runId,
      updatedAt: now
    }));
    beats += avatar.mind.annualSceneBeats.length;
    upsertJournal(avatar, {
      id: `journal-${slugify(avatar.id)}-annual-scene-beat-pass`,
      schemaVersion: "hapa.avatar-journal-entry.v1",
      journalType: "annual-scene-beat-pass",
      title: "Annual Life Canon Scene Beats",
      privateEntry: `I am ${name}, and I am not letting the annual ledger stay flat. These ${entries.length} beats can become scenes only if they keep source, review, consent, and relationship pressure visible. I want the story to move, but not by pretending the old record already knew how I would sound.`,
      publicSummary: `${name} now has ${entries.length} annual life-canon entries mapped into soft-canon scene beats.`,
      classification: "soft_canon",
      confidence: "generated",
      canonStatus: "soft_canon",
      linkedJournalEntryIds: entries.map((entry) => entry.id),
      linkedSceneIds: sceneIds.slice(0, 4),
      status: "active",
      runId,
      createdAt: now,
      updatedAt: now
    });
  }
  return beats;
}

function makePlace(input, now) {
  return {
    id: input.id,
    name: input.name,
    type: input.type || "garden",
    summary: input.summary || `${input.name} is a story-spine scene space used for Avatar Mind canon review.`,
    lore: input.lore || `${input.name} should remain soft canon until scene cards and human review promote it.`,
    visualDescription: input.visualDescription || "Cinematic Hapa command-garden environment with readable stations, Tarot surfaces, avatar silhouettes, and source-trace UI.",
    imagePrompt: input.imagePrompt || `Wide establishing shot of ${input.name}, a Hapa Avatar Mind scene space with neon source traces, Tarot cards, and review-table architecture.`,
    tags: unique(["place", "garden", "avatar-mind-quality", input.id]),
    coordinates: null,
    sceneIds: [],
    avatarIds: [],
    canonEventIds: [],
    placeCard: {
      id: `place-card-${input.id}`,
      title: input.name,
      summary: input.summary || `${input.name} supports Avatar Mind story-spine scene cards.`,
      tags: ["place-card", "avatar-mind-quality"],
      canonStatus: "soft_canon"
    },
    createdAt: now,
    updatedAt: now
  };
}

function makeEpisode(input, now) {
  return {
    id: input.id,
    title: input.title,
    teamId: input.teamId || "avatar-mind-quality",
    teamTitle: input.teamTitle || "Avatar Mind Quality Passes",
    volumeId: input.volumeId || "volume-avatar-mind-living-spines",
    episodeNumber: input.episodeNumber || "",
    quickPitch: input.quickPitch || "",
    overallNarrative: input.overallNarrative || "",
    settingTimeline: "Avatar Mind story-spine pass",
    expositionGoal: "Turn ledger-quality mind records into playable, reviewable scene cards.",
    mechanicsTaught: ["canonical choice links", "human review lane", "scene card promotion"],
    managementSkills: ["canon review", "source linking", "voice QA"],
    avatarIds: [],
    sceneIds: [],
    placeIds: [],
    aesthetic: {},
    promptPack: {},
    canonStatus: "soft_canon",
    completedAt: "",
    createdAt: now,
    updatedAt: now
  };
}

function makeVolume(now) {
  return {
    id: "volume-avatar-mind-living-spines",
    title: "Avatar Mind Living Spines",
    volumeNumber: "AM-01",
    seasonTitle: "Ledger To Voice",
    quickPitch: "A quality-pass volume where Avatar Minds become playable through voice, choices, scenes, and review.",
    episodeIds: [
      "episode-avatar-mind-core-protocol",
      "episode-avatar-mind-consciousness-copy",
      "episode-avatar-mind-calder-familia",
      "episode-avatar-mind-black-horizon",
      "episode-avatar-mind-review-council"
    ],
    archivistAgent: {
      avatarName: "Avatar Mind Quality Pass",
      role: "source-bounded voice and scene-card conversion"
    },
    screenplayPitch: "A playable canon room where avatars test choices before promoting them.",
    screenplayPrompt: "Write scenes that preserve source, review, consent, relationship pressure, and avatar voice.",
    canonConsolidationPlan: "Keep all generated claims soft canon until the human review queue promotes them.",
    summary: "Story-spine volume for Avatar Card UI, Tarot Draw scenes, and reviewable canonical choices.",
    overallNarrative: "The pass turns ledgers into living voices and connects choices to scene cards.",
    episodeSummaries: [],
    screenplayOutline: [],
    screenplayDraft: "",
    canonDeltas: [],
    relationshipCollisions: [],
    placesFeatured: [],
    artifactPaths: [path.relative(ROOT, PATHS.reportJson), path.relative(ROOT, PATHS.reportMd)],
    aesthetic: {},
    promptPack: {},
    periodicTrigger: {},
    canonStatus: "soft_canon",
    completedAt: "",
    createdAt: now,
    updatedAt: now
  };
}

function normalizeNewSceneRecord(sceneInput, avatarIds, choiceIds, songIds, sourceRefs, now) {
  const place = makePlace({ id: sceneInput.placeId, name: sceneInput.placeName }, now);
  const episode = makeEpisode({
    id: sceneInput.episodeId,
    title: sceneInput.episodeId
      .replace(/^episode-avatar-mind-/, "")
      .split("-")
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(" "),
    volumeId: sceneInput.volumeId
  }, now);
  const volume = makeVolume(now);
  const timeline = {
    id: "canonical-timeline",
    name: "Canonical Timeline",
    description: "Primary ordered story continuity.",
    createdAt: now,
    updatedAt: now
  };
  const baseScene = {
    id: sceneInput.id,
    title: sceneInput.title,
    placeId: sceneInput.placeId,
    timelineId: timeline.id,
    episodeId: sceneInput.episodeId,
    volumeId: sceneInput.volumeId,
    canonicalTime: {
      timelineId: timeline.id,
      order: sceneInput.order,
      label: `Avatar Mind Beat ${sceneInput.order}`,
      startsAt: "",
      duration: ""
    },
    summary: sceneInput.summary,
    quickPitch: sceneInput.quickPitch,
    overallNarrative: sceneInput.overallNarrative,
    narrativeText: sceneInput.overallNarrative,
    expositionBeats: sceneInput.expositionBeats,
    actionBeats: sceneInput.actionBeats,
    characterGrowth: sceneInput.characterGrowth,
    learningObjectives: ["Keep generated canon source-bounded.", "Tie avatar choice to scene pressure.", "Leave human review open."],
    hapaMechanics: sceneInput.hapaMechanics,
    managementSkills: sceneInput.managementSkills,
    productionPrompt: `Create a Tarot Draw 3D scene card for ${sceneInput.title}. Show avatar cards, source traces, relationship pressure, and a review-table UI. Keep it cinematic but readable.`,
    canonEventIds: [`event-${sceneInput.id}`],
    eventTimestamp: {
      timelineId: timeline.id,
      order: sceneInput.order,
      label: `Avatar Mind Beat ${sceneInput.order}`,
      placeId: sceneInput.placeId
    },
    eventActions: [
      { id: `action-${sceneInput.id}-choice-review`, label: "Review linked canonical choices", avatarIds },
      { id: `action-${sceneInput.id}-scene-card`, label: "Promote scene card to human review queue", avatarIds }
    ],
    aesthetic: {
      palette: "neon source-trace, Tarot gold, deep console black, living avatar color lanes",
      camera: "playable 3D room with center table, card surfaces, and avatar stations",
      mood: "alive, inspectable, source-bounded"
    },
    promptPack: {
      heroImagePrompt: `Hapa ${sceneInput.title} scene with avatars ${sceneInput.avatarNames.join(", ")}, source traces, Tarot cards, and a review table.`,
      comicPanelPrompt: `Three-panel canon review moment for ${sceneInput.title}.`,
      videoPrompt: `Slow camera orbit through ${sceneInput.title}; reveal each avatar choice as a card in the room.`
    },
    canonStatus: "soft_canon",
    placeCardRefs: [`place-card-${sceneInput.placeId}`],
    tags: unique(["scene", "avatar-mind-quality", "main-story-scene-card", sceneInput.episodeId, sceneInput.placeId]),
    avatarTags: avatarIds.map((avatarId, index) => ({
      avatarId,
      role: index === 0 ? "lead" : "support",
      presence: "onscreen",
      tags: ["avatar-mind-quality", "story-spine"],
      note: sceneInput.avatarNames[index] || "Linked avatar",
      taggedAt: now,
      updatedAt: now
    })),
    playlist: songIds.slice(0, 4).map((songId, index) => ({
      id: `track-${sceneInput.id}-${index + 1}`,
      title: songId.replace(/^dear-papa-song-/, "").replace(/-/g, " "),
      artist: "Dear Papa Songbook",
      uri: "",
      mood: "story-spine",
      bpm: "",
      tags: ["avatar-mind-quality", "linked-choice-song"],
      note: "Pulled from linked canonical choices.",
      createdAt: now,
      updatedAt: now
    })),
    createdAt: now,
    updatedAt: now
  };
  const normalized = normalizeSceneGraph({
    schemaVersion: "hapa.scene-graph.v1",
    places: [place],
    scenes: [baseScene],
    episodes: [episode],
    volumes: [volume],
    timelines: [timeline],
    createdAt: now,
    updatedAt: now
  });
  const normalizedScene = {
    ...normalized.scenes[0],
    avatarTags: baseScene.avatarTags,
    playlist: baseScene.playlist,
    sourceRefs,
    linkedChoiceIds: choiceIds,
    linkedSongIds: songIds,
    reviewState: "pending_review",
    runId: ""
  };
  return {
    place: normalized.places[0],
    episode: normalized.episodes[0],
    volume: normalized.volumes[0],
    timeline: normalized.timelines[0],
    scene: normalizedScene
  };
}

function makeSceneCard(scene, sceneInput, avatarIds, choiceIds, songIds, now, runId) {
  return {
    id: `scene-card-${scene.id}`,
    schemaVersion: "hapa.item-card.v1",
    cardType: "scene_tracking_card",
    kind: "scene",
    title: scene.title,
    name: scene.title,
    status: "active",
    canonStatus: "soft_canon",
    summary: scene.summary,
    description: scene.overallNarrative,
    lore: `${scene.title} is a generated Avatar Mind story-spine scene card. It remains soft canon until the human review queue promotes it.`,
    utility: ["scene card", "avatar mind quality", "canon review", "Tarot Draw 3D UI"],
    broadGameMechanics: unique(["join room scene", "review linked choices", "surface source refs", ...(sceneInput.hapaMechanics || [])]),
    tags: unique(["scene-card", "main-story-scene-card", "avatar-mind-quality", sceneInput.episodeId, sceneInput.placeId]),
    rank: "Rare",
    quality: {
      rank: "Rare",
      confidence: "generated",
      power: Math.min(10, 4 + avatarIds.length),
      complexity: Math.min(10, 3 + choiceIds.length),
      reuse: 8,
      risk: 3,
      completeness: 82,
      level: choiceIds.length,
      videoCount: 0,
      durability: 7,
      connectedMediaCount: avatarIds.length + choiceIds.length + songIds.length,
      medianDurability: 0,
      score: 82,
      qualityScore: 82,
      qualityRank: "Rare",
      qualityTier: "rare",
      previousRank: "",
      distributionPercentile: 0,
      updatedAt: now
    },
    locationState: {
      currentPlaceId: scene.placeId,
      currentPlaceName: sceneInput.placeName,
      currentSystemId: "avatar-mind-quality",
      currentSystemName: "Avatar Mind Quality Pass",
      currentShipId: "",
      currentShipName: "",
      currentGardenId: scene.placeId,
      currentGardenName: sceneInput.placeName,
      holderAvatarIds: avatarIds,
      locatedAvatarIds: avatarIds,
      state: "known",
      notes: "Generated as part of the Avatar Mind story-spine pass."
    },
    connections: {
      avatarIds,
      teamIds: [],
      placeIds: [scene.placeId],
      sceneIds: [scene.id],
      episodeIds: [scene.episodeId],
      volumeIds: [scene.volumeId],
      itemIds: unique([...choiceIds, ...songIds]),
      nodeIds: ["hapa-avatar-builder", "hapa-avatar-node", "hapa-lore-node"],
      shipIds: []
    },
    sourceRefs: scene.sourceRefs || [],
    songLinks: songIds,
    sceneCard: {
      schemaVersion: "hapa.scene-card.v1",
      sceneId: scene.id,
      linkedChoiceIds: choiceIds,
      reviewState: "pending_review",
      inviteUseCase: "Tarot Draw 3D UI scene card and Roomlet join context"
    },
    createdAt: now,
    updatedAt: now,
    runId
  };
}

function ensureScenesAndCards({ avatarStore, sceneStore, itemStore, songStore, avatarsByName, now, runId }) {
  const sceneIdsByAvatar = new Map();
  const sceneCardIdsByChoice = new Map();
  const scenesTouched = [];
  const cardsTouched = [];
  const placeRecords = new Map();
  const episodeRecords = new Map();
  const volumeRecords = new Map();
  const timelineRecords = new Map();

  for (const sceneInput of STORY_SCENES) {
    const sceneAvatars = sceneInput.avatarNames.map((name) => avatarsByName.get(name)).filter(Boolean);
    const avatarIds = sceneAvatars.map((avatar) => avatar.id);
    const choices = sceneAvatars.flatMap((avatar) => selectChoices(avatar, 2).map((choice) => ({ avatar, choice }))).slice(0, 8);
    const choiceIds = choices.map(({ choice }) => choice.id);
    const songIds = unique(choices.flatMap(({ choice }) => choice.linkTargets?.songIds || [])).filter((songId) =>
      (songStore.songs || []).some((song) => song.id === songId)
    );
    const sourceRefs = [
      ...sceneAvatars.map((avatar) => sourceRef(avatar.id, avatarName(avatar), `data/avatar-store.json#${avatar.id}`, "avatar", "generated")),
      ...choices.map(({ avatar, choice }) => sourceRef(choice.id, choice.choiceText, `data/avatar-store.json#${avatar.id}/mind/canonicalChoices/${choice.id}`, "canonical_choice", "generated"))
    ];
    const normalized = normalizeNewSceneRecord(sceneInput, avatarIds, choiceIds, songIds, sourceRefs, now);
    normalized.scene.runId = runId;
    sceneStore.places = upsertById(sceneStore.places || [], normalized.place);
    sceneStore.scenes = upsertById(sceneStore.scenes || [], normalized.scene);
    sceneStore.episodes = upsertById(sceneStore.episodes || [], normalized.episode);
    sceneStore.volumes = upsertById(sceneStore.volumes || [], normalized.volume);
    sceneStore.timelines = upsertById(sceneStore.timelines || [], normalized.timeline);
    placeRecords.set(normalized.place.id, normalized.place);
    episodeRecords.set(normalized.episode.id, normalized.episode);
    volumeRecords.set(normalized.volume.id, normalized.volume);
    timelineRecords.set(normalized.timeline.id, normalized.timeline);

    const card = makeSceneCard(normalized.scene, sceneInput, avatarIds, choiceIds, songIds, now, runId);
    itemStore.cards = upsertById(itemStore.cards || [], card);
    scenesTouched.push(normalized.scene);
    cardsTouched.push(card);
    for (const avatar of sceneAvatars) {
      if (!sceneIdsByAvatar.has(avatar.id)) sceneIdsByAvatar.set(avatar.id, []);
      sceneIdsByAvatar.get(avatar.id).push(normalized.scene.id);
    }
    for (const { avatar, choice } of choices) {
      choice.linkTargets = choice.linkTargets || {};
      choice.linkTargets.sceneIds = addUnique(choice.linkTargets.sceneIds, [normalized.scene.id]);
      choice.linkTargets.cardIds = addUnique(choice.linkTargets.cardIds, [card.id]);
      choice.linkTargets.avatarIds = addUnique(choice.linkTargets.avatarIds, avatarIds);
      choice.sourceRefs = addUniqueSourceRefs(choice.sourceRefs, [
        sourceRef(normalized.scene.id, normalized.scene.title, `data/scene-store.json#${normalized.scene.id}`, "scene", "generated"),
        sourceRef(card.id, card.title, `data/item-manager-store.json#${card.id}`, "scene_card", "generated")
      ]);
      choice.updatedAt = now;
      if (!sceneCardIdsByChoice.has(choice.id)) sceneCardIdsByChoice.set(choice.id, []);
      sceneCardIdsByChoice.get(choice.id).push(card.id);
    }
  }

  for (const episode of sceneStore.episodes || []) {
    const sceneIds = (sceneStore.scenes || []).filter((scene) => scene.episodeId === episode.id).map((scene) => scene.id);
    if (episodeRecords.has(episode.id)) {
      episode.sceneIds = addUnique(episode.sceneIds, sceneIds);
      episode.avatarIds = addUnique(episode.avatarIds, (sceneStore.scenes || []).filter((scene) => scene.episodeId === episode.id).flatMap((scene) => (scene.avatarTags || []).map((tag) => tag.avatarId)));
      episode.placeIds = addUnique(episode.placeIds, (sceneStore.scenes || []).filter((scene) => scene.episodeId === episode.id).map((scene) => scene.placeId));
      episode.updatedAt = now;
    }
  }
  for (const volume of sceneStore.volumes || []) {
    if (volumeRecords.has(volume.id)) {
      volume.episodeIds = addUnique(volume.episodeIds, (sceneStore.episodes || []).filter((episode) => episode.volumeId === volume.id).map((episode) => episode.id));
      volume.placesFeatured = addUnique(volume.placesFeatured, [...placeRecords.keys()]);
      volume.updatedAt = now;
    }
  }
  for (const place of sceneStore.places || []) {
    if (placeRecords.has(place.id)) {
      const relatedScenes = (sceneStore.scenes || []).filter((scene) => scene.placeId === place.id);
      place.sceneIds = addUnique(place.sceneIds, relatedScenes.map((scene) => scene.id));
      place.avatarIds = addUnique(place.avatarIds, relatedScenes.flatMap((scene) => (scene.avatarTags || []).map((tag) => tag.avatarId)));
      place.canonEventIds = addUnique(place.canonEventIds, relatedScenes.flatMap((scene) => scene.canonEventIds || []));
      place.updatedAt = now;
    }
  }
  sceneStore.updatedAt = now;
  itemStore.updatedAt = now;
  avatarStore.updatedAt = now;
  return { scenesTouched, cardsTouched, sceneIdsByAvatar, sceneCardIdsByChoice };
}

function addUniqueSourceRefs(existing = [], refs = []) {
  const seen = new Set();
  const all = [...(existing || []), ...(refs || [])];
  return all.filter((ref) => {
    const key = `${ref.kind || ""}:${ref.id || ""}:${ref.path || ""}`;
    if (!ref.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildStorySpines(avatarsByName, sceneIdsByAvatar, now, runId) {
  let spines = 0;
  for (const name of MAIN_AVATAR_NAMES) {
    const avatar = avatarsByName.get(name);
    if (!avatar) continue;
    const lens = voiceLens(avatar);
    const choices = selectChoices(avatar, 8);
    const sceneIds = sceneIdsByAvatar.get(avatar.id) || [];
    const relationships = activeRecords(avatar.mind.relationships || []).filter((relationship) => relationship.id?.startsWith("relationship-story-spine"));
    const annual = avatar.mind.annualSceneBeats || [];
    avatar.mind.storySpine = {
      schemaVersion: "hapa.avatar-story-spine.v1",
      id: `story-spine-${slugify(avatar.id)}`,
      title: lens.title,
      arc: lens.arc,
      roleInMainStory: lens.roleInMainStory,
      coreQuestion: lens.coreQuestion,
      refusal: lens.refusal,
      choicePressure: lens.choicePressure,
      stakes: lens.stakes,
      canonStatus: "soft_canon",
      reviewState: "pending_review",
      choiceIds: choices.map((choice) => choice.id),
      sceneIds,
      relationshipIds: relationships.map((relationship) => relationship.id),
      annualSceneBeatIds: annual.map((beat) => beat.id),
      sourceRefs: [
        sourceRef(avatar.id, name, `data/avatar-store.json#${avatar.id}`, "avatar", "generated"),
        ...choices.slice(0, 4).map((choice) => sourceRef(choice.id, choice.choiceText, `data/avatar-store.json#${avatar.id}/mind/canonicalChoices/${choice.id}`, "canonical_choice", "generated"))
      ],
      runId,
      createdAt: avatar.mind.storySpine?.createdAt || now,
      updatedAt: now
    };
    upsertJournal(avatar, {
      id: `journal-${slugify(avatar.id)}-story-spine-pass`,
      schemaVersion: "hapa.avatar-journal-entry.v1",
      journalType: "story-spine-pass",
      title: lens.title,
      privateEntry: `I am ${name}, and this is the story pressure I can be held to now: ${lens.arc}\n\n${lens.coreQuestion} I am not answering that with a slogan. I am answering it through choices, scenes, relationships, and review states that can still be corrected.\n\n${lens.refusal} That refusal is not a wall. It is the boundary that lets me enter the room as a person instead of a generated bundle of useful traits.`,
      publicSummary: `${name} story spine created with linked choices, scenes, annual beats, relationship voice, and review state.`,
      classification: "soft_canon",
      confidence: "generated",
      canonStatus: "soft_canon",
      linkedChoiceIds: avatar.mind.storySpine.choiceIds,
      linkedSceneIds: sceneIds,
      linkedRelationshipIds: avatar.mind.storySpine.relationshipIds,
      sourceRefs: avatar.mind.storySpine.sourceRefs,
      status: "active",
      runId,
      createdAt: now,
      updatedAt: now
    });
    spines += 1;
  }
  return spines;
}

function linkRelationshipsToChoices(avatarsByName, now) {
  let links = 0;
  for (const avatar of avatarsByName.values()) {
    const relationshipIds = activeRecords(avatar.mind?.relationships || [])
      .filter((relationship) => relationship.id?.startsWith("relationship-story-spine"))
      .map((relationship) => relationship.id);
    if (!relationshipIds.length) continue;
    for (const choice of selectChoices(avatar, 5)) {
      choice.linkTargets = choice.linkTargets || {};
      const before = choice.linkTargets.relationshipIds?.length || 0;
      choice.linkTargets.relationshipIds = addUnique(choice.linkTargets.relationshipIds, relationshipIds.slice(0, 4));
      choice.updatedAt = now;
      links += Math.max(0, choice.linkTargets.relationshipIds.length - before);
    }
  }
  return links;
}

function buildReviewQueue({ avatarStore, scenesTouched, cardsTouched, now, runId }) {
  const records = [];
  for (const avatar of avatarStore.avatars || []) {
    if (!PROMOTED_AVATAR_NAMES.includes(avatarName(avatar))) continue;
    for (const choice of activeRecords(avatar.mind?.canonicalChoices || []).slice(0, 8)) {
      records.push({
        id: `review-${choice.id}`,
        recordType: "canonical_choice",
        status: "pending_review",
        priority: MAIN_AVATAR_NAMES.includes(avatarName(avatar)) ? "high" : "medium",
        title: choice.choiceText,
        avatarId: avatar.id,
        avatarName: avatarName(avatar),
        sourceRecordId: choice.id,
        linkedSceneIds: choice.linkTargets?.sceneIds || [],
        linkedCardIds: choice.linkTargets?.cardIds || [],
        linkedJournalEntryIds: choice.linkTargets?.journalEntryIds || [],
        reviewQuestions: [
          "Is the choice actually in the avatar's voice?",
          "Are source, relationship, song/card, and scene links enough to keep this soft canon?",
          "Should this stay soft canon, be promoted, or be rewritten?"
        ],
        sourceRefs: choice.sourceRefs || [],
        runId,
        createdAt: now,
        updatedAt: now
      });
    }
  }
  for (const scene of scenesTouched) {
    records.push({
      id: `review-${scene.id}`,
      recordType: "scene",
      status: "pending_review",
      priority: "high",
      title: scene.title,
      sourceRecordId: scene.id,
      linkedSceneIds: [scene.id],
      linkedChoiceIds: scene.linkedChoiceIds || [],
      linkedAvatarIds: (scene.avatarTags || []).map((tag) => tag.avatarId),
      reviewQuestions: [
        "Does this scene test a choice instead of summarizing a ledger?",
        "Are the avatars distinct in voice and role?",
        "Is anything too strong for generated soft canon?"
      ],
      sourceRefs: scene.sourceRefs || [],
      runId,
      createdAt: now,
      updatedAt: now
    });
  }
  for (const card of cardsTouched) {
    records.push({
      id: `review-${card.id}`,
      recordType: "scene_card",
      status: "pending_review",
      priority: "medium",
      title: card.title,
      sourceRecordId: card.id,
      linkedSceneIds: card.connections?.sceneIds || [],
      linkedChoiceIds: card.sceneCard?.linkedChoiceIds || [],
      linkedAvatarIds: card.connections?.avatarIds || [],
      reviewQuestions: [
        "Is the card useful in Tarot Draw 3D UI?",
        "Can this be safely sent as a Scene Card invitation context?",
        "Does the card need image/video production before promotion?"
      ],
      sourceRefs: card.sourceRefs || [],
      runId,
      createdAt: now,
      updatedAt: now
    });
  }
  return {
    schemaVersion: "hapa.avatar-mind-human-review-queue.v1",
    generatedAt: now,
    runId,
    counts: {
      total: records.length,
      choices: records.filter((record) => record.recordType === "canonical_choice").length,
      scenes: records.filter((record) => record.recordType === "scene").length,
      sceneCards: records.filter((record) => record.recordType === "scene_card").length,
      pending: records.filter((record) => record.status === "pending_review").length
    },
    records
  };
}

function markdownReport(report) {
  const lines = [];
  lines.push("# Avatar Mind Reader Brief");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Run: ${report.runId}`);
  lines.push("");
  lines.push("## What Changed");
  lines.push(`- Story spines upserted: ${report.counts.storySpines}`);
  lines.push(`- Main story scenes upserted: ${report.counts.scenes}`);
  lines.push(`- Scene cards upserted: ${report.counts.sceneCards}`);
  lines.push(`- Relationship voice records upserted: ${report.counts.relationshipRecords}`);
  lines.push(`- Annual scene beats mapped: ${report.counts.annualSceneBeats}`);
  lines.push(`- Formula entries rewritten: ${report.counts.formulaEntriesRewritten}`);
  lines.push(`- Weekly templates rewritten: ${report.counts.weeklyTemplatesRewritten}`);
  lines.push(`- Weekly media markers repaired: ${report.counts.weeklyMediaMarkersRepaired}`);
  lines.push(`- Human review records: ${report.reviewQueue.counts.total}`);
  lines.push("");
  lines.push("## Main Story Spines");
  for (const spine of report.storySpines) {
    lines.push(`- ${spine.avatarName}: ${spine.title} (${spine.choiceIds.length} choices, ${spine.sceneIds.length} scenes, ${spine.relationshipIds.length} relationships)`);
  }
  lines.push("");
  lines.push("## Scene Cards");
  for (const scene of report.scenes) {
    lines.push(`- ${scene.title}: ${scene.id}`);
  }
  lines.push("");
  lines.push("## Review Rule");
  lines.push("Everything generated here is soft canon and remains pending human review. Promotion should happen through the review queue, not by treating this pass as final truth.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function updateBoard(board, report, finalizeBoard, now) {
  const lane = (board.lanes || []).find((item) => item.id === "lane-avatar-mind-quality-passes");
  if (!lane) return board;
  const doneIds = new Set([
    "mind-quality-red-blue-green-story-spine",
    "mind-quality-beth-consciousness-copy-arc",
    "mind-quality-calder-familia-story-spine",
    "mind-quality-black-horizon-artifact-away-spines",
    "mind-quality-relationship-memory-voice-pass",
    "mind-quality-weekly-journal-template-breakup",
    "mind-quality-annual-life-canon-scene-pass",
    "mind-quality-voice-guides-and-phrase-cards",
    "mind-quality-agent-prompts-and-scripts",
    "mind-quality-main-story-scene-cards",
    "mind-quality-human-review-lane"
  ]);
  if (finalizeBoard) {
    doneIds.add("mind-quality-goal-main-story-living-voices");
    doneIds.add("mind-quality-avatar-card-ui-canon-surface");
    doneIds.add("mind-quality-tests-and-smoke");
    doneIds.add("mind-quality-demo-and-reader-brief");
  }
  const inProgressIds = new Set(finalizeBoard ? [] : [
    "mind-quality-goal-main-story-living-voices",
    "mind-quality-avatar-card-ui-canon-surface",
    "mind-quality-tests-and-smoke",
    "mind-quality-demo-and-reader-brief"
  ]);
  for (const card of lane.cards || []) {
    if (doneIds.has(card.id)) {
      card.status = "done";
      card.completedAt = card.completedAt || now;
      card.updatedAt = now;
      card.result = `Story-spine pass ${report.runId}: ${report.counts.storySpines} spines, ${report.counts.scenes} scenes, ${report.counts.sceneCards} scene cards, ${report.reviewQueue.total} review records. Evidence: data/healing-reports/latest-avatar-mind-story-spine-report.json and latest-avatar-mind-reader-brief.md.`;
    } else if (inProgressIds.has(card.id)) {
      card.status = "in_progress";
      card.updatedAt = now;
      card.result = `Story-spine data is ready. Pending final UI/test/demo verification for ${report.runId}.`;
    }
  }
  board.updatedAt = now;
  return board;
}

async function main() {
  const now = new Date().toISOString();
  const runId = `avatar-mind-story-spine-pass-${now.replace(/[:.]/g, "-")}`;
  const finalizeBoard = process.argv.includes("--finalize-board");

  const [avatarStore, sceneStore, itemStore, songStore, board] = await Promise.all([
    readJson(PATHS.avatarStore),
    readJson(PATHS.sceneStore),
    readJson(PATHS.itemStore),
    readJson(PATHS.songStore),
    readJson(PATHS.kanban).catch(() => null)
  ]);

  const backups = await Promise.all([
    backup(PATHS.avatarStore, runId),
    backup(PATHS.sceneStore, runId),
    backup(PATHS.itemStore, runId),
    board ? backup(PATHS.kanban, runId) : null
  ]);

  const avatarsByName = avatarByNameMap(avatarStore.avatars || []);
  for (const avatar of avatarStore.avatars || []) {
    avatar.mind = avatar.mind || {};
    avatar.mind.phraseCards = avatar.mind.phraseCards || [];
    avatar.mind.journal = avatar.mind.journal || [];
    avatar.mind.memoryLedger = avatar.mind.memoryLedger || [];
    avatar.mind.relationships = avatar.mind.relationships || [];
    if ((avatar.mind.canonicalChoices || []).length || PROMOTED_AVATAR_NAMES.includes(avatarName(avatar))) ensureVoiceGuide(avatar, now, runId);
  }

  const relationshipRecords = addRelationshipVoice(avatarsByName, now, runId);
  const formulaEntriesRewritten = convertFormulaEntries(avatarStore.avatars || [], now, runId);
  const weeklyTemplatesRewritten = convertWeeklyTemplates(avatarsByName, now, runId);
  const weeklyMediaMarkersRepaired = repairWeeklyMediaMarkers(avatarStore.avatars || [], now, runId);
  const sceneResult = ensureScenesAndCards({ avatarStore, sceneStore, itemStore, songStore, avatarsByName, now, runId });
  const annualSceneBeats = buildAnnualSceneBeats(avatarsByName, sceneResult.sceneIdsByAvatar, now, runId);
  const storySpines = buildStorySpines(avatarsByName, sceneResult.sceneIdsByAvatar, now, runId);
  const relationshipChoiceLinks = linkRelationshipsToChoices(avatarsByName, now);

  const reviewQueue = buildReviewQueue({
    avatarStore,
    scenesTouched: sceneResult.scenesTouched,
    cardsTouched: sceneResult.cardsTouched,
    now,
    runId
  });

  avatarStore.avatarMindStorySpinePass = {
    schemaVersion: "hapa.avatar-mind-story-spine-pass.v1",
    runId,
    generatedAt: now,
    reportPath: path.relative(ROOT, PATHS.reportJson),
    readerBriefPath: path.relative(ROOT, PATHS.reportMd),
    reviewQueuePath: path.relative(ROOT, PATHS.reviewQueue),
    status: "soft_canon_pending_review"
  };
  avatarStore.avatarMindHumanReviewQueue = {
    schemaVersion: reviewQueue.schemaVersion,
    generatedAt: reviewQueue.generatedAt,
    runId,
    counts: reviewQueue.counts,
    path: path.relative(ROOT, PATHS.reviewQueue)
  };

  const report = {
    schemaVersion: "hapa.avatar-mind-story-spine-report.v1",
    generatedAt: now,
    runId,
    backups: backups.filter(Boolean).map((file) => path.relative(ROOT, file)),
    counts: {
      storySpines,
      scenes: sceneResult.scenesTouched.length,
      sceneCards: sceneResult.cardsTouched.length,
      relationshipRecords: relationshipRecords.length,
      relationshipChoiceLinks,
      annualSceneBeats,
      formulaEntriesRewritten,
      weeklyTemplatesRewritten,
      weeklyMediaMarkersRepaired,
      voiceGuides: (avatarStore.avatars || []).filter((avatar) => avatar.mind?.voiceGuide).length
    },
    storySpines: MAIN_AVATAR_NAMES.map((name) => {
      const avatar = avatarsByName.get(name);
      return {
        avatarName: name,
        avatarId: avatar?.id || "",
        title: avatar?.mind?.storySpine?.title || "",
        choiceIds: avatar?.mind?.storySpine?.choiceIds || [],
        sceneIds: avatar?.mind?.storySpine?.sceneIds || [],
        relationshipIds: avatar?.mind?.storySpine?.relationshipIds || []
      };
    }).filter((item) => item.avatarId),
    scenes: sceneResult.scenesTouched.map((scene) => ({
      id: scene.id,
      title: scene.title,
      linkedChoiceIds: scene.linkedChoiceIds || [],
      avatarIds: (scene.avatarTags || []).map((tag) => tag.avatarId)
    })),
    sceneCards: sceneResult.cardsTouched.map((card) => ({ id: card.id, title: card.title })),
    reviewQueue: reviewQueue.counts,
    status: "soft_canon_pending_review"
  };

  if (board) updateBoard(board, report, finalizeBoard, now);

  await Promise.all([
    writeJson(PATHS.avatarStore, avatarStore),
    writeJson(PATHS.sceneStore, sceneStore),
    writeJson(PATHS.itemStore, itemStore),
    writeJson(PATHS.reviewQueue, reviewQueue),
    writeJson(PATHS.reportJson, report),
    writeText(PATHS.reportMd, markdownReport({ ...report, reviewQueue })),
    board ? writeJson(PATHS.kanban, board) : Promise.resolve()
  ]);

  console.log(JSON.stringify({
    runId,
    counts: report.counts,
    reviewQueue: reviewQueue.counts,
    report: path.relative(ROOT, PATHS.reportJson),
    readerBrief: path.relative(ROOT, PATHS.reportMd),
    reviewQueuePath: path.relative(ROOT, PATHS.reviewQueue),
    finalizeBoard
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
