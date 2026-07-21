import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Phone Card QR opens the existing local controller without a certificate gate", async () => {
  const [server, main, tarot, phone] = await Promise.all([
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/PhoneCardMobileView.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(server, /const origin = publicNativePhoneBridgeOrigin\(\);/);
  assert.match(server, /const mobileUrl = `\$\{origin\}\/phone-card\?session=/);
  assert.match(server, /localNetworkDirect: true/);
  assert.match(server, /certificateRequired: false/);
  assert.match(server, /publicNativePhoneBridgeOrigin\(\)/);
  assert.match(server, /!phoneBridgeOrigins\.includes\(origin\)/);
  assert.doesNotMatch(server, /pathname === "\/phone-card\/setup"/);
  assert.match(main, /const isPhoneCardRoute = globalThis\.location\?\.pathname === "\/phone-card"/);
  assert.match(main, /isPhoneCardRoute \? \(/);
  assert.match(tarot, /Local Phone Card ready; waiting for phone scan/);
  assert.doesNotMatch(tarot, /SETUP → SECURE|one-time phone setup/);
  assert.match(phone, /Hapa Phone Card/);
  assert.match(phone, /Join With Camera/);
  assert.match(phone, /Use Motion/);
  assert.match(phone, /window\.__HAPA_PHONE_CARD_DIAGNOSTICS__/);
});
