import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(process.cwd());
const observatoryRoot = join(repositoryRoot, 'web', 'contract-observatory');
const lockPath = join(observatoryRoot, 'mts-visual-consumer-lock.json');
const hostPath = join(observatoryRoot, 'src', 'visual-host.mjs');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

const expected = {
  schema: 'anum-docs-observatory-mts-visual-consumer-lock/v0.1',
  repository: 'netkeep80/mts_visual',
  commit: '6722702cb4bb6948e890135c85bc9d778c8cd571',
  package: {
    root: '.',
    name: '@mts/visual',
    version: '0.1.0',
    private: true,
    manifest: {
      path: 'package.json',
      gitBlobSha: 'b9285f256696f9c5259909ae993e13815be9677d',
    },
    lockfile: {
      path: 'package-lock.json',
      gitBlobSha: 'dd1800f7a9db83e9555a98268b383871c5f8bbf7',
      lockfileVersion: 3,
    },
    dependencies: {
      three: '0.185.1',
    },
  },
  authority: {
    floatingRefAllowed: false,
    deepSourceImportAllowed: false,
    semanticAcceptanceClaimed: false,
    semanticCoreLockIndependent: true,
  },
};
assert.deepEqual(lock, expected, 'Observatory visual lock must match the accepted standalone authority exactly');

const coreManifest = JSON.parse(readFileSync(join(repositoryRoot, 'ts', 'package.json'), 'utf8'));
const coreDependencies = {
  ...(coreManifest.dependencies ?? {}),
  ...(coreManifest.devDependencies ?? {}),
  ...(coreManifest.peerDependencies ?? {}),
  ...(coreManifest.optionalDependencies ?? {}),
};
assert.equal(Object.hasOwn(coreDependencies, '@mts/visual'), false, '@mts/core must not depend on @mts/visual');

const hostSource = readFileSync(hostPath, 'utf8');
assert.match(hostSource, /from ['"]@mts\/visual['"]/, 'Observatory host must use the public package root');
assert.doesNotMatch(hostSource, /@mts\/visual\/three/, 'browser-neutral Observatory host must not import the Three companion');
assert.doesNotMatch(hostSource, /@mts\/visual\/(?:dist|src)\//, 'Observatory host must not deep-import package sources');
assert.doesNotMatch(hostSource, /packages\/visual/, 'Observatory host must not import the historical in-repo visual seed');

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const scratch = mkdtempSync(join(tmpdir(), 'anum-docs-observatory-visual-'));
const source = join(scratch, 'mts_visual');
const artifacts = join(scratch, 'artifacts');
const consumer = join(scratch, 'consumer');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  run('git', ['init', '--quiet', source], scratch);
  run('git', ['-C', source, 'remote', 'add', 'origin', `https://github.com/${lock.repository}.git`], scratch);
  run('git', ['-C', source, 'fetch', '--quiet', '--depth=1', 'origin', lock.commit], scratch);
  run('git', ['-C', source, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], scratch);
  assert.equal(run('git', ['-C', source, 'rev-parse', 'HEAD'], scratch), lock.commit);

  const packageRoot = resolve(source, lock.package.root);
  assert.equal(run('git', ['-C', source, 'hash-object', lock.package.manifest.path], scratch), lock.package.manifest.gitBlobSha);
  assert.equal(run('git', ['-C', source, 'hash-object', lock.package.lockfile.path], scratch), lock.package.lockfile.gitBlobSha);

  const manifest = JSON.parse(readFileSync(join(packageRoot, lock.package.manifest.path), 'utf8'));
  const packageLock = JSON.parse(readFileSync(join(packageRoot, lock.package.lockfile.path), 'utf8'));
  assert.equal(manifest.name, lock.package.name);
  assert.equal(manifest.version, lock.package.version);
  assert.equal(manifest.private, lock.package.private);
  assert.equal(manifest.dependencies?.three, lock.package.dependencies.three);
  assert.ok(manifest.exports?.['.'], 'browser-neutral package root must be exported');
  assert.ok(manifest.exports?.['./three'], 'Three companion must remain an explicit separate export');
  assert.equal(packageLock.lockfileVersion, lock.package.lockfile.lockfileVersion);

  run(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], packageRoot);
  run(npm, ['run', 'build', '--silent'], packageRoot);
  mkdirSync(artifacts);
  const packed = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', artifacts], packageRoot));
  assert.equal(packed.length, 1, 'npm pack must emit exactly one standalone visual artifact');

  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
    name: 'anum-docs-observatory-visual-smoke',
    private: true,
    type: 'module',
    dependencies: {
      '@mts/visual': `file:${join(artifacts, packed[0].filename)}`,
    },
  }, null, 2)}\n`);
  run(npm, ['install', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund'], consumer);
  copyFileSync(hostPath, join(consumer, 'visual-host.mjs'));
  writeFileSync(join(consumer, 'smoke.mjs'), [
    "import assert from 'node:assert/strict';",
    "import { createObservatoryVisualHost } from './visual-host.mjs';",
    "const input = { links: [{ key: 'R', startKey: 'R', endKey: 'R', label: 'root' }] };",
    "const output = createObservatoryVisualHost(input);",
    "assert.equal(output.links.length, 1);",
    "assert.equal(output.links[0].key, 'R');",
    "assert.notEqual(output, input);",
    "assert.equal(Object.isFrozen(output), true);",
    '',
  ].join('\n'));
  run(process.execPath, ['smoke.mjs'], consumer);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`verified Observatory consumer ${lock.package.name}@${lock.package.version} from ${lock.repository}@${lock.commit}`);
