# Echo Reference Evidence, Canon, Rights, and Privacy Policy

Status: First Pass / Prototype policy  
Applies to: mining inputs, Reference Cards, graph edges, user proposals/challenges, playback projections, Avatar Minds, and director packets

## Core rule

Reference detection is not reference understanding, and interpretation is not authorial intent. The system may propose routes through evidence; only explicit Human authority can approve an interpretation or establish canon.

## Evidence ladder

| Class | Required support | Allowed claim |
|---|---|---|
| Direct | Exact title, character, distinctive phrase, or mechanic in the lyric plus an identified occurrence | “The lyric contains this marker.” |
| Source-backed candidate | Multiple inspectable signals plus resolvable sources | “This may point toward…” |
| Comparative | A sourced mechanic/theme is useful, but no work-specific marker is present | “This opens a comparison route.” |
| Unresolved | A clue is recurrent or potentially high leverage but not resolved | “This remains an open namespace.” |

Confidence never changes the evidence class by itself.

## Review and canon

- `proposed` and `pending-review` content is visibly labeled and excluded from approved-only projections.
- `approved` means a reviewer accepted this revision at its declared evidence class.
- `challenged` preserves the current and counterinterpretation views until resolution.
- `rejected`, `superseded`, and `withdrawn` remain in append-only history.
- `soft-canon` and `canon` require an explicit Human canon action separate from approval.
- No model, score, vote, contributor reputation, or migration can promote canon.

## Source policy

Prefer, in order:

1. creator, publisher, franchise, platform, standard, library, museum, or other authoritative primary sources;
2. reliable secondary scholarship or reporting when a primary source cannot support the needed contextual claim;
3. clearly labeled comparative/community material for exploratory context only.

Every external claim requires:

- resolvable URL or stable local evidence handle;
- source class, label, author/publisher when available;
- retrieval and freshness timestamps;
- claim IDs supported by that citation;
- minimal rights-safe excerpt;
- failure state when unavailable, stale, ambiguous, or blocked.

Unsupported claims remain unresolved or are rejected. Network failure never becomes evidence.

## Copyright and ownership

- Lyrics remain source text and must not be reproduced beyond the minimum span necessary for in-app analysis.
- External names, works, images, recordings, logos, and text remain owned by their respective rights holders.
- A Reference Card provides attribution and analysis; it does not imply Hapa authorship, endorsement, license, or ownership.
- Store short excerpts only when policy permits. Prefer a summary and source pointer.
- Media is reference-only unless a separate license or operator-owned source proves reuse rights.
- Contributor custody preserves attribution but does not transfer ownership.

## Privacy and personal clues

- Personal clue packets are opt-in and private by default.
- Private notes, memories, identities, location data, credentials, and inferred sensitive attributes are excluded from public cards.
- Public projection is a separate allow action and fails closed when private clues or citations remain.
- Withdrawing a clue hides future projections and triggers an impact review; append-only restricted audit history remains where lawful and necessary.
- Minors, non-public people, and sensitive identity claims require heightened Human review.

## User proposals and challenges

Adding evidence, proposing an interpretation, challenging a claim, approving a revision, publishing it, and declaring canon are separate actions.

Contributors may not:

- directly edit approved evidence or decisions;
- remove an interpretation merely by challenging it;
- publish private evidence;
- use voting to establish fact or canon;
- attach executable content, tracking links, credentials, or unredacted personal data.

Challenges must specify factual correction, missing evidence, alternate reading, confidence, scope, privacy/rights, or abuse. A challenge is an allegation pending review, not proof that the target is wrong.

## Public playback projection

Default playback shows approved, public-safe material. Candidate mode is an explicit opt-in and must display evidence class, status, confidence, and caveats. Challenged content displays the challenge state and alternative route without revealing private reports.

## Downstream projections

Avatar Minds and director/screenplay packets receive:

- card and revision ID;
- exact lyric occurrence;
- evidence and review class;
- caveats and source pointers;
- rights/privacy-safe projection;
- downstream impact/withdrawal handle.

Unapproved content may enter only an explicitly labeled exploratory draft. It cannot silently become character memory, factual lore, public exposition, or canon.

## Fail-closed conditions

Do not publish or activate a projection when:

- a required citation cannot be resolved;
- claim pointers are broken;
- approval/canon actors are missing;
- private clues or citations remain in a public card;
- rights status is disallowed or unknown for requested reuse;
- a high-priority privacy, credential, or safety report is unresolved;
- provenance or revision identity is missing.
