"""Synthetic numerical checks; no human harmonic labels."""
import unittest,sys,signal,json,hashlib
from pathlib import Path
import numpy as np
signal.alarm(180)
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audio_atlas_harmony import analyze_harmony,RATE

def tone(midis,seconds=4,cents=0):
 t=np.arange(round(seconds*RATE))/RATE
 return sum(.2/len(midis)*np.sin(2*np.pi*(440*2**((m-69)/12+cents/1200))*t) for m in midis)
def analyze(y,sr=48000):return analyze_harmony(y,sr,round(len(y)*sr/RATE))
class HarmonyTests(unittest.TestCase):
 def test_detuned_major_chord_retains_tuning_raw_chroma_and_alternatives(self):
  h=analyze(tone([48,52,55],cents=23));self.assertEqual(h['tuning']['state'],'candidate');self.assertLess(abs(h['tuning']['offset_cents']-23),3)
  f=h['frames'][6];self.assertEqual(f['chord_alternatives'][0]['label'],'C major');self.assertEqual(len(f['chord_alternatives']),5);self.assertNotEqual(f['chroma'],f['chroma_a440']);self.assertIsNone(h['timing_uncertainty_samples']);self.assertFalse(h['quality_qualified'])
 def test_inversion_is_competing_low_peak_evidence(self):
  h=analyze(tone([52,55,60]));c=next(c for c in h['frames'][6]['chord_alternatives'] if c['label']=='C major')
  self.assertEqual(c['inversion_alternatives'][0]['bass_pc'],4);self.assertEqual(c['inversion_alternatives'][0]['inversion_index'],1);self.assertGreaterEqual(len(c['inversion_alternatives']),2)
 def test_silence_noise_and_single_tone_do_not_force_chords(self):
  for y in [np.zeros(3*RATE),np.random.default_rng(5).normal(0,.1,3*RATE),tone([57],seconds=3)]:
   h=analyze(y);self.assertTrue(all(not f['chord_alternatives'] for f in h['frames']));self.assertEqual(h['global_key']['state'],'unresolved')
 def test_chord_change_and_key_alternatives(self):
  y=np.concatenate([tone(c,seconds=2) for c in [[48,52,55],[45,48,52],[41,45,48],[43,47,50]]]);h=analyze(y)
  self.assertEqual([h['frames'][i]['chord_alternatives'][0]['label'] for i in [4,12,20,28]],['C major','A minor','F major','G major']);self.assertEqual(h['global_key']['state'],'candidate');self.assertIn('C major',[a['label'] for a in h['global_key']['alternatives']]);self.assertEqual(len(h['global_key']['alternatives']),5)
 def test_source_clock_support_and_partition(self):
  y=tone([48,52,55],seconds=9.123);h=analyze(y,44100);count=round(len(y)*44100/RATE)
  self.assertEqual(h['frames'][-1]['end_sample'],count);self.assertEqual(h['local_keys'][-1]['end_sample'],count)
  for i,f in enumerate(h['frames']):self.assertEqual(f['center_sample'],(i*2000*44100+4000)//8000);self.assertGreater(f['end_sample'],f['start_sample']);self.assertLessEqual(f['support_end_sample'],count)
  self.assertEqual(h['analysis_view']['window_samples'],8192)
 def test_mixed_tuning_and_invalid_input(self):
  y=np.concatenate([tone([48,52,55],cents=-25),tone([48,52,55],cents=25)]);h=analyze(y);self.assertEqual(h['tuning']['state'],'unresolved');self.assertIsNone(h['tuning']['offset_cents'])
  for y,sr,count in [(np.zeros(2),48000,500),(np.array([float('nan')]),8000,1),(np.zeros((2,2)),8000,2)]:
   with self.assertRaises(ValueError):analyze_harmony(y,sr,count)
if __name__=='__main__':unittest.main(verbosity=2)
