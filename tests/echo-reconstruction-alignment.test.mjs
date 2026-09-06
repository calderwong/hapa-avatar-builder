import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('PCM reconstruction timing measures offsets without inventing sparse, silent or ambiguous role origins',()=>{
 const result=spawnSync(process.env.HAPA_PYTHON||'python3',['scripts/lib/prove-echo-reconstruction-alignment.py'],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr||result.stdout);
 const report=JSON.parse(result.stdout);assert.equal(report.pass,true);assert.equal(report.fixtures,8);
});
