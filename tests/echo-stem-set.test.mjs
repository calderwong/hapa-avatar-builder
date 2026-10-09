import test from "node:test";
import assert from "node:assert/strict";
import { chooseStemSet, isStemRecord, stemRoleLabel } from "../src/domain/echo-stem-set.js";
import { normalizeStemRecords } from "../src/domain/echo-director-v2.js";

const roles = ["Vocals", "Backing Vocals", "Drums", "Bass", "Guitar", "Keyboard", "Percussion", "Strings", "Synth", "FX", "Brass", "Woodwinds"];
const generation = (name, dir, ids = "") => roles.map((role, i) => ({ id: `${name}-${i}${ids}`, parentId: "suno-1", stemType: role, title: `${name} (${role})`, localPath: `${dir}/${String(i + 1).padStart(2, "0")} - ${role}.mp3` }));

test("one stem generation is chosen when several share a Suno ID", () => {
  const registry = {
    songs: [{ id: "suno-1", title: "Halfway Home", localPath: "/lib/echo/97 - Halfway Home/song.mp3" }],
    stems: [
      ...generation("Mail.response (Remastered)", "/lib"),
      ...generation("Mail.response (Remastered)", "/lib", "b"),
      ...generation("Halfway Home", "/lib/echo/97 - Halfway Home/stems"),
      ...generation("Stolen Toe Roots on Dirt", "/lib/old/26 - Stolen Toe Roots on Dirt/stems"),
    ],
  };
  const project = { registry_track_id: "suno-1", song_title: "Stolen Toe Roots on Dirt", stems_available: ["archive-zip", "Stolen Toe Roots on Dirt", ...roles] };
  const stems = normalizeStemRecords(project, registry);
  assert.equal(stems.length, 12);
  assert.equal(new Set(stems.map(s => s.audioPath.replace(/\/[^/]*$/, ""))).size, 1, "all roles come from one generation");
  assert.ok(stems.every(s => s.audioPath.startsWith("/lib/echo/97 - Halfway Home/stems/")), "generation next to the registry master wins");
  assert.ok(!stems.some(s => /archive|stolen toe/i.test(s.stemType)), "archive and title-only records are not stems");
});

test("stem role labels drop the song-title wrapper and dual-format records stay one per role", () => {
  assert.equal(stemRoleLabel({ title: "Red (Lead Vocals)" }), "Lead Vocals");
  assert.equal(stemRoleLabel({ stemType: "Drums", title: "Red (Drums)" }), "Drums");
  assert.equal(isStemRecord({ kind: "archive-zip" }, "Red"), false);
  const current = chooseStemSet([
    { id: "a", stemType: "Lead Vocals", title: "Red (Lead Vocals)", localPath: "/up/a.wav", wavPath: "/up/a.wav", mp3Path: "/up/b.mp3" },
    { id: "c", stemType: "Other", title: "Red (Other)", localPath: "/up/c.wav", wavPath: "/up/c.wav", mp3Path: "/up/d.mp3" },
  ], { songTitle: "Red" });
  assert.deepEqual(current.map(s => s.id), ["a", "c"]);
});
