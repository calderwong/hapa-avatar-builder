# Echo Album song sorting

The **Sort songs** menu above the Song Directory and Director Workbench offers
Name (A–Z), Date created / added — newest first, and oldest first. Both lists
share the choice, and the browser remembers it across reloads. Search and audio
file filters still apply; sorting does not select a different song or edit cuts.

Dates come from the canonical Song Card through the existing Audio Atlas
inventory: prefer a valid `addedAt`, then `createdAt`. They describe the album
entry, not the recording's original release, a file modification time, or a
Director cut's regeneration. Missing/invalid dates sort last in both directions;
equal dates use title and exact Song ID for a stable order. No date is invented
or written back to the catalog.

October 23, 2026: Codex implemented Calder's request by extending the existing
inventory and album navigation helper, without a new service. Live Director
checks show the seven incremental recordings first under newest-first, and
different oldest/name orders. Production build passes. Existing navigation and
inventory checks: 15 pass; the independent catalog-parity assertion reports
American Kings lacks `scroll-fal-authored-v1`. That assertion only reads saved
variant filenames; this change does not touch them or claim to repair that gap.

Reusable lesson: sort by stable Song Card dates, never freshly regenerated cut
dates. Human creative review and the separate local motion-loop run are
unaffected. This is a local prototype behavior, not a release-history claim.
