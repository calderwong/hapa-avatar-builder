import unittest,json,os,shutil,tempfile,subprocess
from pathlib import Path
import numpy as np
from audio_atlas_technical import technical,parse_loudness,loudness_args
class Technical(unittest.TestCase):
 def test_tone_levels_and_matching_channels(self):
  x=.5*np.sin(2*np.pi*np.arange(48000)*1000/48000);r=technical(np.column_stack((x,x)),48000)
  self.assertAlmostEqual(r['summary']['rms_dbfs'][0],-9.0309,places=3);self.assertAlmostEqual(r['summary']['peak_dbfs'][0],-6.0206,places=3);self.assertAlmostEqual(r['summary']['stereo_correlation'],1);self.assertAlmostEqual(r['summary']['crest_db'][0],3.0103,places=3)
 def test_polarity_and_dc_removal(self):
  x=np.arange(1000)/1000;r=technical(np.column_stack((x+5,-x+2)),1000);self.assertAlmostEqual(r['summary']['stereo_correlation'],-1)
 def test_silence_and_constant_undefined(self):
  for x in (np.zeros((1000,2)),np.ones((1000,2))*.2):self.assertIsNone(technical(x,1000)['summary']['stereo_correlation'])
  r=technical(np.zeros((1000,2)),1000);self.assertEqual(r['summary']['rms_dbfs'],[None,None]);self.assertIsNone(r['quiet_level']['noise_floor_dbfs']);json.dumps(r,allow_nan=False)
 def test_mono_and_multichannel(self):
  for c in (1,3,8):self.assertIsNone(technical(np.ones((100,c)),100)['summary']['stereo_correlation'])
 def test_thresholds_tail_counts_and_source_support(self):
  x=np.zeros((105,1));x[-5:,0]=[.999,1,-1,1.2,.998];r=technical(x,1000)
  self.assertEqual(r['summary']['at_or_above_full_scale'],[3]);self.assertEqual(r['summary']['near_full_scale'],[4]);self.assertEqual(r['frames'][-1]['end_sample'],105);self.assertEqual(r['quiet_level']['window_count'],1);self.assertEqual(r['quiet_level']['rms_p10_dbfs'],[None])
 def test_independent_channels(self):
  r=technical(np.random.default_rng(4).normal(0,.1,(100000,2)),48000);self.assertLess(abs(r['summary']['stereo_correlation']),.02)
 def test_invalid_pcm(self):
  for x in (np.zeros((0,1)),np.array([[np.nan]]),np.ones(20)):
   with self.assertRaises(ValueError):technical(x,48000)
 def test_parse_rejects_incomplete_and_nan(self):
  for x in ('no report','{}',json.dumps({'input_i':'nan','input_tp':'0','input_lra':'0','input_thresh':'-70'})):
   with self.assertRaises(ValueError):parse_loudness(x,48000,48000,2)
 def test_argument_boundary(self):
  a=loudness_args('/ffmpeg','/audio x.f32',48000,1);self.assertEqual(a[a.index('-i')+1],'/audio x.f32');self.assertEqual(a[a.index('-channel_layout')+1],'mono');self.assertEqual(a[-3:],['-f','null','-'])
  with self.assertRaises(ValueError):loudness_args('/ffmpeg','x',48000,3)
 @unittest.skipUnless(shutil.which('ffmpeg'),'existing FFmpeg required')
 def test_real_meter_tone_short_silence_and_final_partial_peak(self):
  # Six serial children, max depth one; run timeout kills/reaps each direct child.
  # No shell, retries, inherited Python/Node flags, or persistent outputs.
  with tempfile.TemporaryDirectory(prefix='atlas-technical-test-') as d:
   sr=48000;results={}
   for name,n in [('tone',sr*4+123),('tail',sr*4+123),('short',sr//10),('silence',sr*4),('intersample',sr*4),('mono',sr*4)]:
    x=.1*np.sin(2*np.pi*1000*np.arange(n)/sr);x=np.column_stack((x,x)).astype('<f4')
    if name=='tail':x[-100:]*=8
    if name=='intersample':
     y=np.sin(2*np.pi*12000*np.arange(n)/sr+np.pi/4);x=np.column_stack((y,y)).astype('<f4')
    if name=='mono':x=x[:,:1]
    if name=='silence':x[:]=0
    p=Path(d)/'pcm.f32';x.tofile(p)
    raw=subprocess.run(loudness_args(shutil.which('ffmpeg'),p,sr,x.shape[1]),capture_output=True,check=True,timeout=15,env={k:os.environ[k] for k in ('PATH','HOME','TMPDIR') if k in os.environ}).stderr
    results[name]=parse_loudness(raw,n,sr,x.shape[1])
   self.assertAlmostEqual(results['tone']['integrated_lufs'],-20.0,delta=.15);self.assertAlmostEqual(results['tone']['true_peak_dbtp'],-20,delta=.05)
   self.assertGreater(results['intersample']['true_peak_dbtp'],-1);self.assertAlmostEqual(results['mono']['integrated_lufs'],results['tone']['integrated_lufs']-3.01,delta=.1)
   self.assertGreater(results['tail']['true_peak_dbtp'],-2.1);self.assertIsNone(results['short']['integrated_lufs']);self.assertIsNone(results['short']['loudness_range_lu']);self.assertIsNone(results['silence']['integrated_lufs']);self.assertIsNone(results['silence']['true_peak_dbtp'])
if __name__=='__main__':unittest.main()
