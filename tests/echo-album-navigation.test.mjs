import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
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
