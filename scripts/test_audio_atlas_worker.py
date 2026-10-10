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
 def test_nan_whisper_windows_retry_quieter_then_drop(self):
  nan=float('nan');calls=[]
  def seg(text,logprob,start=0.):return {'text':text,'avg_logprob':logprob,'start':start,'words':[{'word':text,'start':start,'end':start+1,'probability':.9}]}
  def fake(audio):
   calls.append(float(np.max(audio)))
   return {'text':'x','segments':[seg(' ok',-.2),seg('!',nan,30.)]} if len(calls)<3 else {'text':' ok fixed','segments':[seg(' ok',-.2),seg(' fixed',-.3,30.)]}
  t,d=worker.transcribe_finite(fake,np.ones(4,dtype=np.float32))
  self.assertEqual(calls,[1.,.5,.25]);self.assertEqual(d['input_gain'],.25);self.assertEqual(d['dropped_nonfinite_segments'],0)
  self.assertEqual([s['text'] for s in t['segments']],[' ok',' fixed'])
  t,d=worker.transcribe_finite(lambda a:{'text':'x','segments':[seg(' ok',-.2),seg('!',nan,30.)]},np.ones(4,dtype=np.float32))
  self.assertEqual(d['dropped_nonfinite_segments'],1);self.assertEqual(t['text'],' ok');self.assertEqual(len(d['attempts']),3)
  self.assertEqual(worker.finite_json({'a':[nan,np.float32(1.5),float('inf')]}),{'a':[None,1.5,None]})
if __name__=='__main__':unittest.main()
