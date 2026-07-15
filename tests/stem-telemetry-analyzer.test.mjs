import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PYTHON = process.env.HAPA_PYTHON || "python3";
const ANALYZER = path.resolve("scripts/build-stem-telemetry-bundle.py");

test("role alignment measures a stem inside the reconstructed mix instead of mistaking musical spacing for file offset", (t) => {
  const available = spawnSync(PYTHON, ["-c", "import numpy"], { stdio: "ignore" }).status === 0;
  if (!available) return t.skip(`${PYTHON} with NumPy is not installed`);
  const program = String.raw`
import importlib.util
import json
import numpy as np

spec = importlib.util.spec_from_file_location("stem_telemetry", ${JSON.stringify(ANALYZER)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

sample_rate = 8000
sample_count = sample_rate * 12
bass = np.zeros(sample_count, dtype=np.float32)
drums = np.zeros(sample_count, dtype=np.float32)
for second in range(1, 11):
    bass_start = int((second + 0.10) * sample_rate)
    drums_start = int((second + 0.38) * sample_rate)
    times = np.arange(int(0.08 * sample_rate), dtype=np.float32) / sample_rate
    bass[bass_start:bass_start + len(times)] = 0.6 * np.sin(2 * np.pi * 80 * times)
    drums[drums_start:drums_start + len(times)] = np.sin(2 * np.pi * 120 * times)

master = bass + drums
direct = module.envelope_correlation(master, bass, sample_rate)
contribution = module.reconstruction_role_alignment(master, [bass, drums], 0, sample_rate)

delay_samples = int(0.5 * sample_rate)
delayed_bass = np.zeros_like(bass)
delayed_bass[delay_samples:] = bass[:-delay_samples]
delayed = module.reconstruction_role_alignment(master, [delayed_bass, drums], 0, sample_rate)

print(json.dumps({"direct": direct, "contribution": contribution, "delayed": delayed}))
`;
  const result = spawnSync(PYTHON, ["-c", program], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.direct.bestLagSeconds, 0.28);
  assert.ok(report.direct.bestCorrelation - report.direct.zeroLagCorrelation > 0.1);
  assert.equal(report.contribution.version, "rms-power-reconstruction-role-shift.v2");
  assert.equal(report.contribution.bestLagSeconds, 0);
  assert.equal(report.contribution.bestCorrelation, report.contribution.zeroLagCorrelation);

  assert.equal(report.delayed.bestLagSeconds, -0.5);
  assert.ok(report.delayed.bestCorrelation - report.delayed.zeroLagCorrelation > 0.1);
});
