import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  ECHO_LYRIC_CONTRACT_SCHEMA,
  ECHO_LYRIC_TEMPLATES,
  attachEchoLyricContract,
  echoLyricOverlayLines,
  echoLyricSourceLines,
  normalizeEchoLyricContract,
} from "../src/domain/echo-lyric-contract.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { editorGraphMintFingerprint, projectToEditorGraph } from "../src/domain/multitrack-editor.js";
import {
  deriveEchoDirectionVariantProject,
  pickEchoDirectionVariantProjectPatch,
} from "../src/domain/echo-direction-variants.js";

function project(overrides = {}) {
  return {
    song_id: "lyric-contract-song",
    song_title: "Lyric Contract Song",
    duration: 4,
    timed_lyrics: [{
      text: "Show these words",
      start: 1,
      end: 3,
      words: [
        { word: "Show", start: 1, end: 1.5 },
        { word: "these", start: 1.5, end: 2 },
        { word: "words", start: 2, end: 3 },
      ],
    }],
    song_edit_map: {
      sections: [{ id: "all", type: "verse", label: "All", start: 0, end: 4 }],
      editPulses: [],
    },
    timeline: [{
      start_sec: 0,
      end_sec: 4,
      media_id: "none",
      media_uri: "",
      media_contract: { type: "generated-visualizer" },
    }],
    visualizer_timeline: [],
    ...overrides,
  };
}

test("legacy projects default lyrics on and normalize to one of five stable templates", () => {
  assert.equal(normalizeEchoLyricContract(null).enabled, true);
  const normalized = attachEchoLyricContract(project({ lyric_variant: "stacked-echo" }));
  assert.equal(normalized.lyrics.schemaVersion, ECHO_LYRIC_CONTRACT_SCHEMA);
  assert.equal(normalized.lyrics.enabled, true);
  assert.equal(normalized.lyrics.templateId, "stacked-hook-echo-v1");
  assert.equal(normalized.lyrics_enabled, true);
  assert.equal(ECHO_LYRIC_TEMPLATES.length, 5);
  assert.equal(ECHO_LYRIC_TEMPLATES.at(-1).id, "center-word-focus-v1");
  assert.equal(ECHO_LYRIC_TEMPLATES.at(-1).label, "Center Word Focus");
});

test("authoritative timing truth replaces stale synthetic display metadata", () => {
  const contract = normalizeEchoLyricContract(project({
    lyrics: { timingSource: "synthetic-weighted-lyric-heal", timingSourcePath: "", confidence: 0 },
    lyric_timing_truth: { source: "dear-papa-playlist-lyric-timing", sourcePath: "/timing/source.json", confidence: 0.91, activeTimingSha256: "truth-hash" },
    song_edit_map: { provenance: { lyricTimingSource: "whisper-cli", lyricTimingPath: "/timing/source.json" }, sections: [], editPulses: [] },
  }));
  assert.equal(contract.timingSource, "whisper-cli");
  assert.equal(contract.timingSourcePath, "/timing/source.json");
  assert.equal(contract.timingHash, "truth-hash");
  assert.equal(contract.confidence, 0.91);
});

test("turning lyrics off preserves source timing and template but emits no overlay", () => {
  const disabled = project({
    lyrics_enabled: false,
    lyrics: {
      enabled: false,
      templateId: "kinetic-word-burst-v1",
      timingHash: "timing-hash",
    },
  });
  assert.equal(echoLyricSourceLines(disabled).length, 1);
  assert.equal(echoLyricOverlayLines(disabled).length, 0);
  const contract = normalizeEchoLyricContract(disabled);
  assert.equal(contract.templateId, "kinetic-word-burst-v1");
  assert.equal(contract.timingHash, "timing-hash");

  const script = generateEchoHyperframeScript(disabled);
  assert.match(script, /window\.HAPA_LYRIC_CONTRACT/u);
  assert.match(script, /"enabled": false/u);
  assert.match(script, /"lines": \[\]/u);
  assert.doesNotMatch(script, /data-composition-id="hapa-lyric-layer"/u);
});

test("disabled lyric state reaches editor graph, Director graph, variant patches, and mint identity", () => {
  const enabled = project();
  const disabled = project({ lyrics_enabled: false, lyrics: { enabled: false, templateId: "scanline-phrase-ribbon-v1" } });
  const enabledGraph = projectToEditorGraph(enabled);
  const disabledGraph = projectToEditorGraph(disabled);
  assert.equal(enabledGraph.song.lyricOverlay.lines.length, 1);
  assert.equal(disabledGraph.song.lyricOverlay.enabled, false);
  assert.equal(disabledGraph.song.lyricOverlay.lines.length, 0);
  assert.notEqual(editorGraphMintFingerprint(enabledGraph), editorGraphMintFingerprint(disabledGraph));

  const artifacts = buildDirectorV2Artifacts({
    project: { music_video_project: disabled },
    manifest: { shaders: [] },
    duration: 4,
    recipe: "conservative",
    seed: "lyrics-disabled",
  });
  assert.equal(artifacts.showGraph.song.lyricOverlay.enabled, false);
  assert.equal(artifacts.showGraph.song.lyricOverlay.lines.length, 0);

  const patch = pickEchoDirectionVariantProjectPatch(disabled);
  assert.equal(patch.lyrics.enabled, false);
  assert.equal(patch.lyrics_enabled, false);
  const projected = deriveEchoDirectionVariantProject(enabled, { id: "lyrics-off", project_patch: patch });
  assert.equal(projected.lyrics.enabled, false);
  assert.equal(projected.lyrics_enabled, false);
});

test("Echo UI exposes an editable per-cut lyrics switch", () => {
  const source = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(source, /aria-label="Lyrics enabled"/u);
  assert.match(source, /data-testid="echo-lyrics-enabled"/u);
  assert.match(source, /aria-label="Lyric template"/u);
  assert.match(source, /data-testid="echo-lyric-template"/u);
  assert.match(source, /<EchoLyricOverlay/u);
  const overlay = fs.readFileSync("src/components/EchoLyricOverlay.jsx", "utf8");
  assert.match(overlay, /resolveEchoLyricTemplateFrame/u);
  assert.match(source, /aria-label="Reduce lyric motion"/u);
  assert.match(source, /lyrics_enabled: enabled/u);
  assert.match(source, /activeLyricContract\.enabled/u);
});
