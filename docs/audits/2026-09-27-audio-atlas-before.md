# Audio Atlas / Echo directory audit — 2026-09-27 (before)
Auditor: Codex, current UI-overhaul conversation. Standard: NeonBlade Operator, Design Audit Checklist v1.2. Scope: existing Atlas and song file directory; reuse the canonical components and API. No new service or model run.

| Surface | Tokens | Components | Motion | Function | Protocol | Total | Grade |
|---|---:|---:|---:|---:|---:|---:|---|
| Atlas | 1 | 1 | 0 | 0 | 1 | 3 | D |
| Song file directory | 1 | 1 | 0 | 1 | 1 | 4 | C |

- P1 hierarchy (`atlas-ui-20260927-hierarchy`): AudioAtlasPanel.jsx:57–99 mixes model configuration, raw JSON, playback and review. Event selection reveals detail below a long result cloud; source player is offscreen. Existing screenshot: work/audio-atlas-2026-09-27/brave-tongues-review.png in task workspace.
- P1 clarity (`atlas-ui-20260927-files`): HapaEchosView.jsx:5942 renders fixed marker/beat counts and generic narrative prose from booleans. File badges lack visible state words, gap filters and a direct listening path.
- P1 accessibility/recovery (`atlas-ui-20260927-accessibility`): AudioAtlasPanel.css:1 uses small controls; edits require sample integers; optional checkboxes share one label; stale session displays raw admin_auth_not_configured after preview restart.

Decision: player plus bounded event list and resident inspector; seconds for edits with validated sample conversion; Lyrics, Find sounds and Details as separate views; explicit loading, counts and retry. Hide configuration until requested. Keep model output distinct from reviewed truth. Add file-gap filter and direct song-to-Atlas entry. Do not alter the Director, Tarot or stored audio.
