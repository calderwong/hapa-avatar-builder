import unittest
from audio_atlas_word_alignment import validate_alignment


class AlignmentValidation(unittest.TestCase):
    def validate(self, text='Hi hi.', items=None, **kwargs):
        return validate_alignment(text=text, items=items if items is not None else [
            {'text': 'Hi', 'start_seconds': 0, 'end_seconds': .5},
            {'text': 'hi', 'start_seconds': .5, 'end_seconds': 1}],
            **({'pcm': [.2] * 16000, 'source_rate': 48000,
                'source_sample_count': 48000} | kwargs))

    def test_repeated_tokens_keep_distinct_indices_and_original_text(self):
        r = self.validate()
        self.assertEqual([x['supplied_token_index'] for x in r['candidates']], [0, 1])
        self.assertEqual([x['text'] for x in r['candidates']], ['Hi', 'hi.'])
        self.assertFalse(r['performed_text_verified'])
        self.assertIsNone(r['confidence'])

    def test_silence_rejects_even_positive_duration_model_output(self):
        r = self.validate(pcm=[0.] * 16000)
        self.assertEqual(r['candidates'], [])
        self.assertTrue(all('silent_or_below_energy_floor' in x['reasons'] for x in r['unresolved']))

    def test_zero_duration_never_widened(self):
        r = self.validate(items=[{'text': 'Hi', 'start_seconds': 0, 'end_seconds': 0},
                                 {'text': 'hi', 'start_seconds': .5, 'end_seconds': 1}])
        self.assertEqual(len(r['candidates']), 1)
        self.assertIn('zero_duration', r['unresolved'][0]['reasons'])
        self.assertNotIn('start_sample', r['unresolved'][0])

    def test_crop_offset_and_rational_resampling(self):
        r = self.validate(source_rate=44100, source_sample_count=44100*27,
                          crop_start_sample=44100*26)
        self.assertEqual([(x['start_sample'], x['end_sample']) for x in r['candidates']],
                         [(1146600, 1168650), (1168650, 1190700)])
        self.assertEqual(r['analysis_view']['map_denominator'], 16000)

    def test_omitted_or_extra_words_refuse_all_positional_matching(self):
        for text in ['Hi there hi.', 'Hi.', 'Wrong words.']:
            r = self.validate(text=text)
            self.assertFalse(r['transcript_match'])
            self.assertEqual(r['candidates'], [])

    def test_punctuation_keeps_source_text_offsets(self):
        text = "Ani’s thirty-seven can't"
        items = [{'text': t, 'start_seconds': a, 'end_seconds': b}
                 for t, a, b in [('Anis',0,.2), ('thirtyseven',.2,.5), ("can't",.5,1)]]
        r = self.validate(text=text, items=items)
        self.assertTrue(r['transcript_match'])
        self.assertEqual([text[t['text_start']:t['text_end']] for t in r['supplied_tokens']], text.split())

    def test_nonfinite_negative_reversed_overflow_and_bool_times(self):
        for a, b in [(float('nan'), 1), (0, float('inf')), (-1, .2), (.5, .2), (0, 2), (False, 1)]:
            r = self.validate(text='Hi', items=[{'text':'Hi','start_seconds':a,'end_seconds':b}])
            self.assertEqual(r['candidates'], [])

    def test_nonmonotonic_and_overlap_rejected(self):
        r = self.validate(items=[{'text':'Hi','start_seconds':.4,'end_seconds':.8},
                                 {'text':'hi','start_seconds':.3,'end_seconds':1}])
        self.assertEqual(len(r['candidates']), 1)
        self.assertIn('nonmonotonic_or_overlapping', r['unresolved'][0]['reasons'])

    def test_interval_silence_with_non_silent_clip(self):
        r = self.validate(pcm=[.2]*8000 + [0.]*8000)
        self.assertEqual(len(r['candidates']), 1)
        self.assertIn('interval_below_energy_floor', r['unresolved'][0]['reasons'])

    def test_invalid_pcm_clock_and_clip_fail_closed(self):
        for kw in [{'pcm': []}, {'pcm': [float('nan')]}, {'pcm':[1.1]},
                   {'source_rate':False}, {'crop_start_sample':1}, {'input_rate':8000}]:
            with self.assertRaises(ValueError): self.validate(**kw)

    def test_empty_subsample_interval_is_unresolved(self):
        r = self.validate(text='Hi', items=[{'text':'Hi','start_seconds':0,'end_seconds':1e-9}])
        self.assertEqual(r['candidates'], [])


if __name__ == '__main__': unittest.main()
