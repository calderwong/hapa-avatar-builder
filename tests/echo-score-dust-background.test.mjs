import test from "node:test";
import assert from "node:assert/strict";
import { createWebmMuxer, readEbml, WEBM_IDS as ID } from "../src/domain/webm-muxer.js";
import { splitDustAlpha } from "../src/components/echo-score-dust-export.js";
import { normalizeDustBackground, validateDustBackground, dustBackgroundStops, dustColourStyle, teamColourHue, albumPaletteFor, normalizeDustColour } from "../src/domain/echo-score-dust-colour.js";
import { albumDustColour } from "../src/domain/echo-score-dust-album.js";
import { applyDustLook, extractDustLook, BUILTIN_DUST_LOOKS, validateDustLook } from "../src/domain/echo-score-dust-looks.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback, validateEchoScoreDirection, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const children = (bytes, el) => readEbml(bytes, el.dataAt, el.dataAt + el.size);

test("backgrounds normalise, validate, and follow the section palette", () => {
  assert.equal(normalizeDustBackground().kind, "black");
  assert.equal(dustBackgroundStops({ kind: "black" }), null, "black leaves the host backdrop alone");
  assert.deepEqual(dustBackgroundStops({ kind: "solid", colour: "#ff0000" }).inner, { r: 1, g: 0, b: 0 });
  const gradient = dustBackgroundStops({ kind: "gradient", colour: "#000000", colour2: "#ffffff", shape: "linear" });
  assert.equal(gradient.shape, "linear"); assert.equal(gradient.outer.b, 1);
  assert.equal(validateDustBackground({ kind: "gradient", colour: "#123456", shape: "radial" }), true);
  for (const bad of [{ kind: "plaid" }, { colour: "red" }, { shape: "diamond" }, { kind: "solid", glow: 1 }, []]) assert.equal(validateDustBackground(bad), false, JSON.stringify(bad));
  assert.ok(validateEchoScoreDirection({ background: { kind: "plaid" } }).errors.some((e) => e.code === "background"));
  const score = composeEchoVisualScore(timeline, { background: { kind: "palette" } }), playback = prepareEchoScorePlayback(score, timeline);
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true);
  assert.equal(score.background.kind, "palette");
  const at = (t) => dustBackgroundStops(score.background, dustColourStyle(playback, playback.stateAt(t), t)).inner;
  const a = at(score.cues[0].start + 3), b = at(score.cues[2].start + 3);
  assert.notDeepEqual(a, b, "the background changes with the section palette");
  assert.ok(Math.max(a.r, a.g, a.b) <= 0.2 + 1e-9, "darkened so the dust stays brightest");
});

const cards = [
  { id: "song-a", albumId: "dear-papa", trackNumber: 1, title: "A", performancePerspective: { teamColor: "Team Blue" } },
  { id: "song-b", albumId: "dear-papa", trackNumber: 2, title: "B", performancePerspective: { team_color: "violet" } },
  { id: "song-c", songId: "song-trip", albumId: "dear-papa", trackNumber: 3, title: "C", performancePerspective: {} },
  { id: "song-d", albumId: "dear-papa", trackNumber: 4, title: "D", performancePerspective: { teamColor: "#ff8800" } },
  { id: "song-e", albumId: "dear-papa", trackNumber: 5, title: "E", performancePerspective: { teamColor: "red" } },
  { id: "other", albumId: "elsewhere", trackNumber: 1, title: "X", performancePerspective: { teamColor: "green" } },
];

test("album colour comes from the Song's team colour and its phase on the album arc", () => {
  assert.equal(teamColourHue("Team Blue"), 220);
  assert.equal(teamColourHue("#ff8800"), 32);
  assert.equal(teamColourHue("plaid"), null);
  const first = albumDustColour(cards, "song-a"), last = albumDustColour(cards, "song-e");
  assert.deepEqual([first.phase, first.hue, first.position, first.of], ["threshold", 220, 1, 5]);
  assert.deepEqual([last.phase, last.hue], ["return", 0]);
  assert.ok(last.lightness > first.lightness && last.saturation < first.saturation, "the arc lightens and calms toward the return");
  assert.equal(albumDustColour(cards, "song-trip").teamColour, "violet", "matched by songId; unknown perspective falls back to the bible's violet");
  assert.equal(albumDustColour(cards, "missing"), null);
  const direction = { colour: { preset: "album", album: albumDustColour(cards, "song-b") } };
  assert.equal(validateEchoScoreDirection(direction).ok, true);
  const score = composeEchoVisualScore(timeline, direction);
  assert.deepEqual(score.palettes[`palette-${timeline.sections[0].repeatGroup}`], albumPaletteFor(direction.colour.album, 0));
  assert.equal(score.colour.album.phase, "descent");
  assert.equal(normalizeDustColour({ preset: "album" }).preset, null, "album without a spec composes as generated");
  assert.equal(validateEchoScoreDirection({ colour: { preset: "album", album: { hue: 400, saturation: 1, lightness: 1 } } }).ok, false);
});

test("looks carry backgrounds and keep album colour per Song", () => {
  const look = extractDustLook({ colour: { preset: "album", album: albumDustColour(cards, "song-a") }, background: { kind: "palette" } });
  assert.equal(look.colour.album, undefined);
  assert.equal(look.background.kind, "palette");
  assert.equal(validateDustLook({ name: "Mine", look }).ok, true);
  const applied = applyDustLook({ colour: { preset: "album", album: albumDustColour(cards, "song-e") } }, look);
  assert.equal(applied.colour.album, undefined, "the next Song resolves its own album colour");
  for (const row of BUILTIN_DUST_LOOKS) assert.equal(validateDustLook(row).ok, true, row.name);
});

test("transparent exports split light into straight alpha and colour", () => {
  const rgba = Uint8ClampedArray.of(0, 0, 0, 255, 255, 128, 0, 255, 64, 32, 0, 255, 10, 20, 40, 255);
  const { colour, alpha } = splitDustAlpha(rgba, 2, 2);
  assert.deepEqual([...alpha.subarray(0, 4)], [0, 255, 64, 40]);
  assert.ok([...alpha.subarray(4)].every((v) => v === 128), "chroma planes are neutral");
  assert.deepEqual([...colour.subarray(4, 8)], [255, 128, 0, 255]);
  assert.deepEqual([...colour.subarray(8, 11)], [255, 128, 0], "dim light keeps its hue at full colour, with lower alpha");
  for (let i = 0; i < 4; i++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(colour[i * 4 + c] * alpha[i] / 255 - rgba[i * 4 + c]) <= 1, "colour × alpha reproduces the render on black");
});

test("the muxer writes alpha as BlockAdditional 1 with AlphaMode on the track", () => {
  const muxer = createWebmMuxer({ video: { codec: "V_VP9", width: 64, height: 64, alpha: true } });
  assert.throws(() => muxer.addVideoChunk({ data: Uint8Array.of(1), timestampUs: 0, keyframe: true }), /alphaData/);
  for (let k = 0; k < 4; k++) muxer.addVideoChunk({ data: Uint8Array.of(k), timestampUs: k * 33333 + 1, keyframe: k === 0, alphaData: Uint8Array.of(200 + k) });
  const bytes = muxer.finalize({ durationUs: 133_333 });
  const segment = readEbml(bytes)[1], body = children(bytes, segment);
  const video = children(bytes, children(bytes, children(bytes, body.find((e) => e.id === ID.Tracks))[0]).find((e) => e.id === ID.Video));
  const alphaMode = video.find((e) => e.id === ID.AlphaMode);
  assert.ok(alphaMode); assert.equal(bytes[alphaMode.dataAt], 1);
  const groups = children(bytes, body.find((e) => e.id === ID.Cluster)).filter((e) => e.id === ID.BlockGroup);
  assert.equal(groups.length, 4);
  groups.forEach((group, k) => {
    const inner = children(bytes, group);
    const more = children(bytes, children(bytes, inner.find((e) => e.id === ID.BlockAdditions))[0]);
    assert.equal(bytes[more.find((e) => e.id === ID.BlockAddID).dataAt], 1);
    assert.equal(bytes[more.find((e) => e.id === ID.BlockAdditional).dataAt], 200 + k);
    assert.equal(Boolean(inner.find((e) => e.id === ID.ReferenceBlock)), k > 0, "non-keyframes reference the previous frame");
  });
});

test("the API resolves album colour from the Song store and saves the resolved spec", async () => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path"), { createHash } = await import("node:crypto");
  const { createAudioAtlas } = await import("../server/audio-atlas.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-album-"));
  const storage = path.join(root, "data/audio-atlas"), result = atlasFixture(), bytes = Buffer.from(JSON.stringify(result));
  fs.mkdirSync(path.join(storage, "runs", result.run_id), { recursive: true }); fs.mkdirSync(path.join(storage, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(storage, "runs", result.run_id, "result.json"), bytes);
  fs.writeFileSync(path.join(storage, "jobs", `${result.run_id}.json`), JSON.stringify({ id: result.run_id, song_id: result.song_id, state: "complete", created_at: "2026-10-24T00:00:00Z", result_sha256: createHash("sha256").update(bytes).digest("hex") }));
  fs.writeFileSync(path.join(root, "data/hapa-songs-store.json"), JSON.stringify({ songs: cards }));
  const atlas = createAudioAtlas({ root });
  try {
    const value = atlas.visualScore(result.run_id, { direction: { colour: { preset: "album" } } });
    assert.equal(value.score.colour.album.phase, albumDustColour(cards, "song-trip").phase);
    const saved = atlas.saveVisualScoreDirection(result.run_id, { baseRevision: 0, direction: { colour: { preset: "album" } } });
    assert.deepEqual(saved.direction.colour.album, albumDustColour(cards, "song-trip"), "the save freezes the resolved spec");
  } finally { await atlas.close?.(); fs.rmSync(root, { recursive: true, force: true }); }
});
