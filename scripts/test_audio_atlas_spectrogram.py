import unittest
import numpy as np
from audio_atlas_spectrogram import spectrogram,MAX_FRAMES

class SpectrogramTests(unittest.TestCase):
 def test_silence_is_floor_without_channel_or_source_normalization(self):
  m,x=spectrogram(np.zeros((16001,2),dtype=np.float32),8000)
  self.assertEqual(x.dtype,np.uint8);self.assertEqual(x.shape,(m['frame_count'],2,m['band_count']));self.assertTrue(np.all(x==0));self.assertEqual(m['sample_count'],16001)
 def test_bin_centered_sine_is_calibrated_peak_amplitude(self):
  sr=48000;n=4096;freq=100*sr/n;t=np.arange(sr)/sr
  m,x=spectrogram((.5*np.sin(2*np.pi*freq*t))[:,None],sr)
  band=next(i for i,b in enumerate(m['bands']) if b['first_fft_bin']<=100<b['end_fft_bin'])
  self.assertEqual(m['fft_size'],n);self.assertAlmostEqual(float(x[10,0,band])*.5-120,20*np.log10(.5),delta=.25)
 def test_separate_stereo_tones_and_antiphase_do_not_downmix(self):
  sr=8000;t=np.arange(sr)/sr;a=.5*np.sin(2*np.pi*500*t);b=.125*np.sin(2*np.pi*2000*t)
  m,x=spectrogram(np.column_stack((a,b)),sr)
  peaks=np.argmax(x[10],axis=1)
  for peak,f in zip(peaks,[500,2000]):self.assertLessEqual(m['bands'][peak]['low_hz'],f);self.assertGreaterEqual(m['bands'][peak]['high_hz'],f)
  self.assertAlmostEqual(float(x[10,0,peaks[0]])-float(x[10,1,peaks[1]]),24,delta=1)
  _,anti=spectrogram(np.column_stack((a,-a)),sr);self.assertTrue(np.array_equal(anti[:,0],anti[:,1]));self.assertGreater(anti.max(),200)
 def test_edge_padding_is_explicit_and_impulse_support_matches_source_clock(self):
  sr=8000;pcm=np.zeros((2001,1));pcm[1000]=1;m,x=spectrogram(pcm,sr)
  for i in range(len(x)):
   center=i*m['hop_samples'];within=center-m['fft_size']//2<1000<center+m['fft_size']//2
   self.assertEqual(bool(x[i].max()>0),within)
  self.assertEqual(m['first_frame_sample'],0);self.assertTrue(m['centered']);self.assertIn('zero padding',m['edge_policy'])
 def test_frequency_bands_partition_dc_through_nyquist_at_multiple_rates(self):
  for sr in [8000,44100,48000,192000]:
   m,x=spectrogram(np.zeros((1000,1)),sr);self.assertLessEqual(m['band_count'],192);self.assertEqual(m['bands'][0]['low_hz'],0);self.assertEqual(m['bands'][-1]['high_hz'],sr/2)
   for a,b in zip(m['bands'],m['bands'][1:]):self.assertEqual(a['high_hz'],b['low_hz']);self.assertEqual(a['end_fft_bin'],b['first_fft_bin'])
 def test_long_source_budget_exposes_sparse_snapshots_without_invented_interpolation(self):
  m,x=spectrogram(np.zeros((MAX_FRAMES*600+17,1),dtype=np.float32),8000)
  self.assertLessEqual(len(x),MAX_FRAMES);self.assertTrue(m['sparse_snapshots']);self.assertLess((len(x)-1)*m['hop_samples'],m['sample_count']);self.assertGreaterEqual(len(x)*m['hop_samples'],m['sample_count'])
 def test_short_source_and_invalid_inputs(self):
  m,x=spectrogram(np.ones((1,1)),8000);self.assertEqual(len(x),1)
  for v,sr in [(np.zeros((0,1)),8000),(np.zeros(10),8000),(np.zeros((10,9)),8000),(np.full((1,1),np.nan),8000),(np.zeros((10,1)),7999)]:
   with self.assertRaises(ValueError):spectrogram(v,sr)

if __name__=='__main__':unittest.main()
