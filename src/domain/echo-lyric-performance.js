// Recognition evidence locates passages; forced alignment alone cannot prove words were sung.
const COMMON = new Set('a an and are as at be but by for from go i in is it me my of on or our so that the their them there these they this to was we were will with you your'.split(' '));
export function echoLyricLexemes(text) {
  return (String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).map(s => s.replace(/['’]/g, ''));
}
export function echoLyricPerformanceMap(lines, transcriptWords) {
  const tokens = lines.flatMap((text, line) => echoLyricLexemes(text).map((norm,lineTokenIndex) => ({norm, line, lineTokenIndex})));
  const words = transcriptWords.flatMap((word, index) => echoLyricLexemes(word.text ?? word.word).map(norm => ({...word, norm, index})));
  // Distinctive words outweigh coincidences such as "the" and "go". Occurrences are consumed once.
  const weight = norm => COMMON.has(norm) ? 1 : 4;
  const n=tokens.length, m=words.length;
  const dp=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--) dp[i][j]=Math.max(dp[i+1][j],dp[i][j+1],tokens[i].norm===words[j].norm?weight(tokens[i].norm)+dp[i+1][j+1]:0);
  const pairs=[];let i=0,j=0;
  while(i<n&&j<m){
    if(tokens[i].norm===words[j].norm&&dp[i][j]===weight(tokens[i].norm)+dp[i+1][j+1]){pairs.push([i++,j++]);}
    else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;
  }
  const exactPairs=[...pairs], variants=new Set();
  const nearSpelling=(a,b)=>{
    if(a===b||COMMON.has(a)||COMMON.has(b)||Math.min(a.length,b.length)<4||a[0]!==b[0]||Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
    return edits+(i<a.length||j<b.length?1:0)===1;
  };
  const bounds=[[-1,-1],...exactPairs,[n,m]];
  for(let k=1;k<bounds.length;k++){
    const [pt,pw]=bounds[k-1],[nt,nw]=bounds[k],count=nt-pt-1;
    if(count<1||count>2||nw-pw-1!==count)continue;
    const proposals=[];
    for(let offset=1;offset<=count;offset++){
      const t=pt+offset,w=pw+offset,line=tokens[t].line;
      const distinctiveNeighbor=[pt,nt].some(x=>x>=0&&x<n&&tokens[x].line===line&&!COMMON.has(tokens[x].norm));
      if(!distinctiveNeighbor||!nearSpelling(tokens[t].norm,words[w].norm)||words[w].end-words[w].start>5)break;
      proposals.push([t,w]);
    }
    if(proposals.length===count)for(const pair of proposals){pairs.push(pair);variants.add(pair[0]);}
  }
  pairs.sort((a,b)=>a[0]-b[0]);
  const mapped=lines.map((text,line)=>({line,text,tokenCount:echoLyricLexemes(text).length,matches:[]}));
  for(const [t,w] of pairs) mapped[tokens[t].line].matches.push({token:tokens[t].norm,recognizedToken:words[w].norm,matchKind:variants.has(t)?'local-spelling-variant':'exact',lineTokenIndex:tokens[t].lineTokenIndex,transcriptIndex:words[w].index,start:words[w].start,end:words[w].end});
  for(const row of mapped){
    row.coverage=row.tokenCount?row.matches.length/row.tokenCount:0;
    row.distinctiveMatches=row.matches.filter(w=>!COMMON.has(w.token)).length;
    row.supported=row.tokenCount>0 && row.coverage>=.45 && (row.distinctiveMatches>=2 || (row.distinctiveMatches>=1 && row.matches.length>=2 && row.coverage>=.6) || row.coverage===1);
    row.start=row.supported?row.matches[0].start:null;
    row.end=row.supported?row.matches.at(-1).end:null;
    row.reason=row.supported?'distinctive-monotonic-transcript-evidence':'insufficient-performance-evidence';
  }
  const passages=[];
  for(let k=0;k<mapped.length;){
    if(mapped[k].supported){k++;continue;}
    const first=k;while(k+1<mapped.length&&!mapped[k+1].supported)k++;
    passages.push({firstLine:first,lastLine:k,lineCount:k-first+1,tokenCount:mapped.slice(first,k+1).reduce((n,r)=>n+r.tokenCount,0),reason:'recognition-gap-not-proof-of-absence'});k++;
  }
  return {schemaVersion:'hapa.echo.lyric-performance-map.v1',policy:'distinctive-monotonic-v1',lines:mapped,passages,supportedLines:mapped.filter(r=>r.supported).length};
}

export function echoLyricAlignmentWindows(lines, mapping, duration) {
  const spans=mapping.lines.map(r=>r.supported?[r.start,r.end]:null);
  // Allocate a missing run as a run; never repeatedly consume the same whole gap.
  for(let i=0;i<spans.length;){
    if(spans[i]){i++;continue;}
    const first=i;while(i+1<spans.length&&!spans[i+1])i++;
    const start=spans[first-1]?.[1]??0,end=spans[i+1]?.[0]??duration,total=lines.slice(first,i+1).reduce((n,l)=>n+Math.max(1,l.length),0);
    let cursor=start;
    for(let k=first;k<=i;k++){const next=cursor+(end-start)*Math.max(1,lines[k].length)/total;spans[k]=[cursor,next];cursor=next;}i++;
  }
  const windows=[];
  for(const [line,[start,end]] of spans.entries()){
    const s=Math.max(0,start-1),e=Math.min(duration,end+1);
    // Clipping a long supplied passage silently loses its ending. Hold it instead.
    if(e-s>30||e<=s)throw Error(`Unresolved lyric window on line ${line+1}: ${Math.round((e-s)*100)/100}s; needs passage review`);
    const previous=windows.at(-1);
    if(previous&&e-previous.startSeconds<=29.5){previous.endSeconds=Math.max(previous.endSeconds,e);previous.lines.push(line);}
    else windows.push({startSeconds:s,endSeconds:e,lines:[line]});
  }
  return windows.map(w=>({...w,startSeconds:Math.floor(w.startSeconds*100)/100,endSeconds:Math.min(duration,Math.ceil(w.endSeconds*100)/100),text:w.lines.map(i=>lines[i]).join('\n'),state:'planned',runId:null}));
}

export function inspectEchoLyricPassages(timing) {
  const reasons=[],lines=timing.lines||[];
  // Enforce locally, even when aggregate confidence is high. Never reinterpret a gap as omission.
  const unresolved=[];
  for(const [index,line] of lines.entries()){
    const review=line.alignmentReview;
    const supported=timing.provenance?.measurementKind==='transcript-timestamps' ? review?.performanceSupported===true && review.performanceCoverage>=.45 : Number.isFinite(review?.modelAgreementRatio) && review.modelAgreementRatio>=.4;
    if(!supported || !line.words?.some(w=>w.matched))unresolved.push(index);
    if((line.words?.length||0)/(Number(line.end)-Number(line.start))>12)reasons.push('compressed-lyric-line');
  }
  if(unresolved.length)reasons.push('unresolved-lyric-passages');
  if((timing.provenance?.timingOmissions||[]).length)reasons.push('written-lyrics-omitted');
  return {accepted:reasons.length===0,reasons:[...new Set(reasons)],unresolvedLines:unresolved};
}

// Compare corresponding written tokens, not only the first word: ASR can absorb preceding silence.
export function echoLyricComparePerformanceMaps(primary, alternate, {preferPrimary=false,corroboratingWords=[]}={}) {
  const conflicts=[],repairs=[];
  const lines=primary.lines.map((row,i)=>{
    const alt=alternate.lines[i], a=new Map(row.matches.map(w=>[w.lineTokenIndex,w])),b=new Map(alt.matches.map(w=>[w.lineTokenIndex,w]));
    const common=row.matches.filter(w=>b.get(w.lineTokenIndex)?.token===w.token);
    const residuals=common.map(w=>Math.abs(w.start-b.get(w.lineTokenIndex).start)).sort((a,b)=>a-b);
    const median=residuals.length?residuals[Math.floor(residuals.length/2)]:null;
    let conflict=row.supported&&alt.supported&&median!==null&&median>2,corroboratedChoice=null;
    if(conflict&&corroboratingWords.length){
      const support=r=>r.matches.filter(w=>corroboratingWords.some(c=>c.lineText===r.text&&c.token===w.token&&Math.abs(c.start-w.start)<=1)).length;
      const needed=Math.min(2,row.tokenCount),p=support(row)>=needed,a=support(alt)>=needed;
      if(p!==a){corroboratedChoice=a?'alternate':'primary';conflict=false;}
    }
    if(conflict)conflicts.push(i);
    const chooseAlternate=corroboratedChoice?corroboratedChoice==='alternate':!preferPrimary&&alt.coverage>row.coverage,chosen=chooseAlternate?alt:row,peers=chooseAlternate?a:b;
    const stable=common.filter(w=>Math.abs(w.start-b.get(w.lineTokenIndex).start)<=.7).length;
    const matches=chosen.matches.map(w=>{
      const peer=peers.get(w.lineTokenIndex);
      if(stable>=2&&stable>=common.length*2/3&&peer?.token===w.token&&Math.abs(w.start-peer.start)>1&&Math.abs(w.end-peer.end)<=.35&&(peer.end-peer.start)<(w.end-w.start)*.5){
        repairs.push({line:i,tokenIndex:w.lineTokenIndex,token:w.token,oldStart:w.start,newStart:peer.start,oldEnd:w.end,newEnd:peer.end,reason:'cross-source-leading-silence-boundary'});
        return {...peer,boundaryFromAlternate:!chooseAlternate};
      }
      return {...w};
    });
    return {...chosen,matches,sourceChoice:chooseAlternate?'alternate':'primary',conflictResolution:corroboratedChoice?'existing-qwen-and-recognizer-agreement':null,supported:chosen.supported&&!conflict,start:chosen.supported?matches[0]?.start:null,end:chosen.supported?matches.at(-1)?.end:null,reason:conflict?'cross-source-passage-time-disagreement':chosen.reason};
  });
  return {...primary,lines,supportedLines:lines.filter(l=>l.supported).length,conflictingLines:conflicts,boundaryRepairs:repairs};
}
