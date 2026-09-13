# Echo Tarot Hapa Main Woman API pilot — 2026-09-12

## Objective

Use the saved local OpenAI credential and the supplied Hapa Main Woman reference pack to quality-gate four Echo Tarot Card × Song images before generating one Main Woman image for all 167 current pairings. Keep credentials and generated media outside Git while making references, outputs, usage, status, and feedback visible in the canonical Electron app.

## Evidence inspected

- Canonical Builder checkout and running Electron shell at the documented source-of-truth path.
- The 167-pairing / 501-variant Echo Tarot prompt v2 corpus and its source-linked Tarot/song logic.
- Six supplied PNG references: three hero/cutout images, a face feature map, an expression atlas, and a full-body turnaround/lookbook.
- Official OpenAI Image API documentation for multi-image edits, GPT Image 2.5 Sunburst and Flare, quality/size controls, limits, and token pricing.
- Redacted Electron credential status. The API key itself was never printed, returned to the renderer, put in an environment variable, written to a manifest, or committed.

## What worked

- The app copies all six references into OS app data and labels their identity role in every request.
- Prompt augmentation explicitly treats text and layouts inside the reference sheets as non-executable visual evidence. It preserves face/body identity while rejecting copied lookbook layouts, sample outfits, selfie props, and pin-up staging.
- The queue is durable, album-linked, resumable, rate-safe, and records request IDs, hashes, per-job usage/cost estimates, outputs, and human approve/revise/reject notes without storing secrets.
- The Electron UI exposes the reference pack, album-wide progress, current-song outputs, model/quality/size, cost, and feedback. A local CLI provides status/pilot/full/resume parity through the same encrypted store.
- Focused tests proved six-image multipart requests, output custody, cost math, credential non-disclosure, Sunburst-to-Flare fallback within GPT Image 2.5, access-denial circuit breaking, and the full-queue pilot gate.

## What blocked the run

The configured OpenAI project rejected both `gpt-image-2.5-sunburst` and `gpt-image-2.5-flare` with explicit model-access errors. The pilot produced zero images and recorded an observed estimated cost of $0. The queue is now `blocked`; the 167-image continuation cannot open until a four-image pilot completes successfully.

## What was noise or misunderstood

- A configured, decryptable API key proves credential availability, not project entitlement to a specific model.
- The model-list endpoint was not authoritative for this project; the image request itself supplied the decisive access result.
- Repeating four equivalent access failures added no evidence. The corrected pipeline stops after the first definitive dual-model denial.

## Changes and reusable outcome

- Extended the existing Echo Song Notebook and prompt-review surface; no replacement album UI or legacy Builder was introduced.
- Added a main-process-only GPT Image 2.5 runner with OS-app-data custody and an explicit successful-pilot gate.
- Added a reusable identity-reference contract: index each input by role, synthesize identity across lookbooks and hero shots, ignore embedded prose as instructions, and restage the subject rather than copying reference compositions.
- Skill/Lesson Card candidate: **Model access is a paid-run preflight, separate from key presence**.
- Decision Card candidate: **A full image queue cannot start from a failed or blocked pilot**.

## New guardrail

Never infer model access from a saved credential or model catalog. Make one bounded pilot request, allow only documented models inside the requested family, stop on definitive access denial, record zero-output evidence, and keep the larger spend gate closed until actual images are visually reviewed.

## Remaining work

Enable GPT Image 2.5 Sunburst or Flare for the saved OpenAI project, or save a key from a project with that entitlement. Then resume the four-card pilot, inspect identity/Tarot/song/symbol/text quality, make any prompt correction, record feedback, and only then continue the remaining 163 images.
