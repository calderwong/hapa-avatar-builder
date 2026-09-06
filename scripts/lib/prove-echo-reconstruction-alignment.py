import json
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from echo_reconstruction_alignment import reconstruction_waveform_alignment, waveform_window_alignment
rate=8000
rng=np.random.default_rng(31)
reference=rng.normal(0,.1,rate*64).astype(np.float32)
for lag in [0,173,-251]:
    candidate=np.zeros_like(reference)
    if lag>0:candidate[lag:]=reference[:-lag]
    elif lag<0:candidate[:lag]=reference[-lag:]
    else:candidate[:]=reference
    result=reconstruction_waveform_alignment(reference,candidate,rate)
    assert result['status']=='consistent-reconstruction-lag',result
    assert abs(result['proposedGroupOriginSeconds']+lag/rate)<=1/rate,result
    assert result['automaticOriginCorrection'] is False and result['individualStemOriginsVerified'] is False
silent=reconstruction_waveform_alignment(np.zeros_like(reference),np.zeros_like(reference),rate)
assert silent['proposedGroupOriginSeconds'] is None and all(w['status']=='silence-or-insufficient-energy' for w in silent['windows'])
tone=np.sin(np.arange(rate*64)*2*np.pi*100/rate).astype(np.float32)
assert reconstruction_waveform_alignment(tone,tone,rate)['proposedGroupOriginSeconds'] is None
unrelated=rng.normal(0,.1,len(reference)).astype(np.float32)
assert reconstruction_waveform_alignment(reference,unrelated,rate)['proposedGroupOriginSeconds'] is None
sparse=np.zeros_like(reference);sparse[rate*30:rate*30+100]=reference[rate*30:rate*30+100]
assert reconstruction_waveform_alignment(reference,sparse,rate)['proposedGroupOriginSeconds'] is None
shifted=np.concatenate([np.zeros(rate//10),reference[:-rate//10]])
drifting=reference.copy();drifting[len(reference)//2:]=shifted[len(reference)//2:]
assert reconstruction_waveform_alignment(reference,drifting,rate)['proposedGroupOriginSeconds'] is None
print(json.dumps({'pass':True,'fixtures':8,'policy':'No automatic per-stem correction'}))
