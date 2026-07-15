import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ECHO_OUTPUT_PROFILE_ID,
  ECHO_LANDSCAPE_OUTPUT_PROFILE,
  ECHO_OUTPUT_PROFILES,
  ECHO_VERTICAL_OUTPUT_PROFILE,
  attachEchoOutputProfile,
  echoOutputProfileCacheKey,
  normalizeEchoOutputProfileId,
  resolveEchoOutputProfile,
} from "../src/domain/echo-output-profile.js";

test("Echo output profiles expose immutable landscape and phone-vertical contracts", () => {
  assert.deepEqual(ECHO_LANDSCAPE_OUTPUT_PROFILE, {
    schemaVersion: "hapa.echo.output-profile.v1",
    id: "landscape",
    label: "Landscape",
    orientation: "landscape",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    fps: 30,
    safeArea: { actionInset: 0.05, titleInset: 0.08, lyricBottom: 0.1 },
  });
  assert.deepEqual(ECHO_VERTICAL_OUTPUT_PROFILE, {
    schemaVersion: "hapa.echo.output-profile.v1",
    id: "vertical",
    label: "Vertical",
    orientation: "vertical",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    fps: 30,
    safeArea: { actionInset: 0.06, titleInset: 0.1, lyricBottom: 0.14 },
  });
  assert.ok(Object.isFrozen(ECHO_OUTPUT_PROFILES));
  assert.ok(ECHO_OUTPUT_PROFILES.every(Object.isFrozen));
});

test("profile aliases and object shapes resolve to one canonical profile", () => {
  const verticalInputs = [
    "vertical",
    "portrait",
    "9:16",
    "9x16",
    "1080x1920",
    { id: "vertical" },
    { orientation: "portrait" },
    { aspectRatio: "9:16" },
    { output_profile: { id: "portrait" } },
    { width: 1080, height: 1920 },
  ];
  for (const input of verticalInputs) {
    assert.equal(normalizeEchoOutputProfileId(input), "vertical");
    assert.strictEqual(resolveEchoOutputProfile(input), ECHO_VERTICAL_OUTPUT_PROFILE);
  }

  const landscapeInputs = [
    "landscape",
    "16:9",
    "16x9",
    "1920x1080",
    { id: "landscape" },
    { orientation: "landscape" },
    { aspect_ratio: "16:9" },
    { outputProfile: "16:9" },
    { width: 1920, height: 1080 },
  ];
  for (const input of landscapeInputs) {
    assert.equal(normalizeEchoOutputProfileId(input), "landscape");
    assert.strictEqual(resolveEchoOutputProfile(input), ECHO_LANDSCAPE_OUTPUT_PROFILE);
  }
});

test("missing and unknown legacy values retain the landscape default", () => {
  assert.equal(DEFAULT_ECHO_OUTPUT_PROFILE_ID, "landscape");
  for (const input of [undefined, null, "", "unknown", {}, { output_profile: null }]) {
    assert.equal(normalizeEchoOutputProfileId(input), "landscape");
    assert.strictEqual(resolveEchoOutputProfile(input), ECHO_LANDSCAPE_OUTPUT_PROFILE);
  }
});

test("attaching a canonical output_profile never mutates the source project", () => {
  const project = {
    id: "echo-song-one",
    output_profile: "portrait",
    editorial: { locked: true },
  };
  const before = structuredClone(project);

  const attached = attachEchoOutputProfile(project);

  assert.deepEqual(project, before);
  assert.notStrictEqual(attached, project);
  assert.strictEqual(attached.editorial, project.editorial);
  assert.strictEqual(attached.output_profile, ECHO_VERTICAL_OUTPUT_PROFILE);

  const overridden = attachEchoOutputProfile(project, "16:9");
  assert.strictEqual(overridden.output_profile, ECHO_LANDSCAPE_OUTPUT_PROFILE);
  assert.equal(project.output_profile, "portrait");
});

test("cache identity is stable across aliases and separated by output profile", () => {
  const verticalKey = echoOutputProfileCacheKey("vertical");
  const landscapeKey = echoOutputProfileCacheKey("landscape");

  assert.equal(verticalKey, echoOutputProfileCacheKey("portrait"));
  assert.equal(verticalKey, echoOutputProfileCacheKey({ aspectRatio: "9:16" }));
  assert.equal(landscapeKey, echoOutputProfileCacheKey("16:9"));
  assert.notEqual(verticalKey, landscapeKey);
  assert.match(verticalKey, /vertical:1080x1920:9:16:30fps$/u);
  assert.match(landscapeKey, /landscape:1920x1080:16:9:30fps$/u);
});
