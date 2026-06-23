import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLocalValenReading,
  queryValenTarotReading,
  valenSpreadForLayout
} from "../src/domain/valenTarotBridge.js";

const placedSpread = {
  avatarName: "Red",
  layoutId: "grid",
  layoutName: "Nine",
  generatedAt: "2026-06-19T12:00:00.000Z",
  cards: [
    {
      id: "ship-lancer",
      title: "The Lancer",
      subtitle: "Pursuit + Precision + Velocity",
      tarotNumber: "XIX",
      keywords: ["Pursuit", "Precision", "Velocity"],
      stats: { speed: 9, supply: 3 }
    },
    {
      id: "ship-accord",
      title: "The Accord",
      subtitle: "Coordination + Mutuality",
      tarotNumber: "VIlI",
      keywords: ["Coordination", "Mutuality"],
      stats: { morale: 8, tension: 2 }
    },
    {
      id: "ship-rootbridge",
      title: "The Rootbridge",
      subtitle: "Kinship + Exchange",
      tarotNumber: "XXII",
      keywords: ["Kinship", "Exchange"],
      stats: { influence: 7, speed: 2 }
    }
  ]
};

test("Valen bridge maps Builder spread placements into local Atlas26-style guidance", () => {
  const spread = valenSpreadForLayout("grid");
  const reading = buildLocalValenReading(placedSpread);

  assert.equal(spread.name, "Nine Mirror");
  assert.equal(reading.status, "ready");
  assert.equal(reading.source, "atlas26_valen_local");
  assert.equal(reading.cards.length, 3);
  assert.equal(reading.cards[0].positionLabel, "Upper Left");
  assert.equal(reading.cards[0].number, 19);
  assert.equal(reading.cards[1].number, 8);
  assert.match(reading.title, /Red Nine Mirror/);
  assert.match(reading.summary, /fire \/ Sun \/ Nine/);
  assert.match(reading.synthesis, /shadow pattern/i);
  assert.equal(reading.cardByCard.length, 3);
  assert.equal(reading.reflectionQuestions.length, 1);
});

test("Valen bridge prefers a configured Tarot app endpoint when one is available", async () => {
  let postedPayload = null;
  const fetchImpl = async (_endpoint, request) => {
    postedPayload = JSON.parse(request.body);
    return {
      ok: true,
      async json() {
        return {
          interpretation: {
            summary: "Remote Valen summary",
            cardByCard: ["Remote card line"],
            synthesis: "Remote synthesis",
            reflectionQuestions: ["Remote question?"],
            cultivationAction: "Remote action"
          },
          createdAt: "2026-06-19T12:00:01.000Z"
        };
      }
    };
  };

  const reading = await queryValenTarotReading(placedSpread, {
    endpoints: ["http://127.0.0.1:3000/api/valen/reading"],
    fetchImpl
  });

  assert.equal(postedPayload.request.deckId, "hapa-valen-tarot");
  assert.equal(postedPayload.builderShuffle.cards.length, 3);
  assert.equal(reading.source, "valen_http");
  assert.equal(reading.summary, "Remote Valen summary");
  assert.deepEqual(reading.cardByCard, ["Remote card line"]);
});
