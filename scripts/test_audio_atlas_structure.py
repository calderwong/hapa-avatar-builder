import unittest
import numpy as np
from audio_atlas_structure import analyze_structure,novelty_curve,structure_observations,RATE

def tone(seconds,freq=440,amplitude=.2):
 t=np.arange(round(seconds*RATE))/RATE
 return amplitude*np.sin(2*np.pi*freq*t)

class StructureTests(unittest.TestCase):
 def test_novelty_matches_direct_checkerboard_without_full_matrix(self):
  f=np.random.default_rng(42).normal(size=(80,7));n=novelty_curve(f,4)
  w=np.r_[-np.ones(4),np.ones(4)]/8
  for i in (4,23,75):
   block=f[i-4:i+4];expected=float(w@(block@block.T)@w)
   self.assertAlmostEqual(n[i],expected,places=12)
 def test_silence_and_stationary_tone_abstain_from_boundaries_and_repetition(self):
  for x in (np.zeros(32*RATE),tone(32)):
   r=analyze_structure(x,48000,len(x)*6)
   self.assertEqual(r['boundaries'],[]);self.assertEqual(r['repeats'],[])
   self.assertEqual(r['status'],'no_boundaries_detected');self.assertFalse(r['quality_qualified'])
 def test_contrasting_sections_have_localized_source_boundaries_and_gapless_regions(self):
  x=np.r_[tone(16,220),tone(16,1500),tone(16,220)]
  r=analyze_structure(x,44100,48*44100)
  self.assertEqual(len(r['boundaries']),2)
  for row,t in zip(r['boundaries'],(16,32)):self.assertLess(abs(row['sample']/44100-t),.6)
  self.assertEqual(r['regions'][0]['start_sample'],0);self.assertEqual(r['regions'][-1]['end_sample'],48*44100)
  for a,b in zip(r['regions'],r['regions'][1:]):self.assertEqual(a['end_sample'],b['start_sample'])
  self.assertTrue(all(row['functional_label'] is None for row in r['regions']))
 def test_repeated_dynamic_passage_retains_competing_similarity_not_identity(self):
  t=np.arange(16*RATE)/RATE
  a=.2*np.sin(2*np.pi*(440*t+18*np.sin(2*np.pi*t/4)))
  b=.2*np.sin(2*np.pi*(1600*t+180*np.sin(2*np.pi*t/4)))
  r=analyze_structure(np.r_[a,b,a],RATE,48*RATE)
  self.assertTrue(r['repeats'],r['boundaries'])
  best=r['repeats'][0];self.assertEqual(best['relation'],'similar_spectral_sequence_candidate');self.assertGreater(best['similarity'],.95)
 def test_energy_drop_quiet_break_and_gradual_build_are_qualified_candidates(self):
  x=np.r_[tone(12),np.zeros(12*RATE),tone(12)]
  r=analyze_structure(x,RATE,len(x));self.assertTrue(any(t['kind']=='quiet_break_candidate' for t in r['transitions']))
  t=np.arange(16*RATE)/RATE;x=tone(16)*10**((-20+1.2*t)/20)
  r=analyze_structure(x,RATE,len(x));self.assertTrue(any(t['kind']=='gradual_build_candidate' for t in r['transitions']))
 def test_duration_partial_grid_raw_evidence_and_invalid_inputs(self):
  x=tone(2.13);r=analyze_structure(x,48000,len(x)*6)
  self.assertEqual(r['regions'][-1]['end_sample'],len(x)*6);self.assertEqual(r['analysis_view']['map_numerator'],48000)
  a={'id':'master','timeline_id':'pcm:test','sample_rate_hz':48000,'source_sha256':'a'*64}
  rows=structure_observations(r,a,'run','b'*64);self.assertEqual(rows[0]['provenance']['raw_evidence_sha256'],'b'*64)
  for bad in (np.array([]),np.array([np.nan]),np.zeros((10,2))):
   with self.assertRaises(ValueError):analyze_structure(bad,RATE,10)
  with self.assertRaises(ValueError):analyze_structure(x,RATE,20)

if __name__=='__main__':unittest.main()
