import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { compareLyricParityPngs } from "../server/lyric-render-parity.mjs";

function fixture(filePath, mutation = 0) {
  const png = new PNG({ width: 120, height: 60 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const lyric = y >= 30 && y < 50 && x >= 15 && x < 105;
      const glyph = lyric && ((x + y) % 7 < 3);
      png.data[offset] = glyph ? 230 - mutation : 12;
      png.data[offset + 1] = glyph ? 250 - mutation : 18;
      png.data[offset + 2] = glyph ? 255 - mutation : 28;
      png.data[offset + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

test("encoded lyric parity compares the actual protected caption pixels", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-lyric-parity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preview = path.join(root, "preview.png");
  const encoded = path.join(root, "encoded.png");
  fixture(preview);
  fixture(encoded, 8);
  const report = compareLyricParityPngs(preview, encoded, { left: 15, top: 30, right: 105, bottom: 50 });
  assert.equal(report.ok, true);
  assert.ok(report.meanAbsoluteDelta > 0);
  assert.ok(report.encodedLumaRange >= 8);
});

test("encoded lyric parity rejects a flat or unrelated caption region", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-lyric-parity-fail-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const preview = path.join(root, "preview.png");
  const encoded = path.join(root, "encoded.png");
  fixture(preview);
  const flat = new PNG({ width: 120, height: 60 });
  flat.data.fill(0);
  for (let index = 3; index < flat.data.length; index += 4) flat.data[index] = 255;
  fs.writeFileSync(encoded, PNG.sync.write(flat));
  assert.equal(compareLyricParityPngs(preview, encoded, { left: 15, top: 30, right: 105, bottom: 50 }).ok, false);
});
