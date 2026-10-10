export const AUDIO_SLOTS=[
 {key:'wav',kind:'master',format:'wav',label:'Full song · WAV'},
 {key:'mp3',kind:'master',format:'mp3',label:'Full song · MP3'},
 {key:'wav_stems',kind:'stem',format:'wav',label:'WAV stems'},
 {key:'mp3_stems',kind:'stem',format:'mp3',label:'MP3 stems'},
];
export const STEM_ROLES=['Vocals','Backing Vocals','Drums','Bass','Guitar','Keyboard','Percussion','Strings','Synth','FX','Brass','Woodwinds'];
export const stemRoleKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function suggestStemRole(filename,roles=STEM_ROLES){
 const name=stemRoleKey(filename.replace(/\.(wav|wave|mp3)$/i,'').replace(/^\d+[-_ .]+/,''));
 // A suggestion only: ambiguous song titles do not silently become role assignments.
 return roles.find(role=>stemRoleKey(role)===name)||'';
}
export function uploadFileError(file,slot,maxBytes=1024*1024*1024){
 if(!new RegExp(slot.format==='wav'?'\\.(wav|wave)$':'\\.mp3$','i').test(file.name))return `Choose ${slot.format.toUpperCase()} files for ${slot.label}.`;
 if(file.size<44)return `${file.name} is empty or too small to be audio.`;
 if(file.size>maxBytes)return `${file.name} exceeds the 1 GiB limit.`;
 return '';
}
export function slotStatus(result,stem=false){
 if(!result)return 'Checking…';
 if(stem&&!result.expected)return 'No stems registered · expected roles unknown';
 if(stem)return `${result.present}/${result.expected} registered roles found`;
 return result.state==='available'?'✓ Found':result.state==='missing'?'Missing':result.state==='unresolved'?'No local file registered':'File needs attention';
}
