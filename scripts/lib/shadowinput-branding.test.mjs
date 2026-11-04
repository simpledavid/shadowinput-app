import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {brandInputSource} from './shadowinput-branding.mjs';
const native = new URL('../../apps/desktop/ime/windows/', import.meta.url);
test('Windows identity and both localized input-menu actions use shadowinput', () => {
 const identity=brandInputSource(readFileSync(new URL('identity.h',native),'utf8'));
 assert.match(identity,/ArionName\[\] = L"shadowinput"/);
 const copy=brandInputSource(readFileSync(new URL('native_copy.h',native),'utf8'));
 for(const label of ['Open shadowinput','Could not open shadowinput','打开 shadowinput','无法打开 shadowinput'])assert.ok(copy.includes(label),`missing product label: ${label}`);
 assert.doesNotMatch(copy, /Arion/);
});
test('branding keeps library names, provenance and owned registration isolation', () => {
 const source='L"Arion" L"ArionKeyboard.dll" // Based on AstraFoundry/Arion\n L"arion://open"';
 const result=brandInputSource(source);
 assert.match(result,/L"shadowinput"/);
 assert.match(result,/L"shadowinput:\/\/open"/);
 assert.match(result,/ArionKeyboard\.dll/);
 assert.match(result,/Based on AstraFoundry\/Arion/);
 assert.equal(brandInputSource(result),result);
});
