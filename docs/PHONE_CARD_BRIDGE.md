# Phone Card Bridge launch defaults

Production application launches serve the Builder on the LAN and start the secure Phone Card companion listener by default. This applies to `npm start`, direct Electron startup, the dedicated desktop launcher, and a direct static-server command such as:

```bash
node server/api.mjs --port 8899 --static dist
```

The HTTP listener binds to `0.0.0.0` and the HTTPS listener uses the next port, so the example exposes the Builder at port `8899` and an optional secure companion at port `8900`. The desktop UI still opens through `127.0.0.1`; the QR projects the current LAN address and opens the existing Phone Card controller directly over HTTP. The controller, telemetry, and flight controls do not require a certificate setup page.

API-only launches remain loopback-only unless configured otherwise. Any launch can opt out or override explicitly:

```bash
node server/api.mjs --host 127.0.0.1 --port 8899 --https-port 0 --static dist
```

The equivalent desktop overrides are `HAPA_AVATAR_BIND_HOST` and `HAPA_AVATAR_HTTPS_PORT`. Remote clients cannot bootstrap the process-scoped trusted local UI session; that authority remains restricted to loopback request contexts.

## Turn-to-Lore reflection

- **Objective:** make the existing Tarot Draw Phone Card bridge reachable after ordinary application launches without requiring operators to remember networking flags.
- **Evidence inspected:** the live QR URL, listening sockets, Phone Card origin projection, TLS certificate metadata, canonical server defaults, Electron startup, the dedicated launcher, and the loopback-only admin-session guard.
- **What worked:** the existing server already owned LAN origin discovery, TLS generation, QR projection, WebRTC signaling, and remote-authority rejection; only launch defaults needed adaptation.
- **What was noise:** QR rendering and WebRTC debugging could not explain a page that was unreachable before the first HTTP request.
- **What was misunderstood:** an HTTPS companion port alone is insufficient when the main listener still binds only to loopback; the QR can advertise a correct LAN address that no socket accepts.
- **What changed:** static application launches now default to `0.0.0.0` plus `port + 1` HTTPS, and both desktop launch paths use the same LAN bind default. API-only launches retain their loopback default.
- **What remains reusable:** the current Phone Card, certificate, invite, and signaling implementation remains the single canonical bridge.
- **New guardrail:** a Phone Card launch is not healthy unless the advertised QR host is accepted by the LAN listener and `phoneBridgeInfo` reports the direct local controller URL; loopback API tests must continue to pass an explicit host.
- **Promotion candidate:** Lesson Card — **A Reachable QR Requires a Reachable Listener**.

### Direct-controller restoration

- **Objective:** restore the pre-existing Phone Card controller, telemetry, and flight controls as the first surface reached by the QR.
- **Evidence inspected:** the live Electron QR, the direct HTTP `/phone-card` route, `PhoneCardMobileView`, and the regression introduced by the certificate setup page.
- **What worked:** the original local-network controller already contains the complete control and telemetry experience; it only needs a LAN-reachable listener.
- **What was misunderstood:** adding a certificate bootstrap did not repair the Phone Card—it replaced the first-run experience and prevented users from reaching the established controller.
- **What changed:** the QR again targets the direct local HTTP Phone Card route with `certificateRequired: false`; the optional HTTPS listener is not forced into the flow.
- **New guardrail:** Phone Card repair work must preserve `/phone-card` as the QR destination unless the operator explicitly requests a replacement onboarding flow.

### LAN blank-screen correction

- **Objective:** make the direct controller hydrate from the same LAN origin advertised by the QR.
- **Evidence inspected:** the exact LAN HTML, module and lazy-chunk responses, renderer resource timing, CORS response headers, and a Phone Card smoke run against the advertised IP rather than loopback.
- **What worked:** the static listener served the shell and assets, and the existing controller rendered once its module request was admitted.
- **What was misunderstood:** ES module requests carry an `Origin` header; allowing only loopback CORS origins turned the LAN module response into a 403 JSON document while leaving the HTML as a blank shell. The shared desktop bootstrap also started an irrelevant loopback-only Overcard client on the phone.
- **What changed:** the server admits only its explicitly advertised Phone Card origins, and `/phone-card` bypasses desktop-only Overcard providers.
- **New guardrail:** Phone Card acceptance must run against the advertised LAN URL and assert both controller diagnostics and visible pixels; a loopback-only smoke is insufficient.
