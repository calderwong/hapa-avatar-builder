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
- Focused tests proved six-image local custody with an explicitly marked one-sheet API subset, output custody, cost math, credential non-disclosure, dated-snapshot selection, bounded route retries, Sunburst-to-Flare fallback when model-list access is inconclusive, access-denial circuit breaking, and the full-queue pilot gate.

## What initially blocked the run

The project allowlist exposed only the dated snapshots `gpt-image-2.5-sunburst-2026-09-08` and `gpt-image-2.5-flare-2026-09-08`, while the first runner recognized only the undated aliases. After snapshot selection was fixed, the Image API accepted generation and one-image edit requests. Multi-sheet edits remained unreliable: some two-image combinations triggered safety moderation, while other two-to-six-image combinations returned a misleading `model_not_found` response even though the selected snapshot was visible and single-image requests succeeded.

The reference inspection explained the safety boundary: several supplied hero/body sheets use body-focused swim/underwear styling. The stable request policy now archives and displays all six local references but submits the non-body face identity / feature map as the single high-fidelity API input. The map itself contains front, three-quarter, profile, and feature close-ups.

## What was noise or misunderstood

- A configured, decryptable API key proves credential availability, not project entitlement to a specific model.
- An API `model_not_found` response did not always mean missing entitlement. The same dated snapshot succeeded on adjacent requests, so model-list visibility plus a successful generation/edit probe is the stronger diagnosis for this rollout.
- Embedded negative wording that explicitly named revealing reference garments added no value. The corrected identity contract simply asks for complete story-appropriate wardrobe and forbids copying reference wardrobe or body-focused framing.
- A court-card instruction that printed `Page` at the top and `Page of Wands` at the bottom produced redundant typography. Prompt schema v3 leaves the top free of rank/title text for Page, Knight, Queen, and King cards.

## Changes and reusable outcome

- Extended the existing Echo Song Notebook and prompt-review surface; no replacement album UI or legacy Builder was introduced.
- Added a main-process-only GPT Image 2.5 runner with OS-app-data custody and an explicit successful-pilot gate.
- Added a reusable identity-reference contract: preserve the full local evidence pack, explicitly mark the API-submitted subset, ignore embedded prose as instructions, and restage the subject rather than copying reference compositions.
- Skill/Lesson Card candidate: **Model access is a paid-run preflight, separate from key presence**.
- Decision Card candidate: **A full image queue cannot start from a failed or blocked pilot**.

## New guardrail

Never infer model access from a saved credential alone, and never infer missing entitlement from one overloaded `model_not_found` response. Confirm the exact snapshot through `/v1/models`, probe generation and one-image editing independently, keep reference-submission policy visible, retry transient snapshot routing without changing models, and keep the larger spend gate closed until actual images are visually reviewed.

## Remaining work

The dated Sunburst snapshot completed the four-card pilot with zero final failures and an observed estimated cost of $0.234134. Visual review found strong identity continuity, readable canonical Tarot symbols, and clear song-specific staging. Continue the remaining 163 images with the v3 court-title rule, monitor transient routing retries and moderation failures, and keep all generated media in OS app data for human approval.
