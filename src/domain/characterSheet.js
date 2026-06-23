import { auditAvatar, createVideoFrameMatchQueue, requirementById, slugify } from "./avatar.js";
import { normalizeTarotStore } from "./tarot.js";

export const CHARACTER_SHEET_VERSION = "hapa.character-sheet.builder.v1";
export const MEDIA_INTELLIGENCE_VERSION = "hapa.avatar-media-intelligence.v1";

export const CHARACTER_SHEET_MODULES = [
  { id: "identity", label: "Identity", accent: "cyan" },
  { id: "persona", label: "Persona", accent: "fuchsia" },
  { id: "lore", label: "Lore", accent: "rose" },
  { id: "skills", label: "Skills", accent: "green" },
  { id: "stats", label: "Stats", accent: "gold" },
  { id: "evidence", label: "Evidence", accent: "violet" },
  { id: "media_intelligence", label: "Media Intelligence", accent: "orange" },
  { id: "tarot_cards", label: "Tarot Cards", accent: "rose" },
  { id: "gaps", label: "Gaps", accent: "cyan" }
];

export const CHARACTER_STAT_KEYS = [
  { key: "strength", label: "Strength", seed: "body/action/kit pose evidence" },
  { key: "dexterity", label: "Dexterity", seed: "movement, weapon, gesture, and loop evidence" },
  { key: "charisma", label: "Charisma", seed: "persona, voice, facial expression, and social read" },
  { key: "wisdom", label: "Wisdom", seed: "lore, dossier, decision rules, and symbolic motifs" },
  { key: "conviction", label: "Conviction", seed: "oaths, ranked values, repeated visual commitments" },
  { key: "resonance", label: "Resonance", seed: "Tarot links, media completeness, and symbolic coherence" }
];

export function createCharacterSheetScaffold(avatar = {}, options = {}) {
  const existing = normalizeCharacterSheet(avatar.characterSheet, avatar);
  const tarotStore = normalizeTarotStore(options.tarotStore || {});
  const mediaSummary = summarizeAvatarMediaIntelligence(avatar);
  const tarot = createTarotCardScaffold(avatar, tarotStore);
  const gaps = createCharacterSheetGapReport(avatar, { tarotStore, mediaSummary });
  const stats = createStatScaffolds(avatar, mediaSummary, tarot, existing.stats?.items);

  return {
    ...existing,
    schemaVersion: CHARACTER_SHEET_VERSION,
    avatarId: avatar.id || existing.avatarId || "unknown-avatar",
    identity: {
      ...existing.identity,
      name: avatar.primaryName || existing.identity.name || "Unnamed",
      aliases: avatarAliases(avatar, existing.identity.aliases),
      summary: existing.identity.summary || avatar.summary || "",
      roles: unique([...(existing.identity.roles || []), "avatar", ...(tarot.linkedCards.length ? ["tarot-linked"] : [])])
    },
    persona: {
      ...existing.persona,
      priorities: arrayOr(existing.persona.priorities, [
        "Preserve canon identity from the Avatar Card.",
        "Separate observed facts from inferred or hypothesis-level traits.",
        "Prefer local evidence from dossier, kit sheet, Tarot records, and media analysis."
      ]),
      voiceRules: arrayOr(existing.persona.voiceRules, []),
      decisionRules: arrayOr(existing.persona.decisionRules, []),
      doNotFake: arrayOr(existing.persona.doNotFake, [
        "Do not invent unsupported biography, powers, or relationships.",
        "Do not treat weak OCR as canon without review."
      ])
    },
    lore: {
      ...existing.lore,
      summary: existing.lore.summary || avatar.operatorNotes || avatar.summary || "",
      motifs: unique([...(existing.lore.motifs || []), ...mediaSummary.signals.symbolicMotifs]).slice(0, 48),
      openQuestions: unique([...(existing.lore.openQuestions || []), ...gaps.filter((gap) => gap.kind === "lore").map((gap) => gap.title)]).slice(0, 48)
    },
    skills: {
      ...existing.skills,
      items: mergeByKey(existing.skills.items, createSkillScaffolds(avatar, mediaSummary), "id").slice(0, 64)
    },
    stats: {
      ...existing.stats,
      formulaVersion: "hapa-character-sheet-local-media-v1",
      items: stats
    },
    evidence: {
      ...existing.evidence,
      pins: mergeByKey(existing.evidence.pins, createEvidencePins(avatar, mediaSummary, tarot), "id").slice(0, 96)
    },
    mediaIntelligence: {
      ...existing.mediaIntelligence,
      schemaVersion: MEDIA_INTELLIGENCE_VERSION,
      ...mediaSummary
    },
    tarot,
    gaps,
    updatedAt: new Date().toISOString()
  };
}

export function normalizeCharacterSheet(input = {}, avatar = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: input.schemaVersion || CHARACTER_SHEET_VERSION,
    avatarId: input.avatarId || avatar.id || "unknown-avatar",
    identity: {
      name: input.identity?.name || avatar.primaryName || "Unnamed",
      handle: input.identity?.handle || "",
      title: input.identity?.title || "",
      summary: input.identity?.summary || avatar.summary || "",
      roles: arrayOr(input.identity?.roles, ["avatar"]),
      aliases: avatarAliases(avatar, input.identity?.aliases)
    },
    persona: {
      archetype: input.persona?.archetype || "",
      voiceRules: arrayOr(input.persona?.voiceRules, []),
      priorities: arrayOr(input.persona?.priorities, []),
      decisionRules: arrayOr(input.persona?.decisionRules, []),
      doNotFake: arrayOr(input.persona?.doNotFake, []),
      notes: input.persona?.notes || ""
    },
    lore: {
      summary: input.lore?.summary || avatar.operatorNotes || "",
      timeline: arrayOr(input.lore?.timeline, []),
      relationships: arrayOr(input.lore?.relationships, []),
      motifs: arrayOr(input.lore?.motifs, []),
      openQuestions: arrayOr(input.lore?.openQuestions, [])
    },
    skills: {
      items: arrayOr(input.skills?.items, [])
    },
    stats: {
      formulaVersion: input.stats?.formulaVersion || "manual",
      items: arrayOr(input.stats?.items, [])
    },
    evidence: {
      pins: arrayOr(input.evidence?.pins, [])
    },
    mediaIntelligence: {
      schemaVersion: input.mediaIntelligence?.schemaVersion || MEDIA_INTELLIGENCE_VERSION,
      summary: input.mediaIntelligence?.summary || {},
      categories: input.mediaIntelligence?.categories || {},
      classifiers: input.mediaIntelligence?.classifiers || {},
      ocr: input.mediaIntelligence?.ocr || {},
      signals: input.mediaIntelligence?.signals || {},
      reviewedAt: input.mediaIntelligence?.reviewedAt || null
    },
    tarot: {
      linkedCards: arrayOr(input.tarot?.linkedCards, []),
      suggestedCards: arrayOr(input.tarot?.suggestedCards, []),
      mediaLinks: arrayOr(input.tarot?.mediaLinks, []),
      deckRoles: arrayOr(input.tarot?.deckRoles, [])
    },
    gaps: arrayOr(input.gaps, []),
    sourceRefs: arrayOr(input.sourceRefs, []),
    createdAt: input.createdAt || avatar.createdAt || now,
    updatedAt: input.updatedAt || avatar.updatedAt || now
  };
}

export function createMediaIntelligenceRecord(asset = {}, vision = {}, options = {}) {
  const lines = arrayOr(vision.textLines, []).map((line) => ({
    text: String(line.text || line).trim(),
    confidence: Number.isFinite(Number(line.confidence)) ? Number(line.confidence) : null
  })).filter((line) => line.text);
  const labels = arrayOr(vision.labels, []).map((label) => ({
    identifier: String(label.identifier || label.label || label).trim(),
    confidence: Number.isFinite(Number(label.confidence)) ? Number(label.confidence) : null
  })).filter((label) => label.identifier);
  const text = lines.map((line) => line.text).join("\n");
  const classification = classifyAssetSemantics(asset, { text, labels });
  const now = new Date().toISOString();

  return {
    schemaVersion: MEDIA_INTELLIGENCE_VERSION,
    status: vision.ok === false ? "needs-review" : lines.length || labels.length ? "enriched" : "scaffolded",
    provider: options.provider || "macos-vision-local",
    model: options.model || "VNRecognizeTextRequest+VNClassifyImageRequest",
    source: options.source || "avatar-media-enrichment",
    confidence: confidenceBand(lines, labels),
    ocr: {
      status: lines.length ? "text-found" : "no-text",
      text,
      lineCount: lines.length,
      lines,
      sourceLanguage: "en-US"
    },
    vision: {
      status: labels.length ? "labels-found" : "unclassified",
      labels,
      description: buildMediaDescription(asset, classification, lines, labels)
    },
    classifications: classification,
    attributes: createAssetAttributes(asset, classification, lines, labels),
    rankings: createAssetRankings(asset, classification, lines, labels),
    tarotCandidates: createTarotCandidates(asset, text, classification),
    sheetSignals: createSheetSignals(asset, text, classification),
    gaps: createAssetIntelligenceGaps(asset, lines, labels, classification),
    enrichedAt: now,
    updatedAt: now
  };
}

export function summarizeAvatarMediaIntelligence(avatar = {}) {
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const enrichedAssets = assets.filter((asset) => asset.metadata?.intelligence);
  const ocrAssets = enrichedAssets.filter((asset) => asset.metadata?.intelligence?.ocr?.text);
  const textLines = ocrAssets.flatMap((asset) => asset.metadata.intelligence.ocr.lines || []);
  const tags = unique(assets.flatMap((asset) => asset.tags || []));
  const documentKinds = countBy(enrichedAssets.map((asset) => asset.metadata?.intelligence?.classifications?.documentKind || classifyAssetSemantics(asset).documentKind));
  const mediaTypes = countBy(assets.map((asset) => asset.type || "unknown"));
  const requirementCounts = countBy(assets.map((asset) => asset.requirementId || "unknown"));
  const labelCounts = countBy(enrichedAssets.flatMap((asset) => (asset.metadata?.intelligence?.vision?.labels || []).map((label) => label.identifier)));
  const symbolicMotifs = unique([
    ...tags.filter((tag) => /sword|wand|cup|pentacle|moon|sun|star|lantern|compass|oath|sigil|blade|guardian|ritual|city|ocean|fire|earth|air|water/i.test(tag)),
    ...textLines.map((line) => String(line.text || line)).filter((line) => /sword|wand|cup|pentacle|moon|sun|star|lantern|compass|oath|sigil|blade|guardian|ritual|city|ocean|fire|earth|air|water/i.test(line)).slice(0, 24)
  ]);

  return {
    summary: {
      totalAssets: assets.length,
      enrichedAssets: enrichedAssets.length,
      imageAssets: assets.filter((asset) => asset.type === "image").length,
      videoAssets: assets.filter((asset) => asset.type === "video").length,
      modelAssets: assets.filter((asset) => asset.type === "model").length,
      ocrAssets: ocrAssets.length,
      ocrLineCount: textLines.length,
      classifierCoverage: assets.length ? Math.round((enrichedAssets.length / assets.length) * 100) : 0
    },
    categories: {
      mediaTypes,
      requirements: requirementCounts,
      documentKinds,
      topLabels: topEntries(labelCounts, 12),
      topTags: topEntries(countBy(tags), 20)
    },
    classifiers: {
      provider: "mixed-local-derived",
      schemaVersion: MEDIA_INTELLIGENCE_VERSION,
      complete: assets.length > 0 && enrichedAssets.length >= assets.filter((asset) => asset.type === "image").length
    },
    ocr: {
      assetsWithText: ocrAssets.map((asset) => ({
        assetId: asset.id,
        name: asset.name,
        requirementId: asset.requirementId,
        lineCount: asset.metadata?.intelligence?.ocr?.lineCount || 0,
        leadText: (asset.metadata?.intelligence?.ocr?.text || "").split("\n").slice(0, 5).join(" / ")
      })).slice(0, 64)
    },
    signals: {
      symbolicMotifs,
      dossierAssets: assets.filter((asset) => asset.requirementId === "character_dossier").map(assetSummary),
      kitAssets: assets.filter((asset) => asset.requirementId === "kit_sheet" || asset.requirementId === "kit_items").map(assetSummary),
      motionAssets: assets.filter((asset) => asset.type === "video").map(assetSummary)
    },
    reviewedAt: new Date().toISOString()
  };
}

export function createCharacterSheetGapReport(avatar = {}, { tarotStore = {}, mediaSummary = null } = {}) {
  const audit = auditAvatar(avatar);
  const media = mediaSummary || summarizeAvatarMediaIntelligence(avatar);
  const tarot = createTarotCardScaffold(avatar, normalizeTarotStore(tarotStore));
  const assets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const imageAssets = assets.filter((asset) => asset.type === "image");
  const enrichedImages = imageAssets.filter((asset) => asset.metadata?.intelligence);
  const gaps = [];

  if (audit.missing > 0) {
    gaps.push({
      id: `gap-${avatar.id || "avatar"}-media-slots`,
      kind: "media",
      severity: "high",
      title: `${audit.missing} Avatar Card media slots are still empty`,
      detail: "Completion gaps limit confidence for Sheet Builder stats, skills, and lore.",
      action: "Run healing queue or attach existing media."
    });
  }
  if (imageAssets.length && enrichedImages.length < imageAssets.length) {
    gaps.push({
      id: `gap-${avatar.id || "avatar"}-ocr-coverage`,
      kind: "analysis",
      severity: "high",
      title: `${imageAssets.length - enrichedImages.length} image assets still need OCR/vision enrichment`,
      detail: "Character dossier and kit sheet text should be captured before lore and skill fields are treated as stable.",
      action: "Run npm run enrich:avatars."
    });
  }
  if (!media.ocr.assetsWithText.some((asset) => asset.requirementId === "character_dossier")) {
    gaps.push({
      id: `gap-${avatar.id || "avatar"}-dossier-text`,
      kind: "lore",
      severity: "medium",
      title: "No readable Character Dossier OCR has been promoted yet",
      detail: "Persona, lore, classifiers, and rankings should cite Dossier text when available.",
      action: "Attach a dossier image or rerun OCR on current dossier assets."
    });
  }
  if (!media.ocr.assetsWithText.some((asset) => asset.requirementId === "kit_sheet")) {
    gaps.push({
      id: `gap-${avatar.id || "avatar"}-kit-text`,
      kind: "skill",
      severity: "medium",
      title: "No readable Kit Sheet OCR has been promoted yet",
      detail: "Skills and equipment abilities need kit-source evidence.",
      action: "Attach a kit sheet image or rerun OCR on kit assets."
    });
  }
  if (!tarot.linkedCards.length) {
    gaps.push({
      id: `gap-${avatar.id || "avatar"}-tarot-links`,
      kind: "tarot",
      severity: "medium",
      title: "No Tarot cards are linked to this avatar",
      detail: "The Sheet Builder can surface deck symbolism once the Tarot library has avatar links.",
      action: "Link cards in the Tarot view or run OCR enrichment to infer unique avatar anchors."
    });
  }

  return gaps;
}

export function createTarotCardScaffold(avatar = {}, tarotStore = {}) {
  const store = normalizeTarotStore(tarotStore);
  const avatarId = avatar.id || "";
  const linkedCards = store.cards
    .filter((card) => card.avatarLinks?.some((link) => link.avatarId === avatarId))
    .map((card) => ({
      cardId: card.id,
      title: card.title,
      cardType: card.cardType,
      suit: card.suit,
      arcana: card.arcana,
      number: card.number,
      status: card.status,
      keywords: (card.keywords || []).slice(0, 18),
      assetUri: card.asset?.uri || null,
      loopVideos: (card.assets || []).filter((asset) => asset.type === "video").length,
      link: card.avatarLinks.find((item) => item.avatarId === avatarId) || null
    }));

  return {
    linkedCards,
    suggestedCards: [],
    mediaLinks: linkedCards.map((card) => ({
      id: `tarot-link-${avatarId}-${card.cardId}`,
      targetType: "tarot-card",
      targetId: card.cardId,
      role: card.link?.role || "avatar-symbol",
      confidence: card.link?.tags?.includes("vision-ocr") ? "medium" : "manual"
    })),
    deckRoles: unique(linkedCards.flatMap((card) => [card.suit, card.arcana, card.cardType])).filter(Boolean)
  };
}

function createSkillScaffolds(avatar, mediaSummary) {
  const skills = [];
  const add = (id, label, evidence, confidence = 0.45) => {
    skills.push({
      id,
      label,
      claim: evidence,
      status: confidence >= 0.75 ? "observed" : "inferred",
      confidence,
      evidence: [{ type: "media-summary", label: evidence }]
    });
  };
  if ((mediaSummary.categories.requirements.kit_items || 0) > 0 || (mediaSummary.categories.requirements.kit_sheet || 0) > 0) {
    add("kit-literacy", "Kit Literacy", "Kit sheet/items are present; extract tool-specific skills from OCR.", 0.62);
  }
  if ((mediaSummary.summary.videoAssets || 0) > 0) {
    add("motion-continuity", "Motion Continuity", "Loop videos exist for motion, pose, or scene transitions.", 0.58);
  }
  if ((mediaSummary.categories.requirements.closeup_emotions || 0) > 0) {
    add("expressive-range", "Expressive Range", "Close-up emotion shots provide acting-state evidence.", 0.56);
  }
  if (mediaSummary.signals.symbolicMotifs.length) {
    add("symbolic-resonance", "Symbolic Resonance", `Motifs detected: ${mediaSummary.signals.symbolicMotifs.slice(0, 6).join(", ")}.`, 0.5);
  }
  return skills;
}

function createStatScaffolds(avatar, mediaSummary, tarot, existingStats = []) {
  const existing = new Map(arrayOr(existingStats, []).map((stat) => [stat.key, stat]));
  return CHARACTER_STAT_KEYS.map((stat) => {
    const mediaScore = statScore(stat.key, avatar, mediaSummary, tarot);
    return {
      key: stat.key,
      label: stat.label,
      value: existing.get(stat.key)?.value ?? mediaScore.value,
      rankBand: existing.get(stat.key)?.rankBand || mediaScore.rankBand,
      confidence: existing.get(stat.key)?.confidence ?? mediaScore.confidence,
      evidenceCount: mediaScore.evidenceCount,
      formulaSeed: stat.seed,
      explanation: existing.get(stat.key)?.explanation || mediaScore.explanation
    };
  });
}

function createEvidencePins(avatar, mediaSummary, tarot) {
  const pins = [];
  const addAssetPin = (asset, surface) => {
    pins.push({
      id: `pin-${avatar.id}-${asset.id}`,
      targetType: "avatar-media",
      targetId: asset.id,
      surface,
      visibility: "owner",
      title: asset.name,
      caption: requirementById(asset.requirementId)?.label || asset.requirementId,
      reviewedAt: null
    });
  };
  mediaSummary.signals.dossierAssets.slice(0, 3).forEach((asset) => addAssetPin(asset, "dossier"));
  mediaSummary.signals.kitAssets.slice(0, 6).forEach((asset) => addAssetPin(asset, "kit"));
  for (const card of tarot.linkedCards.slice(0, 12)) {
    pins.push({
      id: `pin-${avatar.id}-${card.cardId}`,
      targetType: "tarot-card",
      targetId: card.cardId,
      surface: "tarot",
      visibility: "owner",
      title: card.title,
      caption: `${card.cardType} / ${card.suit} / ${card.arcana}`,
      reviewedAt: null
    });
  }
  return pins;
}

function classifyAssetSemantics(asset = {}, input = {}) {
  const text = normalizeText(input.text || "");
  const labelText = normalizeText((input.labels || []).map((label) => label.identifier).join(" "));
  const haystack = normalizeText([
    asset.name,
    asset.requirementId,
    asset.notes,
    ...(asset.tags || []),
    text,
    labelText
  ].join(" "));
  const documentKind = detectDocumentKind(asset, haystack);
  return {
    documentKind,
    medium: asset.type === "video" ? "video-loop" : asset.type === "model" ? "3d-model" : "image",
    isComic: /comic|panel|page|speech|dialogue|frame/.test(haystack),
    isTarotCard: /tarot|arcana|suit|card back|card front|pentacles|wands|cups|swords/.test(haystack),
    isDossier: documentKind === "character_dossier",
    isKit: documentKind === "kit_sheet" || documentKind === "kit_item",
    characterRead: detectCharacterRead(haystack),
    activity: detectActivity(haystack),
    palette: detectPalette(haystack),
    productionUse: productionUseFor(asset, documentKind),
    reviewPriority: documentKind === "character_dossier" || documentKind === "kit_sheet" ? "high" : "normal"
  };
}

function detectDocumentKind(asset, haystack) {
  if (asset.requirementId === "character_dossier" || /character dossier|archetype dossier|identity/.test(haystack)) return "character_dossier";
  if (asset.requirementId === "kit_sheet" || /kit sheet|kit tools|equipment|loadout/.test(haystack)) return "kit_sheet";
  if (asset.requirementId === "kit_items") return "kit_item";
  if (asset.requirementId === "tarot_card" || /tarot|arcana|card back|card front|suit essence/.test(haystack)) return "tarot_card";
  if (/concept sheet|visual language|palette|material/.test(haystack)) return "reference_sheet";
  if (/comic|panel|page|dialogue|speech/.test(haystack)) return "comic";
  if (asset.type === "video") return "loop_video";
  if (/fullbody|full body|backgroundless|two thirds|closeup|portrait/.test(haystack)) return "avatar_reference";
  return "media_asset";
}

function detectCharacterRead(haystack) {
  const gender = /woman|female|girl|she|her/.test(haystack)
    ? "feminine-coded"
    : /man|male|boy|he|him/.test(haystack)
      ? "masculine-coded"
      : "unspecified";
  const framing = /closeup|close up|portrait|face/.test(haystack)
    ? "close-up"
    : /fullbody|full body/.test(haystack)
      ? "full-body"
      : /two thirds|2 3/.test(haystack)
        ? "two-thirds"
        : "unspecified";
  return { gender, framing };
}

function detectActivity(haystack) {
  const actions = [
    ["combat", /fight|combat|attack|block|dodge|blade|weapon|battle/],
    ["movement", /walk|run|dance|turn|jump|motion|loop|pose/],
    ["ritual", /ritual|oath|sigil|altar|oracle|sacred/],
    ["craft", /craft|forge|build|labor|tool|kit|repair/],
    ["social", /talk|dialogue|romance|lovers|team|protocol/]
  ];
  return actions.filter(([, pattern]) => pattern.test(haystack)).map(([label]) => label);
}

function detectPalette(haystack) {
  const colors = [
    "red", "blue", "green", "yellow", "purple", "pink", "black", "white",
    "gold", "teal", "cyan", "magenta", "orange", "forest", "sage", "midnight",
    "brass", "seafoam", "parchment", "ivory", "gray", "brown"
  ];
  return colors.filter((color) => new RegExp(`\\b${color}\\b`).test(haystack)).slice(0, 12);
}

function productionUseFor(asset, documentKind) {
  if (documentKind === "character_dossier") return ["identity", "persona", "lore", "visual-rules"];
  if (documentKind === "kit_sheet" || documentKind === "kit_item") return ["skills", "equipment", "abilities"];
  if (documentKind === "tarot_card") return ["symbolism", "deck", "readings", "avatar-links"];
  if (asset.type === "video") return ["motion", "continuity", "loop-preview"];
  return ["reference", "classification", "prompt-context"];
}

function createAssetAttributes(asset, classification, lines, labels) {
  return {
    sourceRequirement: asset.requirementId || "unknown",
    originalFileName: asset.metadata?.originalFileName || asset.metadata?.originalAssetName || null,
    dimensions: {
      width: asset.metadata?.width || null,
      height: asset.metadata?.height || null
    },
    tags: asset.tags || [],
    palette: classification.palette,
    textDensity: lines.length >= 80 ? "dense" : lines.length >= 24 ? "medium" : lines.length ? "light" : "none",
    visualLabelCount: labels.length,
    productionUse: classification.productionUse
  };
}

function createAssetRankings(asset, classification, lines, labels) {
  const evidenceScore = Math.min(100, lines.length * 2 + labels.length * 4 + (asset.tags?.length || 0) * 2);
  return {
    evidenceDensity: evidenceScore,
    sheetValue: classification.reviewPriority === "high" ? Math.max(70, evidenceScore) : evidenceScore,
    ocrConfidence: confidenceBand(lines, labels),
    reviewPriority: classification.reviewPriority
  };
}

function createTarotCandidates(asset, text, classification) {
  if (!classification.isTarotCard && asset.requirementId !== "tarot_card") return [];
  const suit = /pentacle|earth/.test(normalizeText(text)) ? "pentacles"
    : /cup|water|tide|ocean/.test(normalizeText(text)) ? "cups"
      : /wand|fire/.test(normalizeText(text)) ? "wands"
        : /sword|air|blade/.test(normalizeText(text)) ? "swords"
          : "custom";
  return [{
    id: `candidate-tarot-${asset.id}`,
    confidence: classification.isTarotCard ? "medium" : "low",
    cardType: /card back/.test(normalizeText(text)) ? "card_back" : "reference_card",
    suit,
    reason: "Detected Tarot/card language in OCR, filename, tags, or requirement metadata."
  }];
}

function createSheetSignals(asset, text, classification) {
  return {
    identity: classification.isDossier ? extractLeadLines(text, 8) : [],
    lore: /lore|story|oath|memory|timeline|origin/.test(normalizeText(text)) ? extractLeadLines(text, 12) : [],
    skills: classification.isKit ? extractLeadLines(text, 16) : [],
    persona: /voice|persona|trait|emotion|motive|priority|decision/.test(normalizeText(text)) ? extractLeadLines(text, 12) : [],
    statHints: classification.activity
  };
}

function createAssetIntelligenceGaps(asset, lines, labels, classification) {
  const gaps = [];
  if (asset.type === "image" && !lines.length && ["character_dossier", "kit_sheet", "tarot_card", "reference_sheet"].includes(classification.documentKind)) {
    gaps.push("expected-text-not-found");
  }
  if (asset.type === "image" && !labels.length) gaps.push("vision-labels-empty");
  if (classification.reviewPriority === "high" && !lines.length) gaps.push("high-value-source-needs-review");
  return gaps;
}

function buildMediaDescription(asset, classification, lines, labels) {
  const labelText = labels.slice(0, 8).map((label) => `${label.identifier}${label.confidence ? ` ${Math.round(label.confidence * 100)}%` : ""}`).join(", ");
  const leadText = lines.slice(0, 8).map((line) => line.text).join(" / ");
  return `${asset.name || "Media asset"} is classified as ${classification.documentKind} (${classification.medium}) for ${classification.productionUse.join(", ")}. OCR recovered ${lines.length} text line${lines.length === 1 ? "" : "s"}${leadText ? `, beginning with: ${leadText}` : ""}. Vision labels: ${labelText || "none"}.`;
}

function statScore(key, avatar, mediaSummary, tarot) {
  const audit = auditAvatar(avatar);
  const base = Math.round(audit.percent * 0.44);
  const video = mediaSummary.summary.videoAssets || 0;
  const ocr = mediaSummary.summary.ocrAssets || 0;
  const tarotLinks = tarot.linkedCards.length;
  const requirementCounts = mediaSummary.categories.requirements;
  const modifiers = {
    strength: (requirementCounts.kit_poses || 0) + (requirementCounts.fullbody_backgroundless || 0),
    dexterity: video * 2 + (requirementCounts.kit_items || 0),
    charisma: (requirementCounts.closeup_emotions || 0) * 2,
    wisdom: ocr * 4 + (requirementCounts.character_dossier || 0) * 6,
    conviction: tarotLinks * 6 + mediaSummary.signals.symbolicMotifs.length,
    resonance: tarotLinks * 8 + ocr * 2 + Math.round(audit.percent / 4)
  };
  const value = Math.max(1, Math.min(99, base + (modifiers[key] || 0)));
  return {
    value,
    rankBand: value >= 85 ? "legendary" : value >= 70 ? "strong" : value >= 45 ? "developing" : "seed",
    confidence: Math.min(0.92, 0.22 + (audit.percent / 160) + (ocr / 20) + (tarotLinks / 18)),
    evidenceCount: (modifiers[key] || 0) + ocr + tarotLinks,
    explanation: `Derived from Avatar Card completeness (${audit.percent}%), media coverage, OCR assets (${ocr}), and Tarot links (${tarotLinks}).`
  };
}

function assetSummary(asset) {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    requirementId: asset.requirementId,
    uri: asset.uri,
    thumbnailUri: asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri || null,
    tags: (asset.tags || []).slice(0, 12)
  };
}

function confidenceBand(lines, labels) {
  const lineConfidence = average(lines.map((line) => line.confidence).filter((value) => value !== null));
  const labelConfidence = average(labels.map((label) => label.confidence).filter((value) => value !== null));
  const score = Math.max(lineConfidence || 0, labelConfidence || 0);
  if (score >= 0.75) return "high";
  if (score >= 0.45 || lines.length || labels.length) return "medium";
  return "low";
}

function extractLeadLines(text, limit) {
  return String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

function avatarAliases(avatar, fallback = []) {
  return unique([
    ...(Array.isArray(fallback) ? fallback : []),
    ...(avatar.aliases || []),
    ...(avatar.names || []).map((item) => item.name || item).filter((name) => name !== avatar.primaryName)
  ]);
}

function mergeByKey(existing = [], generated = [], key = "id") {
  const map = new Map();
  for (const item of generated) map.set(item[key], item);
  for (const item of existing || []) map.set(item[key], { ...(map.get(item[key]) || {}), ...item });
  return [...map.values()];
}

function arrayOr(value, fallback) {
  return Array.isArray(value) ? value : fallback;
}

function countBy(items = []) {
  return items.filter(Boolean).reduce((acc, item) => {
    const key = String(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(record = {}, limit = 12) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createCharacterSheetAttachPack(avatar = {}, tarotStore = {}) {
  const sheet = createCharacterSheetScaffold(avatar, { tarotStore });
  return {
    schemaVersion: "hapa.character-sheet-attach-pack.v1",
    avatarId: avatar.id || sheet.avatarId,
    primaryName: avatar.primaryName || sheet.identity.name,
    sheet,
    modules: CHARACTER_SHEET_MODULES,
    videoRouteCandidates: createVideoFrameMatchQueue(avatar, { threshold: 0.9 }).slice(0, 24),
    generatedAt: new Date().toISOString()
  };
}
