import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildEchoTarotSongConnections, compactEchoTarotEditionCards } from "../src/domain/echo-tarot-song-links.js";
import {
  ECHO_TAROT_IMAGE_PROMPTS_SCHEMA,
  buildEchoTarotImagePromptSets,
} from "../src/domain/echo-tarot-image-prompts.js";

const edition = JSON.parse(await readFile(new URL("../resources/echo-album/hapa-tarot-echoes-v1.json", import.meta.url), "utf8"));
const songs = edition.track_index.map((track) => ({
  id: `dear-papa-song-${track.track_id.toLowerCase()}`,
  songId: track.track_id.toLowerCase(),
  title: track.title,
  trackNumber: track.track_no,
  knowledge: { notes: [], anecdotes: [], lessons: [], researchReferences: [] },
  attachments: { cardLinks: [] },
  media: [],
}));
const connections = buildEchoTarotSongConnections(edition, songs);
const cards = compactEchoTarotEditionCards(edition);

test("every supplied Tarot Card + Song combination receives three review-only cast prompts", () => {
  const promptSets = songs.flatMap((song) => buildEchoTarotImagePromptSets({
    song,
    connections: connections.filter((connection) => connection.songId === song.id),
    availableCards: cards,
    edition,
  }));

  assert.equal(promptSets.length, 167);
  assert.equal(promptSets.flatMap((set) => set.variants).length, 501);
  assert.ok(promptSets.every((set) => set.schemaVersion === ECHO_TAROT_IMAGE_PROMPTS_SCHEMA));
  assert.ok(promptSets.every((set) => set.reviewStatus === "draft-for-human-review" && set.generationStatus === "not-started" && set.canGenerate === false));
  assert.ok(promptSets.every((set) => set.targetModelId === "gpt-image-2.5-sunburst"));
  assert.ok(promptSets.every((set) => set.outputSettings.size === "1024x1536" && set.outputSettings.quality === "high"));
  assert.ok(promptSets.every((set) => set.variants.map((variant) => variant.key).join(",") === "default-man,default-woman,default-couple"));
  assert.ok(promptSets.every((set) => set.variants.every((variant) => variant.prompt.includes(set.cardTitle) && variant.prompt.includes(set.songTitle))));
  assert.ok(promptSets.every((set) => set.variants.every((variant) => variant.prompt.startsWith("DELIVERABLE\n") && variant.creativeBrief.reviewChecklist.length === 5)));
  assert.ok(promptSets.every((set) => set.variants.every((variant) => variant.prompt.length < 4800)));
});

test("a prompt preserves inherited meaning, the song argument, lyric symbols, card grammar, and replaceable Hapa cast slots", () => {
  const song = songs.find((item) => item.trackNumber === 33);
  const [promptSet] = buildEchoTarotImagePromptSets({
    song: {
      ...song,
      knowledge: {
        notes: [{ body: "Keep the learner visibly uncertain." }],
        anecdotes: [],
        lessons: [{ body: "Beginning is a practice.", futureUse: "Future training stories." }],
        researchReferences: [{ label: "Threshold study", notes: "Compare reversible crossings." }],
      },
      media: [{ role: "creative-visual-anchor", creativeAnchor: { toneNotes: "Quiet dawn, spacious sky, worn travel gear." } }],
    },
    connections: connections.filter((connection) => connection.songId === song.id && connection.cardTitle === "The Fool"),
    availableCards: cards,
    edition,
  });
  const prompts = Object.fromEntries(promptSet.variants.map((variant) => [variant.key, variant.prompt]));

  assert.match(prompts["default-man"], /Dominant upright meaning: beginning, innocence, possibility, trust, freedom, adventure/);
  assert.match(prompts["default-man"], /The Fool reframed through “Backwards Cap”: The traveler leaves with a companion/);
  assert.match(prompts["default-man"], /“just a trainee”/);
  assert.match(prompts["default-man"], /Essential symbols; show all clearly: cliff or threshold/);
  assert.match(prompts["default-man"], /Hapa Main Man as the only principal adult human figure/);
  assert.doesNotMatch(prompts["default-man"], /Hapa Main Woman/);
  assert.match(prompts["default-woman"], /Hapa Main Woman as the only principal adult human figure/);
  assert.doesNotMatch(prompts["default-woman"], /Hapa Main Man/);
  assert.match(prompts["default-couple"], /Hapa Main Man and Hapa Main Woman as the two principal adult figures/);
  assert.match(prompts["default-couple"], /Quiet dawn, spacious sky, worn travel gear/);
  assert.doesNotMatch(prompts["default-couple"], /Print.*Backwards Cap/);
  assert.equal(promptSet.variants[0].creativeBrief.song.sourceContext.notes[0], "Keep the learner visibly uncertain.");
  assert.match(promptSet.variants[0].creativeBrief.song.sourceContext.references[0], /Threshold study/);
});

test("source casting is retained as provenance but replaced by the selected variable inside visual direction", () => {
  const song = songs.find((item) => item.trackNumber === 33);
  const [pagePromptSet] = buildEchoTarotImagePromptSets({
    song,
    connections: connections.filter((connection) => connection.songId === song.id && connection.cardTitle === "Page of Wands"),
    availableCards: cards,
    edition,
  });

  assert.match(pagePromptSet.variants[0].prompt, /Hapa Main Man studies a single budding wand/);
  assert.doesNotMatch(pagePromptSet.variants[0].prompt, /Rosie/);
  assert.match(pagePromptSet.variants[1].prompt, /Hapa Main Woman studies a single budding wand/);
  assert.match(pagePromptSet.variants[2].prompt, /the couple studies a single budding wand/);
  assert.doesNotMatch(pagePromptSet.variants[2].prompt, /Hapa Main Man and Hapa Main Woman studies/);
  assert.equal(pagePromptSet.variants[1].creativeBrief.output.printedText.top, "");
  assert.match(pagePromptSet.variants[1].prompt, /Leave the top free of invented numbering, rank labels, or duplicate title text/);
  assert.doesNotMatch(pagePromptSet.variants[1].prompt, /At the top, print the exact rank\/number “Page”/);
  assert.equal(pagePromptSet.provenance.sourceCasting, "Rosie");
});

test("human-added Tarot links receive prompts and merge into an existing supplied card/song combination without duplication", () => {
  const song = songs.find((item) => item.trackNumber === 33);
  const fool = cards.find((card) => card.title === "The Fool");
  const customCard = {
    id: "custom-card",
    title: "The Listening Gate",
    arcana: "custom",
    suit: "Cups",
    number: "GATE",
    meaning: "Listen before crossing.",
    reversedMeaning: "Noise mistaken for consent.",
    promptNotes: "A listening cup before a luminous threshold.",
    originalMeaning: { upright: "Listen before crossing.", shadow: "Noise mistaken for consent.", essentialSymbols: "cup, threshold" },
    source: { resourcePath: "data/tarot-store.json" },
  };
  const enrichedSong = {
    ...song,
    attachments: {
      cardLinks: [
        { cardId: fool.id, cardTitle: fool.title, role: "tarot-song-correspondence", reason: "Human confirms the learner reading." },
        { cardId: customCard.id, cardTitle: customCard.title, role: "tarot-song-correspondence", reason: "The song pauses at a consent threshold." },
      ],
    },
  };
  const promptSets = buildEchoTarotImagePromptSets({
    song: enrichedSong,
    connections: connections.filter((connection) => connection.songId === song.id && connection.cardTitle === "The Fool"),
    availableCards: [...cards, customCard],
    edition,
  });

  assert.equal(promptSets.length, 2);
  assert.equal(promptSets.find((set) => set.cardId === fool.id).origin, "supplied-editorial+human-authored");
  assert.equal(promptSets.find((set) => set.cardId === fool.id).variants[0].creativeBrief.song.humanLogic[0], "Human confirms the learner reading.");
  assert.equal(promptSets.find((set) => set.cardId === customCard.id).origin, "human-authored");
  assert.match(promptSets.find((set) => set.cardId === customCard.id).variants[0].prompt, /Listen before crossing/);
});

test("generation text prioritizes visible direction while the structured brief retains review provenance", () => {
  const song = songs.find((item) => item.trackNumber === 33);
  const [promptSet] = buildEchoTarotImagePromptSets({
    song,
    connections: connections.filter((connection) => connection.songId === song.id && connection.cardTitle === "The Fool"),
    availableCards: cards,
    edition,
  });
  const variant = promptSet.variants[0];

  assert.deepEqual(Object.keys(variant.creativeBrief.cast.variables), ["hapa-main-man"]);
  assert.ok(variant.creativeBrief.visualThesis.startsWith("The Fool reframed through “Backwards Cap”"));
  assert.ok(variant.creativeBrief.tarot.essentialSymbols);
  assert.ok(variant.creativeBrief.tarot.optionalSymbols);
  assert.ok(variant.creativeBrief.song.pairingLogic);
  assert.ok(Array.isArray(variant.creativeBrief.song.sourceContext.references));
  assert.match(variant.prompt, /VISUAL THESIS[\s\S]+SUBJECT AND SCENE[\s\S]+TAROT FIDELITY[\s\S]+SONG SIGNAL[\s\S]+ART DIRECTION[\s\S]+TEXT AND CONSTRAINTS/);
  assert.doesNotMatch(variant.prompt, /GPT Image 2\.5/);
});
