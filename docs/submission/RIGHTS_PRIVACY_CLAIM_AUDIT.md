# Rights, privacy, and claim audit

Status date: 2026-07-21

## Submission video

- Published submission artifact: [Hapa.ai — Hapa Avatar Builder — Codex Build Week demo](https://youtu.be/Y-RR2AwnH5A).
- The uploaded video is a 3:08 narrated screen recording of the operator's Hapa Avatar Builder product work. The older silent HyperFrames cut and its script are retained only as production-planning evidence.
- The upload is unlisted. The organizer's July 20 announcement explicitly says an unlisted YouTube link is acceptable.
- The upload exceeds the stated three-minute maximum by about eight seconds, and the narration refers to Codex and the GPT model line without explicitly saying `GPT-5.6`. Those are submission risks and are not represented as resolved by the repository packet.
- The isolated capture records only its named application window. It does not record the desktop, notifications, or other applications.
- The operator must confirm public-use rights for every visible pre-existing image because provenance inside the private Avatar Builder library cannot be independently established from source metadata alone.

## Judge source package

- Private runtime Card/media stores, personal corpora, generated-media directories, model weights, third-party reference-media directories, `.git`, `node_modules`, build output, Gate secrets, complete private addresses, Passes, keys, tokens, and credentials are excluded.
- Four tracked empty stores plus explicitly labelled public deterministic demo Cards form the bootstrap.
- The packaged Overcard dependency is pinned by SHA-256 and installed from the included tarball.
- Every packaged source file is listed and pinned in `JUDGE_PACKAGE_MANIFEST.json`.
- The automated preflight rejects forbidden directories, missing fixtures, manifest hash drift, Overcard hash drift, and obvious private-key, OpenAI-secret, and AWS-key patterns.

## Claim boundary

- Hypercore custody means Card identity and append-only local history. It does not mean mint, ownership, commerce eligibility, or canon.
- The peer receipt proves two isolated local profiles exchanging one exact Card through signed consent and encrypted Hyperswarm/Noise/Protomux. It does not prove internet-scale reachability.
- Restoring a Context Card reconstructs its safe Formation while disconnected; it does not embed joining authority.
- Local-model output is proposed and unminted until explicit human approval.
- Hapa is presented as the shared decentralized Card platform. Avatar Builder is one participating application, not a claim that Hapa itself is the submitted company.

## Final human gates

1. Confirm every visible pre-existing image may be used in the public submission.
2. If time permits, replace the upload with a version at or below three minutes whose audio explicitly names Codex and GPT-5.6.
3. Choose and add an appropriate repository-wide license, or make the repository private and grant the two judge accounts access.
