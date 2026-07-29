import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_AUDIO_WAVE_FORMS_SHADER,
  ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
  ECHO_ULTIMATE_FLAME_SHADER,
  echoPersistentShaderSegments,
  normalizeEchoPersistentShaderSlots,
  withEchoPersistentShaderSlots,
} from "../src/domain/echo-persistent-shader-slots.js";

test("every song receives two requested always-on defaults and one open slot", () => {
  const slots = normalizeEchoPersistentShaderSlots({ duration: 213.4 });
  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map((slot) => slot.enabled), [true, true, false]);
  assert.equal(slots[0].shader_id, ECHO_ULTIMATE_FLAME_SHADER.id);
  assert.equal(slots[0].stem_focus, "master");
  assert.equal(slots[1].shader_id, ECHO_AUDIO_WAVE_FORMS_SHADER.id);
  assert.equal(slots[1].stem_focus, "leadVocals");
  assert.equal(slots[1].stem_fallback, "master");
  assert.equal(slots[1].allow_alternate_isolated_stems, false);
  assert.equal(slots[2].shader_id, "none");
  assert.ok(slots.every((slot) => slot.start_sec === 0 && slot.end_sec === 213.4 && slot.always_on));
});

test("persistent segments include only selected slots and always span the song", () => {
  const project = withEchoPersistentShaderSlots({ duration: 30 });
  const segments = echoPersistentShaderSegments(project);
  assert.equal(project.persistent_shader_slots_schema, ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map((segment) => [segment.start_sec, segment.end_sec]), [[0, 30], [0, 30]]);
  assert.deepEqual(segments.map((segment) => segment.persistent_track_id), [
    "track-shader-always-on-1",
    "track-shader-always-on-2",
  ]);
});

test("an operator can switch a configured slot off without losing its shader choice", () => {
  const selected = normalizeEchoPersistentShaderSlots({
    duration: 12,
    persistent_shader_slots: [
      undefined,
      undefined,
      { enabled: true, shader_id: "isf:custom", shader_title: "Custom Shader", stem_focus: "drums" },
    ],
  });
  assert.equal(selected[2].track_id, "track-shader-always-on-3");
  assert.equal(selected[2].enabled, true);
  assert.equal(selected[2].shader_id, "isf:custom");
  assert.equal(selected[2].stem_focus, "drums");

  const switchedOff = normalizeEchoPersistentShaderSlots({
    duration: 12,
    persistent_shader_slots: selected.map((slot, index) => index === 2 ? { ...slot, enabled: false } : slot),
  });
  assert.equal(switchedOff[2].track_id, "track-shader-always-on-3");
  assert.equal(switchedOff[2].enabled, false);
  assert.equal(switchedOff[2].shader_id, "isf:custom");
  assert.equal(switchedOff[2].shader_title, "Custom Shader");
  assert.equal(echoPersistentShaderSegments({ duration: 12, persistent_shader_slots: switchedOff }).length, 2);

  const switchedBackOn = normalizeEchoPersistentShaderSlots({
    duration: 12,
    persistent_shader_slots: switchedOff.map((slot, index) => index === 2 ? { ...slot, enabled: true } : slot),
  });
  assert.equal(switchedBackOn[2].shader_id, "isf:custom");
  assert.equal(switchedBackOn[2].enabled, true);
});
