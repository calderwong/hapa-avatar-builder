# Audit: Echo Preview Recordings — trusted-local-UI session bootstrap

Date: 2026-08-23 (Pacific)
Supersedes: quick-capture feature shipped in `b6ded5d`

## Objective

Operator reported that using the Director Preview **Record** button and then
opening the **Recordings** bench in the in-app web UI showed
`admin_auth_not_configured`. Diagnose and fix without regressing the feature.

## Evidence inspected

- `server/api.mjs` `requireAdmin()`: bearer `HAPA_AVATAR_ADMIN_TOKEN` **or**
  `hasTrustedLocalUiSession(req)`; with neither, fails closed with
  `503 admin_auth_not_configured` (all five preview-recording routes are gated).
- launchd plist `com.hapa.avatarbuilder.8797.codex`: `--host 0.0.0.0 --port
  8797 --static dist`, **no** `HAPA_AVATAR_ADMIN_TOKEN` in the environment.
  With `--static` + loopback host, `LOCAL_UI_SESSION_ENABLED = true`, so the
  only viable browser credential is the session cookie.
- Live probe against the running service:
  - `GET /api/echo/preview-recordings` without cookie → `503
    admin_auth_not_configured` (exactly the operator's error).
  - `POST /api/local-ui-session` (Origin + Sec-Fetch-Site: same-origin) →
    `200` + `Set-Cookie hapa_avatar_local_session_8797`.
  - Same GET with the cookie → `200` with the recordings list.
- Client audit of `src/components/HapaEchosView.jsx`: every recordings call
  (list, delete, upload) fired a bare `fetch` with **no** local-UI session
  bootstrap. Other admin surfaces in the app do bootstrap
  (`SongCardMintPanel.ensureSongCardLocalSession`, `EchoRecordGarden3DView`,
  `TarotDraw3DView` all POST `/api/local-ui-session` first).

## What was misunderstood

The prior session verified the feature with a curl smoke test that bootstrapped
the session into a cookie jar manually. That proved the server routes work,
but never exercised the browser code path, which never bootstraps. Server-side
verification masked a client-side wiring gap.

## What changed

- `src/domain/echo-preview-recording.js`: new
  `ensureEchoPreviewRecordingLocalSession(apiBase, fetchImpl)` — posts
  `POST {apiBase}/api/local-ui-session` with `credentials: same-origin`.
  Module-scoped singleton dedupes concurrent callers and **re-posts after
  settle** (deliberately not a one-shot cache: the session token rotates on
  every service restart, so a cached success would 503 again with a stale
  cookie).
- `src/components/HapaEchosView.jsx`: awaits the bootstrap before each
  admin-gated recordings call (list, delete, upload). Bootstrap failure is
  swallowed (`.catch(() => {})`) so remote (non-loopback) access still shows
  the original route error rather than a bootstrap failure.
- `tests/echo-preview-recording.test.mjs`: +4 tests (POST shape/credentials,
  concurrent dedupe + re-post after settle, failure surfacing, and the UI
  source contract that all three call paths bootstrap first).

## Reuse decision

Reused the established trusted-local-UI bootstrap pattern from
`SongCardMintPanel.jsx` (endpoint, credentials, same-origin assumption)
rather than inventing a new auth path. Did not import the Song Card panel
function because its name/purpose is mint-scoped; the Echo recordings domain
module owns its own copy of the same two-line contract. Server auth code
untouched — it was already correct.

## New guardrail

Any new admin-gated UI surface in this app must establish the
trusted-local-UI session (or carry the bearer token) from the browser code
itself. A curl smoke test against the API is not a valid verification of a
browser feature whose routes are admin-gated.
