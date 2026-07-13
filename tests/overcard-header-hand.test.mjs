import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Shared Hand is an in-flow persistent Header region with compact responsive fallbacks", async () => {
  const [main, app, hand, css] = await Promise.all([
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/BuilderHeaderHand.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(main, /<OvercardHand/);
  assert.match(app, /<header className="topbar[\s\S]*<BuilderHeaderHand[\s\S]*<div className="telemetry">/);
  assert.match(hand, /defaultPresentationMode="docked-minified"/);
  assert.match(hand, /dockTarget=\{dockTarget\}/);
  assert.match(hand, /onOpenLibrary=\{onOpenLibrary\}/);
  assert.match(hand, /<OvercardConnectionStatus adapter=\{adapter\} onEnsureHost=\{ensureHost\}/);
  assert.match(hand, /hapaOvercard\?\.reconnect/);
  assert.match(css, /grid-template-columns:\s*minmax\(210px,[\s\S]*minmax\(260px, 390px\)[\s\S]*minmax\(0, 2\.5fr\)/);
  assert.match(css, /\.builder-header-hand[\s\S]*position:\s*relative/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.telemetry[\s\S]*display:\s*none/);
  assert.doesNotMatch(css.match(/\.builder-header-hand\s*\{[\s\S]*?\}/)?.[0] || "", /position:\s*fixed/);
});
