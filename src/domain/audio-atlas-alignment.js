// Shared UI/API/CLI request contract for the experimental English aligner.
const alignmentError=(message,statusCode)=>Object.assign(new Error(message),{statusCode});
export function alignmentRequest(value) {
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value)||typeof value.sourceId!=='string'||!/^master$|^stem-[1-9][0-9]*$/.test(value.sourceId)||
    typeof value.text!=='string'||!value.text.trim()||value.text.length>4000||
    typeof value.startSeconds!=='number'||typeof value.endSeconds!=='number'||
    !Number.isFinite(value.startSeconds)||!Number.isFinite(value.endSeconds)||
    value.startSeconds<0||value.endSeconds>1800||value.endSeconds<=value.startSeconds||value.endSeconds-value.startSeconds>30||
    (value.language!==undefined&&value.language!=='English'))throw alignmentError('Alignment needs a source, supplied text (up to 4000 characters), and an English excerpt of 0–30 seconds within the source',422);
  const startInputSample=Math.round(value.startSeconds*16000),endInputSample=Math.round(value.endSeconds*16000);
  if(endInputSample<=startInputSample)throw alignmentError('Alignment excerpt is shorter than one input sample',422);
  return {sourceId:value.sourceId,text:value.text,language:'English',startSeconds:value.startSeconds,endSeconds:value.endSeconds,startInputSample,endInputSample};
}
