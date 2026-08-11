# Release policy

Use this policy when converting preflight evidence and human review into a release decision.

## Severity

### BLOCKER

Use `BLOCKER` when release safety or correctness is not established. Examples:

- an available mandatory repository check fails or cannot run;
- a committed secret-bearing file is detected;
- a strong private-key or credential marker is present in a changed file;
- a concrete authentication, authorization, data-integrity, privilege, or release defect can cause unauthorized access, corruption, or materially unsafe behavior;
- the requested release cannot be reproduced or the reviewed target is materially ambiguous.

Any blocker forces `BLOCKED`.

### WARNING

Use `WARNING` for a real unresolved risk or evidence gap that does not independently require blocking. Examples:

- no dedicated automated test script exists;
- security-sensitive paths changed and still require focused maintainer review;
- the changed-file set cannot be established completely;
- an important validation dimension is manual only.

Warnings produce `READY_WITH_WARNINGS` when no blocker exists.

### PASS

Use `PASS` only for an assertion that was positively established from current evidence. Do not infer PASS from the absence of a check.

## Decisions

- `READY`: no blocker and no warning remains.
- `READY_WITH_WARNINGS`: no blocker exists, but one or more warnings remain and the maintainer explicitly accepts them.
- `BLOCKED`: one or more blockers exist.

## Evidence rules

- Bind the report to the exact commit/ref when Git makes that identity available.
- Record the commands actually executed and their exit states.
- Preserve failed command output instead of replacing it with a summary claim.
- Record missing tests as a coverage gap.
- Do not let documentation, labels, previous CI status, or a maintainer's assertion override current failed evidence.
- Do not weaken a check merely to make the gate green.
