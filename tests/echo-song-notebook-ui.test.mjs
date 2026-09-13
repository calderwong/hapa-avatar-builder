import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [explorer, notebook, promptReview, server] = await Promise.all([
  readFile(new URL("../src/components/EchoReferenceExplorer.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EchoSongNotebook.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EchoTarotImagePromptReview.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
]);

test("References embeds the durable song notebook", () => {
  assert.match(explorer, /<EchoSongNotebook/);
  assert.match(notebook, /Notes, anecdotes & lessons/);
  assert.match(notebook, /Mark for future research/);
  assert.match(notebook, /Characters from the Hapa avatar pool/);
  assert.match(notebook, /Creative \/ visual anchors/);
  assert.match(notebook, /Tarot ↔ song logic/);
  assert.match(notebook, /Add card with logic/);
  assert.match(notebook, /GPT Image 2\.5 prompt review/);
  assert.match(notebook, /tarotImagePrompts/);
  assert.match(promptReview, /Default man|default-man/);
  assert.match(promptReview, /No generation request is sent from this panel/);
  assert.match(promptReview, /Copy .* prompt/);
});

test("the agent-readable notebook endpoint exposes the entire album or one selected song", () => {
  assert.match(server, /pathname === "\/api\/echos\/song-notebook"/);
  assert.match(server, /hapa\.echo-song-notebook-album\.v1/);
  assert.match(server, /tarotConnections/);
  assert.match(server, /tarotImagePrompts/);
  assert.match(server, /buildEchoTarotImagePromptSets/);
  assert.match(server, /creativeAnchors/);
  assert.match(server, /resources\/echo-album\/hapa-tarot-echoes-v1\.json/);
});
