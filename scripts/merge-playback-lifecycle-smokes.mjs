import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const smokeRoot = path.join(root, "artifacts/smoke");
const development = JSON.parse(fs.readFileSync(path.join(smokeRoot, "playback-lifecycle-dev.json"), "utf8")).runtime;
const production = JSON.parse(fs.readFileSync(path.join(smokeRoot, "playback-lifecycle-prod.json"), "utf8")).runtime;
const parity = {
  games: [development.after.lifecycle.liveGames, production.after.lifecycle.liveGames],
  renderers: [development.after.lifecycle.liveRenderers, production.after.lifecycle.liveRenderers],
  channels: [development.after.lifecycle.liveChannels, production.after.lifecycle.liveChannels]
};
const result = {
  schemaVersion: "hapa.playback-lifecycle-smoke.v2",
  ok: development.stable
    && production.stable
    && parity.games[0] === parity.games[1]
    && parity.renderers[0] === parity.renderers[1]
    && parity.channels[0] === parity.channels[1],
  development,
  production,
  finalLiveResourceParity: parity,
  generatedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(smokeRoot, "playback-lifecycle-v2.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
