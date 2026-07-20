# STG-014 Mint Gate checkpoint

Date: 2026-07-19  
Status: implementation checkpoint; task remains `in_progress`

## Stable result

The canonical Hapa Avatar Builder Tarot Draw now contains an explicit proposal-review and Mint Gate path. A Council proposal may receive one append-only human decision: revise, reject, defer, or approve. Only an explicit approval can create a Card origin head. Approval then binds the exact review and decision to Overwind, `.hapaCatalog`, a signed two-process peer announcement, and one evidence-only Mint Gate Result Card.

The 3D projection represents the custody path as a physical ritual:

1. the proposed Card enters a gold human-authority door;
2. origin, Overwind, Catalog, and peer receipt beacons light in order;
3. the Card travels the curved custody rail;
4. the Result Card portal materializes only after verified receipts return.

Review staging is never authority. Missing origin or peer evidence withholds the completion visual.

## Verified at this checkpoint

- `node --test tests/avatar-proposal-review-service.test.mjs tests/tarot-wisdom-council-visual.test.mjs`
  - 6 passed, 0 failed.
- `node --test tests/card-origin-announcement-proof.test.mjs`
  - previously passed in this task with two isolated operating-system processes, distinct stable node identities, Hyperswarm/Noise/Protomux transport, exact signed envelope storage, and verified acknowledgement.
- `npm run build`
  - passed after the Mint Gate UI, 3D rig, API/CLI parity, and public deterministic Stargate demo boot were added.
- The user-running Avatar Builder process on port 8797 was not stopped, restarted, navigated, or closed.

## Honest evidence gap

The dedicated isolated Electron capture did not complete on the saturated workstation. Two attempts failed closed while freezing the Context Packet; a third low-pressure attempt lost the isolated chamber during the extended wait. No successful STG-014 poster or product clip is claimed, and the Kanban task must not move to Review or Done yet.

Correction recorded 2026-07-19: the workstation saturation was not normal capture-harness or cold-runtime behavior. It was caused by an unsafe inline-eval smoke command interacting with inherited `child_process.fork()` execution arguments and recursively starting the Card-origin proof. See `docs/POSTMORTEM_2026-07-19_CARD_ORIGIN_FORK_BOMB.md`. The focused service and visual tests passed before the incident, but the failed capture attempts made during saturation are not valid performance evidence. Visual acceptance remains blocked until the exact capture path is rerun on the corrected process boundary.

## Resume point

1. Re-run `npm run evidence:stargate-proposal-mint-capture` when the machine has headroom.
2. Inspect the review, custody, and hero posters for immediate spatial legibility and Avatar Builder Tarot Draw parity.
3. If necessary, tune scale, camera framing, bloom, rail timing, and result-portal hierarchy, then recapture.
4. Run the broad suite and a final build.
5. Attach the capture disposition, GPT Image memorial, and Krea 2 open quest to STG-014 before Review/Done.
6. Start STG-015 Passport only after STG-014 is honestly complete.

## Truth boundary

The peer proof is a live local two-process transport through an ephemeral loopback DHT. It does not claim geographically remote delivery or internet-wide discovery. Catalog projection is source-only and does not infer commerce eligibility. The Mint Gate Result Card is execution evidence and does not create a second minted Card head.
