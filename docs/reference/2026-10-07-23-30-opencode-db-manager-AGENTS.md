# AGENTS.md — engineering contract for opencode-db-manager

This file is the authority for how this repository is built and changed. It is
enforced by tests, not by convention.

## 1. What this is

An offline, verified maintenance tool for an OpenCode 2 `opencode.db`. It
compacts the database, and it migrates sessions from another machine (a Windows
`opencode.db`) into it. Either way it builds a new copy, proves the copy is
complete and sound, and only then swaps it in by renaming — keeping the originals.

| Thing | Value |
|---|---|
| package | `opencode-db-manager` (renamed from `opencode-db-compact`) |
| platforms | Linux and Windows (`process.platform` `linux`, `win32`) |
| runtime | Node.js >= 24.14.1 (uses the built-in `node:sqlite`) |
| runtime dependencies | **none** |
| dev dependencies | pinned exactly, no `^`/`~`/`latest` |
| licence | MIT © mavasbel |
| entrypoint | `node src/main/cli.ts <preflight\|rehearse\|run\|rollback <backupDir>> [--db <path>] [--keep]` |
| migrate entrypoint | `node src/main/cli.ts migrate <rehearse\|run> --from <db>... --windows-user <name> [--drive <letter>] [--mount <dir>]... [--relocate <from>=<to>]... [--home <dir>] [--db <path>] [--keep]` |

Four modes:

- **preflight** — read-only: file sizes, page statistics, free disk, running process.
- **rehearse** — builds and checks a compacted copy; keeps it only with `--keep`.
- **run** — the offline run: guard, build, verify, swap, write evidence.
- **rollback** — puts the originals back and parks what was in place.
- **migrate rehearse / migrate run** — copy every input, rewrite Windows profile
  paths, merge the sources into the local database, re-key every session onto the
  project OpenCode derives for its folder here, verify, and (run) swap in. A
  migrate run is undone with **rollback** like a compaction.

## 2. Safety invariants — never trade these away

1. The source database is **only ever opened read-only**. The compacted copy is
   produced with `VACUUM INTO`.
2. The swap is **renames only**. The originals are moved into
   `db-backup-<timestamp>/`, never deleted.
3. The tool **never kills a process**. It refuses to run while the guarded image
   is present (`opencode` on Linux, `opencode.exe` on Windows), and refuses while
   any process holds the file open: on Linux the `/proc/<pid>/fd` links of every
   process are compared with the database and its `-wal`/`-shm`/`-journal`
   sidecars (renaming an open file succeeds there, so a rename proves nothing); on
   Windows a rename probe is refused with EBUSY.
4. A verification failure **aborts before the swap** and leaves the originals
   untouched; the failed copy is kept beside the database for inspection.
5. Rollback always restores the originals and parks the compacted files.
6. The live tier **never writes the live database**: it takes a consistent copy
   with SQLite's online backup API from a read-only connection.
7. A migration **only ever writes copies it made itself**: every input is copied
   with `VACUUM INTO` from a read-only connection, the rewrite, merge and re-key
   run on those copies, and the result passes the seven migration gates
   (`MigrationVerifier`) before the same renames-only swap. A failed gate aborts
   before the swap and keeps the migrated copy for inspection.
8. A migration **never rewrites credentials** (`account`, `control_account`,
   `credential`) or OpenCode's own `migration` log, and never re-serializes JSON:
   it edits matched paths inside the raw text, so everything else stays
   byte-identical.

## 3. Architecture law — strict hexagonal

```
flowchart LR
    CLI[CompactCliAdapter] --> P[PreflightUseCase]
    CLI --> R[RehearseUseCase]
    CLI --> C[CompactUseCase]
    CLI --> B[RollbackUseCase]
    C --> BV[BuildAndVerifyService]
    C --> G[GuardService]
    C --> S[SwapService]
    BV --> SQ[SqlitePort]
    BV --> FS[FileSystemPort]
    B --> FS
    G --> FS
    G --> PL[ProcessListPort]
    G --> DH[DatabaseHoldersPort]
    ROUTER[CliRouter] --> CLI
    ROUTER --> MCLI[MigrateCliAdapter]
    MCLI --> M[MigrateUseCase]
    M --> RW[RewriteService]
    M --> RK[RekeyService]
    M --> MV[MigrationVerifier]
    M --> G
    M --> S
    RW --> MS[MigrationStorePort]
    RK --> PI[ProjectIdentityPort]
    MV --> SQ
```

- Layers: `src/domain` (model, errors, services, ports) ← `src/application` ←
  `src/infrastructure/adapters` ← `src/main`.
- Dependencies point **inward only**, enforced by
  `tests/unit/architecture/imports.test.ts`.
- **No `node:` import in `src/domain` or `src/application`.** Path handling that
  the layers need lives in `src/domain/model/Paths.ts` as pure functions.
- Ports are split: `src/domain/ports/inbound` (`Preflight`, `Rehearse`,
  `Compact`, `Rollback`, `Migrate`) and `src/domain/ports/outbound` (`Sqlite`,
  `FileSystem`, `ProcessList`, `DatabaseHolders`, `Runtime`, `ReportSink`, `Output`,
  `MigrationStore`, `ProjectIdentity`). Every adapter declares `implements` its port.
- Migration: the pure parts are domain services — `PathRewriter` (every Windows
  path form at any JSON depth), `GitRemote` (the `host/path` OpenCode hashes),
  `PosixPaths` (`session.path`). `NodeMigrationStoreAdapter` is the only writer of
  a migration copy; `GitProjectIdentityAdapter` is the only place OpenCode's
  project-id derivation is reproduced. A new path form is added to `PathRewriter`
  together with a case in `tests/unit/domain/migration.test.ts`.
- `src/infrastructure/adapters/inbound/cli/CliRouter.ts` sends `migrate …` to
  `MigrateCliAdapter` and every other mode to `CompactCliAdapter`.
- `src/main/container.ts` is the **only** place that constructs adapters and use
  cases. `ContainerOverrides` is the seam tests use.
- Every class has an explicit constructor. No parameter properties and no enums,
  so every file runs under Node's plain type stripping with no flags.

### Platform law

- Code for one operating system lives only in
  `src/infrastructure/adapters/outbound/platform/<platform>/` and is wired only by
  `src/main/platform/<platform>.ts`; `src/main/platform.ts` maps
  `RuntimePort.platform()` to that wiring and refuses any other platform
  (`UnsupportedPlatformError`). Enforced by `tests/unit/architecture/imports.test.ts`.
- Linux: `ProcProcessListAdapter` (`/proc/<pid>/comm`) and `ProcFdHoldersAdapter`
  (`/proc/<pid>/fd`). Windows: `TasklistAdapter` (`tasklist`) and
  `RenameProbeHoldersAdapter`. Both take their system root or executable as a
  constructor argument, so the unit tier runs every platform's adapters on any machine.

## 4. The report JSON is a contract

Report keys are **snake_case** and identical to the tool this replaces
(`page_size`, `freelist_count`, `vacuum_ms`, `target_bytes`, `integrity_ok`,
`source_rows`, …). `tests/e2e/legacy-parity.test.ts` runs the frozen original
(`tests/support/fixtures/legacy/compact.mjs` + `lib.mjs`, kept verbatim) and this
implementation as real processes against identical databases, and compares the
preflight report, the check lines, the run report (minus timings and free disk)
and the rollback output.

The migration report (`mode: "migrate-rehearse"` / `"migrate-run"`) has no
legacy counterpart; its keys follow the same snake_case rule (`cells_rewritten`,
`missing_directories`, `windows_sessions_gone`, …) and are defined in
`src/domain/model/Migration.ts`.

**One deliberate behaviour change.** `run` against a missing database reports
`database not found: <path>` before opening it; the old tool opened the file
first and let SQLite report `unable to open database file`. The order is now:
environment guard → page statistics → space guard → build → environment guard.

## 5. Tests: `tests/{unit,component,e2e,live}`

| Tier | What runs | Coverage |
|---|---|---|
| unit | one class at a time with in-memory fakes; adapters against real temp files; the architecture gate | **measured, 100%** |
| component | several real parts together: real SQLite + real filesystem, real compaction, real swap; a real migration over real folders and real git repositories | not gated |
| e2e | the whole wired container in-process over real databases, plus the legacy-parity test as real processes | **measured, 100%** |
| live | a read-only snapshot of the real `opencode.db`, then the real CLI as a process: preflight, a full run and a rollback; on Linux, the platform adapters find the running OpenCode holding the real database (read-only); a real migration rehearsal listed by a sandboxed OpenCode when `OPENCODE_DB_MIGRATE_LIVE_SOURCE` and `OPENCODE_DB_MIGRATE_LIVE_USER` are set | not measurable |

## 6. Coverage law

- `npm run coverage:unit` and `npm run coverage:e2e` each require **100.00 % lines
  and functions on every `src` file**, per file. `scripts/coverage.mjs` reads the
  lcov report Node writes and fails otherwise.
- **Per platform on e2e.** The unit tier is gated on every file, every platform's
  adapters included. The e2e tier runs the real system, so on each platform
  `scripts/coverage.mjs` gates that platform's files and does not count another
  platform's folder (it prints how many it left out); the other platform's e2e run
  gates those. A release needs the e2e gate green on both Linux and Windows.
- Node reports a file **only once something loads it**, so each measured tier has
  a completeness test (`tests/unit/architecture/imports.test.ts`,
  `tests/e2e/coverage-completeness.test.ts`) that imports every `src` file.
- Never claim coverage without reading the generated report. There are no
  coverage-ignore comments: unreachable code is removed instead (e.g. an unused
  `FileSystemPort.list` was deleted rather than ignored).

## 7. Declared fault-injection seams (e2e only)

Two conditions cannot occur on a real machine without mocking the very thing
under test, so the e2e tier declares exactly three seams, all in
`tests/support/faults.ts` and `tests/support/fakes/runtime.ts`:

| Seam | What it changes | What stays real |
|---|---|---|
| `DemandingSpacePolicy` | demands more space than any disk has | the `statfs` reading and both SQLite connections |
| `TamperingSqlite` | after the vacuum, really deletes a row from the copy | the vacuum, the files, the parity check |
| `FakeRuntime` | pins the timestamp so target names are predictable | every filesystem and database operation |

`FakeRuntime` also reports a platform with no adapters, to prove the composition
root refuses it. Off Windows, the legacy-parity test runs the frozen original
(which calls `tasklist`) with a stand-in `tasklist` first on `PATH` that prints
what the real one prints when no process matches; the tests only ask it about an
image that matches nothing. Nothing else in the e2e tier is faked. The swap-restore path is exercised with a
real filesystem condition (a directory left in the backup's way), not a seam.
The migration adds no seam: its failures are real database conditions — a session
folder on another drive (a failed gate), a unique index the merged rows collide
with (rows not kept), and a trigger that refuses a write (rolled back, reported as
an error).

## 8. Test safety

Every recursive delete in a test goes through
`tests/support/temporary.ts#removeTemporary`, which refuses any path that is not
strictly inside the OS temporary directory. A guard like this exists because a
teardown once ran `fs.rm("")`, which resolves to the working directory and
deleted a whole repository. Tests never write to the real `opencode.db`.

## 9. Definition of done

A change is done only when:

1. `npm run typecheck` is clean;
2. `npm run test` passes all four tiers with 0 failures;
3. `npm run coverage` shows 100.00 % lines and functions per `src` file on **both**
   measured tiers, and the same run still fails when a deliberately untested file
   is added;
4. `npm run lint:diagrams` is clean and README / AGENTS / package.json / code agree;
5. the staged diff has been read, and no personal data, path or credential is in it.

## 10. Git

Dev dependencies are pinned exactly; `node_modules/` and `coverage/` are ignored;
history is append-only; pushing needs the owner's explicit go-ahead. The
pre-restructure `.cmd` operator scripts were moved out of the repository to the
operator's `docs/reference/` so no machine-specific path is published.
