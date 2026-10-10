"""Source PCM measurements. No gain, resampling or channel mixing in PCM metrics."""
import json, math
import numpy as np

METHOD='hapa.pcm-technical.v1'
def db(value):
    return 20*math.log10(float(value)) if value>0 else None

def correlation(m2,cross):
    if len(m2)!=2 or min(m2)<=1e-24:return None
    return float(np.clip(cross/math.sqrt(float(m2[0]*m2[1])),-1,1))

def technical(pcm,sr):
    if pcm.ndim!=2 or not len(pcm) or not 1<=pcm.shape[1]<=8 or not isinstance(sr,int) or sr<1 or not np.isfinite(pcm).all():raise ValueError('invalid_technical_pcm')
    n,c=pcm.shape;hop=max(1,round(sr/10));frames=[];mean=np.zeros(c);m2=np.zeros(c);cross=0.;count=0;peak=np.zeros(c);over=np.zeros(c,dtype=np.int64);near=over.copy()
    for start in range(0,n,hop):
        x=pcm[start:start+hop].astype(np.float64);size=len(x);local_mean=x.mean(axis=0);center=x-local_mean;local_m2=np.sum(center*center,axis=0);local_cross=float(np.sum(center[:,0]*center[:,1])) if c==2 else 0.
        delta=local_mean-mean;factor=count*size/(count+size)
        m2+=local_m2+delta*delta*factor
        if c==2:cross+=local_cross+float(delta[0]*delta[1])*factor
        mean+=delta*size/(count+size);count+=size
        absolute=np.abs(x);p=absolute.max(axis=0);rms=np.sqrt(np.mean(x*x,axis=0));a=np.sum(absolute>=1.,axis=0);b=np.sum(absolute>=.999,axis=0)
        peak=np.maximum(peak,p);over+=a;near+=b
        frames.append({'start_sample':start,'end_sample':start+size,'rms_dbfs':[db(v) for v in rms], 'peak_dbfs':[db(v) for v in p], 'at_or_above_full_scale':a.tolist(),'near_full_scale':b.tolist(),'stereo_correlation':correlation(local_m2,local_cross)})
    rms=np.sqrt(m2/count+mean*mean)
    # Equal-duration windows only; retain partial last window in evidence, not the percentile.
    complete=[f for f in frames if f['end_sample']-f['start_sample']==hop]
    quiet=[]
    for ch in range(c):
        values=[0. if f['rms_dbfs'][ch] is None else 10**(f['rms_dbfs'][ch]/20) for f in complete]
        quiet.append(db(np.percentile(values,10)) if values else None)
    return {'status':'complete','method':METHOD,'sample_rate_hz':sr,'sample_count':n,'channels':c,
      'hop_samples':hop,'window_samples':hop,'centered':False,'first_frame_sample':0,'normalization':'none',
      'time_map':{'numerator':1,'denominator':1,'offset_samples':0,'target':'own decoded source timeline'},
      'units':{'rms_dbfs':'dBFS, RMS relative to amplitude 1','peak_dbfs':'dBFS, sample peak relative to amplitude 1','stereo_correlation':'Pearson correlation [-1,1] after per-channel mean removal','counts':'samples per channel','dc_offset':'linear full scale'},
      'thresholds':{'at_or_above_full_scale':1.,'near_full_scale':.999},
      'summary':{'rms_dbfs':[db(v) for v in rms],'peak_dbfs':[db(v) for v in peak],'dc_offset':mean.tolist(),'crest_db':[db(p/r) if r>0 else None for p,r in zip(peak,rms)],'at_or_above_full_scale':over.tolist(),'near_full_scale':near.tolist(),'stereo_correlation':correlation(m2,cross)},
      'quiet_level':{'method':'10th percentile of linear RMS over complete non-overlapping 100 ms source-channel windows; linear interpolation, then dBFS','rms_p10_dbfs':quiet,'window_count':len(complete),'noise_floor_dbfs':None,'reason':'Quiet musical content and residual noise are not separated; no noise-only reference was supplied.'},
      'missing_values':'null: zero energy has no finite dB value; correlation requires exactly two varying channels; quiet percentile requires a complete window',
      'clipping_notice':'Threshold counts are clipping indicators, not proof of clipped recording. Lossy decode may exceed full scale; earlier clipping below these thresholds can be missed.',
      'frames':frames}

def loudness_args(ffmpeg,file,sr,channels):
    if channels not in (1,2):raise ValueError('loudness_channel_layout_unsupported')
    return [ffmpeg,'-nostdin','-hide_banner','-nostats','-v','info','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe','-f','f32le','-ar',str(sr),'-ac',str(channels),'-channel_layout','mono' if channels==1 else 'stereo','-i',str(file),'-af','loudnorm=I=-24:LRA=7:TP=-2:linear=false:dual_mono=false:print_format=json','-f','null','-']

def parse_loudness(raw,samples,sr,channels):
    text=raw.decode() if isinstance(raw,bytes) else raw
    at=text.rfind('{')
    if at<0:raise ValueError('missing_loudness_report')
    report,_=json.JSONDecoder().raw_decode(text[at:]);keys=['input_i','input_tp','input_lra','input_thresh']
    if any(k not in report for k in keys):raise ValueError('incomplete_loudness_report')
    def number(k):
        x=float(report[k])
        if math.isnan(x) or x==math.inf:raise ValueError('invalid_loudness_report')
        return x if math.isfinite(x) else None
    integrated=number('input_i');true_peak=number('input_tp');lra=number('input_lra');threshold=number('input_thresh')
    if lra is not None and lra<0:raise ValueError('invalid_loudness_range')
    short=samples<round(.4*sr)
    eligible=integrated is not None and not short
    return {'status':'complete','method':'FFmpeg loudnorm input-only statistics; EBU R128; dynamic 192 kHz true-peak analysis',
      'integrated_lufs':integrated if eligible else None,'true_peak_dbtp':true_peak,
      'loudness_range_lu':lra if eligible and samples>=3*sr else None,'gate_threshold_lufs':threshold if eligible else None,
      'integrated_missing_reason':None if eligible else ('shorter than 400 ms' if short else 'no blocks above the loudness gate'),
      'range_missing_reason':None if eligible and samples>=3*sr else 'needs at least three seconds and eligible loudness blocks',
      'true_peak_missing_reason':None if true_peak is not None else 'no nonzero measured peak',
      'channel_layout':'mono' if channels==1 else 'stereo','dual_mono':False,'report_precision_db':.01,
      'scope':'entire decoded source, including final partial window; original source clock',
      'normalization':'input statistics only; filtered output discarded, no normalized audio saved',
      'raw_input_statistics':{k:report[k] for k in keys},
      'limitations':'Loudness range is duration/content dependent; a finite value is not quality approval. True peak is an oversampled estimate, not an analog reconstruction guarantee.'}
