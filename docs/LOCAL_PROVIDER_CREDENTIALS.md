# Local provider credentials

The canonical Hapa Avatar Builder Electron app has a **Provider API keys** control in the top-right header. It accepts credentials for:

- OpenAI (`OPENAI_API_KEY`)
- FAL.com (`FAL_KEY`)
- xAI (`XAI_API_KEY`)

## Security boundary

- Keys are encrypted through Electron `safeStorage`, which uses the operating system's credential protection.
- The encrypted store is under Electron's per-user application-data directory, in `Secure Credentials/provider-credentials.v1.json`. It is outside the source repository.
- The app refuses to initialize credential storage if that application-data directory resolves inside the repository.
- Storage fails closed when OS encryption is unavailable. There is no plaintext fallback.
- The renderer may save, remove, and inspect redacted status. It cannot read, reveal, or export a saved credential.
- Redacted status contains only provider identity, configured state, update time, and a one-way SHA-256 fingerprint prefix.
- Credential IPC accepts calls only from the canonical main window at its exact local UI origin.
- `.gitignore` explicitly excludes environment files and provider credential JSON names as defense in depth.

The store's internal `read(providerId)` method is intentionally main-process-only so future provider adapters can use a credential without exposing it to browser code. Provider network calls should also remain in the Electron main process or another trusted local service.

## Operator behavior

Open the key control, paste a key into the matching password field, and choose **Save locally**. The field clears after a successful save. Reopening the panel shows a non-secret fingerprint rather than the key. A replacement overwrites only that provider's encrypted entry; removal asks for confirmation.

Do not paste keys into album notes, song records, checked-in fixtures, issue text, screenshots, logs, or test files.
