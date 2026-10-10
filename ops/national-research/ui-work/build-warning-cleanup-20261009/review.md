# Build warning cleanup and dependency review

User authorized implementation and production deployment. Base: 6430844223639241fbe4815180cfb4f86f1880c3. Builds run remotely because local disk remains below the preferred floor.

## Changes
- Pin Node 24 major and npm 11.16.0. Vercel uses a clean npm ci with optional platform binaries.
- Explicitly deny reviewed installation scripts for esbuild 0.28.2, unrs-resolver 1.11.1 and Darwin-only fsevents 2.3.3; enforce strict allowScripts decisions. No blanket script permission.
- The original esbuild installer validates/downloads optional binaries; unrs uses napi-postinstall to check/retrieve its binary. fsevents builds optional Darwin bindings. Required prebuilt native functionality is exercised before each build. sharp 0.35.5 no longer has an install script.
- Four line-scoped image lint exceptions preserve direct browser rendering of MFA QR data, private signed observation photos, generated SVG exports and fixed-size currency SVGs. The global image rule remains enabled.
- Lint fails on warnings/errors and unused exceptions. Direct ESLint API avoids deprecated next lint command.
- Security review found production advisories. Upgrade Next and its ESLint config to 15.5.27; csv-parse to 7.0.3; use patched sharp 0.35.5 and PostCSS 8.5.29 under Next. Compatible transitive audit fixes and tsx/esbuild updates are recorded in the lockfile.
- Production dependency audit now reports zero known advisories and gates builds. Full dependency audit retains one upstream braces issue reported through five dev-only dependency entries. It concerns deeply nested glob patterns in lint tooling, not a shipped request handler. No patch exists in braces; do not downgrade Next lint tooling to silence it. Application glob inputs are fixed, not user-controlled.
- CSV upgrade checks preserve quoted multiline records, raw bytes, line numbers, sync/stream equivalence and prototype safety. No research projections are regenerated.

## Review sources
- https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/
- https://docs.npmjs.com/cli/v11/using-npm/config/
- https://nextjs.org/docs/messages/no-img-element
- https://github.com/advisories/GHSA-2xp9-vwfh-vxw4
- https://github.com/advisories/GHSA-8cw4-87c7-c6xx
- https://github.com/adaltas/node-csv/blob/master/packages/csv-parse/CHANGELOG.md
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

## Validation before remote build
Five policy regression tests passed. Native tool checks passed with existing canonical Windows dependencies. Scoped application lint passed (161 files; sparse checkout), with a local dependency-resolution notice because this worktree deliberately has no installed node_modules. Fresh Linux installation, updated binaries, complete lint/type/build and runtime checks are required before publication. This is scoped hardening, not a claim of complete security certification.
