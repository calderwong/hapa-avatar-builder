#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createItemCard, normalizeItemManagerStore } from "../src/domain/item.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_ROOT = path.join(DATA_DIR, "media", "hapa-cards");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const ITEM_STORE_PATH = path.join(DATA_DIR, "item-manager-store.json");
const MANIFEST_PATH = path.join(DATA_DIR, "hapa-foundation-card-import-manifest.json");

const HAPA_ROOT = "/Users/calderwong/Desktop/hapa";
const WIKI_ROOT = "/Users/calderwong/Desktop/Hapa_Worldbuilding_Wiki";
const SKILLS_ROOT = "/Users/calderwong/Desktop/hapa-skills-app";
const PROTOCOL_IMAGE_DIR = path.join(HAPA_ROOT, "site/generated/protocol-cards");
const PROTOCOL_LIBRARY_PATH = path.join(PROTOCOL_IMAGE_DIR, "protocol-card-library.json");
const PROTOCOL_IMAGE_INDEX_PATH = path.join(PROTOCOL_IMAGE_DIR, "index.json");
const SKILL_CARDS_PATH = path.join(SKILLS_ROOT, "data/skill-cards.json");
const NODE_ICON_MANIFEST_PATH = path.join(WIKI_ROOT, "Cards/Node Icon Cards/node-icon-manifest.json");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readTextIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) return "";
  return readFile(filePath, "utf8");
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function titleize(value = "") {
  return String(value || "")
    .replace(/[-_/]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function relativeSource(filePath) {
  if (!filePath) return "";
  if (filePath.startsWith(WIKI_ROOT)) return filePath.replace(`${WIKI_ROOT}/`, "wiki:");
  if (filePath.startsWith(HAPA_ROOT)) return filePath.replace(`${HAPA_ROOT}/`, "hapa:");
  if (filePath.startsWith(SKILLS_ROOT)) return filePath.replace(`${SKILLS_ROOT}/`, "hapa-skills-app:");
  return filePath;
}

function extractSection(markdown = "", heading = "") {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n# |$)`, "m"));
  return match ? match[1].trim() : "";
}

function extractMechanic(markdown = "", label = "") {
  const section = extractSection(markdown, "Card Mechanics");
  const match = section.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "im"));
  return match ? match[1].trim() : "";
}

function extractStats(markdown = "") {
  const stats = extractMechanic(markdown, "Stats");
  const values = {};
  for (const part of stats.split(",")) {
    const match = part.trim().match(/^([a-z ]+)\s+(\d+)/i);
    if (match) values[slugify(match[1]).replace(/-/g, "")] = Number(match[2]);
  }
  return values;
}

async function copyMedia(sourcePath, lane, id, label) {
  if (!sourcePath || !existsSync(sourcePath)) return null;
  const ext = path.extname(sourcePath).toLowerCase() || ".png";
  const safeFile = `${slugify(id || label) || `media-${Date.now()}`}${ext}`;
  const targetDir = path.join(MEDIA_ROOT, lane);
  const targetPath = path.join(targetDir, safeFile);
  await mkdir(targetDir, { recursive: true });
  await copyFile(sourcePath, targetPath);
  return {
    id: `media-${slugify(id || label)}`,
    title: label || path.basename(sourcePath),
    type: "image",
    uri: `/media/hapa-cards/${lane}/${safeFile}`,
    thumbnailUri: `/media/hapa-cards/${lane}/${safeFile}`,
    sourceAssetId: "",
    tags: [lane, "hapa-foundation-card-media"],
    confidence: "hard",
    notes: `Copied from ${relativeSource(sourcePath)}`
  };
}

async function createFallbackSvg(lane, id, title, subtitle = "") {
  const targetDir = path.join(MEDIA_ROOT, lane);
  const safeFile = `${slugify(id || title)}.svg`;
  const targetPath = path.join(targetDir, safeFile);
  await mkdir(targetDir, { recursive: true });
  const accent = lane === "protocols" ? "#00f3ff" : lane === "skills" ? "#39ff14" : "#4facfe";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1260" role="img" aria-label="${escapeXml(title)} card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07111f"/>
      <stop offset="0.52" stop-color="#10182d"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="900" height="1260" rx="42" fill="url(#bg)"/>
  <rect x="42" y="42" width="816" height="1176" rx="30" fill="none" stroke="${accent}" stroke-width="5" filter="url(#glow)"/>
  <circle cx="450" cy="470" r="210" fill="none" stroke="${accent}" stroke-width="8" opacity="0.82"/>
  <path d="M238 470h424M450 258v424M300 320l300 300M600 320 300 620" stroke="${accent}" stroke-width="5" opacity="0.42"/>
  <text x="450" y="890" fill="#f8fbff" font-family="Inter, Arial, sans-serif" font-size="58" text-anchor="middle" font-weight="800">${escapeXml(title).slice(0, 28)}</text>
  <text x="450" y="960" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="28" text-anchor="middle" letter-spacing="4">${escapeXml(subtitle || lane.toUpperCase())}</text>
</svg>`;
  await writeFile(targetPath, svg, "utf8");
  return {
    id: `media-${slugify(id || title)}`,
    title,
    type: "image",
    uri: `/media/hapa-cards/${lane}/${safeFile}`,
    thumbnailUri: `/media/hapa-cards/${lane}/${safeFile}`,
    tags: [lane, "hapa-foundation-card-media", "cms-rendered-svg"],
    confidence: "generated",
    notes: "Deterministic CMS fallback media for a card without specific generated art."
  };
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildProtocolCards(now) {
  const library = await readJson(PROTOCOL_LIBRARY_PATH);
  const imageIndex = await readJson(PROTOCOL_IMAGE_INDEX_PATH);
  const imageById = new Map((imageIndex.cards || []).map((card) => [card.id, card]));
  const cards = [];

  for (const source of library.cards || []) {
    const id = `protocol-card-${source.id}`;
    const image = imageById.get(source.id);
    const cardPath = source.cardPath || "";
    const markdown = await readTextIfExists(cardPath);
    const cardText = extractSection(markdown, "Card Text");
    const recordRule = extractSection(markdown, "Record Rule");
    const rank = extractMechanic(markdown, "Rank") || "Foundation";
    const grade = extractMechanic(markdown, "Grade") || "A";
    const effect = extractMechanic(markdown, "Effect") || source.function || "";
    const risk = extractMechanic(markdown, "Risk") || "";
    const stats = extractStats(markdown);
    const mediaAsset = image?.file
      ? await copyMedia(path.join(PROTOCOL_IMAGE_DIR, image.file), "protocols", id, source.title)
      : await createFallbackSvg("protocols", id, source.title, source.verb || "Protocol");

    cards.push(createItemCard({
      id,
      kind: "protocol",
      cardType: "protocol_card",
      title: source.title,
      canonStatus: "hard_canon",
      summary: source.function || cardText,
      description: cardText || source.function || "",
      lore: [effect, risk ? `Risk: ${risk}` : "", recordRule ? `Record rule: ${recordRule}` : ""].filter(Boolean).join("\n\n"),
      utility: unique([source.function, effect, source.verb ? `Verb: ${source.verb}` : ""]),
      broadGameMechanics: unique([
        source.category ? `Protocol family: ${source.category}` : "",
        source.verb ? `Playable verb: ${source.verb}` : "",
        effect,
        recordRule
      ]),
      tags: unique(["protocol", "protocol-card", "hapa-foundation-card", "foundation-deck", source.category, source.verb, source.id]),
      rank,
      quality: {
        rank,
        confidence: "hard",
        power: Number(stats.impact || 8),
        complexity: Number(stats.complexity || 5),
        reuse: Number(stats.teaching || 8),
        risk: Number(stats.risk || 2),
        completeness: 92
      },
      mediaPrompts: {
        heroImage: image?.promptSummary || `${source.title} protocol card art in Hapa NeonBlade style.`,
        twoD: image?.promptSummary || "",
        wikiEntry: source.cardPath || "",
        negativePrompt: "no unreadable UI text baked into the illustration"
      },
      mediaAssets: mediaAsset ? [mediaAsset] : [],
      sourceRefs: [
        { label: "Hapa protocol card library", uri: PROTOCOL_LIBRARY_PATH, confidence: "hard" },
        cardPath ? { label: "Wiki protocol card", uri: cardPath, confidence: "hard" } : null,
        source.protocolPath ? { label: "Protocol operation page", uri: source.protocolPath, confidence: "hard" } : null,
        source.secondBrainSlug ? { label: "Second Brain slug", uri: source.secondBrainSlug, confidence: "soft" } : null
      ].filter(Boolean),
      equipment: {
        hardpointHints: ["protocols"],
        equipRules: ["Equip to Avatar Deck or Protocols hardpoint when this rule should guide the avatar's actions."],
        effects: unique([effect, source.function]),
        limits: risk ? [risk] : []
      },
      createdAt: now,
      updatedAt: now
    }));
  }
  return cards;
}

async function buildSkillCards(now) {
  const sourceCards = (await readJson(SKILL_CARDS_PATH)).filter((card) => card.source === "protocol-foundation");
  const cards = [];
  for (const source of sourceCards) {
    const mediaAsset = await copyMedia(source.image?.path, "skills", source.id, source.name) ||
      await createFallbackSvg("skills", source.id, source.name, source.level || "Skill");
    cards.push(createItemCard({
      id: source.id,
      kind: "skill",
      cardType: "skill_card",
      title: source.name,
      canonStatus: "soft_canon",
      summary: source.description || source.exampleUseCase || "",
      description: source.howItWorks || source.description || "",
      lore: `A Hapa execution skill from the Skills App foundation taxonomy. It turns intent into a typed, provenance-recorded work contract.`,
      utility: unique([source.howItWorks, source.exampleUseCase, ...(source.uses || [])]),
      broadGameMechanics: unique([
        `Skill level: ${source.level}`,
        "Adds a reusable action to an Avatar Deck.",
        "Can be paired with Protocol Cards for governance and Node Cards for routing."
      ]),
      tags: unique(["skill", "skill-card", "hapa-foundation-card", "foundation-deck", source.level, source.source, slugify(source.name)]),
      rank: source.level || "foundation",
      quality: {
        rank: source.level || "foundation",
        confidence: "soft",
        power: source.level === "base" ? 6 : 7,
        complexity: source.level === "base" ? 3 : 5,
        reuse: 9,
        risk: 3,
        completeness: 86
      },
      mediaPrompts: {
        heroImage: source.image?.promptStyle || `Hapa skill-card art for ${source.name}.`,
        twoD: source.image?.promptStyle || "",
        wikiEntry: source.sourceCard?.title || ""
      },
      mediaAssets: mediaAsset ? [mediaAsset] : [],
      sourceRefs: [
        { label: "Hapa Skills App skill-cards.json", uri: SKILL_CARDS_PATH, confidence: "hard" },
        source.image?.path ? { label: "Skill source image", uri: source.image.path, confidence: "hard" } : null,
        source.image?.url ? { label: "Generated image URL", uri: source.image.url, confidence: "soft" } : null
      ].filter(Boolean),
      equipment: {
        hardpointHints: ["skills"],
        equipRules: ["Equip to Avatar Deck or Skills hardpoint when the avatar should be able to invoke this action."],
        effects: unique([source.exampleUseCase, ...(source.uses || [])]),
        limits: ["Generated/provisional skill cards remain reviewable until canonized."]
      },
      createdAt: now,
      updatedAt: now
    }));
  }
  return cards;
}

async function buildNodeCards(now) {
  const manifest = await readJson(NODE_ICON_MANIFEST_PATH);
  const cards = [];
  for (const source of manifest.nodes || []) {
    const id = `node-card-${source.slug}`;
    const cardRecordPath = path.join(WIKI_ROOT, source.wiki_paths?.card_record || "");
    const sourcePagePath = path.join(WIKI_ROOT, source.source_path || "");
    const markdown = await readTextIfExists(cardRecordPath);
    const functionalRead = extractSection(markdown, "Functional Read");
    const mediaAssets = [];
    for (const [kind, relPath] of Object.entries(source.wiki_paths || {})) {
      if (!["card", "badge", "glyph"].includes(kind)) continue;
      const copied = await copyMedia(path.join(WIKI_ROOT, relPath), "nodes", `${source.slug}-${kind}`, `${source.label} ${kind}`);
      if (copied) mediaAssets.push({ ...copied, tags: unique([...copied.tags, `node-${kind}`]) });
    }
    if (!mediaAssets.length) mediaAssets.push(await createFallbackSvg("nodes", id, source.label, source.category || "Node"));

    cards.push(createItemCard({
      id,
      kind: "node",
      cardType: "node_card",
      title: source.label,
      canonStatus: "soft_canon",
      summary: functionalRead || `${source.label} is a Hapa ${source.node_type || "node"} in the ${source.category || "general"} lane.`,
      description: functionalRead || "",
      lore: `Node Card for ${source.label}. In Black Horizon terms, this card can be treated as a Garden, ship station, or operational routing locus for avatar work.`,
      utility: unique([
        `Route: ${source.source_path || source.slug}`,
        `Category: ${source.category || "unknown"}`,
        `Node type: ${source.node_type || "unknown"}`
      ]),
      broadGameMechanics: unique([
        "Equips as an operational node, ship, station, or location context.",
        "Pairs with Protocol Cards for rules and Skill Cards for executable actions.",
        "Can anchor an Avatar Deck around a concrete Hapa service."
      ]),
      tags: unique(["node", "node-card", "hapa-node", "hapa-foundation-card", "foundation-deck", source.category, source.node_type, source.slug]),
      rank: source.node_type || "node",
      quality: {
        rank: source.node_type || "node",
        confidence: "soft",
        power: 7,
        complexity: 5,
        reuse: 8,
        risk: 4,
        completeness: mediaAssets.length ? 88 : 70
      },
      mediaPrompts: {
        heroImage: `Hapa NeonBlade node card for ${source.label}, category ${source.category}, type ${source.node_type}.`,
        twoD: `Use the node icon card as the canonical visual reference for ${source.label}.`,
        wikiEntry: cardRecordPath
      },
      mediaAssets,
      sourceRefs: [
        { label: "Node icon manifest", uri: NODE_ICON_MANIFEST_PATH, confidence: "hard" },
        { label: "Node icon card record", uri: cardRecordPath, confidence: "hard" },
        existsSync(sourcePagePath) ? { label: "Node source page", uri: sourcePagePath, confidence: "hard" } : null
      ].filter(Boolean),
      connections: {
        nodeIds: [source.node_id || source.slug]
      },
      equipment: {
        hardpointHints: ["node_ship", "location"],
        equipRules: ["Equip to Avatar Deck, Node / Ship, or Location when the avatar should route through this node."],
        effects: [`Adds ${source.label} node context to the avatar.`],
        limits: ["Node runtime health must still be verified before claiming a service is online."]
      },
      createdAt: now,
      updatedAt: now
    }));
  }
  return cards;
}

async function main() {
  const now = new Date().toISOString();
  const itemStore = normalizeItemManagerStore(await readJson(ITEM_STORE_PATH));
  const existingById = new Map(itemStore.cards.map((card) => [card.id, card]));
  const importedCards = [
    ...(await buildProtocolCards(now)),
    ...(await buildSkillCards(now)),
    ...(await buildNodeCards(now))
  ].map((card) => {
    const existing = existingById.get(card.id);
    return existing ? { ...card, createdAt: existing.createdAt || card.createdAt } : card;
  });

  const importedIds = new Set(importedCards.map((card) => card.id));
  const nextCards = [
    ...itemStore.cards.filter((card) => !importedIds.has(card.id)),
    ...importedCards
  ];
  const nextStore = normalizeItemManagerStore({
    ...itemStore,
    cards: nextCards,
    updatedAt: now
  });
  const manifest = {
    schemaVersion: "hapa.foundation-card-import-manifest.v1",
    generatedAt: now,
    source: "scripts/import-hapa-foundation-cards.mjs",
    counts: {
      protocols: importedCards.filter((card) => card.kind === "protocol").length,
      skills: importedCards.filter((card) => card.kind === "skill").length,
      nodes: importedCards.filter((card) => card.kind === "node").length,
      total: importedCards.length,
      withMedia: importedCards.filter((card) => card.mediaAssets?.length).length
    },
    ids: importedCards.map((card) => ({ id: card.id, title: card.title, kind: card.kind, media: card.mediaAssets?.length || 0 }))
  };

  await mkdir(BACKUP_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  const stamp = now.replace(/[:.]/g, "-");
  await writeFile(
    path.join(BACKUP_DIR, `item-manager-store.before-foundation-card-import-${stamp}.json`),
    `${JSON.stringify(itemStore, null, 2)}\n`
  );
  await writeFile(ITEM_STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Imported ${manifest.counts.total} foundation cards: ${manifest.counts.protocols} protocols, ${manifest.counts.skills} skills, ${manifest.counts.nodes} nodes.`);
  console.log(`Media linked on ${manifest.counts.withMedia} imported cards.`);
  console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
