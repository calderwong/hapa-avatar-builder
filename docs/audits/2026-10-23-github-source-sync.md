# GitHub source synchronization — 2026-10-23

Calder explicitly requested committing and pushing Hapa Avatar Builder to GitHub.
This is a one-time source publication, not a permanent lift of the submission
freeze. Runtime stores, source audio, generated media and credentials stay local.

The local source and GitHub main had diverged. This merge preserves both histories,
the existing MIT license, public fixtures and Pages workflow, alongside current
Echo Album, Living Light, voice and motion-source features. The public README
entry route is retained together with current operator documentation.

Verification: clean dependency installation (install scripts disabled), production
build and receipt check, Pages build and curated-asset boundary check, 150 focused
checks across voice, motion sources, timing, song normalization, Overcard and public
demo contracts. The song-domain suite needs the ignored local songbook; its first
isolated run failed for that missing input, then all eight checks passed with the
existing source songbook available read-only. This is not a claim that the whole
runtime-dependent repository suite passes.

Browser inspection found that the new Tarot projection startup could hydrate the
local library before demo mode finished initializing. Demo guards now cover those
loaders, reference polling and Director prewarming. The corrected Pages preview
mounted the 3D table with three public Avatars, three Songs, sixteen Wisdom Cards,
and a ready public projection. No private store is included in the Pages artifact.

The merge also exposed an incompatible optional dependency lock entry; reconciliation
and a fresh clean install verified the repair. Pages now generates the retained
Living Light wrapper before bundling, matching the normal build prerequisite.

Reusable lesson: a successful text merge and build do not prove demo isolation.
Check startup hydration against a running local API as well as the static artifact.
Preserve the failed observation rather than reporting an uninterrupted clean pass.
The exact push and restored ruleset receipts remain with the local execution record.
