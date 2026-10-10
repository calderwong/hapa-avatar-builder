import unittest
import numpy as np
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location("atlas_worker",Path(__file__).with_name("audio-atlas-worker.py"))
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
features=worker.features
from echo_audio_analysis_cache import transient_events
from echo_reconstruction_alignment import reconstruction_waveform_alignment

class Measurements(unittest.TestCase):
 def test_stereo_is_not_downmixed_in_features(self):
  a=np.column_stack((np.full(100,.5),np.full(100,.25))).astype(np.float32)
  f=features(a,100)['frames'][0]
  self.assertEqual(f['rms'],[.5,.25]);self.assertEqual(f['peak'],[.5,.25]);self.assertEqual(f['start_sample'],0)
 def test_partial_frame_has_actual_end(self):
  f=features(np.ones((15,1),dtype=np.float32),100)['frames']
  self.assertEqual(f[-1]['end_sample'],15);self.assertEqual(f[-1]['rms'],[1.])
 def test_silence_does_not_create_events(self):
  self.assertEqual(transient_events(np.zeros(8000,dtype=np.float32),8000),[])
  f=features(np.zeros((100,2),dtype=np.float32),100)['frames'][0]
  self.assertIsNone(f['spectral_centroid_hz'])
 def test_shifted_stem_sum_measures_offset_not_individual_alignment(self):
  rng=np.random.default_rng(3);x=rng.normal(0,.2,8000*32).astype(np.float32)
  y=np.r_[np.zeros(160),x[:-160]]
  r=reconstruction_waveform_alignment(x,y,8000)
  self.assertEqual(r['status'],'consistent-reconstruction-lag');self.assertAlmostEqual(r['proposedGroupOriginSeconds'],-.02,places=4)
  self.assertFalse(r['individualStemOriginsVerified'])
if __name__=='__main__':unittest.main()
