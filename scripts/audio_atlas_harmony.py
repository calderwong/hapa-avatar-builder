"""Hapa-owned spectral-peak/chroma hypotheses. Pure NumPy; no subprocesses.
Template matching background: Mueller FMP C5S2; no upstream code copied.
"""
import numpy as np
import math
RATE=8000;WINDOW=8192;HOP=2000
METHOD='hapa.spectral-peak-harmony.v1'
NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
VOCAB={'major':[0,4,7],'minor':[0,3,7],'diminished':[0,3,6],'augmented':[0,4,8],'sus2':[0,2,7],'sus4':[0,5,7],'dominant7':[0,4,7,10],'major7':[0,4,7,11],'minor7':[0,3,7,10]}
SCALES={'major':[0,2,4,5,7,9,11],'natural_minor':[0,2,3,5,7,8,10]}

def normalized(v):
    s=float(np.sum(v));return v/s if s>0 else np.zeros(12)

def chroma(peaks,tuning=0):
    v=np.zeros(12)
    for p in peaks:
        midi=69+12*np.log2(p['frequency_hz']/440)-tuning/100
        low=math.floor(midi);frac=midi-low
        v[low%12]+=p['amplitude']*(1-frac);v[(low+1)%12]+=p['amplitude']*frac
    return normalized(v)

def key_hypotheses(vec,active_frames):
    v=np.asarray(vec);diversity=int(np.sum(v>=.06))
    if active_frames<8 or diversity<4:return {'state':'unresolved','reason':'Requires at least eight active frames and four pitch classes at >=0.06 share','active_frames':active_frames,'pitch_class_count':diversity,'alternatives':[]}
    rows=[]
    for root in range(12):
        for mode,steps in SCALES.items():
            t=np.zeros(12)
            for s in steps:t[(root+s)%12]=1.
            t[root]=1.5;t[(root+7)%12]=1.25;t[(root+steps[2])%12]=1.2
            score=float(np.dot(v,t)/(np.linalg.norm(v)*np.linalg.norm(t)))
            rows.append({'tonic_pc':root,'mode':mode,'label':NAMES[root]+' '+mode.replace('_',' '),'cosine_similarity':min(1.,max(0.,score))})
    rows.sort(key=lambda r:(-r['cosine_similarity'],r['tonic_pc'],r['mode']))
    return {'state':'candidate','active_frames':active_frames,'pitch_class_count':diversity,'alternatives':rows[:5],'top_two_margin':rows[0]['cosine_similarity']-rows[1]['cosine_similarity']}

def chord_hypotheses(vec,bass):
    v=np.asarray(vec);rows=[]
    for root in range(12):
        for quality,steps in VOCAB.items():
            t=np.zeros(12);pcs=[(root+s)%12 for s in steps];t[pcs]=1.
            score=float(np.dot(v,t)/(np.linalg.norm(v)*np.linalg.norm(t)))
            inversions=[]
            for b in bass:
                interval=(b['pitch_class']-root)%12
                inversions.append({'bass_pc':b['pitch_class'],'bass_peak_hz':b['frequency_hz'],'inversion_index':steps.index(interval) if interval in steps else None,'relation':'chord_tone_candidate' if interval in steps else 'non_chord_tone_or_wrong_hypothesis'})
            rows.append({'root_pc':root,'quality':quality,'label':NAMES[root]+' '+quality,'pitch_classes':pcs,'cosine_similarity':min(1.,max(0.,score)),'inversion_alternatives':inversions})
    rows.sort(key=lambda r:(-r['cosine_similarity'],r['root_pc'],r['quality']))
    return rows[:5]

def analyze_harmony(samples,source_rate,source_count):
    x=np.asarray(samples,dtype=np.float64)
    if x.ndim!=1 or not 0<len(x)<=RATE*1800 or not np.isfinite(x).all() or not isinstance(source_rate,int) or source_rate<8000 or not isinstance(source_count,int) or source_count<=0 or abs(len(x)/RATE-source_count/source_rate)>1/RATE+1/source_rate:raise ValueError('invalid_harmony_source_view')
    taper=np.hanning(WINDOW+1)[:-1];freq=np.fft.rfftfreq(WINDOW,1/RATE);band=(freq>=55)&(freq<=2000)
    frames=[];tuning_z=0j;tuning_weight=0.;peak_count=0
    mapped=lambda n:min(source_count,max(0,(int(n)*source_rate+RATE//2)//RATE))
    for index,center in enumerate(range(0,len(x),HOP)):
        if mapped(center)>=source_count:continue
        left=max(0,center-WINDOW//2);right=min(len(x),center+WINDOW//2);block=np.zeros(WINDOW);block[left-(center-WINDOW//2):right-(center-WINDOW//2)]=x[left:right]
        rms=float(np.sqrt(np.mean(block*block)));db=20*np.log10(rms) if rms>0 else None
        mag=2*np.abs(np.fft.rfft(block*taper))/np.sum(taper);power=mag[band]**2
        flatness=float(np.exp(np.mean(np.log(power+1e-24)))/(np.mean(power)+1e-24)) if rms>0 else None
        peaks=[];total_peaks=0
        if db is not None and db>=-70 and flatness<.2:
            bins=np.where((mag[1:-1]>mag[:-2])&(mag[1:-1]>=mag[2:]))[0]+1
            bins=[int(k) for k in bins if band[k] and mag[k]>=float(np.max(mag[band]))*.1]
            total_peaks=len(bins);bins=sorted(bins,key=lambda k:(-mag[k],k))[:32]
            for k in sorted(bins):
                a,b,c=np.log(np.maximum(mag[k-1:k+2],1e-24));den=a-2*b+c;delta=float(np.clip(.5*(a-c)/den,-.5,.5)) if den!=0 else 0.
                hz=float((k+delta)*RATE/WINDOW);amplitude=float(mag[k]);midi=float(69+12*np.log2(hz/440));residual=(midi-math.floor(midi+.5))*100
                peaks.append({'frequency_hz':hz,'amplitude':amplitude,'fft_bin':k,'bin_offset':delta,'residual_cents_a440':residual})
                if center>=WINDOW//2 and center+WINDOW//2<=len(x):tuning_z+=amplitude*np.exp(2j*np.pi*residual/100);tuning_weight+=amplitude;peak_count+=1
        reason='below_energy_floor' if db is None or db<-70 else 'spectrally_flat' if flatness>=.2 else 'no_retained_peaks' if not peaks else None
        frames.append({'index':index,'center_sample':mapped(center),'start_sample':mapped(center),'end_sample':mapped(min(len(x),center+HOP)),
          'support_start_sample':max(0,math.floor((center-WINDOW//2)*source_rate/RATE)),'support_end_sample':min(source_count,math.ceil((center+WINDOW//2)*source_rate/RATE)),
          'rms_dbfs':float(db) if db is not None else None,'spectral_flatness':flatness,'state':'candidate' if reason is None else 'unresolved','reason':reason,
          'peaks':peaks,'peak_candidates_total':total_peaks,'peaks_truncated':total_peaks>32})
    frames[-1]['end_sample']=source_count
    concentration=abs(tuning_z)/tuning_weight if tuning_weight>0 else None
    offset=float(np.angle(tuning_z)*100/(2*np.pi)) if peak_count>=12 and concentration>=.65 else None
    tuning={'state':'candidate' if offset is not None else 'unresolved','offset_cents':offset,'a4_hz':440*2**(offset/1200) if offset is not None else None,'peak_evidence_count':peak_count,'circular_concentration':concentration,
       'reference_hz':440,'period_cents':100,'minimum_peak_count':12,'minimum_concentration':.65,'absolute_octave_or_semitone_tuning_qualified':False}
    active=[]
    for f in frames:
        raw=chroma(f['peaks']);adjusted=chroma(f['peaks'],offset or 0);f['chroma_a440']=raw.tolist();f['chroma']=adjusted.tolist()
        f['bass_peaks']=[{'frequency_hz':p['frequency_hz'],'pitch_class':int(math.floor(69+12*math.log2(p['frequency_hz']/440)-(offset or 0)/100+.5))%12,'amplitude':p['amplitude']} for p in f['peaks'] if p['frequency_hz']<=260 and p['amplitude']>=max((q['amplitude'] for q in f['peaks']),default=0)*.25][:3]
        f['chord_state']='candidate' if f['state']=='candidate' and int(np.sum(adjusted>=.08))>=3 else 'unresolved'
        f['chord_reason']=None if f['chord_state']=='candidate' else 'Requires three pitch classes at >=0.08 share and non-flat, above-floor evidence'
        f['chord_alternatives']=chord_hypotheses(adjusted,f['bass_peaks']) if f['chord_state']=='candidate' else []
        f['top_two_margin']=f['chord_alternatives'][0]['cosine_similarity']-f['chord_alternatives'][1]['cosine_similarity'] if f['chord_alternatives'] else None
        if f['state']=='candidate':active.append(adjusted)
    global_chroma=normalized(np.mean(active,axis=0)) if active else np.zeros(12)
    local=[]
    for start in range(0,len(frames),32):
        rows=frames[start:start+32];valid=[f['chroma'] for f in rows if f['state']=='candidate'];v=normalized(np.mean(valid,axis=0)) if valid else np.zeros(12)
        local.append({'start_sample':rows[0]['start_sample'],'end_sample':rows[-1]['end_sample'],'chroma':v.tolist(),**key_hypotheses(v,len(valid))})
    return {'schema_version':'hapa.source-harmony.v1','method':METHOD,'status':'candidate','quality_qualified':False,'source_asset_id':'master','source_sample_rate_hz':source_rate,'source_sample_count':source_count,
      'analysis_view':{'sample_rate_hz':RATE,'sample_count':len(x),'channels':1,'channel_policy':'existing FFmpeg mono downmix; may cancel antiphase content','window_samples':WINDOW,'hop_samples':HOP,'centered':True,'padding':'constant zero','window':'periodic Hann','normalization':'no gain normalization','map_numerator':source_rate,'map_denominator':RATE,'map_offset':0,'rounding':'nearest-half-up'},
      'parameters':{'frequency_min_hz':55,'frequency_max_hz':2000,'minimum_rms_dbfs':-70,'maximum_flatness':.2,'relative_peak_amplitude':.1,'maximum_peaks_per_frame':32,'bass_maximum_hz':260,'bass_relative_amplitude':.25,'local_key_frames':32},
      'chroma_definition':{'order':NAMES,'units':'L1 normalized interpolated spectral-peak amplitude','tuning_applied_cents':offset or 0,'tuning_policy':'global candidate offset when available; otherwise declared A440','temperament':'12-tone equal temperament'},
      'chord_vocabulary':VOCAB,'key_vocabulary':{'modes':SCALES,'weights':{'scale_tone':1.,'tonic':1.5,'fifth':1.25,'third':1.2}},'score_semantics':'cosine similarity of L2-normalized vectors; not probability or calibrated correctness',
      'tuning':tuning,'global_chroma':global_chroma.tolist(),'global_key':key_hypotheses(global_chroma,len(active)),'local_keys':local,'frames':frames,'frame_count':len(frames),'active_frame_count':len(active),'timing_uncertainty_samples':None,
      'limitations':['Spectral peaks can be harmonics, percussion or mixture artifacts; no separated notes or instrument identities.','Limited equal-tempered Western chord/mode vocabulary; excluded chords and non-tonal music are not absent.','A one-second centered FFT blurs changes; a 250ms grid is not chord-onset accuracy.','Tuning is a global modulo-semitone candidate; key weights are declared heuristics, not learned or perceptually qualified profiles.','Bass peaks are low spectral components, not verified bass notes; competing inversions can be wrong.','Mono downmix can cancel phase-opposed sources; content above2kHz does not contribute.','Candidate absence, high scores and small margins do not establish musical truth.']}
