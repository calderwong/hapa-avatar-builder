import unittest,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audio_atlas_rhythm import analyze_rhythm,onset_evidence
SR=8000;N=SR*9

def inputs(phase=.5,meter=4,beats=None):
 beats=np.arange(.5,8.6,.5) if beats is None else np.array(beats);y=np.zeros(N);rng=np.random.default_rng(8)
 for i,t in enumerate(beats):
  for time,amp in [(t,.25),(t+phase*.5,.8)]:
   at=round(time*SR);size=min(40,N-at)
   if size>0:y[at:at+size]+=amp*rng.normal(size=size)*np.hanning(size)
 a={'id':'master','source_sha256':'a'*64,'timeline_id':'source','sample_rate_hz':SR,'sample_count':N}
 obs=[{'id':f'b{i}','kind':'hapa.audio.beat_candidate','subject_id':'master','start_sample':round(t*SR)} for i,t in enumerate(beats)]+[{'id':f'd{i}','kind':'hapa.audio.downbeat_candidate','subject_id':'master','start_sample':round(t*SR)} for i,t in enumerate(beats[::meter])]
 return y,a,obs
class RhythmTests(unittest.TestCase):
 def test_click_source_clock_and_nonempty_strength(self):
  y,a,o=inputs();r=analyze_rhythm(y,a,o);self.assertEqual(r['onset']['frames'][0]['center_sample'],0);self.assertEqual(len(r['onset']['frames']),900);self.assertEqual(r['onset']['frames'][-1]['support_end_sample'],N);self.assertTrue(len(r['onset']['onsets'])>15);self.assertEqual(r['source_sha256'],a['source_sha256']);self.assertIsNone(r['onset']['onsets'][0]['timing_uncertainty_samples'])
 def test_straight_vs_swung_subdivisions(self):
  for phase,target in [(.5,1.),(2/3,2.)]:
   r=analyze_rhythm(*inputs(phase));g=[w for w in r['groove_windows'] if w['state']=='candidate'];self.assertTrue(g);self.assertLess(abs(g[0]['median_long_short_ratio']-target),.22);self.assertTrue(all(0<=w['mean_offbeat_accent_contrast']<=1 for w in g))
 def test_tempo_and_meter_alternatives_not_forced_four_four(self):
  for meter in [3,4,5]:
   r=analyze_rhythm(*inputs(meter=meter));self.assertTrue(all(x['interbeat_bpm']==120 for x in r['tempo_intervals']));self.assertEqual(r['tempo_intervals'][0]['pulse_alternatives_bpm'],[60,120,240]);self.assertTrue(all(b['pulse_count']==meter for b in r['bars']));self.assertTrue(all(b['meter_denominator'] is None for b in r['bars']))
 def test_accelerating_tempo_stays_time_varying(self):
  beats=np.cumsum(np.linspace(.7,.3,15));r=analyze_rhythm(*inputs(beats=beats));tempos=[i['interbeat_bpm'] for i in r['tempo_intervals']];self.assertGreater(tempos[-1],tempos[0]*1.5)
 def test_silence_and_no_beats_do_not_manufacture_rhythm(self):
  y,a,o=inputs();r=analyze_rhythm(np.zeros_like(y),a,o);self.assertFalse(r['onset']['onsets']);self.assertTrue(all(i['pulse_status']=='unresolved' for i in r['tempo_intervals']));self.assertTrue(all(b['status']=='unresolved' for b in r['bars']));self.assertTrue(all(g['median_long_short_ratio'] is None for g in r['groove_windows']));r=analyze_rhythm(y,a,[]);self.assertFalse(r['tempo_intervals']);self.assertEqual(r['unresolved_spans'][0]['end_sample'],N);self.assertFalse(r['unresolved_spans'][0]['unmetered_confirmed'])
 def test_long_gaps_and_unmatched_downbeats_remain_unresolved(self):
  y,a,o=inputs(beats=[.5,1,1.5,2,5,5.5,6]);o.append({'id':'offgrid','kind':'hapa.audio.downbeat_candidate','subject_id':'master','start_sample':3*SR});r=analyze_rhythm(y,a,o);self.assertIn('offgrid',r['unmatched_downbeat_refs']);self.assertTrue(any(s['start_sample']==2*SR and s['end_sample']==5*SR for s in r['unresolved_spans']))
 def test_duplicate_beats_and_invalid_source_refuse(self):
  y,a,o=inputs();o.append(dict(o[0]));self.assertRaises(ValueError,analyze_rhythm,y,a,o);self.assertRaises(ValueError,onset_evidence,np.array([float('nan')]),SR)
if __name__=='__main__':unittest.main(verbosity=2)
