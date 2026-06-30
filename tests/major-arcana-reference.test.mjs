import test from "node:test";
import assert from "node:assert/strict";
import {
  MAJOR_ARCANA_COLOR_REFERENCE,
  MAJOR_ARCANA_COLOR_REFERENCE_VERSION,
  MAJOR_ARCANA_REFERENCES,
  cardReferencePatch
} from "../src/domain/majorArcanaReference.js";

test("major arcana color reference preserves the sampled Colorist table", () => {
  assert.equal(MAJOR_ARCANA_COLOR_REFERENCE_VERSION, "hapa.major-arcana-color-reference.v1");
  assert.equal(MAJOR_ARCANA_COLOR_REFERENCE.length, 24);
  assert.equal(MAJOR_ARCANA_REFERENCES.length, 22);

  const fool = MAJOR_ARCANA_COLOR_REFERENCE[0];
  assert.equal(fool.no, "0");
  assert.equal(fool.hex, "#90BF8D");
  assert.deepEqual(fool.rgb, [144, 191, 141]);
  assert.equal(fool.color, "Green");
  assert.equal(fool.riderWaite, "The Fool");
  assert.equal(fool.decimal, 0);

  const world = MAJOR_ARCANA_COLOR_REFERENCE[21];
  assert.equal(world.no, "XXI");
  assert.equal(world.hex, "#5891A6");
  assert.deepEqual(world.rgb, [88, 145, 166]);
  assert.equal(world.riderWaite, "The World");

  const turquoise = MAJOR_ARCANA_COLOR_REFERENCE[22];
  assert.equal(turquoise.no, "XXII");
  assert.equal(turquoise.hex, "#72A299");
  assert.equal(turquoise.riderWaite, "");
  assert.equal(turquoise.arcana, null);

  const bluishGreen = MAJOR_ARCANA_COLOR_REFERENCE[23];
  assert.equal(bluishGreen.no, "XXIII");
  assert.equal(bluishGreen.hex, "#8DB995");
  assert.equal(bluishGreen.arcana, null);
});

test("card reference patch seeds selected tarot card fields", () => {
  const chariot = MAJOR_ARCANA_REFERENCES.find((entry) => entry.riderWaite === "The Chariot");
  const patch = cardReferencePatch(chariot);

  assert.equal(patch.title, "The Chariot");
  assert.equal(patch.number, "VII");
  assert.equal(patch.arcana, "major");
  assert.equal(patch.keywords.includes("Momentum"), true);
  assert.match(patch.meaning, /disciplined motion/i);
  assert.match(patch.reversedMeaning, /scattered force/i);
  assert.match(patch.promptNotes, /Orange Red \/ #DE7B72 \/ RGB\(222, 123, 114\)/);
  assert.match(patch.promptNotes, /navigation system/i);
});

test("card reference patch ignores non-tarot color rows", () => {
  const turquoise = MAJOR_ARCANA_COLOR_REFERENCE.find((entry) => entry.color === "Turquoise");
  assert.equal(cardReferencePatch(turquoise), null);
});
