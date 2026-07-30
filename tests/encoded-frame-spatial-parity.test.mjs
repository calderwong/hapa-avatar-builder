import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PNG } from "pngjs";
import { compareEncodedFrameSpatialParity } from "../server/encoded-frame-spatial-parity.mjs";

function fixture(filePath, { collapsed = false } = {}) {
  const png = new PNG({ width: 320, height: 180 });
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const visible = !collapsed || (x < 134 && y < 100);
      png.data[offset] = visible ? 30 + (x * 7 + y * 3) % 190 : 0;
      png.data[offset + 1] = visible ? 20 + (x * 3 + y * 11) % 210 : 0;
      png.data[offset + 2] = visible ? 40 + (x * 13 + y * 5) % 180 : 0;
      png.data[offset + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

test("encoded spatial parity accepts a full-frame encoded image", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-spatial-pass-"));
  const previewPath = path.join(directory, "preview.png");
  const encodedPath = path.join(directory, "encoded.png");
  fixture(previewPath);
  fixture(encodedPath);
  const result = compareEncodedFrameSpatialParity(previewPath, encodedPath);
  assert.equal(result.ok, true);
  assert.equal(result.rightHalfRetention, 1);
  assert.equal(result.bottomHalfRetention, 1);
});

test("encoded spatial parity rejects the 800x600-in-1920x1080 collapse pattern", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-spatial-fail-"));
  const previewPath = path.join(directory, "preview.png");
  const encodedPath = path.join(directory, "encoded.png");
  fixture(previewPath);
  fixture(encodedPath, { collapsed: true });
  const result = compareEncodedFrameSpatialParity(previewPath, encodedPath);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "encoded-frame-lost-preview-regions");
  assert.ok(result.rightHalfRetention < .6);
  assert.ok(result.bottomHalfRetention < .6);
});
