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
| CLI | `opencode-session-manager` (`dist/cli/`, `bun build --compile`), entry `src/main/cli/cli.ts` | `<preflight\|rehearse\|run\|rollback <backupDir>> [--db <path>] [--keep]`, `migrate <rehearse\|run> --from <db>... --windows-user <name> [--drive C] [--mount <dir>]... [--relocate <from>=<to>]... [--home <dir>] [--db <path>] [--keep]`, `sessions [--data <dataHome>] [--json]` (read-only), `context copy --from <context.db> --to <file>`, `tui [--left <dataHome>] [--right <dataHome>]` (read-only session browser) |
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
5. Rollback always restores the originals and parks what was in place.
6. The live tier **never writes the live database**: it snapshots it with
   `VACUUM INTO` from a read-only connection.
7. A migration **only ever writes copies it made itself**, and the result passes
   the seven gates of `MigrationVerifier` before the same swap.
8. Reading a profile (`sessions`, `tui`) and copying a Magic Context store
   (`context copy`) open their sources **read-only**; they are the only
   commands allowed while OpenCode runs. A store that cannot be opened in place
   is read from a private temporary copy, removed afterwards.
9. Magic Context's own code runs **only on copies, only in a child process**
   whose `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` and
   `XDG_CONFIG_HOME` point into a throwaway sandbox
   (`InstalledMagicContextAdapter`); a store newer than the installed release is
   refused, never migrated down.
10. A migration **never rewrites credentials** (`account`, `control_account`,
   `credential`) or OpenCode's own `migration` log, and never re-serializes
   JSON: it edits matched paths inside the raw text.

### The report JSON is a contract

Report keys are **snake_case** and identical to the original compactor's
(`page_size`, `freelist_count`, `vacuum_ms`, `target_bytes`, `integrity_ok`,
`source_rows`, …). `tests/e2e/maintenance/legacy-parity.test.ts` runs the frozen
original (`tests/support/maintenance/fixtures/legacy/`, kept verbatim) and this
CLI as real processes against identical databases and compares the preflight
report, the check lines, the run report (minus timings and free disk) and the
rollback output. The migration report's keys follow the same rule and are
defined in `src/domain/model/Migration.ts`.

### Declared fault-injection seams (e2e only)

`DemandingSpacePolicy` (demands more space than any disk has),
`TamperingSqlite` (really deletes a row from the copy after the vacuum) and
`FakeRuntime` (pins the timestamp, reports a platform without adapters), all in
`tests/support/maintenance/`. Nothing else in the e2e tier is faked; the
swap-restore and migration failures are real filesystem and database conditions.

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

### SQLite under Bun

Use `Database.query()`, never `prepare()`: Bun closes a connection with
`sqlite3_close_v2`, which keeps the file open until every prepared statement is
finalized, and `query()` statements are finalized by `close()` (measured: a
closed connection with one `prepare()`d statement still held the file, and the
guard then refused the test's own database as "held open"). Bulk writes in tests
go inside a transaction; one fsync per insert made a 4 500-row test take 30 s.

### The session browser (`tui`)

Its state is pure (`src/domain/model/Browser.ts`: rows, cursor, window, filter,
reducer); `src/infrastructure/adapters/inbound/manager-tui/` turns keys into
actions (`keys.ts`), state into text (`format.ts`) and paints it
(`OpenTuiBrowser.tsx`, the only file there that imports OpenTUI at run time).
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
| component | the wired plugin painted by the real OpenTUI renderer; tool parity; real SQLite compacting and migrating real databases | not gated |
| e2e | `src` driven end to end in-process: the v2 entries through the real 2.0.14 `Host.resolve`/`Host.load` and slot resolver; the v1 entries over a real SQLite store, real directories and real git repositories; the CLI container over real databases, folders and git repositories, and legacy parity | **measured, 100%, per platform** |
| live | the real `opencode` executable, the built bundles, the installer, the real TUI in a pseudo-terminal (sidebar line and `/transfer-session`); the CLI on a snapshot of the real `opencode.db`, and a real migration listed by a sandboxed OpenCode (when `OPENCODE_DB_MIGRATE_LIVE_SOURCE` and `OPENCODE_DB_MIGRATE_LIVE_USER` are set) | not measurable |

Coverage tools only see code executed in the test process, so "e2e" is the
in-process real-host tier and "live" is the real external process.

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

## 9. Definition of done

A change is done only when:

1. `bun run typecheck` is clean;
2. `bun run test` passes all four tiers with 0 failures;
3. `bun run coverage` shows 100 % lines and functions per `src` file on both
   measured tiers;
4. `bun run build` succeeds and a staged install validates byte-identical to the build;
5. `bun run lint:diagrams` passes and README / AGENTS / package.json / code agree;
6. a secrets and personal-data scan of the staged diff is clean and the diff has been read.

## 10. Git

Dev dependencies are pinned exactly (no `^`/`~`/`latest`); the built plugin and
the compiled CLI have no runtime dependencies. `node_modules/`, `dist/`, `build/`, `coverage/` are
ignored. History is append-only; pushing needs the owner's explicit go-ahead.
