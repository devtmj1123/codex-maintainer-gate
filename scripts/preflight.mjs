#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TOOL_VERSION = '0.1.0';
const CHECK_ORDER = ['type-check', 'lint', 'format:check', 'test', 'build'];
const OUTPUT_LIMIT = 12000;

const SECURITY_RULES = [
  ['AUTHENTICATION', /(^|\/)(auth|authentication|login|session|sessions)(\/|\.|$)/i],
  ['AUTHORIZATION', /(^|\/)(rbac|acl|permission|permissions|authorization|roles?)(\/|\.|$)/i],
  ['ADMIN', /(^|\/)admin(\/|\.|$)/i],
  ['API', /(^|\/)(api|routes?)(\/|\.|$)/i],
  ['UPLOAD', /(^|\/)(upload|uploads|storage|files?)(\/|\.|$)/i],
  ['SECRETS_ENV', /(^|\/)(\.env[^/]*|secrets?|credentials?)(\/|\.|$)/i],
  ['DEPENDENCIES', /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/i],
  ['CI_RELEASE', /(^|\/)(\.github\/workflows|release|releases|deploy|deployment)(\/|\.|$)/i],
];

function truncate(value) {
  const text = String(value ?? '');
  if (text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(0, OUTPUT_LIMIT)}\n...[truncated ${text.length - OUTPUT_LIMIT} characters]`;
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: options.timeout ?? 600000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, ...(options.env ?? {}) },
  });

  return {
    command: [command, ...args].join(' '),
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message || result.error) : null,
    stdout: truncate(result.stdout),
    stderr: truncate(result.stderr),
    ok: result.status === 0 && !result.error,
  };
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function parseArgs(argv) {
  const result = { repo: process.cwd(), output: 'maintainer-gate-report.json', base: null, noWrite: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') result.repo = argv[++i];
    else if (arg === '--output') result.output = argv[++i];
    else if (arg === '--base') result.base = argv[++i];
    else if (arg === '--no-write') result.noWrite = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  result.repo = path.resolve(result.repo);
  if (!path.isAbsolute(result.output)) result.output = path.resolve(result.repo, result.output);
  return result;
}

export function discoverChecks(packageJson) {
  const scripts = packageJson?.scripts ?? {};
  return CHECK_ORDER.map((name) => ({ name, available: typeof scripts[name] === 'string' && scripts[name].trim() !== '' }));
}

export function classifyChangedPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const areas = SECURITY_RULES.filter(([, regex]) => regex.test(normalized)).map(([area]) => area);
  return { path: normalized, areas };
}

export function isCommittedSecretPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  const base = path.posix.basename(normalized);
  if (['.env.example', '.env.sample', '.env.template'].includes(base)) return false;
  if (base === '.env' || base.startsWith('.env.')) return true;
  if (base === 'id_rsa' || base === 'id_ed25519') return true;
  if (base.endsWith('.pem') || base.endsWith('.key') || base === 'credentials.json') return true;
  return false;
}

export function decide(findings) {
  if (findings.some((finding) => finding.severity === 'BLOCKER')) return 'BLOCKED';
  if (findings.some((finding) => finding.severity === 'WARNING')) return 'READY_WITH_WARNINGS';
  return 'READY';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function gitHead(repo) {
  const result = run('git', ['rev-parse', 'HEAD'], repo, { timeout: 30000 });
  return result.ok ? result.stdout.trim() : null;
}

function gitChangedFiles(repo, requestedBase) {
  const attempts = [];
  const candidates = [];

  if (requestedBase) candidates.push(requestedBase);
  if (process.env.GITHUB_BASE_REF) {
    candidates.push(`origin/${process.env.GITHUB_BASE_REF}`);
    candidates.push(process.env.GITHUB_BASE_REF);
  }

  for (const base of [...new Set(candidates)]) {
    for (const separator of ['...', '..']) {
      const result = run('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', `${base}${separator}HEAD`], repo, { timeout: 30000 });
      attempts.push({ base, separator, ok: result.ok, stderr: result.stderr });
      if (result.ok) {
        return {
          base,
          mode: separator === '...' ? 'merge-base' : 'direct',
          files: result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
          attempts,
        };
      }
    }
  }

  let result = run('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD~1..HEAD'], repo, { timeout: 30000 });
  if (result.ok) {
    return {
      base: 'HEAD~1',
      mode: 'previous-commit',
      files: result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      attempts,
    };
  }

  result = run('git', ['ls-files'], repo, { timeout: 30000 });
  if (result.ok) {
    return {
      base: null,
      mode: 'all-tracked-files',
      files: result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      attempts,
    };
  }

  return { base: null, mode: 'unavailable', files: [], attempts };
}

function scanStrongSecretMarkers(repo, changedFiles) {
  const matches = [];
  const patterns = [
    ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['OPENAI_KEY', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['GITHUB_TOKEN', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
    ['AWS_ACCESS_KEY', /\bAKIA[0-9A-Z]{16}\b/],
  ];

  for (const relativePath of changedFiles) {
    const fullPath = path.join(repo, relativePath);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > 1024 * 1024) continue;

    let text;
    try {
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    for (const [kind, regex] of patterns) {
      if (regex.test(text)) matches.push({ path: relativePath.replaceAll('\\', '/'), kind });
    }
  }

  return matches;
}

export function buildFindings({ checks, changedFiles, securityFiles, secretPaths, secretMarkers }) {
  const findings = [];

  for (const check of checks) {
    if (!check.available) {
      if (check.name === 'test') {
        findings.push({
          severity: 'WARNING',
          code: 'TEST_COVERAGE_NOT_AVAILABLE',
          message: 'No dedicated npm test script was discovered; automated test coverage was not proven.',
        });
      }
      continue;
    }

    if (check.result && !check.result.ok) {
      findings.push({
        severity: 'BLOCKER',
        code: 'MANDATORY_CHECK_FAILED',
        check: check.name,
        message: `npm script ${check.name} failed or could not execute.`,
      });
    }
  }

  if (securityFiles.length > 0) {
    findings.push({
      severity: 'WARNING',
      code: 'SECURITY_SENSITIVE_CHANGE',
      message: 'One or more changed paths touch security-sensitive or release-sensitive boundaries and require maintainer review.',
      paths: securityFiles.map((item) => item.path),
    });
  }

  for (const filePath of secretPaths) {
    findings.push({
      severity: 'BLOCKER',
      code: 'COMMITTED_SECRET_PATH',
      message: `Potential secret-bearing file is tracked: ${filePath}`,
      path: filePath,
    });
  }

  for (const marker of secretMarkers) {
    findings.push({
      severity: 'BLOCKER',
      code: 'STRONG_SECRET_MARKER_DETECTED',
      message: `A strong credential/private-key marker was detected in ${marker.path}. Verify and remove the secret before release.`,
      path: marker.path,
      marker: marker.kind,
    });
  }

  if (changedFiles.length === 0) {
    findings.push({
      severity: 'WARNING',
      code: 'NO_CHANGED_FILES_IDENTIFIED',
      message: 'The gate could not identify a changed-file set; security-sensitive path review may be incomplete.',
    });
  }

  if (!findings.some((finding) => finding.severity === 'BLOCKER' || finding.severity === 'WARNING')) {
    findings.push({ severity: 'PASS', code: 'NO_BLOCKERS_OR_WARNINGS', message: 'No blockers or warnings were identified.' });
  }

  return findings;
}

export function runGate(options) {
  const repo = path.resolve(options.repo);
  const packagePath = path.join(repo, 'package.json');
  const findings = [];

  if (!fs.existsSync(packagePath)) {
    findings.push({
      severity: 'BLOCKER',
      code: 'UNSUPPORTED_REPOSITORY',
      message: 'No package.json was found. Version 0.1.0 supports Node/npm repositories only.',
    });

    return {
      schema_version: 1,
      tool: { name: 'codex-maintainer-gate', version: TOOL_VERSION },
      generated_at: new Date().toISOString(),
      repository: repo,
      git: { head: gitHead(repo), base: null, diff_mode: 'unavailable' },
      checks: [],
      changed_files: [],
      security_sensitive_changes: [],
      findings,
      decision: 'BLOCKED',
    };
  }

  let packageJson;
  try {
    packageJson = readJson(packagePath);
  } catch (error) {
    findings.push({
      severity: 'BLOCKER',
      code: 'PACKAGE_JSON_INVALID',
      message: `package.json could not be parsed: ${error.message}`,
    });
    packageJson = { scripts: {} };
  }

  const discovered = discoverChecks(packageJson);
  const checks = discovered.map((check) => {
    if (!check.available) return { ...check, result: null };
    return { ...check, result: run(npmCommand(), ['run', check.name], repo) };
  });

  const changed = gitChangedFiles(repo, options.base);
  const changedFiles = changed.files;
  const classified = changedFiles.map(classifyChangedPath);
  const securityFiles = classified.filter((item) => item.areas.length > 0);
  const secretPaths = changedFiles.filter(isCommittedSecretPath);
  const secretMarkers = scanStrongSecretMarkers(repo, changedFiles);

  findings.push(...buildFindings({ checks, changedFiles, securityFiles, secretPaths, secretMarkers }));

  return {
    schema_version: 1,
    tool: { name: 'codex-maintainer-gate', version: TOOL_VERSION },
    generated_at: new Date().toISOString(),
    repository: repo,
    package: { name: packageJson.name ?? null, version: packageJson.version ?? null },
    git: { head: gitHead(repo), base: changed.base, diff_mode: changed.mode },
    checks,
    changed_files: classified,
    security_sensitive_changes: securityFiles,
    secret_scan: { committed_secret_paths: secretPaths, strong_markers: secretMarkers },
    findings,
    decision: decide(findings),
  };
}

function printHelp() {
  console.log(`Codex Maintainer Gate ${TOOL_VERSION}\n\nUsage:\n  node scripts/preflight.mjs [--repo PATH] [--base REF] [--output FILE] [--no-write]\n\nExit codes:\n  0  READY or READY_WITH_WARNINGS\n  1  BLOCKED\n`);
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return null;
  }

  if (options.help) {
    printHelp();
    return null;
  }

  const report = runGate(options);
  const blockerCount = report.findings.filter((item) => item.severity === 'BLOCKER').length;
  const warningCount = report.findings.filter((item) => item.severity === 'WARNING').length;

  console.log(`Codex Maintainer Gate: ${report.decision}`);
  console.log(`Blockers: ${blockerCount} | Warnings: ${warningCount}`);
  for (const finding of report.findings) {
    console.log(`[${finding.severity}] ${finding.code}: ${finding.message}`);
  }

  if (!options.noWrite) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Evidence: ${options.output}`);
  }

  process.exitCode = report.decision === 'BLOCKED' ? 1 : 0;
  return report;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main();
