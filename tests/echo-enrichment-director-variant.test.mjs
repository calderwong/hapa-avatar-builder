import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
  buildEchoVideoEnrichmentCatalog,
  compileEchoEnrichmentDirectorVariant,
  deriveEchoEnrichmentParentProject,
  echoShotDirectionContractSnapshot,
  normalizeEchoVideoEnrichmentRow,
  selectLatestEnrichmentParentVariant,
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";
import { runEnrichmentDirectorVariantPass } from "../scripts/append-enrichment-director-variants.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseProject(songId = "song-fixture") {
  return {
    song_id: songId,
    song_title: "Fixture Song",
    duration: 8,
    audio_uri: "/media/audio.mp3",
    stems_available: ["Vocals", "Drums"],
    lyrics_enabled: true,
    timed_lyrics: [
      { id: "lyric-1", start: 0, end: 4, text: "Moon door carries the letter" },
      { id: "lyric-2", start: 4, end: 8, text: "River sail returns us home" },
    ],
    persistent_shader_slots: [{ id: "always-1", enabled: true, shader_id: "UltimateFlame", track_id: "main" }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 8, visualizer_id: "simple-wave", transition: "cut" }],
    timeline: [
      {
        section_id: "verse-1",
        section_label: "Verse 1",
        section_type: "verse",
        shot_index: 0,
        start_sec: 0,
        end_sec: 4,
        transition: "fade-in",
        camera_motion: "pan-down",
        camera_intensity: 1.2,
        camera_speed: 1.4,
        camera_focus: "center",
        active_stems: ["Vocals"],
        audio_bindings: [{ source: "vocals_stem_energy", target: "vibe_intensity", curve: "linear" }],
        shader_cue: { id: "flame-a", mix: 0.8 },
        media_id: "parent-a",
        media_title: "Parent A",
        media_uri: "/media/parent-a.mp4",
        runtime_media_uri: "/media/parent-a.mp4",
        media_source_group: "unknown",
        media_technical_identity: "sha256:a".padEnd(71, "a"),
        media_contract: {
          schemaVersion: "hapa.echo.playback-media.v2",
          type: "video",
          originalUri: "/media/parent-a.mp4",
          runtimeUri: "/media/parent-a.mp4",
          playbackMode: "loop",
        },
      },
      {
        section_id: "verse-2",
        section_label: "Verse 2",
        section_type: "verse",
        shot_index: 1,
        start_sec: 4,
        end_sec: 8,
        transition: "crossfade",
        camera_motion: "pan-up",
        camera_intensity: 1.5,
        camera_speed: 1.8,
        camera_focus: "top-center",
        active_stems: ["Vocals", "Drums"],
        audio_bindings: [{ source: "drums_stem_energy", target: "cut_density", curve: "ease-out" }],
        shader_cue: { id: "flame-b", mix: 0.9 },
        media_id: "parent-b",
        media_title: "Parent B",
        media_uri: "/media/parent-b.mp4",
        runtime_media_uri: "/media/parent-b.mp4",
        media_source_group: "unknown",
        media_technical_identity: "sha256:b".padEnd(71, "b"),
        media_contract: {
          schemaVersion: "hapa.echo.playback-media.v2",
          type: "video",
          originalUri: "/media/parent-b.mp4",
          runtimeUri: "/media/parent-b.mp4",
          playbackMode: "loop",
        },
      },
    ],
  };
}

function parentVariant(project = baseProject()) {
  return {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "newest-modern-cut",
    title: "Newest Modern Cut",
    status: "ready",
    createdAt: "2026-07-31T12:00:00.000Z",
    updatedAt: "2026-07-31T12:00:00.000Z",
    parent: { songId: project.song_id, projectSha256: "f".repeat(64), immutableLegacyProject: true },
    timeline: clone(project.timeline),
    visualizer_timeline: clone(project.visualizer_timeline),
    persistent_shader_slots: clone(project.persistent_shader_slots),
    project_patch: {
      persistent_shader_slots: clone(project.persistent_shader_slots),
      lyrics_enabled: true,
    },
  };
}

function songCard(songId = "song-fixture") {
  return {
    id: songId,
    cardId: songId,
    title: "Fixture Song",
    lyricTimings: [
      { id: "lyric-1", start: 0, end: 4, text: "Moon door carries the letter" },
      { id: "lyric-2", start: 4, end: 8, text: "River sail returns us home" },
    ],
    storyBeats: [
      { id: "beat-door", summary: "Carry the family letter through the moon door." },
      { id: "beat-river", summary: "Sail the memory river toward home." },
    ],
    lore: { summary: "A family letter crosses a moonlit river.", mood: "luminous, protective, returning" },
    tags: ["moon", "letter", "river", "home"],
  };
}

function enrichmentRows() {
  return [
    {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId: `hapa-media:sha256:${"1".repeat(64)}`,
      contentHash: { algorithm: "sha256", value: "1".repeat(64) },
      title: "Moon Door Letter",
      runtimeUri: "/media/moon-door.mp4",
      mediaContract: {
        schemaVersion: "hapa.echo.playback-media.v2",
        type: "video",
        originalUri: "/media/moon-door.mp4",
        runtimeUri: "/media/moon-door.mp4",
        sourceInSeconds: 0.25,
        sourceOutSeconds: 5.75,
        playbackMode: "loop",
      },
      recognition: {
        synopsis: "A luminous moon door opens while a hand carries a family letter.",
        tags: [{ tag: "motif:moon" }, { tag: "object:letter" }],
      },
      quality: { score: 91 },
      provenance: [{ source: "operator-attachment", verifiedAttachment: true }],
    },
    {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId: `hapa-media:sha256:${"2".repeat(64)}`,
      contentHash: { algorithm: "sha256", value: "2".repeat(64) },
      title: "River Sail Home",
      runtimeUri: "/media/river-sail.mp4",
      recognition: { synopsis: "A vessel sails a memory river and returns home." },
      quality: { score: 88 },
      provenance: [{ source: "verified-source-file", verifiedSource: true }],
    },
    {
      schemaVersion: "hapa.echo.video-enrichment.v1",
      mediaId: `hapa-media:sha256:${"3".repeat(64)}`,
      contentHash: { algorithm: "sha256", value: "3".repeat(64) },
      title: "LTX Moon Door",
      runtimeUri: "/media/ltx-moon-door.mp4",
      recognition: { synopsis: "A perfect moon door carries the letter toward home." },
      quality: { score: 100 },
      provenance: [{ source: "LTX v2.3" }],
    },
  ];
}

function chainGraph() {
  return {
    schemaVersion: "hapa.echo.video-chain-graph.v1",
    candidates: [{
      sourceVideoId: `hapa-media:sha256:${"1".repeat(64)}`,
      targetVideoId: `hapa-media:sha256:${"2".repeat(64)}`,
      score: 0.93,
    }],
  };
}

test("normalizes the pipeline schema and applies the exact shared source-prior policy", () => {
  const [attachment, , ltx] = enrichmentRows().map(normalizeEchoVideoEnrichmentRow);
  assert.equal(attachment.uri, "/media/moon-door.mp4");
  assert.equal(attachment.technicalIdentity, `sha256:${"1".repeat(64)}`);
  assert.equal(attachment.qualityScore, 0.91);
  assert.equal(attachment.sourcePrior, 1.1);
  assert.equal(ltx.sourcePrior, 0.15);
  assert.equal(ltx.lowPrior, true);
  assert.ok(attachment.semanticText.some((entry) => /moon door/i.test(entry)));
});

test("Director semantics use confidence-gated labels and retain raw recognition labels as evidence only", () => {
  const row = {
    ...enrichmentRows()[0],
    recognition: {
      synopsis: "A luminous moon door opens.",
      frames: [{
        marker: "first",
        labels: [{ identifier: "raw-noise-never-score", confidence: 0.001 }],
      }],
      tags: ["vision:moon-door"],
    },
    semantic: {
      labels: [{ identifier: "raw-noise-never-score", confidence: 0.001 }],
      confidentLabels: [{ identifier: "moon_door", confidence: 0.8 }],
      provisionalLabels: [{ identifier: "provisional-noise-never-score", confidence: 0.01 }],
    },
  };
  const normalized = normalizeEchoVideoEnrichmentRow(row);
  assert.match(normalized.observedVisualText.join(" "), /moon door/iu);
  assert.doesNotMatch(normalized.observedVisualText.join(" "), /raw-noise|provisional-noise/iu);
  assert.doesNotMatch(normalized.semanticText.join(" "), /raw-noise|provisional-noise/iu);
});

test("selects the latest ready non-legacy parent but excludes this compiler's own replay output", () => {
  const project = baseProject();
  const selected = selectLatestEnrichmentParentVariant([
    { ...parentVariant(project), id: "Legacy Baseline", updatedAt: "2027-01-01T00:00:00.000Z" },
    { ...parentVariant(project), id: "older-modern", updatedAt: "2026-07-30T00:00:00.000Z" },
    parentVariant(project),
    {
      ...parentVariant(project),
      id: "intentional-enrichment-already-generated",
      updatedAt: "2026-08-01T00:00:00.000Z",
      lineage: { kind: "append-only-intentional-enrichment" },
    },
  ]);
  assert.equal(selected.id, "newest-modern-cut");
});

test("builds one deterministic intentional cut and preserves every inherited direction/runtime contract", () => {
  const project = baseProject();
  const parent = parentVariant(project);
  const parentBefore = clone(parent);
  const projectBefore = clone(project);
  const catalog = buildEchoVideoEnrichmentCatalog({
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const moonId = enrichmentRows()[0].mediaId;
  const riverId = enrichmentRows()[1].mediaId;
  assert.equal(catalog.affinity([moonId], [riverId]), 0.93);
  assert.equal(catalog.affinity([riverId], [moonId]), 0, "directed last-to-first evidence was incorrectly reversed");
  assert.ok(catalog.neighborKeys([moonId]).includes(riverId));
  const input = {
    song: songCard(),
    baseProject: project,
    parentVariant: parent,
    parentProjectSha256: "f".repeat(64),
    catalog,
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  };
  const first = compileEchoEnrichmentDirectorVariant(input);
  const second = compileEchoEnrichmentDirectorVariant(input);
  assert.deepEqual(first, second);
  assert.deepEqual(project, projectBefore);
  assert.deepEqual(parent, parentBefore);
  assert.match(first.id, /^intentional-enrichment-[a-f0-9]{12}-[a-f0-9]{16}$/u);
  assert.equal(first.status, "ready");
  assert.equal(first.parent.variantId, parent.id);
  assert.equal(first.validation.ok, true);
  assert.ok(first.hyperframe_script.includes("/media/moon-door.mp4"));
  assert.deepEqual(first.visualizer_timeline, project.visualizer_timeline);
  assert.deepEqual(first.persistent_shader_slots, project.persistent_shader_slots);

  const inherited = deriveEchoEnrichmentParentProject(project, parent);
  for (const [index, shot] of first.timeline.entries()) {
    assert.equal(
      stableEchoEnrichmentStringify(echoShotDirectionContractSnapshot(shot)),
      stableEchoEnrichmentStringify(echoShotDirectionContractSnapshot(inherited.timeline[index])),
    );
    assert.equal(shot.decision_evidence.schemaVersion, ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA);
    assert.ok(shot.decision_evidence.selectedMediaId);
    assert.ok(shot.decision_evidence.enrichmentId);
    assert.ok(shot.decision_evidence.lyricCitation);
    assert.equal(shot.decision_evidence.explicitLyricsUnavailable, false);
    assert.ok(shot.decision_evidence.story.ids.length);
    assert.equal(shot.decision_evidence.story.status, "canonical-story-beat-match");
    assert.equal(shot.decision_evidence.story.authority, "human-canonical");
    assert.ok(shot.decision_evidence.story.overlapTokens.length >= 2);
    assert.equal(shot.decision_evidence.lore.status, "canonical-song-lore");
    assert.ok(Array.isArray(shot.decision_evidence.candidateAlternatives));
    assert.match(shot.decision_evidence.rationale, new RegExp(shot.decision_evidence.selectedCandidate.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"));
    assert.doesNotMatch(shot.decision_evidence.rationale, /stable visual continuity/iu);
    for (const field of ["lyricAffinity", "canonAffinity", "objectActionAffinity", "emotionAffinity"]) {
      assert.equal(typeof shot.decision_evidence.selectedCandidate.score[field], "number");
    }
    assert.ok(shot.decision_evidence.candidateAlternatives.every((candidate) => /score .*delta/iu.test(candidate.rejectionReason)));
    assert.equal(shot.decision_evidence.preservedDirection.runtimeMediaContract, true);
    assert.notEqual(shot.media_uri, "/media/ltx-moon-door.mp4", "low-prior LTX unexpectedly outranked verified media");
  }
  assert.deepEqual(first.timeline[0].media_contract, enrichmentRows()[0].mediaContract);
  assert.equal(first.timeline[0].decision_evidence.neighborContinuity.previous, null);
  assert.equal(first.timeline[0].decision_evidence.sourceBiasCounterfactual.schemaVersion, "hapa.echo.source-bias-counterfactual.v1");
  assert.equal(first.timeline[0].decision_evidence.sourceBiasCounterfactual.evaluatedCandidateCount, enrichmentRows().length);
  assert.ok(first.timeline[0].decision_evidence.sourceBiasCounterfactual.selectedCandidate.mediaId);
  assert.ok(first.timeline[0].decision_evidence.neighborContinuity.next);
  assert.ok(first.timeline[1].decision_evidence.neighborContinuity.previous);
});

test("final selection rewards lyric, canon, object-action, and emotion evidence instead of quality alone", () => {
  const project = baseProject("song-semantic-selection");
  project.duration = 4;
  project.timeline = project.timeline.slice(0, 1);
  project.timed_lyrics = project.timed_lyrics.slice(0, 1);
  const semanticId = `hapa-media:sha256:${"5".repeat(64)}`;
  const genericId = `hapa-media:sha256:${"6".repeat(64)}`;
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-semantic-selection"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "5".repeat(64),
    enrichments: [
      {
        schemaVersion: "hapa.echo.video-enrichment.v1",
        mediaId: semanticId,
        contentHash: { algorithm: "sha256", value: "5".repeat(64) },
        title: "Luminous Letter at the Moon Door",
        runtimeUri: "/media/semantic-moon-letter.mp4",
        recognition: {
          synopsis: "A luminous hand carries a family letter through a moon door in a protective homecoming ritual.",
        },
        quality: { score: 72 },
        provenance: [{ source: "verified-source-file", verifiedSource: true }],
      },
      {
        schemaVersion: "hapa.echo.video-enrichment.v1",
        mediaId: genericId,
        contentHash: { algorithm: "sha256", value: "6".repeat(64) },
        title: "Pristine Abstract Geometry",
        runtimeUri: "/media/pristine-generic.mp4",
        recognition: { synopsis: "Immaculate abstract chrome geometry rotates against a neutral studio background." },
        quality: { score: 100 },
        provenance: [{ source: "verified-source-file", verifiedSource: true }],
      },
    ],
    chainGraph: { schemaVersion: "hapa.echo.video-chain-graph.v1", candidates: [] },
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const selected = variant.timeline[0].decision_evidence.selectedCandidate;
  assert.equal(selected.mediaId, semanticId);
  assert.ok(selected.score.lyricAffinity > 0);
  assert.ok(selected.score.canonAffinity > 0);
  assert.ok(selected.score.objectActionAffinity > 0);
  assert.ok(selected.score.emotionAffinity > 0);
});

test("records explicit lyrics-unavailable evidence instead of inventing an instrumental claim", () => {
  const project = baseProject("song-no-lyrics");
  delete project.timed_lyrics;
  const parent = parentVariant(project);
  const variant = compileEchoEnrichmentDirectorVariant({
    song: { ...songCard("song-no-lyrics"), lyricTimings: [], lyrics: null },
    baseProject: project,
    parentVariant: parent,
    parentProjectSha256: "e".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  for (const shot of variant.timeline) {
    assert.equal(shot.decision_evidence.lyricCitation, null);
    assert.equal(shot.decision_evidence.explicitLyricsUnavailable, true);
    assert.equal(shot.decision_evidence.lyrics.status, "lyrics-unavailable");
    assert.doesNotMatch(JSON.stringify(shot.decision_evidence), /instrumental/iu);
  }
});

test("does not claim a canonical story beat when measured contextual affinity is below threshold", () => {
  const project = baseProject("song-unmatched-story");
  const variant = compileEchoEnrichmentDirectorVariant({
    song: {
      ...songCard("song-unmatched-story"),
      storyBeats: [{ id: "unrelated-protocol", summary: "Taxonomy governance synchronizes cryptographic registry schemas." }],
    },
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "c".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  for (const shot of variant.timeline) {
    assert.equal(shot.decision_evidence.story.status, "canonical-story-beats-context-unmatched");
    assert.deepEqual(shot.decision_evidence.story.ids, []);
    assert.equal(shot.decision_evidence.story.summary, "");
    assert.doesNotMatch(shot.edit_reason, /supports story beat/iu);
    assert.doesNotMatch(JSON.stringify(shot.decision_evidence.selectedCandidate), /cryptographic registry/iu);
  }
});

test("keeps a high-overlap Lorekeeper association explicitly soft-canon and body-only", () => {
  const project = baseProject("song-soft-story");
  const body = "Moon door carries the family letter toward home.";
  const variant = compileEchoEnrichmentDirectorVariant({
    song: {
      ...songCard("song-soft-story"),
      storyBeats: [{
        id: "node-card-protocol-secret-id",
        authorType: "lorekeeper-agent",
        authorName: "Hapa Lorekeeper",
        beatType: "kit-combination",
        body,
        tags: ["soft-canon", "kit-combination"],
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    },
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "a".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  const evidence = variant.timeline[0].decision_evidence.story;
  assert.equal(evidence.status, "soft-canon-association-match");
  assert.equal(evidence.softCanon, true);
  assert.equal(evidence.summary, body);
  assert.doesNotMatch(evidence.summary, /protocol-secret-id|Hapa Lorekeeper|2026-/iu);
  assert.match(variant.timeline[0].decision_evidence.rationale, /without treating it as canonical/iu);
});

test("does not describe a nearest lyric line as temporally aligned", () => {
  const project = baseProject("song-distant-lyrics");
  project.timed_lyrics = [{ id: "future-line", start: 100, end: 104, text: "Future river returns home" }];
  const variant = compileEchoEnrichmentDirectorVariant({
    song: { ...songCard("song-distant-lyrics"), lyricTimings: [] },
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "9".repeat(64),
    enrichments: enrichmentRows(),
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  for (const shot of variant.timeline) {
    assert.equal(shot.decision_evidence.lyrics.status, "distant-line-context");
    assert.ok(shot.decision_evidence.lyrics.distanceSeconds > 2);
    assert.match(shot.decision_evidence.rationale, /without claiming overlap/iu);
    assert.doesNotMatch(shot.decision_evidence.rationale, /aligns with (?:timed )?lyric/iu);
  }
});

test("excludes enrichment rows whose source video failed decoding from the candidate pool", () => {
  const project = baseProject("song-corrupt-source");
  const corrupt = {
    ...enrichmentRows()[0],
    mediaId: `hapa-media:sha256:${"9".repeat(64)}`,
    id: `hapa-media:sha256:${"9".repeat(64)}`,
    contentHash: { algorithm: "sha256", value: "9".repeat(64) },
    runtimeUri: "/media/corrupt.mp4",
    playable: false,
    decodeStatus: "decode-failed",
    recognition: { synopsis: "Moon door carries the letter with perfect semantic affinity." },
    quality: { score: 100 },
  };
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-corrupt-source"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "b".repeat(64),
    enrichments: [corrupt, ...enrichmentRows()],
    chainGraph: chainGraph(),
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  assert.ok(variant.timeline.every((shot) => shot.media_uri !== "/media/corrupt.mp4"));
  assert.equal(variant.telemetry.enrichmentRowsWithPlayableUri, enrichmentRows().length);
});

test("fails before returning a variant when parent media has no playable catalog enrichment", () => {
  const project = baseProject("song-parent-media-unenriched");
  const quarantinedParent = {
    ...enrichmentRows()[0],
    id: `hapa-media:sha256:${"9".repeat(64)}`,
    mediaId: `hapa-media:sha256:${"9".repeat(64)}`,
    contentHash: { algorithm: "sha256", value: "9".repeat(64) },
    runtimeUri: project.timeline[0].media_uri,
    playable: false,
    decodeStatus: "decode-failed",
  };

  assert.throws(
    () => compileEchoEnrichmentDirectorVariant({
      song: songCard("song-parent-media-unenriched"),
      baseProject: project,
      parentVariant: parentVariant(project),
      parentProjectSha256: "d".repeat(64),
      enrichments: [quarantinedParent],
      chainGraph: { edges: [] },
      report: { generatedAt: "2026-08-01T00:00:00.000Z" },
    }),
    /no playable parent or enrichment media candidates/iu,
  );
});

test("canonicalizes legacy aliases that point at the same runtime video", () => {
  const project = baseProject("song-aliases");
  for (const [index, shot] of project.timeline.entries()) {
    shot.media_id = `legacy-card-${index}`;
    shot.media_uri = "/media/shared-runtime.mp4";
    shot.runtime_media_uri = "/media/shared-runtime.mp4";
    shot.media_technical_identity = `uri:/legacy/source-${index}.mp4`;
    shot.media_contract = {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "video",
      originalUri: "/media/shared-runtime.mp4",
      runtimeUri: "/media/shared-runtime.mp4",
      playbackMode: "loop",
    };
  }
  const canonicalId = `hapa-media:sha256:${"4".repeat(64)}`;
  const rows = [{
    schemaVersion: "hapa.echo.video-enrichment.v1",
    id: canonicalId,
    mediaId: canonicalId,
    contentHash: { algorithm: "sha256", value: "4".repeat(64) },
    title: "Canonical Shared Runtime",
    runtimeUri: "/media/shared-runtime.mp4",
    recognition: { synopsis: "A moonlit river carries a letter home." },
    quality: { score: 90 },
    provenance: [{ source: "verified-source-file", verifiedSource: true }],
  }];
  const variant = compileEchoEnrichmentDirectorVariant({
    song: songCard("song-aliases"),
    baseProject: project,
    parentVariant: parentVariant(project),
    parentProjectSha256: "d".repeat(64),
    enrichments: rows,
    report: { generatedAt: "2026-08-01T00:00:00.000Z" },
  });
  assert.deepEqual(new Set(variant.timeline.map((shot) => shot.media_id)), new Set([canonicalId]));
  assert.deepEqual(new Set(variant.timeline.map((shot) => shot.media_technical_identity)), new Set([`sha256:${"4".repeat(64)}`]));
  assert.deepEqual(new Set(variant.timeline.map((shot) => shot.decision_evidence.enrichmentId)), new Set([canonicalId]));
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

test("CLI dry-run is write-free; apply is exclusive, replay-safe, immutable, and rebuilds exact index parity", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "echo-enrichment-director-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = path.join(root, "artifacts");
  const projectsDirectory = path.join(root, "projects");
  const variantsDirectory = path.join(root, "variants");
  const project = baseProject();
  const parent = parentVariant(project);
  const projectPath = path.join(projectsDirectory, "song-fixture-video-project.json");
  const parentPath = path.join(variantsDirectory, project.song_id, `${parent.id}.json`);
  const indexPath = path.join(variantsDirectory, "index.json");
  const reportPath = path.join(root, "output", "report.json");
  const backupsDirectory = path.join(root, "backups");
  const enrichmentsPath = path.join(artifacts, "enrichments.ndjson");
  const chainGraphPath = path.join(artifacts, "chain-graph.json");
  const enrichmentReportPath = path.join(artifacts, "report.json");
  const songsPath = path.join(root, "songs.json");
  await writeJson(projectPath, { music_video_project: project });
  await writeJson(parentPath, parent);
  await writeJson(indexPath, {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [{
      id: `${project.song_id}:${parent.id}`,
      songId: project.song_id,
      variantId: parent.id,
      title: parent.title,
      relativePath: `${project.song_id}/${parent.id}.json`,
      status: "ready",
      timelineCount: parent.timeline.length,
      updatedAt: parent.updatedAt,
    }],
  });
  await writeJson(songsPath, { songs: [songCard()] });
  await mkdir(artifacts, { recursive: true });
  await writeFile(enrichmentsPath, `${enrichmentRows().map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  await writeJson(chainGraphPath, chainGraph());
  const fixtureCatalog = buildEchoVideoEnrichmentCatalog({ enrichments: enrichmentRows(), chainGraph: chainGraph(), report: {} });
  await writeJson(enrichmentReportPath, {
    schemaVersion: "hapa.echo.video-enrichment-report.v1",
    generatedAt: "2026-08-01T00:00:00.000Z",
    complete: true,
    batchFingerprint: `sha256:${fixtureCatalog.computedFingerprint}`,
    counts: {
      manifestVideos: enrichmentRows().length,
      enrichmentRows: enrichmentRows().length,
      chainEdges: fixtureCatalog.edges.length,
    },
  });
  const options = {
    apply: false,
    songId: "",
    expectedSongCount: 1,
    enrichmentsPath,
    chainGraphPath,
    enrichmentReportPath,
    songsPath,
    projectsDirectory,
    variantsDirectory,
    indexPath,
    reportPath,
    backupsDirectory,
  };
  const projectHashBefore = await fileHash(projectPath);
  const parentHashBefore = await fileHash(parentPath);
  const indexHashBefore = await fileHash(indexPath);
  const dryRun = await runEnrichmentDirectorVariantPass(options);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.variants.generated, 1);
  assert.equal(dryRun.variants.newFiles, 1);
  assert.equal(await fileHash(indexPath), indexHashBefore);
  await assert.rejects(stat(reportPath), { code: "ENOENT" });
  const generatedId = dryRun.variants.cuts[0].variantId;
  const generatedPath = path.join(variantsDirectory, project.song_id, `${generatedId}.json`);
  await assert.rejects(stat(generatedPath), { code: "ENOENT" });

  const applied = await runEnrichmentDirectorVariantPass({ ...options, apply: true });
  assert.equal(applied.mode, "apply");
  assert.equal(applied.variants.newFiles, 1);
  assert.equal(applied.validation.indexMatchesDiskAfterApply, true);
  assert.equal(await fileHash(projectPath), projectHashBefore);
  assert.equal(await fileHash(parentPath), parentHashBefore);
  const generatedHash = await fileHash(generatedPath);
  const persistedIndex = JSON.parse(await readFile(indexPath, "utf8"));
  assert.deepEqual(
    persistedIndex.variants.map((row) => row.id).sort(),
    [`${project.song_id}:${parent.id}`, `${project.song_id}:${generatedId}`].sort(),
  );

  const replay = await runEnrichmentDirectorVariantPass({ ...options, apply: true });
  assert.equal(replay.variants.newFiles, 0);
  assert.equal(replay.variants.existingIdentical, 1);
  assert.equal(await fileHash(generatedPath), generatedHash);
  assert.equal(await fileHash(projectPath), projectHashBefore);
  assert.equal(await fileHash(parentPath), parentHashBefore);

  const conflicted = JSON.parse(await readFile(generatedPath, "utf8"));
  conflicted.contentSha256 = "0".repeat(64);
  await writeJson(generatedPath, conflicted);
  await assert.rejects(
    runEnrichmentDirectorVariantPass({ ...options, apply: true }),
    /append-only conflict/iu,
  );
});
