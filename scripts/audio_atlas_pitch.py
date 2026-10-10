"""Bounded monophonic pYIN candidates. No model weights or subprocesses."""
import math
import numpy as np
RATE=16000;HOP=160;WINDOW=1024;CORE=30*RATE;CONTEXT=RATE
PARAMS={'fmin':50.,'fmax':1100.,'frame_length':WINDOW,'hop_length':HOP,'center':True,'pad_mode':'constant','resolution':.1,'n_thresholds':100,'beta_parameters':(2,18),'boltzmann_parameter':2,'max_transition_rate':35.92,'switch_prob':.01,'no_trough_prob':.01}
METHOD='librosa-pyin-source-contour.v1'

def track_pitch(y,source_rate,source_count,progress=None):
    import librosa
    y=np.asarray(y,dtype=np.float64)
    if y.ndim!=1 or not len(y) or not np.isfinite(y).all() or source_rate<=0 or source_count<=0 or abs(len(y)-source_count*RATE/source_rate)>1:raise ValueError('invalid_pitch_analysis_view')
    frames=[];chunks=[];total=math.ceil(len(y)/CORE)
    power=np.r_[0.,np.cumsum(y*y,dtype=np.float64)]
    for index,start in enumerate(range(0,len(y),CORE)):
        end=min(len(y),start+CORE);left=max(0,start-CONTEXT);right=min(len(y),end+CONTEXT)
        if progress:progress(index,total)
        f0,voiced,prob=librosa.pyin(y[left:right],sr=RATE,fill_na=np.nan,**PARAMS)
        chunks.append({'index':index,'core_start_analysis_sample':start,'core_end_analysis_sample':end,'context_start_analysis_sample':left,'context_end_analysis_sample':right})
        for i,(raw,flag,score) in enumerate(zip(f0,voiced,prob)):
            at=left+i*HOP
            if not start<=at<end:continue
            center=(at*source_rate+RATE//2)//RATE
            if center>=source_count:continue
            a=max(0,at-WINDOW//2);b=min(len(y),at+WINDOW//2)
            # The RMS support includes explicit zero padding outside the source.
            rms=math.sqrt(max(0.,float(power[b]-power[a]))/WINDOW);energy=20*math.log10(rms) if rms>0 else None
            raw_hz=float(raw) if np.isfinite(raw) else None;score=float(score)
            reason='below_energy_floor' if energy is None or energy<-70 else 'low_voicing_score' if score<.1 else 'unvoiced_candidate' if not flag else None
            hz=raw_hz if reason is None else None
            if hz is None and reason is None:reason='invalid_candidate'
            frames.append({'analysis_center_sample':at,'center_sample':int(center),'support_start_sample':max(0,((at-WINDOW//2)*source_rate)//RATE),'support_end_sample':min(source_count,math.ceil((at+WINDOW//2)*source_rate/RATE)),
              'f0_hz':hz,'cents_from_a4':1200*math.log2(hz/440.) if hz is not None else None,'voiced':hz is not None,
              'raw_f0_hz':raw_hz,'raw_voiced':bool(flag),'voicing_score':score,'rms_dbfs':energy,'abstention_reason':reason,'chunk_index':index})
    return {'status':'candidate','method':METHOD,'analysis_sample_rate_hz':RATE,'analysis_sample_count':len(y),'source_sample_rate_hz':source_rate,'source_sample_count':source_count,
      'hop_samples':HOP,'window_samples':WINDOW,'centered':True,'first_frame_sample':0,'pad_mode':'constant zero','normalization':'none','parameters':PARAMS,
      'time_map':{'numerator':source_rate,'denominator':RATE,'offset_samples':0,'rounding':'nearest-half-up','target':'own decoded source timeline'},
      'voicing_policy':{'minimum_score':.1,'minimum_rms_dbfs':-70,'score_semantics':'uncalibrated pYIN periodicity/voicing score; not probability of correctness or human voice presence'},
      'frequency_units':'Hz','cents_reference_hz':440.,'cents_units':'1200 * log2(f0_hz / 440)','resolution_cents':10,
      'chunking':{'core_samples':CORE,'context_samples':CONTEXT,'method':'Viterbi independently per core with one-second context; discard context predictions, no averaging'},'chunks':chunks,
      'quality_qualified':False,'polyphonic_separation':False,'frames':frames,'frame_count':len(frames),'voiced_frame_count':sum(f['voiced'] for f in frames),
      'limitations':['Monophonic periodicity estimate; no voice identification or polyphonic separation.','Harmonics and overlapping voices can produce octave/subharmonic errors even at a high score.','10 ms grid and 10-cent bins are representation resolution, not timing/pitch accuracy.','Viterbi decisions can differ near 30-second stitching boundaries; context does not prove continuity.','Below-floor or low-score abstention does not establish absence of a vocal.']}
