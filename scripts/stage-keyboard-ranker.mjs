// Build the pinned local worker with digest-verified 4M Pinyin weights.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, readdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pinnedFile } from './lib/pinned-file.mjs';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2] ?? `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch === 'x64' ? 'amd64' : process.arch}`;
if (!['darwin-arm64', 'windows-amd64'].includes(platform)) throw new Error(`Unsupported keyboard runtime platform: ${platform}`);
const source = path.join(root, 'apps/desktop/runtime/keyboard-ranker');
const target = path.join(root, '.workspace/keyboard-ranker-build');
const triples = { 'darwin-arm64': 'aarch64-apple-darwin', 'windows-amd64': 'x86_64-pc-windows-gnu' };
const triple = triples[platform];
execFileSync('cargo', ['+1.90.0', 'build', '--release', '--locked', '--target', triple, '--manifest-path', path.join(source, 'Cargo.toml'), '--target-dir', target], { cwd: root, stdio: 'inherit', env: { ...process.env, ...(platform === 'windows-amd64' ? { CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER: process.env.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER ?? (process.platform === 'win32' ? 'gcc' : 'x86_64-w64-mingw32-gcc'), RUSTFLAGS: [process.env.RUSTFLAGS, '-C target-feature=+crt-static'].filter(Boolean).join(' ') } : {}) } });
const destination = path.join(root, 'apps/desktop/resources', platform, 'keyboard-ranker');
rmSync(destination, { recursive: true, force: true });
mkdirSync(path.join(destination, 'licenses'), { recursive: true });
const binary = `arion-keyboard-ranker${platform === 'windows-amd64' ? '.exe' : ''}`;
copyFileSync(path.join(target, triple, 'release', binary), path.join(destination, binary));
const catalog = JSON.parse(readFileSync(path.join(root, 'models/catalog.json'), 'utf8'));
const model = catalog.keyboardRankers.find(model => model.id === 'chinese-ime-lm-4m-int8');
if (!model) throw new Error('Missing pinned keyboard model');
for (const [name, spec] of Object.entries(model.files)) copyFileSync(pinnedFile(spec), path.join(destination, name));

for (const name of ['LICENSE', 'NOTICE']) copyFileSync(path.join(source, name), path.join(destination, 'licenses', `chinese-ime-lm-${name}`));

const metadata = JSON.parse(execFileSync('cargo', ['+1.90.0', 'metadata', '--locked', '--format-version', '1', '--manifest-path', path.join(source, 'Cargo.toml')], { cwd: root, encoding: 'utf8' }));
const notices = [];
for (const pkg of metadata.packages.filter(pkg => pkg.source)) {
  const directory = path.dirname(pkg.manifest_path);
  const licenses = readdirSync(directory).filter(name => /^(LICENSE|LICENCE|COPYING|NOTICE)([.-].*)?$/i.test(name));
  if (!licenses.length) throw new Error(`Missing license for ${pkg.name}@${pkg.version}`);
  const folder = `${pkg.name}-${pkg.version}`;
  mkdirSync(path.join(destination, 'licenses', folder), { recursive: true });
  for (const name of licenses) copyFileSync(path.join(directory, name), path.join(destination, 'licenses', folder, name));
  notices.push({ name: pkg.name, version: pkg.version, license: pkg.license, files: licenses.map(name => `${folder}/${name}`) });
}
writeFileSync(path.join(destination, 'licenses', 'cargo-modules.json'), `${JSON.stringify(notices, null, 2)}\n`);
