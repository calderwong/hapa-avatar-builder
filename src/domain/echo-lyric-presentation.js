import { echoProtectedCameraFrame } from "./echo-camera-framing.js";

/** One caption DOM owner for React Preview and generated HyperFrames/Song Card.
 * Sizes are in canonical output pixels; callers scale the stage, never the font
 * independently. Functions remain self-contained for offline browser packaging. */
export function echoLyricPresentation(contract = {}, profile = {}) {
  const width = Number(profile.width) || 1920, height = Number(profile.height) || 1080;
  const palettes = {
    'neon-cyan': ['#e0faff','#22d3ee','#020617e8','monospace'],
    'magenta-glow': ['#ffe4f2','#f472b6','#180522e8','monospace'],
    'gold-caption': ['#fff7dc','#f6c96d','#1f1707e8','Georgia, serif'],
    'paper-white': ['#101827','#111827','#f7f4ebeF','Georgia, serif'],
    'minimal-subtitle': ['#ffffff','#ffffff','#000000d9','system-ui, sans-serif'],
  };
  const [text,accent,background,fontFamily] = palettes[contract.style] || palettes['neon-cyan'];
  const validInset = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(.02, Math.min(.35, value)) : fallback;
  const inset = validInset(contract.safeArea?.titleInset ?? profile.safeArea?.titleInset, .08);
  const bottom = validInset(contract.safeArea?.lyricBottom ?? profile.safeArea?.lyricBottom, .1);
  const position = contract.position || 'bottom-center';
  const side = /left|right/.test(position), top = /top|upper/.test(position), center = position === 'center' || position === 'side-right';
  const maxWidth = width * (position === 'side-right' ? .5 : side ? .72 : 1-2*inset);
  const fontSize = Math.round(Math.min(width,height)*.052);
  const panel = { position:'absolute', boxSizing:'border-box', width:maxWidth+'px', padding:'18px 24px',
    font:`700 ${fontSize}px/1.4 ${fontFamily}`, color:text, background,
    border:`2px solid ${accent}88`, borderRadius:'8px', textAlign:side ? (/left/.test(position)?'left':'right'):'center',
    textTransform:'none', textRendering:'geometricPrecision', letterSpacing:'0', whiteSpace:'normal', overflowWrap:'anywhere',
    left:/left/.test(position)? width*inset+'px':/right/.test(position)?'auto':'50%',
    right:/right/.test(position)?width*inset+'px':'auto',
    top:top?height*inset+'px':center?'50%':'auto', bottom:top||center?'auto':height*bottom+'px',
    transform:`${side?'':'translateX(-50%) '}${center?'translateY(-50%)':''}`.trim() || 'none',
    textShadow:contract.style === 'paper-white'?'none':'0 2px 4px #000000', pointerEvents:'none' };
  if(contract.templateId==='kinetic-word-burst-v1')panel.borderLeft=`6px solid ${accent}`;
  if(contract.templateId==='scanline-phrase-ribbon-v1')panel.backgroundImage='repeating-linear-gradient(0deg,transparent,transparent 3px,#ffffff09 4px)';
  if(contract.templateId==='stacked-hook-echo-v1')panel.textShadow=`3px 3px 0 ${accent}55,-3px -3px 0 #ec489944`;
  if(contract.templateId==='orbit-caption-v1')panel.borderRadius='40px';
  return { width,height,fontSize,text,accent,panel,inset,bottom };
}

/** Camera and source evidence are prepared once, not inferred from media titles.
 * Constant-size protected crop corridors translate monotonically, so the union
 * of every keyframe's projected rectangle bounds the complete corridor. */
export function prepareEchoLyricObstacles(media = [], profile = {}) {
  const result = [];
  const valid = r => r && [r.x,r.y,r.width,r.height].every(Number.isFinite) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x+r.width <= 1+1e-9 && r.y+r.height <= 1+1e-9;
  for (const [index, item] of media.entries()) {
    const geometry = item.imageShot || item.media?.imageShot;
    const start = Number(item.start ?? item.startSeconds), end = Number(item.end ?? item.endSeconds);
    if (!geometry || !(end > start)) continue;
    const original = geometry.original, crops = (item.cameraKeyframes || []).map(k => k.crop);
    let status = 'source-or-camera-unverified', rectangles = [];
    if (geometry.protectionStatus === 'source-bound' && geometry.protectionEvidence?.status === 'source-bound'
      && /^[a-f0-9]{64}$/.test(original?.sha256 || '') && geometry.protectionEvidence.sourceHash === original.sha256
      && [original.width, original.height, profile.width, profile.height].every(n => Number.isFinite(n) && n > 0)
      && crops.length && crops.every(c => valid(c) && c.cameraModel === 'protected-v2' && c.width === crops[0].width && c.height === crops[0].height && c.fit === crops[0].fit && c.fitScale === crops[0].fitScale)) {
      const regions = (geometry.protectedRegions || []).filter(r => valid(r.rect || r));
      for (const region of regions) {
        const r = region.rect || region;
        const projected = crops.map(crop => {
          const frame = echoProtectedCameraFrame({ sourceWidth: original.width, sourceHeight: original.height, outputWidth: profile.width, outputHeight: profile.height, crop });
          const d = frame.destination || { x:0,y:0,width:profile.width,height:profile.height };
          return { x:(d.x+(r.x*original.width-frame.x)/frame.width*d.width)/profile.width,
            y:(d.y+(r.y*original.height-frame.y)/frame.height*d.height)/profile.height,
            width:r.width*original.width/frame.width*d.width/profile.width, height:r.height*original.height/frame.height*d.height/profile.height };
        });
        const left=Math.max(0,Math.min(...projected.map(r=>r.x))),top=Math.max(0,Math.min(...projected.map(r=>r.y)));
        const right=Math.min(1,Math.max(...projected.map(r=>r.x+r.width))),bottom=Math.min(1,Math.max(...projected.map(r=>r.y+r.height)));
        if(right>left&&bottom>top)rectangles.push({id:region.id||'',kind:region.kind||'subject',x:left,y:top,width:right-left,height:bottom-top,sourceHash:original.sha256});
      }
      status = rectangles.length ? 'source-bound-camera-envelope' : 'no-visible-protected-region';
    }
    // Include the incoming source throughout its predecessor's interval. This
    // conservative envelope covers dissolves without chasing media every frame.
    const previous = media[index-1];
    const protectionStart = previous ? Math.min(start, Number(previous.start ?? previous.startSeconds)) : start;
    result.push({ start: Number.isFinite(protectionStart)?protectionStart:start, end, status, rectangles });
  }
  return result;
}

export function chooseEchoLyricPlacement({ presentation, panelHeight, obstacles = [] } = {}) {
  const {width,height,inset,bottom,panel}=presentation, panelWidth=parseFloat(panel.width);
  const marginX=width*inset, marginY=height*inset;
  const xRight=width-marginX-panelWidth, xCenter=(width-panelWidth)/2;
  const yBottom=Math.min(height-marginY-panelHeight,height-height*bottom-panelHeight), yCenter=(height-panelHeight)/2;
  const preferred = {x:panel.left==='50%'?xCenter:panel.left==='auto'?xRight:parseFloat(panel.left),y:panel.top==='50%'?yCenter:panel.top==='auto'?yBottom:parseFloat(panel.top)};
  const candidates=[preferred,{x:xCenter,y:marginY},{x:xCenter,y:yBottom},{x:xCenter,y:yCenter},{x:marginX,y:marginY},{x:xRight,y:marginY},{x:marginX,y:yBottom},{x:xRight,y:yBottom}];
  for(const r of obstacles){
    candidates.push({x:xCenter,y:r.y*height-12-panelHeight},{x:xCenter,y:(r.y+r.height)*height+12},
      {x:r.x*width-12-panelWidth,y:yCenter},{x:(r.x+r.width)*width+12,y:yCenter});
  }
  const score = p => obstacles.reduce((sum,r)=>sum+Math.max(0,Math.min(p.x+panelWidth,(r.x+r.width)*width+12)-Math.max(p.x,r.x*width-12))*Math.max(0,Math.min(p.y+panelHeight,(r.y+r.height)*height+12)-Math.max(p.y,r.y*height-12)),0);
  let best=null;
  for(const candidate of candidates){const p={x:Math.max(marginX,Math.min(xRight,candidate.x)),y:Math.max(marginY,Math.min(height-marginY-panelHeight,candidate.y))};const overlap=score(p);if(!best||overlap<best.overlap)best={...p,overlap};}
  return {...best,width:panelWidth,height:panelHeight,status:panelHeight>height-2*marginY||panelWidth>width-2*marginX?'caption-exceeds-safe-area':best.overlap>0?'protected-region-collision':'clear',protectedRegions:obstacles.length};
}

export function fitEchoLyricWordMotion(word, box, area) {
  let rotation=word.rotateDegrees||0,scale=word.scale||1;
  let radians=rotation*Math.PI/180;
  let w=Math.abs(Math.cos(radians))*box.width+Math.abs(Math.sin(radians))*box.height;
  let h=Math.abs(Math.sin(radians))*box.width+Math.abs(Math.cos(radians))*box.height;
  if(w>area.width||h>area.height){rotation=0;w=box.width;h=box.height;}
  scale=Math.min(scale,area.width/Math.max(1,w),area.height/Math.max(1,h));
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const dx=Math.max(area.x+w*scale/2-cx,Math.min(area.x+area.width-w*scale/2-cx,word.translateX||0));
  const dy=Math.max(area.y+h*scale/2-cy,Math.min(area.y+area.height-h*scale/2-cy,word.translateY||0));
  return `translate(${dx}px, ${dy}px) rotate(${rotation}deg) scale(${scale})`;
}

export function echoLyricWordMeasurementStyle(word = {}, nextWord = null) {
  return {display:'inline-block',boxSizing:'border-box',maxWidth:'100%',marginTop:'0',marginBottom:'0',
    marginLeft:word.joinerBefore===false?'0':'.12em',marginRight:nextWord?.joinerBefore===false?'0':'.12em',padding:'0 2px',verticalAlign:'baseline',
    transformOrigin:'center',whiteSpace:'nowrap',overflowWrap:'normal',wordBreak:'keep-all',fontWeight:'700',overflow:'visible'};
}

export function renderEchoLyricSurface(element, { contract = {}, frame = null, line = null, outputProfile = {}, protection = null } = {}) {
  if(!element)return null;
  let state=element.__echoLyricSurface;
  if(!state){
    const doc=element.ownerDocument,stage=doc.createElement('div'),panel=doc.createElement('div'),words=doc.createElement('div'),label=doc.createElement('div');
    stage.dataset.lyricStage='true';panel.dataset.lyricPanel='true';words.dataset.lyricWords='true';label.dataset.testid='echo-lyric-timing-label';
    Object.assign(stage.style,{position:'absolute',left:'0',top:'0',transformOrigin:'0 0',pointerEvents:'none'});
    Object.assign(words.style,{display:'block',position:'relative',overflow:'visible'});
    Object.assign(label.style,{font:'500 22px/1.3 system-ui, sans-serif',letterSpacing:'0',marginTop:'10px',opacity:'.8',textShadow:'none'});
    panel.append(words,label);stage.append(panel);element.replaceChildren(stage);
    state={stage,panel,words,label,nodes:[],key:'',layouts:new Map(),layoutBuilds:0,layoutHits:0};element.__echoLyricSurface=state;
  }
  const visible=Boolean(line && frame?.visible && contract.enabled!==false);
  element.style.visibility=visible?'visible':'hidden';state.frame=visible?frame:null;state.line=visible?line:null;
  if(!visible)return {visible:false};
  const key=JSON.stringify([contract.templateId,contract.style,contract.position,outputProfile.width,outputProfile.height,outputProfile.safeArea,contract.safeArea]);
  if(state.key!==key){state.presentation=echoLyricPresentation(contract,outputProfile);state.key=key;state.layouts.clear();state.contentKey=null;}
  const presentation=state.presentation;
  element.dataset.timingMode=frame.timingPolicy.mode;element.dataset.timingReason=frame.timingPolicy.reason;element.dataset.templateId=frame.templateId;
  const sourceWords=Array.isArray(line.words)?line.words:[];
  // Phrase fallback displays the selected source text, not stale aligned tokens.
  const rows=frame.timingPolicy.mode!=='phrase'&&sourceWords.length?frame.words.filter(word=>word.display):[{index:0,displayText:frame.displayText||line.text,opacity:1,scale:1}];
  const label=frame.timingPolicy.mode==='phrase'?frame.timingPolicy.label:'';
  const contentKey=JSON.stringify([line.id,line.start??line.startSeconds,line.end??line.endSeconds,rows.map(w=>[w.index,w.displayText]),label]);
  if(state.contentKey!==contentKey||state.protection!==protection){
    if(state.protection!==protection)state.layouts.clear();
    state.contentKey=contentKey;state.protection=protection;
    while(state.nodes.length>rows.length)state.nodes.pop().remove();
    while(state.nodes.length<rows.length){const node=element.ownerDocument.createElement('span');node.className='lyric-word';state.words.append(node);state.nodes.push(node);}
    state.panel.removeAttribute('style');Object.assign(state.panel.style,presentation.panel);
    Object.assign(state.stage.style,{width:presentation.width+'px',height:presentation.height+'px'});
    state.label.textContent=label;state.label.style.display=label?'block':'none';
    state.nodes.forEach((node,index)=>{node.textContent=rows[index].displayText||'';node.dataset.wordIndex=String(rows[index].index);node.removeAttribute('style');Object.assign(node.style,echoLyricWordMeasurementStyle(rows[index],rows[index+1]));});
    const start=Number(line.start??line.startSeconds),end=Number(line.end??line.endSeconds);
    const relevant=(protection||[]).filter(p=>p.end>start&&p.start<end);
    const obstacles=relevant.flatMap(p=>p.rectangles);
    let layout=state.layouts.get(contentKey);
    if(!layout){
      state.words.style.height='auto';let fontSize=presentation.fontSize;
      const minimumFontSize=Math.round(Math.min(presentation.width,presentation.height)*.028);
      // Measure only when preparing a new phrase/window. Prefer its authored
      // font, then reduce within the readability floor if no clear anchor fits.
      while(chooseEchoLyricPlacement({presentation,panelHeight:state.panel.offsetHeight,obstacles}).status!=='clear'&&fontSize>minimumFontSize){
        fontSize=Math.max(minimumFontSize,fontSize-2);state.panel.style.fontSize=fontSize+'px';
      }
      const boxes=state.nodes.map(node=>({x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight}));
      layout={boxes,height:state.words.offsetHeight,width:state.words.clientWidth,panelHeight:state.panel.offsetHeight,fontSize};state.layoutBuilds++;
      if(state.layouts.size>=128)state.layouts.delete(state.layouts.keys().next().value);state.layouts.set(contentKey,layout);
    }else state.layoutHits++;
    state.layout=layout;state.panel.style.fontSize=layout.fontSize+'px';state.words.style.height=layout.height+'px';
    state.nodes.forEach((node,index)=>Object.assign(node.style,{position:'absolute',left:layout.boxes[index].x+'px',top:layout.boxes[index].y+'px',width:layout.boxes[index].width+'px',minHeight:layout.boxes[index].height+'px',height:'auto',margin:'0'}));
    const placement=chooseEchoLyricPlacement({presentation,panelHeight:layout.panelHeight,obstacles});
    state.placement={...placement,evidence:relevant.length?relevant.map(p=>p.status):['protection-data-unavailable']};
    Object.assign(state.panel.style,{left:placement.x+'px',top:placement.y+'px',right:'auto',bottom:'auto',transform:'none'});
    element.dataset.lyricPlacement=JSON.stringify(state.placement);
    element.dataset.lyricLayout=JSON.stringify({builds:state.layoutBuilds,hits:state.layoutHits,retained:state.layouts.size,fontSize:layout.fontSize,status:placement.status});
  }
  for(let index=0;index<rows.length;index++){
    const word=rows[index],node=state.nodes[index];
    node.dataset.wordActive=String(Boolean(word.active));node.dataset.wordProgress=String(word.progress||0);
    node.dataset.lyricWordActive=node.dataset.wordActive;node.dataset.lyricWordProgress=node.dataset.wordProgress;
    Object.assign(node.style,{color:word.active?presentation.accent:presentation.text,opacity:String(word.opacity??1),fontWeight:'700',
      transform:fitEchoLyricWordMotion(word,state.layout.boxes[index],{x:-20,y:-14,width:state.layout.width+40,height:state.layout.height+28}),
      backgroundImage:`linear-gradient(${presentation.accent},${presentation.accent})`,backgroundRepeat:'no-repeat',backgroundPosition:'left bottom',backgroundSize:`${(word.underlineProgress||0)*100}% 3px`});
  }
  return {visible:true,wordCount:rows.length,fontSize:state.layout.fontSize,placement:state.placement,layoutBuilds:state.layoutBuilds};
}

export function sizeEchoLyricSurface(element, profile = {}, viewportWidth, viewportHeight) {
  const state=element?.__echoLyricSurface;if(!state)return;
  const width=Number(profile.width)||1920,height=Number(profile.height)||1080;
  const scale=Math.min(viewportWidth/width,viewportHeight/height);
  if(!Number.isFinite(scale)||scale<=0)return;
  state.stage.style.transform=`translate(${(viewportWidth-width*scale)/2}px, ${(viewportHeight-height*scale)/2}px) scale(${scale})`;
}

export function echoLyricPresentationBrowserSource() {
  return [echoLyricPresentation,prepareEchoLyricObstacles,chooseEchoLyricPlacement,fitEchoLyricWordMotion,echoLyricWordMeasurementStyle,renderEchoLyricSurface,sizeEchoLyricSurface].map(fn=>fn.toString()).join('\n');
}
