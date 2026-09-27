# AGENTS.md — engineering contract for opencode-db-compact

This file is the authority for how this repository is built and changed. It is
enforced by tests, not by convention.

## 1. What this is

An offline, verified compactor for an OpenCode 2 `opencode.db`. It makes a
compacted copy, proves the copy is complete and sound, and only then swaps it in
by renaming — keeping the originals.

| Thing | Value |
|---|---|
| package | `opencode-db-compact` |
| runtime | Node.js >= 24.14.1 (uses the built-in `node:sqlite`) |
| runtime dependencies | **none** |
| dev dependencies | pinned exactly, no `^`/`~`/`latest` |
| licence | MIT © mavasbel |
| entrypoint | `node src/main/cli.ts <preflight\|rehearse\|run\|rollback <backupDir>> [--db <path>] [--keep]` |

Four modes:

- **preflight** — read-only: file sizes, page statistics, free disk, running process.
- **rehearse** — builds and checks a compacted copy; keeps it only with `--keep`.
- **run** — the offline run: guard, build, verify, swap, write evidence.
- **rollback** — puts the originals back and parks what was in place.

## 2. Safety invariants — never trade these away

1. The source database is **only ever opened read-only**. The compacted copy is
   produced with `VACUUM INTO`.
2. The swap is **renames only**. The originals are moved into
   `db-backup-<timestamp>/`, never deleted.
3. The tool **never kills a process**. It refuses to run while the guarded image
   is present, and refuses while the file is held open (a rename probe, EBUSY).
4. A verification failure **aborts before the swap** and leaves the originals
   untouched; the failed copy is kept beside the database for inspection.
5. Rollback always restores the originals and parks the compacted files.
6. The live tier **never writes the live database**: it takes a consistent copy
   with SQLite's online backup API from a read-only connection.

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
```

- Layers: `src/domain` (model, errors, services, ports) ← `src/application` ←
  `src/infrastructure/adapters` ← `src/main`.
- Dependencies point **inward only**, enforced by
  `tests/unit/architecture/imports.test.ts`.
- **No `node:` import in `src/domain` or `src/application`.** Path handling that
  the layers need lives in `src/domain/model/Paths.ts` as pure functions.
- Ports are split: `src/domain/ports/inbound` (`Preflight`, `Rehearse`,
  `Compact`, `Rollback`) and `src/domain/ports/outbound` (`Sqlite`,
  `FileSystem`, `ProcessList`, `Runtime`, `ReportSink`, `Output`). Every adapter
  declares `implements` its port.
- `src/main/container.ts` is the **only** place that constructs adapters and use
  cases. `ContainerOverrides` is the seam tests use.
- Every class has an explicit constructor. No parameter properties and no enums,
  so every file runs under Node's plain type stripping with no flags.

## 4. The report JSON is a contract

Report keys are **snake_case** and identical to the tool this replaces
(`page_size`, `freelist_count`, `vacuum_ms`, `target_bytes`, `integrity_ok`,
`source_rows`, …). `tests/e2e/legacy-parity.test.ts` runs the frozen original
(`tests/support/fixtures/legacy/compact.mjs` + `lib.mjs`, kept verbatim) and this
implementation as real processes against identical databases, and compares the
preflight report, the check lines, the run report (minus timings and free disk)
and the rollback output.

**One deliberate behaviour change.** `run` against a missing database reports
`database not found: <path>` before opening it; the old tool opened the file
first and let SQLite report `unable to open database file`. The order is now:
environment guard → page statistics → space guard → build → environment guard.

## 5. Tests: `tests/{unit,component,e2e,live}`

| Tier | What runs | Coverage |
|---|---|---|
| unit | one class at a time with in-memory fakes; adapters against real temp files; the architecture gate | **measured, 100%** |
| component | several real parts together: real SQLite + real filesystem, real compaction, real swap | not gated |
| e2e | the whole wired container in-process over real databases, plus the legacy-parity test as real processes | **measured, 100%** |
| live | a read-only snapshot of the real `opencode.db`, then the real CLI as a process: preflight, a full run and a rollback | not measurable |

## 6. Coverage law

- `npm run coverage:unit` and `npm run coverage:e2e` each require **100.00 % lines
  and functions on every `src` file**, per file. `scripts/coverage.mjs` reads the
  lcov report Node writes and fails otherwise.
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

Nothing else in the e2e tier is faked. The swap-restore path is exercised with a
real filesystem condition (a directory left in the backup's way), not a seam.

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
