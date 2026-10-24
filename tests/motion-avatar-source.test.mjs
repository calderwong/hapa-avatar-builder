import test from 'node:test';
import assert from 'node:assert/strict';
import { createAvatarScaffold, assignAssetToSlot, auditAvatar, createAttachPack, createHealingPlan, normalizeAvatarCard, moveAssetToRequirement, reorderRequirementAssets, detachAssetFromAvatar, MOTION_AVATAR_SOURCE_REQUIREMENT_ID as role } from '../src/domain/avatar.js';

const scaffold = () => createAvatarScaffold({ id: 'motion-source-test', names: ['Test Avatar'] });
const source = (id) => ({ id, name: `${id}.png`, uri: `/media/${id}.png`, type: 'image', requirementId: role, source: 'operator-upload', metadata: { originalFileName: `${id}.png`, width: 1024, height: 1536, provenance: { creator: 'test-fixture' } } });

test('optional motion sources preserve completeness, healing scope, identity and provenance through serialization', () => {
  const original = scaffold();
  let avatar = assignAssetToSlot(original, source('source-a'));
  avatar = assignAssetToSlot(avatar, source('source-b'));
  avatar = normalizeAvatarCard(JSON.parse(JSON.stringify(avatar)));
  assert.equal(auditAvatar(avatar).required, auditAvatar(original).required);
  assert.equal(auditAvatar(avatar).percent, auditAvatar(original).percent);
  assert.equal(createHealingPlan(avatar).length, createHealingPlan(original).length);
  const pack = createAttachPack(avatar, 'motion-avatar');
  assert.equal(pack.motionAvatarSources.length, 2);
  const candidate = pack.motionAvatarSources[0];
  assert.equal(candidate.avatarCardId, original.id);
  assert.equal(candidate.assetId, 'source-a');
  assert.equal(candidate.uri, '/media/source-a.png');
  assert.equal(candidate.originalFileName, 'source-a.png');
  assert.equal(candidate.metadata.provenance.creator, 'test-fixture');
  assert.equal(candidate.status, 'awaiting-rig-review');
  assert.equal(candidate.defaultForSection, true);
  assert.equal(pack.baseReferences.some(ref => ref.role === role), false);
});

test('motion source defaults reorder without changing IDs, and moving/removing updates pickup list', () => {
  let avatar = assignAssetToSlot(assignAssetToSlot(scaffold(), source('one')), source('two'));
  const slots = avatar.slots.filter(slot => slot.requirementId === role);
  avatar = reorderRequirementAssets(avatar, role, slots[1].id, slots[0].id);
  assert.equal(createAttachPack(avatar).motionAvatarSources[0].assetId, 'two');
  avatar = moveAssetToRequirement(avatar, 'two', 'fullbody_concept_art');
  assert.deepEqual(createAttachPack(avatar).motionAvatarSources.map(ref => ref.assetId), ['one']);
  avatar = detachAssetFromAvatar(avatar, 'one');
  assert.equal(createAttachPack(avatar).motionAvatarSources.length, 0);
});

test('non-image assignments and moves into motion sources fail without mutating the Avatar', () => {
  const original = scaffold();
  assert.throws(() => assignAssetToSlot(original, { ...source('video'), type: 'video' }), /images only/);
  const avatar = assignAssetToSlot(original, { ...source('video'), type: 'video', requirementId: 'kit_poses' });
  assert.throws(() => moveAssetToRequirement(avatar, 'video', role), /images only/);
  assert.equal(createAttachPack(avatar).motionAvatarSources.length, 0);
  assert.equal(original.assets.length, 0);
});

test('owning CLI retrieves the exact motion source from an isolated persisted Avatar store', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'hapa-motion-source-'));
  try {
    const store = join(dir, 'avatar-store.json');
    await writeFile(store, JSON.stringify({ schemaVersion: 'hapa.avatar-store.v1', avatars: [assignAssetToSlot(scaffold(), source('pickup'))] }));
    const output = execFileSync(process.execPath, ['cli/avatar-builder.mjs', 'attach', 'motion-source-test', '--store', store, '--target', 'motion-avatar', '--json'], { timeout: 15000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '' } });
    const pack = JSON.parse(output);
    assert.equal(pack.target, 'motion-avatar');
    assert.equal(pack.motionAvatarSources[0].assetId, 'pickup');
    assert.equal(pack.motionAvatarSources[0].avatarCardId, 'motion-source-test');
    assert.equal(pack.motionAvatarSources[0].uri, '/media/pickup.png');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
