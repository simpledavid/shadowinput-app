// Explicit real-model/native smoke; ordinary checks never download weights.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildIMETypingFixture} from './lib/build-ime-typing-fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='darwin')throw new Error('The IMK fixture requires macOS; run worker and Windows HTTP tests on Windows.');
const temporary=mkdtempSync(path.join(os.tmpdir(),'shadowinput-ranking-'));
try {
 const fixture=buildIMETypingFixture({root,outputDir:temporary,arch:'arm64',fixture:'tests/shadow_ranker_test.mm',defines:['SHADOWINPUT_IME']});
 const runtime=path.join(root,'apps/desktop/resources/darwin-arm64/keyboard-ranker');
 execFileSync('go',['test','-race','./apps/desktop/infrastructure/inputcandidate','-run','TestNativeRankingLoopback','-v','-count=1'],{cwd:root,stdio:'inherit',env:{...process.env,
 SHADOWINPUT_RANKING_NATIVE_FIXTURE:fixture,SHADOWINPUT_RANKING_RIME_DATA:path.join(root,'apps/desktop/resources/darwin/keyboard/data'),
 ARION_TEST_KEYBOARD_BINARY:path.join(runtime,'arion-keyboard-ranker'),ARION_TEST_KEYBOARD_MODEL:path.join(runtime,'sentence-model.safetensors')}});
}finally{rmSync(temporary,{recursive:true,force:true});}
