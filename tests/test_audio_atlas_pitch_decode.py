"""Whole-worker decoder, source clock and cleanup checks on synthetic WAVs."""
import importlib.util,unittest,tempfile,wave,shutil,signal,sys,os,json,hashlib
from pathlib import Path
from importlib.metadata import version
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
spec=importlib.util.spec_from_file_location('atlas_pitch_worker',Path(__file__).resolve().parents[1]/'scripts/audio-atlas-pitch.py');worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
@unittest.skipUnless(shutil.which('ffmpeg'),'existing FFmpeg required')
class DecoderTests(unittest.TestCase):
 def run_worker(self,folder,rate,channel,bad=False):
  folder.mkdir(parents=True);data=np.zeros((rate,2),dtype='<i2');data[rate//2,1]=30000;file=folder/'source.wav'
  with wave.open(str(file),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes(data.tobytes())
  if bad:file.write_bytes(b'not audio')
  source={'id':'master','path':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()};a={'id':'master','status':'ready','role':'Synthetic fixture','channels':2,'sample_rate_hz':rate,'sample_count':rate,'source_sha256':source['sha256'],'timeline_id':'synthetic'}
  manifest=folder/'manifest.json';manifest.write_text(json.dumps({'sources':[source],'pitch':{'sourceId':'master','channel':channel},'pitch_runtime':{'packages':{k:version(k) for k in ['librosa','numpy','scipy','numba','llvmlite','soxr']}}}));(folder/'result.json').write_text(json.dumps({'assets':[a],'coverage':{},'elapsed_seconds':0}))
  old=sys.argv;sys.argv=['worker','--manifest',str(manifest)];os.environ['HAPA_AUDIO_ATLAS_WORKER']='1'
  try:worker.main();return json.loads((folder/'result.json').read_text())['pitch_analysis']
  finally:sys.argv=old;signal.alarm(0);self.assertFalse((folder/'pitch-input.f32').exists())
 def test_real_worker_clock_channel_and_temp_cleanup(self):
  with tempfile.TemporaryDirectory(prefix='hapa-atlas-pitch-decode-') as root:
   for rate in [44100,48000,96000]:
    p=self.run_worker(Path(root)/'runs'/str(rate),rate,1);self.assertEqual(p['analysis_sample_count'],16000);f=max(p['frames'],key=lambda f:f['rms_dbfs'] or -999);self.assertLessEqual(abs(f['center_sample']-rate//2),rate*.04);self.assertEqual(p['source_channel'],1)
   silent=self.run_worker(Path(root)/'runs'/'silent',48000,0);self.assertTrue(all(f['rms_dbfs'] is None for f in silent['frames']));self.assertEqual(silent['voiced_frame_count'],0)
 def test_decoder_failure_has_bounded_diagnostic_and_cleanup(self):
  with tempfile.TemporaryDirectory(prefix='hapa-atlas-pitch-decode-') as root:
   with self.assertRaisesRegex(RuntimeError,'Pitch decoder failed:') as error:self.run_worker(Path(root)/'runs'/'bad',48000,0,True)
   self.assertLess(len(str(error.exception)),2040)
if __name__=='__main__':unittest.main(verbosity=2)
