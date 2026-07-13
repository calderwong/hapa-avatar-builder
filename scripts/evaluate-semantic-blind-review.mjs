#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { evaluateSemanticBlindBallots } from "../src/domain/semantic-blind-review.js";

const value = (name) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const packetPath = path.resolve(value("packet")); const keyPath = path.resolve(value("key")); const output = path.resolve(value("output"));
const ballotPaths = process.argv.filter((row) => row.startsWith("--ballot=")).map((row) => path.resolve(row.slice(9)));
const packet = JSON.parse(fs.readFileSync(packetPath, "utf8")); const answerKey = JSON.parse(fs.readFileSync(keyPath, "utf8")); const ballots = ballotPaths.map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
const result = evaluateSemanticBlindBallots({ packet, answerKey, ballots });
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, reviewers: result.reviewers, completedBallots: result.completedBallots, overall: result.overall, promotionGate: result.promotionGate }, null, 2));
