import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PYTHON = process.env.HAPA_PYTHON || "python3";
const ANALYZER = path.resolve("scripts/build-stem-telemetry-bundle.py");

test('decoder/implementation revisions invalidate resource caches and duplicate roles require identical bytes', t => {
  if (spawnSync(PYTHON, ['-c', 'import numpy'], { stdio: 'ignore' }).status !== 0) return t.skip('NumPy unavailable');
  const program = String.raw`
import importlib.util, tempfile
from pathlib import Path
import numpy as np
spec = importlib.util.spec_from_file_location("stem_telemetry", ${JSON.stringify(ANALYZER)})
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
from echo_audio_analysis_cache import AudioAnalysisCache
with tempfile.TemporaryDirectory() as directory:
    calls=[]
    def decode(source, rate):
        calls.append(1); return np.zeros(8000, dtype=np.float32)
    args=(Path('fixture-not-a-file'), 'a'*64, 10, 8000, decode, module.analyze)
    a=AudioAnalysisCache(directory, 'v1', runtime_identity={'decoder':'one'}).resource(*args)[0]
    assert AudioAnalysisCache(directory, 'v1', runtime_identity={'decoder':'one'}).resource(*args)[0] == a
    b=AudioAnalysisCache(directory, 'v1', runtime_identity={'decoder':'two'}).resource(*args)[0]
    assert b != a and len(calls) == 2
    first=Path(directory)/'first.wav'; alias=Path(directory)/'alias.wav'
    first.write_bytes(b'first-source'); alias.write_bytes(b'first-source')
    module.assert_same_stem_source('vocals', first, alias)
    alias.write_bytes(b'different-source')
    try:
        module.assert_same_stem_source('vocals', first, alias)
        raise AssertionError('different role revisions were silently merged')
    except ValueError as error:
        assert 'Ambiguous vocals' in str(error)
`;
  const result = spawnSync(PYTHON, ['-c', program], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});

test("precise transients preserve off-grid attacks and silence; audio cache reuses only unchanged resources", t => {
  if (spawnSync(PYTHON, ["-c", "import numpy"], { stdio: "ignore" }).status !== 0) return t.skip('NumPy unavailable');
  const program = String.raw`
import importlib.util, json, tempfile
from pathlib import Path
import numpy as np
spec = importlib.util.spec_from_file_location("stem_telemetry", ${JSON.stringify(ANALYZER)})
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
from echo_audio_analysis_cache import AudioAnalysisCache, transient_events
rate = 8000
samples = np.zeros(rate * 2, dtype=np.float32)
positions = [.13725, .64375, 1.24125]
for position in positions:
    start = round(position * rate)
    samples[start:start+24] = .8
events = transient_events(samples, rate)
assert len(events) == len(positions), events
assert max(abs(a["atSeconds"]-b) for a,b in zip(events,positions)) <= 1/rate
assert transient_events(np.zeros(rate),rate) == []
assert all(e["kind"] == "transient" and e["truthStatus"] == "inferred-unreviewed" for e in events)
with tempfile.TemporaryDirectory() as directory:
    cache = AudioAnalysisCache(directory, module.ANALYSIS_VERSION)
    decode_calls = []
    def decode(source, sr):
        decode_calls.append(str(source)); return samples.copy()
    a, _, analysis = cache.resource(Path('a'), 'a'*64, 10, rate, decode, module.analyze)
    cache.resource(Path('b'), 'b'*64, 10, rate, decode, module.analyze)
    cache.resource(Path('a'), 'a'*64, 10, rate, decode, module.analyze)
    cache.resource(Path('b'), 'c'*64, 10, rate, decode, module.analyze)
    assert decode_calls == ['a','b','b'], decode_calls
    fresh = AudioAnalysisCache(directory, module.ANALYSIS_VERSION)
    fresh.resource(Path('a'), 'a'*64, 10, rate, decode, module.analyze)
    assert len(decode_calls) == 3
    diagnostic_builds = []
    def diagnostics():
        diagnostic_builds.append(1); return {'measured': True}
    fresh.diagnostics([a], diagnostics); fresh.diagnostics([a], diagnostics)
    assert len(diagnostic_builds) == 1
    pcm = Path(directory) / (a + '.npy')
    with pcm.open('r+b') as handle:
        handle.seek(-4, 2); handle.write(b'XXXX')
    fresh.resource(Path('a'), 'a'*64, 10, rate, decode, module.analyze)
    assert len(decode_calls) == 4 and fresh.metrics['corrupt'] == 1
    assert all(e['kind'] != 'beat' for e in analysis['events'])
    print(json.dumps({'events': events, 'decodeCalls': len(decode_calls), 'cache': fresh.metrics}))
`;
  const result = spawnSync(PYTHON, ['-c', program], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.events.length, 3);
  assert.equal(report.cache.diagnosticHits, 1);
});

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
