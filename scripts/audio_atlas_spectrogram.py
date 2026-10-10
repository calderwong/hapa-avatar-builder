"""Source-channel STFT display evidence; no labels, resampling or normalization."""
import math
import numpy as np

METHOD='hapa.channel-stft-display.v1'
MAX_FRAMES=4096
MAX_BANDS=192

def spectrogram(pcm, sr):
    if pcm.ndim!=2 or not len(pcm) or not 1<=pcm.shape[1]<=8 or not 8000<=sr<=192000 or not np.all(np.isfinite(pcm)):
        raise ValueError('Invalid finite source PCM or sample rate')
    size=2**math.ceil(math.log2(sr*.05))
    hop=max(math.ceil(sr*.025),math.ceil(len(pcm)/MAX_FRAMES))
    edges=np.unique(np.r_[0,np.rint(np.geomspace(1,size//2+1,MAX_BANDS)).astype(int)])
    bins=edges[:-1];step=sr/size
    bands=[{'low_hz':max(0.,(int(a)-.5)*step),'high_hz':min(sr/2,(int(b)-.5)*step),
            'first_fft_bin':int(a),'end_fft_bin':int(b)} for a,b in zip(edges[:-1],edges[1:])]
    centers=range(0,len(pcm),hop);window=np.hanning(size+1)[:-1];gain=window.sum()
    data=np.empty((len(centers),pcm.shape[1],len(bands)),dtype=np.uint8)
    for i,center in enumerate(centers):
        left=center-size//2;lo=max(0,left);hi=min(len(pcm),left+size)
        frame=np.zeros((size,pcm.shape[1]),dtype=np.float64)
        frame[lo-left:hi-left]=pcm[lo:hi]
        amplitude=np.abs(np.fft.rfft(frame*window[:,None],axis=0))/gain
        amplitude[1:-1]*=2
        maxima=np.maximum.reduceat(amplitude,bins,axis=0).T
        db=20*np.log10(np.maximum(maxima,1e-6))
        data[i]=np.rint((np.clip(db,-120,0)+120)*2).astype(np.uint8)
    return {'method':METHOD,'status':'complete','sample_rate_hz':sr,'sample_count':len(pcm),
            'channels':pcm.shape[1],'channel_axis':'original source channel order; no downmix',
            'fft_size':size,'window':'periodic Hann','centered':True,'first_frame_sample':0,
            'hop_samples':hop,'frame_count':len(centers),'band_count':len(bands),'bands':bands,
            'frequency_units':'Hz','level_units':'dBFS of peak single-sided FFT-bin amplitude per band; not PSD or loudness',
            'normalization':'Hann coherent gain; doubled interior bins; no source gain normalization',
            'edge_policy':'zero padding outside decoded source; no padding compensation',
            'encoding':{'dtype':'uint8','axis_order':['frame','channel','band'],'offset_db':-120,'step_db':.5,'min':0,'max':240,'rounding':'nearest ties even'},
            'sparse_snapshots':hop>size,'time_map':{'numerator':1,'denominator':1,'offset_samples':0,'target':'own decoded source timeline'},
            'display_limitations':['Bands retain peak bin amplitude, not average spectral density.','Values below -120 dBFS and above 0 dBFS saturate the display.','The centered FFT window blurs event edges; timestamps do not establish onset precision.','At most 4096 time snapshots per source; reported hop may exceed FFT support on long audio.']},data
