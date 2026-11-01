import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCandidateFonts } from './lib/windows-candidate-fonts.mjs';

if (process.platform !== 'win32') throw new Error('Native Windows is required; a cross-build is not execution evidence.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.workspace/tests/windows-candidates');
mkdirSync(output, { recursive: true });
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit', timeout: 120000 });
const compiler = process.env.CXX ?? 'g++';
const fonts = buildCandidateFonts(root, compiler, output, run);
const executable = path.join(output, 'candidate-window-test.exe');
run(compiler, [
  '-std=c++17', '-DINITGUID', '-O2', '-Wall', '-Wextra', '-Werror', '-static',
  path.join(root, 'apps/desktop/ime/windows/candidate_window_test.cpp'), fonts,
  '-o', executable, '-lgdi32', '-ldwrite', '-ld2d1', '-lole32', '-luuid',
]);
run(executable, [output]);
console.log('PASS: native Windows candidate rendering, click identity and focus; installed TSF/editor acceptance is NOT covered.');
