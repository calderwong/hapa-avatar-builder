# Consented Camera and Phone Comment Cards

Implementation checkpoint: STG-011, 2026-07-18.

## Product rule

A video comment never edits the source Card. Avatar Builder binds one bounded capture to the exact selected Card revision, the active ordered Formation, and the safe Gate commitment. Explicit human consent is recorded append-only before media finalization. Finalization creates three separate proposed, unminted outputs:

1. a Video Comment Card carrying the content-addressed clip, author attribution, consent evidence, and `comments_on` edge;
2. a Lesson Card teaching the reusable “comments remain separate” rule;
3. a Result Card recording that consent, attribution, media custody, and source preservation were observed.

The source snapshot digest is verified before and after finalization. Comment presence, Camera/Phone presence, hover, pose, and other transient state are excluded from Formation and Stargate identity.

## Canonical experience

Use the existing Tarot Draw in `src/components/TarotDraw3DView.jsx`:

1. Dial a valid Stargate and select an identity-sealed source Card.
2. Open **Comment Cam**. The chamber visibly separates source Card `01` from proposed Comment Card `02` with an animated consent-and-attribution beam.
3. Name the human actor, set the bounded time range, and grant explicit capture consent.
4. Choose the existing **Camera Card** or **Phone · No Certificate** path.
5. The Camera Card stays alive during capture, then withdraws after the new amber Comment Card materializes.
6. Use **Reveal Card in 3D** to see the unchanged source and separate Comment Card connected by a cyan/gold/pink append-only lineage tether.

This extends the canonical Camera Card, Phone Card, Invite Cam, Roomlet, table, renderer, and scene grammar. It does not introduce a replacement phone UI or a second Tarot product surface.

## Phone bridge

The primary phone Comment path is intentionally certificate-free:

- the QR opens a short-lived token-bound local HTTP page;
- the page uses the phone's native camera picker (`capture=user`), which works without installing a local certificate;
- the phone names the exact source/Gate scope and requires an explicit consent checkbox before upload;
- the content-addressed upload finalizes the same append-only service used by the Builder Camera Card;
- completion is relayed back to Tarot Draw, where the separate Comment Card materializes.

Secure live FPV/WebRTC remains an optional advanced path and is not represented as necessary for a basic phone Comment. The main Comment UI does not display certificate installation or trust steps.

## Truth boundaries

Report these claims independently:

| Claim | Evidence required |
| --- | --- |
| Browser Camera Card | Named-window capture through real `getUserMedia`/`MediaRecorder`; automation may use a disclosed fake camera device |
| Physical phone | Human scan, native camera selection, consent, upload, and returned Card observed on an actual phone |
| Local network | Phone and Builder exchange succeeded on the named LAN during the bounded test |
| Broader network | Separate geographically or network-distinct evidence; never inferred from a LAN test |

The isolated STG-011 browser evidence is `artifacts/demos/STG-011/consented-camera-comment-card.json`. It proves the browser Camera Card, append-only consent/finalization, three proposed Cards, exact Gate binding, source preservation, and 3D materialization. Its deterministic Electron fake camera is disclosed. It does not prove a physical phone or broader-network path.

Nothing in this flow grants source ownership, changes mint authority, authorizes training, or mints automatically.

## UI / API / CLI parity

API:

- `GET /api/media-comments`
- `POST /api/media-comments/captures`
- `GET /api/media-comments/captures/:id`
- `POST /api/media-comments/captures/:id/consent`
- `PUT /api/media-comments/captures/:id/media`
- `POST /api/media-comments/captures/:id/revoke`
- `GET /api/media-comments/assets/:sha256`

CLI:

- `media-comments`
- `media-comment-create`
- `media-comment-status`
- `media-comment-consent`
- `media-comment-upload`
- `media-comment-revoke`

Physical-phone capability tokens are read only from `HAPA_AVATAR_COMMENT_TOKEN`. Creation requires `--token-out` and writes the token to a new mode-`0600` file; it is never accepted in argv or printed to terminal history.

## Learning record

- Objective: make the phone/webcam bridge feel alive while preserving exact attribution and source custody.
- Nearest existing work: Avatar Builder Camera Card, Phone Card, Invite Cam, Roomlet, and Tarot Draw.
- Reuse decision: extend those canonical paths; transplant only the append-only Comment service concept.
- Discarded path: a duplicate certificate-first phone experience in the reference app.
- Learning delta: basic local phone video capture should use the native picker over HTTP; optional live FPV security complexity must not block the primary demo.
- Promotion candidates: Lesson Card “Comments remain separate,” regression test for no certificate in the primary Comment UI, physical-phone evidence Card, and reusable consented-media flow Skill.
