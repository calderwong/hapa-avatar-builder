"""Source-clock spectral flux and conditional rhythm measurements; no children."""
import math
import numpy as np
METHOD='hapa.source-rhythm.v1'

def onset_evidence(y,sr):
    y=np.asarray(y,dtype=np.float64)
    if y.ndim!=1 or not len(y) or not np.isfinite(y).all():raise ValueError('invalid rhythm audio')
    hop=max(1,(int(sr)+50)//100);window=2**math.ceil(math.log2(sr*.04));hann=.5-.5*np.cos(2*np.pi*np.arange(window)/window)
    padded=np.pad(y,(window//2,window//2));previous=None;frames=[]
    for center in range(0,len(y),hop):
        view=padded[center:center+window];spectrum=np.log1p(100*np.abs(np.fft.rfft(view*hann))/(hann.sum()/2));rms=float(np.sqrt(np.mean(view*view)))
        reference=None if previous is None else np.maximum.reduce([previous,np.r_[previous[0],previous[:-1]],np.r_[previous[1:],previous[-1]]])
        strength=0. if reference is None else float(np.maximum(0.,spectrum-reference).mean());previous=spectrum
        frames.append({'center_sample':center,'support_start_sample':max(0,center-window//2),'support_end_sample':min(len(y),center+window//2),'strength':strength,'rms_dbfs':20*math.log10(rms) if rms else None})
    strengths=np.array([f['strength'] for f in frames]);candidates=[];radius=max(1,round(.25*sr/hop))
    for i in range(1,len(frames)-1):
        f=frames[i];near=strengths[max(0,i-radius):min(len(frames),i+radius+1)];median=float(np.median(near));mad=float(np.median(abs(near-median)));threshold=max(.002,median+3*mad)
        if f['strength']>threshold and f['strength']>strengths[i-1] and f['strength']>=strengths[i+1] and f['rms_dbfs'] is not None and f['rms_dbfs']>=-70:candidates.append({**f,'frame_index':i,'threshold':threshold})
    chosen=[];blocked=set();distance=max(1,round(.05*sr/hop))
    for f in sorted(candidates,key=lambda f:(-f['strength'],f['center_sample'])):
        if f['frame_index'] in blocked:continue
        chosen.append(f);blocked.update(range(f['frame_index']-distance+1,f['frame_index']+distance))
    chosen.sort(key=lambda f:f['center_sample'])
    for i,f in enumerate(chosen):
        lo=f['support_start_sample'];hi=f['support_end_sample'];width=max(1,min(hi-lo,round(sr*.001)));power=np.convolve(y[lo:hi]**2,np.ones(width)/width,mode='same')
        f.update({'id':f'master:rhythm-onset:{i}','anchor_sample':lo+int(np.argmax(power)),'timing_uncertainty_samples':None,'support_radius_samples':window//2+hop})
    return {'hop_samples':hop,'window_samples':window,'centered':True,'pad_mode':'constant zero','window':'periodic Hann','frequency_reference_filter_bins':3,'spectrum':'log1p(100 * one-sided FFT amplitude / coherent gain); mean positive difference from previous-frame 3-bin maximum','units':'dimensionless spectral-flux strength; not probability','first_frame_sample':0,'frames':frames,'onsets':chosen,'anchor_method':'maximum 1 ms mean-square energy within selected spectral frame support; not a calibrated onset boundary','peak_policy':{'local_radius_seconds':.25,'mad_multiplier':3,'minimum_strength':.002,'minimum_rms_dbfs':-70,'minimum_spacing_seconds':.05}}

def analyze_rhythm(y,asset,observations):
    sr=asset['sample_rate_hz'];n=asset['sample_count']
    if len(y)!=n:raise ValueError('rhythm source count mismatch')
    onset=onset_evidence(y,sr)
    beats=sorted([o for o in observations if o['subject_id']==asset['id'] and o['kind']=='hapa.audio.beat_candidate'],key=lambda o:o['start_sample'])
    downs=sorted([o for o in observations if o['subject_id']==asset['id'] and o['kind']=='hapa.audio.downbeat_candidate'],key=lambda o:o['start_sample'])
    if any(b['start_sample']<=a['start_sample'] for a,b in zip(beats,beats[1:])):raise ValueError('duplicate or unordered beat coordinates')
    for b in beats+downs:
        if not 0<=b['start_sample']<n:raise ValueError('beat outside source')
    intervals=[];gaps=[];all_delta=np.diff([b['start_sample'] for b in beats]);global_delta=float(np.median(all_delta)) if len(all_delta) else None
    for i,(a,b) in enumerate(zip(beats,beats[1:])):
        left=a['start_sample'];right=b['start_sample'];delta=right-left;local=all_delta[max(0,i-3):i+4];median=float(np.median(local));mad=float(np.median(abs(local-median)));irregular=mad/median>.2
        energy=any(f['rms_dbfs'] is not None and f['rms_dbfs']>=-70 for f in onset['frames'][left//onset['hop_samples']:min(len(onset['frames']),right//onset['hop_samples']+1)])
        supported=energy and delta>=.12*sr and delta<=3*sr and (global_delta is None or delta<=2.5*global_delta)
        row={'id':f'master:tempo:{i}','start_sample':left,'end_sample':right,'beat_refs':[a['id'],b['id']],'interbeat_bpm':60*sr/delta,'local_median_bpm':60*sr/median,'pulse_alternatives_bpm':[30*sr/median,60*sr/median,120*sr/median],'local_relative_mad':mad/median,'pulse_status':'unresolved' if irregular or not supported else 'candidate','timing_uncertainty_samples':None,'audio_energy_supported':energy}
        off=[o for o in onset['onsets'] if left+.2*delta<=o['anchor_sample']<=left+.8*delta]
        strongest=max(off,key=lambda o:o['strength']) if off else None
        near_next=[o for o in onset['onsets'] if abs(o['anchor_sample']-right)<=.1*delta];on_strength=max([o['strength'] for o in near_next],default=0.)
        if strongest and supported and not irregular:
            phase=(strongest['anchor_sample']-left)/delta
            row.update({'offbeat_onset_ref':strongest['id'],'offbeat_phase':phase,'long_short_ratio':phase/(1-phase),'offbeat_strength':strongest['strength'],'following_beat_strength':on_strength,'offbeat_accent_contrast':max(0.,strongest['strength']-on_strength)/(strongest['strength']+on_strength)})
        else:row.update({k:None for k in ['offbeat_onset_ref','offbeat_phase','long_short_ratio','offbeat_strength','following_beat_strength','offbeat_accent_contrast']})
        intervals.append(row)
        if not supported or irregular:gaps.append({'id':f"master:unresolved-pulse:{len(gaps)}",'start_sample':left,'end_sample':right,'reason':'below source energy floor' if not energy else 'irregular local beat spacing' if irregular else 'beat interval outside supported range or long gap','beat_refs':row['beat_refs'],'unmetered_confirmed':False})
    edges=[(0,beats[0]['start_sample']) ,(beats[-1]['start_sample'],n)] if beats else [(0,n)]
    for left,right in edges:
        if right>left:gaps.append({'id':f"master:unresolved-pulse:{len(gaps)}",'start_sample':left,'end_sample':right,'reason':'no bracketing beat pair','beat_refs':[],'unmetered_confirmed':False})
    bars=[];unmatched=[];mapped=[];tolerance=round(sr*.04)
    for d in downs:
        near=min(range(len(beats)),key=lambda i:abs(beats[i]['start_sample']-d['start_sample'])) if beats else None
        if near is None or abs(beats[near]['start_sample']-d['start_sample'])>tolerance:unmatched.append(d['id'])
        else:mapped.append((d,near))
    for (a,i),(b,j) in zip(mapped,mapped[1:]):
        count=j-i
        if count<1 or b['start_sample']<=a['start_sample']:continue
        plausible=2<=count<=12 and all(r['pulse_status']=='candidate' for r in intervals[i:j])
        bars.append({'id':f'master:bar:{len(bars)}','start_sample':a['start_sample'],'end_sample':b['start_sample'],'downbeat_refs':[a['id'],b['id']],'beat_refs':[v['id'] for v in beats[i:j]],'pulse_count':count,'status':'candidate' if plausible else 'unresolved','meter_denominator':None,'meter_alternatives':[{'grouping':count,'pulse_unit':'unknown','interpretation':'detected pulse grouping'},{'grouping':count*2,'pulse_unit':'half detected pulse','interpretation':'double pulse interpretation'}]+([{'grouping':count//2,'pulse_unit':'twice detected pulse','interpretation':'half pulse interpretation'}] if count%2==0 else []),'timing_uncertainty_samples':None})
    # Eight adjacent intervals summarize offbeat placement; no fill through missing evidence.
    groove=[]
    for i in range(0,len(intervals),8):
        group=intervals[i:i+8];rows=[r for r in group if r['long_short_ratio'] is not None];ratios=[r['long_short_ratio'] for r in rows];phases=[r['offbeat_phase'] for r in rows]
        sufficient=len(rows)>=4
        groove.append({'id':f'master:groove:{len(groove)}','start_sample':group[0]['start_sample'],'end_sample':group[-1]['end_sample'],'interval_refs':[r['id'] for r in group],'matched_offbeat_count':len(rows),'interval_count':len(group),'median_offbeat_phase':float(np.median(phases)) if sufficient else None,'median_long_short_ratio':float(np.median(ratios)) if sufficient else None,'ratio_mad':float(np.median(abs(np.array(ratios)-np.median(ratios)))) if sufficient else None,'mean_offbeat_accent_contrast':float(np.mean([r['offbeat_accent_contrast'] for r in rows])) if sufficient else None,'state':'candidate' if sufficient else 'insufficient_evidence'})
    return {'status':'candidate','method':METHOD,'source_asset_id':asset['id'],'source_sha256':asset['source_sha256'],'timeline_id':asset['timeline_id'],'sample_rate_hz':sr,'sample_count':n,'channel_policy':'arithmetic mean of source channels, unnormalized; phase cancellation is possible','quality_qualified':False,'onset':onset,'tempo_intervals':intervals,'bars':bars,'unresolved_spans':gaps,'unmatched_downbeat_refs':unmatched,'groove_windows':groove,'method_parameters':{'local_tempo_radius_intervals':3,'irregular_relative_mad_threshold':.2,'supported_interbeat_seconds':[.12,3.],'long_gap_median_multiplier':2.5,'downbeat_match_tolerance_seconds':.04,'offbeat_phase_range':[.2,.8],'following_beat_tolerance_phase':.1,'groove_group_intervals':8,'minimum_groove_evidence':4},'limitations':['Beat/downbeat model candidates remain unreviewed; no lyric snapping.','Pulse count is not a verified time signature; denominator and metrical level remain unresolved.','Unresolved beat evidence does not prove an unmetered passage or silence.','Offbeat ratio is conditional on the strongest detected onset; multiple subdivisions, vocals and sustained sounds can confuse it.','Offbeat accent contrast is an operational syncopation proxy, not a perceptual syncopation score.','No acoustic timing uncertainty is calibrated; frame support is not an error bound.']}
