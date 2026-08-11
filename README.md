# Codex Maintainer Gate

An evidence-first, fail-closed maintenance gate for open-source repositories using Codex.

Codex Maintainer Gate packages a reusable Codex Skill plus a deterministic Node.js preflight runner. It helps maintainers turn recurring release review into a repeatable workflow: discover the checks a repository actually exposes, run them, identify security-sensitive changes, record coverage gaps, and produce a machine-readable release decision.

## Why this exists

Open-source maintainers repeatedly answer the same questions before merging or releasing:

- Did the repository's available quality checks actually pass?
- Is test coverage present, or are we accidentally treating missing tests as success?
- Did this change touch authentication, authorization, admin, API, upload, dependency, environment, or secret-handling boundaries?
- Is there evidence for a release decision, or only a human assertion?

This project makes those questions explicit and reproducible.

## Core behavior

- Discovers scripts from `package.json` instead of inventing commands.
- Runs available `type-check`, `lint`, `format:check`, `test`, and `build` checks.
- Reports `TEST_COVERAGE_NOT_AVAILABLE` when no dedicated test script exists.
- Detects security-sensitive changed paths and obvious committed-secret hazards.
- Classifies findings as `BLOCKER`, `WARNING`, or `PASS`.
- Emits `READY`, `READY_WITH_WARNINGS`, or `BLOCKED`.
- Writes stable JSON evidence suitable for CI artifacts and maintainer review.
- Never reports `READY` when a blocker exists.

## Quick start

Requires Node.js 20+ and npm.

```bash
npm install
node scripts/preflight.mjs --repo /path/to/repository
```

Write evidence to a specific file:

```bash
node scripts/preflight.mjs --repo /path/to/repository --output maintainer-gate-report.json
```

Compare against a base ref when reviewing a branch or pull request:

```bash
node scripts/preflight.mjs --repo /path/to/repository --base origin/main
```

## Use as a Codex Skill

The repository itself is a Codex Skill. Install or reference it using the normal Codex Skills mechanism, then invoke it with a request such as:

```text
Use $codex-maintainer-gate to review this change and decide whether it is ready to release.
```

The Skill instructs Codex to inspect the repository, run the deterministic preflight, investigate security-sensitive areas, and keep the final decision evidence-bound.

## GitHub Actions

A reusable example is provided at `examples/github-actions/maintainer-gate.yml`. It runs the gate for pull requests and uploads the JSON evidence artifact.

## Decision model

| Decision | Meaning |
| --- | --- |
| `READY` | All discovered mandatory checks passed and no warnings remain. |
| `READY_WITH_WARNINGS` | No blocker exists, but coverage gaps or review warnings remain. |
| `BLOCKED` | At least one mandatory check or hard security condition failed. |

Missing automated tests are deliberately **not** converted into a fake pass. They are reported as a warning so maintainers can see the coverage gap.

## Project status

This is an early open-source maintainer tool. The initial release focuses on Node/npm repositories and repository-local evidence. Future work may add more ecosystems and richer policy configuration without weakening fail-closed behavior.

## Author

陈明净 (Tan Ming Jing)

## License

MIT
