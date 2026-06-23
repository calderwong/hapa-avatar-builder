const VALEN_PROVENANCE = {
  id: "prov_hapa_tarot_concept",
  tradition: "custom_hapa",
  sourceType: "custom_hapa",
  sourceTitle: "Hapa Valen Tarot / Atlas26 Daily Mirror",
  confidence: "medium",
  notes: "Mirrors the Atlas26 Valen client-side reading flow: card symbolism, spread positions, hybrid synthesis, and reflective guidance."
};

const VALEN_DEVIATIONS = [
  "Computed chart facts and symbolic card meanings are labeled separately.",
  "Hybrid synthesis is modern interpretation, not a single historical tradition.",
  "Card names, order, images, and meanings can differ by deck; use deck-specific meanings."
];

const ELEMENT_PRACTICES = {
  fire: "pause before action and choose one courageous step",
  water: "name the feeling before interpreting it",
  air: "write the thought clearly, then test it gently",
  earth: "return to one embodied routine",
  metal: "release one stale obligation with care",
  wood: "notice what wants to grow without forcing it"
};

const VALEN_SPREADS = {
  triad: {
    id: "three-card-reflection",
    name: "Three Card Reflection",
    positions: [
      { label: "Situation", question: "What is present?", role: "situation" },
      { label: "Shadow", question: "What is asking for honesty?", role: "shadow" },
      { label: "Practice", question: "What can be practiced now?", role: "action" }
    ]
  },
  cross: {
    id: "shadow-gift-practice-cross",
    name: "Shadow / Gift / Practice Cross",
    positions: [
      { label: "Center", question: "What symbol is at the center?", role: "situation" },
      { label: "Shadow", question: "What pattern needs care?", role: "shadow" },
      { label: "Gift", question: "What strength is available?", role: "gift" },
      { label: "Root", question: "What ground holds the reading?", role: "meditation" },
      { label: "Practice", question: "What action integrates this?", role: "action" }
    ]
  },
  crown: {
    id: "hapa-crown-reflection",
    name: "Crown Reflection",
    positions: [
      { label: "Gate", question: "Where does the sequence open?", role: "situation" },
      { label: "Signal", question: "What signal rises first?", role: "gift" },
      { label: "Tension", question: "What requires discernment?", role: "shadow" },
      { label: "Crown", question: "What higher pattern is visible?", role: "meditation" },
      { label: "Repair", question: "What can be repaired?", role: "action" },
      { label: "Ally", question: "What support is available?", role: "gift" },
      { label: "Landing", question: "How should the insight land?", role: "outcome" }
    ]
  },
  grid: {
    id: "hapa-nine-mirror",
    name: "Nine Mirror",
    positions: [
      { label: "Upper Left", question: "What pattern approaches?", role: "situation" },
      { label: "North", question: "What is asking to be seen?", role: "meditation" },
      { label: "Upper Right", question: "What response is forming?", role: "gift" },
      { label: "West", question: "What pressure is behind this?", role: "shadow" },
      { label: "Center", question: "What is the living center?", role: "situation" },
      { label: "East", question: "What action wants precision?", role: "action" },
      { label: "Lower Left", question: "What memory grounds the spread?", role: "meditation" },
      { label: "South", question: "What should be practiced?", role: "action" },
      { label: "Lower Right", question: "What outcome becomes possible?", role: "outcome" }
    ]
  }
};

const MAJOR_CORRESPONDENCES = {
  0: { displayName: "The Wanderer", element: "air", astrology: "Uranus", keywords: ["beginning", "trust", "threshold"], virtues: ["openness", "courage"], shadows: ["avoidance", "naivete"] },
  1: { displayName: "The Magician", element: "air", astrology: "Mercury", keywords: ["will", "craft", "translation"], virtues: ["focus", "ingenuity"], shadows: ["misdirection", "overreach"] },
  2: { displayName: "The High Priestess", element: "water", astrology: "Moon", keywords: ["hidden pattern", "listening", "threshold"], virtues: ["receptivity", "discernment"], shadows: ["withholding", "obscurity"] },
  3: { displayName: "The Empress", element: "earth", astrology: "Venus", keywords: ["growth", "beauty", "body"], virtues: ["nurture", "abundance"], shadows: ["indulgence", "stagnation"] },
  4: { displayName: "The Emperor", element: "fire", astrology: "Aries", keywords: ["structure", "command", "boundary"], virtues: ["stewardship", "resolve"], shadows: ["rigidity", "domination"] },
  5: { displayName: "The Hierophant", element: "earth", astrology: "Taurus", keywords: ["tradition", "teaching", "vow"], virtues: ["continuity", "reverence"], shadows: ["dogma", "permission-seeking"] },
  6: { displayName: "The Lovers", element: "air", astrology: "Gemini", keywords: ["choice", "alignment", "union"], virtues: ["devotion", "discernment"], shadows: ["projection", "false harmony"] },
  7: { displayName: "The Chariot", element: "water", astrology: "Cancer", keywords: ["direction", "containment", "momentum"], virtues: ["discipline", "care"], shadows: ["force", "defensiveness"] },
  8: { displayName: "Strength", element: "fire", astrology: "Leo", keywords: ["courage", "patience", "taming"], virtues: ["gentleness", "fortitude"], shadows: ["pride", "performative control"] },
  9: { displayName: "The Lantern Keeper", element: "earth", astrology: "Virgo", keywords: ["retreat", "filtration", "inner authority"], virtues: ["discernment", "patience"], shadows: ["isolation", "overcontrol"] },
  10: { displayName: "Wheel of Fortune", element: "fire", astrology: "Jupiter", keywords: ["cycle", "turning", "chance"], virtues: ["adaptability", "faith"], shadows: ["fatalism", "restlessness"] },
  11: { displayName: "Justice", element: "air", astrology: "Libra", keywords: ["balance", "truth", "consequence"], virtues: ["fairness", "clarity"], shadows: ["coldness", "judgment"] },
  12: { displayName: "The Hanged One", element: "water", astrology: "Neptune", keywords: ["surrender", "reframe", "suspension"], virtues: ["trust", "vision"], shadows: ["martyrdom", "delay"] },
  13: { displayName: "Death", element: "water", astrology: "Scorpio", keywords: ["ending", "compost", "threshold"], virtues: ["release", "renewal"], shadows: ["clinging", "collapse"] },
  14: { displayName: "The Tide Mixer", element: "fire", astrology: "Sagittarius", keywords: ["integration", "pace", "alchemy"], virtues: ["moderation", "continuity"], shadows: ["excess", "false balance"] },
  15: { displayName: "The Devil", element: "earth", astrology: "Capricorn", keywords: ["bond", "materiality", "temptation"], virtues: ["honesty", "choice"], shadows: ["compulsion", "entrapment"] },
  16: { displayName: "The Observatory Struck", element: "fire", astrology: "Mars", keywords: ["disruption", "release", "truth pressure"], virtues: ["honesty", "resilience"], shadows: ["panic", "control collapse"] },
  17: { displayName: "The Celestial Archive", element: "air", astrology: "Aquarius", keywords: ["hope", "orientation", "renewal"], virtues: ["faith", "clarity"], shadows: ["distance", "idealization"] },
  18: { displayName: "The Moon", element: "water", astrology: "Pisces", keywords: ["dream", "uncertainty", "image"], virtues: ["intuition", "compassion"], shadows: ["confusion", "projection"] },
  19: { displayName: "The Sun", element: "fire", astrology: "Sun", keywords: ["revelation", "warmth", "vitality"], virtues: ["joy", "openness"], shadows: ["exposure", "overconfidence"] },
  20: { displayName: "Judgement", element: "fire", astrology: "Pluto", keywords: ["calling", "reckoning", "return"], virtues: ["accountability", "awakening"], shadows: ["self-condemnation", "avoidance"] },
  21: { displayName: "The World", element: "earth", astrology: "Saturn", keywords: ["completion", "integration", "body"], virtues: ["wholeness", "craft"], shadows: ["closure anxiety", "perfectionism"] },
  22: { displayName: "The Rootbridge", element: "earth", astrology: "Hapa extension", keywords: ["root", "bridge", "lineage"], virtues: ["belonging", "repair"], shadows: ["stuck lineage", "inherited pressure"] },
  23: { displayName: "The Harness", element: "metal", astrology: "Hapa extension", keywords: ["discipline", "channel", "load"], virtues: ["responsibility", "precision"], shadows: ["constraint", "self-binding"] },
  24: { displayName: "The Citadel", element: "earth", astrology: "Hapa extension", keywords: ["shelter", "sovereignty", "defense"], virtues: ["stewardship", "protection"], shadows: ["fortress logic", "withdrawal"] }
};

export function valenSpreadForLayout(layoutId = "triad") {
  return VALEN_SPREADS[layoutId] || VALEN_SPREADS.triad;
}

export async function queryValenTarotReading(payload = {}, options = {}) {
  const endpoints = options.endpoints || configuredEndpoints();
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (fetchImpl && endpoints.length) {
    for (const endpoint of endpoints) {
      try {
        const remote = await postReading(endpoint, payload, fetchImpl, options.timeoutMs ?? 650);
        if (remote) return normalizeRemoteReading(remote, endpoint, payload);
      } catch {
        // Local Valen synthesis is the intentional fallback when the Atlas app has no API route exposed.
      }
    }
  }

  return buildLocalValenReading(payload);
}

function configuredEndpoints() {
  const values = [];
  const envEndpoint = import.meta.env?.VITE_HAPA_TAROT_READING_ENDPOINT || import.meta.env?.VITE_VALEN_READING_ENDPOINT || "";
  if (envEndpoint) values.push(envEndpoint);
  if (typeof localStorage !== "undefined") {
    values.push(
      localStorage.getItem("hapa-valen-reading-endpoint"),
      localStorage.getItem("hapaTarotAppEndpoint")
    );
  }
  return unique(values.filter(Boolean).map((value) => value.trim()).filter(Boolean));
}

async function postReading(endpoint, payload, fetchImpl, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toValenRequest(payload)),
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`Valen endpoint returned ${response.status}`);
    return response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toValenRequest(payload) {
  const spread = valenSpreadForLayout(payload.layoutId);
  return {
    request: {
      id: payload.readingId || `builder-${Date.now()}`,
      userId: "hapa-avatar-builder",
      profileId: payload.avatarId || "local-profile",
      question: "What does this Hapa spread ask the avatar to practice?",
      intention: payload.intention || `${payload.avatarName || "Hapa"} tarot draw`,
      spreadId: spread.id,
      deckId: "hapa-valen-tarot",
      drawMode: "deterministic_seeded",
      reversalMode: "optional",
      transitMoment: payload.generatedAt || new Date().toISOString(),
      traditionMode: "hybrid",
      journalContextPolicy: "none",
      readingTone: "reflective"
    },
    builderShuffle: payload,
    drawnCards: (payload.cards || []).map((card, index) => ({
      cardId: card.id,
      deckId: "hapa-valen-tarot",
      spreadPositionIndex: index,
      reversed: false,
      drawIndex: index
    }))
  };
}

function normalizeRemoteReading(result, endpoint, payload) {
  const artifact = result.artifact || result.reading || result;
  const interpretation = artifact.interpretation || artifact;
  const cardByCard = interpretation.cardByCard || interpretation.cards || [];
  return {
    status: "ready",
    source: "valen_http",
    sourceLabel: shortEndpoint(endpoint),
    title: result.title || `${payload.avatarName || "Hapa"} ${payload.layoutName || "Tarot"} Mirror`,
    summary: interpretation.summary || result.summary || "Valen returned a reflective reading for this draw.",
    astrologyLayer: interpretation.astrologyLayer || result.astrologyLayer || "",
    synthesis: interpretation.synthesis || result.synthesis || "",
    deviations: interpretation.deviations || VALEN_DEVIATIONS,
    reflectionQuestions: interpretation.reflectionQuestions || [],
    cultivationAction: interpretation.cultivationAction || "",
    practice: interpretation.practice || null,
    cardByCard: cardByCard.map(String),
    cards: payload.cards || [],
    provenance: artifact.provenance || [VALEN_PROVENANCE],
    generatedAt: artifact.createdAt || result.createdAt || new Date().toISOString()
  };
}

export function buildLocalValenReading(payload = {}) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const spread = valenSpreadForLayout(payload.layoutId);
  const interpretedCards = cards.map((card, index) => interpretBuilderCard(card, spread.positions[index], index));
  const tags = tagsFromInterpretedCards(interpretedCards);
  const strongestElement = strongest(tags, "element") || { value: "orientation" };
  const strongestVirtue = strongest(tags, "virtue");
  const strongestShadow = strongest(tags, "shadow");
  const strongestPractice = strongest(tags, "practice");
  const strongestAstrology = strongest(tags, "astrology");
  const primaryTheme = [
    strongestElement.value,
    strongestAstrology?.value,
    payload.layoutName || spread.name
  ].filter(Boolean).join(" / ");
  const shadowTheme = strongestShadow?.value || "overidentifying with the symbol";
  const practice = strongestPractice?.value || ELEMENT_PRACTICES[strongestElement.value] || "take one grounded breath before choosing";
  const journalPrompt = strongestVirtue
    ? `Where can ${payload.avatarName || "this avatar"} practice ${strongestVirtue.value} without forcing certainty?`
    : "What gets clearer when the spread is allowed to breathe before interpretation?";
  const cardsLine = interpretedCards.slice(0, 3).map((card) => `${card.positionLabel}: ${card.title}`).join("; ");

  return {
    status: "ready",
    source: "atlas26_valen_local",
    sourceLabel: "Atlas26 Valen local",
    title: `${payload.avatarName || "Hapa"} ${payload.layoutName || spread.name} Mirror`,
    summary: `This reflective reading brings forward ${primaryTheme}.`,
    astrologyLayer: `The live Atlas26 route is not exposed here, so this uses Valen's labeled card correspondence layer. Dominant resonance: ${strongestAstrology?.value || "custom Hapa symbolism"}.`,
    synthesis: [
      `A modern reflective reading might ask how ${primaryTheme} is shaping attention in this spread.`,
      `The shadow pattern to watch is ${shadowTheme}.`,
      `Consider exploring ${practice}.`
    ].join(" "),
    deviations: VALEN_DEVIATIONS,
    reflectionQuestions: [journalPrompt],
    cultivationAction: `Choose one small action related to: ${practice}.`,
    practice: {
      id: "practice_reflective_breath",
      title: "Reflective Breath",
      durationMinutes: 5,
      type: "breath",
      script: `Breathe slowly for five minutes. On each exhale, consider: ${journalPrompt}`,
      safetyNote: "This is reflective practice, not medical care."
    },
    cardByCard: interpretedCards.map((card) => card.line),
    cards: interpretedCards,
    symbolicLinks: interpretedCards.map((card) => ({
      id: `link_${card.id}_${card.index}`,
      sourceId: `card_${card.id}`,
      targetId: `spread_${payload.layoutId || "triad"}_${card.index}`,
      tags: card.tags,
      convergence: "supporting",
      explanation: `${card.title} is read through ${card.positionLabel} as ${card.keywords.slice(0, 3).join(", ")}.`
    })),
    provenance: [VALEN_PROVENANCE],
    generatedAt: new Date().toISOString(),
    debugSummary: cardsLine
  };
}

function interpretBuilderCard(card = {}, position = {}, index = 0) {
  const number = romanToNumber(card.tarotNumber);
  const correspondence = MAJOR_CORRESPONDENCES[number] || inferCorrespondence(card);
  const positionLabel = card.positionLabel || position.label || `Card ${index + 1}`;
  const keywords = unique([
    ...(card.keywords || []),
    ...(correspondence.keywords || []),
    card.archetype,
    card.subtitle
  ].filter(Boolean)).slice(0, 5);
  const virtues = unique([...(correspondence.virtues || []), highStatName(card.stats)].filter(Boolean));
  const shadows = unique([...(correspondence.shadows || []), lowStatShadow(card.stats)].filter(Boolean));
  const practice = practiceForRole(position.role, correspondence.element);
  const title = card.title || correspondence.displayName || `Hapa Card ${index + 1}`;
  const posture = card.reversed ? "reversed" : "upright";
  const line = `${positionLabel}: ${title} (${posture}) may symbolize ${keywords.slice(0, 3).join(", ")}. In this Hapa spread, it asks for ${practice}.`;

  return {
    ...card,
    index,
    title,
    positionLabel,
    positionQuestion: position.question || "",
    role: position.role || "situation",
    posture,
    number,
    element: correspondence.element,
    astrology: correspondence.astrology,
    keywords,
    virtues,
    shadows,
    practice,
    line,
    tags: [
      tag("element", correspondence.element, 1.2),
      tag("astrology", correspondence.astrology, 1),
      ...virtues.map((value) => tag("virtue", value, 1)),
      ...shadows.map((value) => tag("shadow", value, card.reversed ? 1.4 : 0.65)),
      tag("practice", practice, 1)
    ].filter((item) => item.value)
  };
}

function inferCorrespondence(card = {}) {
  const text = `${card.title || ""} ${card.subtitle || ""} ${card.archetype || ""} ${(card.keywords || []).join(" ")}`.toLowerCase();
  if (/ark|citadel|garden|root|steward|shelter/.test(text)) {
    return { displayName: "Hapa Earth Vessel", element: "earth", astrology: "custom Hapa earth", keywords: ["shelter", "stewardship", "continuity"], virtues: ["care", "patience"], shadows: ["fortress logic"] };
  }
  if (/exile|raider|lancer|pursuit|fire|command/.test(text)) {
    return { displayName: "Hapa Fire Vector", element: "fire", astrology: "custom Hapa fire", keywords: ["motion", "pressure", "decision"], virtues: ["courage", "precision"], shadows: ["haste"] };
  }
  if (/accord|mirror|memory|archive|verdict/.test(text)) {
    return { displayName: "Hapa Air Mirror", element: "air", astrology: "custom Hapa air", keywords: ["signal", "judgment", "meaning"], virtues: ["clarity", "truthfulness"], shadows: ["overinterpretation"] };
  }
  return { displayName: "Hapa Symbol", element: "water", astrology: "custom Hapa symbolism", keywords: ["reflection", "threshold", "attention"], virtues: ["presence"], shadows: ["projection"] };
}

function tagsFromInterpretedCards(cards) {
  return cards.flatMap((card) => card.tags || []);
}

function strongest(tags, axis) {
  return tags
    .filter((item) => item.axis === axis)
    .sort((a, b) => b.weight - a.weight)[0];
}

function tag(axis, value, weight) {
  return { axis, value, tradition: axis === "astrology" ? "computed" : "custom_hapa", weight };
}

function practiceForRole(role, element) {
  if (role === "shadow") return "naming the pressure without obeying it";
  if (role === "gift") return "accepting the available strength and using it gently";
  if (role === "action" || role === "outcome") return ELEMENT_PRACTICES[element] || "one grounded next step";
  if (role === "meditation") return "letting the symbol settle before drawing a conclusion";
  return "clear observation before movement";
}

function highStatName(stats = {}) {
  const entries = Object.entries(stats).filter(([, value]) => Number.isFinite(Number(value)));
  if (!entries.length) return "";
  const [name] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return readableStat(name);
}

function lowStatShadow(stats = {}) {
  const entries = Object.entries(stats).filter(([, value]) => Number.isFinite(Number(value)));
  if (!entries.length) return "";
  const [name] = entries.sort((a, b) => Number(a[1]) - Number(b[1]))[0];
  return `${readableStat(name)} under strain`;
}

function readableStat(value) {
  return String(value).replace(/[_-]+/g, " ").toLowerCase();
}

function romanToNumber(value = "") {
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^IVXLCDM0-9]/g, "")
    .replace(/L(?=I)/g, "I");
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  const roman = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const current = roman[normalized[index]] || 0;
    const next = roman[normalized[index + 1]] || 0;
    total += current < next ? -current : current;
  }
  return total || undefined;
}

function shortEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return `${url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}${url.pathname}`;
  } catch {
    return "Valen HTTP";
  }
}

function unique(list) {
  return [...new Set(list)];
}
