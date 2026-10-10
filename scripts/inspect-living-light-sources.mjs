#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {readLivingLightSourceEvidence} from '../server/living-light-source-evidence.mjs';
const args=process.argv.slice(2),value=name=>args.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3);
const songId=value('song');if(!songId)throw Error('Usage: node scripts/inspect-living-light-sources.mjs --song=<exact-id> [--format=mp3|wav] [--output=<file>]');
const result=await readLivingLightSourceEvidence({root:path.resolve(import.meta.dirname,'..'),songId,format:value('format')||'mp3'});
if(value('output'))await fs.writeFile(value('output'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
else process.stdout.write(JSON.stringify(result,null,2)+'\n');
