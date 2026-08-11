# Security-sensitive review

Use this reference only when the changed-file set touches a relevant boundary. Derive conclusions from repository code, not path names alone.

## Authentication and sessions

Verify:

- credentials are validated server-side;
- session/token signatures, expiry, revocation, and cookie flags are appropriate;
- password reset and account-recovery flows do not permit token reuse or identity confusion;
- secrets used for signing are required and are not silently replaced with weaker public configuration.

## Authorization and privileged operations

Verify:

- privileged API operations enforce authorization at the server boundary;
- role checks cannot be bypassed by calling routes directly;
- object-level authorization is enforced when users can reference record IDs;
- admin and maintenance routes are not exposed solely because UI links are hidden.

## Data modification and integrity

Verify:

- user-controlled identifiers cannot modify records belonging to another user without authorization;
- state transitions reject invalid or replayed requests where relevant;
- destructive actions have appropriate identity and permission checks;
- important writes do not trust client-supplied role or ownership fields.

## Uploads and files

Verify:

- allowed content types and size limits are enforced server-side;
- generated file names or storage IDs prevent path traversal and collisions;
- uploaded active content cannot become executable in an unsafe origin;
- delete/read operations enforce the same access boundary as upload.

## Environment variables and secrets

Verify:

- `.env`, private keys, credentials, and production secrets are not committed;
- public/client-prefixed variables contain only data intended for browsers;
- server secrets fail closed when absent;
- logs and error responses do not expose credentials or sensitive records.

## Dependencies and supply chain

When manifests or lockfiles change:

- confirm the dependency is intentional;
- inspect lifecycle scripts and unusually broad transitive additions when risk is material;
- verify lockfile changes correspond to the manifest change;
- avoid approving unexplained registry/source changes.

## CI, deployment, and release

Verify:

- workflow changes do not expose secrets to untrusted pull-request code;
- privileged tokens have minimum required permissions;
- release/deployment actions are bound to the intended ref or artifact;
- a green CI label is not treated as proof when required jobs did not execute.

## Reporting

For each material issue, state:

1. affected boundary;
2. evidence path/function;
3. attacker or failure precondition;
4. concrete impact;
5. whether it is a `BLOCKER` or `WARNING`;
6. the evidence required to close it.
