import importlib.util
import json
import sys
import time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from echo_audio_analysis_cache import AudioAnalysisCache
from echo_reconstruction_alignment import reconstruction_waveform_alignment
spec=importlib.util.spec_from_file_location('analyzer',ROOT/'scripts/build-stem-telemetry-bundle.py');analyzer=importlib.util.module_from_spec(spec);spec.loader.exec_module(analyzer)
output=Path(next((arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--output=')),str(ROOT/'artifacts/echo-reconstruction-proof')))
output.mkdir(parents=True,exist_ok=True)
cohort=json.loads((ROOT/'artifacts/echo-enhancement-current-baseline/cohort-preparation-api.json').read_text())['results']
cache=AudioAnalysisCache(ROOT/'data/cache/stem-analysis',analyzer.ANALYSIS_VERSION,runtime_identity=analyzer.analysis_runtime_identity())
results=[]
protected_keys=set()
for row in cohort:
    started=time.perf_counter();directory=ROOT/'data/cache/echo-performance/published'
    pointer_file=directory/('master-'+row['expectedAudioHash']+'.json');pointer_bytes=pointer_file.read_bytes();pointer=json.loads(pointer_bytes)
    publication_file=directory/(pointer['key']+'.json');publication=json.loads(publication_file.read_text());sources=publication['sourceChecks']
    decoded=[];master=None;source_hashes=[]
    for source in sources:
        file=Path(source['path']);digest=analyzer.sha256_file(file)
        if digest!=source['sha256']:raise ValueError('Published audio source changed')
        resource_key,samples,_=cache.resource(file,digest,10,8000,analyzer.decode,analyzer.analyze)
        protected_keys.add(resource_key)
        if analyzer.sha256_file(file)!=digest:raise ValueError('Source changed during diagnostic')
        source_hashes.append({'role':source['role'],'sha256':digest})
        if source['role']=='master':master=samples
        else:decoded.append(samples)
    if decoded:
        minimum=min([len(master),*[len(samples) for samples in decoded]])
        reconstruction=np.zeros(minimum,dtype=np.float32)
        for samples in decoded:reconstruction+=samples[:minimum]/len(decoded)
        diagnostic=reconstruction_waveform_alignment(master[:minimum],reconstruction,8000)
    else:diagnostic={'status':'no-isolated-stems','proposedGroupOriginSeconds':None,'automaticOriginCorrection':False}
    if pointer_file.read_bytes()!=pointer_bytes:raise ValueError('Publication changed during proof')
    result={'songId':row['songId'],'masterAudioHash':row['expectedAudioHash'],'sourceHashes':source_hashes,'sourcesUnchanged':True,'stemCount':len(decoded),'diagnostic':diagnostic,'elapsedMs':(time.perf_counter()-started)*1000}
    results.append(result)
    (output/'report.json').write_text(json.dumps({'pass':False,'scope':'Measured complete-stem PCM reconstruction timing; no source mutation or automatic offset correction','results':results,'cache':cache.metrics},indent=2)+'\n')
    print(json.dumps({'song':row['songId'],'status':diagnostic['status'],'lag':diagnostic.get('proposedGroupOriginSeconds'),'reliableWindows':diagnostic.get('reliableWindows'),'elapsedMs':result['elapsedMs']}),flush=True)
budget=cache.prune(protected_keys)
(output/'report.json').write_text(json.dumps({'pass':len(results)==len(cohort),'scope':'Measured complete-stem PCM reconstruction timing; no source mutation or automatic offset correction','results':results,'cache':cache.metrics,'budget':budget},indent=2)+'\n')
