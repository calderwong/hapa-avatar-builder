import { echoProtectedCameraFrame } from "./echo-camera-framing.js";

/** One caption DOM owner for React Preview and generated HyperFrames/Song Card.
 * Sizes are in canonical output pixels; callers scale the stage, never the font
 * independently. Functions remain self-contained for offline browser packaging. */
export function echoLyricPresentation(contract = {}, profile = {}) {
  const width = Number(profile.width) || 1920, height = Number(profile.height) || 1080;
  const templateId = contract.highlightWords === false ? 'plain-phrase-v1' : contract.templateId || 'scanline-phrase-ribbon-v1';
  const ribbon = templateId === 'scanline-phrase-ribbon-v1';
  const burst = templateId === 'kinetic-word-burst-v1';
  const hookEcho = templateId === 'stacked-hook-echo-v1';
  const orbit = templateId === 'orbit-caption-v1';
  const centerWordFocus = templateId === 'center-word-focus-v1';
  const squareMosaic = templateId === 'square-word-mosaic-v1';
  const verticalPoster = templateId === 'vertical-poster-stack-v1';
  const letterWave = templateId === 'letter-wave-v1';
  const kineticTypewriter = templateId === 'kinetic-typewriter-v1';
  const prismSlam = templateId === 'prism-slam-v1';
  const letterfallTotem = templateId === 'letterfall-totem-v1';
  const singleWordFocus = centerWordFocus || prismSlam || letterfallTotem;
  // Palettes carry colour only; every template owns its typography. `deep` is
  // the scrim and legibility-halo colour, so light palettes halo dark ink.
  const palettes = {
    'neon-cyan': { text:'#f2fcff', accent:'#2ee6ff', secondary:'#ff3d9a', deep:'#020c16' },
    'magenta-glow': { text:'#fff0f8', accent:'#ff4fb3', secondary:'#8b7bff', deep:'#14041a' },
    'gold-caption': { text:'#fff8ea', accent:'#f8c25c', secondary:'#ff7a45', deep:'#150d03' },
    'paper-white': { text:'#17130d', accent:'#c2410c', secondary:'#1d4ed8', deep:'#f6f1e6' },
    'minimal-subtitle': { text:'#ffffff', accent:'#ffffff', secondary:'#d4d4d8', deep:'#000000' },
  };
  const palette = palettes[contract.style] || palettes['neon-cyan'];
  const cjk = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP"';
  const fontFamilies = {
    sans:`"Avenir Next","Helvetica Neue",${cjk},system-ui,sans-serif`,
    serif:`Didot,"Bodoni 72","Bodoni MT",${cjk},Georgia,serif`,
    mono:`"SF Mono",Menlo,Monaco,Consolas,${cjk},monospace`,
    display:`"Avenir Next Condensed","DIN Condensed","Arial Narrow",Impact,${cjk},sans-serif`,
    geometric:`Futura,"Avenir Next","Century Gothic",${cjk},sans-serif`,
  };
  const directedThemeFont = centerWordFocus ? fontFamilies.serif
    : orbit || letterWave ? fontFamilies.geometric
      : kineticTypewriter ? fontFamilies.mono
        : burst || hookEcho || squareMosaic || verticalPoster || prismSlam || letterfallTotem ? fontFamilies.display
          : fontFamilies.sans;
  const fontFamily = fontFamilies[contract.fontFamily] || directedThemeFont;
  const customColor = /^#[0-9a-f]{6}$/i.test(String(contract.textColor || '')) ? String(contract.textColor).toLowerCase() : '';
  const text = customColor || palette.text, accent = customColor || palette.accent, secondary = palette.secondary, deep = palette.deep;
  const fontScale = Number.isFinite(Number(contract.fontScale)) ? Math.max(.5,Math.min(2,Number(contract.fontScale))) : 1;
  const validInset = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(.02, Math.min(.35, value)) : fallback;
  const inset = validInset(contract.safeArea?.titleInset ?? profile.safeArea?.titleInset, .08);
  const bottom = validInset(contract.safeArea?.lyricBottom ?? profile.safeArea?.lyricBottom, .1);
  const position = singleWordFocus || squareMosaic ? 'center' : contract.position || 'bottom-center';
  const side = /left|right/.test(position), top = /top|upper/.test(position), center = position === 'center' || position === 'side-right';
  // Every template's panel stays inside the title-safe width.
  const maxWidth = Math.min(width * (1 - 2 * inset), squareMosaic
    ? Math.min(width, height) * .72
    : verticalPoster
      ? Math.min(width * .62, height * .68)
      : prismSlam
        ? width * .9
        : letterfallTotem
          ? Math.min(width * .3, height * .4)
      : width * (singleWordFocus ? .84 : position === 'side-right' ? .5 : side ? .72 : 1-2*inset));
  const fontRatio = centerWordFocus ? .13 : prismSlam ? .15 : letterfallTotem ? .13 : squareMosaic ? .058 : verticalPoster ? .075
    : letterWave ? .08 : kineticTypewriter ? .058 : burst ? .072 : hookEcho ? .068 : orbit ? .05 : .056;
  const fontSize = Math.round(Math.min(width,height)*fontRatio*fontScale);
  const fontWeight = centerWordFocus ? 700 : kineticTypewriter ? 500 : orbit ? 500 : ribbon || templateId === 'plain-phrase-v1' ? 600 : letterWave ? 700 : 800;
  const lineHeight = centerWordFocus ? 1.05 : prismSlam ? .9 : letterfallTotem ? .8 : squareMosaic ? .92 : verticalPoster ? .9
    : letterWave ? 1.12 : burst ? 1.04 : hookEcho ? 1.08 : 1.3;
  const [padY, padX] = ribbon ? [26, 56] : orbit ? [22, 52] : burst ? [10, 14] : hookEcho ? [16, 22] : letterWave ? [34, 40]
    : kineticTypewriter ? [24, 30] : verticalPoster ? [24, 30] : squareMosaic ? [18, 18] : letterfallTotem ? [28, 18] : [0, 0];
  const panel = { position:'absolute', boxSizing:'border-box', width:maxWidth+'px', padding:padY||padX?`${padY}px ${padX}px`:'0',
    font:`${fontWeight} ${fontSize}px/${lineHeight} ${fontFamily}`, color:text, background:'transparent',
    border:'0', borderRadius:'0', boxShadow:'none', textAlign:side ? (/left/.test(position)?'left':'right'):'center',
    textTransform:'none', textRendering:'geometricPrecision', letterSpacing:'0', whiteSpace:'normal', overflowWrap:'anywhere', overflow:'visible',
    left:/left/.test(position)? width*inset+'px':/right/.test(position)?'auto':'50%',
    right:/right/.test(position)?width*inset+'px':'auto',
    top:top?height*inset+'px':center?'50%':'auto', bottom:top||center?'auto':height*bottom+'px',
    transform:`${side?'':'translateX(-50%) '}${center?'translateY(-50%)':''}`.trim() || 'none',
    textShadow:'none', pointerEvents:'none' };
  // Cinema ribbon: a soft band that fades out at both ends, hairline rules and faint scanlines.
  if(ribbon)Object.assign(panel,{background:`linear-gradient(90deg,${accent}00,${accent}b3 50%,${accent}00) top/100% 2px no-repeat,`
    +`linear-gradient(90deg,${accent}00,${accent}66 50%,${accent}00) bottom/100% 1px no-repeat,`
    +`repeating-linear-gradient(0deg,#ffffff00 0 3px,#ffffff0a 3px 4px),`
    +`linear-gradient(90deg,${deep}00,${deep}c4 16%,${deep}d6 50%,${deep}c4 84%,${deep}00)`});
  if(orbit)Object.assign(panel,{background:`${deep}70`,backdropFilter:'blur(18px) saturate(150%)',WebkitBackdropFilter:'blur(18px) saturate(150%)',
    border:`1px solid ${text}30`,borderRadius:'999px',boxShadow:`0 24px 70px #00000073,inset 0 1px 0 ${text}26`});
  if(letterWave)panel.background=`radial-gradient(ellipse at center,${deep}b8 0%,${deep}6b 46%,${deep}00 72%)`;
  if(kineticTypewriter)Object.assign(panel,{background:`linear-gradient(90deg,${deep}f0,${deep}c2 72%,${deep}00)`,borderLeft:`4px solid ${accent}`,textAlign:'left'});
  if(verticalPoster)Object.assign(panel,{borderLeft:`10px solid ${accent}`,textAlign:'left'});
  if(squareMosaic)panel.aspectRatio='1 / 1';
  if(letterfallTotem)panel.background=`linear-gradient(180deg,${deep}00,${deep}9e 18%,${deep}9e 82%,${deep}00)`;
  if(singleWordFocus)Object.assign(panel,{overflowWrap:'normal',whiteSpace:'nowrap'});
  if(prismSlam)panel.textTransform='uppercase';
  // Set last: a later backgroundImage would erase the scrim declared through `background`.
  if(panel.background==='transparent')panel.backgroundImage='none';
  const look = ribbon ? 'ribbon' : orbit ? 'glass' : letterWave ? 'radial' : kineticTypewriter ? 'terminal' : verticalPoster ? 'poster' : letterfallTotem ? 'strip' : 'none';
  const layoutMode = squareMosaic ? 'square-grid' : verticalPoster ? 'poster-stack' : letterfallTotem ? 'glyph-column' : 'flow';
  const letterMotion = letterWave ? 'wave' : kineticTypewriter ? 'typewriter' : prismSlam ? 'prism' : letterfallTotem ? 'letterfall' : 'none';
  const drawPanel = look !== 'none' && look !== 'poster';
  const borderLeft = verticalPoster ? 10 : kineticTypewriter ? 4 : 0;
  return { templateId,width,height,fontSize,text,accent,secondary,deep,background:deep,canvasBackground:drawPanel?deep:'transparent',fontFamily,fontWeight,
    lineHeight,panel,inset,bottom,fixedCenter:singleWordFocus,singleWordOnly:singleWordFocus,drawPanel,look,
    layoutMode,letterMotion,paddingX:padX,paddingY:padY,columnWidth:maxWidth-2*padX-borderLeft,
    borderWidth:orbit?1:0,borderRadius:orbit?999:0 };
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
    return {fontScale,fontSize:`${fontScale}em`,fontWeight:'800',letterSpacing:'.01em',lineHeight:'.9',textTransform:'uppercase',borderRadius:'6px'};
  }
  if(templateId==='vertical-poster-stack-v1'){
    // Each word is sized to fill the poster column, so the stack reads as one typographic block.
    const column=Number(presentation.columnWidth)||Number(presentation.fontSize||1)*8,size=Number(presentation.fontSize)||1;
    const fontScale=Math.round(Math.max(.62,Math.min(1.75,column/(size*length*.56)))*1000)/1000;
    return {fontScale,fontSize:`${fontScale}em`,fontWeight:'800',letterSpacing:'-.012em',lineHeight:'.88',justifyContent:'flex-start',textAlign:'left',textTransform:'uppercase'};
  }
  if(templateId==='prism-slam-v1'){
    const fontScale=Math.max(.55,Math.min(1,10/length));
    return {fontScale,fontSize:`${fontScale}em`,fontWeight:'800',letterSpacing:length<=4?'.03em':'-.02em',lineHeight:'.86',textTransform:'uppercase'};
  }
  if(templateId==='letterfall-totem-v1')return {fontScale:1,fontSize:'1em',fontWeight:'800',letterSpacing:'0',lineHeight:'.8',textTransform:'uppercase'};
  if(templateId==='kinetic-word-burst-v1')return {fontScale:1,fontSize:'1em',fontWeight:'800',letterSpacing:'.012em',lineHeight:'1.04',textTransform:'uppercase'};
  if(templateId==='stacked-hook-echo-v1')return {fontScale:1,fontSize:'1em',fontWeight:'800',letterSpacing:'0',lineHeight:'1.08',textTransform:'uppercase'};
  if(templateId==='letter-wave-v1')return {fontScale:1,fontSize:'1em',fontWeight:'700',letterSpacing:'-.01em',lineHeight:'1.05'};
  if(templateId==='kinetic-typewriter-v1')return {fontScale:1,fontSize:'1em',fontWeight:'500',letterSpacing:'0',lineHeight:'1.2'};
  if(templateId==='orbit-caption-v1')return {fontScale:1,fontSize:'1em',fontWeight:'500',letterSpacing:'.01em',lineHeight:'1.3'};
  return {fontScale:1,fontSize:'1em',fontWeight:String(presentation.fontWeight||600),letterSpacing:'0',lineHeight:String(presentation.lineHeight||1.3)};
}

/** One description of how a word is painted for its karaoke state, consumed by
 * both the DOM surface (as CSS) and the recording canvas, so they cannot drift.
 * States: active (being sung), sung, upcoming, static (phrase-timed line). */
export function echoLyricWordPaint(word = {}, index = 0, presentation = {}, mode = 'word') {
  const templateId=presentation.templateId||'',fs=Number(presentation.fontSize)||56;
  const text=presentation.text||'#ffffff',accent=presentation.accent||text,secondary=presentation.secondary||accent,deep=presentation.deep||'#000000';
  const state=presentation.singleWordOnly?'active':mode==='phrase'?'static':word.active?'active':word.completed?'sung':'upcoming';
  const halo={color:`${deep}e0`,blur:Math.round(fs*.16),offsetY:Math.round(fs*.04)};
  const paint={state,fill:text,opacity:1,stroke:null,highlight:null,tile:null,ghosts:[],glow:null,shadow:halo,underline:false};
  if(templateId==='kinetic-word-burst-v1'){
    if(state==='active')return {...paint,fill:deep,shadow:null,highlight:{color:accent,radius:Math.round(fs*.08),pad:Math.round(fs*.1)}};
    return {...paint,opacity:state==='upcoming'?.58:1,shadow:{color:`${deep}f0`,blur:Math.round(fs*.1),offsetY:Math.round(fs*.06)}};
  }
  if(templateId==='stacked-hook-echo-v1'){
    if(state==='upcoming')return {...paint,opacity:.38};
    const step=state==='active'?.075:.05;
    return {...paint,fill:state==='active'?accent:text,ghosts:[{dx:-fs*step,dy:fs*step,color:`${accent}8c`},{dx:-fs*step*2,dy:fs*step*2,color:`${secondary}55`}]};
  }
  if(templateId==='center-word-focus-v1')return {...paint,glow:{color:`${accent}b3`,blur:Math.round(fs*.42)},shadow:{color:`${deep}d9`,blur:Math.round(fs*.1),offsetY:Math.round(fs*.03)}};
  if(templateId==='square-word-mosaic-v1'){
    if(state==='active')return {...paint,fill:deep,shadow:null,tile:{fill:accent,border:accent,glow:`${accent}55`}};
    if(state==='upcoming')return {...paint,opacity:.72,tile:{fill:`${deep}80`,border:`${text}40`,glow:null}};
    return {...paint,tile:{fill:`${deep}b8`,border:`${text}26`,glow:null}};
  }
  if(templateId==='vertical-poster-stack-v1'){
    if(state==='active')return {...paint,fill:accent};
    if(state==='upcoming')return {...paint,fill:'transparent',stroke:{width:Math.max(2,Math.round(fs*.028)),color:text}};
    return paint;
  }
  if(['letter-wave-v1','kinetic-typewriter-v1','prism-slam-v1','letterfall-totem-v1'].includes(templateId))return paint;
  // Cinema ribbon (default) and glass orbit: quiet upcoming words, a lit current word with a sweeping underline.
  if(state==='active')return {...paint,fill:accent,glow:{color:`${accent}8c`,blur:Math.round(fs*.32)},underline:true};
  if(state==='upcoming')return {...paint,opacity:templateId==='orbit-caption-v1'?.5:.56};
  return paint;
}

export function echoLyricWordPaintCss(paint = {}) {
  const shadows=[...(paint.ghosts||[]).map(g=>`${Math.round(g.dx*10)/10}px ${Math.round(g.dy*10)/10}px 0 ${g.color}`),
    ...(paint.glow?[`0 0 ${paint.glow.blur}px ${paint.glow.color}`]:[]),
    ...(paint.shadow?[`0 ${paint.shadow.offsetY}px ${paint.shadow.blur}px ${paint.shadow.color}`]:[])];
  const css={color:paint.fill||'inherit',textShadow:shadows.length?shadows.join(','):'none',
    WebkitTextStroke:paint.stroke?`${paint.stroke.width}px ${paint.stroke.color}`:'0px transparent',paintOrder:'stroke fill',
    backgroundColor:'transparent',boxShadow:'none',border:'0',borderRadius:'0'};
  if(paint.highlight)Object.assign(css,{backgroundColor:paint.highlight.color,borderRadius:`${paint.highlight.radius}px`,
    boxShadow:`0 0 0 ${paint.highlight.pad}px ${paint.highlight.color},0 ${paint.highlight.pad}px ${paint.highlight.pad*4}px #00000080`});
  if(paint.tile)Object.assign(css,{backgroundColor:paint.tile.fill,border:`2px solid ${paint.tile.border}`,borderRadius:'6px',
    boxShadow:paint.tile.glow?`0 0 0 6px ${paint.tile.glow},0 18px 44px #0000008c`:'0 10px 30px #00000059'});
  return css;
}

// Backwards-compatible CSS view of the word paint for callers that style one word.
export function echoLyricWordDynamicStyle(word = {}, index = 0, presentation = {}, mode = 'word') {
  return echoLyricWordPaintCss(echoLyricWordPaint(word,index,presentation,mode));
}

export function echoLyricGlyphPaint(character = {}, word = {}, index = 0, presentation = {}) {
  const fs=Number(presentation.fontSize)||56,text=presentation.text||'#ffffff',accent=presentation.accent||text;
  const secondary=presentation.secondary||accent,deep=presentation.deep||'#000000';
  const fill=character.colorRole==='accent'?accent:text;
  const halo={color:`${deep}e6`,blur:Math.round(fs*.14),offsetY:Math.round(fs*.05)};
  if(character.shadowRole==='prism')return {fill:text,opacity:1,ghosts:[{dx:-fs*.045,dy:0,color:'#f43f5ecc'},{dx:fs*.045,dy:0,color:`${accent}cc`}],glow:null,shadow:{color:`${deep}e6`,blur:Math.round(fs*.16),offsetY:Math.round(fs*.08)}};
  if(character.shadowRole==='chromatic')return {fill,opacity:1,ghosts:[{dx:-fs*.035,dy:0,color:`${secondary}88`},{dx:fs*.035,dy:0,color:`${accent}88`}],glow:null,shadow:halo};
  if(character.shadowRole==='vertical')return {fill,opacity:1,ghosts:[],glow:{color:`${accent}99`,blur:Math.round(fs*.3)},shadow:halo};
  if(character.shadowRole==='caret')return {fill:accent,opacity:1,ghosts:[],glow:{color:`${accent}99`,blur:Math.round(fs*.25)},shadow:null};
  if(character.colorRole==='muted')return {fill:text,opacity:1,ghosts:[],glow:null,shadow:null};
  return {fill,opacity:1,ghosts:[],glow:null,shadow:halo};
}

export function echoLyricGlyphArtStyle(character = {}, word = {}, index = 0, presentation = {}) {
  const paint=echoLyricGlyphPaint(character,word,index,presentation),css=echoLyricWordPaintCss(paint);
  return {color:css.color,textShadow:css.textShadow,zIndex:String(10+index),mixBlendMode:'normal'};
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
    const doc=element.ownerDocument,stage=doc.createElement('div'),panel=doc.createElement('div'),words=doc.createElement('div');
    stage.dataset.lyricStage='true';panel.dataset.lyricPanel='true';words.dataset.lyricWords='true';
    Object.assign(stage.style,{position:'absolute',left:'0',top:'0',transformOrigin:'0 0',pointerEvents:'none'});
    Object.assign(words.style,{display:'block',position:'relative',overflow:'visible'});
    panel.append(words);stage.append(panel);element.replaceChildren(stage);
    state={stage,panel,words,nodes:[],glyphNodes:[],caretNodes:[],key:'',layouts:new Map(),layoutBuilds:0,layoutHits:0};element.__echoLyricSurface=state;
  }
  if(!Array.isArray(state.glyphNodes))state.glyphNodes=state.nodes.map(()=>[]);
  if(!Array.isArray(state.caretNodes))state.caretNodes=state.nodes.map(()=>null);
  const visible=Boolean(line && frame?.visible && contract.enabled!==false);
  element.style.visibility=visible?'visible':'hidden';state.frame=visible?frame:null;state.line=visible?line:null;state.rows=[];
  if(!visible)return {visible:false};
  const key=JSON.stringify([contract.highlightWords,contract.templateId,contract.style,contract.position,contract.fontFamily,contract.fontScale,contract.textColor,outputProfile.width,outputProfile.height,outputProfile.safeArea,contract.safeArea]);
  if(state.key!==key){state.presentation=echoLyricPresentation(contract,outputProfile);state.key=key;state.layouts.clear();state.contentKey=null;}
  const presentation=state.presentation;
  state.mode=frame.timingPolicy.mode;element.dataset.timingMode=frame.timingPolicy.mode;element.dataset.timingReason=frame.timingPolicy.reason;element.dataset.templateId=frame.templateId;
  const sourceWords=Array.isArray(line.words)?line.words:[],singleWordFocus=Boolean(presentation.singleWordOnly);
  // Every mode lays out one box per word so long phrases wrap inside the panel;
  // a line without word rows is split on whitespace for the same reason.
  const rows=sourceWords.length?frame.words.filter(word=>word.display):String(frame.displayText||line.text||'').split(/\s+/u).filter(Boolean).map((displayText,index)=>({index,displayText,opacity:1,scale:1}));
  state.rows=rows;state.contract=contract;
  // Timing provenance stays in data attributes; production frames never print it.
  element.dataset.timingLabel=frame.timingPolicy.label||'';
  const contentKey=JSON.stringify([line.id,line.start??line.startSeconds,line.end??line.endSeconds,rows.map(w=>[w.index,w.displayText])]);
  if(state.contentKey!==contentKey||state.protection!==protection){
    if(state.protection!==protection)state.layouts.clear();
    state.contentKey=contentKey;state.protection=protection;
    while(state.nodes.length>rows.length){state.nodes.pop().remove();state.glyphNodes.pop();state.caretNodes.pop();}
    while(state.nodes.length<rows.length){const node=element.ownerDocument.createElement('span');node.className='lyric-word';state.words.append(node);state.nodes.push(node);state.glyphNodes.push([]);state.caretNodes.push(null);}
    state.panel.removeAttribute('style');Object.assign(state.panel.style,presentation.panel);
    state.words.removeAttribute('style');Object.assign(state.words.style,echoLyricWordsLayoutStyle(presentation,rows.length));
    Object.assign(state.stage.style,{width:presentation.width+'px',height:presentation.height+'px'});
    state.panel.querySelector?.('[data-testid="echo-lyric-timing-label"]')?.remove();
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
      const hardMinimumFontSize=Math.max(10,Math.round(Math.min(presentation.width,presentation.height)*.014));
      const marginX=presentation.width*presentation.inset,marginY=presentation.height*presentation.inset;
      // Text must stay inside its panel and the panel inside the title-safe frame:
      // no word box may be wider than the text column, no glyph run may overflow
      // its word box, and the whole panel must fit the stage safe area.
      const overflows=()=>{
        const column=state.words.clientWidth||parseFloat(presentation.panel.width)||presentation.width;
        if(state.panel.offsetWidth>presentation.width-2*marginX+1||state.panel.offsetHeight>presentation.height-2*marginY+1)return true;
        // Natural (unclamped) word width against the column; glyph letter-spacing
        // and motion overshoot are not layout overflow, so scrollWidth is not used.
        // Grid tiles are bounded by their own cell, flow words by the text column.
        const limits=state.nodes.map(node=>presentation.layoutMode==='square-grid'?node.clientWidth:column);
        state.nodes.forEach(node=>{node.style.width='max-content';node.style.maxWidth='none';});
        const wide=state.nodes.some((node,index)=>node.offsetWidth>limits[index]+1);
        state.nodes.forEach(node=>{node.style.width='';node.style.maxWidth='100%';});
        return wide;
      };
      state.panel.style.fontSize=fontSize+'px';
      while(overflows()&&fontSize>hardMinimumFontSize){fontSize=Math.max(hardMinimumFontSize,fontSize-2);state.panel.style.fontSize=fontSize+'px';}
      // Measure only when preparing a new phrase/window. Prefer its authored
      // font, then reduce within the readability floor if no clear anchor fits.
      while(!presentation.fixedCenter&&chooseEchoLyricPlacement({presentation,panelHeight:state.panel.offsetHeight,obstacles}).status!=='clear'&&fontSize>minimumFontSize){
        fontSize=Math.max(minimumFontSize,fontSize-2);state.panel.style.fontSize=fontSize+'px';
      }
      // A single token that still cannot fit (e.g. an unspaced CJK line) may break inside itself.
      if(overflows())state.nodes.forEach(node=>Object.assign(node.style,{whiteSpace:'normal',overflowWrap:'anywhere',wordBreak:'break-all'}));
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
    const art=echoLyricWordArtStyle(word,index,rows.length,presentation),paint=echoLyricWordPaint(word,index,presentation,state.mode);
    Object.assign(node.style,{...echoLyricWordPaintCss(paint),opacity:String((word.opacity??1)*(paint.opacity??1)),fontWeight:art.fontWeight||String(presentation.fontWeight||700),
      transform:fitEchoLyricWordMotion(word,state.layout.boxes[index],{x:-20,y:-14,width:state.layout.width+40,height:state.layout.height+28}),
      backgroundImage:paint.underline?`linear-gradient(${presentation.accent},${presentation.accent})`:'none',backgroundRepeat:'no-repeat',backgroundPosition:'left bottom',backgroundSize:paint.underline?`${(word.underlineProgress||0)*100}% 4px`:'0 0'});
    const glyphs=state.glyphNodes[index]||[],glyphBoxes=state.layout.glyphBoxes?.[index]||[];
    for(let glyphIndex=0;glyphIndex<glyphs.length;glyphIndex+=1){const glyph=glyphs[glyphIndex],character=word.characters?.[glyphIndex],box=glyphBoxes[glyphIndex];if(!character||!box)continue;
      Object.assign(glyph.style,echoLyricGlyphArtStyle(character,word,glyphIndex,presentation),{opacity:String((character.opacity??1)*(echoLyricGlyphPaint(character,word,glyphIndex,presentation).opacity??1)),transform:fitEchoLyricWordMotion(character,box,{x:0,y:0,width:state.layout.boxes[index].width,height:state.layout.boxes[index].height})});
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
 * This deliberately consumes the same DOM owner's frame, measured layout and
 * word paint, so capture does not run a second lyric clock or a second style. */
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
  const templateId=String(state.contract?.templateId||''),mode=state.mode||'word';
  const text=presentation.text||'#ffffff',accent=presentation.accent||text,deep=presentation.deep||'#000000';
  const linear=(x0,y0,x1,y1,stops)=>{
    if(typeof context.createLinearGradient!=='function')return stops[Math.floor(stops.length/2)][1];
    const gradient=context.createLinearGradient(x0,y0,x1,y1);for(const [at,color] of stops)gradient.addColorStop(at,color);return gradient;
  };
  const resetShadow=()=>{context.shadowColor='transparent';context.shadowBlur=0;context.shadowOffsetX=0;context.shadowOffsetY=0;};
  context.save();context.scale(scaleX,scaleY);
  const look=presentation.look||(presentation.drawPanel===false||presentation.fixedCenter?'none':'legacy');
  if(panelWidth>0&&panelHeight>0){
    if(look==='ribbon'){
      context.fillStyle=linear(panelX,0,panelX+panelWidth,0,[[0,`${deep}00`],[.16,`${deep}c4`],[.5,`${deep}d6`],[.84,`${deep}c4`],[1,`${deep}00`]]);
      context.fillRect(panelX,panelY,panelWidth,panelHeight);
      context.save();context.globalAlpha=.04;context.fillStyle='#ffffff';for(let y=panelY+3;y<panelY+panelHeight;y+=4)context.fillRect(panelX,y,panelWidth,1);context.restore();
      context.fillStyle=linear(panelX,0,panelX+panelWidth,0,[[0,`${accent}00`],[.5,`${accent}b3`],[1,`${accent}00`]]);context.fillRect(panelX,panelY,panelWidth,2);
      context.fillStyle=linear(panelX,0,panelX+panelWidth,0,[[0,`${accent}00`],[.5,`${accent}66`],[1,`${accent}00`]]);context.fillRect(panelX,panelY+panelHeight-1,panelWidth,1);
    }else if(look==='glass'){
      echoLyricCanvasRoundRect(context,panelX,panelY,panelWidth,panelHeight,panelHeight/2);
      context.fillStyle=`${deep}a6`;context.fill();context.strokeStyle=`${text}30`;context.lineWidth=1;context.stroke();
    }else if(look==='terminal'){
      context.fillStyle=linear(panelX,0,panelX+panelWidth,0,[[0,`${deep}f0`],[.72,`${deep}c2`],[1,`${deep}00`]]);context.fillRect(panelX,panelY,panelWidth,panelHeight);
      context.fillStyle=accent;context.fillRect(panelX,panelY,4,panelHeight);
    }else if(look==='radial'){
      if(typeof context.createRadialGradient==='function'){
        context.save();context.translate(panelX+panelWidth/2,panelY+panelHeight/2);context.scale(1,panelHeight/Math.max(1,panelWidth));
        const gradient=context.createRadialGradient(0,0,0,0,0,panelWidth*.72);
        gradient.addColorStop(0,`${deep}b8`);gradient.addColorStop(.64,`${deep}6b`);gradient.addColorStop(1,`${deep}00`);
        context.fillStyle=gradient;context.fillRect(-panelWidth/2,-panelWidth/2,panelWidth,panelWidth);context.restore();
      }
    }else if(look==='strip'){
      context.fillStyle=linear(0,panelY,0,panelY+panelHeight,[[0,`${deep}00`],[.18,`${deep}9e`],[.82,`${deep}9e`],[1,`${deep}00`]]);context.fillRect(panelX,panelY,panelWidth,panelHeight);
    }else if(look==='poster'){
      context.fillStyle=accent;context.fillRect(panelX,panelY,10,panelHeight);
    }else if(look==='legacy'){
      echoLyricCanvasRoundRect(context,panelX,panelY,panelWidth,panelHeight,presentation.borderRadius||0);
      context.fillStyle=presentation.canvasBackground||presentation.background;context.fill();
      if(presentation.borderWidth>0){context.strokeStyle=`${accent}88`;context.lineWidth=presentation.borderWidth;context.stroke();}
    }
  }
  const drawText=(value,x,y,paint,alpha)=>{
    for(const ghost of paint.ghosts||[]){resetShadow();context.globalAlpha=alpha;context.fillStyle=ghost.color;context.fillText(value,x+ghost.dx,y+ghost.dy);}
    context.globalAlpha=alpha*(Number.isFinite(Number(paint.opacity))?Number(paint.opacity):1);
    const fill=paint.fill&&paint.fill!=='transparent'?paint.fill:null;
    if(paint.glow&&fill){context.shadowColor=paint.glow.color;context.shadowBlur=paint.glow.blur;context.shadowOffsetX=0;context.shadowOffsetY=0;context.fillStyle=fill;context.fillText(value,x,y);}
    if(paint.shadow){context.shadowColor=paint.shadow.color;context.shadowBlur=paint.shadow.blur;context.shadowOffsetX=0;context.shadowOffsetY=paint.shadow.offsetY;}else resetShadow();
    if(paint.stroke&&typeof context.strokeText==='function'){context.lineWidth=paint.stroke.width;context.lineJoin='round';context.strokeStyle=paint.stroke.color;context.strokeText(value,x,y);}
    if(fill){context.fillStyle=fill;context.fillText(value,x,y);}
    resetShadow();
  };
  const area={x:-20,y:-14,width:Number(layout.width||panelWidth)+40,height:Number(layout.height||panelHeight)+28};
  context.textBaseline='middle';context.textAlign='center';
  for(let index=0;index<rows.length;index+=1){
    const row=rows[index],box=layout.boxes?.[index],node=state.nodes?.[index];
    if(!box||!node)continue;
    const art=echoLyricWordArtStyle(row,index,rows.length,presentation),paint=echoLyricWordPaint(row,index,presentation,mode);
    const upper=art.textTransform==='uppercase'||presentation.panel?.textTransform==='uppercase';
    const raw=String(node.textContent||row.displayText||'');if(!raw)continue;
    const label=upper?raw.toLocaleUpperCase():raw;
    const motion=echoLyricWordMotionValues(row,box,area),centerX=wordsX+box.x+box.width/2,centerY=wordsY+box.y+box.height/2;
    const alpha=Number.isFinite(Number(row.opacity))?Number(row.opacity):1,fontPx=layout.fontSize*Number(art.fontScale||1);
    context.save();context.translate(centerX+motion.translateX,centerY+motion.translateY);context.rotate(motion.rotation*Math.PI/180);context.scale(motion.scale,motion.scale);
    context.font=`${art.fontWeight||presentation.fontWeight} ${fontPx}px ${presentation.fontFamily}`;
    if('letterSpacing' in context)context.letterSpacing=`${(parseFloat(art.letterSpacing)||0)*fontPx}px`;
    if(paint.tile){
      context.globalAlpha=alpha*(paint.opacity??1);echoLyricCanvasRoundRect(context,-box.width/2,-box.height/2,box.width,box.height,6);
      context.fillStyle=paint.tile.fill;context.fill();context.strokeStyle=paint.tile.border;context.lineWidth=2;context.stroke();
    }
    if(paint.highlight){
      const pad=paint.highlight.pad;context.globalAlpha=alpha;echoLyricCanvasRoundRect(context,-box.width/2-pad,-box.height/2-pad,box.width+2*pad,box.height+2*pad,paint.highlight.radius+pad);
      context.fillStyle=paint.highlight.color;context.fill();
    }
    const characters=Array.isArray(row.characters)?row.characters:[],glyphBoxes=layout.glyphBoxes?.[index]||[];
    if(characters.length&&glyphBoxes.length===characters.length){
      for(let glyphIndex=0;glyphIndex<characters.length;glyphIndex+=1){const character=characters[glyphIndex],glyphBox=glyphBoxes[glyphIndex];
        const glyphMotion=echoLyricWordMotionValues(character,glyphBox,{x:0,y:0,width:box.width,height:box.height});
        const glyphX=-box.width/2+glyphBox.x+glyphBox.width/2,glyphY=-box.height/2+glyphBox.y+glyphBox.height/2;
        context.save();context.translate(glyphX+glyphMotion.translateX,glyphY+glyphMotion.translateY);context.rotate(glyphMotion.rotation*Math.PI/180);context.scale(glyphMotion.scale,glyphMotion.scale);
        const glyphText=upper?String(character.text||'').toLocaleUpperCase():String(character.text||'');
        drawText(glyphText,0,0,echoLyricGlyphPaint(character,row,glyphIndex,presentation),alpha*(Number.isFinite(Number(character.opacity))?Number(character.opacity):1));
        context.restore();
      }
    }else if(presentation.layoutMode==='poster-stack'){
      // Poster words are left-set inside their full-column box (measurement padding 10px).
      context.textAlign='left';drawText(label,-box.width/2+10,0,paint,alpha);context.textAlign='center';
    }else drawText(label,0,0,paint,alpha);
    if(templateId==='kinetic-typewriter-v1'&&row.active&&glyphBoxes.length){const revealed=Math.max(0,Math.min(glyphBoxes.length,Math.ceil((row.progress||0)*glyphBoxes.length))),caretBox=glyphBoxes[Math.max(0,revealed-1)];
      resetShadow();context.fillStyle=accent;context.globalAlpha=Math.floor((row.progress||0)*glyphBoxes.length*3)%2?.42:1;context.fillRect(-box.width/2+(caretBox?caretBox.x+caretBox.width:0)+3,-box.height/2+(caretBox?.y||0),4,caretBox?.height||box.height);
    }
    const underline=Number(row.underlineProgress||0);
    if(paint.underline&&underline>0){resetShadow();context.globalAlpha=alpha;context.fillStyle=accent;context.fillRect(-box.width/2,box.height/2-4,Math.max(0,Math.min(1,underline))*box.width,4);}
    context.restore();
  }
  const accentCanvas=state.panel?.querySelector?.('[data-echo-lyric-accents]');
  if(accentCanvas&&Number(accentCanvas.width||0)>0&&Number(accentCanvas.height||0)>0){
    context.globalAlpha=1;resetShadow();context.drawImage(accentCanvas,panelX,panelY,panelWidth,panelHeight);
  }
  context.restore();
  return {drawn:true,wordCount:rows.length,templateId:String(state.contract?.templateId||'')};
}

export function echoLyricPresentationBrowserSource() {
  return [echoLyricPresentation,prepareEchoLyricObstacles,chooseEchoLyricPlacement,echoLyricWordMotionValues,fitEchoLyricWordMotion,echoLyricWordArtStyle,echoLyricWordPaint,echoLyricWordPaintCss,echoLyricWordDynamicStyle,echoLyricGlyphPaint,echoLyricGlyphArtStyle,echoLyricWordMeasurementStyle,echoLyricWordsLayoutStyle,echoLyricGlyphMeasurementStyle,echoLyricGlyphMeasurementBox,renderEchoLyricSurface,sizeEchoLyricSurface].map(fn=>fn.toString()).join('\n');
}
