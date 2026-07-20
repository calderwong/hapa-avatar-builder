# Rights, privacy, and claim audit

Status date: 2026-07-19

## Submission video

- The current HyperFrames cut is silent and contains no third-party music, narration, or sound effects.
- Its footage is screen capture of the operator's Hapa Avatar Builder product work and the new isolated Build Week custody proof.
- Captions and motion graphics were authored for this submission.
- The isolated capture records only its named application window. It does not record the desktop, notifications, or other applications.
- The final video must be reviewed once by the operator before public upload because visual-asset provenance inside the pre-existing private Avatar Builder library cannot be independently established from source metadata alone.
- A later voiceover must use the operator's own voice or another voice for which the operator has submission rights.

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

1. Watch the complete final encoded video and confirm every visible pre-existing image may be used in the public submission.
2. Add only a rights-cleared voiceover, if desired.
3. Verify the uploaded video signed out.
4. Keep the repository private and grant the two judge accounts access unless a deliberate repo-wide license decision is made.
