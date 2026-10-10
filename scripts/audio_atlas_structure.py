"""Bounded acoustic structure evidence; no functional section-name inference.

Owned Hapa implementation of box-checkerboard novelty on cosine features.
Method background: Foote 2000; Mueller FMP C4S4 Novelty Segmentation.
No upstream code copied. Existing Atlas FFmpeg decoding remains the input owner.
"""
import numpy as np

METHOD = 'hapa.log-spectrum-checkerboard.v1'
RATE = 8000
HOP = 2000
WINDOW = 4096
CONTEXT = 16

def feature_frames(samples):
    x=np.asarray(samples,dtype=np.float64)
    if x.ndim!=1 or not 0<len(x)<=RATE*1800 or not np.all(np.isfinite(x)):
        raise ValueError('Structure requires finite mono 8kHz PCM, at most30minutes')
    edges=np.geomspace(30,4000,49)
    frequencies=np.fft.rfftfreq(WINDOW,1/RATE)
    band=np.clip(np.searchsorted(edges,frequencies,side='right')-1,0,47)
    band[frequencies<30]=-1
    taper=np.hanning(WINDOW);centers=np.arange(0,len(x),HOP,dtype=int)
    features=[];db=[]
    for center in centers:
        left=max(0,center-WINDOW//2);right=min(len(x),center+WINDOW//2)
        frame=np.zeros(WINDOW);frame[left-(center-WINDOW//2):right-(center-WINDOW//2)]=x[left:right]
        rms=float(np.sqrt(np.mean(x[left:right]**2)))
        level=float(20*np.log10(max(rms,1e-8)));db.append(level)
        power=np.abs(np.fft.rfft(frame*taper))**2
        bands=np.bincount(band[band>=0],weights=power[band>=0],minlength=48)
        vec=np.log1p(1000*bands/max(float(bands.sum()),1e-20))
        norm=float(np.linalg.norm(vec));vec=vec/max(norm,1e-20) if level>-70 else np.zeros(48)
        # Loudness-independent spectral shape plus bounded absolute energy.
        features.append(np.r_[np.sqrt(.8)*vec,np.sqrt(.2)*np.clip((level+80)/80,0,1)])
    return centers,np.asarray(features),np.asarray(db),edges

def novelty_curve(features,half_width=CONTEXT):
    """Box checkerboard equals one quarter squared distance of side means.
    This avoids allocating an unbounded N-by-N self-similarity matrix.
    Edge samples lacking complete left/right context remain zero.
    """
    f=np.asarray(features,dtype=float);n=len(f);out=np.zeros(n)
    if n<2*half_width+1:return out
    sums=np.vstack([np.zeros(f.shape[1]),np.cumsum(f,axis=0)])
    for i in range(half_width,n-half_width):
        left=(sums[i]-sums[i-half_width])/half_width
        right=(sums[i+half_width]-sums[i])/half_width
        out[i]=float(np.sum((left-right)**2)/4)
    return out

def boundary_peaks(curve):
    v=np.asarray(curve);core=v[CONTEXT:-CONTEXT]
    median=float(np.median(core)) if len(core) else 0
    mad=float(np.median(np.abs(core-median))) if len(core) else 0
    threshold=max(.012,median+2.5*mad)
    local=[i for i in range(CONTEXT,len(v)-CONTEXT) if v[i]>=threshold and v[i]>=max(v[i-2:i+3])]
    selected=[]
    for i in sorted(local,key=lambda i:(-v[i],i)):
        if all(abs(i-j)>=24 for j in selected):selected.append(i)
    return sorted(selected),threshold

def _profile(features,start,end,centers):
    rows=features[(centers>=start)&(centers<end)]
    if len(rows)<2:return None
    # Sixteen temporal bins retain coarse event order; no pitch transposition/DTW.
    blocks=np.array_split(rows,16)
    profile=np.asarray([b.mean(axis=0) if len(b) else rows[-1] for b in blocks])
    return profile

def analyze_structure(samples,source_rate,source_count):
    if not isinstance(source_rate,int) or source_rate<=0 or not isinstance(source_count,int) or source_count<=0:
        raise ValueError('Invalid source timeline')
    if abs(len(samples)/RATE-source_count/source_rate)>1/RATE+1/source_rate:
        raise ValueError('8kHz view duration differs from source timeline')
    centers,f,db,edges=feature_frames(samples)
    curve=novelty_curve(f);peaks,threshold=boundary_peaks(curve)
    def mapped(n):return min(source_count,round(int(n)*source_rate/RATE))
    cuts=[0]+[int(centers[i]) for i in peaks]+[len(samples)]
    boundaries=[{'sample':mapped(centers[i]),'novelty':float(curve[i]),'threshold':threshold,
        'localization_grid_samples':round(HOP*source_rate/RATE),'context_seconds_each_side':4} for i in peaks]
    regions=[];profiles=[]
    for index,(start,end) in enumerate(zip(cuts,cuts[1:])):
        mask=(centers>=start)&(centers<end);level=db[mask]
        regions.append({'id':f'master:section:{index}','start_sample':mapped(start),'end_sample':source_count if end==len(samples) else mapped(end),
            'label':f'Region {index+1}','functional_label':None,'mean_rms_dbfs':float(np.mean(level)),
            'active_fraction':float(np.mean(level>-50)),'duration_seconds':(end-start)/RATE})
        profiles.append(_profile(f,start,end,centers))
    repeats=[]
    for i,a in enumerate(regions):
        for j in range(i+2,len(regions)):
            b=regions[j];p,q=profiles[i],profiles[j]
            if min(a['duration_seconds'],b['duration_seconds'])<6 or min(a['active_fraction'],b['active_fraction'])<.5:continue
            ratio=a['duration_seconds']/b['duration_seconds']
            if not .65<=ratio<=1.55 or p is None or q is None:continue
            variability=min(float(np.linalg.norm(p-p.mean(axis=0))/4),float(np.linalg.norm(q-q.mean(axis=0))/4))
            if variability<.025:continue # Uniform tones/silence do not prove repeated passages.
            norms=np.linalg.norm(p,axis=1)*np.linalg.norm(q,axis=1)
            score=float(np.mean(np.sum(p*q,axis=1)/np.maximum(norms,1e-12)))
            if score>=.92:repeats.append({'left_id':a['id'],'right_id':b['id'],'similarity':min(1.,score),'duration_ratio':ratio,'temporal_variability':variability,
                'relation':'similar_spectral_sequence_candidate','score_semantics':'mean cosine over16 relative-time bins; not probability or composition identity'})
    repeats.sort(key=lambda row:-row['similarity']);repeat_total=len(repeats)
    transitions=[]
    for i in peaks:
        before=float(np.mean(db[max(0,i-8):i]));after=float(np.mean(db[i:i+8]));delta=after-before
        kind='quiet_break_candidate' if after<-50 and before>-40 else 'energy_rise_candidate' if delta>=6 else 'energy_drop_candidate' if delta<=-6 else 'spectral_change_candidate'
        transitions.append({'start_sample':mapped(max(0,centers[i]-2*RATE)),'end_sample':mapped(min(len(samples),centers[i]+2*RATE)),
            'boundary_sample':mapped(centers[i]),'kind':kind,'before_rms_dbfs':before,'after_rms_dbfs':after,'delta_db':delta,
            'meaning':'Acoustic change; musical build/drop/break function is unverified'})
    # Sustained rises need measured trend evidence, not just a louder end point.
    for i in range(0,len(db)-32+1,16):
        values=db[i:i+32];t=np.arange(32)*HOP/RATE;slope=float(np.polyfit(t,values,1)[0])
        blocks=values.reshape(8,4).mean(axis=1);rise=float(blocks[-1]-blocks[0]);consistent=float(np.mean(np.diff(blocks)>0))
        if slope>=.7 and rise>=6 and consistent>=5/7 and blocks[-1]>-40:
            transitions.append({'start_sample':mapped(centers[i]),'end_sample':mapped(min(len(samples),centers[i]+8*RATE)),
                'kind':'gradual_build_candidate','slope_db_per_second':slope,'rise_db':rise,'rising_step_fraction':consistent,
                'meaning':'Sustained RMS rise; musical build function is unverified'})
    return {'schema_version':'hapa.audio-atlas.structure.v1','method':METHOD,'status':'candidate' if peaks else 'no_boundaries_detected',
        'quality_qualified':False,'source_asset_id':'master','sample_rate_hz':source_rate,'sample_count':source_count,
        'analysis_view':{'sample_rate_hz':RATE,'channels':1,'window_samples':WINDOW,'hop_samples':HOP,'centered':True,'edge_padding':'zeros; no boundary scoring within4s of ends',
            'map_numerator':source_rate,'map_denominator':RATE,'offset_samples':0,'rounding':'nearest_ties_even','resampling':'existing FFmpeg mono8kHz low-pass view; no extra trim'},
        'feature_definition':{'bands':48,'band_edges_hz':edges.tolist(),'normalization':'per-frame log1p(1000*band_power/total_power), L2 spectral;80%spectrum20%absolute energy',
            'silent_floor_dbfs':-70,'novelty':'quarter squared distance of four-second left/right mean features',
            'peak_threshold':threshold,'minimum_boundary_spacing_seconds':6,'uncertainty':'unknown; grid spacing/context are not acoustic accuracy'},
        'boundaries':boundaries,'regions':regions,'repeats':repeats[:24],'repeat_candidates_total':repeat_total,'repeat_candidates_truncated':repeat_total>24,
        'transitions':transitions,'frames':[{'sample':mapped(c),'novelty':float(v),'rms_dbfs':float(d)} for c,v,d in zip(centers,curve,db)],
        'limitations':['No verse/chorus or other functional labels inferred','Similar timbre/energy can mimic repetition; no melody or composition equivalence','No beat-synchronous, tempo-invariant or transposition-invariant matching','Mono downmix may cancel antiphase content; frequencies above4kHz excluded','No detection is not absence; gradual or brief sections may be missed'],
        '_raw_features':f.tolist()}

def structure_observations(structure,asset,run_id,raw_sha):
    common={'subject_id':asset['id'],'timeline_id':asset['timeline_id'],'reference_sample_rate_hz':asset['sample_rate_hz'],
        'claim_type':'derived','confidence':None,'timing_uncertainty_samples':None,'review_state':'unreviewed',
        'provenance':{'run_id':run_id,'source_sha256':asset['source_sha256'],'evidence_asset_id':asset['id'],
            'analysis_view':structure['analysis_view'],'raw_evidence':'structure-raw.json','raw_evidence_sha256':raw_sha}}
    rows=[]
    for r in structure['regions']:
        rows.append({**common,'id':r['id'],'kind':'hapa.audio.section_candidate','shape':'interval','start_sample':r['start_sample'],'end_sample':r['end_sample'],
            'payload':{'text':r['label'],'method':METHOD,'functional_label':None,'mean_rms_dbfs':r['mean_rms_dbfs'],'boundary_evidence':'acoustic novelty partition; not functional section truth'}})
    for i,b in enumerate(structure['boundaries']):
        rows.append({**common,'id':f'master:boundary:{i}','kind':'hapa.audio.section_boundary_candidate','shape':'instant','start_sample':b['sample'],'end_sample':b['sample'],
            'payload':{'text':'Acoustic boundary','method':METHOD,'novelty':b['novelty'],'threshold':b['threshold']}})
    for i,t in enumerate(structure['transitions']):
        rows.append({**common,'id':f'master:transition:{i}','kind':'hapa.audio.transition_candidate','shape':'interval','start_sample':t['start_sample'],'end_sample':t['end_sample'],
            'payload':{'text':t['kind'].replace('_',' '),'method':METHOD,'transition_kind':t['kind'],'evidence':t}})
    return rows
