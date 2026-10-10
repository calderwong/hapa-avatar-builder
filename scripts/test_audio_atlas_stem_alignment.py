import unittest
from fractions import Fraction
import numpy as np
from audio_atlas_stem_alignment import stem_alignment

class StemAlignment(unittest.TestCase):
    def setUp(self):
        self.rate=8000
        rng=np.random.default_rng(81)
        raw=rng.normal(0,.1,self.rate*40)
        # Band-limited broadband signal permits controlled fractional resampling.
        self.stem=np.convolve(raw,np.ones(5)/5,mode='same')
        self.other=rng.normal(0,.02,len(raw))
        self.master=self.stem+self.other
    def test_shift_and_reversible_source_rate_map(self):
        stem=np.r_[np.zeros(400),self.stem[:-400]]
        r=stem_alignment(self.master,stem,source_rate=44100,master_rate=48000,
                         source_count=len(stem)*44100//8000,master_count=len(stem)*6)
        self.assertEqual(r['status'],'affine_alignment_candidate')
        self.assertAlmostEqual(r['offset_seconds'],-.05,places=4)
        def f(x,m):
            q=lambda v:Fraction(int(v['numerator']),int(v['denominator']))
            return x*q(m['scale'])+q(m['offset_samples'])
        for x in (0,44100,44100*30):
            self.assertEqual(f(f(x,r['proposed_map']),r['proposed_inverse_map']),x)
        self.assertFalse(r['alignment_applied'])
        self.assertIsNone(r['decoder_delay_seconds'])
    def test_drift(self):
        # Source stretched by 200 ppm: master_time = source_time / 1.0002.
        x=np.arange(len(self.stem))
        stretched=np.interp(x/1.0002,x,self.stem)
        r=stem_alignment(self.master,stretched)
        self.assertEqual(r['status'],'affine_alignment_candidate')
        self.assertAlmostEqual(r['drift_ppm'],-200,delta=15)
    def test_partial_source_duration_does_not_claim_missing_music(self):
        r=stem_alignment(self.master,self.stem[:8000*24])
        self.assertEqual(r['status'],'affine_alignment_candidate')
        self.assertEqual(r['duration_difference_seconds'],-16)
        self.assertTrue(r['missing_material'].startswith('unknown'))
        self.assertEqual(r['proposed_map']['domain_end_sample'],8000*24)
    def test_silence(self):
        r=stem_alignment(self.master,np.zeros_like(self.stem))
        self.assertIsNone(r['proposed_map'])
        self.assertEqual(r['leading_activity']['state'],'no_activity_above_threshold')
    def test_repeating_tone_is_ambiguous(self):
        tone=np.sin(np.arange(len(self.stem))*2*np.pi*220/8000)
        self.assertIsNone(stem_alignment(tone,tone)['proposed_map'])
    def test_unrelated_audio(self):
        other=np.random.default_rng(200).normal(size=len(self.stem))
        self.assertIsNone(stem_alignment(self.master,other)['proposed_map'])
    def test_jump_is_not_hidden_in_single_map(self):
        stem=self.stem.copy();stem[len(stem)//2:]=np.roll(stem[len(stem)//2:],400)
        self.assertIsNone(stem_alignment(self.master,stem)['proposed_map'])
    def test_bad_pcm(self):
        with self.assertRaises(ValueError): stem_alignment(self.master,np.array([np.nan]))
if __name__=='__main__': unittest.main()
