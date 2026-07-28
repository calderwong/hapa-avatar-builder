# Vibes.ai Transition Link Workflow

Status: First Pass / Prototype Stage  
Owner: Hapa Avatar Builder  
Provider adapter: Vibes.ai in the Codex in-app browser

## Objective

Create short transition videos between two exact Builder image Cards. Reference Atlas images, Avatar Card images, and Scene Card images may be either endpoint. The finished video is not a loose generation: Builder copies it into local media custody and records it as a Link whose first-frame and last-frame relationships point back to the exact two Cards and assets.

Vibes is the generation surface. Builder is the source of truth for frame identity, queue state, concurrency, completion, local video custody, and lineage.

## Route script

1. `Reference Atlas + Avatar Store + Scene Store -> Transition Frame Catalog [DATA]`: Builder projects existing image assets into one local-path-safe catalog. Missing local files are omitted rather than uploaded from stale provenance.
2. `Transition Frame Catalog -> Transition Link Queue [CLI/DATA]`: an operator chooses two frame IDs and supplies a prompt. The deterministic pair-and-prompt identity prevents duplicate jobs.
3. `Transition Link Queue -> Three-slot Buffer [CLI/DATA]`: `pump` claims only enough queued links to maintain three active jobs. Claimed, submitted, and generating jobs all consume a slot.
4. `Three-slot Buffer -> Session Health Gate [UI/EVENT]`: before each submission, the browser verifies that the authenticated Vibes project UI is present. A redirect to the public landing or login surface records `recovering` and permits one safe `Log In` re-entry attempt using the browser's existing account session.
5. `Session Health Gate -> Vibes.ai Project [UI/HUMAN]`: if re-entry restores the project without requesting credentials, the session becomes `healthy` and the buffer resumes. Password, passkey, CAPTCHA, OTP, or account-choice prompts set `auth-required`, pause new provider submissions without releasing claims, keep the browser visible, and require the human account owner.
6. `Vibes.ai Project -> Builder Completion [UI/CLI]`: the operator uses Vibes `Copy link` and `Download`, then completes the job with the downloaded file and provider link.
7. `Builder Completion -> Media Library + Endpoint Cards [DATA/EVENT]`: Builder hashes and copies the video under `data/media/vibes-transition-links`, upserts a system-media record, writes relationships to the first-frame Card, last-frame Card, and Transition Link, emits an append-only event, and immediately claims the next queued job.
8. `Media Library -> Echo Director / Scene / Avatar consumers [UI/API]`: consumers query the normal Builder media library. The Link is reusable without treating Vibes or its project grid as canonical state.

## Operator workflow

Refresh the eligible frame catalog:

```bash
npm run echo:transitions -- catalog --kind reference --limit 20
npm run echo:transitions -- catalog --kind scene --query "Good Knight"
npm run echo:transitions -- catalog --kind avatar --query "Bella"
```

Queue one link:

```bash
npm run echo:transitions -- enqueue \
  --from "transition-frame:reference:..." \
  --to "transition-frame:scene:..." \
  --prompt "Create a continuous cinematic transition from the first frame into the last frame. Preserve identity, composition, and palette; use motivated camera movement and no text."
```

Fill the three-slot buffer:

```bash
npm run echo:transitions -- pump
```

Seed the complete Reference Atlas campaign. This creates a deterministic ring
with one outbound transition per valid Reference image; the final Reference
links back to the first, so every image has exactly one campaign job:

```bash
npm run echo:transitions -- seed-reference-ring \
  --project-url "https://vibes.ai/projects/<project-id>?tab=generate"

npm run echo:transitions -- coverage
npm run echo:transitions -- coverage --status missing
```

The command is idempotent. Running it again does not duplicate jobs with the
same endpoint pair, prompt, and model.

Record browser session health:

```bash
npm run echo:transitions -- session \
  --state healthy \
  --url "https://vibes.ai/projects/<project-id>?tab=generate" \
  --resume-url "https://vibes.ai/projects/<project-id>?tab=generate"
```

If the provider redirects away from the authenticated project:

```bash
npm run echo:transitions -- session \
  --state recovering \
  --url "https://vibes.ai/" \
  --resume-url "https://vibes.ai/projects/<project-id>?tab=generate" \
  --reason "redirected-to-public-landing"
```

The browser may click `Log In` once only when that action reuses the existing
account session without requesting credentials. If a password, passkey,
CAPTCHA, OTP, or account choice appears, do not automate it:

```bash
npm run echo:transitions -- session \
  --state auth-required \
  --url "https://vibes.ai/" \
  --reason "credential-or-otp-required"
```

Claims remain active while authentication is restored. This prevents another
worker from generating the same pair.

For each claim packet job:

1. Open the signed-in Vibes project in the Codex in-app browser.
2. Select `Start, end frame`.
3. Upload `from.path` as Start frame.
4. Upload `to.path` as End frame.
5. Paste the exact prompt and submit.
6. Record acceptance:

```bash
npm run echo:transitions -- submit --job-id <id> --project-url "https://vibes.ai/"
```

When Vibes finishes, use `Copy link` and `Download`, then import:

```bash
npm run echo:transitions -- complete \
  --job-id <id> \
  --video "/absolute/path/to/downloaded-transition.mp4" \
  --vibes-link "https://vibes.ai/..."
```

`complete` frees one active slot and calls the buffer pump. If work remains, its import report includes the newly claimed replacement job and claim packet.

## Records

- Queue: `data/vibes-transition-links/queue.json`
- Frame catalog: `data/vibes-transition-links/frame-catalog.json`
- Provider session state: `data/vibes-transition-links/session.json`
- Browser claim packets: `data/vibes-transition-links/claims/*.json`
- Append-only events: `data/vibes-transition-links/events.ndjson`
- Saved videos: `data/media/vibes-transition-links/*`
- Link relationships: `data/media-library.json`
- Import reports: `data/merge-reports/vibes-transition-*.json`
- Store backups: `data/backups/media-library.before-vibes-transition-*.json`

## Buffer and failure rules

- Maximum concurrent provider jobs: 3.
- Slot-consuming states: `claimed`, `submitted`, `generating`.
- Non-slot states: `queued`, `ready`, `failed`.
- Completion and failure both replenish the buffer.
- A failed job is not retried implicitly. `fail --retry` returns it to the queue, but the deterministic ID still prevents a duplicate record.
- Do not click Vibes `Regenerate` to work around a failed job; record the failure first so attempts remain attributable.
- Do not delete provider outputs as part of this workflow.
- Session recovery never reads browser cookies, stored passwords, OTPs, or
  account secrets. It only re-enters through the visible provider UI and pauses
  at any credential-bearing or ambiguous human-auth step.

## Rights and truth boundary

Endpoint images retain their existing custody, rights, review, and canon state. A generated transition is a derived provider output, not identity truth, canon promotion, mint authority, public activation, or proof of sponsorship. The local media record deliberately preserves both source frame assets and the provider link.

## Flow Card

- Verb: `LINK`
- Type: `Media Transition`
- Rank: `Rare`
- Grade: `A`
- Description: Connect two exact Hapa image Cards with a locally custodied transition video.
- Effect: Maintains three provider jobs while preserving endpoint lineage and replenishing one slot per completion.
- Risk: Browser-side output can become detached from source frames if the claim packet, provider link, or downloaded file is skipped.
- Stats: impact 8, reliability 8, complexity 6, cost 5, speed 7, teaching 9.

## Learning delta

- Reused: Builder's local media store, system-media relationship model, Reference Atlas presentation images, Scene assets, Avatar assets, and append-only queue/event discipline.
- Adapted: the existing media-generation claim/complete protocol into a three-active-job video buffer.
- Added: a Reference Atlas ring campaign that gives every valid Reference image one deterministic outbound transition and exposes truthful coverage counts.
- Added: a session-health gate that can reuse an existing authenticated Vibes session but cannot impersonate the account owner or bypass credential, OTP, CAPTCHA, or account-selection gates.
- Left alone: Reference Card revisions, Avatar/Scene identity records, Vibes project history, and existing generated outputs.
- Guardrail: Vibes may generate the pixels, but only Builder completion creates the durable Link.
