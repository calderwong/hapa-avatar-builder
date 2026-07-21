# Phone Card Bridge launch defaults

Production application launches serve the Builder on the LAN and start the secure Phone Card companion listener by default. This applies to `npm start`, direct Electron startup, the dedicated desktop launcher, and a direct static-server command such as:

```bash
node server/api.mjs --port 8899 --static dist
```

The HTTP listener binds to `0.0.0.0` and the HTTPS listener uses the next port, so the example exposes the Builder at port `8899` and the secure phone route at port `8900`. The desktop UI still opens through `127.0.0.1`; the QR projects the current LAN address. The Phone Card requires the phone and Mac to share a reachable network, and the phone must trust the generated Hapa local CA certificate before camera and motion APIs can use the local HTTPS origin.

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
- **New guardrail:** a Phone Card launch is not healthy unless the advertised QR host is accepted by a listener and `phoneBridgeInfo` reports an active secure origin; loopback API tests must continue to pass an explicit host.
- **Promotion candidate:** Lesson Card — **A Reachable QR Requires a Reachable Listener**.
