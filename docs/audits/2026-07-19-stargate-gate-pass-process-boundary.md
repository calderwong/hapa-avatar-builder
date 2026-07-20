# Stargate Gate Pass process-boundary audit

Date: 2026-07-19

Status: resolved and bounded-runtime verified

Fix commit: `7ac2974` (`fix(stargate): harden Gate Pass worker boundary`)

## Scope and truth boundary

This audit reviewed `server/stargate-gate-pass-proof.mjs`, its peer worker, its focused tests, the API call site, and the previously repaired Card-origin proof. It found a real process-boundary vulnerability with the same trigger shape as the Card-origin fork bomb. There is no evidence that the Stargate proof itself reproduced that incident; the finding came from static analysis before rerunning the proof.

## Intended spawn graph

```text
API or file-based test
  -> runStargateGatePassProof (one attempt)
    -> Aurora peer worker (one Node child)
    -> Beacon peer worker (one Node child)
    -> one in-process ephemeral loopback DHT bootstrap
```

Corrected maximum amplification:

- simultaneous child processes: 2;
- proof attempts per call: 1;
- worker nesting depth: 1;
- automatic retries: 0;
- worker execution arguments: empty;
- parent `NODE_OPTIONS`: not inherited;
- worker role: `HAPA_STARGATE_GATE_PASS_PEER_WORKER=1`;
- shutdown: IPC request, 1.5-second wait, `SIGTERM`, 1.5-second wait, `SIGKILL`, final 1.5-second wait.

## Confirmed issues

1. The fork boundary removed only `--input-type` from `process.execArgv`, leaving paired `-e <program>` input capable of making a worker rerun the parent proof.
2. No role sentinel prevented a worker environment from entering the orchestrator again.
3. `NODE_OPTIONS` remained a second executable-state channel for preloaders or loaders even after correcting `execArgv`.
4. Both children were created before the `try/finally` owner began. A second-fork failure could leave the first child unowned.
5. Cleanup treated IPC disconnection as exit, could throw while sending shutdown, waited indefinitely after `SIGTERM`, and had no `SIGKILL` fallback.
6. A timeout automatically launched a second two-peer attempt without human/process-tree inspection.
7. The proof recorded `childProcessesStopped: true` and `swarmsDestroyed: true` before cleanup had actually been observed.
8. A pending IPC waiter did not reject when a worker exited successfully before emitting the expected message, leaving a timer capable of rejecting later.

The vulnerable boundary originated in `cb61508` (`feat(tarot): materialize signed Stargate peers`). This is attribution of implementation history, not evidence that Calder manually caused or ran an unsafe command.

## Resolution

- Replaced inherited-argument filtering with `execArgv: []`.
- Removed parent `NODE_OPTIONS` from the worker environment.
- Added the explicit peer-worker sentinel and a fail-closed recursive-entry assertion.
- Moved both forks inside the owning `try/finally` boundary.
- Made pending IPC waits reject on any premature worker exit.
- Added bounded cooperative, `SIGTERM`, and `SIGKILL` shutdown.
- Made cleanup failure explicit as `stargate_gate_pass_cleanup_failed`.
- Removed the automatic retry; a timeout now returns control for inspection.
- Measured cleanup before generating or persisting the proof result.
- Added regression assertions for `execArgv`, `NODE_OPTIONS`, the worker role, recursion rejection, and cleanup evidence.

## Verification

Static preflight before the bounded proof:

```text
node_processes=32
stargate_workers=0
hapa_pass_proof_temp_roots=0
```

Focused file-based boundary proof:

```text
node --test tests/stargate-gate-pass-proof.test.mjs
tests 3; pass 3; fail 0; duration 295 ms
```

Related protocol and broker tests:

```text
node --test tests/stargate-gate-pass-protocol.test.mjs tests/stargate-gate-pass-broker.test.mjs
tests 3; pass 3; fail 0; duration 79 ms
```

Post-run accounting:

```text
node_processes=32
stargate_workers=0
hapa_pass_proof_temp_roots=0
exec_argv_blacklists=0
```

`node --check` passed for the proof and focused test. No application launch, inline evaluator, automatic retry, full build, or broad asset scan was used for this repair.

## Learning delta

Empty `execArgv` is necessary but not sufficient. `NODE_OPTIONS` is another executable parent-state channel and must be removed or explicitly allowlisted at a Node worker boundary. Cleanup evidence is also part of proof truth: do not persist “stopped” until the owning code has observed exit and teardown. Finally, retry is part of maximum amplification; a process timeout returns to inspection rather than silently creating another process cohort.
