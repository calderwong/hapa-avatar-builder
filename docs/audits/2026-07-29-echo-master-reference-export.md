# Echo Master Reference export — implementation reflection

- **Objective:** make the Builder export one repeatable, wiki-ready Echo Album
  Markdown reference containing titles, lyrics, associations, metadata, and
  telemetry.
- **Evidence inspected:** canonical songbook and Hapa song-store schemas,
  Reference Atlas run/graph/observability, current Echo UI, API routing, CLI
  conventions, and parity documentation.
- **Reused:** the existing Echo workbench, current Reference Atlas store, and
  the Builder's read-only export pattern.
- **Adapted:** a shared pure compiler now serves UI, API, and command-line
  workflows; explicit anchors add wiki traversal without changing source IDs.
- **Left alone:** Song Card minting, source stores, Reference Atlas review
  authority, generated media, and Overwind publication.
- **What worked:** stable-ID joins cover the 157-track corpus while retaining
  both curated and mined associations; categorized JSON blocks prevent nested
  metadata and telemetry loss.
- **Noise avoided:** avatar-service and older Builder copies were rejected by
  the canonical name-resolution gate.
- **Correction:** “Echo Album” is an active projection of the Dear Papa source
  corpus, not a replacement album identity. The export states both.
- **Reusable outcome:** Flow/Skill candidate — “multi-store master-reference
  Markdown snapshot with stable wiki anchors and authority-preserving receipts.”
- **New guardrail:** future export fields must be added to the shared compiler
  and verified across UI/API/CLI; no surface may silently promote review,
  publication, mint, or canon status.
