import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Human Enricher quick sort exposes dense hover-preview tiles and durable first-pass decisions", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /params\.set\("limit", "240"\)/);
  assert.match(source, /params\.set\("review", "all"\)/);
  assert.match(source, /> Quick Sort</);
  assert.match(source, /aria-label="Quick-sort video tiles"/);
  assert.match(source, /onMouseEnter=\{startPreview\}/);
  assert.match(source, /onMouseLeave=\{stopPreview\}/);
  assert.match(source, /muted\s+loop\s+playsInline\s+preload="none"/);
  assert.match(source, /action === "accepted"/);
  assert.match(source, /onDecide\(video, "rejected"\)/);
  assert.match(source, /onDecide\(video, "accepted"\)/);
  assert.match(source, /video\.agentReview\?\.status === "blocked"/);
  assert.match(source, /\/api\/human-enricher\/quick-sort\/decisions/);
  assert.match(source, /decidingKeysRef\.current\.has\(video\.humanVideoKey\)/);
  assert.match(source, /const optimisticDecision/);
  assert.match(source, /revertQuickDecisionSummary/);
  assert.match(source, /aria-label="Quick Sort telemetry"/);
  assert.match(source, /summary\?\.quickSortKnown/);
  assert.match(source, /summary\?\.quickSortAccepted/);
  assert.match(source, /summary\?\.quickSortRejected/);
  assert.match(source, /summary\?\.remainingOpticalReviews/);
  assert.match(source, /Optical review is tracked separately/);
  assert.doesNotMatch(source, /quickSortVideos\.filter\(\(video\) => \["accepted", "accepted-edited"\]/);
  assert.match(source, /data-state=\{accepted \? "accepted" : rejected \? "rejected" : "pending"\}/);
  assert.match(source, /aria-pressed=\{accepted\}/);
  assert.match(css, /\.human-video-tile-grid \{[^}]*repeat\(auto-fill, minmax\(220px, 1fr\)\)/);
  assert.match(css, /\.human-video-tile\[data-state="accepted"\]/);
  assert.match(css, /\.human-quick-sort-counts \[data-state="rejected"\] strong/);
  assert.match(css, /button\[data-action="reject"\]/);
  assert.match(css, /button\[data-action="accept"\]/);
});
