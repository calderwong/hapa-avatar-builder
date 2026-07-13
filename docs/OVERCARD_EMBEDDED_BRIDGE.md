# Overcard embedded boundary

Avatar Builder installs one origin-checked, versioned `postMessage` bridge for Hapa Bank, Echos, Phone Card, and special embedded surfaces. It projects only bounded canonical Attachment context; it never sends the React store, raw memory, credentials, grants, or provenance paths.

Each child begins with `hapa.overcard-embed-handshake.v1`, protocol `hapa.overcard.v1`, version `1`, a surface id, nonce, requested capabilities, and advertised actions. The parent accepts only configured HTTP(S) origins and known surface policies. Unknown origins, schemas, versions, capabilities, surfaces, sessions, and actions receive typed rejection.

Bank receives `context.read` and is read-only by default. It may advertise `view.filter`, the only approved Bank action; financial and authority actions are never granted. Echos may advertise `playback.select-context`. Phone and generic embeds are context-only. Approved actions become sanitized local events for an owning adapter; messaging never grants execution authority.

Additional trusted origins must be explicit in `VITE_HAPA_EMBED_ORIGINS`. The default is the Builder page's exact same origin. Sessions bind to both child window and handshake origin.
