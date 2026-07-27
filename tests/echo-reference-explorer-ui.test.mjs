import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const componentUrl = new URL("../src/components/EchoReferenceExplorer.jsx", import.meta.url);
const hostUrl = new URL("../src/components/HapaEchosView.jsx", import.meta.url);
const cssUrl = new URL("../src/index.css", import.meta.url);
const runbookUrl = new URL("../docs/echo-reference-mining-runbook.md", import.meta.url);

test("Echos exposes the complete-album Reference Atlas as a first-class workspace", async () => {
  const [component, host] = await Promise.all([
    fs.readFile(componentUrl, "utf8"),
    fs.readFile(hostUrl, "utf8"),
  ]);
  assert.match(host, /Reference Atlas/);
  assert.match(host, /<EchoReferenceExplorer/);
  assert.match(component, /Mine all songs locally/);
  assert.match(component, /Every one of \{summary\?\.album\?\.songCount/);
  assert.match(component, /every other song/i);
});

test("reference visual shell includes playback cues, cards, graph, atlas, lenses, evidence, compare, and deep links", async () => {
  const component = await fs.readFile(componentUrl, "utf8");
  assert.doesNotMatch(component, /^\s*Map,\s*$/m, "the lucide Map icon must not shadow JavaScript's Map constructor");
  assert.match(component, /Map as MapIcon/);
  for (const signal of [
    "Lyric reference timeline",
    "Hapa Reference Cards",
    "Relational mind map",
    "Album atlas",
    "Semantic reference lenses",
    "Evidence & provenance",
    "Competing interpretations",
    "Unresolved high-leverage nodes",
    "Add clue and request scoped rerun",
    "referenceSong",
    "referenceCard",
    "referenceLens",
    "referenceMode",
  ]) {
    assert.match(component, new RegExp(signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(component, /presentationMedia/);
  assert.match(component, /animated Reference Card/);
  assert.match(component, /research updates/);
  assert.match(component, /image \+ loop pairs/);
  assert.match(component, /setInterval\(async \(\) =>/);
});

test("Add and Challenge remain append-only local review actions with visible authority wording", async () => {
  const component = await fs.readFile(componentUrl, "utf8");
  assert.match(component, /Add another possible reference/);
  assert.match(component, /Challenge \/ counterinterpret/);
  assert.match(component, /does not edit an approved card, publish data, or establish canon/);
  assert.match(component, /visibility: "shared"/);
  assert.match(component, /\/api\/echos\/references\/contributions/);
});

test("reference UI provides non-color status labels, keyboard navigation, phone layout, and reduced motion", async () => {
  const [component, css] = await Promise.all([
    fs.readFile(componentUrl, "utf8"),
    fs.readFile(cssUrl, "utf8"),
  ]);
  assert.match(component, /approved/);
  assert.match(component, /reviewable/);
  assert.match(component, /challenged/);
  assert.match(component, /Keyboard: \[ previous card/);
  assert.match(component, /echo-ref-map-screenreader/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("review mode exposes keyboard-first reasoned actions without public or canon controls", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Human review workbench/);
  assert.match(source, /Required reason/);
  assert.match(source, /A · Approve/);
  assert.match(source, /X · Reject/);
  assert.match(source, /W · Reweight/);
  assert.match(source, /D · Defer/);
  assert.match(source, /Q · More research/);
  assert.match(source, /Bulk plans still run these checks per card/);
  assert.match(source, /\/api\/echos\/references\/review/);
  assert.doesNotMatch(source, />Canonize</);
  assert.doesNotMatch(source, />Publish</);
});

test("Echos mining entrypoint, clue expansion, and audit view expose scope while keeping Human authority separate", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Mine selected song/);
  assert.match(source, /Mine all songs locally/);
  assert.match(source, /local work units · \$0 paid/);
  assert.match(source, /No candidate was auto-approved/);
  assert.match(source, /Add a Human hint/);
  assert.match(source, /This is a hint, not evidence or canon/);
  assert.match(source, /Preview scope\/cost/);
  assert.match(source, /post-run created\/removed\/reweighted\/merged\/invalidated diff/);
  assert.match(source, /Mining operations & audit/);
  assert.match(source, /private clue and restricted evidence content are excluded/);
});

test("playback rail defaults safe, exposes candidate mode, supports jumps, and composer covers proposal types and duplicate routing", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /showCandidates \|\| card\.authority\?\.reviewStatus === "approved"/);
  assert.match(source, /Show all previews/);
  assert.match(source, /Focus approved only/);
  assert.match(source, /Jump to related song moment/);
  assert.match(source, /onSeek\(occurrence\.lyricSpan\.startSeconds\)/);
  assert.match(source, /New Reference Card/);
  assert.match(source, /Cross-song relationship/);
  assert.match(source, /Alias \/ translation/);
  assert.match(source, /Source evidence/);
  assert.match(source, /Alternative interpretation/);
  assert.match(source, /Lyric line start/);
  assert.match(source, /Possible duplicate routed to existing card/);
  assert.match(source, /setMode\("compare"\)/);
});

test("preview-first policy makes text and media inspectable before approval while keeping authority separate", async () => {
  const [source, css] = await Promise.all([
    fs.readFile(componentUrl, "utf8"),
    fs.readFile(cssUrl, "utf8"),
  ]);
  assert.match(source, /Preview first/);
  assert.match(source, /Every proposed connection and visual is visible before approval/);
  assert.match(source, /Approval controls trusted Atlas\/Tarot\/Director use—not whether the proposal can be seen/);
  assert.match(source, /preview visible before approval/);
  assert.match(source, /Preview visibility never implies canon or publication/);
  assert.match(source, /Visual Reference Cards/);
  assert.match(source, /Images and animated loops stay visible while you inspect their meaning and connections/);
  assert.match(source, /summary\?\.mediaGallery/);
  assert.match(source, /setSelectedSongId\(songId\)/);
  assert.match(css, /\.echo-ref-preview-policy/);
  assert.match(css, /\.echo-ref-media-gallery/);
});

test("operator runbook replaces the former pilot with all-song procedure and documents recovery and safe extension", async () => {
  const runbook = await fs.readFile(runbookUrl, "utf8");
  assert.match(runbook, /former 25-song pilot is retired/i);
  assert.match(runbook, /one-song run means/i);
  assert.match(runbook, /Run the complete album/);
  assert.match(runbook, /Queue, pause, resume, and retry/);
  assert.match(runbook, /Status vocabulary/);
  assert.match(runbook, /public.*canon.*separate Human-authority/is);
  assert.match(runbook, /Missing lyrics/);
  assert.match(runbook, /Missing timings/);
  assert.match(runbook, /Blocked\/stale citation/);
  assert.match(runbook, /When adding a detector/);
  assert.match(runbook, /When adding a source adapter/);
  assert.match(runbook, /Recovery drill/);
});

test("mind map supports deterministic bounded navigation, persisted filters, focus mode, current-song state, and edge explanations", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Edge relation/);
  assert.match(source, /Evidence class/);
  assert.match(source, /Review status/);
  assert.match(source, /Contextual layer/);
  assert.match(source, /Confidence ≥/);
  assert.match(source, /Focus neighborhood/);
  assert.match(source, /Show album topology/);
  assert.match(source, /echo-reference-map-view\.v1/);
  assert.match(source, /data-current-song/);
  assert.match(source, /approved-safe projection/);
  assert.match(source, /Inspect \$\{edge\.relationType\} connection/);
  assert.match(source, /\.slice\(0, 44\)/);
  assert.match(source, /\.slice\(0, 96\)/);
  assert.match(source, /graphLayout\(nodes\)/);
});

test("timeline exposes density, deterministic overlap groups, status symbols, seek/focus, and reduced-precision fallback", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /groupEchoReferenceTimeline/);
  assert.match(source, /Reference density heatmap/);
  assert.match(source, /grouped reference/);
  assert.match(source, /Expanded overlapping references/);
  assert.match(source, /onFocusCard\(cue\.cardId\)/);
  assert.match(source, /onSeek\(cue\.startSeconds\)/);
  assert.match(source, /unresolved song leads/);
  assert.match(source, /section-based fallback \(reduced precision\)/);
  assert.match(source, /✓ approved/);
  assert.match(source, /◌ reviewable/);
  assert.match(source, /! challenged/);
  assert.match(source, /\? unresolved/);
});

test("cross-song story paths expose authority, relation explanations, every occurrence, and playback handoff continuity", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Story path/);
  assert.match(source, /Authored path/);
  assert.match(source, /Approved interpretive path/);
  assert.match(source, /Automatically suggested path/);
  assert.match(source, /contrasting local context|signal changes through contrast/);
  assert.match(source, /card\.occurrences \|\| \[\]/);
  assert.match(source, /Play next linked moment/);
  assert.match(source, /Playback handoff preserves the focused card and graph trail/);
});

test("semantic lenses can combine, remain deep-link stable, show a legend, and explain hidden results", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /deepLinkRef\.current\.lens\.split\(","\)/);
  assert.match(source, /secondaryLenses/);
  assert.match(source, /event\.shiftKey \|\| event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /\[lens, \.\.\.secondaryLenses\]\.join\(","\)/);
  assert.match(source, /Shift-click compatible lenses to combine/);
  assert.match(source, /cards hidden by the current lens or search/);
});

test("album atlas supports song-family and song-pair views, useful sorting, supporting cards, and explicit incomplete gaps", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Song × family/);
  assert.match(source, /Song × song/);
  assert.match(source, /Atlas sort/);
  assert.match(source, /Confidence/);
  assert.match(source, /Unresolved leverage/);
  assert.match(source, /Reference family/);
  assert.match(source, /supporting cards/);
  assert.match(source, /gaps mean incomplete evidence, not absent meaning/);
});

test("graph navigation supplies rich search, relation breadcrumbs, zoom, minimap, history, and playback return", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Search cards, lyrics, motifs, mechanics/);
  assert.match(source, /\/api\/echos\/references\/search/);
  assert.match(source, /Graph traversal breadcrumbs/);
  assert.match(source, /\$\{hop\.relationType\} →/);
  assert.match(source, /Zoom out/);
  assert.match(source, /Zoom in/);
  assert.match(source, /Graph minimap orientation/);
  assert.match(source, />Back</);
  assert.match(source, />Forward</);
  assert.match(source, /Return to playback/);
});

test("interpretation compare canvas keeps paths side by side and marks historical readings without declaring a winner", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /No forced winner/);
  assert.match(source, /Evidence:.*claims/);
  assert.match(source, /Lyric scope:/);
  assert.match(source, /Mechanics:/);
  assert.match(source, /Emotions:/);
  assert.match(source, /Historical — not current guidance/);
  assert.match(source, /Follow this reading’s path/);
});

test("accessibility styles preserve mobile controls, reduced motion, and forced-color focus/status distinctions", async () => {
  const [component, css] = await Promise.all([
    fs.readFile(componentUrl, "utf8"),
    fs.readFile(cssUrl, "utf8"),
  ]);
  assert.match(component, /role="button"/);
  assert.match(component, /onKeyDown/);
  assert.match(component, /echo-ref-map-screenreader/);
  assert.match(component, /confidence is numeric/);
  assert.match(css, /\.echo-ref-story-path li/);
  assert.match(css, /\.echo-ref-map-breadcrumbs/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /stroke-dasharray: 6 3/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("challenge composer distinguishes dispute types and records coexisting counterinterpretations without direct mutation", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Challenge type/);
  for (const label of [
    "Factual correction",
    "Missing evidence",
    "Alternate reading / counterinterpretation",
    "Confidence dispute",
    "Lyric or context scope dispute",
    "Privacy / rights concern",
    "Abuse report",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /Disputed fields/);
  assert.match(source, /counterinterpretation:/);
  assert.match(source, /does not edit an approved card, publish data, or establish canon/);
});

test("contribution evidence UI exposes private reviewer-only projection and never offers verified or public status", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Evidence visibility/);
  assert.match(source, /Shared with invited reviewers/);
  assert.match(source, /Private to author\/reviewer/);
  assert.match(source, /sourceClass: "user-supplied"/);
  assert.match(source, /visibility: composer\.citationVisibility/);
  assert.doesNotMatch(source, /<option value="verified">/);
  assert.doesNotMatch(source, /<option value="public">/);
});

test("activity view exposes all statuses, exact revision/decision links, affected moments/paths, and explicit private opt-in follows", async () => {
  const source = await fs.readFile(componentUrl, "utf8");
  assert.match(source, /Activity & change status/);
  assert.match(source, /submitted · validation-needed · review-ready · under-review · challenged · resolved · rejected/);
  assert.match(source, /superseded · withdrawn · appealed/);
  assert.match(source, /Contributor, moderator, report, and private evidence details stay hidden/);
  assert.match(source, /Open exact revision or decision/);
  assert.match(source, /Opt in: follow this song/);
  assert.match(source, /Opt in: follow this card/);
  assert.match(source, /limited to five per hour/);
});
