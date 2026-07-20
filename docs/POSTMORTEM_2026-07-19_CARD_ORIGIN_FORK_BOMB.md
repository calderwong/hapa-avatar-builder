# Card-origin proof fork-bomb postmortem

Date: 2026-07-19  
Status: resolved; runaway count zero and process boundary regression-tested  
Severity: local workstation resource exhaustion; no data-loss evidence found

## Summary

A Codex-authored inline Node smoke command invoked `runCardOriginAnnouncementProof()` with `node --input-type=module -e`. The proof used `child_process.fork()` to start two peer workers while inheriting most of `process.execArgv`. The implementation removed `--input-type` but retained `-e` and the inline program. Each intended worker therefore executed the parent smoke program again instead of `card-origin-announcement-peer-worker.mjs`, and each copy started two more copies.

This was an exponential process-spawn failure. It was not caused by the Hapa Avatar Builder launcher, the Tarot Draw scene, generated assets, iCloud hydration, or ordinary Node cold-start behavior.

## Impact and observed evidence

- The process scan returned 4,477 Node/Electron/Python-related entries and was overwhelmingly composed of `node` processes.
- At least 1,829 orphaned Node processes had already been adopted by PID 1 during diagnosis.
- Sample runaway processes were in process group `48284`, had PID 1 as parent, and still carried the complete inline proof program followed by the intended worker path and peer arguments.
- System load reached approximately `473 / 824 / 557`, later peaking above `700` while pending process exits drained.
- CPU reached 0% idle, and the internal disk reached roughly 28,000 operations per second during cleanup.
- Memory remained healthy, so this was process/scheduler and filesystem pressure rather than swapping.
- Trivial Node and process-inspection commands consequently spent 60 seconds or more waiting with almost no accumulated CPU time.
- Hapa's four intentional detached services were identified separately and left running.

No repository, Card-store, generated-media, or application-data deletion was part of the incident response. Temporary proof profiles created under the operating-system temporary directory were removed after the process tree was contained; no customer or external peer data was involved.

## What started it

The originating Codex task session is:

`~/.codex/sessions/2026/07/17/rollout-2026-07-17T14-50-30-019f720f-422d-7f60-a149-2256bb37a762.jsonl`

The unsafe smoke command first appears at line 22556, timestamp `2026-07-19T14:34:11.942Z` (`07:34:11 PDT`), call `call_cSzT7IS3pB6WQJ14Fqqy4PXl`. Near-identical retries appear at lines 22569, 22582, 22623, and 22642 between `07:34:48` and `07:41:21 PDT`.

The repeated command shape was:

```text
node --input-type=module -e '<inline program importing and running runCardOriginAnnouncementProof()>'
```

This was an agent-created verification shortcut. It was not a command requested or launched by Calder.

## Technical root cause

The defective boundary was introduced with the Card-origin proof in commit `9ff6e53`:

```js
fork(WORKER_PATH, workerArguments, {
  // other options omitted
  execArgv: process.execArgv.filter((entry) => !entry.startsWith("--input-type"))
});
```

Node's `fork()` starts another Node process and defaults to the parent's `process.execArgv`. For the smoke command, the execution arguments contained both `--input-type=module` and the paired `-e <program>`. Filtering only `--input-type` left the eval program intact. The resulting child command was effectively:

```text
node -e '<parent proof program>' card-origin-announcement-peer-worker.mjs --profile-root ...
```

Node executed the eval program; the worker path became an ordinary argument. The eval program ran the proof, forked two more children, and repeated.

## Contributing failures

1. The fork boundary used an argument blacklist instead of denying all inherited execution arguments.
2. There was no worker-role environment marker to reject recursive proof entry.
3. Peer processes were created before entering the `try/finally` cleanup boundary.
4. Cleanup returned early for a disconnected child and had no bounded `SIGKILL` escalation.
5. The stalled smoke command was retried five times, including debug variants, before inspecting the spawned process tree.
6. The delay was initially discussed as environmental or cold-load behavior rather than immediately treated as a possible spawn incident.
7. There was no regression test asserting that forked workers receive an empty `execArgv`.

## Containment and recovery

1. Confirmed the runaway command from live process command lines.
2. Sent termination and kill signals only to orphaned Node processes and the identified process group.
3. Killed every process whose command line was specifically tied to the Card-origin announcement proof/worker path.
4. Repeated process-group containment until the matching runaway count reached zero.
5. Verified total Node processes fell to 32.
6. Inspected the remaining four PID-1 Node services and preserved them because they were the intentional Avatar Builder API, `.hapaCatalog`, and maintenance-console services.
7. Removed only macOS temporary directories matching the incident-specific `hapa-origin-proof-*` prefix and verified that zero remained. APFS cleanup took roughly nine minutes because the exponential spawn created thousands of separate profile roots.

Load averages remain slow-moving historical indicators and take time to decay after the runnable queue is cleared; command responsiveness returned immediately after containment.

## Permanent corrective actions

- Worker forks now set `execArgv: []`; no parent eval, test-runner, inspector, or loader arguments are inherited.
- Worker forks carry `HAPA_CARD_ORIGIN_PEER_WORKER=1`.
- `runCardOriginAnnouncementProof()` refuses to run in a peer-worker environment, providing a second independent recursion break.
- Both child creations now occur inside the `try/finally` cleanup boundary.
- Cleanup now attempts IPC shutdown, then bounded `SIGTERM`, then bounded `SIGKILL`.
- Regression tests assert both the empty execution-argument policy and the recursion sentinel.
- `AGENTS.md` now prohibits inline-eval smoke tests for forking modules and requires inspection before retrying a stalled process-spawning command.
- The STG-014 checkpoint now corrects the earlier cold-runtime attribution.

## Verification and closure evidence

```text
node --test tests/card-origin-announcement-proof.test.mjs
```

Observed after the correction:

- The focused file passed all 3 tests, including both boundary tests and the live two-peer proof, in 310 milliseconds.
- No Card-origin proof or worker process remained afterward.
- No incident-specific `hapa-origin-proof-*` temporary directory remained afterward.
- Total Node process count returned to the pre-test baseline of 32.
- A trivial Node command returned in 0.03 seconds instead of more than 60 seconds.
- The four intentional detached Hapa services remained running.
- The broad repository suite passed 1,006 of 1,008 tests. Its two failures were in `echo-scene-keyframe-process-cli.test.mjs` against pre-existing modified Echo keyframe files outside this fix; they are disclosed but were not overwritten as part of incident recovery.

The exact STG-014 capture path must still be rerun separately before making performance claims about that flow.

## Learning delta

The reusable lesson is broader than this one proof: `child_process.fork()` is an execution boundary, not merely a convenient spawn helper. Parent execution flags are code, and inheriting them can change which program the child runs. Hapa process-based proofs must use allowlisted child configuration, explicit roles, bounded ownership, and post-run process accounting.

This incident should become a Process Boundary Safety Lesson Card and remain linked to the originating Codex Turn rather than being rewritten as a clean implementation history.

## Stargate Gate Pass follow-up audit

The protocol-wide static pass subsequently found the same blacklist-shaped `process.execArgv.filter(...)` boundary in `server/stargate-gate-pass-proof.mjs`. No evidence showed that the Stargate proof had reproduced the incident; it was identified before bounded re-execution.

Commit `7ac2974` removed inherited execution arguments and parent `NODE_OPTIONS`, added a worker-role recursion sentinel, moved child creation inside cleanup ownership, added bounded `SIGKILL` escalation, removed the automatic timeout retry, and made the proof measure cleanup before persisting success. The prescribed file-based proof passed 3/3 and returned from 32 to 32 Node processes with zero Stargate workers and zero proof temp roots.

Additional reusable learning: executable parent state crosses Node boundaries through both `process.execArgv` and `NODE_OPTIONS`; cleanup claims must be observed before they become proof evidence; and retry count belongs in the spawn-amplification budget. Full follow-up evidence is in `docs/audits/2026-07-19-stargate-gate-pass-process-boundary.md`.
