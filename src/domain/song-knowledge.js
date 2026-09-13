import { slugify } from "./avatar.js";

export const HAPA_SONG_KNOWLEDGE_VERSION = "hapa.song-knowledge.v1";
export const HAPA_SONG_KNOWLEDGE_ENTRY_VERSION = "hapa.song-knowledge-entry.v1";
export const HAPA_SONG_RESEARCH_REFERENCE_VERSION = "hapa.song-research-reference.v1";

const ENTRY_KINDS = new Set(["note", "anecdote", "lesson"]);

function text(value = "") {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function entryId(kind, input = {}) {
  const seed = text(input.id) || `${kind}-${text(input.body || input.text).slice(0, 48)}-${text(input.createdAt)}`;
  return text(input.id) || `song-${kind}-${slugify(seed) || Date.now().toString(36)}`;
}

export function normalizeSongKnowledgeEntry(input = {}, fallbackKind = "note") {
  const kind = ENTRY_KINDS.has(input.kind) ? input.kind : fallbackKind;
  const body = text(input.body || input.text);
  return {
    schemaVersion: HAPA_SONG_KNOWLEDGE_ENTRY_VERSION,
    id: entryId(kind, input),
    kind,
    body,
    title: text(input.title),
    authorType: text(input.authorType) || "human",
    authorName: text(input.authorName) || "Hapa operator",
    avatarId: text(input.avatarId),
    context: text(input.context),
    lesson: kind === "lesson" ? text(input.lesson || body) : "",
    futureUse: kind === "lesson" ? text(input.futureUse) : "",
    relatedFeature: kind === "lesson" ? text(input.relatedFeature) : "",
    tags: unique(input.tags),
    createdAt: text(input.createdAt) || new Date().toISOString(),
    updatedAt: text(input.updatedAt || input.createdAt) || new Date().toISOString(),
  };
}

export function normalizeSongResearchReference(input = {}) {
  const url = text(input.url);
  const label = text(input.label || input.title || url);
  const seed = text(input.id) || `${label}-${url}`;
  return {
    schemaVersion: HAPA_SONG_RESEARCH_REFERENCE_VERSION,
    id: text(input.id) || `song-reference-${slugify(seed) || Date.now().toString(36)}`,
    label,
    url,
    notes: text(input.notes || input.reason),
    referenceCardId: text(input.referenceCardId),
    status: text(input.status) || "marked-for-research",
    sourceClass: text(input.sourceClass) || "human-marked",
    tags: unique(input.tags),
    createdAt: text(input.createdAt) || new Date().toISOString(),
    updatedAt: text(input.updatedAt || input.createdAt) || new Date().toISOString(),
  };
}

export function normalizeSongKnowledge(input = {}) {
  const notes = Array.isArray(input.notes) ? input.notes : [];
  const anecdotes = Array.isArray(input.anecdotes) ? input.anecdotes : [];
  const lessons = Array.isArray(input.lessons) ? input.lessons : [];
  const researchReferences = Array.isArray(input.researchReferences) ? input.researchReferences : [];
  return {
    schemaVersion: HAPA_SONG_KNOWLEDGE_VERSION,
    notes: notes.map((entry) => normalizeSongKnowledgeEntry(entry, "note")).filter((entry) => entry.body),
    anecdotes: anecdotes.map((entry) => normalizeSongKnowledgeEntry(entry, "anecdote")).filter((entry) => entry.body),
    lessons: lessons.map((entry) => normalizeSongKnowledgeEntry(entry, "lesson")).filter((entry) => entry.body),
    researchReferences: researchReferences.map(normalizeSongResearchReference).filter((entry) => entry.label || entry.url),
    updatedAt: text(input.updatedAt),
  };
}

export function addSongKnowledgeEntry(song = {}, kind = "note", input = {}) {
  const normalizedKind = ENTRY_KINDS.has(kind) ? kind : "note";
  const collection = normalizedKind === "anecdote" ? "anecdotes" : normalizedKind === "lesson" ? "lessons" : "notes";
  const knowledge = normalizeSongKnowledge(song.knowledge || {});
  const entry = normalizeSongKnowledgeEntry({ ...input, kind: normalizedKind }, normalizedKind);
  if (!entry.body) return song;
  return {
    ...song,
    knowledge: {
      ...knowledge,
      [collection]: [entry, ...knowledge[collection].filter((item) => item.id !== entry.id)],
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function markSongResearchReference(song = {}, input = {}) {
  const knowledge = normalizeSongKnowledge(song.knowledge || {});
  const reference = normalizeSongResearchReference(input);
  if (!reference.label && !reference.url) return song;
  return {
    ...song,
    knowledge: {
      ...knowledge,
      researchReferences: [reference, ...knowledge.researchReferences.filter((item) => item.id !== reference.id)],
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}
