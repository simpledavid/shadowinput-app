import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyWindowsPEDependencies} from './lib/windows-pe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const platform=process.platform==='win32'?'windows-amd64':'darwin-arm64';
const directory=path.join(root,'apps/desktop/resources',platform,'keyboard-ranker');
const binary=path.join(directory,`arion-keyboard-ranker${process.platform==='win32'?'.exe':''}`);
const model=path.join(directory,'sentence-model.safetensors');
if(process.platform==='win32')verifyWindowsPEDependencies([binary]);
const processOptions={cwd:directory,windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:16384,
 env:process.platform==='win32'?{...process.env,PATH:path.join(process.env.SystemRoot,'System32')}:process.env};
const request={session:'synthetic',input:'shijie',before:'欢迎来到这个',candidates:[
 {id:'a',text:'时节',source:'sentence',start:0,end:6},
 {id:'b',text:'世界',source:'sentence',start:0,end:6},
]};
const dictionary=structuredClone(request);dictionary.candidates[0].source='phrase';
const partial=structuredClone(request);partial.candidates[1].end=3;
const responses=execFileSync(binary,[model],{...processOptions,input:[request,dictionary,partial].map(r=>JSON.stringify(r)).join('\n')+'\n'}).trim().split('\n').map(line=>JSON.parse(line));
assert.deepEqual(responses,[{ready:true},{pick:'b'},{pick:'a'},{pick:'a'}]);
const malformed=spawnSync(binary,[model],{...processOptions,input:JSON.stringify({...request,before:'x'.repeat(2049)})+'\n'});
assert.equal(malformed.status,1);assert.equal(malformed.stderr.trim(),'KEYBOARD_WORKER_FAILED');
console.log('PASS: real 4M selection, trusted dictionary leader, full-input coverage and bounded rejection');
