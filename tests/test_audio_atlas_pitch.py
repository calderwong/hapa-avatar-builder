"""Deterministic numerical qualification; all labels here are synthetic."""
import os,sys,signal,unittest,json,math
from pathlib import Path
os.environ.setdefault('NUMBA_CACHE_DIR', '/tmp/hapa-atlas-pitch-test-numba-cache')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
signal.alarm(180)
import numpy as np
from unittest.mock import patch
from audio_atlas_pitch import track_pitch,RATE,HOP,WINDOW,PARAMS
class PitchTests(unittest.TestCase):
 def test_silence_and_quiet_tone_abstain(self):
  for y in [np.zeros(RATE),1e-5*np.sin(2*np.pi*220*np.arange(RATE)/RATE)]:
   p=track_pitch(y,RATE,len(y));self.assertEqual(p['voiced_frame_count'],0);self.assertTrue(all(f['f0_hz'] is None and f['cents_from_a4'] is None for f in p['frames']))
 def test_known_tone_cents_and_raw_provenance(self):
  y=.3*np.sin(2*np.pi*220*np.arange(RATE*2)/RATE);p=track_pitch(y,RATE,len(y));f=p['frames'][20:-20]
  self.assertTrue(all(v['voiced'] for v in f));self.assertLess(np.median([abs(v['cents_from_a4']+1200) for v in f]),10);self.assertTrue(all(v['raw_f0_hz']==v['f0_hz'] for v in f));self.assertFalse(p['quality_qualified'])
 def test_noise_unvoiced_proxy_abstains_without_erasing_raw_score(self):
  y=np.random.default_rng(1).normal(0,.1,RATE*2);p=track_pitch(y,RATE,len(y));self.assertEqual(p['voiced_frame_count'],0);self.assertTrue(any(f['raw_voiced'] for f in p['frames']));self.assertTrue(all(f['voicing_score']<.1 for f in p['frames']))
 def test_fricative_noise_proxy_abstains(self):
  from scipy.signal import butter,sosfilt
  y=sosfilt(butter(4,3000,fs=RATE,btype='highpass',output='sos'),np.random.default_rng(7).normal(0,.1,RATE*2));p=track_pitch(y,RATE,len(y));self.assertLess(p['voiced_frame_count']/p['frame_count'],.02)
 def test_vibrato_tracks_frequency_variation(self):
  t=np.arange(RATE*3)/RATE;hz=220*2**((40*np.sin(2*np.pi*5*t))/1200);y=.3*np.sin(2*np.pi*np.cumsum(hz)/RATE);p=track_pitch(y,RATE,len(y));errors=[abs(1200*np.log2(f['f0_hz']/hz[f['analysis_center_sample']])) for f in p['frames'][20:-20] if f['voiced']];self.assertGreater(len(errors),240);self.assertLess(np.median(errors),15);self.assertLess(np.percentile(errors,95),30)
 def test_overlap_exposes_subharmonic_not_polyphonic_truth(self):
  t=np.arange(RATE*2)/RATE;y=.2*np.sin(2*np.pi*220*t)+.2*np.sin(2*np.pi*330*t);p=track_pitch(y,RATE,len(y));median=np.median([f['f0_hz'] for f in p['frames'][20:-20] if f['voiced']]);self.assertLess(abs(median-110),2);self.assertFalse(p['polyphonic_separation']);self.assertTrue(any('subharmonic' in v for v in p['limitations']))
 def test_missing_fundamental_octave_ambiguity_recorded(self):
  t=np.arange(RATE*2)/RATE;y=.3*np.sin(2*np.pi*440*t);p=track_pitch(y,RATE,len(y));median=np.median([f['f0_hz'] for f in p['frames'][20:-20] if f['voiced']]);self.assertLess(abs(1200*np.log2(median/220)-1200),10)
 def test_chunk_stitch_source_clock_and_tail(self):
  count=RATE*31+83;y=np.full(count,.2);calls=[]
  def fake(y,**kwargs):
   calls.append((len(y),kwargs));n=1+len(y)//HOP;return np.full(n,220.),np.ones(n,dtype=bool),np.full(n,.9)
  source_count=round(count*44100/RATE)
  with patch('librosa.pyin',fake):p=track_pitch(y,44100,source_count)
  self.assertEqual(len(calls),2);self.assertEqual(p['frame_count'],math.ceil(count/HOP));self.assertEqual(p['frames'][3000]['chunk_index'],1)
  for i,f in enumerate(p['frames']):self.assertEqual(f['center_sample'],(i*HOP*44100+8000)//RATE)
  self.assertEqual(p['frames'][-1]['support_end_sample'],source_count);self.assertEqual(calls[0][1]['center'],True)
 def test_invalid_views_refused(self):
  for y,sr,n in [(np.zeros(20),RATE,100),(np.array([float('nan')]),RATE,1),(np.zeros((1,2)),RATE,2)]:
   with self.assertRaises(ValueError):track_pitch(y,sr,n)
if __name__=='__main__':unittest.main(verbosity=2)
