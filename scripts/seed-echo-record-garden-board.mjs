#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const BOARD_PATH = process.env.ECHO_RECORD_GARDEN_BOARD_PATH
  || "/Users/calderwong/Desktop/Echos-of-Other-Eras-Album-App/kanban.json";
const OVERWATCH_EVENTS_PATH = process.env.ECHO_RECORD_GARDEN_EVENTS_PATH
  || "/Users/calderwong/Documents/Codex/2026-05-27/can-you-generate-me-some-concept/hapa-overwatch-kanban/data/hapa-echo-music-video-direction/events.ndjson";
const PROGRAM_ID = "echo-record-garden-2026-07-30";
const REVIEW_PASS = PROGRAM_ID;
const PROJECT_ID = "hapa-echo-music-video-direction";
const CREATED_AT = "2026-07-30T18:00:00.000Z";
const SOURCE = "echo-record-garden-program-2026-07-30";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRAM_DOC = path.join(REPO_ROOT, "docs", "ECHO_RECORD_GARDEN_IMPLEMENTATION_PROGRAM.md");

const tasks = [
  {
    lane: "lane-planning",
    id: "task-record-garden-v1-01-canonical-tarot-reuse-audit",
    title: "P0 Record Garden 1/14: Audit canonical Tarot Draw reuse seams",
    owner: "Builder Architecture + Experience",
    priority: "P0",
    milestone: "M0 Inheritance And Source Truth",
    body: "Inspect the running canonical Tarot Draw and its exact source revision, then map the reusable room/table, camera, raycast, focus, drag/place, media-surface, HUD, Card-generation, snapshot, and lifecycle seams before creating the Record Garden.",
    acceptance: [
      "The audit names the exact Hapa Avatar Builder source revision and records running evidence for the complete Tarot cockpit, not source-search assumptions alone.",
      "Every relevant Tarot behavior is classified reuse, extract/adapt, or deliberately leave alone, with the owning file/function and Record Garden consumer named.",
      "The plan preserves Tarot Draw behavior and attribution; it does not fork the owner component or claim a new shared contract before the extraction boundary is proven."
    ],
    evidence: [
      "Source-revision and file/function reuse matrix",
      "Running Tarot Draw interaction capture covering camera, drag/place, media surfaces, and Card action",
      "Focused extraction decision with Tarot regression risks and guardrails"
    ],
    dependencies: [],
    targets: ["hapa-avatar-builder"],
    tags: ["record-garden", "tarot-draw", "reuse-audit", "source-truth", "3d"]
  },
  {
    lane: "lane-planning",
    id: "task-record-garden-v1-02-record-data-contract",
    title: "P0 Record Garden 2/14: Freeze the Record Garden data contract",
    owner: "Echo Director Systems + Registry",
    priority: "P0",
    milestone: "M0 Inheritance And Source Truth",
    body: "Define one source-labeled projection from each Echo song into a record, canonical audio route, active Director video, references, characters, scenes, attached Cards, rights/lineage, truth state, and bounded fallback state.",
    acceptance: [
      "Stable IDs, not title or array position, join records to audio, Director projects, references, avatars, scenes, media, and Hapa Cards.",
      "Missing, ambiguous, proposed, unavailable, and verified links remain distinguishable; fallback media never impersonates an attachment.",
      "The normalized contract covers a complete song plus instrumental, missing-video, missing-reference, duplicate-title, and stale-attachment fixtures across UI/API consumers."
    ],
    evidence: [
      "Versioned contract and representative normalized fixtures",
      "Field-level source/rights/lineage matrix with truth-state examples",
      "Focused normalization and API parity test receipt"
    ],
    dependencies: ["task-record-garden-v1-01-canonical-tarot-reuse-audit"],
    targets: ["hapa-avatar-builder", "hapa-song-registry", "hapa-music-viz"],
    tags: ["record-garden", "data-contract", "lineage", "truth-state", "echo-album"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-record-garden-v1-03-host-navigation",
    title: "P0 Record Garden 3/14: Add the host and navigation entry",
    owner: "Builder UI",
    priority: "P0",
    milestone: "M1 Playable Record Garden",
    body: "Add a dedicated lazy-loaded Echo Record Garden entry to Hapa Avatar Builder, with an isolated host boundary, loading/error/empty states, and the minimum audited Tarot services needed by the new surface.",
    acceptance: [
      "The feature is reachable from Builder navigation with a stable route/view identity and does not replace the existing Echos Album or Tarot Draw entries.",
      "Loading, no-song, API-unavailable, WebGL-unavailable, and component-error states are visible and recoverable.",
      "Opening and leaving the new view does not change Tarot Draw state or start duplicate render, media, polling, or event-listener loops."
    ],
    evidence: [
      "Navigation and lazy-load component test receipt",
      "Running captures of loaded, empty, and recoverable-error host states",
      "Tarot Draw before/after regression smoke"
    ],
    dependencies: [
      "task-record-garden-v1-01-canonical-tarot-reuse-audit",
      "task-record-garden-v1-02-record-data-contract"
    ],
    targets: ["hapa-avatar-builder"],
    tags: ["record-garden", "navigation", "lazy-load", "host", "error-boundary"]
  },
  {
    lane: "lane-media-enrich",
    id: "task-record-garden-v1-04-circular-record-video-labels",
    title: "P0 Record Garden 4/14: Build circular records with video labels",
    owner: "3D Media UI",
    priority: "P0",
    milestone: "M1 Playable Record Garden",
    body: "Render each normalized song as a tactile circular vinyl record with a readable identity label, selection/focus states, and a bounded image or looping-video label drawn only from that song's verified media.",
    acceptance: [
      "Record geometry, center hole, label orientation, hit target, focus, selected, loading, unavailable, and disposed states are deterministic and testable.",
      "Video labels use the audited media pool and playback-power policy; offscreen or inactive records do not create unbounded decoders or textures.",
      "A song without verified preview media receives its own truthful static label and never displays another song's visual."
    ],
    evidence: [
      "Fixed-camera captures for video, image, loading, selected, and missing-preview records",
      "Geometry/hit-target and media-selection test receipt",
      "Decoder/texture allocation and disposal trace for a representative record set"
    ],
    dependencies: [
      "task-record-garden-v1-02-record-data-contract",
      "task-record-garden-v1-03-host-navigation"
    ],
    targets: ["hapa-avatar-builder", "hapa-music-viz"],
    tags: ["record-garden", "vinyl", "threejs", "video-texture", "truthful-fallback"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-record-garden-v1-05-crate-browsing-search-manipulation",
    title: "P1 Record Garden 5/14: Build crate browsing and manipulation",
    owner: "3D Interaction + Builder UI",
    priority: "P1",
    milestone: "M1 Playable Record Garden",
    body: "Create the record crate and table interaction for browsing, searching, filtering, focusing, dragging, rotating, returning, and placing records with one semantic model across mouse, keyboard, and touch.",
    acceptance: [
      "Search and filters operate on stable normalized fields and expose result counts, clear state, and no-results recovery without changing canonical crate order.",
      "Focus, drag/place, return-to-crate, and collision/snap behavior are deterministic; selecting one record cannot move or play a different record.",
      "Keyboard and touch actions reach the same browse-to-place outcomes without hover-only or precision-only requirements."
    ],
    evidence: [
      "Interaction trace covering search, focus, drag/place, return, keyboard, and touch",
      "Deterministic layout, ordering, collision, and selection tests",
      "Desktop and compact-layout captures with large and empty result sets"
    ],
    dependencies: ["task-record-garden-v1-04-circular-record-video-labels"],
    targets: ["hapa-avatar-builder"],
    tags: ["record-garden", "crate", "search", "drag-place", "touch"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-record-garden-v1-06-lazy-sunday-outdoor-art-direction",
    title: "P1 Record Garden 6/14: Compose the lazy-Sunday outdoor table",
    owner: "World Art + 3D Experience",
    priority: "P1",
    milestone: "M1 Playable Record Garden",
    body: "Compose the Record Garden's warm outdoor table, record player, crate, garden backdrop, daylight, shadows, materials, and restrained ambience as a calm lazy-Sunday scene while preserving control and label legibility.",
    acceptance: [
      "The scene reads as an inviting outdoor record-listening table at the approved desktop and compact camera frames without hiding the crate, platter, records, HUD, or visual surfaces.",
      "All shipped assets and generated materials have local source/license/lineage records and require no runtime network fetch.",
      "Performance tiers and reduced-motion treatment simplify ambience and shadows without changing interaction geometry or source truth."
    ],
    evidence: [
      "Approved fixed-camera visual captures at desktop and compact layouts",
      "Environment asset, license, authorship, and source manifest",
      "Lighting/material/readability review across normal, reduced, and low-power profiles"
    ],
    dependencies: [
      "task-record-garden-v1-03-host-navigation",
      "task-record-garden-v1-05-crate-browsing-search-manipulation"
    ],
    targets: ["hapa-avatar-builder", "hapa-design-system"],
    tags: ["record-garden", "art-direction", "outdoor-table", "lazy-sunday", "lighting"]
  },
  {
    lane: "lane-music-enrich",
    id: "task-record-garden-v1-07-record-player-audio-clock-spin",
    title: "P0 Record Garden 7/14: Bind the player to audio and 33⅓ RPM",
    owner: "Audio Playback + 3D Runtime",
    priority: "P0",
    milestone: "M1 Playable Record Garden",
    body: "Make platter placement select the canonical song, route its verified audio through the shared Echo playback authority, and derive vinyl rotation, play/pause, seek, resume, and end state from absolute media time at 33⅓ RPM.",
    acceptance: [
      "The selected record and audio route share one stable song identity; missing or mismatched audio fails visibly and cannot play a different title.",
      "At 33⅓ RPM one revolution is 1.8 seconds, and rotation is recomputed from media time after seek, pause, visibility throttling, recovery, and end-of-track without accumulated frame drift.",
      "Audio, record state, controls, and emitted playback time agree within the declared tolerance under normal, throttled, and low-power playback."
    ],
    evidence: [
      "Unit receipt for RPM/media-time angle, seek, pause, wrap, and drift invariants",
      "Timed audio/record synchronization trace including throttling and recovery",
      "Running placement-to-playback capture with missing-audio failure state"
    ],
    dependencies: [
      "task-record-garden-v1-04-circular-record-video-labels",
      "task-record-garden-v1-05-crate-browsing-search-manipulation"
    ],
    targets: ["hapa-avatar-builder", "hapa-song-registry", "hapa-music-viz"],
    tags: ["record-garden", "audio-clock", "33rpm", "deterministic-spin", "playback"]
  },
  {
    lane: "lane-media-enrich",
    id: "task-record-garden-v1-08-multi-surface-echo-visuals",
    title: "P0 Record Garden 8/14: Project Echo visuals across surfaces",
    owner: "Echo Director + 3D Media UI",
    priority: "P0",
    milestone: "M2 Visual Exploration And Card Actions",
    body: "Activate a bounded multi-surface constellation for the placed record: active Director music video plus source-linked reference, character, and scene visuals, all selected from the normalized contract and timed only where timing truth exists.",
    acceptance: [
      "Director, reference, character, and scene surfaces remain visibly typed and resolve to the selected song's stable IDs and source lineage.",
      "The active Director video and timed surfaces follow the canonical audio clock through play, pause, seek, and resume; untimed context is explicitly labeled rather than presented as synchronized.",
      "Surface pagination/rotation, decoder pooling, missing-category states, and media errors remain bounded and cannot create black or stale surfaces for a previous song."
    ],
    evidence: [
      "Song-to-surface mapping report with IDs, source, truth state, and timing authority",
      "Fixed-time captures before and after seek for all four surface families",
      "Synchronization, stale-media, missing-category, and pool-bound test receipt"
    ],
    dependencies: [
      "task-record-garden-v1-02-record-data-contract",
      "task-record-garden-v1-06-lazy-sunday-outdoor-art-direction",
      "task-record-garden-v1-07-record-player-audio-clock-spin"
    ],
    targets: ["hapa-avatar-builder", "hapa-music-viz", "hapa-song-registry"],
    tags: ["record-garden", "director-video", "references", "characters", "scenes", "multi-surface"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-record-garden-v1-09-visual-to-hapa-card-generation",
    title: "P0 Record Garden 9/14: Connect visuals to attached Hapa Cards",
    owner: "Builder Card Plane + Tarot Forge",
    priority: "P0",
    milestone: "M2 Visual Exploration And Card Actions",
    body: "Make visual selection resolve the exact attached Hapa Card or, when the source projection authorizes it, invoke the existing Builder/Tarot Card creation path and report real pending, generated, complete, failed, or unavailable state in 3D.",
    acceptance: [
      "A click resolves by stable attachment identity and never substitutes a title match, unrelated Card, or fabricated completion state.",
      "Existing Cards open without duplication; authorized generation is idempotent, preserves origin custody, rights, source attribution, and returns the real forge/job state.",
      "Missing attachment, ambiguous source, unavailable generation, consent/rights block, failure, retry, and recovery each have an honest visible result and retain the selected visual context."
    ],
    evidence: [
      "Interaction/API tests for existing, generated, pending, duplicate, blocked, failed, retry, and unavailable Card paths",
      "Origin custody, idempotency, source-link, and forge-state receipts from a bounded fixture",
      "Running captures of successful Card resolution and truth-safe fallback"
    ],
    dependencies: ["task-record-garden-v1-08-multi-surface-echo-visuals"],
    targets: ["hapa-avatar-builder", "hapa-overcard"],
    tags: ["record-garden", "hapa-card", "tarot-forge", "custody", "truth-safe-fallback"]
  },
  {
    lane: "lane-scaffolding",
    id: "task-record-garden-v1-10-persistence-recovery",
    title: "P1 Record Garden 10/14: Persist and recover the scene",
    owner: "Builder Scene Systems",
    priority: "P1",
    milestone: "M2 Visual Exploration And Card Actions",
    body: "Persist a versioned Record Garden snapshot for stable record IDs, crate order, transforms, placed record, selected visual, camera, surface layout, and user settings, then recover safely across reload, source changes, interruption, and malformed state.",
    acceptance: [
      "Save/restore round-trips the user arrangement by stable IDs without duplicating media blobs, canonical songs, references, avatars, scenes, or Cards.",
      "Restored audio remains paused until user intent permits playback, while playhead and rotation recover consistently from the saved canonical time.",
      "Schema migration, missing/stale sources, malformed snapshots, interrupted Card jobs, decoder errors, and WebGL loss preserve the last valid arrangement and expose bounded repair actions."
    ],
    evidence: [
      "Snapshot schema, migration, and round-trip test receipt",
      "Reload/crash/interrupted-job recovery trace with before/after state hashes",
      "Malformed and stale-source fixture captures proving non-destructive fallback"
    ],
    dependencies: [
      "task-record-garden-v1-05-crate-browsing-search-manipulation",
      "task-record-garden-v1-07-record-player-audio-clock-spin",
      "task-record-garden-v1-08-multi-surface-echo-visuals",
      "task-record-garden-v1-09-visual-to-hapa-card-generation"
    ],
    targets: ["hapa-avatar-builder"],
    tags: ["record-garden", "snapshot", "persistence", "migration", "recovery"]
  },
  {
    lane: "lane-qa",
    id: "task-record-garden-v1-11-accessibility-reduced-motion-touch",
    title: "P0 Record Garden 11/14: Complete accessible and touch journeys",
    owner: "Accessibility + Interaction QA",
    priority: "P0",
    milestone: "M3 Verification And Closeout",
    body: "Provide keyboard, screen-reader, focus, contrast, reduced-motion, coarse-pointer, and touch operation for the full browse, place, play, inspect, and Card action journey, including equivalent non-canvas controls.",
    acceptance: [
      "Every record, player control, surface, status, and Card action has a reachable semantic control with visible focus, name, state, and error feedback.",
      "Reduced motion stops or softens spin, ambience, and camera choreography without changing audio timing, selection, source labels, or task completion.",
      "Touch and coarse-pointer users can browse, place/remove, play/seek, inspect, and invoke or cancel Card actions without hover, right-click, or precision dragging."
    ],
    evidence: [
      "Keyboard and screen-reader journey transcript for browse through Card result",
      "Reduced-motion visual/playback comparison with state and clock assertions",
      "Touch/coarse-pointer interaction capture and automated accessibility receipt"
    ],
    dependencies: [
      "task-record-garden-v1-05-crate-browsing-search-manipulation",
      "task-record-garden-v1-07-record-player-audio-clock-spin",
      "task-record-garden-v1-08-multi-surface-echo-visuals",
      "task-record-garden-v1-09-visual-to-hapa-card-generation"
    ],
    targets: ["hapa-avatar-builder", "hapa-design-system"],
    tags: ["record-garden", "accessibility", "reduced-motion", "touch", "keyboard"]
  },
  {
    lane: "lane-qa",
    id: "task-record-garden-v1-12-lifecycle-performance",
    title: "P0 Record Garden 12/14: Prove lifecycle and performance budgets",
    owner: "Runtime Performance + QA",
    priority: "P0",
    milestone: "M3 Verification And Closeout",
    body: "Instrument and bound render loops, audio/video elements, decoders, textures, geometries, event listeners, polling, network work, and memory across browsing, repeated song changes, tab changes, scene restore, Card actions, and teardown.",
    acceptance: [
      "Only declared active/nearby media retain playback resources; decoder, texture, geometry, listener, and animation-loop counts stay within recorded budgets.",
      "Startup, interaction latency, frame pacing, audio/visual sync, and memory pass desktop and low-power budgets during a representative soak and repeated record changes.",
      "Leaving or unmounting the feature aborts work and returns lifecycle counters to baseline with no audio, video, polling, or animation continuing in the background."
    ],
    evidence: [
      "Instrumented resource-count and frame/audio timing report against declared budgets",
      "Representative soak and repeated-open/close memory trace",
      "Unmount, abort, WebGL-loss, and low-power fallback test receipt"
    ],
    dependencies: [
      "task-record-garden-v1-06-lazy-sunday-outdoor-art-direction",
      "task-record-garden-v1-07-record-player-audio-clock-spin",
      "task-record-garden-v1-08-multi-surface-echo-visuals",
      "task-record-garden-v1-09-visual-to-hapa-card-generation",
      "task-record-garden-v1-10-persistence-recovery",
      "task-record-garden-v1-11-accessibility-reduced-motion-touch"
    ],
    targets: ["hapa-avatar-builder", "hapa-music-viz"],
    tags: ["record-garden", "lifecycle", "performance", "decoder-pool", "memory"]
  },
  {
    lane: "lane-qa",
    id: "task-record-garden-v1-13-automated-visual-qa",
    title: "P0 Record Garden 13/14: Run automated and visual acceptance",
    owner: "Builder QA + Human Review",
    priority: "P0",
    milestone: "M3 Verification And Closeout",
    body: "Run the focused domain, component, integration, accessibility, lifecycle, and regression suites plus fixed-camera visual acceptance for the complete Record Garden journey and its truthful degraded states.",
    acceptance: [
      "Automated coverage proves normalized identity, record geometry, browsing, 33⅓ rotation, playback/surface sync, Card idempotency, persistence, recovery, accessibility, lifecycle cleanup, and Tarot regression.",
      "Fixtures include complete and instrumental songs plus missing audio, Director video, reference, character, scene, Card attachment, stale ID, malformed snapshot, and media failure.",
      "Human-reviewed desktop and compact captures approve lazy-Sunday art direction, legibility, interaction feedback, and visual states; full repository tests and production build pass."
    ],
    evidence: [
      "Focused and full test/build command receipts with exact source revision",
      "Machine-readable fixture, coverage, synchronization, lifecycle, and regression report",
      "Approved desktop/compact visual acceptance set with truth-safe degraded states"
    ],
    dependencies: [
      "task-record-garden-v1-10-persistence-recovery",
      "task-record-garden-v1-11-accessibility-reduced-motion-touch",
      "task-record-garden-v1-12-lifecycle-performance"
    ],
    targets: ["hapa-avatar-builder", "hapa-song-registry", "hapa-music-viz"],
    tags: ["record-garden", "automated-qa", "visual-qa", "tarot-regression", "build"]
  },
  {
    lane: "lane-qa",
    id: "task-record-garden-v1-14-release-lineage-learning-closeout",
    title: "P0 Record Garden 14/14: Close release, lineage, and learning",
    owner: "Release Steward + Overwatch",
    priority: "P0",
    milestone: "M3 Verification And Closeout",
    body: "Close the First Pass only after every task has acceptance evidence, then record the exact Tarot inheritance revision, adapted boundaries, source/rights lineage, release manifest, operator instructions, limitations, board receipts, and reusable learning delta.",
    acceptance: [
      "All thirteen prerequisite tasks are done with linked evidence, no hidden aggregate failures, and a final audit that names verified, degraded, review-required, and blocked cases.",
      "The release record identifies the exact inherited Tarot revision and authorship, Record Garden additions, data/API/UI boundaries, asset licenses, source lineage, rollback/recovery path, and First Pass limitations.",
      "The Turn-to-Lore reflection records objective, evidence, reuse, noise, misunderstanding, changes, remaining seams, and a linked Skill/Lore/Lesson/Decision/Flow candidate without rewriting historical mistakes."
    ],
    evidence: [
      "Final acceptance and unresolved-case audit linked to all task receipts",
      "Release/lineage/license/rollback manifest and operator handoff",
      "Append-only board checkpoint plus attributed learning delta and reusable-artifact candidate"
    ],
    dependencies: ["task-record-garden-v1-13-automated-visual-qa"],
    targets: ["hapa-avatar-builder", "hapa-overwatch-kanban", "hapa-quest-keeper"],
    tags: ["record-garden", "release", "lineage", "learning-delta", "first-pass"]
  }
];

const ALLOWED_LANES = new Set([
  "lane-planning",
  "lane-music-enrich",
  "lane-media-enrich",
  "lane-scaffolding",
  "lane-qa"
]);

function validateTaskGraph() {
  if (tasks.length !== 14) {
    throw new Error(`Expected exactly 14 Record Garden tasks, found ${tasks.length}`);
  }

  const ids = tasks.map((task) => task.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) throw new Error("Record Garden task IDs must be unique");

  const positions = new Map(ids.map((id, index) => [id, index]));
  for (const [index, task] of tasks.entries()) {
    if (!ALLOWED_LANES.has(task.lane)) throw new Error(`Unsupported lane for ${task.id}: ${task.lane}`);
    if (!["P0", "P1"].includes(task.priority)) throw new Error(`Unsupported priority for ${task.id}: ${task.priority}`);
    if (!task.title || !task.owner || !task.body || !task.milestone) throw new Error(`Incomplete task metadata: ${task.id}`);
    if (!Array.isArray(task.acceptance) || task.acceptance.length < 3) throw new Error(`Expected at least three acceptance checks: ${task.id}`);
    if (!Array.isArray(task.evidence) || task.evidence.length < 3) throw new Error(`Expected at least three evidence requirements: ${task.id}`);
    for (const dependency of task.dependencies) {
      if (!uniqueIds.has(dependency)) throw new Error(`Unknown dependency for ${task.id}: ${dependency}`);
      if (dependency === task.id) throw new Error(`Task cannot depend on itself: ${task.id}`);
      if (positions.get(dependency) >= index) throw new Error(`Dependency must precede ${task.id}: ${dependency}`);
    }
  }

  for (const lane of ALLOWED_LANES) {
    if (!tasks.some((task) => task.lane === lane)) throw new Error(`Program must use existing Echo lane: ${lane}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function eventId(taskId) {
  return `evt_echo_record_garden_20260730_${taskId.replace(/^task-record-garden-v1-/, "").replaceAll("-", "_")}_created`;
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
    milestone: task.milestone,
    programId: PROGRAM_ID,
    reviewPass: REVIEW_PASS,
    createdAt: CREATED_AT,
    evidenceRequirements: task.evidence
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
      { label: "Echo Record Garden implementation program", href: PROGRAM_DOC },
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
      milestone: task.milestone,
      epic: "Echo State Record Garden",
      programId: PROGRAM_ID,
      reviewPass: REVIEW_PASS,
      dependsOn: task.dependencies,
      acceptance: task.acceptance,
      evidenceRequirements: task.evidence
    }
  };
}

function timestampForFile() {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

validateTaskGraph();

const board = readJson(BOARD_PATH);
const lanesById = new Map(ensureArray(board.lanes).map((lane) => [lane.id, lane]));
for (const lane of new Set(tasks.map((task) => task.lane))) {
  if (!lanesById.has(lane)) throw new Error(`Missing board lane: ${lane}`);
}

const existingBoardIds = new Set(
  ensureArray(board.lanes).flatMap((lane) => ensureArray(lane.cards).map((card) => card.id))
);
const boardAdds = tasks.filter((task) => !existingBoardIds.has(task.id));

const eventText = fs.existsSync(OVERWATCH_EVENTS_PATH)
  ? fs.readFileSync(OVERWATCH_EVENTS_PATH, "utf8")
  : "";
const existingEventIds = new Set(eventText.split("\n").filter(Boolean).map((line) => {
  try {
    return JSON.parse(line).id;
  } catch {
    return null;
  }
}).filter(Boolean));
const eventAdds = tasks
  .filter((task) => !existingEventIds.has(eventId(task.id)))
  .map(buildOverwatchEvent);

const checkpoint = {
  id: "evt_echo_record_garden_20260730_checkpoint",
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
    { label: "Echo Record Garden implementation program", href: PROGRAM_DOC },
    { label: "Detailed Echo board", href: BOARD_PATH }
  ],
  payload: {
    title: "Echo State Record Garden board slice appended",
    summary: "Fourteen dependency-ordered tasks cover canonical Tarot reuse, source-truth record projection, 3D vinyl browsing, deterministic record-player playback, multi-surface Echo exploration, attached Hapa Card actions, recovery, accessibility, performance, QA, and lineage closeout.",
    taskCount: tasks.length,
    programId: PROGRAM_ID,
    reviewPass: REVIEW_PASS,
    firstPassPrototype: true
  }
};
const checkpointAlreadyExists = existingEventIds.has(checkpoint.id);

const summary = {
  ok: true,
  apply: APPLY,
  programId: PROGRAM_ID,
  reviewPass: REVIEW_PASS,
  projectId: PROJECT_ID,
  requestedTasks: tasks.length,
  boardAdds: boardAdds.length,
  overwatchEventAdds: eventAdds.length,
  checkpointAdd: !checkpointAlreadyExists,
  boardPath: BOARD_PATH,
  overwatchEventsPath: OVERWATCH_EVENTS_PATH,
  programDocument: PROGRAM_DOC,
  byLane: Object.fromEntries([...ALLOWED_LANES].map((lane) => [
    lane,
    tasks.filter((task) => task.lane === lane).length
  ]))
};

if (!APPLY) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

if (boardAdds.length > 0) {
  const backupDir = path.join(path.dirname(BOARD_PATH), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `kanban.before-${REVIEW_PASS}.${timestampForFile()}.json`);
  fs.copyFileSync(BOARD_PATH, backupPath);
  summary.boardBackupPath = backupPath;

  for (const task of boardAdds) {
    const lane = lanesById.get(task.lane);
    lane.cards = ensureArray(lane.cards);
    lane.cards.push(buildBoardCard(task));
  }

  board.updatedAt = new Date().toISOString();
  board.echoRecordGardenProgram = {
    programId: PROGRAM_ID,
    reviewPass: REVIEW_PASS,
    taskIds: tasks.map((task) => task.id),
    taskCount: tasks.length,
    scope: "Echo State album 3D record exploration, playback, visuals, and attached Card actions",
    programDocument: PROGRAM_DOC,
    source: SOURCE,
    claimBoundary: "First Pass / Prototype Stage"
  };
  fs.writeFileSync(BOARD_PATH, `${JSON.stringify(board, null, 2)}\n`);
}

const rows = [
  ...eventAdds,
  ...(checkpointAlreadyExists ? [] : [checkpoint])
];
if (rows.length > 0) {
  fs.mkdirSync(path.dirname(OVERWATCH_EVENTS_PATH), { recursive: true });
  fs.appendFileSync(
    OVERWATCH_EVENTS_PATH,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
  );
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
