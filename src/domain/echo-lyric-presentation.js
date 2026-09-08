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
  const inset = Number(profile.safeArea?.titleInset) || .08;
  const bottom = Number(profile.safeArea?.lyricBottom) || .1;
  const position = contract.position || 'bottom-center';
  const side = /left|right/.test(position), top = /top|upper/.test(position), center = position === 'center' || position === 'side-right';
  const maxWidth = width * (position === 'side-right' ? .5 : side ? .72 : 1-2*inset);
  const fontSize = Math.round(Math.min(width,height)*.052);
  const panel = { position:'absolute', boxSizing:'border-box', width:maxWidth+'px', padding:'18px 24px',
    font:`700 ${fontSize}px/1.4 ${fontFamily}`, color:text, background,
    border:`2px solid ${accent}88`, borderRadius:'8px', textAlign:side ? (/left/.test(position)?'left':'right'):'center',
    textTransform:'none', letterSpacing:'0', whiteSpace:'normal', overflowWrap:'anywhere',
    left:/left/.test(position)? width*inset+'px':/right/.test(position)?'auto':'50%',
    right:/right/.test(position)?width*inset+'px':'auto',
    top:top?height*inset+'px':center?'50%':'auto', bottom:top||center?'auto':height*bottom+'px',
    transform:`${side?'':'translateX(-50%) '}${center?'translateY(-50%)':''}`.trim() || 'none',
    textShadow:contract.style === 'paper-white'?'none':'0 2px 4px #000000', pointerEvents:'none' };
  if(contract.templateId==='kinetic-word-burst-v1')panel.borderLeft=`6px solid ${accent}`;
  if(contract.templateId==='scanline-phrase-ribbon-v1')panel.backgroundImage='repeating-linear-gradient(0deg,transparent,transparent 3px,#ffffff09 4px)';
  if(contract.templateId==='stacked-hook-echo-v1')panel.textShadow=`3px 3px 0 ${accent}55,-3px -3px 0 #ec489944`;
  if(contract.templateId==='orbit-caption-v1')panel.borderRadius='40px';
  return { width,height,fontSize,text,accent,panel };
}

export function renderEchoLyricSurface(element, { contract = {}, frame = null, line = null, outputProfile = {} } = {}) {
  if(!element)return null;
  let state=element.__echoLyricSurface;
  if(!state){
    const doc=element.ownerDocument,stage=doc.createElement('div'),panel=doc.createElement('div'),words=doc.createElement('div'),label=doc.createElement('div');
    stage.dataset.lyricStage='true';panel.dataset.lyricPanel='true';words.dataset.lyricWords='true';label.dataset.testid='echo-lyric-timing-label';
    Object.assign(stage.style,{position:'absolute',left:'0',top:'0',transformOrigin:'0 0',pointerEvents:'none'});
    Object.assign(words.style,{display:'block'});
    Object.assign(label.style,{font:'500 22px/1.3 system-ui, sans-serif',letterSpacing:'0',marginTop:'10px',opacity:'.8',textShadow:'none'});
    panel.append(words,label);stage.append(panel);element.replaceChildren(stage);
    state={stage,panel,words,label,nodes:[],key:''};element.__echoLyricSurface=state;
  }
  const visible=Boolean(line && frame?.visible && contract.enabled!==false);
  element.style.visibility=visible?'visible':'hidden';
  state.frame=visible?frame:null;state.line=visible?line:null;
  if(!visible)return {visible:false};
  const presentation=echoLyricPresentation(contract,outputProfile),key=JSON.stringify([contract.templateId,contract.style,contract.position,presentation.width,presentation.height,outputProfile.safeArea]);
  if(state.key!==key){
    state.panel.removeAttribute('style');Object.assign(state.panel.style,presentation.panel);
    Object.assign(state.stage.style,{width:presentation.width+'px',height:presentation.height+'px'});state.key=key;
  }
  element.dataset.timingMode=frame.timingPolicy.mode;element.dataset.timingReason=frame.timingPolicy.reason;element.dataset.templateId=frame.templateId;
  const sourceWords=Array.isArray(line.words)?line.words:[];
  const rows=sourceWords.length?frame.words.filter(word=>word.display):[{index:0,displayText:frame.displayText||line.text,opacity:1,scale:1}];
  while(state.nodes.length>rows.length)state.nodes.pop().remove();
  while(state.nodes.length<rows.length){const node=element.ownerDocument.createElement('span');node.className='lyric-word';state.words.append(node);state.nodes.push(node)}
  for(let index=0;index<rows.length;index++){
    const word=rows[index],node=state.nodes[index],value=word.displayText||sourceWords[word.index]?.word||sourceWords[word.index]?.text||'';
    if(node.textContent!==value)node.textContent=value;
    node.dataset.wordIndex=String(word.index);node.dataset.wordActive=String(Boolean(word.active));node.dataset.wordProgress=String(word.progress||0);
    node.dataset.lyricWordActive=node.dataset.wordActive;node.dataset.lyricWordProgress=node.dataset.wordProgress;
    Object.assign(node.style,{display:'inline-block',maxWidth:'100%',margin:'0 .12em',verticalAlign:'baseline',transformOrigin:'center',
      color:word.active?presentation.accent:presentation.text,opacity:String(word.opacity??1),fontWeight:'700',
      transform:`translate(${word.translateX||0}px, ${word.translateY||0}px) rotate(${word.rotateDegrees||0}deg) scale(${word.scale||1})`,
      backgroundImage:`linear-gradient(${presentation.accent},${presentation.accent})`,backgroundRepeat:'no-repeat',backgroundPosition:'left bottom',backgroundSize:`${(word.underlineProgress||0)*100}% 3px`});
  }
  const label=frame.timingPolicy.mode==='phrase'?frame.timingPolicy.label:'';
  if(state.label.textContent!==label)state.label.textContent=label;state.label.style.display=label?'block':'none';
  return {visible:true,wordCount:rows.length,fontSize:presentation.fontSize};
}

export function sizeEchoLyricSurface(element, profile = {}, viewportWidth, viewportHeight) {
  const state=element?.__echoLyricSurface;if(!state)return;
  const width=Number(profile.width)||1920,height=Number(profile.height)||1080;
  const scale=Math.min(viewportWidth/width,viewportHeight/height);
  if(!Number.isFinite(scale)||scale<=0)return;
  state.stage.style.transform=`translate(${(viewportWidth-width*scale)/2}px, ${(viewportHeight-height*scale)/2}px) scale(${scale})`;
}

export function echoLyricPresentationBrowserSource() {
  return [echoLyricPresentation,renderEchoLyricSurface,sizeEchoLyricSurface].map(fn=>fn.toString()).join('\n');
}
