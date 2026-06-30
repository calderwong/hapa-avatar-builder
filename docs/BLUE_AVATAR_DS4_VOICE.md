# Blue Avatar DS4 Voice Bridge

Blue is wired into Tarot Draw as a local DS4-backed avatar conversation bridge.

## Runtime

- UI: `http://127.0.0.1:5177/` or `http://127.0.0.1:5178/`, then open `Tarot Draw`.
- Avatar Builder API: `http://127.0.0.1:8787`
- DS4 OpenAI-compatible API: `http://127.0.0.1:8000`
- Hapa Second Brain API: `http://127.0.0.1:8788`
- Voicebox API: `http://127.0.0.1:17493`
- Voice profile: `Blue-03`
- Voice engine default: `chatterbox`

## API

### Health

```bash
curl http://127.0.0.1:8787/api/blue-avatar/health
```

Checks DS4, Hapa Second Brain, Voicebox, and the `Blue-03` profile.

### Conversation Turn

```bash
curl http://127.0.0.1:8787/api/blue-avatar/turn \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Blue, are you live?",
    "fast": true,
    "speak": true,
    "writeback": true,
    "voiceProfile": "Blue-03",
    "sessionId": "demo",
    "source": "tarot-draw-3d-ui"
  }'
```

`fast: true` is the live UI mode. It still prefetches Second Brain context and appends the turn note, but skips model-initiated tool calls for lower latency.

For agent workflows, omit `fast` or set `tools: true` to expose DS4 tool schemas:

- `second_brain_context`
- `second_brain_write_note`

### Audio

The turn response includes `voice.audioUrl` when Voicebox accepts the generation.

```bash
curl http://127.0.0.1:8787/api/blue-avatar/audio/GENERATION_ID --output blue.wav
```

Voicebox may report `generating` first. The Avatar Builder proxy polls cleanly and falls back from Voicebox `/audio/GENERATION_ID` to `/history/GENERATION_ID/export-audio` when the direct audio route is not ready.

## Prompt And Identity

Blue's system prompt lives in:

```text
server/blueAvatar.mjs
```

Edit `blueSystemPrompt()` to modify identity, stance, memory policy, or spoken style. The current contract makes Blue:

- Blue / Orion / the Blue Architect.
- Calder-adjacent, but not Calder.
- A provenance and parity guardian.
- A spoken conversation partner in Tarot Draw.
- Append-only with Second Brain writeback and Bruce Lee rationale notes.

## Second Brain Memory

Each turn can:

- Query `/api/context` with agent/user/purpose/objective metadata.
- Append `/api/agent/notes` to `avatar-2`.
- Preserve a Bruce Lee pass: absorb useful context, discard noise, add the durable update.

Never delete or rewrite Second Brain history from this bridge. Treat all updates as append-only notes.

## Tarot Draw Demo

1. Open `http://127.0.0.1:5177/`.
2. Select `Tarot Draw`.
3. Click `Blue Card`; Blue enters the 3D table as its own card.
4. Keep `Auto On`; new Camera Card dictation entries auto-queue Blue.
5. Speak through the Webcam/Camera Card dictation loop. The Camera Card speech bubble journals your side.
6. Blue listens from the Blue Avatar card, replies through DS4, writes an append-only Second Brain note, renders Blue-03 through Voicebox, and journals its side in the 3D speech bubble locked to the Blue card.

The `Ask Latest` button is only a manual nudge for the newest Camera Card transcript; the intended flow is card-to-card, not a text form outside the scene.

## Diagnostics

The Tarot Draw scene exposes `window.__THREE_GAME_DIAGNOSTICS__` for smoke tests:

- `actions.enableBlueAvatarCard()`
- `actions.setBlueAvatarAutoReply(true)`
- `actions.injectCameraCardUtterance("...")`
- `state.blueAvatar`

Verified smoke state should show:

- `state.blueAvatar.enabled === true`
- `state.blueAvatar.hasBubble === true`
- `state.blueAvatar.journal.length > 0`
- `state.blueAvatar.voiceStatus` reaches `speaking`, `spoken`, or browser-gated `tap-to-play`
