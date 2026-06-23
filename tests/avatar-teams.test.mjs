import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarScaffold } from "../src/domain/avatar.js";
import {
  assignAvatarToTeam,
  createAvatarTeam,
  createAvatarTeamGroups,
  normalizeAvatarTeams
} from "../src/domain/avatarTeams.js";

const avatars = ["Red", "Blue", "Green", "Beth"].map((name, index) =>
  createAvatarScaffold({
    id: index === 0 ? "red-reaper" : `avatar-${index + 1}`,
    names: [name],
    primaryName: name
  })
);

test("avatar teams seed Red Blue and Green into the Core Protocol Team", () => {
  const teams = normalizeAvatarTeams([], avatars);
  const core = teams.find((team) => team.id === "core-protocol-team");
  assert.ok(core);
  assert.equal(core.title, "Core Protocol Team");
  assert.deepEqual(core.members.map((member) => member.avatarId), ["red-reaper", "avatar-2", "avatar-3"]);
  assert.deepEqual(core.members.map((member) => member.role), ["Lead", "Strategist", "Anchor"]);
});

test("avatar team groups put unassigned avatars into the virtual ungrouped bucket", () => {
  const groups = createAvatarTeamGroups(normalizeAvatarTeams([], avatars), avatars);
  const ungrouped = groups.find((team) => team.id === "__ungrouped");
  assert.ok(ungrouped);
  assert.equal(ungrouped.virtual, true);
  assert.deepEqual(ungrouped.members.map((member) => member.avatar.primaryName), ["Beth"]);
});

test("assigning an avatar to a team keeps the rail membership singular", () => {
  const core = normalizeAvatarTeams([], avatars);
  const fieldTeam = createAvatarTeam({ title: "Field Team" });
  const next = assignAvatarToTeam([...core, fieldTeam], "avatar-2", fieldTeam.id, "Scout");
  const blueMemberships = next.flatMap((team) =>
    team.members
      .filter((member) => member.avatarId === "avatar-2")
      .map((member) => [team.id, member.role])
  );

  assert.deepEqual(blueMemberships, [[fieldTeam.id, "Scout"]]);
});
