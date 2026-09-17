import { echoProtectedCameraFrame } from "./echo-camera-framing.js";

/** One caption DOM owner for React Preview and generated HyperFrames/Song Card.
 * Sizes are in canonical output pixels; callers scale the stage, never the font
 * independently. Functions remain self-contained for offline browser packaging. */
export function echoLyricPresentation(contract = {}, profile = {}) {
  const width = Number(profile.width) || 1920, height = Number(profile.height) || 1080;
  const templateId = contract.templateId || 'scanline-phrase-ribbon-v1';
  const centerWordFocus = templateId === 'center-word-focus-v1';
  const squareMosaic = templateId === 'square-word-mosaic-v1';
  const verticalPoster = templateId === 'vertical-poster-stack-v1';
  const letterWave = templateId === 'letter-wave-v1';
  const kineticTypewriter = templateId === 'kinetic-typewriter-v1';
  const prismSlam = templateId === 'prism-slam-v1';
  const letterfallTotem = templateId === 'letterfall-totem-v1';
  const singleWordFocus = centerWordFocus || prismSlam || letterfallTotem;
  const palettes = {
    'neon-cyan': ['#e0faff','#22d3ee','#020617e8','monospace'],
    'magenta-glow': ['#ffe4f2','#f472b6','#180522e8','monospace'],
    'gold-caption': ['#fff7dc','#f6c96d','#1f1707e8','Georgia, serif'],
    'paper-white': ['#101827','#111827','#f7f4ebeF','Georgia, serif'],
    'minimal-subtitle': ['#ffffff','#ffffff','#000000d9','system-ui, sans-serif'],
  };
  const [paletteText,paletteAccent,background,themeFontFamily] = palettes[contract.style] || palettes['neon-cyan'];
  const fontFamilies = {
    sans:'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif:'Georgia, "Times New Roman", serif',
    mono:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    display:'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  };
  const directedThemeFont = squareMosaic || verticalPoster || prismSlam
    ? fontFamilies.display
    : letterWave
      ? fontFamilies.sans
      : kineticTypewriter
        ? fontFamilies.mono
        : letterfallTotem
          ? fontFamilies.serif
          : themeFontFamily;
  const fontFamily = fontFamilies[contract.fontFamily] || directedThemeFont;
  const customColor = /^#[0-9a-f]{6}$/i.test(String(contract.textColor || '')) ? String(contract.textColor).toLowerCase() : '';
  const text = customColor || paletteText,accent = customColor || paletteAccent;
  const fontScale = Number.isFinite(Number(contract.fontScale)) ? Math.max(.5,Math.min(2,Number(contract.fontScale))) : 1;
  const validInset = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(.02, Math.min(.35, value)) : fallback;
  const inset = validInset(contract.safeArea?.titleInset ?? profile.safeArea?.titleInset, .08);
  const bottom = validInset(contract.safeArea?.lyricBottom ?? profile.safeArea?.lyricBottom, .1);
  const position = singleWordFocus || squareMosaic ? 'center' : contract.position || 'bottom-center';
  const side = /left|right/.test(position), top = /top|upper/.test(position), center = position === 'center' || position === 'side-right';
  const maxWidth = squareMosaic
    ? Math.min(width, height) * .72
    : verticalPoster
      ? Math.min(width * .62, height * .68)
      : prismSlam
        ? width * .9
        : letterfallTotem
          ? Math.min(width * .28, height * .38)
      : width * (singleWordFocus ? .84 : position === 'side-right' ? .5 : side ? .72 : 1-2*inset);
  const fontRatio = centerWordFocus ? .11 : prismSlam ? .15 : letterfallTotem ? .066 : squareMosaic ? .055 : verticalPoster ? .065 : letterWave ? .072 : kineticTypewriter ? .06 : .052;
  const fontSize = Math.round(Math.min(width,height)*fontRatio*fontScale);
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
  if(centerWordFocus)Object.assign(panel,{padding:'0',font:`800 ${fontSize}px/1.05 ${fontFamily}`,background:'transparent',backgroundImage:'none',border:'0',borderRadius:'0',boxShadow:'none',overflow:'visible',overflowWrap:'normal',whiteSpace:'nowrap'});
  if(squareMosaic)Object.assign(panel,{padding:'18px',aspectRatio:'1 / 1',font:`900 ${fontSize}px/.92 ${fontFamily}`,background:'transparent',border:'0',borderRadius:'28px',boxShadow:`0 0 0 2px ${accent}38,0 28px 90px #00000055`,overflow:'visible'});
  if(verticalPoster)Object.assign(panel,{padding:'24px 32px',font:`900 ${fontSize}px/.88 ${fontFamily}`,background:'transparent',border:'0',borderLeft:`9px solid ${accent}`,borderRadius:'0',boxShadow:`-16px 0 0 ${accent}18`,textAlign:'left',overflow:'visible'});
  if(letterWave)Object.assign(panel,{padding:'28px 20px',font:`900 ${fontSize}px/1.1 ${fontFamily}`,background:'transparent',border:'0',borderRadius:'0',boxShadow:'none',overflow:'visible',textShadow:`-4px 0 #f43f5e88,4px 0 ${accent}88,0 12px 30px #000000cc`});
  if(kineticTypewriter)Object.assign(panel,{padding:'22px 26px',font:`750 ${fontSize}px/1.25 ${fontFamily}`,background:'linear-gradient(90deg,#020617b8,#02061722 72%,transparent)',border:'0',borderLeft:`3px solid ${accent}`,borderTop:`1px solid ${accent}55`,borderBottom:`1px solid ${accent}55`,borderRadius:'0',boxShadow:'none',textAlign:'left',overflow:'visible'});
  if(prismSlam)Object.assign(panel,{padding:'0',font:`950 ${fontSize}px/.9 ${fontFamily}`,background:'transparent',backgroundImage:'none',border:'0',borderRadius:'0',boxShadow:'none',overflow:'visible',overflowWrap:'normal',whiteSpace:'nowrap',textTransform:'uppercase',textShadow:`-10px 0 #f43f5e99,10px 0 ${accent}99,0 24px 50px #000000dd`});
  if(letterfallTotem)Object.assign(panel,{padding:'0',font:`900 ${fontSize}px/.78 ${fontFamily}`,background:'transparent',backgroundImage:'none',border:'0',borderRadius:'0',boxShadow:'none',overflow:'visible',overflowWrap:'normal',whiteSpace:'nowrap'});
  const layoutMode = squareMosaic ? 'square-grid' : verticalPoster ? 'poster-stack' : letterfallTotem ? 'glyph-column' : 'flow';
  const letterMotion = letterWave ? 'wave' : kineticTypewriter ? 'typewriter' : prismSlam ? 'prism' : letterfallTotem ? 'letterfall' : 'none';
  const drawPanel=!singleWordFocus&&!squareMosaic&&!verticalPoster&&!letterWave;
  const canvasBackground=drawPanel?(kineticTypewriter?'#020617b8':background):'transparent';
  return { templateId,width,height,fontSize,text,accent,background,canvasBackground,fontFamily,fontWeight:singleWordFocus||squareMosaic||verticalPoster?900:700,
    lineHeight:singleWordFocus?1.05:1.4,panel,inset,bottom,fixedCenter:singleWordFocus,singleWordOnly:singleWordFocus,drawPanel,
    layoutMode,letterMotion,paddingX:singleWordFocus?0:squareMosaic?18:verticalPoster?32:letterWave?20:kineticTypewriter?26:24,paddingY:singleWordFocus?0:squareMosaic?18:verticalPoster?24:letterWave?28:kineticTypewriter?22:18,
    borderWidth:drawPanel?parseFloat(panel.border)||0:0,
    borderRadius:singleWordFocus?0:parseFloat(panel.borderRadius)||0 };
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
  const score = p => obstacles.reduce((sum,r)=>sum+Math.max(0,Math.min(p.x+panelWidth,(r.x+r.width)*width+12)-Math.max(p.x,r.x*width-12))*Math.max(0,Math.min(p.y+panelHeight,(r.y+r.height)*height+12)-Math.max(p.y,r.y*height-12)),0);
  if(presentation.fixedCenter){const p={x:xCenter,y:yCenter},overlap=score(p);return {...p,overlap,width:panelWidth,height:panelHeight,status:overlap>0?'protected-region-collision':'clear',protectedRegions:obstacles.length};}
  const preferred = {x:panel.left==='50%'?xCenter:panel.left==='auto'?xRight:parseFloat(panel.left),y:panel.top==='50%'?yCenter:panel.top==='auto'?yBottom:parseFloat(panel.top)};
  const candidates=[preferred,{x:xCenter,y:marginY},{x:xCenter,y:yBottom},{x:xCenter,y:yCenter},{x:marginX,y:marginY},{x:xRight,y:marginY},{x:marginX,y:yBottom},{x:xRight,y:yBottom}];
  for(const r of obstacles){
    candidates.push({x:xCenter,y:r.y*height-12-panelHeight},{x:xCenter,y:(r.y+r.height)*height+12},
      {x:r.x*width-12-panelWidth,y:yCenter},{x:(r.x+r.width)*width+12,y:yCenter});
  }
  let best=null;
  for(const candidate of candidates){const p={x:Math.max(marginX,Math.min(xRight,candidate.x)),y:Math.max(marginY,Math.min(height-marginY-panelHeight,candidate.y))};const overlap=score(p);if(!best||overlap<best.overlap)best={...p,overlap};}
  return {...best,width:panelWidth,height:panelHeight,status:panelHeight>height-2*marginY||panelWidth>width-2*marginX?'caption-exceeds-safe-area':best.overlap>0?'protected-region-collision':'clear',protectedRegions:obstacles.length};
}

export function echoLyricWordMotionValues(word, box, area) {
  let rotation=word.rotateDegrees||0,scale=word.scale||1;
  let radians=rotation*Math.PI/180;
  let w=Math.abs(Math.cos(radians))*box.width+Math.abs(Math.sin(radians))*box.height;
  let h=Math.abs(Math.sin(radians))*box.width+Math.abs(Math.cos(radians))*box.height;
  if(w>area.width||h>area.height){rotation=0;w=box.width;h=box.height;}
  scale=Math.min(scale,area.width/Math.max(1,w),area.height/Math.max(1,h));
  const cx=box.x+box.width/2,cy=box.y+box.height/2;
  const dx=Math.max(area.x+w*scale/2-cx,Math.min(area.x+area.width-w*scale/2-cx,word.translateX||0));
  const dy=Math.max(area.y+h*scale/2-cy,Math.min(area.y+area.height-h*scale/2-cy,word.translateY||0));
  return {translateX:dx,translateY:dy,rotation,scale};
}

export function fitEchoLyricWordMotion(word, box, area) {
  const motion=echoLyricWordMotionValues(word,box,area);
  return `translate(${motion.translateX}px, ${motion.translateY}px) rotate(${motion.rotation}deg) scale(${motion.scale})`;
}

export function echoLyricWordArtStyle(word = {}, index = 0, rowCount = 0, presentation = {}) {
  const length=Math.max(1,Array.from(String(word.displayText||'')).length),templateId=presentation.templateId||'';
  if(templateId==='square-word-mosaic-v1'){
    const fontScale=Math.max(.5,Math.min(1.5,7/length));
    return {fontScale,fontSize:`${fontScale}em`,fontWeight:'950',letterSpacing:length<=3?'.035em':'-.035em',lineHeight:'.86',textTransform:length<=3?'uppercase':'none',borderRadius:index%3===0?'28px 8px 8px 8px':index%3===1?'8px 28px 8px 8px':'8px 8px 28px 8px'};
  }
  if(templateId==='vertical-poster-stack-v1'){
    const fontScale=Math.max(.68,Math.min(1.28,8/length));
    return {fontScale,fontSize:`${fontScale}em`,fontWeight:index%3===0?'950':'800',letterSpacing:index%2?'-.025em':'.045em',lineHeight:'.86',justifyContent:index%2?'flex-end':'flex-start',textAlign:index%2?'right':'left',textTransform:index%3===0?'uppercase':'none'};
  }
  if(templateId==='prism-slam-v1'){
    const fontScale=Math.max(.55,Math.min(1,10/length));
    return {fontScale,fontSize:`${fontScale}em`,fontWeight:'950',letterSpacing:length<=4?'.035em':'-.045em',lineHeight:'.86',textTransform:'uppercase'};
  }
  if(templateId==='letterfall-totem-v1')return {fontScale:1,fontSize:'1em',fontWeight:'900',letterSpacing:'0',lineHeight:'.76',textTransform:'uppercase'};
  if(templateId==='letter-wave-v1')return {fontScale:1,fontSize:'1em',fontWeight:'900',letterSpacing:'-.035em',lineHeight:'1'};
  if(templateId==='kinetic-typewriter-v1')return {fontScale:1,fontSize:'1em',fontWeight:'750',letterSpacing:'.015em',lineHeight:'1.1'};
  return {fontScale:1,fontSize:'1em',fontWeight:presentation.fontWeight||700,letterSpacing:'0',lineHeight:String(presentation.lineHeight||1.4)};
}

export function echoLyricWordDynamicStyle(word = {}, index = 0, presentation = {}) {
  const templateId=presentation.templateId||'',active=Boolean(word.active);
  if(templateId==='square-word-mosaic-v1')return {
    color:active?'#020617':presentation.text,
    backgroundColor:active?presentation.accent:index%2?'#02061773':'#ffffff14',
    border:`2px solid ${active?presentation.accent:index%2?presentation.accent+'55':'#ffffff2b'}`,
    boxShadow:active?`0 0 0 5px ${presentation.accent}30,0 16px 42px #00000088`:'inset 0 0 0 1px #ffffff0a',
    backgroundImage:'none',
  };
  if(templateId==='vertical-poster-stack-v1')return {
    color:active?presentation.accent:presentation.text,
    backgroundColor:active?'#02061799':'transparent',
    borderBottom:`${active?4:1}px solid ${active?presentation.accent:'#ffffff32'}`,
    boxShadow:active?`12px 0 0 ${presentation.accent}22`:'none',
    backgroundImage:'none',
  };
  if(templateId==='letter-wave-v1'||templateId==='prism-slam-v1'||templateId==='letterfall-totem-v1')return {color:presentation.text,backgroundColor:'transparent',backgroundImage:'none'};
  if(templateId==='kinetic-typewriter-v1')return {color:active?presentation.accent:presentation.text,backgroundColor:'transparent',backgroundImage:'none'};
  return {color:active?presentation.accent:presentation.text,backgroundColor:'transparent'};
}

export function echoLyricGlyphArtStyle(character = {}, word = {}, index = 0, presentation = {}) {
  const color=character.colorRole==='accent'?presentation.accent:character.colorRole==='muted'?'#ffffff55':presentation.text;
  const shadow=character.shadowRole==='prism'
    ? `-9px 0 #f43f5ecc,9px 0 ${presentation.accent}cc,0 18px 34px #000000dd`
    : character.shadowRole==='chromatic'
      ? `-4px 0 #f43f5eaa,4px 0 ${presentation.accent}aa,0 10px 24px #000000cc`
      : character.shadowRole==='vertical'
        ? `0 7px 0 #020617cc,0 14px 24px ${presentation.accent}55`
        : character.shadowRole==='caret'
          ? `0 0 14px ${presentation.accent}88`
          : '0 4px 12px #000000aa';
  return {color,textShadow:shadow,zIndex:String(10+index),mixBlendMode:character.shadowRole==='prism'||character.shadowRole==='chromatic'?'screen':'normal'};
}

export function echoLyricWordMeasurementStyle(word = {}, nextWord = null, presentation = {}) {
  const square=presentation.layoutMode==='square-grid',poster=presentation.layoutMode==='poster-stack',glyphColumn=presentation.layoutMode==='glyph-column';
  return {display:square||poster||glyphColumn?'flex':'inline-block',boxSizing:'border-box',maxWidth:'100%',marginTop:'0',marginBottom:'0',
    marginLeft:square||poster||glyphColumn||word.joinerBefore===false?'0':'.12em',marginRight:square||poster||glyphColumn||nextWord?.joinerBefore===false?'0':'.12em',padding:square?'12px 10px':poster?'7px 10px':glyphColumn?'0':'0 2px',verticalAlign:'baseline',
    flexDirection:glyphColumn?'column':'row',alignItems:square||glyphColumn?'center':'baseline',justifyContent:square?'center':poster?'flex-start':'center',textAlign:square||glyphColumn?'center':poster?'left':'inherit',
    transformOrigin:'center',whiteSpace:'nowrap',overflowWrap:'normal',wordBreak:'keep-all',fontWeight:'700',overflow:'visible'};
}

export function echoLyricWordsLayoutStyle(presentation = {}, rowCount = 0) {
  if(presentation.layoutMode==='square-grid'){
    const columns=Math.max(1,Math.ceil(Math.sqrt(Math.max(1,rowCount))));
    return {display:'grid',position:'relative',overflow:'visible',gridTemplateColumns:`repeat(${columns}, minmax(0, 1fr))`,gridAutoRows:'1fr',gap:'12px',alignItems:'stretch',justifyItems:'stretch',width:'100%',aspectRatio:'1 / 1'};
  }
  if(presentation.layoutMode==='poster-stack')return {display:'grid',position:'relative',overflow:'visible',gridTemplateColumns:'minmax(0, 1fr)',alignItems:'start',width:'100%'};
  if(presentation.layoutMode==='glyph-column')return {display:'flex',position:'relative',overflow:'visible',alignItems:'center',justifyContent:'center',width:'100%'};
  return {display:'block',position:'relative',overflow:'visible',width:'auto'};
}

export function echoLyricGlyphMeasurementStyle(presentation = {}) {
  const column=presentation.layoutMode==='glyph-column';
  return {display:column?'block':'inline-block',position:'relative',boxSizing:'border-box',minWidth:column?'1.05em':'0',textAlign:column?'center':'inherit',whiteSpace:'pre',transformOrigin:'center',willChange:'transform, opacity'};
}

export function echoLyricGlyphMeasurementBox(glyph = {}, word = {}) {
  return {
    x:Number(glyph.offsetLeft||0)-Number(word.offsetLeft||0),
    y:Number(glyph.offsetTop||0)-Number(word.offsetTop||0),
    width:Number(glyph.offsetWidth||0),
    height:Number(glyph.offsetHeight||0),
  };
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
    state={stage,panel,words,label,nodes:[],glyphNodes:[],caretNodes:[],key:'',layouts:new Map(),layoutBuilds:0,layoutHits:0};element.__echoLyricSurface=state;
  }
  if(!Array.isArray(state.glyphNodes))state.glyphNodes=state.nodes.map(()=>[]);
  if(!Array.isArray(state.caretNodes))state.caretNodes=state.nodes.map(()=>null);
  const visible=Boolean(line && frame?.visible && contract.enabled!==false);
  element.style.visibility=visible?'visible':'hidden';state.frame=visible?frame:null;state.line=visible?line:null;state.rows=[];
  if(!visible)return {visible:false};
  const key=JSON.stringify([contract.templateId,contract.style,contract.position,contract.fontFamily,contract.fontScale,contract.textColor,outputProfile.width,outputProfile.height,outputProfile.safeArea,contract.safeArea]);
  if(state.key!==key){state.presentation=echoLyricPresentation(contract,outputProfile);state.key=key;state.layouts.clear();state.contentKey=null;}
  const presentation=state.presentation;
  element.dataset.timingMode=frame.timingPolicy.mode;element.dataset.timingReason=frame.timingPolicy.reason;element.dataset.templateId=frame.templateId;
  const sourceWords=Array.isArray(line.words)?line.words:[],singleWordFocus=Boolean(presentation.singleWordOnly);
  // Phrase fallback displays the selected source text, not stale aligned tokens.
  const rows=singleWordFocus?frame.words.filter(word=>word.display):frame.timingPolicy.mode!=='phrase'&&sourceWords.length?frame.words.filter(word=>word.display):[{index:0,displayText:frame.displayText||line.text,opacity:1,scale:1}];
  state.rows=rows;state.contract=contract;
  const label=!singleWordFocus&&frame.timingPolicy.mode==='phrase'?frame.timingPolicy.label:'';
  const contentKey=JSON.stringify([line.id,line.start??line.startSeconds,line.end??line.endSeconds,rows.map(w=>[w.index,w.displayText]),label]);
  if(state.contentKey!==contentKey||state.protection!==protection){
    if(state.protection!==protection)state.layouts.clear();
    state.contentKey=contentKey;state.protection=protection;
    while(state.nodes.length>rows.length){state.nodes.pop().remove();state.glyphNodes.pop();state.caretNodes.pop();}
    while(state.nodes.length<rows.length){const node=element.ownerDocument.createElement('span');node.className='lyric-word';state.words.append(node);state.nodes.push(node);state.glyphNodes.push([]);state.caretNodes.push(null);}
    state.panel.removeAttribute('style');Object.assign(state.panel.style,presentation.panel);
    state.words.removeAttribute('style');Object.assign(state.words.style,echoLyricWordsLayoutStyle(presentation,rows.length));
    Object.assign(state.stage.style,{width:presentation.width+'px',height:presentation.height+'px'});
    state.label.textContent=label;state.label.style.display=label?'block':'none';
    state.nodes.forEach((node,index)=>{
      const row=rows[index],characters=Array.isArray(row.characters)?row.characters:[];
      node.replaceChildren();state.glyphNodes[index]=[];state.caretNodes[index]=null;
      if(characters.length){for(const character of characters){const glyph=element.ownerDocument.createElement('span');glyph.textContent=character.text;glyph.dataset.lyricGlyph=String(character.index);Object.assign(glyph.style,echoLyricGlyphMeasurementStyle(presentation),echoLyricGlyphArtStyle(character,row,character.index,presentation));node.append(glyph);state.glyphNodes[index].push(glyph);}}
      else node.textContent=row.displayText||'';
      if(presentation.letterMotion==='typewriter'){
        const caret=element.ownerDocument.createElement('span');caret.dataset.lyricCaret='true';Object.assign(caret.style,{position:'absolute',display:'none',width:'4px',background:presentation.accent,boxShadow:`0 0 16px ${presentation.accent}`,transform:'translateX(3px)'});node.append(caret);state.caretNodes[index]=caret;
      }
      const art=echoLyricWordArtStyle(row,index,rows.length,presentation),{fontScale,...artStyle}=art;
      node.dataset.wordIndex=String(row.index);node.dataset.lyricFontScale=String(fontScale);node.removeAttribute('style');Object.assign(node.style,echoLyricWordMeasurementStyle(row,rows[index+1],presentation),artStyle);if(singleWordFocus)node.style.fontWeight=artStyle.fontWeight||'900';
    });
    const start=Number(line.start??line.startSeconds),end=Number(line.end??line.endSeconds);
    const relevant=(protection||[]).filter(p=>p.end>start&&p.start<end);
    const obstacles=relevant.flatMap(p=>p.rectangles);
    let layout=state.layouts.get(contentKey);
    if(!layout){
      state.words.style.height='auto';let fontSize=presentation.fontSize;
      const minimumFontSize=Math.round(Math.min(presentation.width,presentation.height)*.028);
      // Measure only when preparing a new phrase/window. Prefer its authored
      // font, then reduce within the readability floor if no clear anchor fits.
      while(!presentation.fixedCenter&&chooseEchoLyricPlacement({presentation,panelHeight:state.panel.offsetHeight,obstacles}).status!=='clear'&&fontSize>minimumFontSize){
        fontSize=Math.max(minimumFontSize,fontSize-2);state.panel.style.fontSize=fontSize+'px';
      }
      const boxes=state.nodes.map(node=>({x:node.offsetLeft,y:node.offsetTop,width:node.offsetWidth,height:node.offsetHeight}));
      const glyphBoxes=state.glyphNodes.map((glyphs,index)=>glyphs.map(glyph=>echoLyricGlyphMeasurementBox(glyph,state.nodes[index])));
      layout={boxes,height:state.words.offsetHeight,width:state.words.clientWidth,panelHeight:state.panel.offsetHeight,fontSize,
        wordsOffsetX:state.words.offsetLeft,wordsOffsetY:state.words.offsetTop,glyphBoxes};state.layoutBuilds++;
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
    const art=echoLyricWordArtStyle(word,index,rows.length,presentation),dynamic=echoLyricWordDynamicStyle(word,index,presentation);
    Object.assign(node.style,{...dynamic,opacity:String(word.opacity??1),fontWeight:art.fontWeight||String(presentation.fontWeight||700),
      transform:fitEchoLyricWordMotion(word,state.layout.boxes[index],{x:-20,y:-14,width:state.layout.width+40,height:state.layout.height+28}),
      backgroundImage:dynamic.backgroundImage??(singleWordFocus?'none':`linear-gradient(${presentation.accent},${presentation.accent})`),backgroundRepeat:'no-repeat',backgroundPosition:'left bottom',backgroundSize:dynamic.backgroundImage==='none'||singleWordFocus?'0 0':`${(word.underlineProgress||0)*100}% 3px`});
    const glyphs=state.glyphNodes[index]||[],glyphBoxes=state.layout.glyphBoxes?.[index]||[];
    for(let glyphIndex=0;glyphIndex<glyphs.length;glyphIndex+=1){const glyph=glyphs[glyphIndex],character=word.characters?.[glyphIndex],box=glyphBoxes[glyphIndex];if(!character||!box)continue;
      Object.assign(glyph.style,echoLyricGlyphArtStyle(character,word,glyphIndex,presentation),{opacity:String(character.opacity??1),transform:fitEchoLyricWordMotion(character,box,{x:0,y:0,width:state.layout.boxes[index].width,height:state.layout.boxes[index].height})});
    }
    const caret=state.caretNodes[index];
    if(caret){const revealed=Math.max(0,Math.min(glyphBoxes.length,Math.ceil((word.progress||0)*glyphBoxes.length))),box=glyphBoxes[Math.max(0,revealed-1)];
      Object.assign(caret.style,{display:word.active?'block':'none',left:(box?box.x+box.width:0)+'px',top:(box?.y||0)+'px',height:(box?.height||state.layout.boxes[index].height)+'px',opacity:String(word.active?(Math.floor((word.progress||0)*glyphBoxes.length*3)%2?.42:1):0)});
    }
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

function echoLyricCanvasRoundRect(context,x,y,width,height,radius){
  context.beginPath();
  if(typeof context.roundRect==='function')context.roundRect(x,y,width,height,radius);
  else context.rect(x,y,width,height);
}

/** Paint the already-evaluated Preview lyric surface into a recording canvas.
 * This deliberately consumes the same DOM owner's frame and measured layout,
 * so capture does not run a second lyric clock or invent different wrapping. */
export function paintEchoLyricSurfaceToCanvas(context,element,{width,height}={}){
  const state=element?.__echoLyricSurface;
  if(!context||!state?.frame?.visible||!state.line||element?.style?.visibility==='hidden')return {drawn:false,reason:'lyrics-not-visible'};
  const presentation=state.presentation,layout=state.layout,placement=state.placement,rows=state.rows||[];
  if(!presentation||!layout||!placement||!rows.length)return {drawn:false,reason:'lyrics-not-laid-out'};
  const outputWidth=Number(width||context.canvas?.width||presentation.width),outputHeight=Number(height||context.canvas?.height||presentation.height);
  if(!(outputWidth>0&&outputHeight>0))return {drawn:false,reason:'recording-size-invalid'};
  const scaleX=outputWidth/presentation.width,scaleY=outputHeight/presentation.height;
  const panelX=Number(placement.x||0),panelY=Number(placement.y||0),panelWidth=parseFloat(presentation.panel.width)||Number(placement.width||0),panelHeight=Number(layout.panelHeight||0);
  const wordsX=panelX+Number(layout.wordsOffsetX??presentation.paddingX??0),wordsY=panelY+Number(layout.wordsOffsetY??presentation.paddingY??0);
  context.save();context.scale(scaleX,scaleY);
  const templateId=String(state.contract?.templateId||''),drawPanel=presentation.drawPanel!==undefined?presentation.drawPanel:!presentation.fixedCenter&&templateId!=='vertical-poster-stack-v1';
  if(drawPanel&&panelWidth>0&&panelHeight>0){
    echoLyricCanvasRoundRect(context,panelX,panelY,panelWidth,panelHeight,presentation.borderRadius||0);
    let panelFill=presentation.canvasBackground||presentation.background;
    if((templateId==='square-word-mosaic-v1'||templateId==='letter-wave-v1')&&typeof context.createLinearGradient==='function'){
      const gradient=context.createLinearGradient(panelX,panelY,panelX+panelWidth,panelY+panelHeight);gradient.addColorStop(0,presentation.background);gradient.addColorStop(1,'#020617b8');panelFill=gradient;
    }
    context.fillStyle=panelFill;context.fill();
    if(presentation.borderWidth>0){context.strokeStyle=`${presentation.accent}88`;context.lineWidth=presentation.borderWidth;context.stroke();}
    if(state.contract?.templateId==='scanline-phrase-ribbon-v1'){
      context.save();context.globalAlpha=.08;context.fillStyle='#ffffff';
      for(let y=panelY+4;y<panelY+panelHeight;y+=4)context.fillRect(panelX,y,panelWidth,1);
      context.restore();
    }
  }
  if(templateId==='vertical-poster-stack-v1'){
    context.fillStyle=presentation.accent;context.fillRect(panelX,panelY,8,panelHeight);
  }
  const area={x:-20,y:-14,width:Number(layout.width||panelWidth)+40,height:Number(layout.height||panelHeight)+28};
  context.textBaseline='top';context.textAlign='left';
  for(let index=0;index<rows.length;index+=1){
    const row=rows[index],box=layout.boxes?.[index],node=state.nodes?.[index];
    if(!box||!node)continue;
    const label=String(node.textContent||row.displayText||'');if(!label)continue;
    if(templateId==='square-word-mosaic-v1'){
      context.save();echoLyricCanvasRoundRect(context,wordsX+box.x,wordsY+box.y,box.width,box.height,index%3===0?28:8);
      context.fillStyle=row.active?presentation.accent:index%2?'#020617b8':'#ffffff18';context.fill();context.strokeStyle=row.active?presentation.accent:`${presentation.accent}55`;context.lineWidth=2;context.stroke();context.restore();
    }
    const art=echoLyricWordArtStyle(row,index,rows.length,presentation),motion=echoLyricWordMotionValues(row,box,area),centerX=wordsX+box.x+box.width/2,centerY=wordsY+box.y+box.height/2;
    context.save();context.translate(centerX+motion.translateX,centerY+motion.translateY);context.rotate(motion.rotation*Math.PI/180);context.scale(motion.scale,motion.scale);
    context.globalAlpha=Number.isFinite(Number(row.opacity))?Number(row.opacity):1;
    context.font=`${art.fontWeight||presentation.fontWeight} ${layout.fontSize*Number(art.fontScale||1)}px ${presentation.fontFamily}`;
    context.fillStyle=templateId==='square-word-mosaic-v1'&&row.active?'#020617':row.active?presentation.accent:presentation.text;
    context.shadowColor=state.contract?.style==='paper-white'?'transparent':'#000000';context.shadowBlur=4;context.shadowOffsetY=2;
    const characters=Array.isArray(row.characters)?row.characters:[],glyphBoxes=layout.glyphBoxes?.[index]||[];
    if(characters.length&&glyphBoxes.length===characters.length){
      for(let glyphIndex=0;glyphIndex<characters.length;glyphIndex+=1){const character=characters[glyphIndex],glyphBox=glyphBoxes[glyphIndex];
        const glyphMotion=echoLyricWordMotionValues(character,glyphBox,{x:0,y:0,width:box.width,height:box.height});
        const glyphX=-box.width/2+glyphBox.x+glyphBox.width/2,glyphY=-box.height/2+glyphBox.y+glyphBox.height/2;
        context.save();context.translate(glyphX+glyphMotion.translateX,glyphY+glyphMotion.translateY);context.rotate(glyphMotion.rotation*Math.PI/180);context.scale(glyphMotion.scale,glyphMotion.scale);
        context.globalAlpha=(Number.isFinite(Number(row.opacity))?Number(row.opacity):1)*(Number.isFinite(Number(character.opacity))?Number(character.opacity):1);
        const glyphText=String(character.text||''),glyphColor=character.colorRole==='accent'?presentation.accent:character.colorRole==='muted'?'#ffffff55':presentation.text;
        if(character.shadowRole==='prism'||character.shadowRole==='chromatic'){
          context.shadowColor='transparent';context.fillStyle='#f43f5e99';context.fillText(glyphText,-glyphBox.width/2-6,-glyphBox.height/2);
          context.fillStyle=`${presentation.accent}aa`;context.fillText(glyphText,-glyphBox.width/2+6,-glyphBox.height/2);
        }
        context.fillStyle=glyphColor;context.shadowColor='#000000aa';context.shadowBlur=6;context.fillText(glyphText,-glyphBox.width/2,-glyphBox.height/2);context.restore();
      }
    }else context.fillText(label,-box.width/2+2,-box.height/2);
    if(templateId==='kinetic-typewriter-v1'&&row.active&&glyphBoxes.length){const revealed=Math.max(0,Math.min(glyphBoxes.length,Math.ceil((row.progress||0)*glyphBoxes.length))),caretBox=glyphBoxes[Math.max(0,revealed-1)];
      context.shadowColor='transparent';context.fillStyle=presentation.accent;context.globalAlpha=Math.floor((row.progress||0)*glyphBoxes.length*3)%2?.42:1;context.fillRect(-box.width/2+(caretBox?caretBox.x+caretBox.width:0)+3,-box.height/2+(caretBox?.y||0),4,caretBox?.height||box.height);
    }
    const underline=Number(row.underlineProgress||0);
    if(!presentation.fixedCenter&&underline>0){context.shadowColor='transparent';context.fillStyle=presentation.accent;context.fillRect(-box.width/2,box.height/2-3,Math.max(0,Math.min(1,underline))*box.width,3);}
    context.restore();
  }
  const timingLabel=String(state.label?.textContent||'');
  if(timingLabel&&state.label?.style?.display!=='none'){
    context.globalAlpha=.8;context.font='500 22px system-ui, sans-serif';context.fillStyle=presentation.text;context.shadowColor='transparent';
    context.fillText(timingLabel,wordsX,wordsY+Number(layout.height||0)+10);
  }
  const accentCanvas=state.panel?.querySelector?.('[data-echo-lyric-accents]');
  if(accentCanvas&&Number(accentCanvas.width||0)>0&&Number(accentCanvas.height||0)>0){
    context.globalAlpha=1;context.shadowColor='transparent';context.drawImage(accentCanvas,panelX,panelY,panelWidth,panelHeight);
  }
  context.restore();
  return {drawn:true,wordCount:rows.length,templateId:String(state.contract?.templateId||'')};
}

export function echoLyricPresentationBrowserSource() {
  return [echoLyricPresentation,prepareEchoLyricObstacles,chooseEchoLyricPlacement,echoLyricWordMotionValues,fitEchoLyricWordMotion,echoLyricWordArtStyle,echoLyricWordDynamicStyle,echoLyricGlyphArtStyle,echoLyricWordMeasurementStyle,echoLyricWordsLayoutStyle,echoLyricGlyphMeasurementStyle,echoLyricGlyphMeasurementBox,renderEchoLyricSurface,sizeEchoLyricSurface].map(fn=>fn.toString()).join('\n');
}
