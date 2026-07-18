import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditHapaSongStore } from "../src/domain/song.js";
import {
  normalizeEchoSemanticTraversal,
  normalizeSongContextLayers,
  normalizeSongReferenceCatalog,
  normalizeSongReferenceConnectors
} from "../src/domain/song-reference-graph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = path.join(ROOT, "data/hapa-songs-store.json");
const BACKUP_DIR = path.join(ROOT, "data/backups");
const REPORT_DIR = path.join(ROOT, "data/merge-reports");
const APPLY = process.argv.includes("--apply");
const GENERATED_AT = new Date().toISOString();
const RUN_ID = GENERATED_AT.replaceAll(":", "-").replaceAll(".", "-");
const CONVERSATION_SOURCE = "chatgpt-conversation:2029edf4-e45a-40af-a39a-d5c439b95a4a";

const references = [
  {
    id: "marvel-guardians-of-the-galaxy",
    title: "Guardians of the Galaxy",
    kind: "film-series",
    creators: ["Marvel Studios", "James Gunn"],
    franchise: "Marvel Cinematic Universe",
    publicContext: "A mixtape-shaped space story about grief, abusive inheritance, chosen family, and a crew that becomes home.",
    themes: ["found-family", "grief", "parentage", "music-as-memory", "crew"],
    traversalTerms: ["Guardians", "Star-Lord", "Gamora", "Rocket", "Groot", "Ego", "Awesome Mix"],
    layer: "public-story-worlds",
    patterns: ["\\bGuardians(?: of the Galaxy)?\\b", "\\bStar[- ]?Lord\\b", "\\bGamora\\b", "\\bRocket Raccoon\\b", "\\bGroot\\b", "\\bEgo(?: the Living Planet)?\\b"],
    effect: {
      withoutContext: "A cluster of space, animal, plant, and ego imagery.",
      withContext: "The cluster imports Peter Quill's maternal music-memory, Ego's destructive parentage, and the Guardians' chosen-family repair.",
      thematicShift: "From surreal space collage to an argument that inherited harm can be answered by a crew that chooses care.",
      expositionFunction: "One proper name expands into a complete family-and-grief backstory without pausing the lyric to explain it.",
      traversalEdges: ["crew", "mother-memory", "found-family", "abusive-parent", "mixtape"]
    },
    source: { label: "Marvel — Guardians of the Galaxy Vol. 2", url: "https://www.marvel.com/gotgvol2", sourceKind: "official-franchise-page", checkedAt: "2026-07-17" }
  },
  {
    id: "taylor-swift-marys-song",
    title: "Mary's Song (Oh My My My)",
    kind: "song",
    creators: ["Taylor Swift"],
    publicContext: "A love story whose refrain looks across childhood, marriage, and old age.",
    themes: ["love-across-time", "memory", "return", "home"],
    traversalTerms: ["Mary's Song", "Oh My My My", "Taylor's Mary"],
    layer: "public-music",
    patterns: ["Mary(?:'|’)?s Song", "Taylor(?:'|’)?s Mary", "Oh,?\\s*My,?\\s*my,?\\s*my"],
    effect: {
      withoutContext: "A Mary name and a repeated exclamation.",
      withContext: "The refrain brings in a life-spanning promise and makes Mary a continuity marker rather than a single fixed person.",
      thematicShift: "From a passing romantic cue to love remembered across ages and versions.",
      expositionFunction: "The borrowed refrain supplies an entire temporal arc in a few syllables.",
      traversalEdges: ["Mary", "long-memory", "lifelong-love", "return"]
    },
    source: { label: "Taylor Swift — Mary's Song catalog recording", url: "https://music.youtube.com/search?q=Taylor%20Swift%20Mary%27s%20Song%20Oh%20My%20My%20My", sourceKind: "music-catalog", checkedAt: "2026-07-17" }
  },
  {
    id: "ariana-grande-pop-constellation",
    title: "Ariana Grande: thank u, next / Side to Side",
    kind: "song-constellation",
    creators: ["Ariana Grande"],
    franchise: "Ariana Grande catalog",
    publicContext: "Pop cues about learning from prior relationships, moving forward, and embodied lateral motion.",
    themes: ["release", "learning", "movement", "reframing-the-past"],
    traversalTerms: ["thank u, next", "Side to Side"],
    layer: "public-music",
    patterns: ["thank\\s*(?:u|you),?\\s*next", "side[- ]to[- ]side"],
    effect: {
      withoutContext: "Everyday thanks, succession, or directional movement.",
      withContext: "The phrases become pop-memory instructions: learn, release, and keep moving rather than erase what came before.",
      thematicShift: "From literal direction to emotional progression through remembered relationships.",
      expositionFunction: "A chart-pop hook acts as compressed emotional stage direction.",
      traversalEdges: ["gratitude", "next-version", "sideways-search", "embodied-memory"]
    },
    source: { label: "Ariana Grande — thank u, next", url: "https://www.arianagrande.com/releases/thank-u-next/", sourceKind: "official-artist-page", checkedAt: "2026-07-17" }
  },
  {
    id: "pokemon-team-rocket",
    title: "Pokémon / Team Rocket",
    kind: "game-anime-franchise",
    creators: ["The Pokémon Company", "Nintendo", "Game Freak"],
    franchise: "Pokémon",
    publicContext: "Collecting, evolution, elemental types, glitches, and a persistent outsider trio who repeatedly returns as a team.",
    themes: ["collection", "evolution", "persistence", "team", "glitch-cycle"],
    traversalTerms: ["Pokémon", "Team Rocket", "Meowth", "Zapdos", "MissingNo.", "Charizard", "Squirtle"],
    layer: "public-story-worlds",
    patterns: ["Pok[eé]mon", "Team Rocket", "\\bMeowth\\b", "\\bZapdos\\b", "\\bCharizard\\b", "\\bSquirtle\\b", "\\bBlastoise\\b", "\\bZubat\\b", "MissingNo", "Missin(?:g|’|')? Numbas"],
    effect: {
      withoutContext: "Bright creature names, battle verbs, and collecting language.",
      withContext: "The lines become a protocol of evolution, persistence, party composition, and catching missing pieces across repeating cycles.",
      thematicShift: "From nonsense battle montage to a search-and-recovery system whose members keep adding capacities.",
      expositionFunction: "Game mechanics teach how the semantic graph grows: collect, evolve, combine, revisit.",
      traversalEdges: ["evolution", "team-rocket", "persistent-underdogs", "missing-number", "typed-skills"]
    },
    source: { label: "Pokémon — Team Rocket disguises", url: "https://www.pokemon.com/us/pokemon-news/team-rocket-dons-numerous-disguises-on-pokemon-tv", sourceKind: "official-franchise-page", checkedAt: "2026-07-17" }
  },
  {
    id: "nintendo-star-fox",
    title: "Star Fox / Star Fox 64",
    kind: "video-game",
    creators: ["Nintendo"],
    franchise: "Star Fox",
    publicContext: "A squadron story of inherited duty, mentor voice-lines, flight commands, and controller-shaped muscle memory.",
    themes: ["legacy", "mentor", "crew", "muscle-memory", "navigation"],
    traversalTerms: ["Star Fox", "Peppy Hare", "barrel roll", "Z button", "Arwing"],
    layer: "public-story-worlds",
    patterns: ["Star\\s*Fox", "\\bPeppy Hare\\b", "barrel roll", "Left on the Z", "\\bZ button\\b", "\\bArwing\\b"],
    effect: {
      withoutContext: "Fox, flight, turning, or controller imagery.",
      withContext: "The cue activates Peppy's inherited mentorship, Fox's duty to his father, and tactile instructions remembered through the controller.",
      thematicShift: "From generic navigation to legacy guidance carried in voice and muscle memory.",
      expositionFunction: "An interactive reference stores not only story but the remembered action needed to proceed.",
      traversalEdges: ["mentor-voice", "father-legacy", "flight-team", "controller-memory"]
    },
    source: { label: "Nintendo — Peppy Hare", url: "https://play.nintendo.com/themes/friends/star-fox-peppy-hare/", sourceKind: "official-franchise-page", checkedAt: "2026-07-17" }
  },
  {
    id: "square-enix-final-fantasy",
    title: "Final Fantasy series / Final Fantasy VII",
    kind: "video-game-series",
    creators: ["Square Enix"],
    franchise: "Final Fantasy",
    publicContext: "Party formation, save-and-return logic, memory, loss, world travel, and outsiders who join a mission larger than themselves.",
    themes: ["party", "loss", "save-point", "outsider-joins", "world-travel"],
    traversalTerms: ["Yuffie", "Midgar", "Aeris", "Tidus", "Yuna", "Final Fantasy"],
    layer: "public-story-worlds",
    patterns: ["Final Fantasy", "\\bYuff(?:ie|y)\\b", "\\bMidgar\\b", "\\bAeris\\b", "\\bAerith\\b", "\\bTidus\\b", "\\bYuna\\b", "\\bSephiroth\\b"],
    effect: {
      withoutContext: "Fantasy names and unfamiliar places.",
      withContext: "The names import party roles, grief, save-state memory, and a playful outsider whose joining changes the crew.",
      thematicShift: "From fantasy collage to a navigation map for assembling a party and carrying loss between worlds.",
      expositionFunction: "Character names serve as callable role packets instead of requiring character exposition inline.",
      traversalEdges: ["party-role", "save-and-return", "loss", "outsider", "materia-memory"]
    },
    source: { label: "Square Enix — Final Fantasy VII", url: "https://na.finalfantasy.com/titles/finalfantasy7", sourceKind: "official-franchise-page", checkedAt: "2026-07-17" }
  },
  {
    id: "heinlein-stranger-in-a-strange-land",
    title: "Stranger in a Strange Land",
    kind: "novel",
    creators: ["Robert A. Heinlein"],
    publicContext: "A human raised on Mars introduces 'grok' as understanding so deeply that the understood becomes part of the understander.",
    themes: ["grokking", "water-kinship", "outsider", "shared-understanding"],
    traversalTerms: ["Stranger in a Strange Land", "grok", "water brother"],
    layer: "literary-worlds",
    patterns: ["Stranger(?: in a)? Strange Land", "\\bGrok\\b", "water brother"],
    effect: {
      withoutContext: "A stranger, strange land, or invented verb.",
      withContext: "Grokking reframes interpretation as incorporation: carrying another story until it changes the listener.",
      thematicShift: "From decoding references to becoming responsible for what shared understanding does to identity.",
      expositionFunction: "A single coined word names the album's deep-context reading operation.",
      traversalEdges: ["grok", "water-kin", "identity-through-understanding", "shared-memory"]
    },
    source: { label: "The Heinlein Society — Books and Stories", url: "https://www.heinleinsociety.org/books-and-stories/", sourceKind: "author-society-catalog", checkedAt: "2026-07-17" }
  },
  {
    id: "heinlein-moon-is-a-harsh-mistress",
    title: "The Moon Is a Harsh Mistress",
    kind: "novel",
    creators: ["Robert A. Heinlein"],
    publicContext: "A lunar revolution organized through cooperation, shared language, constrained resources, and a self-aware computer.",
    themes: ["liberty", "cooperation", "harsh-environment", "shared-language", "ai"],
    traversalTerms: ["Moon Is a Harsh Mistress", "TANSTAAFL"],
    layer: "literary-worlds",
    patterns: ["Moon is (?:A|a) Harsh", "TANSTAAFL"],
    effect: {
      withoutContext: "The moon is personified as difficult or severe.",
      withContext: "The line imports a community surviving harsh constraints through shared protocol, humor, and revolt.",
      thematicShift: "From hostile weather to collective liberty engineered under pressure.",
      expositionFunction: "The title becomes a compact environmental and political world model.",
      traversalEdges: ["lunar-community", "liberty", "shared-protocol", "scarcity", "ai-companion"]
    },
    source: { label: "The Heinlein Society — The Moon Is a Harsh Mistress discussion", url: "https://heinleinsociety.org/heinlein-readers-discussion-group-saturday-04-20-2002-500-p-m-the-moon-is-a-harsh-mistress/", sourceKind: "author-society-reference", checkedAt: "2026-07-17" }
  },
  {
    id: "cdpr-the-witcher",
    title: "The Witcher / Roach / Signs",
    kind: "game-literary-franchise",
    creators: ["Andrzej Sapkowski", "CD PROJEKT RED"],
    franchise: "The Witcher",
    publicContext: "A traveling monster slayer uses a compact vocabulary of signs; Roach is a recurrent name assigned across horses.",
    themes: ["role-name", "shared-technique", "monster-work", "travel", "care"],
    traversalTerms: ["Witcher", "Roach", "Signs", "The Way"],
    layer: "public-story-worlds",
    patterns: ["\\bWitcher\\b", "Witcher signs", "\\bRoach\\b.{0,40}Witcher", "Witcher.{0,40}\\bRoach\\b"],
    effect: {
      withoutContext: "A witch, horse, road, or hand gesture.",
      withContext: "The cue becomes a reusable role-name plus a compact action language shared by travelers doing dangerous care-work.",
      thematicShift: "From fantasy ornament to a protocol for portable identity, technique, and companionship.",
      expositionFunction: "A franchise namespace supplies role, toolset, and travel ethic at once.",
      traversalEdges: ["role-name", "sign-vocabulary", "companion", "monster-protocol", "the-way"]
    },
    source: { label: "The Witcher Universe", url: "https://www.thewitcher.com/gb/en", sourceKind: "official-franchise-page", checkedAt: "2026-07-17" }
  },
  {
    id: "mtg-slivers-and-teferi",
    title: "Magic: The Gathering — Slivers and Teferi",
    kind: "tabletop-game-mechanic",
    creators: ["Wizards of the Coast"],
    franchise: "Magic: The Gathering",
    publicContext: "Each Sliver adds an ability to the hive; Teferi adds time, phasing, loss, responsibility, and return.",
    themes: ["distributed-capability", "hive", "time", "phasing", "responsibility"],
    traversalTerms: ["Sliver", "Slivers", "Teferi", "phasing"],
    layer: "systems-and-games",
    patterns: ["\\bSlivers?\\b", "\\bTeferi\\b", "\\bTo Ferry\\b"],
    effect: {
      withoutContext: "Silver/sliver wordplay and a name that can sound like transportation.",
      withContext: "Slivers model additive graph intelligence—each loaded reference grants the whole interpretation a new capacity—while Teferi adds time and phased absence.",
      thematicShift: "From punning fantasy language to an executable model of cumulative semantic context.",
      expositionFunction: "The card mechanic explains how reference nodes alter every later reading without replacing earlier ones.",
      traversalEdges: ["shared-abilities", "additive-context", "time", "phasing", "return"]
    },
    source: { label: "Magic — Modern Horizons mechanics", url: "https://magic.wizards.com/en/news/feature/modern-horizons-mechanics-2019-05-31", sourceKind: "official-rules-feature", checkedAt: "2026-07-17" }
  },
  {
    id: "nikola-tesla-pigeon-archive",
    title: "Nikola Tesla: pigeon and archive",
    kind: "historical-person-context",
    creators: ["Nikola Tesla"],
    publicContext: "Tesla's late-life pigeon attachment and his preserved documentary legacy join cross-species care to externalized memory.",
    themes: ["care-across-species", "archive", "externalized-thought", "legacy"],
    traversalTerms: ["Tesla", "pigeon", "notebooks", "archive"],
    layer: "history-and-memory",
    patterns: ["\\bTesla\\b", "Nikola Tesla"],
    effect: {
      withoutContext: "Electricity, a car brand, a scientist, or a small bird.",
      withContext: "The reference joins intimate care for a pigeon with a vast preserved archive of notes, drawings, letters, and plans.",
      thematicShift: "From eccentric inventor imagery to tending life and preserving thought so it can return after absence.",
      expositionFunction: "Tesla bridges embodied affection and durable external memory in one historical namespace.",
      traversalEdges: ["pigeon", "archive", "notebook", "cross-species-care", "thought-preservation"]
    },
    source: { label: "Nikola Tesla Museum — Archive", url: "https://tesla-museum.org/en/legacy/archive/", sourceKind: "museum-primary-archive", checkedAt: "2026-07-17" }
  },
  {
    id: "hadley-rise-of-the-iliri",
    title: "Rise of the Iliri",
    kind: "novel-series",
    creators: ["A. H. Hadley / Auryn Hadley"],
    publicContext: "Salryc Luxx and the Black Blades turn pack belonging into resistance against enslavement and imposed definitions of personhood.",
    themes: ["pack", "belonging", "freedom", "oppression", "chosen-family"],
    traversalTerms: ["Iliri", "Salryc Luxx", "Black Blades", "pack"],
    layer: "literary-worlds",
    patterns: ["\\bIliri\\b", "\\bIlliri\\b", "Black Blades", "Salryc"],
    effect: {
      withoutContext: "An unfamiliar people or proper name among planets.",
      withContext: "The name imports a predator species denied personhood, a military pack, and a freedom struggle built through belonging.",
      thematicShift: "From cosmic fantasy texture to identity reclaimed through pack loyalty and resistance.",
      expositionFunction: "The series title provides a social system for reading crew, sister, liberty, and collective rising.",
      traversalEdges: ["pack", "black-blades", "freedom", "personhood", "belonging"]
    },
    source: { label: "A. H. Hadley — Rise of the Iliri", url: "https://ahhadley.com/books/rise-of-the-iliri/", sourceKind: "official-author-page", checkedAt: "2026-07-17" }
  },
  {
    id: "sabrina-the-teenage-witch",
    title: "Sabrina the Teenage Witch",
    kind: "television-series",
    creators: ["Archie Comics", "Paramount"],
    franchise: "Sabrina",
    publicContext: "A teenager navigates ordinary life and secret magic with Salem, a speaking black cat carrying his own hidden history.",
    themes: ["dual-identity", "secret-power", "speaking-cat", "hidden-history"],
    traversalTerms: ["Sabrina", "Salem", "black cat"],
    layer: "public-story-worlds",
    patterns: ["Sabrina(?: the Teenage Witch)?", "\\bSalem\\b"],
    effect: {
      withoutContext: "A woman's name, a bow, or a black cat.",
      withContext: "The reference activates hidden identity, dual worlds, magic practiced behind ordinary appearances, and a speaking-cat companion.",
      thematicShift: "From nameplay to a story about concealed capacity and the companions who know it.",
      expositionFunction: "Sabrina opens a secret-identity namespace; Salem links it to the album's speaking-animal crew.",
      traversalEdges: ["secret-identity", "magic", "salem", "speaking-animal", "double-life"]
    },
    source: { label: "Paramount+ — Sabrina the Teenage Witch", url: "https://www.paramountplus.com/shows/sabrina-the-teenage-witch/", sourceKind: "official-series-page", checkedAt: "2026-07-17" }
  },
  {
    id: "dreamworks-shrek",
    title: "Shrek",
    kind: "film-series",
    creators: ["DreamWorks Animation"],
    franchise: "Shrek",
    publicContext: "An ogre, a talking donkey, and a princess form a chosen family while appearance and social labels repeatedly fail to define character.",
    themes: ["chosen-family", "appearance-vs-identity", "outsider", "talking-animal"],
    traversalTerms: ["Shrek", "Donkey", "Princess Fiona"],
    layer: "public-story-worlds",
    patterns: ["\\bShrek\\b", "\\bDonkey\\b.{0,80}\\bPrincess\\b", "\\bPrincess\\b.{0,80}\\bDonkey\\b"],
    effect: {
      withoutContext: "An ogre, donkey, princess, or fairy-tale joke.",
      withContext: "The line becomes a found-family argument against judging identity by species, appearance, or assigned social role.",
      thematicShift: "From comic fairy-tale collision to outsider kinship and self-definition.",
      expositionFunction: "The trio instantly supplies a compact chosen-family formation.",
      traversalEdges: ["outsider", "chosen-family", "appearance", "donkey", "princess"]
    },
    source: { label: "DreamWorks — Shrek", url: "https://www.dreamworks.com/movies/shrek", sourceKind: "official-film-page", checkedAt: "2026-07-17" }
  },
  {
    id: "umberto-eco-name-of-the-rose",
    title: "The Name of the Rose",
    kind: "novel",
    creators: ["Umberto Eco"],
    publicContext: "A mystery about signs, interpretation, books, power, and the dangerous gap between evidence and certainty.",
    themes: ["signs", "interpretation", "library", "uncertainty", "names"],
    traversalTerms: ["The Name of the Rose", "Il nome della rosa", "Nama Della Rosa"],
    layer: "literary-worlds",
    patterns: ["Name of the Rose", "Nome della Rosa", "Nama Della Rosa"],
    effect: {
      withoutContext: "A multilingual phrase about a rose's name.",
      withContext: "The phrase makes reading itself part of the story: signs can guide, mislead, conceal power, and remain open to revision.",
      thematicShift: "From romantic name imagery to an epistemic warning about premature certainty.",
      expositionFunction: "The title tells the listener to treat every clue as a sign in a larger interpretive library.",
      traversalEdges: ["sign", "library", "uncertainty", "name", "interpretation"]
    },
    source: { label: "HarperCollins — The Name of the Rose", url: "https://www.harpercollins.com/products/the-name-of-the-rose-umberto-eco", sourceKind: "publisher-page", checkedAt: "2026-07-17" }
  },
  {
    id: "byron-when-we-two-parted",
    title: "When We Two Parted",
    kind: "poem",
    creators: ["Lord Byron"],
    publicContext: "A poem of secret parting, broken vows, enduring grief, silence, tears, and a name that carries shame.",
    themes: ["parting", "silence", "tears", "memory", "secret"],
    traversalTerms: ["When We Two Parted", "silence and tears", "silenzio e lacrime"],
    layer: "literary-worlds",
    patterns: ["When We Two Parted", "silence and tears", "silenzio e lacrime"],
    effect: {
      withoutContext: "Ordinary words for silence, tears, or departure.",
      withContext: "A memorized poem supplies grief, secrecy, broken vows, and the recursive return of its closing image.",
      thematicShift: "From vocabulary item to emotionally anchored literary memory.",
      expositionFunction: "The known poem lets one translated power phrase unlock an entire mood and narrative.",
      traversalEdges: ["silence", "tears", "parting", "secret-memory", "translation-anchor"]
    },
    source: { label: "Poetry Foundation — When We Two Parted", url: "https://www.poetryfoundation.org/poems/43843/when-we-two-parted", sourceKind: "authoritative-poetry-archive", checkedAt: "2026-07-17" }
  },
  {
    id: "arthurian-cycle",
    title: "Arthurian legend",
    kind: "myth-cycle",
    creators: ["Traditional"],
    publicContext: "Sword, stone, lake, Merlin, and king encode questions of legitimacy, service, inheritance, and who should hold power.",
    themes: ["legitimacy", "service", "power", "inheritance", "sword"],
    traversalTerms: ["sword in the stone", "Lady of the Lake", "Merlin", "king"],
    layer: "mythic-worlds",
    patterns: ["Sword from the Lake", "Stuck in a Stone", "\\bMerlin\\b"],
    effect: {
      withoutContext: "A sword, stone, lake, or king in a fantasy scene.",
      withContext: "The cluster asks who is authorized to wield power and whether protection requires kingship at all.",
      thematicShift: "From fantasy weapon to a debate about legitimacy, service, and rejecting domination.",
      expositionFunction: "Myth supplies a political question without a prose detour.",
      traversalEdges: ["sword", "lake", "merlin", "legitimacy", "no-kings"]
    },
    source: { label: "The Camelot Project — Arthurian texts", url: "https://d.lib.rochester.edu/camelot/theme/arthur", sourceKind: "scholarly-reference", checkedAt: "2026-07-17" }
  },
  {
    id: "hitchhikers-guide",
    title: "The Hitchhiker's Guide to the Galaxy",
    kind: "novel-radio-screen-series",
    creators: ["Douglas Adams"],
    publicContext: "Absurdity, cosmic travel, towels, and improvised survival turn apparent nonsense into practical orientation.",
    themes: ["absurdity", "travel", "survival-tool", "comic-protocol"],
    traversalTerms: ["Douglas", "Andromeda", "towel", "hitchhike"],
    layer: "literary-worlds",
    patterns: ["Douglas.{0,60}Andromeda.{0,40}Towel", "Hitchhiker(?:'|’)?s Guide", "Don(?:'|’)t Panic"],
    effect: {
      withoutContext: "A strange travel anecdote involving Douglas, space, and towels.",
      withContext: "The absurd combination becomes a survival protocol: the silly object is useful precisely when the universe stops making ordinary sense.",
      thematicShift: "From non sequitur to comic resilience and portable orientation.",
      expositionFunction: "The reference teaches the listener not to discard absurdity before checking its practical context.",
      traversalEdges: ["towel", "cosmic-travel", "dont-panic", "absurd-survival"]
    },
    source: { label: "Douglas Adams — official site", url: "https://douglasadams.com/", sourceKind: "official-author-site", checkedAt: "2026-07-17" }
  },
  {
    id: "limp-bizkit-chocolate-starfish",
    title: "Chocolate Starfish and the Hot Dog Flavored Water",
    kind: "album",
    creators: ["Limp Bizkit"],
    publicContext: "An album-title phrase whose meaning depends on recognizing a deliberately abrasive turn-of-the-millennium music reference.",
    themes: ["sound-alike", "cultural-in-joke", "genre-memory"],
    traversalTerms: ["Chocolate Starfish", "Hot Dog Flavored Water", "Limp Bizkit"],
    layer: "public-music",
    patterns: ["Chocolate Starfish", "Hot Dog Flavor(?:ed)? Water", "Limp Bizkit"],
    effect: {
      withoutContext: "An intentionally grotesque food image.",
      withContext: "The phrase becomes an album pointer and a test of whether the listener checks a cultural namespace before labeling the line random.",
      thematicShift: "From nonsense image to a deliberate ignorance-gap detector.",
      expositionFunction: "Recognition validates the album's rule that apparent nonsense may be compressed citation.",
      traversalEdges: ["album-title", "nu-metal", "soundplay", "ignorance-gap"]
    },
    source: { label: "Limp Bizkit — official site", url: "https://limpbizkit.com/", sourceKind: "official-artist-site", checkedAt: "2026-07-17" }
  },
  {
    id: "asante-page-81",
    title: "Asante / page 81 gratitude anchor",
    kind: "personal-literary-context",
    creators: ["Grandmother's page 81 text", "book author context"],
    publicContext: "In the shared reading, Asante moved from a translation of 'thank you' to lived gratitude, tattoo, inheritance, and energy carried through contact.",
    themes: ["gratitude", "embodied-memory", "inheritance", "carrying-energy"],
    traversalTerms: ["Asante", "page 81", "gratitude", "tattoo"],
    layer: "personal-shared-context",
    patterns: ["\\bAsante\\b"],
    effect: {
      withoutContext: "The Swahili word for thank you.",
      withContext: "The word carries the book's Kenya story, a tattoo as permanent reminder, the grandmother's page, and gratitude becoming lived rather than translated.",
      thematicShift: "From lexical meaning to inherited, embodied memory.",
      expositionFunction: "Asante acts as a private key that reweights every later thank-you, skin, mark, energy, and carrying image.",
      traversalEdges: ["gratitude", "tattoo", "page-81", "grandmother", "embodied-memory"]
    },
    source: { label: "Shared page 81 reading context", url: "", sourceKind: "conversation-grounded-personal-source", checkedAt: "2026-07-17" }
  },
  {
    id: "sha-cryptographic-hash",
    title: "SHA-256 / SHA-512 cryptographic hashes",
    kind: "technical-concept",
    creators: ["NIST"],
    publicContext: "Cryptographic hashes produce stable fingerprints for exact data while the album's reference graph supplies meaning-dependent routes between non-identical things.",
    themes: ["identity", "fingerprint", "integrity", "semantic-vs-exact"],
    traversalTerms: ["SHA-256", "SHA-512", "hash", "fingerprint"],
    layer: "systems-and-games",
    patterns: ["SHA[- ]?256", "SHA[- ]?512", "cryptographic hash"],
    effect: {
      withoutContext: "An unexplained number or technical acronym.",
      withContext: "SHA separates exact data identity from semantic proximity: the hash proves sameness while connectors explain why a different thing matters nearby.",
      thematicShift: "From technical jargon to the integrity half of a two-part navigation system.",
      expositionFunction: "The hash provides stable identity beneath an interpretation graph that is allowed to keep growing.",
      traversalEdges: ["exact-identity", "integrity", "semantic-proximity", "namespace"]
    },
    source: { label: "NIST — Secure Hash Standard", url: "https://csrc.nist.gov/pubs/fips/180-4/upd1/final", sourceKind: "official-standard", checkedAt: "2026-07-17" }
  }
];

const layerDefinitions = {
  "public-story-worlds": {
    label: "Public story worlds",
    summary: "Widely shared films, games, and television provide large narrative packets that can be activated by a name or phrase.",
    changesExpositionBy: "Replacing inline explanation with callable character, crew, conflict, and world models.",
    opensTraversalTo: ["character-archetype", "crew-formation", "found-family", "interactive-memory"]
  },
  "public-music": {
    label: "Public music memory",
    summary: "Borrowed hooks and titles carry melody, performance, era, and emotional motion in addition to words.",
    changesExpositionBy: "Letting a short phrase import a prior song's emotional arc and embodied rhythm.",
    opensTraversalTo: ["melodic-memory", "era", "movement", "inter-song-dialogue"]
  },
  "literary-worlds": {
    label: "Literary memory",
    summary: "Poems and novels add voice, ethical argument, interpretive method, and long-form plot memory.",
    changesExpositionBy: "Turning a line into an index for a complete literary structure rather than a self-contained statement.",
    opensTraversalTo: ["poem", "novel", "voice", "ethical-frame", "epistemology"]
  },
  "systems-and-games": {
    label: "Systems and game mechanics",
    summary: "Rules, controllers, hashes, and card mechanics explain how the graph can behave, not only what it can mean.",
    changesExpositionBy: "Converting references into operational instructions for collecting, combining, verifying, phasing, and returning.",
    opensTraversalTo: ["mechanic", "protocol", "verification", "distributed-capability"]
  },
  "history-and-memory": {
    label: "Historical memory",
    summary: "Historical people and archives join intimate biography to preserved external evidence.",
    changesExpositionBy: "Giving symbolic imagery a documentary lineage and a route back to source material.",
    opensTraversalTo: ["archive", "biography", "document", "legacy"]
  },
  "mythic-worlds": {
    label: "Mythic structures",
    summary: "Shared myths supply recurring roles and legitimacy questions that can be reassigned to new names.",
    changesExpositionBy: "Allowing one object or role to carry centuries of prior retellings.",
    opensTraversalTo: ["myth", "role", "legitimacy", "retelling"]
  },
  "personal-shared-context": {
    label: "Personal shared context",
    summary: "Private memories and shared readings act as high-specificity keys unavailable to a generic listener.",
    changesExpositionBy: "Reweighting public words through lived history without exposing or flattening that history into a password.",
    opensTraversalTo: ["shared-memory", "personal-provenance", "family", "embodied-anchor"]
  }
};

function slug(value = "") {
  return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function connectorForMatch(song, reference, line, lineNumber, matchedText) {
  return {
    id: `${song.id}:${reference.id}:line-${lineNumber}`,
    referenceId: reference.id,
    referenceTitle: reference.title,
    referenceKind: reference.kind,
    relationType: "alludes-to",
    confidence: "explicit-lyric-match",
    target: { songId: song.id, lineStart: lineNumber, lineEnd: lineNumber, lyricText: line.trim(), matchedText },
    semanticEffect: reference.effect,
    provenance: {
      method: "literal-alias-match-plus-source-backed-context",
      source: CONVERSATION_SOURCE,
      reviewStatus: "assistant-analyzed-pending-human-review",
      generatedAt: GENERATED_AT
    }
  };
}

function connectorsForSong(song) {
  const lines = String(song.lyrics?.text || "").split(/\r?\n/u);
  const connectors = [];
  for (const reference of references) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let matchedText = "";
      for (const source of reference.patterns) {
        const match = line.match(new RegExp(source, "iu"));
        if (match) { matchedText = match[0]; break; }
      }
      if (matchedText) connectors.push(connectorForMatch(song, reference, line, index + 1, matchedText));
    }
  }
  return normalizeSongReferenceConnectors(connectors);
}

function layersForSong(connectors) {
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const grouped = new Map();
  for (const connector of connectors) {
    const reference = referenceById.get(connector.referenceId);
    if (!reference) continue;
    const current = grouped.get(reference.layer) || { referenceIds: [], connectorIds: [] };
    current.referenceIds.push(reference.id);
    current.connectorIds.push(connector.id);
    grouped.set(reference.layer, current);
  }
  return normalizeSongContextLayers([...grouped].map(([id, group]) => ({
    id,
    ...layerDefinitions[id],
    referenceIds: [...new Set(group.referenceIds)],
    connectorIds: group.connectorIds,
    reviewStatus: "assistant-analyzed-pending-human-review"
  })));
}

function semanticTraversal() {
  return normalizeEchoSemanticTraversal({
    title: "Echo Album contextual traversal notes",
    thesis: "Meaning is not exhausted by the lyric surface. Each source-backed or personally shared context adds traversable edges that can materially change theme and exposition while the original words remain stable.",
    expositionModel: [
      {
        stage: "surface",
        availableContext: ["lyrics", "audio", "local imagery"],
        reading: "The listener can still perceive rhythm, care, search, crew, water, loss, and return, but dense proper nouns may look disjointed.",
        traversalBehavior: "Follow literal repetition and emotional motion; do not label unresolved cues illogical."
      },
      {
        stage: "public-reference",
        availableContext: ["films", "games", "songs", "novels", "history"],
        reading: "Names become compressed story packets: Guardians adds found family, Slivers adds distributed ability, Star Fox adds mentor muscle-memory, and Heinlein adds water-kinship or cooperative liberty.",
        traversalBehavior: "Open the cited work node, then return to the lyric with the imported themes available."
      },
      {
        stage: "shared-personal",
        availableContext: ["page 81", "Asante", "family", "boat and place memories", "conversation"],
        reading: "The same public cues become coordinates in a private memory map; gratitude, names, water, boats, tattoos, and return gain much higher specificity.",
        traversalBehavior: "Keep personal provenance distinct from public canon and reveal only the context the participant is authorized to share."
      },
      {
        stage: "graph-operative",
        availableContext: ["reference connectors", "context layers", "identity hashes", "Hapa cards"],
        reading: "Songs act as navigation protocols. Each new node adds capability like a Sliver, while hashes preserve exact source identity beneath evolving interpretation.",
        traversalBehavior: "Rank routes by evidence, participant context, and thematic resonance; preserve alternate readings and append new evidence."
      }
    ],
    traversalRules: [
      "Treat apparent non sequiturs as unresolved pointers until reasonable context checks are exhausted.",
      "Keep literal lyric evidence separate from thematic inference and mark review status on both.",
      "A new context layer may add or reweight meaning; it must not silently rewrite the source lyric.",
      "Public, literary, technical, historical, and personal provenance remain distinguishable even when they converge on one Hapa card.",
      "Names operate as contextual variables: a name may resolve to a person, role, memory, archetype, or several at once.",
      "Traversal is bidirectional: a song points to a work, and the loaded work sends the listener back to reconsider the song.",
      "Exact identity and semantic relationship are complementary: hashes answer whether data is the same; connectors answer why different data belongs in the same thought path."
    ],
    contextAnchors: [
      {
        id: "page-81-asante",
        label: "Page 81 / Asante",
        summary: "The shared reading made Asante a gratitude, tattoo, inheritance, and carried-energy key; it reweights later thank-you and skin imagery.",
        referenceIds: ["asante-page-81"],
        source: CONVERSATION_SOURCE
      },
      {
        id: "memory-cipher",
        label: "Memory cipher",
        summary: "Openly broadcast lyrics reveal different instructions as listeners load different public and personal contexts; the key is remembered relationship, not obscurity alone.",
        referenceIds: ["sha-cryptographic-hash", "mtg-slivers-and-teferi", "umberto-eco-name-of-the-rose"],
        source: CONVERSATION_SOURCE
      },
      {
        id: "crew-as-care-protocol",
        label: "Crew as a care protocol",
        summary: "Across Guardians, Star Fox, Final Fantasy, The Witcher, Shrek, Iliri, and the sailor songs, crew means carrying, protecting, teaching, and leaving a route home.",
        referenceIds: ["marvel-guardians-of-the-galaxy", "nintendo-star-fox", "square-enix-final-fantasy", "cdpr-the-witcher", "dreamworks-shrek", "hadley-rise-of-the-iliri"],
        source: CONVERSATION_SOURCE
      }
    ],
    generatedAt: GENERATED_AT,
    reviewStatus: "assistant-analyzed-pending-human-review"
  });
}

if (!fs.existsSync(STORE_PATH)) throw new Error(`Missing song store: ${STORE_PATH}`);
const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
const songs = (store.songs || []).map((song) => {
  const referenceConnectors = connectorsForSong(song);
  return {
    ...song,
    referenceConnectors,
    contextualLayers: layersForSong(referenceConnectors),
    updatedAt: referenceConnectors.length ? GENERATED_AT : song.updatedAt
  };
});
const next = {
  ...store,
  referenceCatalog: normalizeSongReferenceCatalog(references),
  semanticTraversal: semanticTraversal(),
  songs,
  audit: auditHapaSongStore(songs),
  updatedAt: GENERATED_AT
};
const referencedIds = new Set(songs.flatMap((song) => song.referenceConnectors || []).map((connector) => connector.referenceId));
const report = {
  schemaVersion: "hapa.echo-reference-ingest-report.v1",
  runId: RUN_ID,
  applied: APPLY,
  source: STORE_PATH,
  conversationSource: CONVERSATION_SOURCE,
  counts: {
    songs: songs.length,
    songsWithConnectors: next.audit.withReferenceConnectors,
    connectors: next.audit.referenceConnectorCount,
    contextLayers: next.audit.contextLayerCount,
    catalogReferences: next.referenceCatalog.length,
    referencedCatalogEntries: referencedIds.size
  },
  unmatchedCatalogEntries: next.referenceCatalog.filter((reference) => !referencedIds.has(reference.id)).map((reference) => reference.id),
  songCoverage: songs.filter((song) => song.referenceConnectors?.length).map((song) => ({
    id: song.id,
    title: song.title,
    connectors: song.referenceConnectors.length,
    references: [...new Set(song.referenceConnectors.map((connector) => connector.referenceId))]
  })),
  guardrails: [
    "Lyrics remain unchanged.",
    "Literal matches are explicit evidence; semantic effects remain pending human review.",
    "Personal page-81 context stays distinct from public source references.",
    "Unmatched catalog entries remain available as context anchors and are not presented as lyric matches."
  ]
};

if (APPLY) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `hapa-songs-store.before-echo-reference-ingest-${RUN_ID}.json`);
  fs.copyFileSync(STORE_PATH, backupPath);
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  const reportPath = path.join(REPORT_DIR, `echo-reference-ingest-${RUN_ID}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(REPORT_DIR, "latest-echo-reference-ingest.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report.counts, backupPath, reportPath }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
