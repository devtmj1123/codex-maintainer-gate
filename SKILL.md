---
name: codex-maintainer-gate
description: Evidence-first, fail-closed review and release-readiness workflow for Node/npm open-source repositories. Use when Codex needs to review a pull request or change, prepare a release, validate maintainer readiness, inspect security-sensitive boundaries, run repository checks, or produce auditable BLOCKER/WARNING/PASS evidence before merge or release.
---

# Codex Maintainer Gate

Use this skill to turn maintainer review into an evidence-bound decision. Do not treat prior PASS labels, prose claims, or missing checks as proof.

## Workflow

1. Inspect the repository before making claims.
   - Read `package.json`, the relevant changed files, and repository documentation.
   - Identify the requested base ref when reviewing a branch or pull request.
   - Read `references/security-review.md` when authentication, authorization, admin, API, uploads, secrets, dependencies, CI, deployment, or release paths are touched.
   - Read `references/release-policy.md` before issuing a release decision.

2. Run the deterministic preflight.

   ```bash
   node scripts/preflight.mjs --repo . --output maintainer-gate-report.json
   ```

   For a branch or pull request, bind the review to a base ref when available:

   ```bash
   node scripts/preflight.mjs --repo . --base origin/main --output maintainer-gate-report.json
   ```

3. Interpret checks conservatively.
   - Accept only commands discovered from the repository's own `package.json` scripts.
   - Treat an available check that fails or cannot execute as a `BLOCKER`.
   - Treat missing automated tests as `TEST_COVERAGE_NOT_AVAILABLE`, never as a passing test result.
   - Do not invent a test, lint, type-check, format, or build command merely to produce a green result.

4. Inspect security-sensitive changes.
   - Review every path classified by the preflight as security-sensitive.
   - Verify authorization at the server boundary rather than relying on UI hiding.
   - Check secret handling, environment configuration, upload validation, dependency changes, and privileged/admin operations when relevant.
   - Escalate a concrete exploitable or release-blocking defect to `BLOCKER`.
   - Keep a sensitive-path touch as `WARNING` until the relevant boundary is actually reviewed.

5. Produce an evidence summary.
   Report:
   - exact repository/ref or commit reviewed when available;
   - commands executed and exit status;
   - changed files and security-sensitive areas;
   - blockers and warnings;
   - known coverage gaps;
   - final decision: `READY`, `READY_WITH_WARNINGS`, or `BLOCKED`.

6. Fail closed.
   - Never report `READY` when any blocker exists.
   - Never convert missing evidence into PASS.
   - If the changed-file set or repository identity cannot be established, state the limitation and keep the decision conservative.

## Scope

Version 0.1.0 targets Node/npm repositories. If no `package.json` exists, report the current tool limitation rather than pretending the repository was validated.
