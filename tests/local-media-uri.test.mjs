import assert from "node:assert/strict";
import test from "node:test";
import { localFileApiUri, localMediaPath } from "../src/domain/local-media-uri.js";

const CARD_IMAGE_PATH = "/Users/calderwong/Library/Application Support/hapa-ag/wormhole/card-images/card-1779363380184.png";
const CARD_IMAGE_ROUTE = `/api/local-file?path=${encodeURIComponent(CARD_IMAGE_PATH)}`;

test("local card media is decoded and routed through the Builder local-file API", () => {
  assert.equal(
    localMediaPath("file:////Users/calderwong/Library/Application%20Support/hapa-ag/wormhole/card-images/card-1779363380184.png"),
    CARD_IMAGE_PATH,
  );
  assert.equal(
    localFileApiUri("file:////Users/calderwong/Library/Application%20Support/hapa-ag/wormhole/card-images/card-1779363380184.png"),
    CARD_IMAGE_ROUTE,
  );
  assert.equal(localFileApiUri(CARD_IMAGE_PATH), CARD_IMAGE_ROUTE);
  assert.equal(localFileApiUri(`/${CARD_IMAGE_PATH}`, "http://127.0.0.1:8797/"), `http://127.0.0.1:8797${CARD_IMAGE_ROUTE}`);
});

test("existing API and non-local browser media retain their intended route", () => {
  assert.equal(localFileApiUri(CARD_IMAGE_ROUTE), CARD_IMAGE_ROUTE);
  assert.equal(localFileApiUri(CARD_IMAGE_ROUTE, "http://127.0.0.1:8797"), `http://127.0.0.1:8797${CARD_IMAGE_ROUTE}`);
  assert.equal(localFileApiUri("https://example.com/card.png"), "");
  assert.equal(localFileApiUri("data:image/png;base64,AA=="), "");
  assert.equal(localFileApiUri("file://remote-host/Users/example/card.png"), "");
});
