"""Bounded synthetic owner proof: one Python process, serial FFprobe/FFmpeg.
No network, model, album writes, reconstruction analysis or extra worker.
"""
import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import wave
import numpy as np
root=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('telemetry',root/'scripts/build-stem-telemetry-bundle.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='ll-exact-analysis-') as directory:
    d=pathlib.Path(directory)
    def wav(name,frequency):
        samples=(np.sin(np.arange(8000)*2*np.pi*frequency/8000)*8000).astype('<i2') if frequency else np.zeros(8000,dtype='<i2')
        file=d/name
        with wave.open(str(file),'wb') as writer:
            writer.setnchannels(1);writer.setsampwidth(2);writer.setframerate(8000);writer.writeframes(samples.tobytes())
        return file
    master=wav('master.wav',220);first=wav('first.wav',80);second=wav('second.wav',440);silent=wav('silent.wav',0)
    original={f:hashlib.sha256(f.read_bytes()).hexdigest() for f in [master,first,second,silent]}
    stems=[{'id':'stem:'+str(i),'assetId':'asset-'+str(i),'stemType':'Drums' if i<2 else 'Unknown texture','declaredRole':'Drums' if i<2 else 'Unknown texture','audioPath':str(file)} for i,file in enumerate([first,second,silent,d/'missing.wav'])]
    rows,ignored=module.canonical_stem_inputs(stems,'living-light-assets-v1')
    assert len(rows)==4 and not ignored
    try:
        module.canonical_stem_inputs(stems,'role')
        raise AssertionError('Legacy ambiguity was weakened')
    except ValueError:
        pass
    try:
        module.canonical_stem_inputs([stems[0],stems[0]],'living-light-assets-v1')
        raise AssertionError('Duplicate exact identity was accepted')
    except ValueError:
        pass
    graph=d/'graph.json';output=d/'telemetry.json';analyzed=d/'analyzed.json'
    graph.write_text(json.dumps({'source':{'identityPolicy':'living-light-assets-v1'},'song':{'id':'fixture-exact-song'},'stems':{'items':stems}}))
    before=graph.read_bytes()
    sys.argv=[str(module.__file__),'--graph',str(graph),'--master',str(master),'--output',str(output),'--graph-output',str(analyzed),'--fps','10','--sample-rate','8000','--cache-dir',str(d/'cache')]
    assert module.main()==0
    telemetry=json.loads(output.read_text())
    assert telemetry['sourcePolicy']=='living-light-assets-v1' and telemetry['canonicalStemCount']==4 and telemetry['usableStemCount']==3
    assert [s['assetId'] for s in telemetry['stems']]==[s['assetId'] for s in stems]
    assert telemetry['stems'][0]['audioHash']!=telemetry['stems'][1]['audioHash']
    assert telemetry['stems'][2]['decodedAnalysis']['frameCount']==8000
    assert all(f['silence'] and f['rms']==0 and f['onset']==0 for f in telemetry['stems'][2]['frames'])
    assert telemetry['stems'][3]['frames']==[] and telemetry['stems'][3]['status']=='missing-path'
    assert telemetry['masterMix']['isolatedStemReconstructionDiagnostic']['available'] is False
    assert all(e['resourceId'] in {'master','stem:0','stem:1','stem:2'} and e['kind']!='beat' for e in telemetry['sparseEvents'])
    assert graph.read_bytes()==before and all(hashlib.sha256(f.read_bytes()).hexdigest()==h for f,h in original.items())
    assert module.main()==0  # Only unchanged synthetic resources; decoded cache hits.
    assert all(hashlib.sha256(f.read_bytes()).hexdigest()==h for f,h in original.items())
    print(json.dumps({'ok':True,'exactAssets':4,'measuredAssets':3,'missingAssets':1,'sourceUnchanged':True,'alignmentApplied':False,'fixture':'synthetic'}))
