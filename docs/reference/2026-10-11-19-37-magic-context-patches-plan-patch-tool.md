# Plan: opencode-magic-context-patches (approved 2026-10-11)

Decisions by the user: option A (patch the installed copy) so `execute_threshold_percentage: 13`
is respected; folder name `opencode-magic-context-patches`; built fully to the global rules
(hexagonal, Bun/TypeScript, tests/{unit,component,live,e2e}, measured coverage); a systemd update
notification; local repository only (no remote).

## Steps

1. Repo set-up: git, package.json, tsconfig, bunfig files, scripts; this plan.
2. Domain and use cases with unit tests to 100 % per file.
3. Adapters, composition root and CLI, with component tests.
4. The 0.47.0 patch definition: `before` from the published npm tarball (equal to the installed
   files), `after` from a patched copy (never the real install).
5. e2e tests on copies of the real files; both coverage gates green.
6. Docs: README (commands, diagram, update procedure, undo), AGENTS (rules), the evidence document,
   a research note, the session record.
7. Install: `bun run install:cli`, `bun run install:watch`.
8. Apply for real: `status` (not-applied) → `apply` → `status` (applied) → the user restarts OpenCode
   → `effect` (no rejection, threshold 13, floor 11).
9. Live tests (status, check, effect, the watch firing on a new cache folder).
10. Local commit; project memory: re-run after every Magic Context update.

## Changes against the proposal

- Backups are content-addressed (`backups/<version>/<patch>/<path>@<sha256>`) instead of one folder
  per time: the same original is stored once, and the time of each backup is in the audit log.
- `undo` restores from the backup, and falls back to reversing the replacements when the backup is
  missing or damaged; both are accepted only with the recorded original checksum.
- The service waits 30 s before checking, so OpenCode can finish writing a new installation.
