import assert from "node:assert/strict";
import { access, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withLocalJsonFileLock } from "../server/local-json-file-lock.mjs";

const staleDate = () => new Date(Date.now() - 60_000);

for (const [label, contents] of [["empty", ""], ["malformed", "{not-json"]]) {
  test(`a stale ${label} lock is quarantined and recovered`, async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "hapa-local-lock-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const lockPath = path.join(directory, "store.json.lock");
    await writeFile(lockPath, contents, { mode: 0o600 });
    await utimes(lockPath, staleDate(), staleDate());

    let ran = false;
    await withLocalJsonFileLock(lockPath, async () => { ran = true; }, { waitMs: 1_000, staleMs: 5_000 });

    assert.equal(ran, true);
    await assert.rejects(access(lockPath), (error) => error?.code === "ENOENT");
    await assert.rejects(access(`${lockPath}.recovery`), (error) => error?.code === "ENOENT");
  });
}

test("concurrent recovery preserves the successor lock's mutual exclusion", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hapa-local-lock-successor-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const lockPath = path.join(directory, "store.json.lock");
  await writeFile(lockPath, "", { mode: 0o600 });
  await utimes(lockPath, staleDate(), staleDate());

  let active = 0;
  let maxActive = 0;
  const completed = await Promise.all(Array.from({ length: 6 }, (_, index) => withLocalJsonFileLock(lockPath, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return index;
    } finally {
      active -= 1;
    }
  }, { waitMs: 3_000, staleMs: 5_000 })));

  assert.equal(maxActive, 1);
  assert.deepEqual([...completed].sort((left, right) => left - right), [0, 1, 2, 3, 4, 5]);
  await assert.rejects(access(lockPath), (error) => error?.code === "ENOENT");
});
