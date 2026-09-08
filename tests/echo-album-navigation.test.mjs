import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  retainEchoProjectDetails,
  retainEchoSongCardPlans,
  filterEchoDirectorProjectRows,
  inspectEchoDirectorProjectDetail,
} from "../src/domain/echo-album-navigation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function projectRow(songId, title = songId, detail = {}) {
  return {
    music_video_project: {
      song_id: songId,
      song_title: title,
      ...detail,
    },
  };
}

test("the director roster keeps every album project visible beyond the former 100-song boundary", () => {
  const rows = Array.from({ length: 109 }, (_, index) => projectRow(`song-${index + 1}`));
  rows[108] = projectRow("dear-papa-song-watermelon-honey-due", "Watermelon Honey, Due");

  assert.equal(filterEchoDirectorProjectRows(rows, "").length, 109);
  assert.deepEqual(
    filterEchoDirectorProjectRows(rows, "watermelon").map((row) => row.music_video_project.song_id),
    ["dear-papa-song-watermelon-honey-due"],
  );
});

test("a song timeline remains selectable while its optional editing graph prepares", () => {
  const timelineOnly = inspectEchoDirectorProjectDetail(projectRow(
    "dear-papa-song-watermelon-honey-due",
    "Watermelon Honey, Due",
    { timeline: [{ start_sec: 0, end_sec: 4 }] },
  ));
  assert.equal(timelineOnly.canOpen, true);
  assert.equal(timelineOnly.hasTimeline, true);
  assert.equal(timelineOnly.hasEditorGraph, false);

  const editable = inspectEchoDirectorProjectDetail(projectRow(
    "song-editable",
    "Editable",
    { timeline: [], director_show_graph: { tracks: { video: [] } } },
  ));
  assert.equal(editable.canOpen, true);
  assert.equal(editable.hasEditorGraph, true);
});

test("the checked-in Director UI renders the complete filtered roster without a display cap", () => {
  const source = fs.readFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "utf8");
  assert.match(source, /visibleDirectorProjects\.map\(/u);
  const rosterStart = source.indexOf("{visibleDirectorProjects.map");
  const rosterEnd = source.indexOf("{directorProjects.length === 0", rosterStart);
  assert.ok(rosterStart >= 0 && rosterEnd > rosterStart);
  assert.doesNotMatch(source.slice(rosterStart, rosterEnd), /\.slice\(0,\s*\d+\)/u);
  assert.match(source, /inspectEchoDirectorProjectDetail\(detailResult\?\.detail\)/u);
});

test("track selection commits before Director detail hydration and survives a failed load", () => {
  const source = fs.readFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "utf8");
  const handlerStart = source.indexOf("const handleSelectDirectorProjectSong = async (songId) => {");
  const handlerEnd = source.indexOf("\n  const editableDirectionForkFromDetail", handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.ok(
    handler.indexOf("commitSelectedProjectSongId(songId)")
      < handler.indexOf("await fetchProjectDetail(songId"),
    "the clicked track must become authoritative before its heavy detail request",
  );
  assert.match(handler, /selectedProjectSongIdRef\.current !== songId/u);
  assert.match(handler, /That track remains selected, but its timeline did not finish loading/u);
  assert.doesNotMatch(handler, /setSelectedProjectSongId\(songId\)/u);

  assert.match(source, /const currentSongId = selectedProjectSongIdRef\.current/u);
  assert.match(source, /projectSongIds\.has\(currentSongId\)[\s\S]*\? currentSongId/u);
  assert.match(source, /if \(!selectedProjectSongId\s*\|\| !activeProjectHasDetail\s*\|\| !latestVariantId/u);
});

test("a persisted timeline remains a successful save while its render graph prepares", () => {
  const source = fs.readFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "utf8");
  assert.match(source, /const refreshedInspection = inspectEchoDirectorProjectDetail/u);
  assert.match(source, /if \(!refreshedInspection\.hasEditorGraph\)[\s\S]*setSaveFeedbackTone\("success"\)/u);
  assert.doesNotMatch(source, /could not reload that graph\. Choose Save again before rendering/u);
});

test("director parity repair fills only complete missing cut families", () => {
  const balanced = fs.readFileSync(path.join(root, "scripts/append-balanced-builder-direction-variants.mjs"), "utf8");
  const scroll = fs.readFileSync(path.join(root, "scripts/ingest-scroll-site-media.mjs"), "utf8");
  const plans = fs.readFileSync(path.join(root, "scripts/generate-music-video-plans.mjs"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(balanced, /const MISSING_ONLY = args\.has\("--missing-only"\)/u);
  assert.match(balanced, /const TARGET_SONG_ID = process\.argv\.find\(\(arg\) => arg\.startsWith\("--song-id="\)\)/u);
  assert.match(balanced, /file === `\$\{TARGET_SONG_ID\}-video-project\.json`/u);
  assert.match(balanced, /Partial director-cut family found/u);
  assert.match(balanced, /if \(!MISSING_ONLY && !report\.validation\.allCandidateMediaCovered\)/u);
  assert.match(scroll, /const VARIANTS_ONLY = args\.has\("--variants-only"\)/u);
  assert.match(scroll, /const TARGET_SONG_ID = process\.argv\.find\(\(arg\) => arg\.startsWith\("--song-id="\)\)/u);
  assert.match(scroll, /file === `\$\{TARGET_SONG_ID\}-video-project\.json`/u);
  assert.match(plans, /const MISSING_ONLY = args\.has\("--missing-only"\)/u);
  assert.match(plans, /!fs\.existsSync\(path\.join\(PROJECTS_DIR/u);
  assert.match(plans, /--registry-track-ids=/u);
  assert.match(plans, /activeStems\.push\("Master Mix"\)/u);
  assert.match(plans, /three-part-master-mix-energy-arc/u);
  assert.match(packageJson.scripts["echo:director:plans:missing:apply"], /--missing-only --apply/u);
  assert.match(packageJson.scripts["echo:variants:parity:missing:apply"], /--missing-only/u);
});

test("every current Echo album card has one accessible Director project", () => {
  const songbook = JSON.parse(fs.readFileSync(path.join(root, "data/dear-papa-songbook.json"), "utf8"));
  const projectDir = path.join(root, "data/music-video-projects");
  const projects = fs.readdirSync(projectDir)
    .filter((file) => file.endsWith("-video-project.json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(projectDir, file), "utf8")).music_video_project);

  const cardIds = songbook.songCards.map((song) => song.id);
  const projectIds = projects.map((project) => project.song_id);
  assert.ok(cardIds.length >= 109);
  assert.equal(new Set(cardIds).size, cardIds.length);
  assert.equal(new Set(projectIds).size, projects.length);
  assert.deepEqual(new Set(projectIds), new Set(cardIds));

  for (const project of projects) {
    assert.ok(project.song_title, `${project.song_id} has a visible title`);
    assert.ok(project.audio_id, `${project.song_id} has a selectable audio source`);
    assert.ok(Array.isArray(project.timeline) && project.timeline.length > 0, `${project.song_id} has a playable timeline`);
  }

  const watermelon = projects.find((project) => project.song_title === "Watermelon Honey, Due");
  assert.equal(watermelon?.song_id, "dear-papa-song-watermelon-honey-due");
  assert.ok(watermelon.timeline.length > 0);
});

test("every current Echo album project has the standard five protected director cuts", () => {
  const projectDir = path.join(root, "data/music-video-projects");
  const variantsDir = path.join(root, "data/music-video-project-variants");
  const requiredCutIds = [
    "scroll-fal-authored-v1",
    "scroll-scene-avatar-balanced-v1",
    "wide-coverage-airy-v1",
    "wide-coverage-rhythmic-v1",
    "wide-coverage-dense-v1",
  ];
  const projects = fs.readdirSync(projectDir)
    .filter((file) => file.endsWith("-video-project.json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(projectDir, file), "utf8")).music_video_project);

  for (const project of projects) {
    const available = new Set(fs.readdirSync(path.join(variantsDir, project.song_id))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/u, "")));
    for (const cutId of requiredCutIds) {
      assert.ok(available.has(cutId), `${project.song_title} is missing director cut ${cutId}`);
    }
  }
});


test('ten song switches retain a bounded detail set without dropping roster entries or pinned edits', () => {
  const summaries = new Map(Array.from({ length: 12 }, (_, i) => [String(i), projectRow(String(i))]));
  let rows = [...summaries.values()], recent = [];
  const edited = projectRow('0', 'Unsaved', { timeline: [{ manual: true }], director_show_graph: { tracks: {} } });
  rows[0] = edited;
  for (let i = 1; i <= 10; i++) {
    rows[i] = projectRow(String(i), String(i), { timeline: [{ media_id: i }], direction_script_variants: [{ largeGraph: true }] });
    recent = [String(i), ...recent].slice(0, 3);
    rows = retainEchoProjectDetails(rows, summaries, recent, ['0', String(i)]);
    assert.equal(rows.length, 12); assert.equal(rows[0], edited);
    assert.equal(rows[i].music_video_project.timeline[0].media_id, i);
    assert.ok(rows.filter(row => Array.isArray(row.music_video_project.timeline)).length <= 3);
  }
  assert.equal(rows[1], summaries.get('1'));
  const reloaded = projectRow('1', '1', { timeline: [{ sourceRevision: 'fresh' }] });
  rows[1] = reloaded; rows = retainEchoProjectDetails(rows, summaries, ['1', ...recent], ['0', '1']);
  assert.equal(rows[1], reloaded); assert.equal(rows[0], edited);
});

test('plan eviction preserves pending restoration objects for pinned songs and does not mutate history', () => {
  const previous = { status: 'ready', project: { song_id: 'saving' }, showGraph: { tracks: {} } };
  const saving = { status: 'waiting', previous };
  const state = { saving, selected: { status: 'ready' }, old: { status: 'ready', project: { large: true } } };
  const next = retainEchoSongCardPlans(state, ['saving', 'selected']);
  assert.deepEqual(Object.keys(next), ['saving', 'selected']); assert.equal(next.saving.previous, previous);
  assert.ok(state.old); assert.equal(retainEchoSongCardPlans(next, ['saving', 'selected']), next);
});
