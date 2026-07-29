#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const BOARD_PATH = "/Users/calderwong/Desktop/Echos-of-Other-Eras-Album-App/kanban.json";
const OVERWATCH_EVENTS_PATH = "/Users/calderwong/Documents/Codex/2026-05-27/can-you-generate-me-some-concept/hapa-overwatch-kanban/data/hapa-echo-music-video-direction/events.ndjson";
const REVIEW_PASS = "lyrics-deep-focus-2026-07-29";
const PROJECT_ID = "hapa-echo-music-video-direction";
const CREATED_AT = "2026-07-29T20:30:00.000Z";
const SOURCE = "echo-lyric-timing-template-drain-2026-07-29";
const PROGRAM_DOC = "/Users/calderwong/Desktop/hapa-avatar-builder/docs/ECHO_LYRIC_TIMING_AND_TEMPLATE_DRAIN.md";
const ANIME_DOCS = "https://animejs.com/documentation/animation/";

const tasks = [
  {
    lane: "lane-planning",
    id: "task-lyrics-v4-01-live-157-baseline-and-recent-song-triage",
    title: "P0 lyrics 1/18: Baseline all 157 live Director projects",
    owner: "Audio Intelligence + QA",
    priority: "P0",
    body: "Replace the older 79-song completion assumption with a live 157-project lyric inventory, identify every recently added song, and rank text/timing failures by source truth, audio identity, confidence, and visible drift.",
    acceptance: [
      "The report covers exactly every live Director project and separately identifies projects added after the 79-song audit.",
      "Each row records audio hash/duration, lyric text and timing hashes, stem availability, provenance, confidence, overlap/bounds errors, template, enabled state, and latest mint state.",
      "No project is labeled correct from field presence or compiler success alone; recent songs form the first drain queue."
    ],
    dependencies: [],
    targets: ["hapa-avatar-builder", "hapa-song-registry", "hapa-music-viz"],
    tags: ["lyrics", "baseline", "157-projects", "recent-songs", "truth"]
  },
  {
    lane: "lane-planning",
    id: "task-lyrics-v4-02-canonical-text-reconciliation",
    title: "P0 lyrics 2/18: Reconcile wrong lyric text before alignment",
    owner: "Song Registry + Audio Intelligence",
    priority: "P0",
    body: "Compare active Director lyrics against the strongest registry/Suno/source text, normalize only punctuation and structural metadata safely, and queue substantive wording disagreements for source-backed repair.",
    acceptance: [
      "Every lyric-bearing project has a canonical text hash and line/word count tied to a named source.",
      "Wrong, repeated, missing, hallucinated, or metadata-as-lyric text is repaired without overwriting historical source payloads.",
      "Substantive ambiguity remains review-required and is never silently promoted."
    ],
    dependencies: ["task-lyrics-v4-01-live-157-baseline-and-recent-song-triage"],
    targets: ["hapa-avatar-builder", "hapa-song-registry"],
    tags: ["lyrics", "text-truth", "registry", "provenance"]
  },
  {
    lane: "lane-planning",
    id: "task-lyrics-v4-03-renderer-neutral-lyric-contract",
    title: "P0 lyrics 3/18: Freeze one renderer-neutral lyric contract",
    owner: "Director Systems",
    priority: "P0",
    body: "Define enabled state, template identity, canonical line/word timing, timing/audio hashes, placement, safe-area, reduced-motion, and operator corrections once for Preview, HyperFrames export, and Song Card mint.",
    acceptance: [
      "Turning lyrics off preserves template and timing configuration while omitting the burned-in overlay.",
      "All material lyric fields participate in Director variant and mint semantic fingerprints.",
      "Preview and exporters consume the same normalized contract instead of rebuilding lyric state independently."
    ],
    dependencies: ["task-lyrics-v4-01-live-157-baseline-and-recent-song-triage"],
    targets: ["hapa-avatar-builder", "HyperFrames", "hapa-music-viz"],
    tags: ["lyrics", "contract", "preview-export-parity", "mint"]
  },
  {
    lane: "lane-music-enrich",
    id: "task-lyrics-v4-04-audio-identity-and-vocal-source-gate",
    title: "P0 lyrics 4/18: Verify audio identity and alignment source",
    owner: "Audio Intelligence",
    priority: "P0",
    body: "Bind every timing job to the exact Director audio hash and duration, prefer a verified lead-vocal stem, and use a clearly labeled verified master-mix fallback when the vocal stem is absent.",
    acceptance: [
      "Stale timings cannot attach to a different audio revision with a similar title.",
      "Vocal-stem, master-fallback, and unusable source states are explicit and hash-linked.",
      "Duration or content mismatch fails before transcription/alignment starts."
    ],
    dependencies: ["task-lyrics-v4-01-live-157-baseline-and-recent-song-triage"],
    targets: ["hapa-avatar-builder", "hapa-song-registry", "hapa-music-viz"],
    tags: ["audio-hash", "lead-vocals", "alignment", "fallback"]
  },
  {
    lane: "lane-music-enrich",
    id: "task-lyrics-v4-05-word-level-forced-alignment-pipeline",
    title: "P0 lyrics 5/18: Build repeatable word-level forced alignment",
    owner: "Audio Intelligence",
    priority: "P0",
    body: "Align reconciled canonical lyric text to the verified vocal source, producing source-hash-linked line and word intervals, confidence, alternates, and resumable receipts rather than substituting unconstrained transcription.",
    acceptance: [
      "Every aligned word has finite start/end inside its line and song duration.",
      "The pipeline is restart-safe, content-addressed, and deterministic for identical inputs.",
      "Low-confidence or unaligned spans stay review-required with audio ranges and candidate words."
    ],
    dependencies: ["task-lyrics-v4-02-canonical-text-reconciliation", "task-lyrics-v4-04-audio-identity-and-vocal-source-gate"],
    targets: ["hapa-avatar-builder", "hapa-music-viz"],
    tags: ["forced-alignment", "word-timing", "confidence", "determinism"]
  },
  {
    lane: "lane-music-enrich",
    id: "task-lyrics-v4-06-timing-quality-metrics-and-auto-repair",
    title: "P0 lyrics 6/18: Measure drift and repair safe timing defects",
    owner: "Audio Intelligence + QA",
    priority: "P0",
    body: "Compute onset/offset drift, word coverage, overlaps, gaps, speaking-rate outliers, line bounds, and confidence; automatically repair only bounded structural defects and preserve every change as a correction receipt.",
    acceptance: [
      "Timing quality is numeric and auditable per word, line, song, source kind, and recent-song cohort.",
      "Only safe monotonic/bounds repairs are automatic; semantic or large-drift changes require review.",
      "Before/after timing hashes and changed ranges are retained."
    ],
    dependencies: ["task-lyrics-v4-05-word-level-forced-alignment-pipeline"],
    targets: ["hapa-avatar-builder", "hapa-music-viz"],
    tags: ["timing-drift", "metrics", "repair", "receipts"]
  },
  {
    lane: "lane-music-enrich",
    id: "task-lyrics-v4-07-waveform-review-and-manual-corrections",
    title: "P1 lyrics 7/18: Add waveform review and surgical correction",
    owner: "Director UI",
    priority: "P1",
    body: "Give operators a vocal waveform, audio scrubbing, line/word boundaries, confidence flags, nudge/split/merge controls, global offset preview, undo, and append-only correction history.",
    acceptance: [
      "An operator can hear and correct a flagged word without editing raw JSON.",
      "Corrections survive refresh, variant creation, recompilation, and source upgrades.",
      "Bulk offset never destroys per-word source intervals and supports undo."
    ],
    dependencies: ["task-lyrics-v4-06-timing-quality-metrics-and-auto-repair"],
    targets: ["hapa-avatar-builder"],
    tags: ["waveform", "human-review", "word-editor", "undo"]
  },
  {
    lane: "lane-music-enrich",
    id: "task-lyrics-v4-08-recent-song-first-timing-drain",
    title: "P0 lyrics 8/18: Drain recent-song lyric text and timing failures",
    owner: "Album Operations",
    priority: "P0",
    body: "Run the verified alignment and review workflow across recently added songs first, then continue through the remaining album in worst-confidence/worst-drift order.",
    acceptance: [
      "Every recent song reaches verified or explicit human-review-required state with no silent inferred completion.",
      "Queue progress is resumable and reports text repairs, timing repairs, pending spans, source type, and confidence.",
      "Director projects and variants receive the repaired timing by hash without erasing manual locks."
    ],
    dependencies: ["task-lyrics-v4-06-timing-quality-metrics-and-auto-repair", "task-lyrics-v4-07-waveform-review-and-manual-corrections"],
    targets: ["hapa-avatar-builder", "hapa-song-registry"],
    tags: ["recent-songs", "queue-drain", "lyrics", "album-operations"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-09-per-cut-lyrics-enabled-toggle",
    title: "P0 lyrics 9/18: Add per-cut Lyrics on/off control",
    owner: "Director UI",
    priority: "P0",
    body: "Add an explicit Lyrics switch to each Director cut, default it on for compatibility, preserve the selected template while off, and reflect the state in Preview, variants, scripts, exports, and mint diffs.",
    acceptance: [
      "New and migrated cuts default on; an operator can turn lyrics off and back on without losing configuration.",
      "The timeline and Preview clearly show ON/OFF state.",
      "Disabled lyrics emit no burned-in overlay layer but may retain separate caption artifacts."
    ],
    dependencies: ["task-lyrics-v4-03-renderer-neutral-lyric-contract"],
    targets: ["hapa-avatar-builder"],
    tags: ["lyrics-toggle", "director-cut", "optional-overlay", "ui"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-10-deterministic-template-runtime",
    title: "P0 lyrics 10/18: Build deterministic lyric-template runtime",
    owner: "HyperFrames + Director Systems",
    priority: "P0",
    body: "Create a declarative template API for word poses, phrase windows, entrances, holds, exits, easing, protected regions, and reduced motion; adapt Anime.js splitText/stagger concepts for Preview and compile identical poses into HyperFrames.",
    acceptance: [
      "Templates seek deterministically from the canonical media clock with no runtime audio analysis, randomness, or network fetch.",
      "Anime.js Preview choreography and HyperFrames fixed-time poses match within declared pixel/timing tolerances.",
      "Template code cannot move the active spoken-word highlight outside canonical word intervals."
    ],
    dependencies: ["task-lyrics-v4-03-renderer-neutral-lyric-contract"],
    targets: ["hapa-avatar-builder", "hapa-design-system", "HyperFrames"],
    tags: ["animejs", "hyperframes", "templates", "deterministic-animation"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-11-kinetic-word-burst-template",
    title: "P1 lyrics 11/18: Ship Kinetic Word Burst template",
    owner: "Creative Typography",
    priority: "P1",
    body: "Create a split-word kinetic template with staggered entrances, restrained bounce, active-word scale/weight, section-energy intensity, and a calm reduced-motion projection.",
    acceptance: [
      "The current word remains readable and exact at dense and sparse vocal rates.",
      "Energy changes animation intensity without changing lyric timing.",
      "Preview and HyperFrames render the same fixed-time word poses."
    ],
    dependencies: ["task-lyrics-v4-10-deterministic-template-runtime"],
    targets: ["hapa-avatar-builder", "hapa-design-system", "HyperFrames"],
    tags: ["lyric-template", "kinetic-type", "split-text", "word-burst"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-12-scanline-phrase-ribbon-template",
    title: "P1 lyrics 12/18: Ship Scanline Phrase Ribbon template",
    owner: "Creative Typography",
    priority: "P1",
    body: "Refine the phrase-window foundation into a readable lower-third ribbon with 5–9 word context, exact active-word scan, underline, and source-media-aware contrast.",
    acceptance: [
      "Phrase context reduces visual jitter while exact word highlighting follows canonical intervals.",
      "The template respects title/action/lyric safe areas in 16:9, 9:16, and 1:1.",
      "Reduced-motion mode removes scan/glitch movement without hiding the words."
    ],
    dependencies: ["task-lyrics-v4-10-deterministic-template-runtime"],
    targets: ["hapa-avatar-builder", "hapa-design-system", "HyperFrames"],
    tags: ["lyric-template", "phrase-window", "scanline", "ribbon"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-13-stacked-hook-echo-template",
    title: "P1 lyrics 13/18: Ship Stacked Hook Echo template",
    owner: "Creative Typography",
    priority: "P1",
    body: "Create a hook-focused template that stacks current and recent phrases with bounded echo trails, depth, and decay while keeping the active lyric dominant and readable.",
    acceptance: [
      "Echo copies never masquerade as the currently spoken word.",
      "Trail count, opacity, and decay are bounded for safety and performance.",
      "Hook transitions remain deterministic across seek, pause, Preview, and export."
    ],
    dependencies: ["task-lyrics-v4-10-deterministic-template-runtime"],
    targets: ["hapa-avatar-builder", "hapa-design-system", "HyperFrames"],
    tags: ["lyric-template", "hooks", "echo-stack", "typography"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-14-orbit-caption-template",
    title: "P1 lyrics 14/18: Ship Orbit Caption template",
    owner: "Creative Typography",
    priority: "P1",
    body: "Create an arc/side-rail template that routes words around protected face, character, card, and product regions with bounded motion and a conservative fallback when ROI truth is absent.",
    acceptance: [
      "Verified ROIs influence placement without changing canonical timing.",
      "Unknown ROI uses a readable conservative safe band.",
      "Portrait, landscape, and square exports preserve intended reading order."
    ],
    dependencies: ["task-lyrics-v4-10-deterministic-template-runtime"],
    targets: ["hapa-avatar-builder", "hapa-design-system", "HyperFrames"],
    tags: ["lyric-template", "orbit-caption", "safe-region", "roi"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-lyrics-v4-15-template-picker-and-live-preview",
    title: "P1 lyrics 15/18: Add template picker and timed live preview",
    owner: "Director UI",
    priority: "P1",
    body: "Expose the four templates with thumbnail/loop previews, exact-song timed auditioning, placement/style controls, reduced-motion preview, and saved per-cut selection.",
    acceptance: [
      "Operators can compare templates at the same timestamp without changing the underlying lyric timing.",
      "Selection persists through variants, reload, export, and mint fingerprinting.",
      "Preview truth labels timing source, confidence, and fallback state."
    ],
    dependencies: [
      "task-lyrics-v4-09-per-cut-lyrics-enabled-toggle",
      "task-lyrics-v4-11-kinetic-word-burst-template",
      "task-lyrics-v4-12-scanline-phrase-ribbon-template",
      "task-lyrics-v4-13-stacked-hook-echo-template",
      "task-lyrics-v4-14-orbit-caption-template"
    ],
    targets: ["hapa-avatar-builder"],
    tags: ["template-picker", "preview", "director-ui", "lyrics"]
  },
  {
    lane: "lane-qa",
    id: "task-lyrics-v4-16-preview-export-mint-parity-gate",
    title: "P0 lyrics 16/18: Prove Preview, export, and mint lyric parity",
    owner: "Release Renderer + QA",
    priority: "P0",
    body: "Use one normalized lyric overlay and fixed boundary timestamps to prove that Preview, HyperFrames MP4, and the artifact frozen into a minted Song Card edition share enabled state, text, timing, template, placement, and style.",
    acceptance: [
      "Golden frames cover before/start/middle/end/after states for every template and the disabled case.",
      "Mint preflight rejects mismatched lyric hashes/settings or missing/unexpected burned-in lyric pixels.",
      "The exact verified MP4, not a preview-only canvas, is stored in the immutable edition bundle."
    ],
    dependencies: ["task-lyrics-v4-09-per-cut-lyrics-enabled-toggle", "task-lyrics-v4-15-template-picker-and-live-preview"],
    targets: ["hapa-avatar-builder", "HyperFrames", "hapa-music-viz"],
    tags: ["preview-export-parity", "mint", "golden-frames", "burn-in"]
  },
  {
    lane: "lane-qa",
    id: "task-lyrics-v4-17-legibility-safety-and-performance-gate",
    title: "P1 lyrics 17/18: Gate legibility, safe areas, motion, and performance",
    owner: "QA + Accessibility",
    priority: "P1",
    body: "Test contrast, font bounds, collision/occlusion, reading duration, dense-vocal behavior, safe areas, reduced motion, seek stability, and render cost across templates and output profiles.",
    acceptance: [
      "Known unreadable, clipped, occluded, over-fast, unsafe-motion, and stale-state fixtures fail with timestamped evidence.",
      "All templates pass 16:9, 9:16, and 1:1 representative fixtures.",
      "Lyric animation stays within the declared Preview and offline-render performance budgets."
    ],
    dependencies: [
      "task-lyrics-v4-11-kinetic-word-burst-template",
      "task-lyrics-v4-12-scanline-phrase-ribbon-template",
      "task-lyrics-v4-13-stacked-hook-echo-template",
      "task-lyrics-v4-14-orbit-caption-template"
    ],
    targets: ["hapa-avatar-builder", "HyperFrames"],
    tags: ["accessibility", "safe-area", "reduced-motion", "performance"]
  },
  {
    lane: "lane-qa",
    id: "task-lyrics-v4-18-full-album-drain-and-human-acceptance",
    title: "P0 lyrics 18/18: Drain and verify the full 157-song album",
    owner: "Album Operations + Human Review",
    priority: "P0",
    body: "Run the complete text/timing/template/export pipeline across all live projects, review a recent-song-heavy sample, and close only when every project is verified or carries an explicit bounded human-review blocker.",
    acceptance: [
      "All 157 projects pass text, timing structure, audio identity, provenance, compiler, and enabled/disabled export checks.",
      "A human-reviewed sample emphasizes recent songs, dense lyrics, weak timing, no-stem fallback, all templates, and all output profiles.",
      "The final report names verified, corrected, review-required, and blocked songs; no unresolved item is hidden by an album aggregate."
    ],
    dependencies: [
      "task-lyrics-v4-08-recent-song-first-timing-drain",
      "task-lyrics-v4-16-preview-export-mint-parity-gate",
      "task-lyrics-v4-17-legibility-safety-and-performance-gate"
    ],
    targets: ["hapa-avatar-builder", "hapa-song-registry", "hapa-music-viz", "HyperFrames"],
    tags: ["album-drain", "157-projects", "human-review", "release-gate"]
  }
];

function validateTaskGraph() {
  const ids = tasks.map((task) => task.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) throw new Error("Lyric board task IDs must be unique");
  if (tasks.length !== 18) throw new Error(`Expected 18 lyric board tasks, found ${tasks.length}`);
  const allowedLanes = new Set(["lane-planning", "lane-music-enrich", "lane-media-enrich", "lane-scaffolding", "lane-qa"]);
  for (const task of tasks) {
    if (!allowedLanes.has(task.lane)) throw new Error(`Unsupported lane for ${task.id}: ${task.lane}`);
    if (!["P0", "P1"].includes(task.priority)) throw new Error(`Unsupported priority for ${task.id}: ${task.priority}`);
    for (const dependency of task.dependencies) {
      if (!uniqueIds.has(dependency)) throw new Error(`Unknown dependency for ${task.id}: ${dependency}`);
      if (dependency === task.id) throw new Error(`Task cannot depend on itself: ${task.id}`);
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventId(taskId) {
  return `evt_echo_lyrics_v4_20260729_${taskId.replace(/^task-lyrics-v4-/, "").replaceAll("-", "_")}_created`;
}

function buildBoardCard(task) {
  return {
    id: task.id,
    title: task.title,
    status: "todo",
    priority: task.priority,
    owner: task.owner,
    body: task.body,
    acceptance: task.acceptance,
    dependencies: task.dependencies,
    targets: task.targets,
    tags: task.tags,
    reviewPass: REVIEW_PASS,
    createdAt: CREATED_AT,
    evidenceRequirements: [
      "Focused source and fixture tests",
      "Visible fixed-time Preview evidence",
      "Machine-readable before/after or parity report",
      "Learning delta and reusable guardrail"
    ]
  };
}

function buildOverwatchEvent(task) {
  return {
    id: eventId(task.id),
    project_id: PROJECT_ID,
    ts: CREATED_AT,
    actor: task.owner,
    type: "task_created",
    task_id: task.id,
    parent_event_id: null,
    visibility: "project",
    protocol: {
      truthStatus: "inferred_roadmap_from_user_request",
      recordOwner: "hapa-overwatch-kanban",
      source: SOURCE
    },
    links: [
      { label: "Lyric timing and template drain", href: PROGRAM_DOC },
      { label: "Anime.js animation documentation", href: ANIME_DOCS },
      { label: "Detailed Echo board", href: BOARD_PATH }
    ],
    payload: {
      taskId: task.id,
      title: task.title,
      description: task.body,
      column: "backlog",
      owner: task.owner,
      priority: task.priority,
      node: "hapa-avatar-builder",
      lane: task.lane,
      tags: task.tags,
      milestone: task.priority === "P0" ? "M1 Lyric Truth And Mint Parity" : "M2 Lyric Template Delivery",
      epic: "Echo Album Lyric Quality",
      dependsOn: task.dependencies,
      acceptance: task.acceptance,
      evidenceRequirements: buildBoardCard(task).evidenceRequirements
    }
  };
}

function timestampForFile() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

validateTaskGraph();
const board = readJson(BOARD_PATH);
const lanesById = new Map(ensureArray(board.lanes).map((lane) => [lane.id, lane]));
const existingBoardIds = new Set(ensureArray(board.lanes).flatMap((lane) => ensureArray(lane.cards).map((card) => card.id)));
const boardAdds = tasks.filter((task) => !existingBoardIds.has(task.id));

const eventText = fs.existsSync(OVERWATCH_EVENTS_PATH) ? fs.readFileSync(OVERWATCH_EVENTS_PATH, "utf8") : "";
const existingEventTaskIds = new Set(eventText.split("\n").filter(Boolean).map((line) => {
  try {
    return JSON.parse(line).task_id;
  } catch {
    return null;
  }
}).filter(Boolean));
const eventAdds = tasks.filter((task) => !existingEventTaskIds.has(task.id)).map(buildOverwatchEvent);

const summary = {
  ok: true,
  apply: APPLY,
  reviewPass: REVIEW_PASS,
  requestedTasks: tasks.length,
  boardAdds: boardAdds.length,
  overwatchEventAdds: eventAdds.length,
  boardPath: BOARD_PATH,
  overwatchEventsPath: OVERWATCH_EVENTS_PATH,
  byLane: Object.fromEntries([...new Set(tasks.map((task) => task.lane))].map((lane) => [
    lane,
    tasks.filter((task) => task.lane === lane).length
  ]))
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

for (const task of boardAdds) {
  const lane = lanesById.get(task.lane);
  if (!lane) throw new Error(`Missing board lane: ${task.lane}`);
  lane.cards = ensureArray(lane.cards);
  lane.cards.push(buildBoardCard(task));
}

if (boardAdds.length > 0) {
  const backupDir = path.join(path.dirname(BOARD_PATH), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `kanban.before-${REVIEW_PASS}.${timestampForFile()}.json`);
  fs.copyFileSync(BOARD_PATH, backupPath);
  board.updatedAt = new Date().toISOString();
  board.lyricQualityProgram = {
    reviewPass: REVIEW_PASS,
    taskIds: tasks.map((task) => task.id),
    taskCount: tasks.length,
    scope: "157 live Director projects; recent songs first; preview/export/mint parity",
    programDocument: PROGRAM_DOC,
    source: SOURCE
  };
  fs.writeFileSync(BOARD_PATH, `${JSON.stringify(board, null, 2)}\n`);
  summary.boardBackupPath = backupPath;
}

if (eventAdds.length > 0) {
  const checkpoint = {
    id: "evt_echo_lyrics_v4_20260729_checkpoint",
    project_id: PROJECT_ID,
    ts: CREATED_AT,
    actor: "Overwatch",
    type: "checkpoint",
    task_id: null,
    parent_event_id: null,
    visibility: "project",
    protocol: {
      truthStatus: "verified_board_append",
      recordOwner: "hapa-overwatch-kanban",
      source: SOURCE
    },
    links: [
      { label: "Lyric timing and template drain", href: PROGRAM_DOC },
      { label: "Detailed Echo board", href: BOARD_PATH }
    ],
    payload: {
      title: "Echo Album lyric-quality drain board slice appended",
      summary: "Eighteen dependency-ordered tasks cover the live 157-project lyric baseline, recent-song text/timing repair, optional lyrics, four deterministic animated templates, and Preview-to-HyperFrames-to-minted-MP4 parity.",
      taskCount: tasks.length,
      recentSongsFirst: true,
      previewExportMintParityRequired: true
    }
  };
  const checkpointAlreadyExists = eventText.includes(`"id":"${checkpoint.id}"`);
  const rows = [...eventAdds, ...(checkpointAlreadyExists ? [] : [checkpoint])];
  fs.appendFileSync(OVERWATCH_EVENTS_PATH, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  summary.checkpointAdded = !checkpointAlreadyExists;
}

console.log(JSON.stringify(summary, null, 2));
