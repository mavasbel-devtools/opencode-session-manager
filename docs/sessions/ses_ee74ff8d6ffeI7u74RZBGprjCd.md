# Session ses_ee74ff8d6ffeI7u74RZBGprjCd — opencode-session-manager

The progress record of the OpenCode session that builds this repository (global rule: a session's
state lives in `docs/sessions/<session id>.md`). Plan: `docs/plans/2026-10-08-23-15-complete-sync-and-robustness.md`.
Work is committed directly to `main` of the private `mavasbel/opencode-session-manager` (one
user, one building session; decided 2026-10-12). The former branch `session-sync` was
fast-forwarded into `main` (`a68b4d1`) and deleted.

## Done

| Phase | What | Commits |
|---|---|---|
| merge | opencode-db-manager merged in with its history; Bun; one CLI | 9461262, 468daa8, 2f981bb |
| read-only | `sessions`, `context copy`, two-pane `tui`, `install:cli` | ed683e0, 69e1333, 48409b2, 0423ccc, 76938ac |
| Magic Context sync | `context sync`, the queue's apply | 0867c3a |
| 1 docs | README/AGENTS pass, docs lint | e8af252 |
| 2 whole-session sync | `sync` (OpenCode rows + Magic Context state), `migrate` removed | aa0f5c3, 828e426 |
| D.1 | Magic Context format 95 (0.47.0) | 55224f8 |
| A robustness | store locks, `--strict`, rollback holds only its own stores, `verify`, repeat/failure tests | 6a84151, b4c5bd7 |
| B TUI | queue = whole-session sync; health per session; Magic Context version header; `context wrapup\|recomp` and `W`/`R` | de9d128, ee90081, 12d29bd, 66c11d9 |
| C fork | `fork` and `F` through the running OpenCode; `sync --diverged fork` and the queue's `f`/`F` | e62bcbf |
| E (part) | one OpenCode git identity for both project resolvers, fixed to OpenCode's rules | 5a3af58 |
| relocate | `relocate`: sessions whose folders moved, with their text and Magic Context state; `JointSwapService` shared with `sync` | 858cff1 |

Gates at 5a3af58: typecheck, docs lint, unit 403 and e2e 95 tests at 100 % lines and functions per
file, component 9, live 37 (+1 opt-in rebuild that spends tokens).
- 2026-10-14: the OpenCode 1 plugin lane removed (user decision; commit `be7d432`); the program keeps
  reading the OpenCode 1 sessions a store holds. Live fixtures moved out of `/tmp` into
  `~/.cache/opencode-session-manager/live/` (`bun run fixtures:live`); the live tier passes on Magic
  Context 0.49.2 (37 pass; skipped only the opt-in rebuild and the relocate test without its map, which
  passes with the four ITAM rules). The legacy `opencode-db-manager` repository was deleted from GitHub,
  its history kept in `~/Dev/repos/opencode/docs/archive/2026-10-14-22-42-opencode-db-manager.bundle`.
- 2026-10-17: the Herdr pane title (`docs/plans/2026-10-17-01-30-herdr-pane-title.md`): inside a
  Herdr pane the TUI reports the open session's root title as the pane's `title` and
  `display_agent`; live-tested with the real TUI in a real, private Herdr server.

## Decisions (with their evidence)

- Diverged sessions are never merged: skipped by default, or forked on request (user, 2026-10-09).
- No Magic Context state is copied into forks: Magic Context 0.47.0 inherits it itself
  (`seedV2ForkFromParent` on the fork's first model request); the planned plugin
  `/fork-with-context` is dropped (2026-10-12).
- The offline fork writes OpenCode 2.0.26's `projectFork` layout; the live test compares it row for
  row with OpenCode's own fork in a sandboxed `opencode serve` (2026-10-12).
- Project ids follow OpenCode's own code: `origin` only, `URL.parse` normalization, sorted root
  commits (2.0.24 source and 2.0.26 binary, 2026-10-12).

## Open

- Deferred by the user (2026-10-12), needs the Windows machine: a refresh script, and syncing the real Windows profile (its OpenCode
  store is at migration `20260923013825_project_time_active`, this machine's at
  `20261007190000_azure_cli_external_credential`; `sync` refuses different migrations).
- The user runs `~/.local/share/opencode/maintenance-2026-10-12.sh` from a plain terminal (OpenCode
  closed): it backs up both stores and configs, relocates the 84 sessions of
  `~/Documents/Work/ITAM/Cursos/{relational-dbs,non-relational-dbs}` (and the older `2026-02-*`
  names) to `~/Dev/repos/ITAM/2026-02-*` (dry run on the live profile: 84 sessions, 31,713 + 106 rows,
  merges `git:e4df455b…` → `git:061ecb…` and `git:5f407f03…` → `git:3eb1e20…`). Since 2026-10-13 it
  does the move only (Magic Context is updated separately, now 0.49.2). Then validate with `--check`.
