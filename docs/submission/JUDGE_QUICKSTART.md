# Judge quickstart — Hapa Stargate

## What is new for Build Week

Hapa Avatar Builder and its 3D Tarot Draw existed before the event. The eligible extension is the Stargate reference path: per-Card Hypercore custody, ordered deterministic namespaces, safe portable Context Cards, human-gated Catalog interoperability, expiring Gate Passes, a two-profile encrypted local proof, consented Comment Cards, Context Forge, and peer-blind Wisdom Council.

## Requirements

- macOS on Apple Silicon is the tested path
- Node.js 22 or newer and npm
- about 1 GB of free space for dependencies and build products
- no certificate install, cloud account, API key, or local model is required to compile and inspect the judge package

## Five-minute build check

```bash
npm ci
npm run build
npm run build:check
```

The final command must print `"ok": true` and a semantic SHA-256 receipt.

## Launch the public-safe bootstrap

```bash
node server/api.mjs --host 127.0.0.1 --port 8899 --static dist
```

Open `http://127.0.0.1:8899/?view=tarot&stargateDemo=1`. The non-default port avoids colliding with another local Hapa node. The package starts with a curated public demo volume: Red, Blue, and Green; three text-only Echo State Song Cards; five sampled Cards in each visible foundation family; 18 additional Protocol/Skill Cards required by the RGB profile loadouts; the complete 16-card Build Week Wisdom Set with its generated proposal artwork; and four clearly labelled deterministic Stargate demo Cards. It does not contain the remaining private Avatar, Song, Tarot, Card, or media libraries. No certificate is used or required.

In the Stargate panel, choose **Load Public Demo Formation**, inspect the ordered slots, and dial the Gate. This fixture proves the deterministic UI route without representing a live invitation. The included captioned evidence video shows the separate isolated proof in which two ordinary Cards receive new per-Card Hypercore custody before the Gate resolves.

Use the Avatar rail to inspect the RGB profiles and their six-Card public loadouts. Use **Songs** for the Echo State previews, **Items** for the sampled and profile-required foundation Cards, and **Tarot Library → Codex Build Week Wisdom Set** for the complete Wisdom Set.

## Focused implementation tests

```bash
npm run test:judge
```

These tests cover the custody, deterministic Formation, portable Context Card, Gate Pass, and local encrypted meeting primitives. See the submission readiness document for the exact proof boundary and current receipts.

## Suggested judge route

1. Read `docs/submission/CODEX_BUILD_WEEK_CUTOFF_AND_CHANGE_AUDIT.md` for the pre-existing/new boundary.
2. Watch the captioned silent HyperFrames video.
3. Inspect `src/components/TarotDraw3DView.jsx` for the user-facing Formation, custody, Gate, Context Card, Forge, and Wisdom flow.
4. Inspect `src/domain/` and `server/` for the deterministic and P2P primitives.
5. Run the focused tests above.

The package was also validated from a freshly copied source package with `npm ci`, `npm run build`, `npm run build:check`, `npm run test:judge`, an HTTP health check, and the submission preflight. See `docs/submission/SUBMISSION_PREFLIGHT_RECEIPT.md` for pinned results.

## Truth boundary

- Hypercore custody is Card identity and append-only local history. It is not mint, ownership, commerce eligibility, or canon.
- The P2P receipt proves two isolated local profiles using encrypted Hyperswarm/Noise/Protomux. It does not prove internet-scale reachability.
- Context Forge local-model output remains a proposal until a human approves and mints it.
- Physical-phone participation, live Krea attachment, Memorial Corridor, Passport, and STG-014 are not submission claims.
