import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditHapaSongStore } from "../src/domain/song.js";
import {
  normalizeSongContextLayers,
  normalizeSongReferenceCatalog,
  normalizeSongReferenceConnectors,
  normalizeSongReferenceGraphEdges
} from "../src/domain/song-reference-graph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = path.join(ROOT, "data/hapa-songs-store.json");
const BACKUP_DIR = path.join(ROOT, "data/backups");
const REPORT_DIR = path.join(ROOT, "data/merge-reports");
const APPLY = process.argv.includes("--apply");
const GENERATED_AT = new Date().toISOString();
const RUN_ID = GENERATED_AT.replaceAll(":", "-").replaceAll(".", "-");
const PREFIX = "echo-expanded:";

const source = (label, url, sourceKind = "official-or-publisher-reference") => ({
  label, url, sourceKind, checkedAt: "2026-07-18"
});

const references = [
  {
    id: "heinlein-starship-troopers", title: "Starship Troopers", kind: "novel", creators: ["Robert A. Heinlein"],
    publicContext: "A future infantry story organized around service, civic obligation, military formation, sacrifice, and war against an alien species.",
    themes: ["service", "duty", "citizenship", "sacrifice", "alien-war"], mechanics: ["mobile-infantry", "service-confers-franchise", "unit-discipline"],
    traversalTerms: ["Starship Troopers", "trooper", "mobile infantry"],
    signalLexicon: { literal: ["Starship", "Trooper", "Heinlein"], phonetic: ["Henlien"], mechanical: ["space marines", "honor", "service", "duty"] },
    source: source("The Heinlein Society — Books and Stories", "https://www.heinleinsociety.org/books-and-stories/", "author-society-catalog")
  },
  {
    id: "piers-anthony-incarnations", title: "Incarnations of Immortality", kind: "novel-series", creators: ["Piers Anthony"],
    publicContext: "Mortals assume supernatural offices—Death, Time, Fate, War, Nature, Evil, Good, and Night—so a name is both a person and a role that persists across holders.",
    themes: ["office-and-holder", "succession", "moral-agency", "cosmic-bureaucracy", "personified-forces"], mechanics: ["role-transfer", "office-tools", "interlocking-incarnations", "magic-and-technology"],
    traversalTerms: ["Death", "Time", "Fate", "War", "Nature", "Green Mother", "Good", "Evil", "Night"],
    signalLexicon: { literal: ["Death", "Time", "Fate", "War", "Night"], orthographic: ["green M.O.T.H.E.R."], mechanical: ["personified office", "role succession"] },
    source: source("Penguin Random House — Incarnations of Immortality", "https://www.penguinrandomhouse.com/series/INC/incarnations-of-immortality/", "publisher-series-page")
  },
  {
    id: "robin-hobb-farseer-fitz-fool", title: "Farseer / Tawny Man / Fitz and the Fool", kind: "connected-novel-series", creators: ["Robin Hobb"], franchise: "Realm of the Elderlings",
    publicContext: "FitzChivalry Farseer moves among hidden names, royal duty, assassination, the animal-bonding Wit, the Skill, prophecy, and his identity-shaping bond with the Fool.",
    themes: ["names-and-masks", "bond", "prophecy", "duty", "memory", "chosen-kin"], mechanics: ["Wit animal bond", "Skill mind connection", "White Prophet and Catalyst", "assumed identity"],
    traversalTerms: ["Robin Hobb", "Fitz", "Fool", "Molly", "Wit", "Skill", "wolf bond"],
    signalLexicon: { literal: ["Robin Hobb", "Fitz", "fool", "Molly"], mechanical: ["wolf bond", "hidden name", "prophecy", "mind bond"] },
    source: source("Penguin Random House — Fitz and the Fool", "https://www.penguinrandomhouse.com/series/FTF/fitz-and-the-fool/", "publisher-series-page")
  },
  {
    id: "robin-hobb-liveship-traders", title: "Liveship Traders", kind: "novel-series", creators: ["Robin Hobb"], franchise: "Realm of the Elderlings",
    publicContext: "Wizardwood vessels awaken into sentient liveships, carry family memory and inheritance, and bind sailors, traders, pirates, serpents, and dragons across the sea.",
    themes: ["sentient-vessel", "inheritance", "family-memory", "freedom", "sea-transformation"], mechanics: ["wizardwood awakening", "family bond", "ship consciousness", "serpent-to-dragon transformation"],
    traversalTerms: ["Liveship Traders", "live ship", "wizardwood", "Vivacia", "Althea", "Kennit"],
    signalLexicon: { literal: ["live ship traders"], orthographic: ["Molly in their Wood"], mechanical: ["ghost ship", "family ship", "sentient vessel"] },
    source: source("Penguin Random House — Liveship Traders", "https://www.penguinrandomhouse.com/series/LVT/liveship-traders-trilogy/", "publisher-series-page")
  },
  {
    id: "square-enix-final-fantasy-x", title: "Final Fantasy X", kind: "video-game", creators: ["Square Enix"], franchise: "Final Fantasy",
    publicContext: "Tidus joins Yuna's pilgrimage through water-shaped Spira to confront Sin, inherited sacrifice, religious certainty, memory, and a cycle the party refuses to repeat.",
    themes: ["water", "pilgrimage", "inherited-duty", "sacrifice", "cycle-breaking", "remembering"], mechanics: ["guardian party", "summoning", "sphere-grid progression", "Sin cycle", "sending"],
    traversalTerms: ["Tidus", "Yuna", "Rikku", "Sin", "Spira", "Zanarkand"],
    signalLexicon: { literal: ["Tidus", "Yuna", "Sin"], phonetic: ["Tee-dus", "Riku"], mechanical: ["guardian", "pilgrimage", "water", "cycle"] },
    source: source("Square Enix — Final Fantasy X", "https://na.finalfantasy.com/titles/finalfantasy10", "official-franchise-page")
  },
  {
    id: "square-enix-final-fantasy-viii", title: "Final Fantasy VIII", kind: "video-game", creators: ["Square Enix"], franchise: "Final Fantasy",
    publicContext: "SeeD cadet Squall Leonhart and Rinoa move through sorceress war, lost pasts, resistance, fate, junctioned power, and a future sorceress who compresses time.",
    themes: ["memory", "fate", "time", "resistance", "opening-to-connection"], mechanics: ["SeeD", "Garden", "Guardian Force junction", "Draw", "time compression"],
    traversalTerms: ["Squall", "Rinoa", "Lionheart", "SeeD", "Garden", "sorceress", "time compression"],
    signalLexicon: { orthographic: ["Lion-heart", "SeeD", "Garden"], phonetic: ["seed"], mechanical: ["witch", "forgotten memory", "compressed time", "lone wolf"] },
    source: source("Square Enix — Final Fantasy VIII", "https://na.finalfantasy.com/titles/finalfantasy8", "official-franchise-page")
  },
  {
    id: "sid-meiers-civilization", title: "Sid Meier's Civilization", kind: "strategy-game-series", creators: ["Sid Meier", "Firaxis Games", "2K"],
    publicContext: "Civilizations move through ages by turns, research trees, diplomacy, trade, war, leaders, governments, resources, and multiple victory conditions.",
    themes: ["history-as-system", "leadership", "progress", "diplomacy", "war", "future"], mechanics: ["turns", "technology tree", "civics tree", "leader traits", "victory conditions", "one-more-turn"],
    traversalTerms: ["Catherine", "Gandhi", "Animal Husbandry", "research", "turn", "age", "era"],
    signalLexicon: { literal: ["Gandhi", "Animal Husbandry", "Catherine"], mechanical: ["research every turn", "trade", "age", "era", "int overflow"] },
    source: source("2K — Sid Meier's Civilization VI", "https://civilization.2k.com/en-GB/civ-vi/", "official-game-page")
  },
  {
    id: "bungie-halo-canon", title: "Halo series and canon", kind: "video-game-transmedia-franchise", creators: ["Bungie", "343 Industries / Halo Studios", "Xbox Game Studios"], franchise: "Halo",
    publicContext: "The canon binds Spartans, Cortana, the Covenant, the Flood, Forerunner inheritance, ring weapons, Reach, and soldier–AI companionship across games and books.",
    themes: ["created-soldier", "human-ai-bond", "sacrifice", "inheritance", "homecoming", "weapon-as-world"], mechanics: ["power armor", "AI companion", "ringworld weapon", "fireteam", "reticle combat"],
    traversalTerms: ["Halo", "Master Chief", "Cortana", "Reach", "Flood", "Forerunner", "Spartan"],
    signalLexicon: { literal: ["Halo Two", "Halo-1"], orthographic: ["reticules"], mechanical: ["space marine", "ring", "AI companion", "Reach"] },
    source: source("Halo Waypoint — Official Halo Book Guide", "https://www.halowaypoint.com/news/official-halo-book-guide%3FvC3LGy15aO7n%3DC2xnScbCs4", "official-canon-guide")
  },
  {
    id: "blizzard-warcraft", title: "Warcraft series and canon", kind: "video-game-transmedia-franchise", creators: ["Blizzard Entertainment"], franchise: "Warcraft",
    publicContext: "Azeroth's factions, heroes, ancients, corruption, duty, freedom, raids, guilds, and real-time strategy turn alliance and conflict into reusable party language.",
    themes: ["faction", "corruption", "duty", "freedom", "alliance", "return"], mechanics: ["guild", "party", "race and class", "RTS economy", "control groups"],
    traversalTerms: ["Warcraft", "Battle.net", "Ancients", "guild", "Alliance", "Horde"],
    signalLexicon: { literal: ["Warcraft", "Battle.net", "Ancients"], mechanical: ["guild mate", "double gas", "rush", "party"] },
    source: source("Blizzard — Warcraft III: The Story So Far", "https://news.blizzard.com/en-us/article/23229617/warcraft-iii-the-story-so-far", "official-lore-primer")
  },
  {
    id: "blizzard-starcraft", title: "StarCraft series and canon", kind: "video-game-transmedia-franchise", creators: ["Blizzard Entertainment"], franchise: "StarCraft",
    publicContext: "Terran, zerg, and protoss wars braid rebellion, infestation, betrayal, hive evolution, psionic bonds, sacrifice, and unlikely alliance through Raynor and Kerrigan.",
    themes: ["betrayal", "transformation", "hive", "unlikely-alliance", "rebellion", "return"], mechanics: ["asymmetric races", "rush", "hive evolution", "resource economy", "co-op commanders"],
    traversalTerms: ["StarCraft", "Protoss", "Zerg", "Terran", "Raynor", "Kerrigan"],
    signalLexicon: { literal: ["Protoss", "Zerg", "Raynor", "StarCraft"], mechanical: ["double gas", "rush", "swarm", "evolution"] },
    source: source("Blizzard — StarCraft Story Primer", "https://news.blizzard.com/en-us/article/23331587/starcraft-story-primer", "official-lore-primer")
  },
  {
    id: "blizzard-diablo", title: "Diablo series and canon", kind: "video-game-transmedia-franchise", creators: ["Blizzard Entertainment"], franchise: "Diablo",
    publicContext: "Humans of Sanctuary navigate the inherited conflict between the High Heavens and Burning Hells through classes, loot, death, corruption, soulstones, and recurring evil.",
    themes: ["sanctuary", "inherited-conflict", "corruption", "human-agency", "recurrence"], mechanics: ["classes", "levels", "loot", "dungeon", "seasonal return"],
    traversalTerms: ["Diablo", "Butcher", "Sanctuary", "Lilith", "Horadrim"],
    signalLexicon: { literal: ["Butcher", "Diablo"], mechanical: ["level", "class", "dungeon", "loot", "hell"] },
    source: source("Blizzard — Diablo IV: A New Saga", "https://news.blizzard.com/en-us/article/23952501/diablo-iv-inside-the-game-a-new-saga", "official-lore-feature")
  },
  {
    id: "riot-league-of-legends", title: "League of Legends mechanics and canon", kind: "video-game-transmedia-franchise", creators: ["Riot Games"], franchise: "League of Legends",
    publicContext: "Five champions take complementary lane and jungle roles to clear a path to the Nexus; champion names also call whole regions, relationships, and role kits into a line.",
    themes: ["team-role", "coordination", "champion-identity", "lane", "shared-objective"], mechanics: ["top", "jungle", "mid", "bottom", "support", "Nexus", "champion kits"],
    traversalTerms: ["League", "Ashe", "Blitzcrank", "Jungler", "Support", "lane", "Nexus"],
    signalLexicon: { literal: ["League", "Ashe", "Blitz"], mechanical: ["support", "jungler", "top", "mid", "lane", "carry"] },
    source: source("Riot Games — How to Play League of Legends", "https://www.leagueoflegends.com/en-us/how-to-play//", "official-game-guide")
  },
  {
    id: "falling-into-your-smile", title: "Falling Into Your Smile", kind: "television-series", creators: ["Youku", "NewStyle Media"],
    publicContext: "Tong Yao joins the all-male ZGDX esports team, trains into her role, faces public scrutiny, and turns competitive team trust into romance and belonging.",
    themes: ["woman-in-esports", "team-trust", "training", "public-scrutiny", "romance"], mechanics: ["team position", "practice match", "tournament", "livestream", "found-team"],
    traversalTerms: ["Falling Into Your Smile", "Tong Yao", "Lu Sicheng", "ZGDX", "Fighting"],
    signalLexicon: { multilingual: ["Fighting!", "Korean accent"], mechanical: ["K-drama", "team", "trainer", "League", "credits"] },
    source: source("Netflix — Falling Into Your Smile", "https://www.netflix.com/as/title/81566868", "official-streaming-series-page")
  },
  {
    id: "litrpg-genre-mechanics", title: "LitRPG progression grammar", kind: "genre-mechanic", creators: [],
    publicContext: "Game-visible stats, classes, levels, skills, quests, parties, loot, cooldowns, and save points externalize character growth as readable system state.",
    themes: ["becoming", "identity-through-action", "progression", "party", "system-and-soul"], mechanics: ["stats", "class", "level", "quest", "party", "loot", "save point", "XP"],
    traversalTerms: ["LitRPG", "stats", "classes", "questlines", "level", "save point", "XP"],
    signalLexicon: { literal: ["LitRPGs"], mechanical: ["stats", "classes", "questlines", "partied", "loot", "crit", "XP", "dungeon"] },
    source: source("The Wandering Inn — Introduction", "https://wanderinginn.com/introduction/", "author-owned-series-page")
  },
  {
    id: "litrpg-dungeon-crawler-carl", title: "Dungeon Crawler Carl", kind: "novel-series", creators: ["Matt Dinniman"],
    publicContext: "Carl and Princess Donut survive a multilevel alien game-show dungeon where system rules, spectatorship, parties, classes, and performance all affect survival.",
    themes: ["survival", "found-party", "system-exploitation", "spectacle", "resistance"], mechanics: ["dungeon floors", "classes", "stats", "achievements", "galactic audience"],
    traversalTerms: ["dungeon", "next level", "party", "system AI"], signalLexicon: { mechanical: ["dungeon", "level", "party", "stats", "loot"] },
    source: source("Penguin — Dungeon Crawler Carl series", "https://www.penguin.co.uk/series/DCCS/dungeon-crawler-carl-series", "publisher-series-page")
  },
  {
    id: "litrpg-wandering-inn", title: "The Wandering Inn", kind: "web-novel-series", creators: ["pirateaba"],
    publicContext: "Erin Solstice enters a dangerous world where actions produce classes, levels, and skills, while hospitality and an inn become infrastructure for found community.",
    themes: ["hospitality", "found-community", "identity-through-action", "home", "cross-world-arrival"], mechanics: ["classes", "levels", "skills", "inn as sanctuary"],
    traversalTerms: ["world", "class", "level", "skill", "innkeeper"], signalLexicon: { mechanical: ["woke in a world", "class", "level", "cultivate", "party"] },
    source: source("The Wandering Inn — Introduction", "https://wanderinginn.com/introduction/", "author-owned-series-page")
  },
  {
    id: "litrpg-he-who-fights-with-monsters", title: "He Who Fights with Monsters", kind: "web-novel-series", creators: ["Shirtaloon / Travis Deverell"],
    publicContext: "Jason wakes in a strange magic world, acquires powers with ominous presentation, and tries to build an ethical identity amid gods, monsters, factions, and progression.",
    themes: ["portal-world", "ethics-of-power", "identity", "monsters", "belonging"], mechanics: ["powers", "ranks", "party", "progression", "world crossing"],
    traversalTerms: ["woke in a world", "monsters", "powers", "party"], signalLexicon: { mechanical: ["woke in a world", "monsters", "partied", "powers", "progression"] },
    source: source("Royal Road — He Who Fights with Monsters", "https://www.royalroad.com/fiction/26294/he-who-fights-with-monsters%EF%BC%81", "author-posted-series-page")
  },
  {
    id: "litrpg-defiance-of-the-fall", title: "Defiance of the Fall", kind: "novel-series", creators: ["J. F. Brink / TheFirstDefier"],
    publicContext: "An apocalyptic System overlays Earth with monsters, magic, progression, and cultivation, turning survival choices into durable build paths.",
    themes: ["system-apocalypse", "survival", "cultivation", "self-authored-build"], mechanics: ["System", "levels", "attributes", "cultivation", "build progression"],
    traversalTerms: ["System", "fall", "cultivation", "level"], signalLexicon: { mechanical: ["system", "level", "stats", "cultivate", "reforge"] },
    source: source("Simon & Schuster — Defiance of the Fall", "https://www.simonandschuster.com/books/Defiance-of-the-Fall-Book-1/J-F-Brink/Defiance-of-the-Fall/9781638493921", "publisher-series-page")
  }
];

const effect = {
  "heinlein-starship-troopers": ["Military science-fiction collage.", "Trooper + Starship + misspelled Heinlein + space marines resolves to service, duty, citizenship, and sacrifice rather than generic military spectacle.", "Space-war imagery becomes a question about who serves whom and what honorable duty costs.", "A transformed author/title cluster imports the novel's civic argument without quoting its title cleanly."],
  "piers-anthony-incarnations": ["Abstract forces speak as poetic characters.", "Capitalized Death, Time, Fate, War, Nature/Green Mother, Good/Evil, and Night become offices whose holders can change while the function persists.", "Personification becomes a succession protocol for names-as-variables and roles-as-durable nodes.", "The series mechanic explains how one identity can be both a person and a transferable office."],
  "robin-hobb-farseer-fitz-fool": ["A joke about being fit or foolish.", "Fitz, Fool, Molly, hidden names, animal bonds, prophecy, and duty load the intimate identity system of the Realm of the Elderlings.", "Self-description becomes relational identity: who calls you what, who knows the mask, and which bond changes the future.", "Character names act as compressed relationship and identity packets."],
  "robin-hobb-liveship-traders": ["Sailors trading aboard a live ship.", "The split spelling opens wizardwood, sentient vessels, family memory, inheritance, freedom, and sea transformation.", "The album's ghost ship becomes a possible carrier of accumulated family consciousness, not just a haunted vehicle.", "Orthographic wordplay turns a phrase into a whole sentient-vessel mechanic."],
  "square-enix-final-fantasy-x": ["Two fantasy names going to fight sin.", "Tidus and Yuna activate water, pilgrimage, guardianship, inherited sacrifice, memory, and refusing a repeating cycle.", "Ocean imagery becomes a route through grief toward a different ending than the inherited one.", "A character pair supplies world, duty, relationship, and cycle-breaking at once."],
  "square-enix-final-fantasy-viii": ["A lion-hearted phrase amid remembering and witches.", "Lion-heart, SeeD/seed, Garden, sorceress/witch, lost memory, fate, and time form a candidate FFVIII cluster.", "Romantic memory becomes mechanically entangled with borrowed power and compressed time.", "Distributed wordplay invites a cross-song traversal instead of a one-line lookup."],
  "sid-meiers-civilization": ["Historical names, farming, research, and an overflow bug.", "Leaders, techs, turns, trade, eras, and victory logics become a simulation vocabulary for building a future.", "History becomes executable and revisable: a past life can choose another branch and victory condition.", "Game mechanics perform the exposition instead of merely decorating it."],
  "bungie-halo-canon": ["A halo, firearm sight, or marine joke.", "Halo numbers, reticles, Reach, Spartans, Cortana, rings, sacrifice, and fireteam continuity load the transmedia canon.", "Weapon language becomes companionship, created identity, inherited war, and the problem of preserving humanity inside a mission.", "A small combat cue opens a large canon and soldier–AI relationship graph."],
  "blizzard-warcraft": ["A nostalgic list of games and guild habits.", "Battle.net, Warcraft, Ancients, guild search parties, economy, and rush language reconstruct shared play as a care protocol.", "RTS coordination becomes social responsibility: missing party members trigger a search, not replacement.", "Player mechanics quietly carry the song's ethic of returning everyone home."],
  "blizzard-starcraft": ["Alien race names and fast strategy jargon.", "Protoss, zerg, terran, Raynor, Kerrigan, rush, gas, infestation, and alliance import betrayal, transformation, hive identity, and return.", "A match-up becomes an identity struggle across species and imposed forms.", "Race and economy vocabulary compresses both strategy and canon."],
  "blizzard-diablo": ["A difficult level with a named monster.", "Butcher + level + Diablo activates Sanctuary, classes, loot, death loops, corruption, and recurring evil.", "A throwaway battle line becomes another iteration in a world where evil and the wanderer repeatedly return.", "Boss and level terms expose the game's recurrence system."],
  "riot-league-of-legends": ["Support, jungle, lane, carry, and champion names.", "Those words resolve into a five-role team whose different jobs coordinate around one Nexus.", "Care becomes positional rather than hierarchical: support, carry, jungle, and lane are interdependent functions.", "Role vocabulary explains crew composition without stopping for prose exposition."],
  "falling-into-your-smile": ["A K-drama, training, League, and the encouragement 'Fighting!'.", "The cluster opens Tong Yao's entry into an all-male esports team, role training, scrutiny, tournament teamwork, and romance.", "Competitive role language becomes a story about being recognized, trusted, and allowed to belong.", "Multilingual encouragement and esports mechanics bridge game grammar into social exposition."],
  "litrpg-genre-mechanics": ["A romance written with game jargon.", "Stats, classes, quests, parties, specs, cooldowns, loot, XP, and save points externalize becoming while the chorus argues that love exceeds the numbers.", "Progression becomes ethical and relational rather than merely numerical.", "Visible system state makes internal growth traversable."],
  "litrpg-dungeon-crawler-carl": ["Dungeon, level, party, and loot mechanics.", "Those mechanics resonate with survival inside an exploitative system where party loyalty and rule-bending matter more than the scoreboard.", "Progression can be read as resistance to the system measuring it.", "Comparative mechanics add a possible route, not a claimed authored allusion."],
  "litrpg-wandering-inn": ["A displaced player levels through classes.", "The class system can reflect what someone repeatedly does, while care and hospitality become real power and home-building.", "The lyric's 'spec into care' becomes identity authored by action.", "Comparative mechanics connect progression to community infrastructure."],
  "litrpg-he-who-fights-with-monsters": ["A stranger wakes in a game-like magic world.", "Portal displacement, ominous powers, party-building, and ethical self-definition resonate with the lyric's half-coded protagonist.", "The build becomes a moral question: what kind of person do these powers make possible?", "Comparative mechanics connect progression to ethical identity."],
  "litrpg-defiance-of-the-fall": ["Stats, levels, cultivation, and reforging.", "System pressure plus cultivation reframes the lyric's build as a long survival path assembled through choices.", "Progression becomes an authored response to imposed rules.", "Comparative mechanics connect system apocalypse to self-authored build paths."]
};

const connectorSpecs = [
  ["Gates at the Mountain", "robin-hobb-farseer-fitz-fool", "I read Robin Hobb", "But I knew I’m the fool", "explicit-cross-series-braid", 1, ["literal"], "Robin Hobb, Fitz, and the Fool are named directly."],
  ["Gates at the Mountain", "robin-hobb-liveship-traders", "those live ship traders", "In their Wood", "explicit-orthographic-braid", 0.99, ["literal", "orthographic", "cross-reference"], "'live ship traders' splits the title while Molly and Wood braid Farseer into wizardwood."],
  ["I Knew a Bella", "heinlein-starship-troopers", "good Trooper and fly my Starship", null, "explicit-transformed-title", 0.99, ["literal", "phonetic", "mechanical"], "Trooper, Starship, space marines, honor, and 'Henlien' co-occur in one line."],
  ["I Knew a Bella", "bungie-halo-canon", "Halo Two reticules", null, "explicit-title-mechanic", 1, ["literal", "orthographic", "mechanical"], "Halo 2 is named and reticules/reticles carry the shooter mechanic."],
  ["Aquatic Monkey Favicon (Work in Your Underwear)”", "bungie-halo-canon", "Halo-1 spec", null, "explicit-title-mechanic", 1, ["literal", "mechanical"], "Halo 1 is named as a precision-control specification."],
  ["Our Anima Am an Ocean", "square-enix-final-fantasy-x", "Tidus and Yuna", "end of the last Parapancha", "explicit-character-mechanic", 1, ["literal", "mechanical", "thematic"], "Tidus, Yuna, Sin, ocean, and cycle language co-occur."],
  ["Watermelon Honey, Due", "square-enix-final-fantasy-x", "Tee-dus went to Midgar", null, "candidate-phonetic-cross-title", 0.84, ["phonetic", "cross-reference"], "Tee-dus evokes Tidus while nearby Riku evokes Rikku; Midgar deliberately mixes FF titles."],
  ["Watermelon Honey, Due", "square-enix-final-fantasy-viii", "Lion-heart", null, "candidate-orthographic-franchise-cluster", 0.71, ["orthographic", "cross-reference"], "Lion-heart sits beside PlayStation and Final Fantasy VII cues; it can open Squall Leonhart/Lion Heart but remains a candidate."],
  ["Silver plays Slivers", "square-enix-final-fantasy-viii", "Witcher and Witch", "remember what I don’t remember", "candidate-multisignal", 0.66, ["orthographic", "mechanical", "thematic"], "Witch/sorceress and explicit lost-memory wording form two FFVIII signals; later Time adds a third, but no title or character is named."],
  ["Backwards Cap", "square-enix-final-fantasy-viii", "woke up without Remember", "Carrying her into the Credits as the Set Suns", "candidate-mechanical", 0.59, ["mechanical", "thematic"], "Lost memory, fate, resistance, and recurring set/sun time imagery resonate with FFVIII, but this is intentionally retained as a weak candidate."],
  ["Dear Past Life", "sid-meiers-civilization", "Catherine the Great", null, "explicit-mechanic-cluster", 1, ["literal", "mechanical", "orthographic"], "Catherine, Animal Husbandry, Gandhi, integer overflow, and MAD are one dense Civilization line."],
  ["Married that Scary", "sid-meiers-civilization", "Catherine the Good", "Research every turn", "candidate-mechanic-wordplay", 0.91, ["orthographic", "mechanical"], "Catherine, states, trade, research, rush, and turns recreate Civilization without naming it."],
  ["90s Nerd", "blizzard-warcraft", "Warcraft’s Honorable Customs", "Send a Search Party", "explicit-title-mechanic", 1, ["literal", "mechanical"], "Warcraft, Battle.net, Ancients, guild, gas, rush, and party mechanics cluster together."],
  ["90s Nerd", "blizzard-starcraft", "fight the Protoss", "double gas meant an instant Rush", "explicit-canon-mechanic", 1, ["literal", "mechanical"], "Protoss plus gas/rush strategy language directly activates StarCraft."],
  ["Backwards Cap", "blizzard-starcraft", "Protoss came for the Zerg", null, "explicit-canon-cluster", 1, ["literal"], "Protoss, zerg, and Raynor are named in one line."],
  ["Tariff Coin Kiss", "blizzard-starcraft", "StarCraft in my bloodstream", null, "explicit-title-mechanic", 1, ["literal", "mechanical"], "StarCraft and a zerg rush are explicit."],
  ["On her Pigeon again", "blizzard-diablo", "Butcher Level Two", null, "explicit-title-mechanic", 1, ["literal", "mechanical"], "The Butcher, a level, and Diablo are named in one compact combat cue."],
  ["Nameless Knew a Nothing", "riot-league-of-legends", "wants a Support", "Jungler with Blitz", "explicit-role-champion-cluster", 0.99, ["literal", "mechanical"], "Support, jungler, hook, and Blitz/Blitzcrank form a complete League role-kit cluster."],
  ["Backwards Cap", "riot-league-of-legends", "Mysty with the Y was like Ashe", "Masters in the League", "explicit-champion-role-cluster", 0.98, ["literal", "orthographic", "mechanical"], "Ashe, aim assist, Masters, and League are explicit or near-explicit."],
  ["Backwards Cap", "falling-into-your-smile", "K-drama on my Shoulders", "Masters in the League “Fighting!”", "candidate-multilingual-esports-cluster", 0.78, ["multilingual", "mechanical", "cross-reference"], "K-drama, training, competitive League language, credits, and Korean-accent 'Fighting!' form a drama/esports cluster; the show itself uses a fictional MOBA, not League canon."],
  ["One More Little Bella", "riot-league-of-legends", "I’ll Jungle if you take top", null, "explicit-role-mechanic", 0.95, ["mechanical"], "Jungle and top are complementary team positions."],
  ["That Boy Liberty", "piers-anthony-incarnations", "tonight we have the Night", "take me, War", "candidate-personified-office-cluster", 0.86, ["orthographic", "mechanical", "thematic"], "Night, green M.O.T.H.E.R./Nature, War, duty, and liberty are personified across a four-line cluster."],
  ["Trouble’s Water", "piers-anthony-incarnations", "Wild War Leader of War", null, "candidate-personified-office", 0.69, ["mechanical", "thematic"], "War is addressed as an acting office with directional authority."],
  ["Trouble’s Water", "piers-anthony-incarnations", "Death became a Siren’s Sister", null, "candidate-personified-office", 0.74, ["mechanical", "thematic"], "Death acts, chooses kinship, and changes relation rather than remaining an abstraction."],
  ["Silver plays Slivers", "piers-anthony-incarnations", "Night said", null, "candidate-role-name", 0.63, ["orthographic", "mechanical"], "Night speaks as a named role; Day and Time elsewhere in the song corroborate the office reading."],
  ["Save Point (Found You in the Code)", "litrpg-genre-mechanics", "Inspired by The Hapa Protocol, LitRPGs", "Heart full of questlines", "explicit-genre-mechanic", 1, ["literal", "mechanical"], "The lyric declares LitRPG inspiration and immediately instantiates stats, quests, party, classes, and progression."],
  ["Save Point (Found You in the Code)", "litrpg-dungeon-crawler-carl", "Because in this dungeon of endless time", null, "comparative-mechanical-resonance", 0.56, ["mechanical"], "Dungeon, levels, party, stats, loot, and system-resistance align, but no Carl-specific marker appears."],
  ["Save Point (Found You in the Code)", "litrpg-wandering-inn", "Woke in a world I didn’t spawn", "what we cultivate", "comparative-mechanical-resonance", 0.54, ["mechanical", "thematic"], "Cross-world arrival, classes, leveling, and care-as-vocation align, but no inn-specific marker appears."],
  ["Save Point (Found You in the Code)", "litrpg-he-who-fights-with-monsters", "Woke in a world I didn’t spawn", "partied up in another place", "comparative-mechanical-resonance", 0.52, ["mechanical", "thematic"], "Portal displacement, powers, party, and ethical identity align, but no Jason-specific marker appears."],
  ["Save Point (Found You in the Code)", "litrpg-defiance-of-the-fall", "Stats at zero", "Together we reforge wrong into right", "comparative-mechanical-resonance", 0.48, ["mechanical", "thematic"], "Stats, cultivation, reforging, and an imposed system align; this is a traversal option rather than a claimed allusion."]
];

const edgeSpecs = [
  ["heinlein-starship-troopers", "bungie-halo-canon", "soldier-system-contrast", 0.86, ["military formation", "service", "power armor"], "Both ask what duty makes of a soldier; Halo adds created soldiers and AI companionship to Heinlein's civic-service frame."],
  ["heinlein-starship-troopers", "blizzard-starcraft", "alien-war-and-service", 0.75, ["alien war", "unit roles", "sacrifice"], "StarCraft pluralizes the factions and makes transformation/betrayal central to the military frame."],
  ["heinlein-stranger-in-a-strange-land", "square-enix-final-fantasy-x", "water-and-incorporated-understanding", 0.73, ["water kinship", "outsider", "changed understanding"], "Grokking and Spira's water-bound pilgrimage both make understanding an identity-changing passage."],
  ["heinlein-moon-is-a-harsh-mistress", "sid-meiers-civilization", "governance-simulation", 0.82, ["revolution", "scarcity", "governance", "AI"], "The lunar revolt supplies a lived political case; Civilization turns political choices into a branching system."],
  ["piers-anthony-incarnations", "square-enix-final-fantasy-viii", "role-outlives-holder", 0.8, ["inherited office", "time", "fate", "sorceress succession"], "Incarnations and inherited sorceress power both separate a durable role from the person forced to carry it."],
  ["piers-anthony-incarnations", "blizzard-diablo", "cosmic-office-and-human-agency", 0.76, ["Good and Evil", "Death", "recurrence", "human choice"], "Both stage human agency inside an inherited cosmic conflict, but Anthony uses offices while Diablo uses factions, bloodlines, and recurring evils."],
  ["robin-hobb-farseer-fitz-fool", "robin-hobb-liveship-traders", "shared-realm-memory", 1, ["Realm of the Elderlings", "identity", "memory", "dragons"], "The lyric itself braids Molly/Fitz/Fool into live ship/wizardwood language, turning separate subseries into one traversal junction."],
  ["robin-hobb-farseer-fitz-fool", "square-enix-final-fantasy-viii", "bond-memory-fate", 0.69, ["memory", "fated relationship", "hidden identity", "psychic connection"], "Both connect intimacy to memory, fate, concealed identity, and forms of mind-linking power."],
  ["robin-hobb-liveship-traders", "marvel-guardians-of-the-galaxy", "vessel-as-family-carrier", 0.58, ["ship", "found family", "carried memory"], "A vessel becomes more than transport when it carries a crew's identity; Liveship makes that consciousness literal."],
  ["square-enix-final-fantasy", "square-enix-final-fantasy-x", "installment-braid-cycle-and-sacrifice", 0.93, ["party", "sacrifice", "memory", "cycle-breaking"], "The album's existing Final Fantasy VII/Aeris route and its Tidus/Yuna/Sin route make sacrifice and refusing inherited catastrophe traversable across installments."],
  ["square-enix-final-fantasy", "square-enix-final-fantasy-viii", "installment-braid-memory-and-identity", 0.82, ["memory", "identity", "romance", "resistance"], "Midgar, Aeris, PlayStation, and Lion-heart appear in the same song neighborhood, making a deliberate cross-installment route more useful than forcing every clue into Final Fantasy VII."],
  ["litrpg-genre-mechanics", "sid-meiers-civilization", "system-visible-progression", 0.72, ["progression", "branching choices", "readable state"], "LitRPG externalizes one person's build while Civilization externalizes a society's build."],
  ["litrpg-genre-mechanics", "riot-league-of-legends", "role-build-party", 0.77, ["roles", "levels", "stats", "team composition"], "League's role and build grammar becomes a real-time party implementation of LitRPG progression vocabulary."],
  ["litrpg-genre-mechanics", "blizzard-diablo", "class-loot-dungeon", 0.91, ["class", "level", "loot", "dungeon"], "Diablo supplies a foundational playable grammar that LitRPG can move into prose and interior identity."],
  ["litrpg-genre-mechanics", "blizzard-warcraft", "class-guild-quest", 0.88, ["class", "guild", "party", "quest"], "Warcraft's social progression vocabulary becomes an exposition language for belonging and coordinated care."],
  ["blizzard-starcraft", "mtg-slivers-and-teferi", "distributed-hive-capability", 0.74, ["hive", "shared capability", "evolution"], "Zerg evolution and Sliver ability-sharing provide two distinct models for capacities distributed across a collective."],
  ["blizzard-warcraft", "riot-league-of-legends", "rts-to-role-team-grammar", 0.71, ["unit control", "roles", "lanes", "team objective"], "The album traverses from Warcraft/Ancients RTS language into League's specialized five-role team grammar."],
  ["riot-league-of-legends", "falling-into-your-smile", "game-role-to-social-role", 0.94, ["esports", "team position", "training", "tournament"], "The drama translates MOBA team roles into belonging, gendered scrutiny, trust, and romance; it is adjacent to League language, not League canon."],
  ["bungie-halo-canon", "square-enix-final-fantasy-viii", "companion-memory-identity", 0.6, ["memory", "humanity", "borrowed power", "duty"], "Cortana and Guardian Forces make power inseparable from memory and identity, though by very different mechanisms."]
];

function findSong(store, title) {
  return store.songs.find((song) => song.title === title) || null;
}

function lyricWindow(song, startNeedle, endNeedle = null) {
  const lines = String(song?.lyrics?.text || "").split(/\n/);
  const startIndex = lines.findIndex((line) => line.toLowerCase().includes(startNeedle.toLowerCase()));
  if (startIndex < 0) throw new Error(`Missing lyric anchor '${startNeedle}' in ${song?.title}`);
  const endIndex = endNeedle
    ? lines.findIndex((line, index) => index >= startIndex && line.toLowerCase().includes(endNeedle.toLowerCase()))
    : startIndex;
  if (endIndex < 0) throw new Error(`Missing lyric end anchor '${endNeedle}' in ${song?.title}`);
  return {
    lineStart: startIndex + 1,
    lineEnd: endIndex + 1,
    lyricText: lines.slice(startIndex, endIndex + 1).filter((line) => line.trim()).join(" / "),
    matchedText: startNeedle
  };
}

function makeConnector(store, spec, ordinal) {
  const [songTitle, referenceId, startNeedle, endNeedle, classification, score, channels, explanation] = spec;
  const song = findSong(store, songTitle);
  if (!song) throw new Error(`Missing song '${songTitle}'`);
  const reference = references.find((item) => item.id === referenceId);
  if (!reference) throw new Error(`Missing reference '${referenceId}'`);
  const target = lyricWindow(song, startNeedle, endNeedle);
  const [withoutContext, withContext, thematicShift, expositionFunction] = effect[referenceId];
  return {
    id: `${PREFIX}${song.id}:${referenceId}:${ordinal}`,
    referenceId,
    referenceTitle: reference.title,
    referenceKind: reference.kind,
    relationType: classification.startsWith("comparative") ? "mechanically-resonates-with" : classification.startsWith("candidate") ? "candidate-allusion-to" : "alludes-to",
    confidence: classification,
    target: { songId: song.id, ...target },
    semanticEffect: { withoutContext, withContext, thematicShift, expositionFunction, traversalEdges: reference.themes.slice(0, 5) },
    evidence: {
      classification,
      score,
      channels,
      signals: channels.map((channel) => ({ channel, value: target.matchedText, explanation })),
      caveat: classification.startsWith("candidate") || classification.startsWith("comparative")
        ? "Interpretive edge retained for human review; it is not promoted as confirmed authorial intent."
        : "Direct lyric evidence is present; the semantic interpretation remains reviewable."
    },
    provenance: {
      method: "curated-multichannel-lyric-analysis",
      source: `data/hapa-songs-store.json + ${reference.source.url}`,
      reviewStatus: classification.startsWith("candidate") || classification.startsWith("comparative")
        ? "assistant-candidate-pending-human-review"
        : "source-backed-direct-match-pending-human-review",
      generatedAt: GENERATED_AT
    }
  };
}

function makeLayers(connectors) {
  const bySong = new Map();
  for (const connector of connectors) {
    const list = bySong.get(connector.target.songId) || [];
    list.push(connector);
    bySong.set(connector.target.songId, list);
  }
  return new Map([...bySong].map(([songId, items]) => [songId, normalizeSongContextLayers([{
    id: `${PREFIX}${songId}:multichannel-context`,
    label: "Expanded multichannel context",
    summary: "Direct names and transformed sound/spelling/mechanic cues are traversable together without collapsing candidates into confirmed references.",
    referenceIds: [...new Set(items.map((item) => item.referenceId))],
    connectorIds: items.map((item) => item.id),
    changesExpositionBy: "Loads role systems, canon relationships, and gameplay mechanics as compressed exposition while preserving evidence strength.",
    opensTraversalTo: [...new Set(items.flatMap((item) => item.semanticEffect.traversalEdges))],
    reviewStatus: "assistant-analyzed-pending-human-review"
  }]) ]));
}

function mergeById(existing, additions, prefix = PREFIX) {
  const next = [...(existing || []).filter((item) => !String(item?.id || "").startsWith(prefix))];
  const index = new Map(next.map((item, i) => [item.id, i]));
  for (const addition of additions) {
    const at = index.get(addition.id);
    if (at === undefined) {
      index.set(addition.id, next.length);
      next.push(addition);
    } else {
      next[at] = addition;
    }
  }
  return next;
}

const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
const normalizedReferences = normalizeSongReferenceCatalog(references);
const connectors = normalizeSongReferenceConnectors(connectorSpecs.map((spec, index) => makeConnector(store, spec, index + 1)));
const layersBySong = makeLayers(connectors);
const graphEdges = normalizeSongReferenceGraphEdges(edgeSpecs.map(([fromReferenceId, toReferenceId, relationType, score, shared, rationale], index) => ({
  id: `${PREFIX}edge:${index + 1}:${fromReferenceId}:${toReferenceId}`,
  fromReferenceId, toReferenceId, relationType, score,
  sharedMechanics: shared,
  sharedThemes: shared,
  rationale,
  traversalEffect: "Makes the destination reference available as a second reading lens without replacing the source reading.",
  provenance: { sourceIds: [fromReferenceId, toReferenceId], method: "source-backed-cross-corpus-comparison", generatedAt: GENERATED_AT }
})));

const nextStore = {
  ...store,
  referenceCatalog: mergeById(store.referenceCatalog, normalizedReferences, "__never_remove_catalog__"),
  referenceGraphEdges: mergeById(store.referenceGraphEdges, graphEdges),
  songs: store.songs.map((song) => {
    const songConnectors = connectors.filter((connector) => connector.target.songId === song.id);
    const songLayers = layersBySong.get(song.id) || [];
    return {
      ...song,
      referenceConnectors: mergeById(song.referenceConnectors, songConnectors),
      contextualLayers: mergeById(song.contextualLayers, songLayers),
      updatedAt: songConnectors.length ? GENERATED_AT : song.updatedAt
    };
  }),
  updatedAt: GENERATED_AT
};
nextStore.audit = auditHapaSongStore(nextStore.songs);

const classificationCounts = connectors.reduce((counts, connector) => {
  const key = connector.evidence.classification;
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}, {});
const report = {
  schemaVersion: "hapa.echo-reference-expansion-report.v1",
  mode: APPLY ? "apply" : "dry-run",
  generatedAt: GENERATED_AT,
  storePath: STORE_PATH,
  referencesAddedOrUpdated: normalizedReferences.length,
  graphEdgesAdded: graphEdges.length,
  lyricConnectorsAdded: connectors.length,
  songsTouched: new Set(connectors.map((connector) => connector.target.songId)).size,
  classificationCounts,
  explicitOrDirect: connectors.filter((connector) => !connector.evidence.classification.startsWith("candidate") && !connector.evidence.classification.startsWith("comparative")).length,
  candidates: connectors.filter((connector) => connector.evidence.classification.startsWith("candidate")).length,
  comparativeMechanics: connectors.filter((connector) => connector.evidence.classification.startsWith("comparative")).length,
  audit: nextStore.audit
};

if (APPLY) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `hapa-songs-store.before-echo-expansion.${RUN_ID}.json`);
  const reportPath = path.join(REPORT_DIR, `echo-hidden-reference-expansion.${RUN_ID}.json`);
  fs.copyFileSync(STORE_PATH, backupPath);
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...report, backupPath, reportPath }, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, backupPath, reportPath }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
