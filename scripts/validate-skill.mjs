#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'SKILL.md',
  'agents/openai.yaml',
  'references/release-policy.md',
  'references/security-review.md',
  'scripts/preflight.mjs',
];

const failures = [];

for (const relativePath of required) {
  if (!fs.existsSync(path.join(repo, relativePath))) failures.push(`Missing required file: ${relativePath}`);
}

const skillPath = path.join(repo, 'SKILL.md');
if (fs.existsSync(skillPath)) {
  const skill = fs.readFileSync(skillPath, 'utf8');
  const match = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    failures.push('SKILL.md must begin with YAML frontmatter.');
  } else {
    const keys = match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z0-9_-]+):/)?.[1])
      .filter(Boolean);
    const unique = [...new Set(keys)];
    if (!unique.includes('name')) failures.push('SKILL.md frontmatter is missing name.');
    if (!unique.includes('description')) failures.push('SKILL.md frontmatter is missing description.');
    const unexpected = unique.filter((key) => !['name', 'description'].includes(key));
    if (unexpected.length > 0) failures.push(`SKILL.md frontmatter contains unsupported keys: ${unexpected.join(', ')}`);
  }

  if (!skill.includes('codex-maintainer-gate')) failures.push('SKILL.md does not identify the skill name.');
  if (skill.length > 30000) failures.push('SKILL.md is unexpectedly large; keep the core workflow concise.');
}

const openaiPath = path.join(repo, 'agents', 'openai.yaml');
if (fs.existsSync(openaiPath)) {
  const openaiYaml = fs.readFileSync(openaiPath, 'utf8');
  for (const field of ['display_name:', 'short_description:', 'default_prompt:']) {
    if (!openaiYaml.includes(field)) failures.push(`agents/openai.yaml is missing ${field}`);
  }
  if (!openaiYaml.includes('$codex-maintainer-gate')) {
    failures.push('agents/openai.yaml default_prompt must explicitly mention $codex-maintainer-gate.');
  }
}

if (failures.length > 0) {
  console.error('Skill validation: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Skill validation: PASS');
console.log(`Validated ${required.length} required files and skill metadata.`);
