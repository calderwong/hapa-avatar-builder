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
  },
  {
    id: "journey-to-the-west-sun-wukong", title: "Journey to the West / Sun Wukong", kind: "classic-novel-and-character", creators: ["Wu Cheng'en (traditionally attributed)"],
    publicContext: "Sun Wukong, the rebellious and shape-changing Monkey King, becomes a disciplined protector on a pilgrimage to obtain Buddhist sutras.",
    themes: ["transformation", "rebellion", "pilgrimage", "protection", "self-mastery"], mechanics: ["seventy-two transformations", "cloud somersault", "magic staff", "protector party"],
    traversalTerms: ["Wukong", "Monkey King", "Journey to the West", "sutra", "pilgrimage"],
    signalLexicon: { literal: ["Wukong"], phonetic: ["Wu Kong"], mechanical: ["monkey", "sutra", "journey", "protector"] },
    source: source("China.org.cn — Journey to the West", "https://www.china.org.cn/english/china_key_words/2024-08/29/content_117393749.html", "cultural-reference-page")
  },
  {
    id: "hoyoverse-genshin-gnosis-wish", title: "Genshin Impact — Gnosis and Event Wish", kind: "video-game-canon-and-mechanic", creators: ["HoYoverse"], franchise: "Genshin Impact",
    publicContext: "Genshin pairs a chance-and-guarantee Event Wish acquisition system with Gnoses, chess-piece-like conduits of divine elemental authority held by Archons.",
    themes: ["chance", "authority", "identity", "desire", "power-transfer"], mechanics: ["Event Wish", "drop-rate boost", "guarantee count", "Gnosis", "Archon authority"],
    traversalTerms: ["Gacha", "Gnosis", "Wish", "Archon", "Teyvat"],
    signalLexicon: { literal: ["Gnosis"], phonetic: ["Gacha Gnosis"], mechanical: ["wish", "pull", "guarantee", "chess piece", "elemental authority"] },
    source: source("HoYoLAB / HoYoWiki — Gnosis", "https://www.hoyolab.com/article/38581744", "official-canon-reference")
  },
  {
    id: "pussycat-dolls-dont-cha", title: "Don't Cha", kind: "song", creators: ["The Pussycat Dolls", "Busta Rhymes"],
    publicContext: "A pop call-and-response built around teasing comparison and desirability, recognizable from its compressed spoken title phrase.",
    themes: ["flirtation", "comparison", "desire", "performance"], mechanics: ["call-and-response", "phonetic title compression", "dance-floor address"],
    traversalTerms: ["Don't Cha", "Doncha", "Pussycat Dolls"],
    signalLexicon: { literal: ["Doncha"], phonetic: ["Doncha’Know, Sis"], mechanical: ["call-and-response", "flirtation"] },
    source: source("Universal Music Japan — Don't Cha", "https://www.universal-music.co.jp/pussycat-dolls/products/573-8728/", "label-catalog-page")
  },
  {
    id: "bella-ciao-resistance-song", title: "Bella Ciao", kind: "folk-and-resistance-song", creators: [],
    publicContext: "An Italian song with uncertain folk origins that became a widely shared symbol of resistance, collective freedom, and opposition to oppression.",
    themes: ["resistance", "freedom", "collective-voice", "memory", "departure"], mechanics: ["portable refrain", "communal singing", "tradition transformed across contexts"],
    traversalTerms: ["Bella Ciao", "Ciao Bella Ciao", "Chiao Baby Chiao", "resistance song"],
    signalLexicon: { literal: ["Bella", "Chiao"], phonetic: ["Chiao Baby Chiao", "Chio Baby Chiao"], orthographic: ["Bella ... Chiao"], mechanical: ["freedom", "song", "stolen from the Native"] },
    source: source("Treccani — La vera storia di Bella ciao", "https://www.treccani.it/magazine/atlante/cultura/La_vera_storia_di_Bella_ciao.html", "cultural-encyclopedia")
  },
  {
    id: "steppenwolf-born-to-be-wild", title: "Born to Be Wild", kind: "song", creators: ["Steppenwolf", "Mars Bonfire"],
    publicContext: "Steppenwolf's road anthem turns wildness into motion, countercultural independence, and a refusal to remain contained.",
    themes: ["wildness", "freedom", "movement", "counterculture"], mechanics: ["road-anthem propulsion", "self-naming through motion"],
    traversalTerms: ["Born to Be Wild", "born Wild"],
    signalLexicon: { orthographic: ["born Wild"], mechanical: ["take you there", "freedom", "road"] },
    source: source("Steppenwolf — Band Biography", "https://steppenwolf.com/pages/biography", "artist-owned-catalog")
  },
  {
    id: "born-free-elsa", title: "Born Free / Elsa the Lioness", kind: "book-film-and-song-cluster", creators: ["Joy Adamson", "James Hill", "John Barry", "Don Black"],
    publicContext: "The Born Free story follows Joy and George Adamson raising Elsa the lioness and then teaching her to live independently in the wild rather than remain possessed or confined.",
    themes: ["freedom", "care-without-possession", "wildness", "release", "lioness"], mechanics: ["rehabilitation", "release to the wild", "care that prepares independence"],
    traversalTerms: ["Born Free", "yearned to be Free", "lioness", "Elsa"],
    signalLexicon: { orthographic: ["born ... Free"], mechanical: ["wild", "free", "old Lion", "care without captivity"] },
    source: source("Born Free Foundation — Heritage", "https://www.bornfree.org.uk/about-us/heritage/", "foundation-history")
  },
  {
    id: "billy-squier-song-cluster", title: "Billy Squier — Don't Say No / Everybody Wants You", kind: "artist-catalog-cluster", creators: ["Billy Squier"],
    publicContext: "Billy Squier's catalog supplies the title Don't Say No, the name-sound Squier/squirrel, and Everybody Wants You as a linked arena-rock wordplay cluster.",
    themes: ["desire", "refusal", "performance", "attention"], mechanics: ["cross-line phonetic braid", "arena-rock entrance", "catalog-title chaining"],
    traversalTerms: ["Billy Squier", "Don't Say No", "Everybody Wants You", "Squier"],
    signalLexicon: { literal: ["Don’t Say No"], phonetic: ["Squirells", "Squier"], mechanical: ["Everyman", "everyone wants", "arena field"] },
    source: source("Billy Squier — Official biography and catalog", "https://billysquier.com/about/", "artist-owned-catalog")
  },
  {
    id: "eminem-cinderella-man", title: "Cinderella Man", kind: "song", creators: ["Eminem", "Script Shepherd"],
    publicContext: "An Eminem song from Recovery framed as a second-chance, survival, and comeback declaration with stadium-scale rhythmic force.",
    themes: ["recovery", "second-chance", "survival", "performance", "resolve"], mechanics: ["comeback declaration", "stadium entrance energy", "self-authored return"],
    traversalTerms: ["Cinderella Man", "Eminem", "Recovery"],
    signalLexicon: { literal: ["Cinderella Man"], mechanical: ["take the field", "comeback", "second chance"] },
    source: source("Eminem — Cinderella Man", "https://www.eminem.com/song/cinderella-man/", "artist-owned-catalog")
  },
  {
    id: "uw-huskies-bow-down", title: "University of Washington Huskies / Bow Down to Washington", kind: "athletics-place-and-song-cluster", creators: ["University of Washington", "Lester Wilson"],
    publicContext: "Seattle's University of Washington athletic identity joins the Huskies, purple and gold, field entrance, collective singing, and the fight song Bow Down to Washington.",
    themes: ["place", "team", "loyalty", "memory", "public-performance"], mechanics: ["field entrance", "fight-song chorus", "purple-and-gold identity", "team formation"],
    traversalTerms: ["Huskies", "Purple and Gold", "Seattle", "take the field", "Bow Down to Washington"],
    signalLexicon: { literal: ["Huskies", "Purple", "Gold", "Seattle"], mechanical: ["take the field", "team song", "dawn entrance"] },
    source: source("University of Washington Athletics — Branding and Traditions", "https://gohuskies.com/documents/download/2018/5/2/18_UW_Branding_OneSheet.pdf", "official-athletics-guide")
  },
  {
    id: "tarzan-jane", title: "Tarzan of the Apes / Jane Porter", kind: "novel-and-character-cluster", creators: ["Edgar Rice Burroughs"], franchise: "Tarzan",
    publicContext: "Tarzan and Jane place wild and civilized identities in tension through a cross-world encounter in the jungle.",
    themes: ["wild-and-civilized", "cross-world-encounter", "identity", "love", "jungle"], mechanics: ["Jane enters the jungle", "Tarzan crosses toward civilization", "two-world tension"],
    traversalTerms: ["Jane", "Tarzan", "jungle", "wild"],
    signalLexicon: { literal: ["Jane"], mechanical: ["jungle", "born wild", "civilian"] },
    source: source("Penguin Random House — Tarzan of the Apes", "https://www.penguinrandomhouse.com/books/296536/tarzan-of-the-apes-by-edgar-rice-burroughs/", "publisher-book-page")
  },
  {
    id: "gi-jane-film", title: "G.I. Jane", kind: "film", creators: ["Ridley Scott", "David Twohy", "Danielle Alexandra"],
    publicContext: "A fictional woman attempts to qualify through an exclusionary United States special-operations training system.",
    themes: ["exclusion", "qualification", "military-service", "gendered-scrutiny", "endurance"], mechanics: ["selection course", "institutional gate", "prove-by-action"],
    traversalTerms: ["G.I. Jane", "Jane with a G.I.", "military training"],
    signalLexicon: { orthographic: ["Jane with a G.I. Infection"], mechanical: ["Trooper", "service", "prove", "institutional gate"] },
    source: source("Disney+ — G.I. Jane", "https://www.disneyplus.com/en-co/browse/entity-ca663ea4-cbd5-475b-89fc-0326a844fca7", "official-streaming-page")
  },
  {
    id: "dungeons-dragons-natural-twenty", title: "Dungeons & Dragons — natural 20", kind: "tabletop-roleplaying-game-mechanic", creators: ["Wizards of the Coast"], franchise: "Dungeons & Dragons",
    publicContext: "Dungeons & Dragons resolves risky actions through d20 tests; a natural 20 is an unmodified top roll and a critical hit for an attack.",
    themes: ["chance", "wisdom", "role-play", "shared-story", "consequence"], mechanics: ["d20 test", "natural 20", "critical hit", "character role"],
    traversalTerms: ["natty-twenty", "natural 20", "Wisdom", "D&D"],
    signalLexicon: { phonetic: ["natty-twenty"], mechanical: ["Wisdom", "roll", "critical", "government check"] },
    source: source("D&D Beyond Basic Rules — Playing the Game", "https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game", "official-rules")
  },
  {
    id: "pi-kappa-alpha-fraternity", title: "Pi Kappa Alpha", kind: "fraternal-organization", creators: [],
    publicContext: "A college social fraternity whose name marks a literal membership threshold and institutional door in the lyric.",
    themes: ["membership", "brotherhood", "institutional-gate", "belonging"], mechanics: ["admission threshold", "named membership", "chapter house"],
    traversalTerms: ["Pi Kappa Alpha", "PIKE", "let her in"],
    signalLexicon: { literal: ["Pi Kappa Alpha"], mechanical: ["door", "let her in", "brotherhood"] },
    source: source("Pi Kappa Alpha — About", "https://pikes.org/about/", "organization-owned-history")
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
  "litrpg-defiance-of-the-fall": ["Stats, levels, cultivation, and reforging.", "System pressure plus cultivation reframes the lyric's build as a long survival path assembled through choices.", "Progression becomes an authored response to imposed rules.", "Comparative mechanics connect system apocalypse to self-authored build paths."],
  "journey-to-the-west-sun-wukong": ["A monkey-name joke opens the song.", "Wukong activates a rebellious shapeshifter who learns to protect a pilgrimage and carry sutras rather than merely win a boast.", "The teasing encounter becomes the first test of whether wild power can become accountable companionship.", "One proper name supplies trickster energy, transformation, a traveling party, and the song's later sutra vocabulary."],
  "hoyoverse-genshin-gnosis-wish": ["A joke about luck and knowledge.", "Gacha plus Gnosis joins chance-based wishing to a chess-shaped conduit of divine authority.", "The failed flirtation becomes a comic acquisition mistake: treating a person as a pull or prize collides with the song's demand for agency.", "The sound-pair compresses a game economy and an in-world authority object into one corrective beat."],
  "pussycat-dolls-dont-cha": ["A colloquial 'don't you know, sister'.", "The compressed sound opens a performed, teasing call-and-response about comparison and desire.", "Advice about the rejected approach becomes a pop-performance correction, still subject to the song's larger consent test.", "Phonetic title recognition changes conversational filler into a staged musical callback."],
  "bella-ciao-resistance-song": ["A repeated pet-name goodbye.", "The reversed and respelled refrain opens an Italian resistance song carried across languages and struggles for freedom.", "Bella's personal refrain becomes collective memory: departure, refusal, freedom, and a song that outlives any one singer.", "The altered title lets the song invoke resistance without quoting or reproducing the source song."],
  "steppenwolf-born-to-be-wild": ["Bella is naturally adventurous.", "Capitalized born and Wild open Steppenwolf's road-anthem grammar of motion and countercultural freedom.", "The promise to 'take you there' becomes a dangerous temptation to narrate someone else's freedom; later counts must return route choice to Bella.", "A transformed title supplies propulsion and road-space while the screenplay critiques possession."],
  "born-free-elsa": ["Bella wants freedom.", "Born plus Free, joined later by lion imagery, opens Elsa's story of care that succeeds by releasing rather than keeping her.", "Protection becomes rehabilitation toward independence, not permanent carrying or captivity.", "The work supplies a concrete ethical mechanic for every later offer to carry, guard, or open a gate."],
  "billy-squier-song-cluster": ["Jane, squirrels, and a refusal are comic non sequiturs.", "Don't Say No, Squier/squirrels, and Everybody Wants You form a distributed artist-catalog braid across several lines.", "The crowd's desire becomes arena pressure around Bella, sharpening the difference between public demand and her own wish to sing.", "Cross-line title and name sounds convert scattered jokes into an escalating performance-and-consent sequence."],
  "eminem-cinderella-man": ["A fairy-tale man appears at a football game.", "The exact title opens Eminem's second-chance and comeback song with stadium-scale resolve.", "Bella's field performance becomes a recovery entrance rather than decorative spectacle, while the lyric still asks who controls the stage.", "The title imports a full comeback arc immediately before the team and color signals resolve the venue."],
  "uw-huskies-bow-down": ["A generic team in purple and gold takes a field in Seattle.", "Huskies, field entrance, Seattle, and the official purple-and-gold identity converge on the University of Washington and its communal fight-song tradition.", "The scene shifts from private memory to a public Seattle ritual where color, dawn, team, and song preserve devotion.", "A multi-signal place cluster determines setting, crowd motion, palette, and the public scale of the performance without showing logos."],
  "tarzan-jane": ["A woman named Jane performs near the military.", "Jane beside Wild, jungle, and later civilization language opens Tarzan's two-world relationship and identity tension.", "Bella's movement between public institutions and wild freedom can be read as crossing worlds rather than being assigned to either one.", "A candidate character cue creates a two-world visual mechanic while remaining explicitly reviewable."],
  "gi-jane-film": ["A medical joke attaches G.I. to Jane.", "The split phrase opens a film about a woman confronting an exclusionary military selection gate.", "The later Trooper and border language becomes a question of who is permitted to serve and who must repeatedly prove qualification.", "Orthographic wordplay turns an infection joke into institutional pressure and endurance mechanics."],
  "dungeons-dragons-natural-twenty": ["A slang phrase praises good judgment.", "Natty-twenty plus Wisdom resolves into a D&D roll and ability vocabulary.", "The conversation becomes a shared role-play check: insight is uncertain, consequential, and never a substitute for asking Bella.", "A transformed rules phrase supplies chance, character-role, and decision mechanics without fantasy cosplay."],
  "pi-kappa-alpha-fraternity": ["A named building has a closed door.", "Pi Kappa Alpha identifies a literal fraternity threshold and membership institution.", "The ending's 'let her in' stops being generic hospitality and directly tests whether an inherited brotherhood can recognize Bella without making her prove sameness.", "The proper name converts the final door into a social-governance and belonging question."]
};

const connectorSpecs = [
  ["Gates at the Mountain", "robin-hobb-farseer-fitz-fool", "I read Robin Hobb", "But I knew I’m the fool", "explicit-cross-series-braid", 1, ["literal"], "Robin Hobb, Fitz, and the Fool are named directly."],
  ["Gates at the Mountain", "robin-hobb-liveship-traders", "those live ship traders", "In their Wood", "explicit-orthographic-braid", 0.99, ["literal", "orthographic", "cross-reference"], "'live ship traders' splits the title while Molly and Wood braid Farseer into wizardwood."],
  ["I Knew a Bella", "heinlein-starship-troopers", "good Trooper and fly my Starship", null, "explicit-transformed-title", 0.99, ["literal", "phonetic", "mechanical"], "Trooper, Starship, space marines, honor, and 'Henlien' co-occur in one line."],
  ["I Knew a Bella", "bungie-halo-canon", "Halo Two reticules", null, "explicit-title-mechanic", 1, ["literal", "orthographic", "mechanical"], "Halo 2 is named and reticules/reticles carry the shooter mechanic."],
  ["I Knew a Bella", "journey-to-the-west-sun-wukong", "Wukong said", null, "explicit-character-title", 1, ["literal", "mechanical"], "Wukong is named directly; the song's later travel, protection, and sutra language makes the Journey to the West route useful beyond the opening joke."],
  ["I Knew a Bella", "hoyoverse-genshin-gnosis-wish", "Gacha Gnosis", null, "explicit-phonetic-canon-mechanic", 0.98, ["literal", "phonetic", "mechanical"], "The adjacent game terms Gacha and Gnosis deliberately join acquisition-by-chance to an in-world divine authority object."],
  ["I Knew a Bella", "pussycat-dolls-dont-cha", "Doncha’Know, Sis", null, "candidate-phonetic-song-title", 0.91, ["phonetic", "orthographic"], "The compressed spoken sound of 'Doncha' is an audible title cue inside a teasing correction; the connector remains a candidate because the rest of the source title is not present."],
  ["I Knew a Bella", "bella-ciao-resistance-song", "Chiao Baby Chiao", null, "explicit-transformed-title-refrain", 0.99, ["phonetic", "orthographic", "thematic"], "The repeated Italian-address/goodbye refrain reverses and respells Bella Ciao while preserving its audible shape and freedom/departure function."],
  ["I Knew a Bella", "steppenwolf-born-to-be-wild", "She was born Wild", null, "candidate-transformed-title", 0.9, ["orthographic", "thematic"], "Capitalized born/Wild reproduces the title phrase across the Bella statement; it remains candidate-level because the lyric uses the words as ordinary characterization too."],
  ["I Knew a Bella", "born-free-elsa", "She was born Wild and yearned to be Free", null, "candidate-cross-title-mechanic", 0.86, ["orthographic", "thematic", "mechanical"], "Born and Free are joined in the same sentence, while later lion, captivity, and release language corroborates the care-without-keeping ethic."],
  ["I Knew a Bella", "billy-squier-song-cluster", "she played Jane in Don’t Say No", "Everyman man is Go, Go, Go", "candidate-cross-line-catalog-braid", 0.9, ["literal", "phonetic", "orthographic"], "Don't Say No and the transformed Everybody Wants You crowd cue span the same performance passage; Squier/squirrels appears in the next scene as corroboration."],
  ["I Knew a Bella", "billy-squier-song-cluster", "with the Squirells", null, "candidate-phonetic-artist-name", 0.88, ["phonetic", "orthographic", "cross-reference"], "The unusual spelling 'Squirells' sounds like Squier and sits beside two candidate Billy Squier song-title cues."],
  ["I Knew a Bella", "eminem-cinderella-man", "Cinderella Man", null, "explicit-song-title", 1, ["literal", "mechanical"], "The exact song title appears at the opening of the stadium-scale comeback and performance cluster."],
  ["I Knew a Bella", "uw-huskies-bow-down", "Huskies take the field", "Seattle Braves the Way", "explicit-multisignal-place-cluster", 1, ["literal", "orthographic", "mechanical", "thematic"], "Huskies, taking the field, Purple, Gold, Seattle, dawn, and collective singing resolve one University of Washington place-and-performance cluster."],
  ["I Knew a Bella", "tarzan-jane", "she played Jane", null, "candidate-character-two-world", 0.62, ["literal", "mechanical"], "Jane appears in a song already dense with Wild, jungle, liberty, and crossing-between-worlds language, but no Tarzan-specific proper name makes the allusion certain."],
  ["I Knew a Bella", "gi-jane-film", "Jane with a G.I. Infection", null, "explicit-orthographic-title", 0.98, ["orthographic", "literal", "thematic"], "G.I. and Jane are placed together explicitly inside a later service, border, and institutional-qualification passage."],
  ["I Knew a Bella", "dungeons-dragons-natural-twenty", "natty-twenty on Wisdom", null, "explicit-phonetic-mechanic", 0.98, ["phonetic", "mechanical"], "The transformed natural-twenty phrase is paired with Wisdom, a named D&D ability and check vocabulary."],
  ["I Knew a Bella", "pi-kappa-alpha-fraternity", "door to Pi Kappa Alpha", "let her in", "explicit-institution-threshold", 1, ["literal", "mechanical", "thematic"], "The fraternity is named directly and its door becomes the explicit threshold in the final admission/belonging question."],
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
  ["bungie-halo-canon", "square-enix-final-fantasy-viii", "companion-memory-identity", 0.6, ["memory", "humanity", "borrowed power", "duty"], "Cortana and Guardian Forces make power inseparable from memory and identity, though by very different mechanisms."],
  ["journey-to-the-west-sun-wukong", "tarzan-jane", "wild-power-and-social-identity", 0.58, ["wild identity", "two worlds", "protection", "self-mastery"], "Both routes ask whether a figure marked as wild is possessed by another world or can choose how to cross between worlds; this is a comparative traversal, not a claimed shared source."],
  ["hoyoverse-genshin-gnosis-wish", "piers-anthony-incarnations", "authority-object-and-office-holder", 0.64, ["held authority", "role and person", "power transfer", "cosmic order"], "A Gnosis and an Incarnation's office both separate durable authority from its current holder, while differing sharply in acquisition and governance."],
  ["bella-ciao-resistance-song", "uw-huskies-bow-down", "collective-song-as-place-memory", 0.62, ["communal singing", "place identity", "portable memory", "collective voice"], "Both make a group song carry place and identity across time; the graph keeps their political and institutional meanings distinct."],
  ["born-free-elsa", "tarzan-jane", "wild-belonging-and-release", 0.72, ["wildness", "care", "civilization boundary", "freedom"], "Elsa's release and Tarzan/Jane's two-world tension provide complementary tests for whether care enables autonomy or quietly becomes captivity."],
  ["born-free-elsa", "bella-ciao-resistance-song", "personal-and-collective-freedom", 0.64, ["freedom", "departure", "memory", "refusal of captivity"], "Born Free foregrounds one animal's release while Bella Ciao carries collective resistance; together they widen freedom from private rescue to shared refusal."],
  ["billy-squier-song-cluster", "eminem-cinderella-man", "catalog-to-comeback-performance", 0.66, ["arena performance", "public desire", "refusal", "comeback"], "The Squier catalog braid creates crowd pressure and refusal before Cinderella Man supplies a determined comeback entrance."],
  ["eminem-cinderella-man", "uw-huskies-bow-down", "stadium-entrance-performance", 0.83, ["field entrance", "crowd", "resolve", "public song"], "The lyric places Cinderella Man directly beside Huskies taking the field, so the comeback cue and Seattle stadium ritual resolve one audiovisual scene."],
  ["gi-jane-film", "heinlein-starship-troopers", "service-and-qualification", 0.74, ["military service", "institutional gate", "endurance", "belonging"], "G.I. Jane tests exclusion inside a military institution while Starship Troopers links service and civic standing; together they expose who gets to qualify and at what cost."],
  ["dungeons-dragons-natural-twenty", "litrpg-genre-mechanics", "visible-chance-and-character-build", 0.84, ["stats", "role", "chance", "decision"], "A natural-twenty Wisdom check supplies the tabletop probability grammar that LitRPG turns into persistent visible character state."],
  ["pi-kappa-alpha-fraternity", "heinlein-starship-troopers", "membership-and-civic-threshold", 0.63, ["membership", "service", "institutional gate", "belonging"], "The fraternity door and Heinlein's service-mediated franchise are compared as admission systems, not treated as ethically or politically equivalent."],
  ["pussycat-dolls-dont-cha", "billy-squier-song-cluster", "desire-call-and-response", 0.5, ["performed desire", "comparison", "crowd address"], "Don't Cha supplies intimate teasing comparison while Everybody Wants You widens desire into public crowd pressure."]
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
const songReferenceCoverage = Object.fromEntries([...new Set(connectors.map((connector) => connector.target.songId))]
  .sort()
  .map((songId) => {
    const songConnectors = connectors.filter((connector) => connector.target.songId === songId);
    return [songId, {
      connectorCount: songConnectors.length,
      referenceIds: [...new Set(songConnectors.map((connector) => connector.referenceId))].sort(),
      connectorIds: songConnectors.map((connector) => connector.id).sort()
    }];
  }));
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
  songReferenceCoverage,
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
