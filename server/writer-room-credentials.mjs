import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function readWriterPrivateFile(file, maxBytes=4096) {
  if(typeof file!=='string'||!path.isAbsolute(file))throw new Error('Private Writer’s Room configuration requires an absolute path.');
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const info=await handle.stat();
    if(!info.isFile() || (info.mode & 0o777)!==0o600 || info.uid!==process.getuid() || info.size>maxBytes)throw new Error('Private Writer’s Room file must be a bounded owner-only regular file.');
    const buffer=Buffer.alloc(maxBytes+1);let size=0;
    while(size<buffer.length){const part=await handle.read(buffer,size,buffer.length-size,null);if(!part.bytesRead)break;size+=part.bytesRead;}
    if(size>maxBytes)throw new Error('Private Writer’s Room file exceeds its limit.');
    return buffer.subarray(0,size).toString('utf8');
  }finally{await handle.close();}
}
export async function loadWriterApiToken({env=process.env,configPath}={}) {
  if(env.HAPA_WRITER_ROOM_ADMIN_TOKEN){if(Buffer.byteLength(env.HAPA_WRITER_ROOM_ADMIN_TOKEN)>4096)throw new Error('API credential exceeds its limit.');return env.HAPA_WRITER_ROOM_ADMIN_TOKEN;}
  const location=configPath||env.HAPA_WRITER_ROOM_CONFIG||path.join(os.homedir(),'.hapa-second-brain/writers-room-characters/service.json');
  const config=JSON.parse(await readWriterPrivateFile(location,4096));
  const token=(await readWriterPrivateFile(config.apiTokenFile,4096)).trim();
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(token))throw new Error('Writer’s Room API credential has an invalid shape.');
  return token;
}
