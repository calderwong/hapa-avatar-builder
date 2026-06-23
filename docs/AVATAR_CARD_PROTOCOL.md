# Avatar Card Protocol

Schema: `hapa.avatar-card.v1`

The Avatar Card is the shared object used by humans, the UI, agents, the API, the CLI, and future healing processes.

## Core Shape

```json
{
  "schemaVersion": "hapa.avatar-card.v1",
  "id": "red-reaper",
  "primaryName": "Red",
  "names": [
    {
      "name": "Red",
      "dossier": { "status": "seeded", "assetId": "asset-red-dossier" },
      "kitSheet": { "status": "seeded", "assetId": "asset-red-kit-sheet" }
    }
  ],
  "three_paragraph_background_narrative": "First-person three-paragraph introduction speech for reader-facing Avatar Card context.",
  "slots": [],
  "assets": [],
  "activity": []
}
```

`three_paragraph_background_narrative` is the reader-facing in-character introduction shown on the Avatar Card. It should contain exactly three paragraphs separated by blank lines: identity, scene/location, and the audience-facing orientation.

## Required Slots

| Requirement | Count |
| --- | ---: |
| Character Dossier | 1 per name |
| Kit Sheet | 1 per name |
| Kit Poses | 4 |
| Kit Items | 9 |
| Close-up Emotion Shots | 6 |
| Close-ups with Backgrounds | 4 |
| Backgroundless Full Body Shots | 9 |
| Backgroundless 2/3rds Shots | 3 |
| Full Body Concept Art Shots | 4 |

For Red/Reaper, two names make the total 43 required slots.

## Agent Attach Pack

Use the attach pack when another process needs the avatar as a reference source:

```bash
npm run cli -- attach red-reaper --target comic --json
```

The pack includes:

- `baseReferences`: dossier, backgroundless full bodies, concept art, and emotion close-ups.
- `videoBranches`: video assets attached to image state/start-frame assets.
- `stateGraph`: image state nodes that currently own video branch ids.
- `allReferences`: every attached asset grouped by slot role.
- `completeness`: deterministic audit data.
- `useGuidance`: short production rules for agents.

Large inline `data:` URIs are compacted in attach packs and described with `uriInfo`. New uploads should prefer `/media/...` local media URIs.

## Video Branches

Video branches are optional assets attached to an image state. They do not change completeness counts because the still-image scaffold remains the standard target.

```json
{
  "id": "red-front-run",
  "name": "red-front-run.mp4",
  "type": "video",
  "uri": "/media/red-front-run.mp4",
  "parentAssetId": "red-front",
  "state": {
    "kind": "video-branch",
    "branchIndex": 1,
    "startFrameAssetId": "red-front",
    "startFrameName": "red-front.png",
    "lineage": ["red-front"]
  },
  "tags": ["video", "branch", "motion", "run"],
  "metadata": {
    "duration": 4.2,
    "width": 1280,
    "height": 720
  }
}
```

The corresponding attach-pack branch includes its start frame:

```json
{
  "videoBranches": [
    {
      "id": "red-front-run",
      "parentAssetId": "red-front",
      "startFrame": {
        "id": "red-front",
        "uri": "/media/red-front.png",
        "role": "fullbody_backgroundless"
      }
    }
  ]
}
```

## Healing Plan

The healing plan is a list of missing slots with prompt hints:

```bash
npm run cli -- heal-plan red-reaper --json
```

Each task includes:

- `avatarId`
- `slotId`
- `requirementId`
- `priority`
- `promptHint`
- `status`

This is designed so a future batch generator can pull queued work without interpreting the UI.

## Local Preview Asset Lifecycle

Local media selected in the UI start as intake assets:

```json
{
  "source": "file-picker",
  "processing": {
    "status": "previewed",
    "attachedToCard": false
  }
}
```

After dragging the preview into a required slot, the same asset is written into the Avatar Card with:

```json
{
  "processing": {
    "status": "attached",
    "attachedToCard": true,
    "slotId": "closeup_emotions-1"
  }
}
```

The asset also keeps metadata such as original file name, MIME type, byte size, width, height, and video duration when available.

## Overfill Slots

When a required section has reached its target, dropping another asset onto the section creates an optional overfill slot:

```json
{
  "required": false,
  "overfill": true,
  "assetId": "local-extra-reference"
}
```

Overfill assets are attached to the Avatar Card and appear in attach packs, but they do not increase the standard required target.
