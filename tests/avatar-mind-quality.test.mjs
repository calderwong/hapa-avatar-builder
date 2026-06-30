import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const avatarStore = JSON.parse(fs.readFileSync("data/avatar-store.json", "utf8"));
const choiceContract = JSON.parse(fs.readFileSync("data/avatar-mind-choice-contract.json", "utf8"));
const latestAudit = fs.existsSync("data/healing-reports/latest-avatar-mind-quality-audit.json")
  ? JSON.parse(fs.readFileSync("data/healing-reports/latest-avatar-mind-quality-audit.json", "utf8"))
  : null;

test("avatar mind choice contract defines canonicalization and links", () => {
  for (const field of ["actorAvatarId", "choiceText", "canonStatus", "classification", "sourceRefs", "linkTargets", "reviewState"]) {
    assert.ok(choiceContract.requiredFields.includes(field), `${field} is required`);
  }
  assert.ok(choiceContract.canonStatuses.includes("soft_canon"));
  assert.ok(choiceContract.canonStatuses.includes("tombstone"));
  assert.ok(choiceContract.linkTargetFields.includes("cardIds"));
  assert.ok(choiceContract.linkTargetFields.includes("journalEntryIds"));
});

test("quality pass creates valid canonical choice records for promoted avatars", () => {
  const promotedNames = new Set(["Red", "Blue", "Green", "Beth", "M.O.T.H.E.R.", "Calder", "Ayla Ren", "Hana", "Nupoora"]);
  for (const avatar of avatarStore.avatars.filter((item) => promotedNames.has(item.primaryName))) {
    const choices = avatar.mind?.canonicalChoices || [];
    assert.ok(choices.length >= 3, `${avatar.primaryName} should have canonical choices`);
    for (const choice of choices.slice(0, 5)) {
      for (const field of choiceContract.requiredFields) assert.notEqual(choice[field], undefined, `${choice.id} missing ${field}`);
      assert.equal(choice.actorAvatarId, avatar.id);
      assert.ok(Array.isArray(choice.sourceRefs));
      assert.ok(choice.linkTargets?.avatarIds?.includes(avatar.id));
      assert.ok(Array.isArray(choice.linkTargets?.journalEntryIds));
    }
  }
});

test("recovered avatar shells no longer use generic persona anchors", () => {
  const recoveredNames = new Set([
    "UMI",
    "Bella",
    "Navi",
    "Sasha",
    "Heather",
    "Sparrow",
    "Jane",
    "Gi-Gee",
    "Hana",
    "Caitlyn",
    "Emily",
    "Vega",
    "Sable",
    "Bluega",
    "Leila",
    "Lana",
    "Kate",
    "Ophelia",
    "Molly",
    "Ayla Ren",
    "Nahla Serein",
    "Veda Noor",
    "Saria Veil",
    "Lyra Solene",
    "Nupoora"
  ]);
  for (const avatar of avatarStore.avatars.filter((item) => recoveredNames.has(item.primaryName))) {
    assert.ok(!/recovered Hapa avatar whose canon must preserve source path/i.test(avatar.mind?.personaAnchor?.identityStatement || ""), `${avatar.primaryName} still has generic anchor`);
    assert.ok((avatar.mind?.selfKnowledge || []).length >= 12, `${avatar.primaryName} needs selfKnowledge depth`);
    assert.ok((avatar.mind?.memoryLedger || []).length >= 8, `${avatar.primaryName} needs memory depth`);
    assert.ok((avatar.mind?.phraseCards || []).length >= 5, `${avatar.primaryName} needs phrase cards`);
  }
});

test("empty journal and empty fact placeholders are tombstoned", () => {
  for (const avatar of avatarStore.avatars) {
    for (const entry of avatar.mind?.journal || []) {
      const wordCount = String(entry.privateEntry || "").trim().split(/\s+/).filter(Boolean).length;
      assert.ok(wordCount >= 5 || entry.status === "tombstoned", `${avatar.primaryName} has empty non-tombstoned journal ${entry.id}`);
    }
    for (const fact of avatar.mind?.selfKnowledge || []) {
      assert.ok(!(/^Untitled fact$/i.test(fact.label || "") && !String(fact.value || "").trim()), `${avatar.primaryName} has empty Untitled fact`);
    }
  }
});

test("latest Avatar Mind quality audit is present and contract-aware", { skip: !latestAudit }, () => {
  assert.equal(latestAudit.schemaVersion, "hapa.avatar-mind-quality-audit.v1");
  assert.ok(latestAudit.contract.requiredFields.includes("linkTargets"));
  assert.ok(latestAudit.counts.totalChoices > 0);
});
