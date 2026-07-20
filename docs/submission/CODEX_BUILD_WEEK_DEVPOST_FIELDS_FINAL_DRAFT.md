# Devpost field packet — final draft

## Project name

Hapa Stargate

## One-line description

Turn attributable, Hypercore-backed Card Documents into deterministic collaboration spaces that humans and agents can safely revisit, share, and learn from.

## Track

Developer Tools

## Inspiration

AI agents can perform useful work and still leave behind a transcript that loses source custody, decisions, attribution, and reusable learning. Hapa treats each useful artifact as a portable Card Document with identity, relationships, and append-only history. The Build Week question was: can ordered Cards become a safe, inspectable collaboration address rather than another disposable chat room?

Hapa is intended as a shared decentralized Card protocol and platform, not the submitted company. Hapa Avatar Builder is one compatible participant and the host for this reference path.

## What it does

Inside the pre-existing Hapa Avatar Builder 3D Tarot Draw, a user places Hapa Cards in a deliberate order. Ordinary Cards can receive real per-Card Hypercore custody and a `card.created` receipt. The ordered Formation then derives a deterministic private namespace, visualized as a Stargate.

The Formation can be saved as one portable Context Card. It retains safe scene and formation commitments but never stores the Gate secret, complete private address, join capability, credential, token, key, or local path. Restoring it reconstructs the exact Formation while remaining disconnected.

After explicit human approval, the same Context Card can move through origin staging, Overwind acknowledgement, and a source-only `.hapaCatalog` projection, then return at its pinned revision without creating a competing head. A separate short-lived Gate Pass lets two isolated local profiles verify the same Card and meet over Hyperswarm, Noise, and Protomux. Inside the Gate, Context Forge freezes selected evidence and asks a local model for a proposed, unminted Card. Three peer-blind Wisdom Cards evaluate that packet from different rules while preserving dissent for the human.

## What was built during Codex Build Week

Hapa Avatar Builder, the broader Card system, and the 3D Tarot Draw existed before the event. During Build Week, Codex and an operator-selected GPT-5.6 Sol session extended that foundation with the focused Stargate path: Card-birth Hypercore custody, ordered deterministic namespaces, portable Context Cards, human-gated Catalog interoperability, expiring Gate Passes and a signed two-profile local P2P proof, consented Comment Cards, Truth Constellation, Context Forge, and peer-blind Wisdom Council.

The conservative product implementation slice is 22 commits across 124 files, with 19,136 insertions and 326 deletions from `0b793a9` through `f10c2f8`. A large July 13 release-packaging commit is deliberately excluded because it packages pre-existing work. Later submission hardening adds the isolated custody capture, a state-transition regression test, public-safe fixture boundaries, reproducible judge packaging, and preflight evidence; it does not expand the product headline.

## How we built it

- Electron and React host the existing Avatar Builder application.
- Three.js renders the Tarot table, ordered Cards, and Stargate activation.
- Hypercore provides real per-Card append-only custody receipts.
- Deterministic Card and Formation commitments separate semantic identity from transient camera, phone, and transport state.
- Hyperswarm discovery, Noise encryption, and Protomux carry the signed two-profile local proof.
- The Hapa node contract keeps UI, API, and CLI views aligned.
- Local Ollama inference proposes Context and Wisdom Cards; proposals remain unminted until human approval.
- Append-only board, proof, incident, and attribution records preserve what happened, in what order, and with what verification state.

## How Codex and GPT-5.6 helped

Codex inspected the local Hapa ecosystem and Git history, traced Card, Tarot Draw, Hypercore, Catalog, Overwind, and P2P boundaries, implemented matching surfaces, created bounded proof paths, generated current demo evidence, and packaged a clean judge route. It also diagnosed a recursive-worker incident and converted that failure into process guards and static-analysis guidance.

GPT-5.6 Sol was the operator-selected build-time reasoning partner, not a hidden runtime dependency. It maintained the cross-node system model, challenged claims such as “custody equals ownership,” separated pre-existing work from the eligible extension, and helped turn mistakes into reusable protocol learning. The exact model label is operator-declared because the session does not expose a separately verifiable runtime identifier.

## Challenges

The hardest part was not making a portal animation. It was maintaining truthful boundaries across a large pre-existing ecosystem: custody is not mint, a restored Context Card is not connected, a local encrypted peer proof is not internet-scale deployment, and generated Card proposals are not human-approved records. We also had to stop rebuilding already-working Tarot Draw infrastructure, move the Stargate into its correct host, isolate generated media from deployment, and harden subprocesses after an overly broad verification path recursively spawned workers.

## Accomplishments

- A visually legible ordered-Card-to-Stargate path inside the actual Tarot Draw UI.
- Real lazy Hypercore custody and fail-closed deterministic derivation.
- Portable safe Context Cards and pinned-revision Catalog round trips.
- A signed encrypted two-profile local meeting proof.
- Human-governed local-AI proposal and peer-blind Wisdom evaluation.
- A public-safe judge source package with vendored Overcard dependency, pinned file hashes, zero known dependency advisories at packaging time, focused tests, and an isolated evidence capture that does not touch the operator's live app.

## What we learned

Protocol demonstrations are strongest when the evidence artifact is part of the product story. The same Card model that describes work can also preserve its receipts, disagreement, failures, and later learning. We also learned to inspect the named existing surface before building, prefer static analysis before runtime verification, give every spawned process an ownership boundary and deadline, and keep private runtime assets outside source and deployment.

## What's next

The next step is remote multi-machine testing of the current local P2P proof, followed by broader Hapa node adoption of the same Context Card and Gate Pass contracts. Physical-phone participation, live local image attachment, Memorial Corridor, Passport, internet-scale discovery, and autonomous commerce remain future work rather than submission claims.

## Built with

Codex Desktop, GPT-5.6 Sol (operator-declared), Electron, React, Three.js, Hypercore, Hyperbee, Hyperswarm, Noise, Protomux, Node.js, Ollama, qwen3.5:27b, HyperFrames, and FFmpeg.

## Links to fill after publication

```text
Public demo video: [YOUTUBE_URL]
Judge source/repository: [REPOSITORY_OR_BUILD_URL]
Primary Codex Session ID from /feedback: [CODEX_SESSION_ID]
Testing instructions: docs/submission/JUDGE_QUICKSTART.md
```

## Testing instructions field

Use macOS on Apple Silicon with Node.js 22+. Run `npm ci`, `npm run build`, `npm run build:check`, and `npm run test:judge`. Start the public-safe build with `node server/api.mjs --host 127.0.0.1 --port 8899 --static dist`, then open `http://127.0.0.1:8899/?view=tarot&stargateDemo=1`. No certificate, API key, cloud account, private Hapa data, or local model is required. See `docs/submission/JUDGE_QUICKSTART.md` for the five-minute route and exact truth boundary.
