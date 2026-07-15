import fs from "node:fs";
import path from "node:path";
import { normalizeHyperFramesStemRole } from "../src/domain/hyperframes-visualizer-runtime.js";

export const STEM_REGISTRY_LINEAGE_PREFLIGHT_SCHEMA = "hapa.stem-registry-lineage-preflight.v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];

function normalizedRole(value) {
  return normalizeHyperFramesStemRole(value) || text(value).toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

function canonicalPath(filePath) {
  const candidate = text(filePath);
  if (!candidate) return null;
  try { return fs.realpathSync(candidate); }
  catch { return path.resolve(candidate); }
}

function samePath(left, right) {
  const a = canonicalPath(left);
  const b = canonicalPath(right);
  return Boolean(a && b && a === b);
}

function stemParentIds(row = {}) {
  row = row || {};
  return [...new Set([
    row.parentId,
    row.settings?.stem_from_id,
    row.raw?.metadata?.stem_from_id,
    row.settings?.edited_clip_id,
  ].map(text).filter(Boolean))];
}

function isArchiveStem(stem = {}) {
  const role = normalizedRole(stem?.stemType || stem?.role || stem?.title || stem?.id);
  return ["archivezip", "stemarchive", "stemsarchive"].includes(role) && !text(stem?.audioPath);
}

export function preflightStemRegistryLineage({
  registry = {},
  showGraph = {},
  project = {},
  masterPath = "",
  masterRegistryId = "",
} = {}) {
  const findings = [];
  const add = (code, message, details = {}) => findings.push({ code, severity: "blocker", message, ...details });
  const songs = list(registry?.songs);
  const stems = list(registry?.stems);
  const masterIds = [...new Set([
    masterRegistryId,
    project?.registry_track_id,
    project?.audio_id,
    showGraph?.song?.registryTrackId,
    showGraph?.song?.id,
  ].map(text).filter(Boolean))];
  const masterById = masterIds.map((id) => songs.find((row) => text(row?.id) === id)).find(Boolean) || null;
  const masterByPath = songs.find((row) => samePath(row?.localPath, masterPath)) || null;
  const master = masterById || masterByPath;
  if (!master) {
    add("stem-registry-master-lineage-missing", "The playback master is not a canonical song row in the Hapa song registry.", {
      masterRegistryIds: masterIds,
      masterPath: text(masterPath) || null,
    });
  } else if (!samePath(master?.localPath, masterPath)) {
    add("stem-registry-master-path-mismatch", "The playback master path does not match its canonical song-registry row.", {
      masterRegistryId: text(master?.id) || null,
      expectedPath: text(master?.localPath) || null,
      observedPath: text(masterPath) || null,
    });
  }
  const canonicalMasterId = text(master?.id);
  const registryStemById = new Map(stems.map((row) => [text(row?.id), row]).filter(([id]) => id));
  const graphStems = list(showGraph?.stems?.items).filter((stem) => !isArchiveStem(stem) && text(stem?.audioPath));
  const entries = [];
  const seenIds = new Set();
  for (const [index, stem] of graphStems.entries()) {
    const id = text(stem?.id);
    const graphRole = normalizedRole(stem?.stemType || stem?.role || stem?.title || stem?.id);
    const graphPath = text(stem?.audioPath);
    const row = registryStemById.get(id) || null;
    const entryFindings = [];
    const fail = (code, message, details = {}) => {
      const finding = { code, severity: "blocker", message, stemId: id || null, role: graphRole || null, ...details };
      entryFindings.push(finding);
      findings.push(finding);
    };
    if (!id || seenIds.has(id)) {
      fail(id ? "stem-registry-graph-id-duplicate" : "stem-registry-graph-id-missing", id
        ? `Stem ID ${id} is duplicated in the Show Graph.`
        : "A Show Graph stem has no canonical registry ID.", { stemIndex: index });
    }
    if (id) seenIds.add(id);
    if (!row) {
      fail("stem-registry-row-missing", `Stem ${id || graphRole || index + 1} is not present in the canonical Hapa stem registry.`, { graphPath });
    } else {
      const registryRole = normalizedRole(row?.stemType || row?.settings?.stem_type_group_name || row?.title);
      const parentIds = stemParentIds(row);
      if (!samePath(row?.localPath, graphPath)) {
        fail("stem-registry-path-mismatch", `Stem ${id} points to a different file than its canonical registry row.`, {
          graphPath,
          registryPath: text(row?.localPath) || null,
        });
      }
      if (registryRole && graphRole && registryRole !== graphRole) {
        fail("stem-registry-role-mismatch", `Stem ${id} is labeled ${graphRole} in the Show Graph but ${registryRole} in the registry.`, {
          graphRole,
          registryRole,
        });
      }
      if (!canonicalMasterId || !parentIds.length || parentIds.some((parentId) => parentId !== canonicalMasterId)) {
        fail("stem-registry-parent-mismatch", `Stem ${id} is not registered as a child of the playback master.`, {
          expectedMasterId: canonicalMasterId || null,
          observedParentIds: parentIds,
        });
      }
    }
    entries.push({
      id: id || null,
      role: graphRole || null,
      graphPath: graphPath || null,
      registryPath: text(row?.localPath) || null,
      parentIds: stemParentIds(row),
      ok: entryFindings.length === 0,
      findings: entryFindings,
    });
  }
  return {
    schemaVersion: STEM_REGISTRY_LINEAGE_PREFLIGHT_SCHEMA,
    ok: findings.length === 0,
    master: {
      id: canonicalMasterId || null,
      path: text(master?.localPath) || null,
      requestedIds: masterIds,
    },
    graphStemCount: graphStems.length,
    verifiedStemCount: entries.filter((entry) => entry.ok).length,
    entries,
    findings,
    errors: [...new Set(findings.map((finding) => finding.code))],
  };
}

export function createStemRegistryLineageError(preflight = {}) {
  const first = list(preflight?.findings)[0];
  const error = new Error(`The selected stems do not belong to the verified song-registry master.${first?.message ? ` ${first.message}` : ""}`);
  error.name = "StemRegistryLineageError";
  error.code = "stem_registry_lineage_not_render_ready";
  error.statusCode = 409;
  error.details = { stage: "stem-registry-lineage", preflight: structuredClone(preflight) };
  return error;
}
