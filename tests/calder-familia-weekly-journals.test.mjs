import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const readJson = (filePath) => JSON.parse(readFileSync(new URL(`../${filePath}`, import.meta.url), "utf8"));

test("Calder Familia weekly journal program keeps cumulative board counters aligned", () => {
  const avatarStore = readJson("data/avatar-store.json");
  const program = readJson("data/calder-familia-weekly-journals/weekly-journal-program.json");
  const backlog = readJson("data/calder-familia-weekly-journals/weekly-journal-backlog.json");
  const kanban = readJson("data/kanban.json");
  const itemStore = readJson("data/item-manager-store.json");

  const avatars = avatarStore.avatars || [];
  const programAvatarIds = new Set((backlog.tasks || []).map((task) => task.avatarId).filter(Boolean));
  const weeklyEntries = avatars.flatMap((avatar) => (avatar.mind?.journal || [])
    .filter((entry) => entry.journalType === "weekly-five-page-reflective-narrative")
    .map((entry) => ({ ...entry, avatarId: avatar.id })));
  const authorWeekKeys = new Set(weeklyEntries.map((entry) => `${entry.avatarId}:${entry.weekIndex}`));
  const doneTasks = (backlog.tasks || []).filter((task) => task.status === "done");
  const lane = (kanban.lanes || []).find((item) => item.id === "lane-calder-familia-weekly-journals");
  const overallCard = (lane?.cards || []).find((card) => card.id === "calder-familia-overall-progress");
  const latestRunPath = new URL(`../data/calder-familia-weekly-journals/week-${String(program.currentExecutedWeekIndex).padStart(3, "0")}-execution.json`, import.meta.url);

  assert.equal(weeklyEntries.length, authorWeekKeys.size, "weekly journal author/week keys should be unique");
  assert.equal(program.completedEntries, authorWeekKeys.size);
  assert.equal(program.completedPages, program.completedEntries * program.targetPagesPerEntry);
  assert.equal(program.remainingEntries, program.targetEntries - program.completedEntries);
  assert.equal(doneTasks.length, program.completedEntries);
  assert.equal(backlog.completedTaskCount, program.completedEntries);
  assert.equal(backlog.remainingTaskCount, program.remainingEntries);
  assert.match(overallCard?.body || "", new RegExp(`${program.completedEntries}/${program.targetEntries}`));
  assert.ok(existsSync(latestRunPath), "latest weekly execution artifact should exist");

  for (const entry of weeklyEntries) {
    assert.equal(entry.pageTarget, program.targetPagesPerEntry);
    assert.equal(entry.pageCount, program.targetPagesPerEntry);
    assert.ok(entry.wordCount >= 1000, `${entry.id} should contain long-form narrative`);
    assert.equal(entry.criticStatus, "critic-approved-soft-canon-seed");
    assert.ok((entry.mentionedAvatarIds || []).length > 0, `${entry.id} should queue cross-avatar review context`);
    assert.ok((entry.lexiconTerms || []).length > 0, `${entry.id} should expose mineable lexicon`);
  }

  const latestEntries = weeklyEntries.filter((entry) => Number(entry.weekIndex) === Number(program.currentExecutedWeekIndex));
  if (program.mediaConsumptionProtocol?.status === "active") {
    assert.equal(programAvatarIds.size, program.avatarCount);
    assert.equal(latestEntries.length, programAvatarIds.size);
    for (const entry of latestEntries) {
      assert.ok((entry.readingList || []).length > 0, `${entry.id} should choose reading/listening media`);
      assert.ok((entry.watchingList || []).length > 0, `${entry.id} should choose watching media`);
      assert.ok(entry.mediaConsumption?.weeklyLearning, `${entry.id} should record weekly media learning`);
      assert.ok(entry.mediaConsumption?.innerStateDelta, `${entry.id} should record media-driven inner-state change`);
      assert.ok(entry.privateEntry.includes("My reading list this week"), `${entry.id} should journal what was read`);
      assert.ok(entry.privateEntry.includes("My watching list is"), `${entry.id} should journal what was watched`);
    }
  }

  const protocolCards = (itemStore.cards || []).filter((card) => (card.tags || []).includes("bella-protocol"));
  const tagCards = (itemStore.cards || []).filter((card) => (card.tags || []).includes("tag-mined"));
  assert.ok(protocolCards.length >= 6, "Bella/Consul protocol cards should exist");
  assert.ok(tagCards.length >= 40, "tag-mined narrative tracking cards should exist");
});
