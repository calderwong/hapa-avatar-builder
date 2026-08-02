import fs from "node:fs";
import path from "node:path";

const DIRECTION_VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneJsonValue(entry));
  const record = object(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, cloneJsonValue(entry)])
  );
}

function mergeDefinedJsonObjects(lowerPrecedence = {}, higherPrecedence = {}) {
  const merged = cloneJsonValue(object(lowerPrecedence) || {});
  for (const [key, value] of Object.entries(object(higherPrecedence) || {})) {
    if (value === undefined) continue;
    const current = object(merged[key]);
    const incoming = object(value);
    merged[key] = current && incoming
      ? mergeDefinedJsonObjects(current, incoming)
      : cloneJsonValue(value);
  }
  return merged;
}

function compareRows(left, right) {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function variantSourceSelections(telemetry) {
  const selections = object(telemetry.selectionsBySource);
  if (selections) return selections;
  const sourceGroup = text(telemetry.sourceGroup);
  const assignedReadyVideos = finiteNumber(telemetry.assignedReadyVideos);
  return sourceGroup && assignedReadyVideos !== undefined
    ? { [sourceGroup]: assignedReadyVideos }
    : undefined;
}

function compactRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function summarizeDirectionVariant(variant, { directoryName, fileName }) {
  if (!object(variant) || variant.schemaVersion !== DIRECTION_VARIANT_SCHEMA) {
    throw new Error(`Direction Variant ${directoryName}/${fileName} does not use ${DIRECTION_VARIANT_SCHEMA}.`);
  }

  const variantId = text(variant.id);
  const songId = text(variant.parent?.songId);
  const fileVariantId = fileName.slice(0, -".json".length);
  if (!variantId) throw new Error(`Direction Variant ${directoryName}/${fileName} is missing its id.`);
  if (!songId) throw new Error(`Direction Variant ${directoryName}/${fileName} is missing parent.songId.`);
  if (directoryName !== songId) {
    throw new Error(`Direction Variant ${directoryName}/${fileName} declares parent.songId ${songId}.`);
  }
  if (fileVariantId !== variantId) {
    throw new Error(`Direction Variant ${directoryName}/${fileName} declares id ${variantId}.`);
  }

  const telemetry = object(variant.telemetry) || {};
  return compactRow({
    id: `${songId}:${variantId}`,
    songId,
    variantId,
    title: text(variant.title) || variantId,
    relativePath: path.posix.join(songId, fileName),
    parentProjectSha256: text(variant.parent?.projectSha256) || undefined,
    variationSet: cloneJsonValue(variant.variationSet),
    cut: cloneJsonValue(variant.cut),
    densityProfile: cloneJsonValue(variant.densityProfile),
    coveragePass: cloneJsonValue(variant.coveragePass),
    sourcePolicy: cloneJsonValue(variant.sourcePolicy),
    replacementShots: finiteNumber(telemetry.replacementShots),
    sourceSelections: cloneJsonValue(variantSourceSelections(telemetry)),
    uniqueMedia: finiteNumber(telemetry.uniqueMedia),
    mediaBearingShots: finiteNumber(telemetry.mediaBearingShots),
    visualizerOnlyShots: finiteNumber(telemetry.visualizerOnlyShots),
    actualVideoRatio: finiteNumber(telemetry.actualVideoRatio),
    previouslyUnseenSelections: finiteNumber(telemetry.previouslyUnseenSelections),
    updatedAt: text(variant.updatedAt) || text(variant.createdAt) || undefined,
  });
}

/**
 * Reconstruct the compact Direction Variant index rows from the authoritative
 * per-song JSON files. Root-level index.json is deliberately not consulted.
 */
export function discoverDirectionVariantIndexRows({ variantsDirectory } = {}) {
  const root = text(variantsDirectory);
  if (!root) throw new TypeError("variantsDirectory is required.");

  let rootStat;
  try {
    rootStat = fs.lstatSync(root);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Direction Variant root is not a regular directory: ${root}`);
  }

  const rows = [];
  const directoryEntries = fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isSymbolicLink()) {
      throw new Error(`Direction Variant root contains a symbolic link: ${directoryEntry.name}`);
    }
    if (!directoryEntry.isDirectory()) continue;

    const directoryPath = path.join(root, directoryEntry.name);
    const fileEntries = fs.readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".json"))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    for (const fileEntry of fileEntries) {
      const relativePath = path.posix.join(directoryEntry.name, fileEntry.name);
      if (fileEntry.isSymbolicLink()) {
        throw new Error(`Direction Variant file is a symbolic link: ${relativePath}`);
      }
      if (!fileEntry.isFile()) {
        throw new Error(`Direction Variant JSON is not a regular file: ${relativePath}`);
      }

      const filePath = path.join(directoryPath, fileEntry.name);
      let variant;
      try {
        variant = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (error) {
        throw new Error(`Cannot parse Direction Variant ${relativePath}: ${error.message}`, { cause: error });
      }
      rows.push(summarizeDirectionVariant(variant, {
        directoryName: directoryEntry.name,
        fileName: fileEntry.name,
      }));
    }
  }
  return rows.sort(compareRows);
}

/**
 * Merge compact index rows without mutating the inputs. Higher-precedence rows
 * override the same fields while retaining extension metadata they do not know.
 */
export function mergeDirectionVariantIndexRows(existingRows, diskRows, incomingRows) {
  const authoritativeIds = new Set();
  for (const rows of [diskRows, incomingRows]) {
    if (!Array.isArray(rows)) continue;
    for (const candidate of rows) {
      const id = text(object(candidate)?.id);
      if (id) authoritativeIds.add(id);
    }
  }

  const retainedExistingRows = [];
  if (Array.isArray(existingRows)) {
    for (const candidate of existingRows) {
      const row = object(candidate);
      const id = text(row?.id);
      if (!row || !id) continue;
      if (authoritativeIds.has(id)) retainedExistingRows.push(row);
      else if (text(row.relativePath)) {
        throw new Error(`Direction Variant index row ${id} points to missing authoritative file ${row.relativePath}.`);
      }
    }
  }

  const rowsById = new Map();
  for (const rows of [retainedExistingRows, diskRows, incomingRows]) {
    if (!Array.isArray(rows)) continue;
    for (const candidate of rows) {
      const row = object(candidate);
      const id = text(row?.id);
      if (!row || !id) continue;
      rowsById.set(id, mergeDefinedJsonObjects(rowsById.get(id), { ...row, id }));
    }
  }
  return [...rowsById.values()].sort(compareRows);
}
