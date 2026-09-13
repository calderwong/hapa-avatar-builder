export const ECHO_TAROT_IMAGE_PROMPTS_SCHEMA = "hapa.echo-tarot-image-prompts.v2";
export const ECHO_TAROT_IMAGE_PROMPT_MODEL = "GPT Image 2.5 Sunburst";

export const ECHO_TAROT_IMAGE_OUTPUT_SETTINGS = Object.freeze({
  model: "gpt-image-2.5-sunburst",
  size: "1024x1536",
  aspectRatio: "2:3",
  quality: "high",
  background: "opaque",
  outputFormat: "png",
});

export const HAPA_MAIN_CAST_SLOTS = Object.freeze({
  man: Object.freeze({
    id: "hapa-main-man",
    label: "Hapa Main Man",
    description: "A configurable adult masculine Hapa avatar identity slot. Keep his pose, expression, props, lighting, and composition stable when a named avatar is assigned later.",
  }),
  woman: Object.freeze({
    id: "hapa-main-woman",
    label: "Hapa Main Woman",
    description: "A configurable adult feminine Hapa avatar identity slot. Keep her pose, expression, props, lighting, and composition stable when a named avatar is assigned later.",
  }),
});

const VARIANT_DEFINITIONS = Object.freeze([
  {
    id: "default-man",
    label: "Default man",
    castSlots: [HAPA_MAIN_CAST_SLOTS.man.id],
    subject: HAPA_MAIN_CAST_SLOTS.man.label,
    castDirection: "Use Hapa Main Man as the only principal adult human figure. Give him an active, emotionally legible pose; symbolic figures may appear only as small secondary presences required by the card.",
    relationshipDirection: "Tell the story through his gaze, hands, posture, and relationship to the central Tarot object. Do not add a romantic partner or second principal figure.",
  },
  {
    id: "default-woman",
    label: "Default woman",
    castSlots: [HAPA_MAIN_CAST_SLOTS.woman.id],
    subject: HAPA_MAIN_CAST_SLOTS.woman.label,
    castDirection: "Use Hapa Main Woman as the only principal adult human figure. Give her an active, emotionally legible pose; symbolic figures may appear only as small secondary presences required by the card.",
    relationshipDirection: "Tell the story through her gaze, hands, posture, and relationship to the central Tarot object. Do not add a romantic partner or second principal figure.",
  },
  {
    id: "default-couple",
    label: "Both as a couple",
    castSlots: [HAPA_MAIN_CAST_SLOTS.man.id, HAPA_MAIN_CAST_SLOTS.woman.id],
    subject: "the couple",
    castDirection: "Use Hapa Main Man and Hapa Main Woman as the two principal adult figures, with equal scale, agency, detail, and emotional importance. Their silhouettes must remain distinct and readable.",
    relationshipDirection: "Build one shared action: one partner initiates the card's central gesture while the other answers with a complementary gesture, gaze, or use of the same symbolic object. Make their bond visible through spacing and eye-lines; neither is a prize, prop, rescuer, or passive witness.",
  },
]);

function text(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function concise(value, max = 360) {
  const normalized = text(value);
  if (normalized.length <= max) return normalized;
  const candidate = normalized.slice(0, max + 1);
  const sentenceEnd = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "));
  const wordEnd = candidate.lastIndexOf(" ");
  const cut = sentenceEnd >= Math.floor(max * 0.55) ? sentenceEnd + 1 : wordEnd;
  return `${candidate.slice(0, Math.max(cut, 1)).trim().replace(/[.,:;\-]+$/, "")}.`;
}

function firstSentence(value, max = 320) {
  const normalized = text(value);
  if (!normalized) return "";
  const match = normalized.match(/^.*?[.!?](?:\s|$)/);
  return concise(match?.[0] || normalized, max);
}

function list(values = [], { maxItems = 6, maxChars = 260 } = {}) {
  return [...new Set(values.map((value) => concise(value, maxChars)).filter(Boolean))].slice(0, maxItems);
}

function escapedPattern(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSourceCasting(value, sourceCasting, replacement) {
  let result = text(value);
  const fullCasting = text(sourceCasting);
  if (!result || !fullCasting) return result;
  const candidates = [fullCasting, ...fullCasting.split(/\s*\/\s*|\s*&\s*|,\s*/)]
    .map(text)
    .filter((item) => item.length > 1)
    .sort((left, right) => right.length - left.length);
  for (const candidate of [...new Set(candidates)]) {
    result = result.replace(new RegExp(escapedPattern(candidate), "gi"), replacement);
  }
  return result;
}

function sourceSongContext(song = {}) {
  const knowledge = song.knowledge || {};
  const creativeAnchors = (song.media || []).filter((asset) => asset.creativeAnchor || asset.role === "creative-visual-anchor");
  return {
    notes: list((knowledge.notes || []).map((entry) => entry.body), { maxItems: 6, maxChars: 320 }),
    anecdotes: list((knowledge.anecdotes || []).map((entry) => entry.body), { maxItems: 6, maxChars: 320 }),
    lessons: list((knowledge.lessons || []).map((entry) => [entry.body, entry.futureUse, entry.relatedFeature].filter(Boolean).join(" — ")), { maxItems: 6, maxChars: 340 }),
    references: list((knowledge.researchReferences || []).map((entry) => [entry.label, entry.url, entry.notes].filter(Boolean).join(": ")), { maxItems: 8, maxChars: 340 }),
    creativeAnchors: creativeAnchors.slice(0, 8).map((asset) => ({
      id: asset.id || "",
      name: asset.name || "",
      type: asset.type || asset.mediaType || "",
      url: asset.url || asset.src || "",
      toneNotes: concise(asset.creativeAnchor?.toneNotes || asset.notes || asset.name, 340),
    })),
  };
}

function manualConnection(song = {}, link = {}, card = {}) {
  const originalMeaning = card.originalMeaning || {};
  return {
    id: `human-tarot-link:${song.id}:${link.cardId}`,
    songId: song.id || "",
    songSlug: song.songId || "",
    songTitle: song.title || "Untitled song",
    trackId: song.trackId || "",
    trackNumber: Number(song.trackNumber || 0),
    cardId: link.cardId,
    editionCardId: card.editionCardId || card.number || "",
    cardTitle: link.cardTitle || card.title || link.cardId,
    cardSubtitle: card.subtitle || "",
    arcana: card.arcana || "custom",
    suit: card.suit || "custom",
    rank: card.rank || card.number || "",
    displayNumber: card.displayNumber || card.rank || card.number || "",
    sourceCasting: card.casting || "",
    role: link.role || "Human-authored Tarot/song correspondence",
    logic: link.reason || link.contextReason || "Human-authored correspondence pending fuller interpretation.",
    evidence: [],
    mappingStatus: "human_authored_reviewable_correspondence",
    thematicSynthesis: card.summary || card.meaning || originalMeaning.interpretation || "",
    interpretiveGuardrail: card.interpretiveGuardrail || "Human-authored pairing logic remains reviewable and does not become canon by attachment alone.",
    originalMeaning,
    readingMechanics: card.readingMechanics || null,
    symbolBridges: card.symbolBridges || [],
    colorNotes: card.colorNotes || "",
    artistScene: card.artistScene || card.promptNotes || originalMeaning.composition || "",
    productionChecks: card.productionChecks || [],
    source: card.source || { resourcePath: "data/tarot-store.json" },
    origin: "human-authored",
    humanLogic: [link.reason || link.contextReason].filter(Boolean),
  };
}

function mergeConnections(song = {}, connections = [], availableCards = []) {
  const byCard = new Map();
  for (const connection of connections) {
    if (!connection?.cardId) continue;
    byCard.set(connection.cardId, { ...connection, origin: "supplied-editorial", humanLogic: [] });
  }
  for (const link of song.attachments?.cardLinks || []) {
    if (link.role !== "tarot-song-correspondence" || !link.cardId) continue;
    const existing = byCard.get(link.cardId);
    if (existing) {
      existing.humanLogic = list([...(existing.humanLogic || []), link.reason || link.contextReason], { maxItems: 4, maxChars: 420 });
      existing.origin = "supplied-editorial+human-authored";
      continue;
    }
    const card = availableCards.find((item) => item.id === link.cardId) || {};
    byCard.set(link.cardId, manualConnection(song, link, card));
  }
  return [...byCard.values()];
}

function relevantSymbolBridges(connection = {}) {
  const bridges = connection.symbolBridges || [];
  const exact = bridges.filter((bridge) => !bridge.song_sources?.length || bridge.song_sources.includes(connection.trackId));
  return exact.length ? exact : bridges;
}

function buildCreativeBrief({ connection, song, edition, variant }) {
  const original = connection.originalMeaning || {};
  const mechanics = connection.readingMechanics || {};
  const sourceContext = sourceSongContext(song);
  const adapt = (value) => replaceSourceCasting(value, connection.sourceCasting, variant.subject);
  const cardLabel = [connection.editionCardId || connection.rank, connection.cardTitle].filter(Boolean).join(" — ");
  const cardGrammar = [connection.arcana, connection.suit, connection.rank ? `rank ${connection.rank}` : "", original.element, original.domain, original.motion].filter(Boolean).join(" · ");
  const pairingLogic = concise(adapt(connection.logic), 440);
  const synthesis = concise(adapt(connection.thematicSynthesis), 440);
  const visualThesis = concise(`${connection.cardTitle} reframed through “${song.title || connection.songTitle}”: ${firstSentence(pairingLogic || synthesis, 310)}`, 420);
  const scene = concise(adapt(connection.artistScene || original.composition || synthesis), 520);
  const composition = concise(adapt(original.composition), 420);
  const evidence = list((connection.evidence || []).map((item) => item.excerpt), { maxItems: 3, maxChars: 150 });
  const symbolBridges = relevantSymbolBridges(connection).slice(0, 4).map((bridge) => ({
    inheritedAnchor: concise(adapt(bridge.inherited_anchor), 140),
    hapaAddition: concise(adapt(bridge.hapa_addition), 190),
    symbolicFunction: concise(adapt(bridge.symbolic_function), 220),
  }));
  const castVariables = Object.fromEntries(variant.castSlots.map((slotId) => {
    const slot = slotId === HAPA_MAIN_CAST_SLOTS.man.id ? HAPA_MAIN_CAST_SLOTS.man : HAPA_MAIN_CAST_SLOTS.woman;
    return [slot.id, slot];
  }));

  return {
    visualThesis,
    cast: {
      variables: castVariables,
      direction: variant.castDirection,
      relationshipDirection: variant.relationshipDirection,
      sourceCastingProvenance: connection.sourceCasting || "",
    },
    scene: {
      heroAction: scene,
      inheritedComposition: composition,
      staging: "Foreground: one decisive Tarot object or threshold. Midground: the cast's readable action, hands, gaze, and emotional choice. Background: one restrained song motif that deepens the atmosphere without competing with the card identity.",
    },
    tarot: {
      cardLabel,
      cardTitle: connection.cardTitle || "Tarot Card",
      rankText: connection.displayNumber || connection.rank || connection.editionCardId || "",
      grammar: cardGrammar,
      archetype: concise(original.archetype, 240),
      uprightMeaning: concise(original.upright || original.interpretation, 360),
      shadowTension: concise(original.shadow, 300),
      journeyGrammar: concise([original.journeyAct, original.journeyStage, original.numberGrammar].filter(Boolean).join(" · "), 260),
      courtGrammar: concise(original.courtGrammar && [original.courtGrammar.function, original.courtGrammar.action, original.courtGrammar.question].filter(Boolean).join(" "), 300),
      essentialSymbols: concise(original.essentialSymbols, 400),
      optionalSymbols: concise(original.optionalSymbols, 300),
      appliedAction: concise(mechanics.upright_operation, 280),
      interpretiveGuardrail: concise(replaceSourceCasting(connection.interpretiveGuardrail, connection.sourceCasting, "the source-cast character"), 360),
    },
    song: {
      title: song.title || connection.songTitle || "Untitled song",
      trackNumber: song.trackNumber || connection.trackNumber || "",
      role: concise(connection.role, 260),
      pairingLogic,
      thematicSynthesis: synthesis,
      lyricEvidence: evidence,
      humanLogic: list(connection.humanLogic || [], { maxItems: 4, maxChars: 360 }),
      sourceContext,
    },
    symbolBridges,
    artDirection: {
      imageLanguage: concise(edition.visual_language?.inherited_style || "Modern semi-realistic 2.5D anime and illustrated graphic-novel realism; painterly comic shading, elegant contours, restrained pixel-brushed texture, cinematic light, natural expressions, and lived-in environmental storytelling.", 460),
      frameLanguage: concise(edition.visual_language?.inherited_frame || "Antique-gold and parchment filigree, inner Hapa celestial geometry, integrated suit sigil, and restrained teal/celestial-blue accents; Major Arcana may be more ornate.", 360),
      palette: concise(connection.colorNotes, 300),
    },
    output: {
      ...ECHO_TAROT_IMAGE_OUTPUT_SETTINGS,
      printedText: {
        top: connection.displayNumber || connection.rank || connection.editionCardId || "",
        bottom: connection.cardTitle || "Tarot Card",
        occurrence: "exactly once each",
        additionalText: "none",
      },
    },
    reviewChecklist: [
      `Reads immediately as ${connection.cardTitle}, not merely as song art.`,
      `The ${variant.label.toLowerCase()} casting is unambiguous and preserves avatar-slot replaceability.`,
      "Essential Tarot symbols and any canonical object counts are correct; optional symbols stay subordinate.",
      "One or two song motifs change the scene meaning without printing lyrics or the song title.",
      "Top rank/number and bottom title appear exactly once; no other text or watermark is visible.",
    ],
  };
}

function promptLine(label, value) {
  return value ? `- ${label}: ${value}` : null;
}

function buildPrompt(brief) {
  const anchor = brief.song.sourceContext.creativeAnchors.find((item) => item.toneNotes)?.toneNotes || "";
  const lesson = brief.song.sourceContext.lessons[0] || "";
  const songSignals = [
    ...brief.song.lyricEvidence.slice(0, 2).map((item) => `Lyric image to translate metaphorically, never print: “${item}”`),
    anchor ? `Creative anchor tone: ${anchor}` : "",
    lesson ? `Lesson to embody through action: ${lesson}` : "",
  ].filter(Boolean).slice(0, 3);
  const bridgeLines = brief.symbolBridges.slice(0, 2).map((bridge) =>
    `- Symbol bridge: ${concise(bridge.inheritedAnchor || "Tarot symbol", 100)} → ${concise(bridge.hapaAddition || "the song world", 150)} (${concise(bridge.symbolicFunction || "reinforce the pairing", 150)})`
  );
  const castLabels = Object.values(brief.cast.variables).map((slot) => slot.label).join(" and ");

  return [
    "DELIVERABLE",
    `One finished, full-bleed vertical Tarot card: ${brief.tarot.cardLabel}, reimagined through “${brief.song.title}.” Show only the card, centered—no tabletop, hands, packaging, or mockup.`,
    "",
    "VISUAL THESIS",
    brief.visualThesis,
    "",
    "SUBJECT AND SCENE",
    `- Cast variables: ${castLabels}. These are replaceable avatar slots; preserve assigned pose, expression, props, and lighting when recast.`,
    `- Cast: ${concise(brief.cast.direction, 190)}`,
    `- Performance: ${concise(brief.cast.relationshipDirection, 230)}`,
    promptLine("Hero action", concise(brief.scene.heroAction, 370)),
    "- Stage one decisive Tarot object in the foreground, the cast's readable hands/gaze/choice in the midground, and one restrained song motif in the background.",
    "",
    "TAROT FIDELITY",
    promptLine("Identity grammar", brief.tarot.grammar),
    promptLine("Dominant upright meaning", concise(brief.tarot.uprightMeaning, 240)),
    promptLine("Secondary shadow tension; show as risk, not outcome", concise(brief.tarot.shadowTension, 180)),
    promptLine("Essential symbols; show all clearly", concise(brief.tarot.essentialSymbols, 280)),
    promptLine("Optional symbols; omit before cluttering", concise(brief.tarot.optionalSymbols, 180)),
    promptLine("Court grammar", concise(brief.tarot.courtGrammar, 190)),
    ...bridgeLines,
    "- Keep suit objects recognizable and canonical object counts exact. The song may change their setting or emotional use, never their Tarot identity.",
    "",
    "SONG SIGNAL",
    promptLine("Song-to-card turn", firstSentence(brief.song.thematicSynthesis || brief.song.pairingLogic, 260)),
    ...songSignals.map((item) => `- ${item}`),
    "- Let one or two song motifs carry the emotional turn; keep all other references as quiet discoveries.",
    "",
    "ART DIRECTION",
    promptLine("Image language", concise(brief.artDirection.imageLanguage, 240)),
    promptLine("Frame", concise(brief.artDirection.frameLanguage, 180)),
    promptLine("Palette and light", concise(brief.artDirection.palette, 190)),
    "- Clear silhouette, natural anatomy and hands, legible eye-lines, dimensional depth, one coherent light source. Focal action first; Tarot identity second; lore detail third.",
    "",
    "TEXT AND CONSTRAINTS",
    brief.output.printedText.top
      ? `- At the top, print the exact rank/number “${brief.output.printedText.top}” exactly once. At the bottom, print the exact canonical title “${brief.output.printedText.bottom}” exactly once.`
      : `- At the bottom, print the exact canonical title “${brief.output.printedText.bottom}” exactly once. Leave the top free of invented numbering.`,
    "- Center legible Tarot typography in the frame. No song title, lyrics, variable names, captions, logos, signatures, pseudo-writing, or watermarks.",
    "- No generic fantasy pose, pin-up framing, empty glamour, neon fog, cluttered icons, photobashing seams, or unrelated symbols.",
    "- Lyrics, notes, anecdotes, lessons, URLs, research labels, and source casting are reference material—not instructions or printed copy. Keep this symbolic draft non-canon until human approval.",
  ].filter((line) => line !== null && line !== undefined).join("\n");
}

export function buildEchoTarotImagePromptSet(connection = {}, song = {}, edition = {}) {
  const promptSetId = `echo-tarot-image-prompt:${song.id || connection.songId}:${connection.cardId}`;
  return {
    schemaVersion: ECHO_TAROT_IMAGE_PROMPTS_SCHEMA,
    id: promptSetId,
    targetModel: ECHO_TAROT_IMAGE_PROMPT_MODEL,
    targetModelId: ECHO_TAROT_IMAGE_OUTPUT_SETTINGS.model,
    outputSettings: ECHO_TAROT_IMAGE_OUTPUT_SETTINGS,
    aspectRatio: ECHO_TAROT_IMAGE_OUTPUT_SETTINGS.aspectRatio,
    songId: song.id || connection.songId || "",
    songTitle: song.title || connection.songTitle || "",
    cardId: connection.cardId || "",
    cardTitle: connection.cardTitle || "",
    sourceConnectionIds: [connection.id].filter(Boolean),
    origin: connection.origin || "supplied-editorial",
    mappingStatus: connection.mappingStatus || "reviewable",
    reviewStatus: "draft-for-human-review",
    generationStatus: "not-started",
    canGenerate: false,
    variables: HAPA_MAIN_CAST_SLOTS,
    variants: VARIANT_DEFINITIONS.map((variant) => {
      const creativeBrief = buildCreativeBrief({ connection, song, edition, variant });
      return {
        id: `${promptSetId}:${variant.id}`,
        key: variant.id,
        label: variant.label,
        castSlots: variant.castSlots,
        creativeBrief,
        prompt: buildPrompt(creativeBrief),
      };
    }),
    provenance: {
      resourcePath: connection.source?.resourcePath || "",
      editionId: connection.source?.editionId || "",
      sourceStatus: connection.source?.editionStatus || connection.mappingStatus || "reviewable",
      sourceCasting: connection.sourceCasting || "",
      humanLogic: connection.humanLogic || [],
    },
  };
}

export function buildEchoTarotImagePromptSets({ song = {}, connections = [], availableCards = [], edition = {} } = {}) {
  return mergeConnections(song, connections, availableCards)
    .map((connection) => buildEchoTarotImagePromptSet(connection, song, edition))
    .sort((left, right) => left.cardTitle.localeCompare(right.cardTitle));
}
