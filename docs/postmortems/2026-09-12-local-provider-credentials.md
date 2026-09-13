# Turn-to-Lore: local provider credentials

## Request

Add OpenAI, FAL.com, and xAI API key entry to Hapa Avatar Builder while ensuring keys remain local and never enter Git.

## Decision

Secrets belong to a dedicated Electron main-process store, not the album, song, browser storage, environment fixture, or local API server. Electron `safeStorage` provides OS-backed encryption. The renderer receives an intentionally asymmetric bridge: save/remove plus redacted status, with no retrieval operation.

## Guardrails

- Store outside the repository and reject repository-contained user-data paths.
- Fail closed rather than persist plaintext when encryption is unavailable.
- Restrict IPC to the canonical main window and exact local UI origin.
- Write atomically with `0700` directory and `0600` file permissions.
- Show only an irreversible fingerprint prefix and timestamp.
- Add explicit ignore patterns and regression tests for storage, bridge, and source-control boundaries.

## Future use

Image/media adapters should decrypt credentials only inside the Electron main process (or an equally trusted local process), make the provider request there, and never send the credential back to renderer code or include it in logs and generated artifacts.
