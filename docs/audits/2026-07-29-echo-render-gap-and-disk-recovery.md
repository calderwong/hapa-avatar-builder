# Echo render gap and disk recovery

Date: 2026-07-29

## Objective

Prevent Director Cut renders from reaching HyperFrames with loop media that cannot cover its assigned timeline window, preserve the useful encoder reason when a render still fails, and recover local disk space without deleting source media or the current repaired render.

## Evidence inspected

- The failed `You Know How It Goes` render stopped at 83.2% video-frame coverage for one loop and reported six additional clips below the 95% acceptance threshold.
- The generated show contained 63 local looping video slots. Seven packaged copies were shorter than their authored windows.
- Five long packaged videos had keyframe intervals above HyperFrames' two-second seek-safety boundary.
- The writable APFS Data volume had 18 GiB free. The separately reported sealed system volume made the Mac appear to have more usable space than it did.
- Measured reclaimable data included abandoned local render work, HyperFrames extraction cache, npm and pip download caches, Go build cache, and obsolete Homebrew downloads.

## What worked

- The repair stays at the packaged-render boundary: it extends and normalizes copied media after the show is compiled and before pixel acceptance or final rendering.
- Original card and source-media files are not modified.
- The existing 95% frame-coverage gate remains in force.
- Non-alpha packaged videos can be made seek-safe with constant 30 fps and one-second keyframes.
- Alpha video fails closed with a specific blocker instead of being converted in a way that could destroy transparency.
- The exact failed show now reports 63 loop slots, zero coverage gaps, zero sparse-keyframe warnings, and zero blockers.
- A real HyperFrames proof cleared media extraction at 97.3% minimum coverage, began rendering, and captured 175 frames before the proof run was intentionally stopped.

## Noise and misunderstandings removed

- The UI previously reduced a precise frame-coverage error to a generic renderer exit message. The useful source, frame count, coverage, and threshold are now retained.
- A boolean `loop` attribute at the end of an HTML tag must be recognized even when no following attribute exists.
- `ffprobe` keyframe CSV values may contain trailing commas, so timestamp parsing must accept the numeric prefix.
- Root-volume free space is not the same as writable Data-volume free space on this macOS APFS layout.

## Changes

- Added a reusable loop-coverage and keyframe preflight.
- Inserted the preflight after show packaging and before pixel QA/final render.
- Added an operator CLI and JSON evidence report.
- Added regression coverage for duration gaps, the two-second keyframe boundary, idempotent loop extension, detailed renderer errors, and sparse-keyframe normalization.
- Removed nine abandoned render workspaces and reproducible tool/build caches. The active repaired show and all source media were retained.

## Reusable guardrail

Every local Director Cut render now follows this boundary:

1. Compile the editable cut into an isolated HyperFrames package.
2. Inspect every local video slot and its assigned timeline window.
3. Extend undersized loop copies and normalize unsafe long-video keyframes.
4. Re-probe the repaired package and write `loop-coverage-preflight.json`.
5. Continue only when coverage, seek safety, and blockers are clean.

This is a reusable Flow/Decision candidate. It should remain attached to the local renderer rather than becoming an ingest-time mutation because a single source can be assigned different windows in different cuts.

## Turn-to-Lore reflection

The durable lesson is that render readiness belongs at the final packaged-media boundary, where authored timing and actual encoded duration can be compared without changing canonical media. Disk readiness also needs to inspect the writable APFS Data volume and distinguish reproducible caches from current work and source assets.
