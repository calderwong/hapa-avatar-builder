import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ECHO_AVATAR_CAST_REGISTRY } from "../src/domain/echo-avatar-cast-registry.js";

const root = path.resolve(import.meta.dirname, "..");

test("Echo evergreen cast uses explicit unambiguous Avatar IDs and existing clean seeds", () => {
  const cast = ECHO_AVATAR_CAST_REGISTRY.evergreen;
  assert.equal(new Set(cast.map((member) => member.avatarId)).size, cast.length);
  assert.deepEqual(Object.fromEntries(cast.map((member) => [member.name, member.avatarId])), {
    Thorsun: "avatar-5",
    "Little Toe": "avatar-47",
    Calder: "avatar-25",
    Bo: "avatar-7",
    Thor: "avatar-39",
    Leo: "avatar-46",
    Falka: "avatar-8",
  });
  for (const member of cast) assert.equal(fs.existsSync(path.resolve(root, member.seedRelativePath)), true, `${member.name} seed must exist`);
  assert.equal(cast.find((member) => member.name === "Thor").species, "cat");
  assert.equal(cast.find((member) => member.name === "Leo").species, "dog");
  assert.ok(cast.find((member) => member.name === "Falka").aliases.includes("Mimi"));
});

test("I Knew a Bella binds the explicit Bella card instead of a name-like alias", () => {
  const bella = ECHO_AVATAR_CAST_REGISTRY.songBindings["dear-papa-song-i-knew-a-bella"][0];
  assert.equal(bella.avatarId, "pinokio-bella");
  assert.equal(bella.castClass, "referenced-avatar");
  assert.match(bella.evidenceStatus, /user-confirmed/u);
  assert.equal(fs.existsSync(path.resolve(root, bella.seedRelativePath)), true);
});
