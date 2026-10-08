
/* One audible HTML-media transport; video audio never enters the audio graph.
   A real Hapa harness can replace the clock. Audio analysis is cached upstream. */
'use strict';
window.HapaTransport=class {
 constructor(){this.audio=new Audio();this.audio.preload='auto';this.audio.loop=false;this.audio.crossOrigin='anonymous';this.external=null;this.ctx=null;this.loadToken=0;this.urls=new Map();this.audio.addEventListener('ended',()=>this.onEnded?.());}
 asset(uri,mime){if(this.urls.has(uri))return this.urls.get(uri);const b64=window.HAPA_EMBED?.[uri];if(!b64)return uri;const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:mime}));this.urls.set(uri,url);return url;}
 graph(){if(this.ctx)return;this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.node=this.ctx.createMediaElementSource(this.audio);this.gain=this.ctx.createGain();this.gain.gain.value=.78;this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=1024;this.capture=this.ctx.createMediaStreamDestination();this.node.connect(this.gain);this.gain.connect(this.analyser);this.analyser.connect(this.ctx.destination);this.analyser.connect(this.capture);}
 async load(score){const token=++this.loadToken;this.pause();this.score=score;this.audio.src=this.asset(score.mixUri,'audio/mpeg');this.audio.load();await new Promise((res,rej)=>{const timer=setTimeout(()=>done(Error('Audio load timed out.')),15000);const loaded=()=>done();const err=()=>done(Error('Unable to decode audition mix.'));const done=e=>{clearTimeout(timer);this.audio.removeEventListener('loadedmetadata',loaded);this.audio.removeEventListener('error',err);e?rej(e):res();};this.audio.addEventListener('loadedmetadata',loaded,{once:true});this.audio.addEventListener('error',err,{once:true});if(this.audio.readyState>=1)done();});if(token!==this.loadToken)return false;this.audio.currentTime=0;return true;}
 now(){return this.external?this.external.getTime():this.audio.currentTime||0;}
 playing(){return this.external?this.external.isPlaying():!this.audio.paused&&!this.audio.ended;}
 async play(){if(this.external){if(!this.external.play)throw Error('Host owns play; no play hook supplied.');return this.external.play();}this.graph();await this.ctx.resume();return this.audio.play();}
 pause(){if(this.external){this.external.pause?.();return;}this.audio.pause();}
 seek(t){if(!Number.isFinite(t))throw Error('Invalid seek');t=Math.max(0,Math.min(this.score?.duration||0,t));if(this.external){if(!this.external.seek)throw Error('Host owns seek; no seek hook supplied.');return this.external.seek(t);}this.audio.currentTime=t;}
 setVolume(v){if(!Number.isFinite(v)||v<0||v>1)throw Error('Volume must be 0..1');this.graph();this.gain.gain.setTargetAtTime(v,this.ctx.currentTime,.02);}
 attach(provider){if(!provider||typeof provider.getTime!=='function'||typeof provider.isPlaying!=='function')throw Error('Transport requires getTime() and isPlaying().');this.audio.pause();this.external=provider;}
 detach(){this.external=null;}
 rms(){if(!this.analyser)return 0;const x=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(x);return Math.sqrt(x.reduce((a,b)=>a+b*b,0)/x.length);}
 dispose(){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();this.node?.disconnect();this.ctx?.close();for(const uri of this.urls.values())URL.revokeObjectURL(uri);this.urls.clear();}
};

