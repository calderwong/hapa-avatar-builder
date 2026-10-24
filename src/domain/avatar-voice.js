export const VOICE_SCHEMA = 'hapa.avatar-voice.v1';
export const VOICE_STYLES = [
  {id:'natural', title:'Natural', direction:'Your everyday speaking voice.', text:'Hello there. It is good to see you. Let’s take a moment, look around, and decide what we would like to create together.'},
  {id:'warm', title:'Warm', direction:'Gentle, friendly, and reassuring.', text:'You have time to figure this out. Take a slow breath. I am here with you, and we can work through it one step at a time.'},
  {id:'excited', title:'Excited', direction:'Bright and enthusiastic without shouting.', text:'Oh, that worked! Look at what we just made. I have another idea, and I cannot wait to try it with you.'},
  {id:'serious', title:'Serious', direction:'Clear, steady, and deliberate.', text:'There is something important we need to discuss. Let us check the details carefully and make a decision we can stand behind.'},
  {id:'storytelling', title:'Storytelling', direction:'Expressive, with a little space between thoughts.', text:'At the edge of the forest, a small light appeared. Nobody knew who had left it there, but someone was about to find out.'},
];
export function voiceText(value, name, max=800) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>max) throw new Error(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
export function voiceStyle(value) {
  if(!VOICE_STYLES.some(s=>s.id===value)) throw new Error('Choose a supported voice style.');
  return value;
}
export function starterVoiceScripts(name, style) {
  return [
    {title:'Meet the Avatar',text:`Hi, I’m ${name}. It’s good to meet you. What would you like to make together?`,style,expression:'smile',gesture:'rest',turn:0},
    {title:'A little encouragement',text:'That is a good start. Let’s try one small change and see how it feels.',style,expression:'smile',gesture:'thumbs-up',turn:0.12},
  ];
}
export function validateVoiceScript(input) {
  const expression=input.expression||'neutral',gesture=input.gesture||'rest',turn=Number(input.turn||0),wink=input.wink||'none';
  if(/[\x00-\x08\x0b-\x1f]|\[\[|\]\]|[<>*]|\p{Extended_Pictographic}/u.test(input.text||''))throw new Error('Use plain spoken text without emoji, markup, or stage directions.');
  if(!['none','left','right'].includes(wink))throw new Error('Unsupported Avatar wink.');
  if(!['neutral','smile','concern','surprise'].includes(expression)||!['rest','pinch','thumbs-up','emphasis'].includes(gesture)||!Number.isFinite(turn)||Math.abs(turn)>.6) throw new Error('Unsupported Avatar performance direction.');
  return {title:voiceText(input.title,'Script title',120),text:voiceText(input.text,'Script',420),style:voiceStyle(input.style||'natural'),expression,gesture,turn,wink};
}

// Coverage is saved reference availability, not a subjective quality score.
export function voiceStyleCoverage(cards=[]) {
  const counts=Object.fromEntries(VOICE_STYLES.map(s=>[s.id,cards.filter(c=>c.style===s.id&&!c.deletedAt&&!c.archived&&c.custodyState==='verified').length]));
  const complete=Object.values(counts).filter(n=>n>0).length;
  return {counts,complete,percent:Math.round(100*complete/VOICE_STYLES.length)};
}
