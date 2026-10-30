// Serializable streaming JSON grammar state. Values are not assembled in memory;
// source bytes and JSON-path context remain the evidence, including branch IDs.
function initial() { return { stack:[], root:'value', token:null }; }
function location(s) { return '$'+s.stack.map(f=>f.kind==='array'?`[${f.index}]`:`[${JSON.stringify(f.key||'')}]`).join(''); }
function feed(s,text,final=false) {
 function valueDone(){const f=s.stack.at(-1);if(f){f.state='comma';if(f.kind==='array')f.index++;}else s.root='done';}
 function finishToken(){const t=s.token;s.token=null;if(t.kind==='key'){const f=s.stack.at(-1);f.key=t.value;f.state='colon';}else valueDone();}
 function expected(){return s.stack.at(-1)?.state||s.root;}
 for(let i=0;i<text.length;i++){
  const c=text[i],t=s.token;
  if(t){
   if(t.kind==='string'||t.kind==='key'){
    if(t.unicode){if(!/[0-9a-f]/i.test(c))throw Error('Invalid JSON Unicode escape.');t.escapeText+=c;t.unicode--;if(!t.unicode&&t.kind==='key'){t.value+=String.fromCharCode(parseInt(t.escapeText,16));t.escapeText='';}continue;}
    if(t.escape){t.escape=false;if(c==='u'){t.unicode=4;t.escapeText='';}else{const decoded={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}[c];if(decoded===undefined)throw Error('Invalid JSON escape.');if(t.kind==='key')t.value+=decoded;}continue;}
    if(c==='\\'){t.escape=true;continue;}if(c==='"'){finishToken();continue;}if(c.charCodeAt(0)<32)throw Error('Invalid control character in JSON string.');
    if(t.kind==='key'){t.value+=c;if(t.value.length>1024)throw Error('JSON property name exceeds the bounded parser context.');}continue;
   }
   if(/[\s,\]}]/.test(c)){if(t.kind==='literal'&&!['true','false','null'].includes(t.value)||t.kind==='number'&&!/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(t.value))throw Error('Invalid JSON value.');finishToken();i--;continue;}
   t.value+=c;if(t.value.length>256)throw Error('JSON numeric/literal token exceeds its parser bound.');continue;
  }
  if(/[ \t\r\n]/.test(c))continue;
  const f=s.stack.at(-1),e=expected();
  if(e==='done')throw Error('Extra content after the JSON document.');
  if(e==='colon'){if(c!==':')throw Error('Expected JSON colon.');f.state='value';continue;}
  if(e==='comma'){if(c===','){f.state=f.kind==='object'?'key-required':'value-required';continue;}if(c===(f.kind==='object'?'}':']')){s.stack.pop();valueDone();continue;}throw Error('Expected JSON comma or closing bracket.');}
  if(e==='key'||e==='key-required'){if(c==='}'&&e==='key'){s.stack.pop();valueDone();continue;}if(c!=='"')throw Error('Expected JSON property name.');s.token={kind:'key',value:''};continue;}
  if(c===']'&&f?.kind==='array'&&e==='value'){s.stack.pop();valueDone();continue;}
  if(c==='{'||c==='['){if(s.stack.length>=1024)throw Error('JSON nesting exceeds the bounded parser stack.');s.stack.push(c==='{'?{kind:'object',state:'key',key:''}:{kind:'array',state:'value',index:0});continue;}
  if(c==='"'){s.token={kind:'string'};continue;}
  if(c==='-'||/\d/.test(c)){s.token={kind:'number',value:c};continue;}
  if(/[tfn]/.test(c)){s.token={kind:'literal',value:c};continue;}
  throw Error('Invalid JSON structure.');
 }
 if(final){if(s.token){if(s.token.kind==='number'||s.token.kind==='literal')feed(s,' ',false);else throw Error('Incomplete JSON string.');}if(s.stack.length||s.root!=='done')throw Error('Incomplete JSON document.');}
 return s;
}
module.exports={initial,feed,location};
