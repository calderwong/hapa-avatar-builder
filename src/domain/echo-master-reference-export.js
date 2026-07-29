export const ECHO_MASTER_REFERENCE_SCHEMA = "hapa.echo-album-master-reference.v1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function songIdentity(song = {}) {
  return text(song.id || song.songId || song.cardId);
}

function referenceIdentity(value = "") {
  return text(value).replace(/^reference:/u, "");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])])
  );
}

export function stableEchoMasterReferenceStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function echoMasterReferenceDigest(value) {
  const source = stableEchoMasterReferenceStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function slug(value = "") {
  const normalized = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || `node-${echoMasterReferenceDigest(String(value)).slice(-8)}`;
}

function songAnchor(id) {
  return `song-${slug(songIdentity({ id }))}`;
}

function referenceAnchor(id) {
  return `reference-${slug(referenceIdentity(id))}`;
}

function edgeAnchor(source, id, index) {
  return `association-${slug(source)}-${slug(id || String(index + 1))}-${index + 1}`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\|/gu, "\\|")
    .replace(/\r?\n/gu, " ")
    .trim();
}

function inlineCode(value) {
  return `\`${String(value ?? "").replace(/`/gu, "\\`")}\``;
}

function fenced(value, language = "") {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const longest = Math.max(2, ...[...body.matchAll(/`+/gu)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${body}\n${fence}`;
}

function without(record = {}, keys = []) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(object(record)).filter(([key]) => !blocked.has(key)));
}

function sourceUpdatedAt(inputs = {}) {
  const candidates = [
    inputs.songbook?.updatedAt,
    inputs.songbook?.generatedAt,
    inputs.songStore?.updatedAt,
    inputs.songStore?.createdAt,
    inputs.referenceRun?.generatedAt,
    inputs.observability?.generatedAt,
  ].filter(Boolean).map(String).sort();
  return candidates.at(-1) || "";
}

function sortSongs(songs = []) {
  return [...songs].sort((left, right) => {
    const leftTrack = Number(left.songbook?.trackNumber || left.builder?.trackNumber || Number.MAX_SAFE_INTEGER);
    const rightTrack = Number(right.songbook?.trackNumber || right.builder?.trackNumber || Number.MAX_SAFE_INTEGER);
    return leftTrack - rightTrack
      || text(left.title).localeCompare(text(right.title))
      || left.id.localeCompare(right.id);
  });
}

function mergeSongs(songbook = {}, songStore = {}) {
  const merged = new Map();
  for (const source of list(songbook.songCards)) {
    const id = songIdentity(source);
    if (!id) continue;
    merged.set(id, {
      id,
      title: text(source.title, id),
      songbook: source,
      builder: null,
    });
  }
  for (const source of list(songStore.songs)) {
    const id = songIdentity(source);
    if (!id) continue;
    const existing = merged.get(id) || { id, title: text(source.title, id), songbook: null, builder: null };
    existing.builder = source;
    existing.title = text(existing.songbook?.title || source.title, id);
    merged.set(id, existing);
  }
  return sortSongs([...merged.values()]);
}

function lyricsRecord(song = {}) {
  const candidate = song.builder?.lyrics || song.songbook?.lyrics || {};
  if (typeof candidate === "string") return { text: candidate };
  return object(candidate);
}

function graphNodeIdentity(value = "") {
  const raw = text(value);
  if (raw.startsWith("song:")) return { kind: "song", id: raw.slice(5) };
  if (raw.startsWith("reference:")) return { kind: "reference", id: raw.slice(10) };
  return { kind: "unknown", id: raw };
}

function associationRecords(songStore = {}, referenceRun = {}) {
  const rows = [];
  for (const song of list(songStore.songs)) {
    const songId = songIdentity(song);
    for (const connector of list(song.referenceConnectors)) {
      rows.push({
        source: "song-connector",
        id: text(connector.id, `${songId}:${connector.referenceId}`),
        from: { kind: "reference", id: referenceIdentity(connector.referenceId) },
        to: { kind: "song", id: songId },
        relationType: text(connector.relationType, "references"),
        status: text(connector.provenance?.reviewStatus || connector.reviewStatus || connector.evidence?.classification),
        confidence: connector.evidence?.score ?? connector.confidence ?? "",
        rationale: text(connector.semanticEffect?.withContext || connector.semanticEffect?.thematicShift || connector.target?.lyricText),
        record: connector,
      });
    }
  }
  for (const edge of list(songStore.referenceGraphEdges)) {
    rows.push({
      source: "curated-reference-graph",
      id: text(edge.id, `${edge.fromReferenceId}:${edge.relationType}:${edge.toReferenceId}`),
      from: { kind: "reference", id: referenceIdentity(edge.fromReferenceId) },
      to: { kind: "reference", id: referenceIdentity(edge.toReferenceId) },
      relationType: text(edge.relationType, "related-to"),
      status: text(edge.provenance?.reviewStatus || edge.reviewStatus || edge.evidenceClass),
      confidence: edge.score ?? edge.confidence ?? "",
      rationale: text(edge.rationale || edge.traversalEffect),
      record: edge,
    });
  }
  for (const edge of list(referenceRun.graph?.edges)) {
    rows.push({
      source: "reference-atlas",
      id: text(edge.id, `${edge.fromId}:${edge.relationType}:${edge.toId}`),
      from: graphNodeIdentity(edge.fromId),
      to: graphNodeIdentity(edge.toId),
      relationType: text(edge.relationType, "related-to"),
      status: text(edge.status || edge.evidenceClass),
      confidence: edge.confidence ?? edge.weight ?? "",
      rationale: text(edge.rationale),
      record: edge,
    });
  }
  return rows.map((row, index) => ({ ...row, anchor: edgeAnchor(row.source, row.id, index) }));
}

function referenceRecords(songStore = {}, referenceRun = {}) {
  const references = new Map();
  for (const record of list(songStore.referenceCatalog)) {
    const id = referenceIdentity(record.id);
    if (!id) continue;
    references.set(id, {
      id,
      title: text(record.title, id),
      catalog: record,
      atlas: null,
    });
  }
  for (const record of list(referenceRun.cards)) {
    const id = referenceIdentity(record.id);
    if (!id) continue;
    const existing = references.get(id) || { id, title: text(record.title, id), catalog: null, atlas: null };
    existing.atlas = record;
    existing.title = text(record.title || existing.catalog?.title, id);
    references.set(id, existing);
  }
  return [...references.values()].sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

function nodeLink(node = {}, songsById = new Map(), referencesById = new Map()) {
  if (node.kind === "song") {
    const song = songsById.get(node.id);
    if (!song) return inlineCode(`song:${node.id}`);
    const label = song.title || node.id;
    return `[${label}](#${songAnchor(node.id)})`;
  }
  if (node.kind === "reference") {
    const id = referenceIdentity(node.id);
    const reference = referencesById.get(id);
    if (!reference) return inlineCode(`reference:${id}`);
    const label = reference.title || id;
    return `[${label}](#${referenceAnchor(id)})`;
  }
  return inlineCode(node.id || "unknown");
}

function songTelemetry(song = {}) {
  return {
    duration: song.songbook?.duration ?? song.builder?.audio?.duration ?? null,
    sections: list(song.songbook?.sections),
    beats: list(song.songbook?.beats),
    vocalDensity: list(song.songbook?.vocalDensity),
    energyCurves: object(song.songbook?.energyCurves),
    lyricTimings: song.builder?.lyricTimings || song.songbook?.lyricTimings || null,
    audio: song.builder?.audio || null,
    stems: list(song.builder?.stems),
    synchronization: song.songbook?.sync || null,
  };
}

function songMetadata(song = {}) {
  return {
    songbook: without(song.songbook, [
      "lyrics",
      "sections",
      "beats",
      "vocalDensity",
      "energyCurves",
      "sync",
    ]),
    builder: without(song.builder, [
      "lyrics",
      "lyricTimings",
      "audio",
      "stems",
      "referenceConnectors",
      "contextualLayers",
    ]),
  };
}

function referenceRunMetadata(referenceRun = {}) {
  return {
    run: without(referenceRun, [
      "cards",
      "graph",
      "packet",
      "songs",
      "contributions",
      "unresolved",
    ]),
    packet: without(referenceRun.packet, [
      "songs",
      "existingReferenceCatalog",
      "existingReferenceGraphEdges",
    ]),
    graph: without(referenceRun.graph, [
      "nodes",
      "edges",
      "adjacency",
      "constellations",
    ]),
    unresolved: list(referenceRun.unresolved),
    contributions: list(referenceRun.contributions),
  };
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function buildManifest({ inputs, songs, references, associations, generatedAt, inputDigest }) {
  const telemetry = songs.map(songTelemetry);
  const lyrics = songs.map(lyricsRecord);
  const songIds = new Set(songs.map((song) => song.id));
  const referenceIds = new Set(references.map((reference) => reference.id));
  const danglingSongNodes = new Set();
  const danglingReferenceNodes = new Set();
  for (const association of associations) {
    for (const node of [association.from, association.to]) {
      if (node.kind === "song" && !songIds.has(node.id)) danglingSongNodes.add(node.id);
      if (node.kind === "reference" && !referenceIds.has(referenceIdentity(node.id))) {
        danglingReferenceNodes.add(referenceIdentity(node.id));
      }
    }
  }
  return {
    schemaVersion: ECHO_MASTER_REFERENCE_SCHEMA,
    exportId: `echo-master-reference:${inputDigest.replace(":", "-")}`,
    generatedAt,
    sourceUpdatedAt: sourceUpdatedAt(inputs),
    inputDigest,
    album: {
      canonicalId: text(inputs.songStore?.album?.id || inputs.songbook?.album?.id, "dear-papa-album"),
      canonicalTitle: text(inputs.songStore?.album?.title || inputs.songbook?.album?.title, "Dear Papa"),
      projectionTitle: text(inputs.songStore?.album?.activeProjection?.title, "Echo Album"),
      aliases: list(inputs.songStore?.album?.aliases || inputs.songbook?.album?.aliases),
    },
    counts: {
      songs: songs.length,
      songsWithLyrics: lyrics.filter((record) => text(record.text)).length,
      lyricCharacters: lyrics.reduce((total, record) => total + String(record.text || "").length, 0),
      curatedReferenceRecords: list(inputs.songStore?.referenceCatalog).length,
      atlasReferenceCards: list(inputs.referenceRun?.cards).length,
      uniqueReferences: references.length,
      songReferenceConnectors: associations.filter((row) => row.source === "song-connector").length,
      curatedReferenceEdges: associations.filter((row) => row.source === "curated-reference-graph").length,
      atlasGraphEdges: associations.filter((row) => row.source === "reference-atlas").length,
      totalAssociations: associations.length,
      sectionTelemetryRows: telemetry.reduce((total, row) => total + row.sections.length, 0),
      beatTelemetryRows: telemetry.reduce((total, row) => total + row.beats.length, 0),
      vocalDensityRows: telemetry.reduce((total, row) => total + row.vocalDensity.length, 0),
      stemRecords: telemetry.reduce((total, row) => total + row.stems.length, 0),
    },
    authority: {
      purpose: "local wiki ingestion and attributable reference traversal",
      changesSourceStores: false,
      impliesPublication: false,
      impliesCanon: false,
      impliesMint: false,
      reviewBeforeExternalPublication: true,
    },
    associationIntegrity: {
      danglingSongNodes: [...danglingSongNodes].sort(),
      danglingReferenceNodes: [...danglingReferenceNodes].sort(),
      allInternalLinksResolved: danglingSongNodes.size === 0 && danglingReferenceNodes.size === 0,
    },
  };
}

export function buildEchoAlbumMasterReference(inputs = {}, options = {}) {
  const normalizedInputs = {
    songbook: object(inputs.songbook),
    songStore: object(inputs.songStore),
    referenceRun: object(inputs.referenceRun),
    observability: object(inputs.observability),
  };
  const generatedAt = text(options.generatedAt, new Date().toISOString());
  const inputDigest = echoMasterReferenceDigest(normalizedInputs);
  const songs = mergeSongs(normalizedInputs.songbook, normalizedInputs.songStore);
  const references = referenceRecords(normalizedInputs.songStore, normalizedInputs.referenceRun);
  const associations = associationRecords(normalizedInputs.songStore, normalizedInputs.referenceRun);
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const referencesById = new Map(references.map((reference) => [reference.id, reference]));
  const associationsBySong = new Map(songs.map((song) => [song.id, []]));
  const associationsByReference = new Map(references.map((reference) => [reference.id, []]));

  for (const association of associations) {
    for (const node of [association.from, association.to]) {
      if (node.kind === "song" && associationsBySong.has(node.id)) associationsBySong.get(node.id).push(association);
      if (node.kind === "reference") {
        const id = referenceIdentity(node.id);
        if (!associationsByReference.has(id)) associationsByReference.set(id, []);
        associationsByReference.get(id).push(association);
      }
    }
  }

  const manifest = buildManifest({
    inputs: normalizedInputs,
    songs,
    references,
    associations,
    generatedAt,
    inputDigest,
  });
  const lines = [
    "---",
    `schema_version: ${yamlString(ECHO_MASTER_REFERENCE_SCHEMA)}`,
    `title: ${yamlString("Echo Album — Master Reference File")}`,
    `export_id: ${yamlString(manifest.exportId)}`,
    `generated_at: ${yamlString(generatedAt)}`,
    `source_updated_at: ${yamlString(manifest.sourceUpdatedAt)}`,
    `input_digest: ${yamlString(inputDigest)}`,
    `song_count: ${manifest.counts.songs}`,
    `reference_count: ${manifest.counts.uniqueReferences}`,
    `association_count: ${manifest.counts.totalAssociations}`,
    "tags:",
    "  - echo-album",
    "  - master-reference",
    "  - hapa-avatar-builder",
    "  - wiki-source",
    "---",
    "",
    '<a id="echo-album-master-reference"></a>',
    "# Echo Album — Master Reference File",
    "",
    "> A read-only snapshot exported by Hapa Avatar Builder. It combines the Dear Papa source identity with its Echo Album projection; the export does not publish, mint, approve, or canonize any record.",
    "",
    "This file is deliberately self-contained for wiki ingestion. It may contain local workstation paths and context whose records are still pending review; review the authority, rights, and privacy fields before external publication.",
    "",
    "## Wiki link contract",
    "",
    "- Track nodes use explicit HTML anchors such as `#song-<stable-id>`.",
    "- Reference nodes use `#reference-<stable-id>`.",
    "- Association rows use `#association-<source>-<stable-id>-<ordinal>`.",
    "- Human-facing links and stable Hapa IDs appear together so a wiki importer can split this file without losing identity.",
    "",
    "## Export manifest",
    "",
    fenced(manifest, "json"),
    "",
    "## Album metadata",
    "",
    fenced({
      songbook: without(normalizedInputs.songbook, ["songCards"]),
      builder: without(normalizedInputs.songStore, [
        "songs",
        "referenceCatalog",
        "referenceGraphEdges",
      ]),
    }, "json"),
    "",
    '<a id="album-track-index"></a>',
    "## Album track index",
    "",
    "| # | Track | Stable ID | Lyrics | References |",
    "| ---: | --- | --- | ---: | ---: |",
  ];

  songs.forEach((song, index) => {
    lines.push(`| ${song.songbook?.trackNumber || song.builder?.trackNumber || index + 1} | [${markdownCell(song.title)}](#${songAnchor(song.id)}) | ${inlineCode(song.id)} | ${text(lyricsRecord(song).text) ? "yes" : "no"} | ${associationsBySong.get(song.id)?.length || 0} |`);
  });

  for (const [index, song] of songs.entries()) {
    const lyrics = lyricsRecord(song);
    const songAssociations = associationsBySong.get(song.id) || [];
    lines.push(
      "",
      `<a id="${songAnchor(song.id)}"></a>`,
      `## ${index + 1}. ${song.title}`,
      "",
      `[Album index](#album-track-index) · Stable ID ${inlineCode(song.id)} · Hapa URI ${inlineCode(`hapa://echo-album/songs/${encodeURIComponent(song.id)}`)}`,
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Track number | ${song.songbook?.trackNumber || song.builder?.trackNumber || index + 1} |`,
      `| Album | ${markdownCell(song.songbook?.albumTitle || song.builder?.albumTitle || manifest.album.canonicalTitle)} |`,
      `| Projection | ${markdownCell(manifest.album.projectionTitle)} |`,
      `| Author | ${markdownCell(song.songbook?.author || song.builder?.author || song.builder?.attribution?.author || "")} |`,
      `| Performance perspective | ${markdownCell(song.songbook?.performancePerspective || song.builder?.performancePerspective || "")} |`,
      `| Lyric status | ${markdownCell(lyrics.status || "unclassified")} |`,
      `| Lyrics SHA-256 | ${inlineCode(lyrics.sha256 || song.songbook?.lineage?.lyricsSha256 || "")} |`,
      "",
      "### Lyrics",
      "",
      fenced(String(lyrics.text || ""), "text"),
      "",
      "### Lyric provenance",
      "",
      fenced(without(lyrics, ["text"]), "json"),
      "",
      "### Reference associations",
      ""
    );
    if (!songAssociations.length) {
      lines.push("_No reference associations are recorded for this track._");
    } else {
      for (const association of songAssociations) {
        const other = association.from.kind === "song" && association.from.id === song.id
          ? association.to
          : association.from;
        lines.push(`- [${markdownCell(association.relationType)}](#${association.anchor}) → ${nodeLink(other, songsById, referencesById)} · ${markdownCell(association.status || "status-unset")} · confidence ${markdownCell(association.confidence === "" ? "unset" : association.confidence)}`);
      }
    }
    lines.push(
      "",
      "### Context layers",
      "",
      fenced(list(song.builder?.contextualLayers), "json"),
      "",
      "### Telemetry",
      "",
      fenced(songTelemetry(song), "json"),
      "",
      "### Complete song metadata",
      "",
      fenced(songMetadata(song), "json"),
      ""
    );
  }

  lines.push(
    '<a id="reference-catalog"></a>',
    "## Reference catalog",
    "",
    "Curated catalog records and live Reference Atlas cards are grouped by stable reference identity. Review and canon status are preserved exactly as recorded.",
    ""
  );
  for (const reference of references) {
    const related = associationsByReference.get(reference.id) || [];
    const relatedSongs = [...new Map(related.flatMap((association) => [association.from, association.to])
      .filter((node) => node.kind === "song" && songsById.has(node.id))
      .map((node) => [node.id, songsById.get(node.id)])).values()];
    lines.push(
      `<a id="${referenceAnchor(reference.id)}"></a>`,
      `### ${reference.title}`,
      "",
      `[Reference index](#reference-catalog) · Stable ID ${inlineCode(reference.id)} · Hapa URI ${inlineCode(`hapa://echo-album/references/${encodeURIComponent(reference.id)}`)}`,
      ""
    );
    if (relatedSongs.length) {
      lines.push(`**Linked tracks:** ${relatedSongs.map((song) => `[${song.title}](#${songAnchor(song.id)})`).join(" · ")}`, "");
    }
    lines.push(
      fenced({
        curatedCatalogRecord: reference.catalog,
        referenceAtlasCard: reference.atlas,
      }, "json"),
      ""
    );
  }

  lines.push(
    '<a id="reference-association-graph"></a>',
    "## Reference association graph",
    "",
    "The index below is the navigable graph projection. The complete source records follow it as JSON so no association metadata is discarded.",
    "",
    "| Source | From | Relation | To | Status | Confidence |",
    "| --- | --- | --- | --- | --- | ---: |"
  );
  for (const association of associations) {
    lines.push(
      `| <a id="${association.anchor}"></a>${markdownCell(association.source)} | ${nodeLink(association.from, songsById, referencesById)} | ${markdownCell(association.relationType)} | ${nodeLink(association.to, songsById, referencesById)} | ${markdownCell(association.status || "unset")} | ${markdownCell(association.confidence === "" ? "unset" : association.confidence)} |`
    );
  }
  lines.push(
    "",
    "### Complete association records",
    "",
    fenced(associations.map((association) => ({
      anchor: association.anchor,
      source: association.source,
      from: association.from,
      to: association.to,
      record: association.record,
    })), "json"),
    "",
    "## Reference Atlas run metadata",
    "",
    fenced(referenceRunMetadata(normalizedInputs.referenceRun), "json"),
    "",
    "## Telemetry and observability",
    "",
    fenced(normalizedInputs.observability, "json"),
    "",
    "## Source inventory",
    "",
    "| Logical source | Schema | Records |",
    "| --- | --- | ---: |",
    `| Dear Papa songbook | ${inlineCode(normalizedInputs.songbook.schemaVersion || "unknown")} | ${list(normalizedInputs.songbook.songCards).length} songs |`,
    `| Builder song store | ${inlineCode(normalizedInputs.songStore.schemaVersion || "unknown")} | ${list(normalizedInputs.songStore.songs).length} songs |`,
    `| Reference Atlas run | ${inlineCode(normalizedInputs.referenceRun.schemaVersion || "unknown")} | ${list(normalizedInputs.referenceRun.cards).length} cards |`,
    `| Reference graph | ${inlineCode(normalizedInputs.referenceRun.graph?.schemaVersion || "unknown")} | ${list(normalizedInputs.referenceRun.graph?.edges).length} edges |`,
    "",
    `End of export ${inlineCode(manifest.exportId)}.`,
    ""
  );

  return {
    schemaVersion: ECHO_MASTER_REFERENCE_SCHEMA,
    markdown: lines.join("\n"),
    manifest,
  };
}
