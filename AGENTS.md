# AGENTS.md — engineering contract for opencode-session-manager

This file is the authority for how this repository is built and changed. It is
enforced by tests, not by convention. If a rule here and the code disagree, the
code is wrong until one of them is deliberately changed.

## 1. Fixed identity

| Thing | Value | Do not change without a migration |
|---|---|---|
| package name | `opencode-session-manager` | — |
| v2 plugin id | `session-manager` (server and TUI entries) | — |
| v1 TUI plugin id | `session-manager-tui` | — |
| tool name | `session-id` | the global AGENTS.md startup routine invokes the tool by this name |
| v2 host | `@opencode/plugin` 2.0.14 contract | types-only; never a runtime import in `src` |
| v1 host | `@opencode-ai/plugin` 1.18.32 | `/transfer-session` only |
| deployed at (v2) | `<plugins>/session-manager/` (`server.js`, `tui.js`) | auto-discovered; never listed in config |
| deployed at (v1) | `<plugins>/session-manager.js`, `<plugins>/session-manager.tui.js` | v1.18.32 forbids `server` and `tui` in one module |
| build outputs | `dist/v2/{server,tui}.js`, `dist/v1/session-manager{,.tui}.js` | the entrypoints the hosts load |
| CLI | `opencode-session-manager` (`dist/cli/`, `bun build --compile`), entry `src/main/cli/cli.ts` | `<preflight\|rehearse\|run\|rollback <backupDir>> [--db <path>] [--keep]`, `rollback <backupDir> [--db <path>]...` (one or several stores), `sync --from <dataHome> --to <dataHome> [--map <from>=<to>]... (--session <id>... \| --all) [--prefer further\|keep\|replace] [--diverged skip\|fork] [--context all\|sessions] [--strict] [--dry-run]`, `fork --session <id> [--before <messageId>] [--server <url>] [--json]`, `verify [--data <dataHome>] [--session <id>]... [--behind <messages>] [--json]` (read-only), `sessions [--data <dataHome>] [--json]` (read-only), `context copy --from <context.db> --to <file>`, `context sync --from <dataHome> --to <dataHome> (--session <id>... \| --all) [--prefer keep\|further\|replace \| --replace] [--context all\|sessions] [--strict] [--dry-run]`, `context wrapup\|recomp --session <id>... [--data <dataHome>] [--keep <messages>] [--server <url>] [--no-wait] [--timeout <minutes>] [--json]`, `tui [--left <dataHome> \| --left-db <db> [--left-context <db>]] [--right …] [--map <from>=<to>]... [--offline]` (session browser; its queue applies whole-session syncs) |
| CLI platforms | Linux and Windows (`linux`, `win32`) | others are refused (`UnsupportedPlatformError`) |
| runtime | Bun 1.4 (`bun:sqlite`); the plugin bundles and the CLI have no runtime dependencies | — |
| licence | MIT © mavasbel | — |

This repository merges `opencode-session-id`, `opencode-sessions-transfer` and
`opencode-db-manager` (formerly `opencode-db-compact`); all histories are in
`git log`. The installer retires the plugin predecessors' deployed artifacts.
Their final docs are frozen under `docs/reference/`.

## 2. The tool contract is frozen

The `session-id` tool must behave field-for-field like the hand-written plugin
it replaced, kept verbatim as `tests/support/fixtures/legacy-session-id-index.js`;
`tests/component/tool-parity.test.ts` fails if the tool drifts. Frozen surface:

- name `session-id`;
- description `Extracts and returns the active 'session ID' directly from the opencode plugin execution context.`;
- input schema `{ type: "object", properties: {}, additionalProperties: false }`;
- `options.codemode: false` (without it the tool is only reachable through v2's `execute` tool, not by name);
- on a missing session ID, the exact error
  `State Inconsistency: 'sessionID' is undefined or null within the execution context.`;
- on success, `{ content: String(sessionID) }`.

The plugin id is not part of the frozen surface; it changed with the merge.
The single source of the surface in `src` is `src/domain/tool/SessionIdToolDefinition.ts`.

## 3. Safety invariants of the CLI — never trade these away

1. A source database is **only ever opened read-only**. Every copy is produced
   with `VACUUM INTO`.
2. The swap is **renames only**. The originals move into
   `db-backup-<timestamp>/`, never deleted.
3. The CLI **never kills a process**. It refuses while the guarded image runs
   (`opencode`, `opencode.exe` on Windows) and while any process holds the file:
   on Linux the `/proc/<pid>/fd` links of every process are compared with the
   database and its `-wal`/`-shm`/`-journal` sidecars (renaming an open file
   succeeds there, so a rename proves nothing); on Windows a rename probe is
   refused with EBUSY.
4. A verification failure **aborts before the swap** and leaves the originals
   untouched; the failed copy is kept beside the database for inspection.
5. Rollback always restores the originals and parks what was in place. It
   refuses while a restored store is held open, and — for the stores the running
   OpenCode itself uses (this user's data home: `$XDG_DATA_HOME/opencode/opencode.db`
   and `$XDG_DATA_HOME/cortexkit/magic-context/context.db`) — while OpenCode runs
   at all. A copy anywhere else is restored while OpenCode runs. Every store is
   checked before any is restored.
6. The live tier **never writes the live database**: it snapshots it with
   `VACUUM INTO` from a read-only connection.
7. A session sync **only ever writes copies it made itself**: both OpenCode
   stores and both Magic Context stores are copied with `VACUUM INTO`, the
   target copies must pass every check (`SyncSessionsUseCase`), then both are
   swapped in by renames into one `sync-backup-<timestamp>/`; when the second
   swap fails the first is undone. It refuses while a target store is held,
   when the two OpenCode stores are at different OpenCode migrations, or when
   there is too little space.
8. Reading a profile (`sessions`, the browser `tui`), `preflight` and copying a
   Magic Context store (`context copy`) open their sources **read-only** and are
   the only commands allowed while OpenCode runs. A store that cannot be opened
   in place is read from a private temporary copy, removed afterwards. The
   browser writes only when the user applies its queue (`a`), through the same
   use case as `sync` (whole sessions) and under rule 10; its dry run (`d`)
   writes only private copies.
9. Magic Context's own code runs **only on copies, only in a child process**
   whose `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` and
   `XDG_CONFIG_HOME` point into a throwaway sandbox
   (`InstalledMagicContextAdapter`); a store newer than the installed release is
   refused, never migrated down.
10. A Magic Context sync **writes only a working copy** of the target store,
    built from `VACUUM INTO` copies of both stores; it swaps the checked copy
    in by renames (`context-sync-backup-<timestamp>/`, undone by `rollback`),
    refuses while the target store is held open, and copies a session only when
    the target's message history holds every message the source's summaries
    point at (`MagicContextSyncService`). Session rows go into the tables
    Magic Context itself lists as session-scoped (`SESSION_SCOPED_TABLES`);
    caches, leases and in-progress work are cleared, never copied. A session
    Magic Context is working on (a wrapup, an unexpired history lease) is
    skipped, and a project Magic Context's own module manages
    (`authority_managed`, `authority_repair_pending`, its guard triggers on) is
    never written. Project state merges are idempotent: Magic Context's memory
    key, and the text of notes, primers and user memories, decide what is
    already there.
11. A sync **never re-serializes JSON** and never rewrites keys: it edits matched
   paths inside the raw text of non-key columns (`PathRewriter`), and copies
   only rows keyed by the synced sessions (plus the projects and instruction
   blobs they need); credentials, accounts and OpenCode's `migration` log are
   never touched.
12. **One writer per store.** Every command that writes a store (`run`,
    `rollback`, `sync`, `context sync`, the browser's apply) first takes
    `<store>.session-manager.lock` (`FsStoreLockAdapter`, created exclusively,
    holding pid, command and start time), for all its stores or none, and
    releases it however it ends. A second writer is refused with the holder named.
    A lock whose process no longer exists is removed and reported
    (`stale_locks_cleared`, `CLEARED stale lock …`); an unreadable lock is never
    removed. Dry runs take no lock.
13. `--strict` (`sync`, `context sync`) refuses the whole sync, before anything is
    written, when Magic Context is working on a requested session (rule 10's
    `busy`); without it that session's state is skipped and reported.
14. **Rebuilds never write a store.** `context wrapup|recomp` and the browser's
    `W`/`R` only send Magic Context's own command to the running OpenCode and
    read the store to follow it; the writing is Magic Context's, inside
    OpenCode. A session Magic Context already works on is refused, never
    interrupted; sessions run one at a time; the browser offers them only on
    the side showing this machine's own profile (not a snapshot), and only on a
    second press of the same key.
15. **Forks follow OpenCode's own layout** (`projectFork`, 2.0.26), checked row
    for row against OpenCode's fork in the live test: the server's fork through
    `fork`/`F`, or the offline fork `sync --diverged fork` writes (on copies, like
    any sync). Neither copies Magic Context state: Magic Context 0.47 inherits a
    fork's state from its parent itself on the fork's first prompt.

### The report JSON is a contract

Report keys are **snake_case** and identical to the original compactor's
(`page_size`, `freelist_count`, `vacuum_ms`, `target_bytes`, `integrity_ok`,
`source_rows`, …). `tests/e2e/maintenance/legacy-parity.test.ts` runs the frozen
original (`tests/support/maintenance/fixtures/legacy/`, kept verbatim) and this
CLI as real processes against identical databases and compares the preflight
report, the check lines, the run report (minus timings and free disk) and the
rollback output. The sync reports' keys follow the same rule and are defined
in `src/domain/model/SessionSync.ts` and `src/domain/model/MagicContextSync.ts`.

### Declared fault-injection seams (e2e only)

`DemandingSpacePolicy` (demands more space than any disk has) and
`TamperingSqlite` (really deletes a row from the copy after the vacuum), in
`tests/support/maintenance/faults.ts`; `FakeRuntime`
(`tests/support/maintenance/fakes/runtime.ts`: pins the timestamp, reports a
platform without adapters); and `makeMagicContextPackage`
(`tests/support/sessions/magic-context-package.ts`: a stand-in for the installed
Magic Context package with its exported store functions, backed by real SQLite).
Nothing else in the e2e tier is faked: swap-restore, migration and sync failures
are real filesystem and database conditions — a file in the backup's place, a
connection the test holds open, an SQLite trigger in the target store that
aborts a write or moves a summary's anchor.

## 4. Architecture law (strict hexagonal)

- Dependencies point inward only: `domain` ← `application` ← `infrastructure`,
  and `main` wires them. `src/domain` performs no I/O and imports no package;
  colours and view elements are type parameters.
- Ports are split one per file: `src/domain/ports/inbound` and
  `src/domain/ports/outbound`. Every outbound adapter and use case declares
  `implements` its port. Errors are one class per file under `src/domain/errors`.
- Imports in `src` use only the `@session-manager/*` alias; tests use it and
  `@test/*`. No relative imports.
- Every class has an explicit constructor. Only a composition root
  (`src/main/*-container.ts`) constructs adapters and use cases. A use case may
  import the *types* of the application services it composes; everything else
  it imports comes from `src/domain`.
- No runtime `@opencode/*` import in `src`; the v2 host API is typed
  structurally in `src/infrastructure/host/` (`V2ServerContext`,
  `V2TuiContext`, `V2Client`).
- Enforced by `tests/unit/architecture/imports.test.ts` and
  `tests/unit/architecture/solid-principles.test.ts`.

### One composition root per runtime

`src/main/server-container.ts` (v2 server), `src/main/tui-container.ts` (v2 TUI),
`src/main/v1-container.ts` (v1 TUI) and `src/main/cli-container.ts` (the CLI),
plus the CLI's per-platform halves `src/main/linux-container.ts` and
`src/main/win32-container.ts`. Measured: a shared root made the server
entry import the TUI view adapter, and `Bun.build` of the server entry then
failed on OpenTUI's native packages. `imports.test.ts` walks the server entry's
import graph and fails if a `.tsx` file or `tui-container.ts` appears in it.

### Platform law

Code for one operating system lives only in
`src/infrastructure/adapters/outbound/platform/<platform>/` and is wired only by
`src/main/<platform>-container.ts`, which `src/main/cli/platform.ts` imports on
demand (`await import`), so one platform never loads another's code. Linux:
`ProcProcessListAdapter` (`/proc/<pid>/comm`) and `ProcFdHoldersAdapter`
(`/proc/<pid>/fd`). Windows: `TasklistAdapter` and `RenameProbeHoldersAdapter`.
Both take their system root or executable as a constructor argument, so the unit
tier runs every platform's adapters on any machine. Enforced by
`tests/unit/maintenance/architecture.test.ts`.

### Storage: drizzle-orm through one engine, no SQL text elsewhere

Every store is read and written through **drizzle-orm** (`drizzle-orm/bun-sqlite`,
synchronous) and typed schemas; `src` holds **no SQL text** outside the store
engine, `src/infrastructure/adapters/outbound/sqlite/engine/Store.ts`.
`tests/unit/architecture/imports.test.ts` fails on a `bun:sqlite` import, an
import of drizzle's `sql` template, or `.query(`/`.prepare(`/`.exec(` with SQL
text anywhere else. The engine owns what no query builder expresses: PRAGMAs,
`VACUUM INTO`, `sqlite_master`, and reading a table only known at run time
(compaction's fingerprint).

- **Schemas are generated, never hand-written**: `bun run schema -- fixture
  <store.db> <out.sql>` (`scripts/schema.ts`) dumps a real store's `CREATE` statements;
  `bun run schema -- generate <fixture.sql> <out.ts> <title>` writes the
  Drizzle tables (`schema/opencode.ts` from `opencode-2.0.24.sql`,
  `schema/magic-context.ts` from `magic-context-95.sql`, in
  `tests/support/sessions/`). Every column keeps its store name; INTEGER
  columns are BigInt (`bigInteger`), untyped ones pass through (`value`).
  `tests/unit/sessions/schema.test.ts` regenerates both and fails on drift.
- **Integers are read exactly** (`safeIntegers`): a copied row is what was stored.
- **The file is released on `close()`**: drizzle prepares every statement
  through the client's `prepare()`, which the engine points at `query()`. Bun
  closes with `sqlite3_close_v2`, which keeps the file open while a `prepare()`d
  statement is unfinalized (measured, `/proc/self/fd`); the "held open" guard
  would then see the process's own connection.
- **Inserts write exactly the columns a row carries** (`Store.insert`, through
  a table narrowed to those columns): drizzle would write NULL into every column
  a row leaves out, overriding SQLite's defaults, and name columns an older
  store lacks.
- **A select names only columns the store has** (`Store.selection`, or
  `Store.pick`, which refuses a missing one): SQLite reads an unknown
  double-quoted column name as a string literal, so naming a column a store
  lacks would return the column's name as its value.
- **Unknown data is refused**: a sync refuses a store whose copied tables hold a
  column the schema lacks, or another table keyed by the session
  (`UnknownStoreSchemaError`): copying through the schema would leave it behind.
  Regenerate the schemas from the newer store and review what the new data is.

Bulk writes in tests go inside a transaction; one fsync per insert made a
4 500-row test take 30 s.

### The session browser (`tui`)

Its state is pure: `src/domain/model/BrowserState.ts` (the data),
`BrowserRows.ts` (the left, right and paired lists: grouping, filter, matching
by session id, one row per id), `BrowserQueue.ts` (whole-session syncs, each
with its Magic Context preference and the last run's result) and
`Browser.ts` (the reducer: cursors, linked panes, layout, marks, queue view);
`src/infrastructure/adapters/inbound/manager-tui/` turns keys into
actions (`keys.ts`), state into text (`format.ts`) and paints it
(`OpenTuiBrowser.tsx`, the only file there that imports OpenTUI at run time).
Health: `BrowseCliAdapter` runs `VerifyProfileUseCase` on each side it opens or
the apply read again, and attaches `healthBySession(report)` (`Verify.ts`) to the
`OpenedProfile`; `format.ts` turns it into the list's health column
(`rowSeverity`, `HEALTH_MARKS`), the pane totals and the details' health line.
The header: `MagicContextVersionsUseCase` (`OpencodeMagicContextConfigAdapter`
reads the pinned spec and the installed copy, `NpmRegistryAdapter` the `latest`
dist-tag); the view asks `controls.release()` once mounted and dispatches a
`release` action. `resize` and `release` are background actions: they keep the
user's notice (`Browser.ts`, `BACKGROUND`).
Applying is asked of the program around the view through `BrowserControls`
(`controls.ts`), wired by `BrowseCliAdapter` to `ApplyQueueUseCase`, which runs
one `SyncSessionsUseCase` per direction that has entries (left to right first,
with the `--map` rules, the queue's scope and each entry's preference as
`preferFor`), reads each changed side again and returns lines for a person plus
what the run did with each session (`planned`). `BrowseCliAdapter` prints the
lines of every applied sync once the browser has closed. The view
dispatches a `notice` first and starts the work after a short timer (`PAINT_BEFORE_WORK_MS`), so "Applying…"
is painted before the synchronous work blocks; the outcome arrives as an
`applied` action (a change clears the queue and replaces the side's catalog).
Tests that wait on that timer use `waitForText` (`tests/support/sessions/frames.ts`):
OpenTUI's `waitForFrame` renders passes back to back and cannot see work behind a
timer.

It bundles its own Solid and OpenTUI: `scripts/build.mjs` compiles it with
OpenTUI's Solid transform, and `bunfig.toml` preloads the same transform for
`bun run cli`. The compiled executable is built with `autoloadBunfig`,
`autoloadDotenv`, `autoloadTsconfig` and `autoloadPackageJson` off: it once
read the preload of a `bunfig.toml` in the folder it was started from, and
failed. OpenTUI's native library is embedded in the executable.

### The home directory is a port

Bun's `os.homedir()` caches its first answer and ignores a later `HOME`
(measured: a `~/` test path was created in the real home directory). The `~`
base therefore comes from `HomeDirectoryPort`
(`SystemHomeDirectoryAdapter` reads `HOME`/`USERPROFILE` per call), and every
test that expands `~` points `HOME` at a temporary directory.

### Source map

Every file under `src`, by layer (the docs lint fails when one is missing here).
Areas: **plugin** (session id, transfer), **maintenance** (compaction),
**sessions** (profiles, browser, sync, Magic Context).

**`src/domain/model`** — plain data and pure functions.

| File | Area | Role |
|---|---|---|
| `Browser.ts` | sessions | the browser reducer (`createBrowser`, `reduce`): cursors, linked panes, layout, marks, queue view, apply results |
| `BrowserState.ts` | sessions | the browser's state types |
| `BrowserRows.ts` | sessions | the left, right and paired lists: grouping by folder, filter, matching by session id |
| `BrowserQueue.ts` | sessions | the queue of whole-session syncs, their Magic Context preference and scope; `requestsFor` turns it into session ids and `preferFor` per direction |
| `Profile.ts` | sessions | a profile (data home → `opencode.db` + `context.db`), `profileAt`, `profileOfFiles`, `defaultDataHome` |
| `SessionCatalog.ts` | sessions | stored sessions (v1/v2), Magic Context counts per session, the joined catalog |
| `MagicContextSync.ts` | sessions | sync requests and resolutions (`replace`, `skip`, `further`), sides, history relation (`relationOf`), harness labels, `failedChecks`, the sync report and its summary for a person |
| `MagicContextRelease.ts` | sessions | the installed Magic Context release, an upgrade's outcome, the `context copy` report |
| `PathMapping.ts` | sessions | path mapping (a Windows profile → a home, folder relocations), `GLOBAL_PROJECT`, the project OpenCode derives for a folder |
| `SessionSync.ts` | sessions | session sync input, map rules, `--prefer`, the action per history relation (`actionFor`), the report |
| `Verify.ts` | sessions | `verify`: finding kinds and their severity, a session's Magic Context vitals, the report and its text (`verifyLines`) |
| `Build.ts` | maintenance | the six checks of a compacted copy |
| `Database.ts` | maintenance | page statistics, schema, header and per-table fingerprints of a database |
| `DatabasePaths.ts` | all | `baseName`, `dirName`, `joinPath` for either separator, so inner layers never import `node:path` |
| `Sidecars.ts` | maintenance | a database's `-wal`/`-shm`/`-journal` sidecars |
| `StoreLock.ts` | maintenance, sessions | a store's lock: its owner (pid, command, start), a stale lock removed, `lockFileOf` |
| `Paths.ts` | plugin | `~` expansion and abbreviation |
| `Session.ts` | plugin | session summaries, projects, transfer and move results, picker options |
| `SessionId.ts` | plugin | the session-id guard and sidebar text |
| `SidebarEntry.ts` | plugin | one sidebar line |

**`src/domain/services`** — pure rules.

| File | Area | Role |
|---|---|---|
| `PathRewriter.ts` | sessions | `TextRewriter`: rewrites Windows profile paths in text, through nested JSON escaping; counts what is left |
| `WindowsMapping.ts` | sessions | the mapping a session's own folders imply (Windows profile → this home, plus a moved folder) |
| `MapRules.ts` | sessions | `--map` rules → a `PathMapping` (`parseMapRule`, `mappingFromRules`, `NO_WINDOWS_PROFILE`) |
| `Versions.ts` | sessions | `compareVersions` (dotted numeric versions) |
| `Fork.ts` (model) | sessions | OpenCode 2.0.26's fork rules: `forkTitle`, `isSettled` (what a fork copies), `opencodeId` (OpenCode's id format), slug words, the `fork` report |
| `Rebuild.ts` (model) | sessions | `/ctx-wrapup` / `/ctx-recomp` through the server: snapshots, `phaseOf`, statuses, report text, poll/grace/timeout defaults |
| `Jsonc.ts` | sessions | `stripComments`, `pinnedMagicContext` (the spec `opencode.jsonc` pins), `MAGIC_CONTEXT_PACKAGE` |
| `GitRemote.ts` | sessions | a remote URL in the form OpenCode hashes into a project id |
| `PosixPaths.ts` | sessions | `isWithin`, `sessionSubpath` |
| `FingerprintComparer.ts` | maintenance | names every difference between two database fingerprints |
| `ParityPolicy.ts` | maintenance | whether a build passed (strict offline, drift-tolerant rehearsal) |
| `RequiredSpacePolicy.ts` | maintenance | free space a compaction needs |

**`src/domain/errors`** — one class per file: `DatabaseError.ts`,
`DatabaseHeldError.ts`, `DatabaseNotFoundError.ts`, `InsufficientSpaceError.ts`,
`MissingOriginalError.ts`, `ProcessRunningError.ts`, `SwapFailedError.ts`,
`TargetExistsError.ts`, `UnsupportedPlatformError.ts`, `StoreLockedError.ts` (maintenance);
`MagicContextFormatMismatchError.ts`, `MagicContextTooNewError.ts`,
`MagicContextUnavailableError.ts`, `MagicContextUpgradeError.ts`,
`ProfileUnreadableError.ts`, `SyncVerificationError.ts`,
`InvalidMapRuleError.ts`, `OpenCodeFormatMismatchError.ts`,
`UnknownStoreSchemaError.ts`, `BusySessionsError.ts`, `ServerNotFoundError.ts`,
`ServerRefusedError.ts` (sessions);
`InvalidDirectoryError.ts`, `MissingSessionIdError.ts`,
`SessionNotFoundError.ts` (plugin).

**`src/domain/tool`** — `SessionIdToolDefinition.ts`, the frozen tool surface.

**`src/domain/ports/inbound`** — one per use case: `CompactPort.ts`,
`PreflightPort.ts`, `RehearsePort.ts`, `RollbackPort.ts` (maintenance);
`OpenProfilePort.ts`, `CatalogProfilePort.ts`, `CopyMagicContextPort.ts`,
`SyncMagicContextPort.ts`, `SyncSessionsPort.ts`, `ApplyQueuePort.ts`, `VerifyProfilePort.ts`,
`MagicContextVersionsPort.ts`, `RebuildContextPort.ts`, `ForkSessionPort.ts`
(sessions); `ResolveSessionIdToolPort.ts`, `RenderSidebarEntryPort.ts`,
`MoveSessionPort.ts`, `TransferSessionPort.ts`, `BuildDirectoryOptionsPort.ts`
(plugin).

**`src/domain/ports/outbound`** — what the inner layers need from outside:
`SqlitePort.ts`, `ProjectIdentityPort.ts`,
`ProcessListPort.ts`, `DatabaseHoldersPort.ts`, `MaintenanceFileSystemPort.ts`,
`ReportSinkPort.ts`, `RuntimePort.ts`, `OutputPort.ts`, `StoreLockPort.ts` (maintenance and the
program); `SessionStorePort.ts`, `MagicContextStorePort.ts`,
`MagicContextSyncStorePort.ts`, `SessionSyncStorePort.ts`, `MagicContextReleasePort.ts`,
`MagicContextIdentityPort.ts`, `MagicContextConfigPort.ts`, `PublishedVersionPort.ts`, `OpencodeServerPort.ts`,
`MagicContextProgressPort.ts`, `TimerPort.ts`, `IdentifiersPort.ts` (sessions); `SessionHostPort.ts`,
`SessionDbPort.ts`, `ProjectResolverPort.ts`, `FileSystemPort.ts`,
`KnownDirectoriesPort.ts`, `HomeDirectoryPort.ts`, `ThemePalettePort.ts`,
`SidebarViewPort.ts` (plugin).

**`src/application`** — use cases and the services they compose.

| File | Area | Role |
|---|---|---|
| `PreflightUseCase.ts` | maintenance | read-only sizes, page statistics, free disk, running OpenCode |
| `RehearseUseCase.ts` | maintenance | build and check a compacted copy away from the database |
| `CompactUseCase.ts` | maintenance | guard, build, check, swap, write evidence |
| `RollbackUseCase.ts` | maintenance, sessions | put a backup's originals back (an `opencode.db`, a `context.db`, or both: `executeAll`) |
| `BuildAndVerifyService.ts` | maintenance | `VACUUM INTO` and the six checks |
| `GuardService.ts` | maintenance, sessions | refuse while OpenCode runs, a process holds the file, or space is short |
| `StoreLockService.ts` | maintenance, sessions | run a write under its stores' locks (`StoreLockPort`), released however it ends |
| `SwapService.ts` | maintenance, sessions | rename-only swap into a backup folder, restored on failure; `undo` reverses a finished swap |
| `DatabaseSizesService.ts` | maintenance | sizes of a database and its sidecars |
| `OpenProfileUseCase.ts` | sessions | open a profile read-only, from a snapshot when needed, and close it |
| `CatalogProfileUseCase.ts` | sessions | join a profile's sessions with their Magic Context counts |
| `VerifyProfileUseCase.ts` | sessions | `verify`, read-only: both stores' integrity and foreign keys; per session the project OpenCode and Magic Context derive, summaries pointing outside the history, how far summaries lag, the last prompt's size, wrapup markers; Magic Context state of sessions OpenCode lacks |
| `CopyMagicContextUseCase.ts` | sessions | copy a store and upgrade the copy with the installed Magic Context |
| `MagicContextSyncService.ts` | sessions | build and check a working copy of a target Magic Context store holding sessions' state and, for scope `all`, their projects' state |
| `SyncMagicContextUseCase.ts` | sessions | `context sync`: the service's copy swapped in, with a backup |
| `SyncSessionsUseCase.ts` | sessions | `sync`: whole sessions (OpenCode rows + Magic Context state) into working copies of both target stores, checked, swapped in together |
| `ApplyQueueUseCase.ts` | sessions | run the browser's queue as one whole-session sync per direction |
| `ForkSessionUseCase.ts` | sessions | `fork` and the browser's `F`: OpenCode's own fork through the running server (writes nothing itself) |
| `RebuildContextUseCase.ts` | sessions | `context wrapup|recomp` and the browser's `W`/`R`: one session at a time through the OpenCode server, followed in the store (read-only); refuses a session Magic Context already works on |
| `MagicContextVersionsUseCase.ts` | sessions | the Magic Context OpenCode loads here and the newest on npm (the browser's header) |
| `ResolveSessionIdToolUseCase.ts` | plugin | the `session-id` tool |
| `RenderSidebarEntryUseCase.ts` | plugin | the sidebar line |
| `MoveSessionUseCase.ts` | plugin | v2 transfer through the host |
| `TransferSessionUseCase.ts` | plugin | v1 transfer through the store |
| `BuildDirectoryOptionsUseCase.ts` | plugin | the transfer picker's options |

**`src/infrastructure/adapters/inbound`**

| File | Role |
|---|---|
| `cli/CliRouter.ts` | sends each command family to its adapter |
| `cli/CompactCliAdapter.ts` | `preflight`, `rehearse`, `run`, `rollback` |
| `cli/SyncCliAdapter.ts` | `sync` |
| `cli/ForkCliAdapter.ts` | `fork` |
| `cli/arguments.ts` | `parseOptions`: `--name value` options and flags |
| `cli/SessionsCliAdapter.ts` | `sessions` |
| `cli/VerifyCliAdapter.ts` | `verify` |
| `cli/ContextCliAdapter.ts` | `context copy`, `context sync` |
| `cli/BrowseCliAdapter.ts` | `tui`: opens the profiles, shows the browser, wires its controls |
| `cli/HelpCliAdapter.ts` | `--help`, `--version` |
| `manager-tui/OpenTuiBrowser.tsx` | the browser view (the only file there importing OpenTUI at run time) |
| `manager-tui/keys.ts` | keys → commands |
| `manager-tui/format.ts` | state → text |
| `manager-tui/controls.ts` | `BrowserControls`: what the view asks of the program |
| `server/SessionIdToolV2Adapter.ts` | registers the `session-id` tool (v2) |
| `tui/SessionIdSidebarSlotV2Adapter.ts` | the sidebar slot (v2) |
| `tui/SessionTransferV2TuiAdapter.ts`, `tui/SessionTransferV1TuiAdapter.ts` | `/transfer-session` (v2, v1) |

**`src/infrastructure/adapters/outbound`**

| File | Role |
|---|---|
| `sqlite/BunSqliteAdapter.ts` | read-only reads, `VACUUM INTO`, fingerprints, checks |
| `sqlite/BunSessionSyncStoreAdapter.ts` | reads OpenCode stores for a sync, writes session families into a working copy |
| `sqlite/engine/Store.ts` | the store engine: opens a store (`openStore`, `withStore`), drizzle-orm over it, and the only SQL text in `src` |
| `sqlite/schema/opencode.ts`, `sqlite/schema/magic-context.ts` | generated Drizzle tables of OpenCode 2.0.24 and Magic Context format 95 (a superset of 94: the code reads only the tables and columns a store has, so 94 and 95 stores both work) |
| `sqlite/schema/value.ts` | the `bigInteger` and pass-through `value` column types the generated schemas use |
| `sqlite/BunSessionStoreAdapter.ts` | reads `opencode.db` sessions and their message ids |
| `sqlite/BunMagicContextStoreAdapter.ts` | reads a `context.db`'s counts and format |
| `sqlite/BunMagicContextSyncStoreAdapter.ts` | reads and writes session state in `context.db` working copies |
| `sqlite/SqliteSessionDbAdapter.ts` | the OpenCode 1 store, for the v1 transfer |
| `magic-context/InstalledMagicContextAdapter.ts` | finds the installed Magic Context and runs its store code in a sandboxed child process |
| `magic-context/OpencodeMagicContextConfigAdapter.ts` | the spec `opencode.jsonc` pins and the copy OpenCode installed for it |
| `opencode2/HttpOpencodeServerAdapter.ts` | the server `service.json` records, and its command endpoint (HTTP Basic `opencode`) |
| `sqlite/BunMagicContextProgressAdapter.ts` | a session's Magic Context progress (summaries, reach, wrapup marker, lease, staged recomp rows, historian runs since a moment), read-only |
| `system/OpencodeIdentifiersAdapter.ts` | new session ids, message bases and slugs in OpenCode's format (for offline forks) |
| `system/SystemTimerAdapter.ts` | waiting between looks at a running rebuild (tests pass a timer that does not wait) |
| `npm/NpmRegistryAdapter.ts` | a package's `latest` dist-tag on an npm registry (time-limited) |
| `magic-context/MagicContextIdentityAdapter.ts` | Magic Context's project identity of a folder |
| `project/GitProjectIdentityAdapter.ts` | OpenCode 2's project id of a folder |
| `project/ProjectResolverAdapter.ts` | OpenCode 1.18.32's project resolution |
| `platform/linux/ProcProcessListAdapter.ts`, `platform/linux/ProcFdHoldersAdapter.ts`, `platform/linux/ProcFs.ts` | Linux: running processes and file holders from `/proc` |
| `platform/win32/TasklistAdapter.ts`, `platform/win32/RenameProbeHoldersAdapter.ts` | Windows: `tasklist` and the rename probe |
| `fs/NodeMaintenanceFileSystemAdapter.ts` | the program's file operations |
| `fs/FsStoreLockAdapter.ts` | `<store>.session-manager.lock` files: exclusive create, stale-owner check (`kill(pid, 0)`), release only by the owner |
| `fs/NodeFileSystemAdapter.ts` | the plugin's file operations |
| `fs/JsonReportAdapter.ts` | JSON evidence files |
| `system/ConsoleOutputAdapter.ts` | the program's stdout |
| `system/SystemClockAdapter.ts` | time, process id, platform, temp and home folders |
| `system/SystemHomeDirectoryAdapter.ts` | the home folder, read per call |
| `opencode2/OpenCode2HostAdapter.ts` | the OpenCode 2 host API |
| `tui/HostThemePaletteV2Adapter.ts`, `tui/OpenTuiSidebarViewAdapter.tsx` | theme colours and the sidebar line view |

**`src/infrastructure/host`** — the v2 host API typed structurally:
`V2ServerContext.ts`, `V2TuiContext.ts`, `V2Client.ts`.

**`src/main`** — composition roots and entries: `server-container.ts`,
`tui-container.ts`, `v1-container.ts`, `cli-container.ts`,
`linux-container.ts`, `win32-container.ts`, `plugin-id.ts` (plugin ids);
`v2/server.ts`, `v2/tui.ts`, `v1/server.ts`, `v1/tui.ts`; `cli/cli.ts` (the
program's entry), `cli/platform.ts` (loads one platform's container).

## 5. Host behaviour this plugin relies on

- **Sidebar.** The ID line is a `prepend` on `sidebar.content`. The title box
  has no plugin slot, so the ID is the first row of the sidebar scroll area,
  directly under the title. Do not try to move it into the title box.
- **Keymap.** v2 runs `setup()` outside the component tree, where
  `keymap.layer` throws "Keymap.Provider is missing", so the transfer command is
  registered from an `app` slot render.
- **v2 move.** `session.move` re-resolves the project and informs the agent,
  but rejects a missing folder; the use case creates it first. No database write
  on v2.
- **v1 move.** No move API: the v1 lane writes the store and must compute the
  project id exactly like v1.18.32 (`packages/core/src/project.ts` and
  `git.ts`): origin remote of any scheme except `file:` → `sha1("git-remote:<host>/<path>")`,
  else `<git-common-dir>/opencode`, else the first sorted root commit, else
  `global`; outside any repository → `global` at `/`.
- **Shared runtime.** The v2 TUI shares one Solid/OpenTUI runtime with plugins
  through `opentui:runtime-module:*`. `scripts/build.mjs` keeps those external
  and fails if the bundle imports `solid-js` or `@opentui/*` by name. Node
  built-ins (`node:fs`, `node:path`, …) are allowed: the TUI runs on Bun.
- **Dialog limits.** The plugin select dialog exposes no filter handle or key
  bindings, so live path autocomplete and arrow-key drill-down are impossible
  from a plugin; do not re-mount the dialog per keystroke (it clears the filter).
- `plugin.list` does not wait for activation; `integration.list` does, so tests
  call it first. The CLI `session list` can answer `[]` for a just-created
  session; tests use `api session.list`.

## 6. Tests: `tests/{unit,component,e2e,live}`

| Tier | What runs | Coverage |
|---|---|---|
| unit | one class at a time with stand-ins; the architecture, SOLID, platform, host-fixture and coverage-completeness gates | **measured, 100%** |
| component | the wired plugin painted by the real OpenTUI renderer; tool parity; real SQLite compacting real databases | not gated |
| e2e | `src` driven end to end in-process: the v2 entries through the real 2.0.14 `Host.resolve`/`Host.load` and slot resolver; the v1 entries over a real SQLite store, real directories and real git repositories; the CLI container over real databases (OpenCode 2.0.24's schema), Magic Context stores, folders and git repositories, legacy parity, and the browser applying its queue in OpenTUI's test renderer | **measured, 100%, per platform** |
| live | the real `opencode` executable, the built bundles, the installers, the real TUI in a pseudo-terminal (sidebar line and `/transfer-session`); the CLI on a snapshot of the real `opencode.db`; the compiled browser in a pseudo-terminal; the installed Magic Context upgrading and opening real store copies; a real `sync` and `context sync` into a copy of this machine's profile, listed afterwards by a sandboxed OpenCode (when `OPENCODE_SM_LIVE_OTHER_PROFILE` is set). Variables: README, *Environment variables* | not measurable |

Coverage tools only see code executed in the test process, so "e2e" is the
in-process real-host tier and "live" is the real external process.

### Test support (`tests/support`)

| File | What it gives a test |
|---|---|
| `source-files.ts` | every `src` file, for the architecture and completeness gates |
| `fakes/hosts.ts`, `fakes/transfer-ports.ts` | stand-ins for the OpenCode hosts and the transfer ports |
| `fixtures/host-2.0.14/` | verbatim OpenCode 2.0.14 host sources (re-extracted, never edited), so tests run the host's own rules |
| `fixtures/legacy-session-id-index.js`, `fixtures/legacy-session-id-index.d.ts` | the hand-written tool this plugin replaced, kept verbatim |
| `live/process.ts` | runs processes, finds OpenCode, `removeTemporary()`/`removeTemporarySync()` |
| `live/isolated-host.ts` | an OpenCode with every XDG folder, its home and server password private to the test |
| `live/load-built-tui.ts` | loads the built v2 TUI bundle |
| `live/drive-tui.mjs`, `live/drive-transfer.mjs`, `live/drive-browser.mjs` | drive a real TUI (OpenCode's, or the compiled browser) in a pseudo-terminal with `node-pty` and a headless terminal |
| `maintenance/fakes/*.ts` | stand-ins for the maintenance ports: file system, holders, processes, SQLite, output, report sink, runtime, store locks (`locks.ts`: `FakeStoreLock`, `fakeLocks`) |
| `maintenance/faults.ts` | the declared fault-injection seams (`DemandingSpacePolicy`, `TamperingSqlite`) |
| `maintenance/database.ts` | real OpenCode-shaped databases for compaction |
| `maintenance/repositories.ts` | real git repositories (`makeRepository`), `sha1`, read-only `query` |
| `maintenance/console.ts`, `maintenance/temporary.ts`, `maintenance/platform.ts` | captured output, guarded temporary folders, facts about the machine |
| `maintenance/fixtures/legacy/` | the original compactor, kept verbatim for the parity test |
| `sessions/stores.ts` | small `opencode.db` and `context.db` stores with given sessions and counts |
| `sessions/sync-stores.ts` | Magic Context stores with the real schema of their format (`SCHEMA_95` from format 95 on, else `SCHEMA_94`), triggers included, and per-session state (`makeSyncContextStore`, `rowsOf`); `without` drops tables and the triggers that write into them |
| `sessions/opencode-stores.ts`, `sessions/opencode-2.0.24.sql` | stores with OpenCode 2.0.24's real schema (every `CREATE`, read from a live store with `select sql from sqlite_master`; refresh it the same way when OpenCode changes its schema) and given projects and sessions, optionally with OpenCode 1 rows and every per-session table filled (`makeOpenCode2Store`) |
| `sessions/magic-context-94.sql` | every `CREATE` statement (tables, virtual tables, indexes, triggers) of a real Magic Context 0.45.0 store, written by `bun run schema -- fixture`; refresh it the same way when Magic Context changes format, then regenerate `schema/magic-context.ts` |
| `sessions/magic-context-95.sql` | the same for a real Magic Context 0.47.0 store (format 95: format 94 plus `temporal_decisions` and `git_commit_fts_rowid_map`, and changed indexes); `schema/magic-context.ts` is generated from it |
| `sessions/magic-context-package.ts` | a stand-in Magic Context package (declared seam) |
| `sessions/catalogs.ts` | catalogued sessions and opened profiles for browser tests |
| `sessions/sql-script.ts` | `runScript`, `statementsOf`: a fixture's extra SQL run one statement at a time (Bun 1.4's `exec` ignores errors of all but the last statement of a script) |
| `sessions/frames.ts` | `waitForText`: waits in real time for text in OpenTUI's test renderer |
| `sessions/terminal-streams.ts` | a silent terminal for OpenTUI's renderer |

### Coverage law

`bun run coverage:unit` (`bunfig.coverage.toml`) and `bun run coverage:e2e`
(`bunfig.coverage.e2e-<platform>.toml`, picked by `scripts/coverage.mjs`) each
require 100 % lines and functions on every `src` file. The e2e gate is per
platform: the real platform adapters only work on their own platform, so each
platform's e2e run leaves the other platforms' adapter folders and containers to
theirs, and a release needs the e2e gate green on Linux and on Windows. Bun
instruments only loaded files, so each measured tier has a completeness test
that imports every `src` file (the e2e one, every file of its platform). Never claim coverage without reading the report. There are no
coverage-ignore comments: unreachable code is removed by code shape.

## 7. Test safety (learned the hard way)

A teardown once ran `fs.rm("", { recursive: true, force: true })` — `""`
resolves to the working directory — and deleted a repository, `.git` included.

- Every recursive delete in a test goes through `removeTemporary()` /
  `removeTemporarySync()` in `tests/support/live/process.ts` (or
  `removeTemporary()` in `tests/support/maintenance/temporary.ts`), which refuse
  any path not strictly inside the OS temporary directory.
- A `beforeAll`/`beforeEach` that can throw leaves its variables unset; the
  teardown must treat each as possibly empty.
- No tier touches the real `opencode.db`, the real config, or the real
  `~/.config/opencode/plugins` (v2 hot-activates whatever lands there): the
  live host runs under fully isolated XDG directories.

## 8. Deployment

`bun run install:plugin:v2` / `install:plugin:v1` build, then copy the lane's
files into `<plugins>` (temp + rename). `<plugins>` is `OPENCODE_V2_PLUGIN_DIR`
/ `OPENCODE_V1_PLUGIN_DIR`, else `$XDG_CONFIG_HOME/opencode/plugins`. Installing
a lane removes the other lane's files and the predecessors' (`session-id/`,
`sessions-transfer/`, `sessions-transfer{,.tui}.js`), exact names only; a
non-empty folder is never removed and no configuration is edited.
`bun run install:cli` builds, then copies `dist/cli/opencode-session-manager`
to `OPENCODE_SESSION_MANAGER_BIN_DIR` (default `~/.local/bin`) under a temporary
name and renames it into place (a copy, never a link, so a rebuild cannot break
the command in use); `validate:installed:cli` byte-compares it and runs
`--version` (`scripts/install-cli.mjs`, live-tested in a throwaway folder).
`validate:installed:v2` / `validate:installed:v1` byte-compare the installed
files with `dist/`, check the module shapes, and fail if another form is present.

## 9. Documents

`README.md` is for users, this file for whoever changes the code. Everything else
lives under `docs/`, named `YYYY-MM-DD-HH-MM-<name>.md` with the real time:
`docs/plans/` (approved plans), `docs/research/` (designs and evaluations before a
plan), `docs/reference/` (ground truth: external formats, frozen predecessors'
docs), `docs/issues/` (bugs being chased), `docs/sessions/` (an agent session's
state), `docs/temp/` (scratch). `bun run lint:diagrams` checks fences, mermaid
blocks, that referenced paths exist (except under `docs/reference/`), that every
`bun run` script named exists, and that README and this file name every `src`
file, every `tests/support` file, every `package.json` script and every
environment variable the code reads.

## 10. Definition of done

A change is done only when:

1. `bun run typecheck` is clean;
2. `bun run test` passes all four tiers with 0 failures;
3. `bun run coverage` shows 100 % lines and functions per `src` file on both
   measured tiers;
4. `bun run build` succeeds and a staged install validates byte-identical to the build;
5. `bun run lint:diagrams` passes and README / AGENTS / package.json / code agree;
6. a secrets and personal-data scan of the staged diff is clean and the diff has been read.

## 11. Git

Dev dependencies are pinned exactly (no `^`/`~`/`latest`); the built plugin and
the compiled CLI have no runtime dependencies. `node_modules/`, `dist/`, `build/`, `coverage/` are
ignored. History is append-only; pushing needs the owner's explicit go-ahead.
