export const ECHO_ALBUM_RESEARCH_PASS_SCHEMA = "hapa.echo-album-research-pass.v1";
export const ECHO_REFERENCE_IMAGE_PROMPT_SCHEMA = "hapa.echo-reference-image-prompt.v1";
export const ECHO_SONG_CONNECTION_SCHEMA = "hapa.echo-song-connection.v1";

const STOP_WORDS = new Set("a an and are as at be been but by can could did do does for from had has have he her hers him his i if in into is it its me my no not of on or our she so than that the their them then there they this through to too up us was we were what when where which who why will with you your".split(" "));

const MOTIFS = Object.freeze([
  {
    id: "passage",
    label: "passage, return, and the ethics of crossing",
    pattern: /\b(ferry|river|ocean|sea|sail|ship|shore|tide|cross|bridge|road|route|home|return|corner|gate|door|threshold)\b/i,
    lesson: "A passage is ethical only when arrival, consent, and the right to turn back remain visible.",
    mechanic: "route-memory and reversible-threshold mechanics",
    visual: "a tidal threshold, an open route, and a clearly visible return path",
    colors: ["deep ocean blue #173B57", "harbor teal #2F8D91", "lantern gold #E0B45B"],
  },
  {
    id: "memory",
    label: "memory, recognition, and the right to change",
    pattern: /\b(memory|remember|forgot|forget|ghost|past|name|nameless|mask|mirror|copy|code|archive|letter|voice|echo)\b/i,
    lesson: "Preserve memory as evidence and invitation, never as ownership of the person remembered.",
    mechanic: "consent-aware memory, identity, and provenance systems",
    visual: "a fractured mirror that preserves distinct reflections, a labeled archive thread, and an open hand",
    colors: ["memory blue #405D8B", "mirror silver #BCC8D1", "signal magenta #B45F86"],
  },
  {
    id: "care",
    label: "ordinary care as the measure of heroism",
    pattern: /\b(tea|dinner|dish|cook|bread|bath|bed|campfire|lullaby|home|family|papa|mama|wife|husband|child|baby|bella|love|heart|kiss)\b/i,
    lesson: "Judge grand promises by the ordinary care, rest, food, listening, and freedom they make possible.",
    mechanic: "relationship-memory and everyday-care quest rewards",
    visual: "a lived-in table, a warm shared light, and one humble act of care held as the focal action",
    colors: ["hearth amber #D28A3D", "linen cream #F0E2C5", "relationship rose #A94D63"],
  },
  {
    id: "agency",
    label: "agency, voice, and non-possessive love",
    pattern: /\b(free|freedom|choose|choice|voice|speak|tongue|sing|dance|captain|queen|princess|woman|girl|lady|miss|her|herself)\b/i,
    lesson: "An enduring promise governs the promiser's conduct; it does not permanently bind another person's will.",
    mechanic: "dialogue consent, character agency, and leadership handoff",
    visual: "a figure choosing her own heading, an offered rather than imposed hand, and a horizon split into viable paths",
    colors: ["sovereignty violet #624D82", "decision coral #CF6655", "open-sky cyan #68B6C8"],
  },
  {
    id: "duty",
    label: "duty, protection, and a defensible stopping condition",
    pattern: /\b(war|fight|soldier|watch|guard|save|protect|duty|honor|hero|hell|enemy|sword|throat|fire|broken|protocol)\b/i,
    lesson: "Protection needs limits, restoration of agency, and a condition under which the protector can stop.",
    mechanic: "bounded-responsibility quests and explicit release conditions",
    visual: "a lowered weapon beside a repaired threshold, an extinguishable watchfire, and a visible handoff of responsibility",
    colors: ["watchfire red #9F3F38", "tempered steel #66717A", "repair gold #C8A456"],
  },
  {
    id: "making",
    label: "making, learning, and accountable tools",
    pattern: /\b(build|make|forge|card|garden|code|program|project|geometry|science|scientist|solder|copper|tool|work|school|learn|train)\b/i,
    lesson: "A tool earns meaning when another person can inspect it, use it, revise it, and leave it.",
    mechanic: "Card Garden authoring, inspectable artifacts, and reversible generation",
    visual: "a worn workbench where one gesture becomes a testable artifact, with roots touching the tools",
    colors: ["architectural blue #3D6592", "copper #B66B43", "living green #62845C"],
  },
  {
    id: "cycle",
    label: "cycles, repetition, and changing the task",
    pattern: /\b(again|more|loop|circle|bounce|climb|wheel|season|spring|summer|moon|sunrise|sunset|infinity|forever|eternity|repeat)\b/i,
    lesson: "Persistence becomes wisdom only when each return can change the task rather than merely repeat its cost.",
    mechanic: "loop-aware progression with observed consequences and exit criteria",
    visual: "an interrupted circular path, one changed footprint, and a mechanism whose next turn can be redirected",
    colors: ["cycle indigo #3F477B", "sunrise orange #E17B45", "revision teal #3B9A8A"],
  },
  {
    id: "belonging",
    label: "belonging without erasing difference",
    pattern: /\b(family|familia|crew|team|together|with|beside|next|kin|root|tree|garden|tribe|hapa|red|blue|green)\b/i,
    lesson: "Shared origin can create reasons for care, but it cannot erase each member's separate history or standing.",
    mechanic: "searchable relationship graphs and distinct-but-connected avatar roles",
    visual: "three distinct colored roots joining a shared canopy without merging their trunks",
    colors: ["Hapa red #D84D4D", "Hapa blue #3E78C5", "Hapa green #54A36A"],
  },
  {
    id: "welcome",
    label: "welcome, refuge, and the obligations of arrival",
    pattern: /\b(welcome|liberty|west|tacoma|puget|cascades|harbor|beach|statue|home|refuge|foreign|asia|south|americana)\b/i,
    lesson: "A refuge must examine its own exclusions and care for the people and histories already present.",
    mechanic: "place-aware arrival, attribution, and repair quests",
    visual: "a westward harbor torch illuminating both newcomers and the older paths beneath the city",
    colors: ["harbor copper #B66C45", "Puget blue #356D8A", "welcome flame #F0C15A"],
  },
  {
    id: "value",
    label: "value, exchange, and unpriced personhood",
    pattern: /\b(coin|gold|treasure|tariff|price|pay|dollar|trade|bet|casino|gilded|rare|worth|value)\b/i,
    lesson: "Resources may buy passage or build capacity, but they must not become a price placed on a person.",
    mechanic: "resource conversion with personhood and consent guardrails",
    visual: "open coins becoming tools and shelter while one untouched human silhouette remains outside the scale",
    colors: ["antique gold #C6A15B", "ledger charcoal #30343B", "human teal #4BA3A0"],
  },
  {
    id: "signal",
    label: "signal, language, and uncertain evidence",
    pattern: /\b(signal|radio|light|color|red|blue|green|orange|bright|neon|projector|tongue|language|hear|look|eye|sound|thunder)\b/i,
    lesson: "Treat a signal as located evidence: preserve its source, uncertainty, and strongest alternative reading.",
    mechanic: "reference provenance, confidence labels, and alternative-reading search",
    visual: "layered radio waves crossing colored light with one source line kept legible as provenance",
    colors: ["signal cyan #43B5C7", "warning orange #E88942", "night navy #17233E"],
  },
  {
    id: "grief",
    label: "grief, loss, and continuity without erasure",
    pattern: /\b(grief|lost|loss|dead|death|gone|goodbye|farewell|broken|rain|cry|tears|missing|stolen|denied|never)\b/i,
    lesson: "Continuity can add responsibilities of repair; it cannot subtract the local reality of loss.",
    mechanic: "memorial, repair, and non-destructive continuity features",
    visual: "a repaired vessel whose visible seam honors what was lost instead of pretending it never broke",
    colors: ["rain slate #59697A", "memorial pearl #D9D6CC", "surviving ember #C96545"],
  },
]);

const MOTIF_TAROT_CANDIDATES = Object.freeze({
  passage: ["S06", "C08", "M07", "M00", "M21", "W02"],
  memory: ["M18", "M20", "C06", "M02", "S02", "C05"],
  care: ["C02", "C03", "C06", "C10", "C13", "M03"],
  agency: ["M08", "M11", "M06", "W13", "S13", "M07"],
  duty: ["M04", "M11", "W07", "W09", "W10", "S14"],
  making: ["M01", "P03", "P08", "W01", "P01", "W03"],
  cycle: ["M10", "M21", "M13", "M12", "M14", "M18"],
  belonging: ["C03", "C10", "W04", "P06", "P10", "M03"],
  welcome: ["M17", "M19", "S06", "M21", "W04", "C10"],
  value: ["P06", "P04", "P09", "P10", "M15", "P02"],
  signal: ["M17", "M18", "M19", "S11", "S01", "M02"],
  grief: ["S03", "C05", "M13", "S06", "M17", "C08"],
});

function text(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function concise(value, max = 420) {
  const normalized = text(value);
  if (normalized.length <= max) return normalized;
  const candidate = normalized.slice(0, max + 1);
  const sentence = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("? "), candidate.lastIndexOf("! "));
  const word = candidate.lastIndexOf(" ");
  const cut = sentence > max * 0.55 ? sentence + 1 : word;
  return `${candidate.slice(0, Math.max(1, cut)).trim().replace(/[,:;\-]+$/, "")}.`;
}

function firstSentence(value, max = 320) {
  const normalized = text(value);
  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  return concise(match?.[0] || normalized, max);
}

function words(value = "") {
  return [...new Set(text(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

function fnv1a(value = "") {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function lyricLines(song = {}) {
  const raw = typeof song.lyrics === "string" ? song.lyrics : song.lyrics?.text || "";
  const seen = new Set();
  return String(raw).split(/\r?\n/).map(text).filter((line) => {
    if (!line || /^\[.*\]$/.test(line) || line.length < 12) return false;
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectLyricCue(song = {}, anchor = null) {
  const anchored = String(anchor?.text || "").split(/\r?\n/).map(text).filter((line) => line && !/^\[.*\]$/.test(line));
  const candidates = anchored.length ? anchored : lyricLines(song);
  const titleWords = new Set(words(song.title));
  const selected = candidates.sort((left, right) => {
    const score = (line) => {
      const tokens = words(line);
      const diversity = new Set(tokens).size;
      const repetitionPenalty = tokens.length && diversity <= 2 ? 8 : 0;
      return tokens.filter((word) => titleWords.has(word)).length * 5 + Math.min(diversity, 12) * 0.7 + Math.min(line.length, 110) / 110 - repetitionPenalty;
    };
    return score(right) - score(left);
  })[0] || song.title || "untitled song";
  return selected.replace(/^[“”"']+|[“”"']+$/g, "").replace(/[.,;:]+$/g, "").trim();
}

function motifsFor(song = {}) {
  const corpus = `${song.title || ""}\n${typeof song.lyrics === "string" ? song.lyrics : song.lyrics?.text || ""}`;
  const title = String(song.title || "");
  const matches = MOTIFS.map((motif) => {
    const expression = new RegExp(motif.pattern.source, "gi");
    const titleExpression = new RegExp(motif.pattern.source, "gi");
    const occurrences = corpus.match(expression)?.length || 0;
    const titleOccurrences = title.match(titleExpression)?.length || 0;
    return { motif, score: occurrences + titleOccurrences * 8 };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || MOTIFS.indexOf(left.motif) - MOTIFS.indexOf(right.motif)).map((item) => item.motif);
  if (matches.length) return matches.slice(0, 3);
  return [MOTIFS.find((motif) => motif.id === "signal")];
}

function cardCorpus(card = {}) {
  return words([
    card.title,
    card.inherited?.archetype,
    card.inherited?.upright,
    card.inherited?.shadow,
    card.inherited?.essential_symbols,
    card.hapa_edition?.thematic_synthesis,
    card.hapa_edition?.artist_scene,
  ].join(" "));
}

function selectTarotCard(song = {}, tarotEdition = {}, existingConnections = []) {
  if (existingConnections.length) {
    return { type: "supplied", connection: existingConnections[0], card: (tarotEdition.cards || []).find((card) => `echo-tarot:${card.id}` === existingConnections[0].cardId || card.id === existingConnections[0].editionCardId) };
  }
  const songWords = new Set(words(`${song.title || ""} ${(typeof song.lyrics === "string" ? song.lyrics : song.lyrics?.text || "").slice(0, 8000)}`));
  const motifs = motifsFor(song);
  const motifWords = new Set(words(motifs.map((motif) => `${motif.label} ${motif.lesson}`).join(" ")));
  const preferredIds = new Set(MOTIF_TAROT_CANDIDATES[motifs[0]?.id] || []);
  const preferredCards = (tarotEdition.cards || []).filter((card) => preferredIds.has(card.id));
  const candidates = preferredCards.length ? preferredCards : (tarotEdition.cards || []);
  const ranked = candidates.map((card) => {
    const tokens = cardCorpus(card);
    const overlap = tokens.filter((word) => songWords.has(word)).length;
    const motifOverlap = tokens.filter((word) => motifWords.has(word)).length;
    const stableTie = parseInt(fnv1a(`${song.id}:${card.id}`).slice(0, 6), 16) / 0xffffff * 6;
    return { card, score: overlap * 2 + motifOverlap + stableTie };
  }).sort((left, right) => right.score - left.score || left.card.order - right.card.order);
  return { type: "agent-proposed", card: ranked[0]?.card || tarotEdition.cards?.[0], score: ranked[0]?.score || 0 };
}

function referenceSource(reference = {}, sourceById = new Map()) {
  return (reference.sources || []).map((id) => sourceById.get(id)).find((source) => source?.url) || null;
}

function makeEntry({ passId, timestamp, song, kind, body, title = "", futureUse = "", relatedFeature = "", tags = [] }) {
  return {
    schemaVersion: "hapa.song-knowledge-entry.v2",
    id: `song-${kind}-${passId}-${fnv1a(`${song.id}:${kind}:${title || body}`)}`,
    kind,
    title,
    body: text(body),
    authorType: "agent",
    authorName: "OpenAI Codex",
    context: "Echo Album research and visual-prompt pass",
    lesson: kind === "lesson" ? text(body) : "",
    futureUse: kind === "lesson" ? text(futureUse) : "",
    relatedFeature: kind === "lesson" ? text(relatedFeature) : "",
    tags: [...new Set(["echo-album", "agent-authored", passId, ...tags])],
    passId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildUnderstanding({ passId, timestamp, song, atlasTrack, references, anchors, motifs }) {
  const primary = references[0] || null;
  const primaryAnchor = primary ? anchors.find((anchor) => anchor.reference_id === primary.id) : null;
  const cue = concise(selectLyricCue(song, primaryAnchor), 180);
  const evidence = primaryAnchor?.evidence_class || "U";
  const reason = text(primaryAnchor?.reason).replace(/^[A-Z]/, (value) => value.toLowerCase()).replace(/[.!?]+$/, "");
  const load = firstSentence(primary?.load, 300).replace(/^Load\s+/i, "").replace(/[.!?]+$/, "");
  const body = primary
    ? `Research understanding: “${song.title}” activates ${primary.title}. The cue “${cue}” ${reason ? `is indexed because ${reason}` : "creates the working connection"}. The reference loads ${load}. The album's proposed turn is ${firstSentence(primary.reading, 320)} Evidence class ${evidence} applies to this cue; the interpretation remains a reviewable proposal, not automatic canon.`
    : `Research understanding: the supplied Atlas assigned no curated external anchor to “${song.title}”; that means “not selected in this pass,” not “the song has no references.” A lyric-first reading begins with “${cue}” and treats ${motifs[0].label} as the central operation. The working interpretation is that ${motifs[0].lesson.toLowerCase()} Stronger source or author evidence should replace this provisional reading when available.`;
  return makeEntry({ passId, timestamp, song, kind: "understanding", title: primary ? `${primary.id} · ${primary.title}` : "Lyric-first provisional reading", body, tags: [primary ? `reference:${primary.id}` : "reference:unassigned", `motif:${motifs[0].id}`, `evidence:${evidence}`] });
}

function buildNote({ passId, timestamp, song, references, anchors, motifs }) {
  const cues = references.slice(0, 3).map((reference) => {
    const anchor = anchors.find((item) => item.reference_id === reference.id);
    return `${reference.id}${anchor ? ` [${anchor.evidence_class}]` : ""}: ${concise(selectLyricCue(song, anchor), 95)}`;
  });
  const cueText = cues.length ? cues.join(" · ") : `Lyric cue: ${concise(selectLyricCue(song), 130)}`;
  const body = `Editorial note: read the speaker, addressee, action, and stakes before expanding the symbols. ${cueText}. Keep ${motifs.map((motif) => motif.label).join(" and ")} distinct where they disagree; preserve alternate readings and source/version caveats instead of flattening names into a single equivalence.`;
  return makeEntry({ passId, timestamp, song, kind: "note", title: "Evidence and interpretation boundary", body, tags: motifs.map((motif) => `motif:${motif.id}`) });
}

function buildAnecdoteSeed({ passId, timestamp, song, motifs }) {
  const cue = concise(selectLyricCue(song), 150);
  const body = `Anecdote seed for Calder to confirm: was there a real moment, person, place, game, book, meal, argument, trip, or studio decision behind “${cue}”? If so, record who was present, what changed, and which detail must survive adaptation. Until Calder confirms it, this is a question for eliciting memory—not a biographical claim.`;
  return makeEntry({ passId, timestamp, song, kind: "anecdote", title: "Unconfirmed memory prompt", body, tags: ["anecdote-seed", "requires-author-confirmation", `motif:${motifs[0].id}`] });
}

function buildLesson({ passId, timestamp, song, motifs }) {
  const primary = motifs[0];
  const secondary = motifs[1];
  const body = secondary ? `${primary.lesson} In this song, hold that lesson beside the competing demand that ${secondary.lesson.toLowerCase()}` : primary.lesson;
  return makeEntry({
    passId,
    timestamp,
    song,
    kind: "lesson",
    title: `Working lesson · ${primary.label}`,
    body,
    futureUse: `Turn this into a player-facing choice, scene beat, or review question with an observable consequence and an explicit stop/release condition.`,
    relatedFeature: primary.mechanic,
    tags: motifs.map((motif) => `motif:${motif.id}`),
  });
}

function buildTarotRationale({ passId, timestamp, song, selection, motifs }) {
  const card = selection.card || {};
  const original = card.inherited || selection.connection?.originalMeaning || {};
  const cue = concise(selection.connection?.evidence?.[0]?.excerpt || selectLyricCue(song), 160);
  const supplied = selection.type === "supplied";
  const sourceLogic = selection.connection?.logic || "";
  const body = supplied
    ? `Codex review of the supplied ${selection.connection.cardTitle} pairing: ${firstSentence(sourceLogic, 330)} The lyric cue “${cue}” meets the card's upright field of ${text(original.upright || selection.connection.originalMeaning?.upright || "its stated archetype")}; its shadow tension is ${text(original.shadow || selection.connection.originalMeaning?.shadow || "the corresponding excess or blockage")}. Preserve the edition's rationale as an editorial proposal and test the image against the original Tarot symbols before approval.`
    : `Codex-proposed ${card.title} pairing for an uncovered song: the lyric cue “${cue}” and the song's ${motifs[0].label} align with the card's upright field of ${text(original.upright || "its stated archetype")}. The useful counterpressure is ${text(original.shadow || "its shadow mode")}; the image should retain ${text(original.essential_symbols || "the card's inherited symbols")} while letting one song motif change their use. This fills a missing song attachment as a reviewable proposal, not canon.`;
  return makeEntry({ passId, timestamp, song, kind: "tarot-rationale", title: `${card.title || selection.connection?.cardTitle} · ${supplied ? "supplied pairing reviewed" : "agent-proposed pairing"}`, body, tags: [supplied ? "tarot:supplied" : "tarot:agent-proposed", `tarot-card:${card.id || selection.connection?.editionCardId || "unknown"}`] });
}

function buildResearchReference({ passId, timestamp, song, reference, sourceById, anchors }) {
  const source = referenceSource(reference, sourceById);
  const anchor = anchors.find((item) => item.reference_id === reference.id);
  return {
    schemaVersion: "hapa.song-research-reference.v2",
    id: `song-reference-${passId}-${song.trackNumber}-${reference.id}`,
    label: `${reference.id} · ${reference.title}`,
    url: source?.url || "",
    notes: `Atlas load: ${concise(reference.load, 360)} Song-specific cue: ${concise(selectLyricCue(song, anchor), 180)}. Why indexed: ${concise(anchor?.reason || "selected in the supplied track index", 220)}. Boundary: ${concise(reference.caution, 300)}`,
    referenceCardId: reference.id,
    status: "research-understanding-proposed",
    sourceClass: `atlas-${anchor?.evidence_class || "U"}`,
    tags: ["echo-album", "agent-authored", passId, `reference:${reference.id}`, `evidence:${anchor?.evidence_class || "U"}`],
    authorType: "agent",
    authorName: "OpenAI Codex",
    passId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// Provider-facing prompts deliberately carry the research *operation* without the
// names of external characters, franchises, artists, or historical people. The
// full citation/title remains next to the prompt in durable song knowledge, so a
// reviewer can audit the connection without asking the image model to imitate it.
const PROVIDER_SAFE_REFERENCE_SITUATIONS = Object.freeze({
  R01: "A reciprocal partnership survives changing worlds and changing power: each person can fight, rescue, care, learn, grieve, and choose without becoming the other's possession.",
  R02: "A plural family is shown as a network of distinct obligations—partner to partner, adult to child, group to leader, and family to state—rather than people orbiting one prize.",
  R03: "Sharing water turns an outsider into kin through hospitality and embodied vulnerability, while intimate understanding remains separate from ownership.",
  R04: "A person under orders must distinguish personal duty, the legitimacy of the institution, and the incomplete information available when consequences arrive.",
  R05: "Freedom in a harsh habitat depends on food, infrastructure, reciprocal duties, and shared control of life-supporting systems; intelligence participates as a political peer.",
  R06: "Care for a living person is separated from dependence on the role they perform; attention exposes love and abandonment fear without moral theater.",
  R07: "Limited knowledge and unrestricted moral standing coexist: seeing more possible futures never grants permission to coerce another person.",
  R08: "Love recognizes a person through frightening transformation without erasing responsibility, victims, or the transformed person's agency.",
  R09: "A vulnerable yet dangerous lover bears memories of people harmed, loved, and lost; healing means carrying accountable memory rather than deleting it.",
  R10: "One person perceives a possible route while another must carry it through bodily risk, attachments, and uncertainty; prophecy guides and burdens at once.",
  R11: "A vessel that answers back is simultaneously person, archive, and home, forcing inheritance and ownership to answer to consent.",
  R12: "Copies share an origin but become separate moral patients as experience diverges; resemblance never makes another self interchangeable.",
  R13: "A shared cultural trail tells a story while selecting a successor, testing patience and cooperation while admitting that fluency is an imperfect proxy for character.",
  R14: "Two skilled partners maintain mutual awareness and return together; survival and mission success do not erase the cost carried home.",
  R15: "An abundant exploratory society must keep proving that unfamiliar bodies and origins receive freedom, belonging, and ethical attention.",
  R16: "Roots, keys, chains, contracts, ports, and signatures join family provenance to technical trust: an inherited name still needs a trustworthy bond to its bearer.",
  R17: "A witnessing self contains multiplicity without demanding sameness and belongs to shared matter without conquering it.",
  R18: "After authority is absent, a woman interprets, steadies others, and defends her right to transmit meaning against established insiders.",
  R19: "A woman moves from being priced and traded to choosing her own work, value, partners, and future; care increases agency rather than changing custodians.",
  R20: "Competence becomes visible inside a gatekept field; earned trust and independent contribution matter more than permission or romantic validation.",
  R21: "Names, memory, preparation, and moral accounting preserve a person's passage across a threshold without reducing them to disappearance.",
  R22: "A harbor city's promise of welcome is contradicted by organized exclusion, exposing institutions and ordinary neighbors as agents of betrayal.",
  R23: "A place is a living field of specific rivers, shores, peoples, kinship, and obligations that predates the newcomer and must answer to its existing home.",
  R24: "A named local river remains particular inside a cosmic map, keeping universal aspiration accountable to a promise made in one real place.",
  R25: "Competent action exposes an arbitrary gendered gate, followed by homecoming and refusal to let institutional reward define a person's worth.",
  R26: "A violated boundary provokes collective political refusal; sovereignty is visible without glamorizing war.",
  R27: "A young woman's testimony moves a group while institutions contest her authority and attempt to control the source of her conviction.",
  R28: "A necessary cosmic function, the rules of its office, and the human incumbent remain distinct; the worker carrying death still has a particular life.",
  R29: "A person deemed valueless may simply be invisible to the available test, revealing a society that wrongly makes dignity depend on measurable talent.",
  R30: "Farewell becomes collective resistance: danger, memory, departure, and death continue to mean something to those who remain.",
  R31: "An abandoned speaker's accusation can be emotionally sincere without becoming omniscient; the unseen person's account remains possible.",
  R32: "An orange signal in the landscape becomes uncertain evidence about an absent person's intentions; emotional truth and literal certainty stay separate.",
  R33: "A voice rejected by its first setting travels elsewhere to become legible, turning departure into self-authorship rather than simple desertion.",
  R34: "Companionship stretches from youth through chosen adulthood toward shared old age; ordinary duration is the epic prize.",
  R35: "A mountain reaches the gate and changes the scale of the decision; the threshold can defend, invite, refuse, or open.",
  R36: "A glamorous conquest persona is tested by the quiet labor of sustaining care when another person actually needs help.",
  R37: "A feared mirror becomes a site of naming, hospitality, self-recognition, and encounter with multiple possible selves.",
  R38: "A protected message preserves agency across distance under hostile observation, yet still depends on couriers, keys, trust, and faithful reconstruction.",
  R39: "Grand technological imagination is checked against sustained street-level care for one small vulnerable creature.",
  R40: "Love changes from guarding someone on a road to assigned sacrifice into helping them question and refuse the machinery assigning it.",
  R41: "Irreversible loss cannot be undone by greater effort; a person's continuing significance is distinct from restoration of their living presence.",
  R42: "A school, home, and logistical institution moves while keeping communal identity, even as its people question the power that funds and commands it.",
  R43: "Endurance toward an aim is separated from captivity inside a repetitive operation that can never achieve it; the task itself may need to change.",
  R44: "A gift of capability expands what others can do; its ethical value depends on increasing their freedom rather than their dependence on the giver.",
  R45: "A returning person belongs to more than one domain and cannot simply become their earlier self; family grief and personal agency demand different arrangements.",
  R46: "Each member's contribution changes the capacities of the whole group, making distributed competence and the cost of losing one participant visible.",
  R47: "A technically successful protection creates a long debt: people can lose access to a surviving home, and repair must exceed good intentions.",
  R48: "Small cooperative contributions accumulate until a hidden extraordinary capability can arrive through a route ordinary means could not open.",
  R49: "One defender closes and destroys a route to create time for others; protection can require preventing passage rather than opening it.",
  R50: "Chosen companionship, practiced water skill, untamed electrical power, and an unindexed anomaly reveal the gap between a system's catalog and what exists within it.",
  R51: "A capable traveler serves another person's responsibility without ownership; trust, timing, music, and attention open routes force cannot.",
  R52: "A person's recognition is forcibly interrupted by a confining mask; freedom requires rebuilding identity and relationship after the cell opens.",
  R53: "Two people separate because conditions conflict rather than love disappearing; protective secrecy prevents one danger while creating another injury.",
  R54: "A threshold is governed by a guide, a toll, and rules the traveler cannot control; refusing payment reveals whether access, duty, or mercy governs passage.",
  R55: "A stable symbolic vocabulary recombines image, role, situation, and question; position changes what the same symbol asks of a scene.",
  R56: "Element, season, timing, kinship, and contrast operate as declared symbolic coordinates rather than deterministic labels for a person.",
  R57: "A monumental light defines greatness through reception: it guides rejected travelers toward a welcome that creates obligations for the host.",
  R58: "A prosperous society hides one person's suffering beneath collective happiness; walking away refuses the bargain without pretending a replacement is already built.",
});

function buildReferenceImagePrompt({ passId, timestamp, song, reference, anchor, motifs, tarotSelection }) {
  const primary = motifs[0];
  const secondary = motifs[1];
  const cue = concise(selectLyricCue(song, anchor), 190);
  const referenceLabel = reference?.title || "lyric-first scene with no curated external reference";
  const load = reference ? firstSentence(reference.load, 280) : "No external reference is asserted; the source is the song's own language and formal movement.";
  const turn = reference ? firstSentence(reference.reading, 300) : primary.lesson;
  const cardTitle = tarotSelection.connection?.cardTitle || tarotSelection.card?.title || "Tarot correspondence";
  const symbols = [primary.visual, secondary?.visual].filter(Boolean).join("; contrasted with ");
  const prompt = [
    "DELIVERABLE",
    `Create one finished, full-bleed vertical Hapa story-card illustration for Echo Album track ${song.trackNumber}, “${song.title}.” This is reference-atlas art, not a Tarot card: no border, titleplate, printed lyric, caption, logo, signature, UI, or watermark.`,
    "",
    "SOURCE TRIANGLE",
    `- Song / lyric: translate “${cue}” into action and spatial stakes; never print it.`,
    `- Reference: ${referenceLabel}. ${load}`,
    `- Interpretive turn: ${turn}`,
    `- Tarot neighbor: ${cardTitle} is a quiet compositional lens only; do not copy its title, numbering, or exact card frame.`,
    "",
    "VISUAL THESIS",
    `Show ${primary.label} through ${symbols}. The focal action must make the lesson observable rather than surrounding a passive figure with icons.`,
    "",
    "HAPA AESTHETIC",
    "Modern semi-realistic 2.5D anime fused with painterly graphic-novel realism; elegant contours, restrained pixel-brushed texture, cinematic but natural light, lived-in environmental storytelling, subtle celestial geometry, antique-gold material accents, and emotionally legible hands, gaze, and posture. Use one coherent world and one decisive moment, not a collage or mood board.",
    `Palette: ${primary.colors.join(", ")}${secondary ? `, with a restrained counterpoint from ${secondary.colors[1]}` : ""}. Color must carry role and consequence, not merely decorate the scene.`,
    "",
    "EVIDENCE AND SAFETY",
    `This is an OpenAI Codex proposal from ${timestamp}. Evidence class: ${anchor?.evidence_class || "U / no selected external anchor"}. Preserve uncertainty; do not invent historical facts, living-person likenesses, copyrighted character likenesses, franchise logos, or readable source text. Translate the source situation, relationship, rule, and the lyric's change into original Hapa visual language.`,
  ].join("\n");
  const safeSituation = reference
    ? PROVIDER_SAFE_REFERENCE_SITUATIONS[reference.id] || `Research record ${reference.id} changes the scene through ${primary.lesson.toLowerCase()}`
    : "No curated external source is asserted. Build only from the song's indexed emotional operation and its provisional lesson.";
  const generationPrompt = [
    "DELIVERABLE",
    `Create one finished, full-bleed vertical Hapa story-card illustration for Echo Album track ${String(song.trackNumber).padStart(3, "0")}. This is reference-atlas art, not a Tarot card: no border, titleplate, printed words, caption, logo, signature, UI, or watermark.`,
    "",
    "SOURCE LOGIC — TRANSLATED, NOT IMITATED",
    `- Song operation: make ${primary.label} visible through a consequential action. The governing lesson is: ${primary.lesson}`,
    `- Research record ${reference?.id || "lyric-only"}: ${safeSituation}`,
    `- Quiet Tarot lens: use the inherited compositional pressure of ${cardTitle}, but never reproduce its title, number, frame, or a published card design.`,
    "",
    "VISUAL THESIS",
    `Build one decisive moment where ${symbols}. Hands, gaze, distance, objects, and environmental response must show the choice and its consequence; do not arrange passive figures around explanatory icons.`,
    `Palette: ${primary.colors.join(", ")}${secondary ? `, with a restrained counterpoint from ${secondary.colors[1]}` : ""}. Give every color a narrative job.`,
    "",
    "HAPA AESTHETIC",
    "Original Hapa adults in modern semi-realistic 2.5D anime fused with painterly graphic-novel realism; distinct faces, hair, clothing, and silhouettes; elegant contours; restrained pixel-brushed texture; cinematic natural light; lived-in environmental storytelling; subtle celestial geometry; antique-gold material accents; emotionally legible anatomy. One coherent world, not a collage.",
    "",
    "IDENTITY AND SOURCE SAFETY",
    "Invent every depicted person from scratch. Do not depict, resemble, costume, color-code, or silhouette-match any named external character, franchise figure, artist, historical person, or living person. Do not reproduce recognizable locations, props, uniforms, logos, or visual styles from an external work. Use only the abstract situation, relationship, constraint, and ethical turn written above.",
    `Provenance: OpenAI Codex proposal ${timestamp}; evidence class ${anchor?.evidence_class || "U / no selected external anchor"}. Preserve uncertainty and leave room for human revision.`,
  ].join("\n");
  const key = reference?.id || "lyric-only";
  return {
    schemaVersion: ECHO_REFERENCE_IMAGE_PROMPT_SCHEMA,
    id: `echo-reference-image-prompt:${passId}:${song.trackNumber}:${key}`,
    passId,
    author: { type: "agent", name: "OpenAI Codex" },
    authoredAt: timestamp,
    songId: song.id,
    songTitle: song.title,
    trackNumber: song.trackNumber,
    referenceId: reference?.id || "",
    referenceTitle: referenceLabel,
    evidenceClass: anchor?.evidence_class || "U",
    lyricCue: cue,
    theme: primary.label,
    lesson: primary.lesson,
    symbols,
    palette: primary.colors,
    relatedTarotCard: cardTitle,
    targetModel: "gpt-image-2.5-sunburst",
    outputSettings: { size: "1024x1536", aspectRatio: "2:3", quality: "high", outputFormat: "png", background: "opaque" },
    reviewStatus: "staged-for-human-review",
    generationStatus: "not-started",
    canGenerate: true,
    prompt,
    generationPrompt,
  };
}

function connectionCandidates(records = []) {
  const byReference = new Map();
  const byTarot = new Map();
  const byMotif = new Map();
  for (const record of records) {
    for (const id of record.referenceIds) {
      const rows = byReference.get(id) || [];
      rows.push(record);
      byReference.set(id, rows);
    }
    const tarotId = record.tarotCardId;
    if (tarotId) {
      const rows = byTarot.get(tarotId) || [];
      rows.push(record);
      byTarot.set(tarotId, rows);
    }
    for (const id of record.motifIds) {
      const rows = byMotif.get(id) || [];
      rows.push(record);
      byMotif.set(id, rows);
    }
  }
  return { byReference, byTarot, byMotif };
}

function buildSongConnections(record, indexes, timestamp, passId) {
  const candidates = new Map();
  const add = (other, score, relationType, shared) => {
    if (!other || other.song.id === record.song.id) return;
    const current = candidates.get(other.song.id) || { other, score: 0, relationTypes: [], shared: [] };
    current.score += score;
    current.relationTypes.push(relationType);
    current.shared.push(shared);
    candidates.set(other.song.id, current);
  };
  for (const id of record.referenceIds) for (const other of indexes.byReference.get(id) || []) add(other, 8, "shared-reference", id);
  if (record.tarotCardId) for (const other of indexes.byTarot.get(record.tarotCardId) || []) add(other, 5, "shared-tarot-card", record.tarotCardTitle);
  for (const id of record.motifIds) for (const other of indexes.byMotif.get(id) || []) add(other, 2, "shared-motif", id);
  return [...candidates.values()].sort((left, right) => right.score - left.score || Math.abs(left.other.song.trackNumber - record.song.trackNumber) - Math.abs(right.other.song.trackNumber - record.song.trackNumber)).slice(0, 5).map(({ other, score, relationTypes, shared }) => ({
    schemaVersion: ECHO_SONG_CONNECTION_SCHEMA,
    id: `echo-song-connection:${passId}:${record.song.trackNumber}:${other.song.trackNumber}`,
    songId: other.song.id,
    songTitle: other.song.title,
    trackNumber: other.song.trackNumber,
    relationTypes: [...new Set(relationTypes)],
    sharedSignals: [...new Set(shared)],
    reason: `Connected by ${[...new Set(relationTypes)].join(", ")}: ${[...new Set(shared)].join(" · ")}. Compare how each song changes the same reference, Tarot role, or motif rather than assuming they mean the same thing.`,
    score,
    authorType: "agent",
    authorName: "OpenAI Codex",
    passId,
    createdAt: timestamp,
  }));
}

export function buildEchoAlbumResearchPass({ songs = [], atlas = {}, tarotEdition = {}, tarotConnections = [], timestamp = new Date().toISOString(), passId = "codex-echo-research-2026-09-13" } = {}) {
  const referenceById = new Map((atlas.references || []).map((reference) => [reference.id, reference]));
  const sourceById = new Map((atlas.sources || []).map((source) => [source.id, source]));
  const trackByNumber = new Map((atlas.tracks || []).map((track) => [Number(track.track_id), track]));
  const connectionsBySong = new Map();
  for (const connection of tarotConnections) {
    const rows = connectionsBySong.get(connection.songId) || [];
    rows.push(connection);
    connectionsBySong.set(connection.songId, rows);
  }
  const records = songs.map((song) => {
    const atlasTrack = trackByNumber.get(Number(song.trackNumber)) || null;
    const referenceIds = atlasTrack?.curated_reference_ids || [];
    const references = referenceIds.map((id) => referenceById.get(id)).filter(Boolean);
    const anchors = (atlas.lyric_anchors || []).filter((anchor) => Number(anchor.track_id) === Number(song.trackNumber));
    const motifs = motifsFor(song);
    const selection = selectTarotCard(song, tarotEdition, connectionsBySong.get(song.id) || []);
    const tarotCardId = selection.connection?.cardId || (selection.card?.id ? `echo-tarot:${selection.card.id}` : "");
    const tarotCardTitle = selection.connection?.cardTitle || selection.card?.title || "";
    const prompts = (references.length ? references : [null]).map((reference) => buildReferenceImagePrompt({
      passId,
      timestamp,
      song,
      reference,
      anchor: reference ? anchors.find((item) => item.reference_id === reference.id) : null,
      motifs,
      tarotSelection: selection,
    }));
    return {
      song,
      atlasTrack,
      references,
      referenceIds,
      anchors,
      motifs,
      motifIds: motifs.map((motif) => motif.id),
      selection,
      tarotCardId,
      tarotCardTitle,
      knowledge: {
        understandings: [buildUnderstanding({ passId, timestamp, song, atlasTrack, references, anchors, motifs })],
        notes: [buildNote({ passId, timestamp, song, references, anchors, motifs })],
        anecdotes: [buildAnecdoteSeed({ passId, timestamp, song, motifs })],
        lessons: [buildLesson({ passId, timestamp, song, motifs })],
        tarotRationales: [buildTarotRationale({ passId, timestamp, song, selection, motifs })],
        researchReferences: references.map((reference) => buildResearchReference({ passId, timestamp, song, reference, sourceById, anchors })),
        referenceImagePrompts: prompts,
      },
    };
  });
  const indexes = connectionCandidates(records);
  const songsOut = records.map((record) => ({
    songId: record.song.id,
    songTitle: record.song.title,
    trackNumber: record.song.trackNumber,
    atlasTrackTitle: record.atlasTrack?.title || "",
    atlasTrackStatus: record.atlasTrack?.status || "unmatched",
    titleMatch: text(record.atlasTrack?.title).toLowerCase() === text(record.song.title).toLowerCase(),
    references: record.references.map((reference) => reference.id),
    motifs: record.motifIds,
    tarot: {
      cardId: record.tarotCardId,
      cardTitle: record.tarotCardTitle,
      assignmentType: record.selection.type,
      score: Number(record.selection.score || 0),
    },
    knowledge: {
      ...record.knowledge,
      songConnections: buildSongConnections(record, indexes, timestamp, passId),
      passProvenance: [{
        schemaVersion: ECHO_ALBUM_RESEARCH_PASS_SCHEMA,
        passId,
        authorType: "agent",
        authorName: "OpenAI Codex",
        authoredAt: timestamp,
        sourceEdition: "Hapa Echo Reference Atlas · Research edition 1.0 · 2026-09-13",
        authority: "reviewable-agent-proposal",
        boundaries: [
          "Direct presence does not prove every interpretation.",
          "No curated anchor means unassigned in this pass, not no references.",
          "Anecdote seeds are questions awaiting Calder's confirmation, not biography.",
          "New Tarot pairings are proposals and do not supersede the supplied 78-card edition.",
        ],
      }],
    },
  }));
  const generatedTarotAssignments = songsOut.filter((record) => record.tarot.assignmentType === "agent-proposed").length;
  const promptCount = songsOut.reduce((total, record) => total + record.knowledge.referenceImagePrompts.length, 0);
  return {
    schemaVersion: ECHO_ALBUM_RESEARCH_PASS_SCHEMA,
    passId,
    author: { type: "agent", name: "OpenAI Codex" },
    authoredAt: timestamp,
    status: "reviewable-agent-proposal",
    source: {
      title: "Hapa Echo Reference Atlas",
      edition: "Research edition 1.0",
      sourceCreatedAt: atlas.created || "2026-09-13",
      suppliedTrackCount: atlas.tracks?.length || 0,
      referenceCount: atlas.references?.length || 0,
      sourceCount: atlas.sources?.length || 0,
      lyricAnchorCount: atlas.lyric_anchors?.length || 0,
    },
    counts: {
      songs: songsOut.length,
      songsWithCuratedReferences: songsOut.filter((record) => record.references.length).length,
      songsWithoutCuratedReferences: songsOut.filter((record) => !record.references.length).length,
      researchReferences: songsOut.reduce((total, record) => total + record.knowledge.researchReferences.length, 0),
      understandings: songsOut.length,
      notes: songsOut.length,
      anecdoteSeeds: songsOut.length,
      lessons: songsOut.length,
      tarotRationales: songsOut.length,
      generatedTarotAssignments,
      referenceImagePrompts: promptCount,
      songConnections: songsOut.reduce((total, record) => total + record.knowledge.songConnections.length, 0),
    },
    songs: songsOut,
  };
}
