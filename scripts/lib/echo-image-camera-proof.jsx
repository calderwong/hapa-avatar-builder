import React from 'react';
import {createRoot} from 'react-dom/client';
import {PresentedEchoImage} from '../../src/components/HapaEchosView.jsx';
import {echoProtectedCameraFrame} from '../../src/domain/echo-camera-framing.js';
const root=createRoot(document.querySelector('#live'));
window.imageCase=async({shot,crop,width,height})=>{
 window.caseReady=false;const stage=document.querySelector('#live');stage.style.width=width+'px';stage.style.height=height+'px';
 const canvas=document.querySelector('#expected');canvas.width=width;canvas.height=height;canvas.style.left=width+'px';
 root.render(React.createElement(PresentedEchoImage,{shot,cameraCrop:crop,style:{position:'absolute',width:'100%',height:'100%',objectFit:'cover'},onPresentedMediaChange:state=>window.presented=state.presented}));
 const source=new Image();source.src=shot.media_contract.imageShot.original.uri;await source.decode();
 const f=echoProtectedCameraFrame({sourceWidth:source.naturalWidth,sourceHeight:source.naturalHeight,outputWidth:width,outputHeight:height,crop});
 const ctx=canvas.getContext('2d');ctx.fillStyle='#020617';ctx.fillRect(0,0,width,height);ctx.drawImage(source,f.x,f.y,f.width,f.height,f.destination.x,f.destination.y,f.destination.width,f.destination.height);
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.caseReady=true;
 return {frame:f};
};window.proofReady=true;
