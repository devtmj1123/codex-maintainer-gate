import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFindings,
  classifyChangedPath,
  decide,
  discoverChecks,
  isCommittedSecretPath,
  parseArgs,
} from '../scripts/preflight.mjs';

test('discovers only repository-provided standard scripts', () => {
  const checks = discoverChecks({ scripts: { lint: 'eslint .', test: 'node --test', custom: 'echo hi' } });
  assert.deepEqual(
    checks.map(({ name, available }) => [name, available]),
    [
      ['type-check', false],
      ['lint', true],
      ['format:check', false],
      ['test', true],
      ['build', false],
    ],
  );
});

test('classifies security-sensitive paths without treating ordinary files as sensitive', () => {
  assert.deepEqual(classifyChangedPath('src/auth/session.ts').areas, ['AUTHENTICATION']);
  assert.ok(classifyChangedPath('src/admin/users/route.ts').areas.includes('ADMIN'));
  assert.ok(classifyChangedPath('src/admin/users/route.ts').areas.includes('API'));
  assert.ok(classifyChangedPath('package-lock.json').areas.includes('DEPENDENCIES'));
  assert.deepEqual(classifyChangedPath('src/components/Button.tsx').areas, []);
});

test('detects secret-bearing paths while allowing environment templates', () => {
  assert.equal(isCommittedSecretPath('.env'), true);
  assert.equal(isCommittedSecretPath('.env.production'), true);
  assert.equal(isCommittedSecretPath('certs/server.key'), true);
  assert.equal(isCommittedSecretPath('.env.example'), false);
  assert.equal(isCommittedSecretPath('docs/env.md'), false);
});

test('decision fails closed on any blocker', () => {
  assert.equal(decide([{ severity: 'PASS' }]), 'READY');
  assert.equal(decide([{ severity: 'WARNING' }]), 'READY_WITH_WARNINGS');
  assert.equal(decide([{ severity: 'WARNING' }, { severity: 'BLOCKER' }]), 'BLOCKED');
});

test('missing tests remain visible as a warning rather than PASS', () => {
  const checks = [
    { name: 'lint', available: true, result: { ok: true } },
    { name: 'test', available: false, result: null },
  ];
  const findings = buildFindings({ checks, changedFiles: ['src/index.js'], securityFiles: [], secretPaths: [], secretMarkers: [] });
  assert.ok(findings.some((finding) => finding.code === 'TEST_COVERAGE_NOT_AVAILABLE' && finding.severity === 'WARNING'));
  assert.equal(decide(findings), 'READY_WITH_WARNINGS');
});

test('failed available check is a blocker', () => {
  const checks = [
    { name: 'test', available: true, result: { ok: false } },
  ];
  const findings = buildFindings({ checks, changedFiles: ['src/index.js'], securityFiles: [], secretPaths: [], secretMarkers: [] });
  assert.ok(findings.some((finding) => finding.code === 'MANDATORY_CHECK_FAILED' && finding.severity === 'BLOCKER'));
  assert.equal(decide(findings), 'BLOCKED');
});

test('parseArgs resolves repo and output while preserving base', () => {
  const parsed = parseArgs(['--repo', '.', '--base', 'origin/main', '--output', 'evidence/report.json', '--no-write']);
  assert.equal(parsed.base, 'origin/main');
  assert.equal(parsed.noWrite, true);
  assert.ok(parsed.output.endsWith('evidence/report.json') || parsed.output.endsWith('evidence\\report.json'));
});
