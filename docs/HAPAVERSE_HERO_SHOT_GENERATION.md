# Hapaverse Hero Shot Generation

This process creates three GPT Image production jobs for every Garden, Protocol, and Node card in the Item Manager.

The queue exists because Codex subscription image generation is an operator action, not a normal app API key. A Codex agent or human claims a job, uses the claim packet references in GPT Image, saves the generated file, then completes the job so the image is attached to the source card.

## Commands

```bash
npm run hero-shots:seed
npm run hero-shots:status
npm run hero-shots:claim -- --kind garden --limit 1
npm run hero-shots:complete -- --job-id <job-id> --local-path <generated-image-path>
npm run hero-shots:recover -- --claim-path <claim-packet> --rollout-path <codex-rollout-jsonl> --complete
```

Useful filters:

```bash
npm run hero-shots:claim -- --kind protocol --shot hapa_tarot_card --limit 3
npm run hero-shots:status -- --next --kind node
npm run hero-shots:fail -- --job-id <job-id> --reason "missed Hapa Tarot frame"
```

## Codex Desktop Inline Image Recovery

The local imagegen skill says built-in Codex image generation should save under `$CODEX_HOME/generated_images`, and older runs on this machine did create `~/.codex/generated_images/**/ig_*.png` files. In the current Codex Desktop projectless thread, the built-in image tool can instead render the image inline while storing the PNG only inside the thread rollout JSONL as `image_generation_call.result` base64.

When that happens, the image generation did succeed, but there is no normal file path for `hero-shots:complete` to consume until the rollout result is recovered:

```bash
npm run hero-shots:recover -- \
  --claim-path data/media-generation/hero-shot-claims/<claim-id>.json \
  --rollout-path ~/.codex/sessions/<yyyy>/<mm>/<dd>/<rollout-file>.jsonl \
  --complete
```

`hero-shots:recover` reads the claim packet order, extracts the next matching PNG blobs from `image_generation_call.result`, writes them under `data/media-generation/extracted-rollout/`, and, with `--complete`, attaches each recovered file to the correct card through the normal completion contract. Use `--since <iso-time>` or `--skip <count>` if a rollout contains unrelated image generations before the claim.

If one generated image is rejected after a better replacement is generated, use `--select` to map only the accepted image result indexes to the claim jobs. For example, if the first image is good, the second is rejected, and the third/fourth are the replacement and final shot:

```bash
npm run hero-shots:recover -- \
  --claim-path data/media-generation/hero-shot-claims/<claim-id>.json \
  --rollout-path ~/.codex/sessions/<yyyy>/<mm>/<dd>/<rollout-file>.jsonl \
  --select 0,2,3 \
  --complete
```

## Shot Set

Each target card gets three jobs:

- `hapa_tarot_card`: vertical card hero using Hapa Tarot card frame grammar.
- `mechanic_teaching`: explanatory visual of the reusable mechanic, flow, gate, production loop, or operating principle.
- `in_world_action`: cinematic Hapaverse scene showing the card being used, visited, invoked, or operated.

## Required References

Every claim packet includes three existing Hapa aesthetic anchors:

- The Card Primitive
- Sovereign Memory Engine
- Distributed Knowledge Evolution Protocol

Every claim packet also includes Hapa Tarot Cards specifically:

- The Artifact
- The Ferry
- The Edge

Use the Hapa Tarot references for vertical tarot-frame grammar, title/stat plate zones, ornamental border language, and major-arcana staging. Do not copy exact text, ship silhouettes, or OCR artifacts from those cards.

## Required Style Guides

Every claim packet cites these existing guides:

- `/Users/calderwong/Desktop/hapa-design-system/docs/HAPA_DESIGN_SYSTEM.md`
- `/Users/calderwong/Desktop/hapa-design-system/components/cards/CARDS.md`
- `/Users/calderwong/Desktop/hapa-design-system/tokens/hapa-neon.tokens.json`
- `/Users/calderwong/Documents/Codex/2026-06-10/files-mentioned-by-the-user-screenshot/outputs/hapa-avatar-builder/docs/STYLE_GUIDE_NEONBLADE_PLUS.md`

The prompt packet extracts the operative rules: Hapa Neoblade / NeonBlade Operator, cards as atomic records, light as semantic language, hue-by-card-type, deep glass panels, luminous hairline borders, scanline/grain discipline, and no tiny baked-in text in card art.

## Completion Contract

`hero-shots:complete` copies the generated image into:

```text
data/media/hapa-card-hero-shots/<kind>/<card-slug>/
```

Then it attaches the image to the source Item Manager card as a normal `mediaAssets` entry tagged:

```text
hero-shot, gpt-image, hapa-neoblade, hapa-tarot-reference, <kind>, <shot-id>
```

That makes completed shots visible in the builder, item manager, avatar decks, and card showcase flows that already read Item Manager media.
