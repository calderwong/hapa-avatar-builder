import { slugify } from "./avatar.js";

export const AVATAR_TEAM_STORE_VERSION = "hapa.avatar-teams.v1";

export const AVATAR_TEAM_ROLES = [
  "Lead",
  "Anchor",
  "Strategist",
  "Scout",
  "Support",
  "Specialist",
  "Wild Card",
  "Archivist"
];

export const DEFAULT_CORE_PROTOCOL_TEAM_ID = "core-protocol-team";

const CORE_PROTOCOL_NAMES = ["Red", "Blue", "Green"];

export function createAvatarTeam(input = {}) {
  const now = new Date().toISOString();
  const title = String(input.title || "New Team").trim();
  const id = input.id || slugify(title) || `avatar-team-${Date.now()}`;
  return normalizeAvatarTeam({
    schemaVersion: AVATAR_TEAM_STORE_VERSION,
    id,
    title,
    description: input.description || "",
    accent: input.accent || "cyan",
    status: input.status || "active",
    members: input.members || [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now
  }, []);
}

export function normalizeAvatarTeams(inputTeams = [], avatars = [], options = {}) {
  const existingAvatarIds = new Set((avatars || []).map((avatar) => avatar.id));
  const shouldFilterAvatars = existingAvatarIds.size > 0;
  const shouldSeedCore = options.seedCore !== false && (!Array.isArray(inputTeams) || inputTeams.length === 0);
  const rawTeams = Array.isArray(inputTeams) ? inputTeams : [];
  const seededTeams = shouldSeedCore ? [createCoreProtocolTeam(avatars), ...rawTeams] : rawTeams;
  const usedTeamIds = new Set();
  const usedAvatarIds = new Set();

  return seededTeams
    .map((team) => {
      const normalized = normalizeAvatarTeam(team, avatars);
      let id = normalized.id;
      if (usedTeamIds.has(id)) id = `${id}-${usedTeamIds.size + 1}`;
      usedTeamIds.add(id);

      const members = [];
      for (const member of normalized.members) {
        if (!member.avatarId || (shouldFilterAvatars && !existingAvatarIds.has(member.avatarId)) || usedAvatarIds.has(member.avatarId)) continue;
        usedAvatarIds.add(member.avatarId);
        members.push(member);
      }
      return { ...normalized, id, members };
    })
    .filter((team) => team.id && team.title);
}

export function normalizeAvatarTeamStore(store = {}, avatars = []) {
  return {
    schemaVersion: AVATAR_TEAM_STORE_VERSION,
    teams: normalizeAvatarTeams(store.teams, avatars),
    updatedAt: store.updatedAt || new Date().toISOString()
  };
}

export function createAvatarTeamGroups(teams = [], avatars = []) {
  const avatarById = new Map((avatars || []).map((avatar) => [avatar.id, avatar]));
  const assigned = new Set();
  const groups = normalizeAvatarTeams(teams, avatars, { seedCore: false }).map((team) => {
    const members = team.members
      .map((member) => {
        const avatar = avatarById.get(member.avatarId);
        if (!avatar) return null;
        assigned.add(avatar.id);
        return { ...member, avatar };
      })
      .filter(Boolean);
    return { ...team, members, virtual: false };
  });

  const ungrouped = (avatars || [])
    .filter((avatar) => !assigned.has(avatar.id))
    .map((avatar) => ({
      avatarId: avatar.id,
      role: "Unassigned",
      notes: "",
      avatar
    }));

  if (ungrouped.length) {
    groups.push({
      schemaVersion: AVATAR_TEAM_STORE_VERSION,
      id: "__ungrouped",
      title: "Ungrouped Avatars",
      description: "Avatars waiting for a team assignment.",
      accent: "gold",
      status: "staging",
      members: ungrouped,
      virtual: true
    });
  }

  return groups;
}

export function findAvatarTeamMembership(teams = [], avatarId) {
  if (!avatarId) return null;
  for (const team of teams || []) {
    const member = (team.members || []).find((item) => item.avatarId === avatarId);
    if (member) return { team, member };
  }
  return null;
}

export function assignAvatarToTeam(teams = [], avatarId, teamId, role = "Member") {
  const now = new Date().toISOString();
  const nextTeams = normalizeAvatarTeams(teams, [], { seedCore: false }).map((team) => ({
    ...team,
    members: (team.members || []).filter((member) => member.avatarId !== avatarId)
  }));

  if (!teamId || teamId === "__ungrouped") return touchTeams(nextTeams);

  const teamIndex = nextTeams.findIndex((team) => team.id === teamId);
  if (teamIndex < 0) return touchTeams(nextTeams);
  nextTeams[teamIndex] = {
    ...nextTeams[teamIndex],
    members: [
      ...(nextTeams[teamIndex].members || []),
      {
        avatarId,
        role: String(role || "Member").trim() || "Member",
        notes: "",
        joinedAt: now
      }
    ],
    updatedAt: now
  };
  return touchTeams(nextTeams);
}

export function updateAvatarTeamMember(teams = [], avatarId, patch = {}) {
  const now = new Date().toISOString();
  return touchTeams(normalizeAvatarTeams(teams, [], { seedCore: false }).map((team) => {
    const members = (team.members || []).map((member) => (
      member.avatarId === avatarId
        ? {
            ...member,
            ...patch,
            role: String(patch.role || member.role || "Member").trim() || "Member",
            updatedAt: now
          }
        : member
    ));
    return members === team.members ? team : { ...team, members, updatedAt: now };
  }));
}

function createCoreProtocolTeam(avatars = []) {
  const now = new Date().toISOString();
  const avatarByName = new Map((avatars || []).map((avatar) => [String(avatar.primaryName || "").toLowerCase(), avatar]));
  const members = CORE_PROTOCOL_NAMES
    .map((name, index) => {
      const avatar = avatarByName.get(name.toLowerCase());
      if (!avatar) return null;
      return {
        avatarId: avatar.id,
        role: index === 0 ? "Lead" : index === 1 ? "Strategist" : "Anchor",
        notes: "Seeded Core Protocol Team member.",
        joinedAt: now
      };
    })
    .filter(Boolean);

  return {
    schemaVersion: AVATAR_TEAM_STORE_VERSION,
    id: DEFAULT_CORE_PROTOCOL_TEAM_ID,
    title: "Core Protocol Team",
    description: "Seed grouping for Red, Blue, and Green.",
    accent: "green",
    status: "active",
    members,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeAvatarTeam(team = {}, avatars = []) {
  const now = new Date().toISOString();
  const title = String(team.title || team.name || "Untitled Team").trim();
  const id = team.id || slugify(title) || `avatar-team-${Date.now()}`;
  return {
    schemaVersion: AVATAR_TEAM_STORE_VERSION,
    id,
    title,
    description: team.description || "",
    accent: team.accent || "cyan",
    status: team.status || "active",
    members: normalizeMembers(team.members || [], avatars),
    createdAt: team.createdAt || now,
    updatedAt: team.updatedAt || team.createdAt || now
  };
}

function normalizeMembers(members = [], avatars = []) {
  const ids = new Set((avatars || []).map((avatar) => avatar.id));
  const shouldFilter = ids.size > 0;
  const seen = new Set();
  return (Array.isArray(members) ? members : [])
    .map((member) => {
      const avatarId = typeof member === "string" ? member : member.avatarId;
      if (!avatarId || seen.has(avatarId) || (shouldFilter && !ids.has(avatarId))) return null;
      seen.add(avatarId);
      return {
        avatarId,
        role: String(member.role || "Member").trim() || "Member",
        notes: member.notes || "",
        joinedAt: member.joinedAt || new Date().toISOString(),
        updatedAt: member.updatedAt || member.joinedAt || null
      };
    })
    .filter(Boolean);
}

function touchTeams(teams = []) {
  const now = new Date().toISOString();
  return teams.map((team) => ({ ...team, updatedAt: team.updatedAt || now }));
}
