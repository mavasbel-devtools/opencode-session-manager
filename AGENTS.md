# AGENTS.md — engineering contract for opencode-session-manager

This file is the authority for how this repository is built and changed. It is
enforced by tests, not by convention. If a rule here and the code disagree, the
code is wrong until one of them is deliberately changed.

## 1. Fixed identity

| Thing | Value | Do not change without a migration |
|---|---|---|
| package name | `opencode-session-manager` | — |
| v2 plugin id | `session-manager` (server and TUI entries) | — |
| tool name | `session-id` | the global AGENTS.md startup routine invokes the tool by this name |
| v2 host | `@opencode/plugin` 2.0.14 contract | types-only; never a runtime import in `src` |
| OpenCode 1 | not supported by the plugin (dropped 2026-10-14) | the program still reads and copies the OpenCode 1 sessions an OpenCode 2 store keeps |
| deployed at (v2) | `<plugins>/session-manager/` (`server.js`, `tui.js`) | auto-discovered; never listed in config |
| build outputs | `dist/v2/{server,tui}.js` | the entrypoints the host loads |
| CLI | `opencode-session-manager` (`dist/cli/`, `bun build --compile`), entry `src/main/cli/cli.ts` | `<preflight\|rehearse\|run\|rollback <backupDir>> [--db <path>] [--keep]`, `rollback <backupDir> [--db <path>]...` (one or several stores), `sync --from <dataHome> --to <dataHome> [--map <from>=<to>]... (--session <id>... \| --all) [--prefer further\|keep\|replace] [--diverged skip\|fork] [--context all\|sessions] [--strict] [--dry-run]`, `relocate [--data <dataHome>] (--map <from>=<to> \| --rename <folder>=<name> \| --relink \| --configured)... (--session <id>... \| --all) [--repair-worktrees] [--dry-run] [--json]`, `fork --session <id> [--before <messageId>] [--server <url>] [--json]`, `verify [--data <dataHome>] [--session <id>]... [--behind <messages>] [--json]` (read-only), `sessions [--data <dataHome>] [--json]` (read-only), `context copy --from <context.db> --to <file>`, `context sync --from <dataHome> --to <dataHome> (--session <id>... \| --all) [--prefer keep\|further\|replace \| --replace] [--context all\|sessions] [--strict] [--dry-run]`, `context wrapup\|recomp --session <id>... [--data <dataHome>] [--keep <messages>] [--server <url>] [--no-wait] [--timeout <minutes>] [--json]`, `tui [--left <dataHome> \| --left-db <db> [--left-context <db>]] [--right …] [--map <from>=<to>]... [--offline]` (session browser; its queue applies whole-session syncs), `patches <status\|apply\|undo\|check\|inspect\|effect\|notify\|follow> [--json] ...` (the installed Magic Context, kept patched; `patches --help`) |
| CLI platforms | Linux, Windows and macOS (`linux`, `win32`, `darwin`) | others are refused (`UnsupportedPlatformError`) |
| runtime | Bun 1.4 (`bun:sqlite`); the plugin bundles and the CLI have no runtime dependencies | — |
| licence | MIT © mavasbel | — |

This repository merges `opencode-session-id`, `opencode-sessions-transfer`,
`opencode-db-manager` (formerly `opencode-db-compact`) and
`opencode-magic-context-patches`; all histories are in `git log`. The installer
retires the plugin predecessors' deployed artifacts. Their final docs are
frozen under `docs/reference/`.

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
    `rollback`, `sync`, `relocate`, `context sync`, the browser's apply) first takes
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
16. **`relocate` moves sessions inside one profile, never partly.** A family
    (a session and its sub-agent sessions) moves whole, to folders that exist
    here, or stays and is reported (`folder-missing`); Magic Context working on a
    session it would move refuses the whole run. Text is rewritten in place by
    primary key, only where a rule's folder appears as a whole name (absolute,
    without its leading slash after `file:///`/`@fs/`, or `~/…`); a session row's
    folder is set only by the move. Project records and content-addressed blobs
    are kept — except that `--rename` (a folder renamed in place, so the same
    project) replaces its old name, as a whole name, in the project records of a
    whole-profile run, re-keying `project_directory`/`worktree` rows; the matcher
    (`NameRewriter`) is tested against the shared case table
    `tests/support/sessions/rename-cases.ts`. Old Magic Context projects are merged, never deleted. Working copies
    must pass every check (`text_ok`: no rewritten row still names an old folder)
    before both stores are swapped in together (`JointSwapService`).

### The report JSON is a contract

Report keys are **snake_case** and identical to the original compactor's
(`page_size`, `freelist_count`, `vacuum_ms`, `target_bytes`, `integrity_ok`,
`source_rows`, …). `tests/e2e/maintenance/legacy-parity.test.ts` runs the frozen
original (`tests/support/maintenance/fixtures/legacy/`, kept verbatim) and this
CLI as real processes against identical databases and compares the preflight
report, the check lines, the run report (minus timings and free disk) and the
rollback output. The sync reports' keys follow the same rule and are defined
in `src/domain/model/SessionSync.ts` and `src/domain/model/MagicContextSync.ts`.

### The safety invariants of `patches` — inherited from opencode-magic-context-patches

1. A file is written only when its sha256 is the recorded `before` (apply) or
   `after` (undo), and the new content's sha256 is the recorded `after` (apply)
   or `before` (undo) — computed before writing. Anything else is `refused` and
   nothing is written.
2. Every original is backed up (read-only, content-addressed) before it is replaced.
3. Files are replaced in one step: written beside the target (under a
   `.osm-patches-<pid>` staging folder), given its mode, renamed over it, then
   read back and checked. On any failure, every file already written for that
   patch is put back.
4. Every apply and undo, including refusals, is appended to the audit log.
5. A patch is applied automatically to an unreviewed version only by `follow`,
   and only when every matcher count, file count and anchor holds AND the
   sandbox proof (an isolated `opencode serve` with the patched copy and the
   user's `magic-context.jsonc`) passes; otherwise never. A version becomes
   reviewed only by a person adding it to `src/domain/patch-definitions/` after
   `patches inspect --version <v>` and the published npm tarball.
6. The watch units run `follow`, which may install a new patched copy; it never
   applies a patch to, or removes, a copy OpenCode has already loaded. `notify`
   only reports.
7. The tool never restarts OpenCode. The only configuration it edits is the one
   Magic Context entry of `opencode.jsonc` (`follow` and `follow --rollback`):
   the whole file is backed up first, only that string literal changes, and the
   file is read back; a mismatch puts the original back.

The patches group's folders are `opencode-session-manager/patches` under the
XDG data and state homes (not `opencode-magic-context-patches`), its variables
are `OPENCODE_SESSION_MANAGER_PATCHES_*` (not `OPENCODE_MC_PATCHES_*`), the
staging prefix is `.osm-patches-`, notifications go through
`--app-name=opencode-session-manager`, the unexpected error reads
`ERROR: <message>` (exit 1), `--version` prints
`opencode-session-manager <version>`, and the program is
`opencode-session-manager patches`. Titles, flags, JSON shapes and exit codes
0/1/2 are unchanged. `MAGIC_CONTEXT_LOG_PATH` keeps its name (Magic Context's
own variable).

### Adding a version to a patch, or a new patch — adapted from opencode-magic-context-patches

1. `npm pack @cortexkit/opencode-magic-context@<v>` in a scratch folder under `$TMPDIR/opencode/`;
   confirm the installed files are byte-identical to the tarball's (sha256).
2. `bun run cli -- patches inspect --version <v>`; read every snippet. If the code around the
   replaced text changed meaning, stop and re-do the analysis in a new `docs/reference/` document.
3. Add a release `{ version, files: [{ path, before, after, replacements }] }` to the patch in
   `src/domain/patch-definitions/`; `after` is the sha256 of the tarball's file with the
   replacements made.
4. Copy the tarball's files into `tests/support/patches/fixtures/` (one
   `magic-context-<v>/` folder per version, with `package.json` reduced to `name`, `version`,
   `license`, and a `NOTICE.md` naming the tarball and its integrity).
   `tests/unit/patches/definitions/patches.test.ts` then proves the recorded checksums on the real
   files.
5. Run the gate (`bun run typecheck`, `bun run lint:diagrams`, the coverage the version needs),
   commit, `bun run install:cli`, `apply`, restart OpenCode, then `patches effect` must say
   `verdict: respected`.

A new patch is a new file in `src/domain/patch-definitions/`, listed in that folder's `index.ts`,
with an evidence document in `docs/reference/` named by its `evidence` field, and a `matcher`
(directory, extension, and its `sites`: each a name, file count, shapes with counts, anchor and
window) that `tests/unit/patches/domain/matcher-rules.test.ts` proves derives exactly every
reviewed release from the fixtures. A new shape of an existing site is added to that site's `shapes`
after review. A file may belong to several patches: they are applied in `index.ts` order, each
matcher reading the file as the previous patch left it, and the later release's `before` is
therefore the earlier release's `after`. A patch that changes several places in the same files lists
them as several sites. A patch whose site upstream introduced or dropped in some release marks its
matcher `optional: true`: no file holding any of its sites means nothing to change on that version,
while a partial match still stops `follow`. Matchers prove on every platform's adapters; the watch
(`scripts/watch.mjs`) runs `follow` on Linux and macOS and refuses on Windows.

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

`src/main/server-container.ts` (v2 server), `src/main/tui-container.ts` (v2 TUI)
and `src/main/cli-container.ts` (the CLI),
plus the CLI's per-platform halves `src/main/darwin-container.ts`,
`src/main/linux-container.ts` and `src/main/win32-container.ts`. Measured: a shared root made the server
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
macOS: `PsProcessListAdapter` (`ps -axo pid=,comm=`, matched on the basename) and
`LsofHoldersAdapter` (`lsof -F pc`). The patches half per platform: Linux
(`ProcServiceAdapter`, `ProcLivenessAdapter`, `NotifySendAdapter`), macOS
(`PsServiceAdapter`, `KillZeroLivenessAdapter`, `OsascriptNotifierAdapter`) and
Windows (`CimServiceAdapter`, `GetProcessLivenessAdapter`,
`PowerShellToastNotifierAdapter`), wired by `src/main/<platform>-container.ts` as
`…PatchesAdapters` and loaded the same way. All take their system root or
executable as a constructor argument, so the unit tier runs every platform's
adapters on any machine. Enforced by `tests/unit/maintenance/architecture.test.ts`.

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
  Drizzle tables (`schema/opencode.ts` from `opencode-2.0.32.sql`,
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

### Re-sync retry (F11)

The TUI registers `container.resyncRetry` for every V2 TUI (never
Herdr-gated): `RetryResyncUseCase` owns the retry loop over `RESYNC_BACKOFF`
through the reused `TimerPort`, behind `ResyncRetryV2Adapter` (the one wrapper
installed on `data.session.sync`, kept on the session store under
`Symbol.for("opencode-session-manager.resync-retry")`: one slot, re-pointed at
the newest context by the next setup, never unwrapped by `cleanup`) and
`V2ResyncRouteAdapter` (`routedSessionID` from `ctx.ui.router.current()`,
`isLoaded` from `ctx.data.session.get(id)`). The pure classifier is
`classifyResyncError` in `src/domain/model/ResyncRetry.ts` (`RESYNC_BACKOFF`
500/1000/2000/4000/8000, six attempts; a 503 and a transport code transient; a
404 and `SessionNotFoundError` missing; anything else other). Tests: the
classifier in `tests/unit/domain/resync-retry.test.ts`, the loop in
`tests/unit/application/retry-resync.test.ts`, the adapters in
`tests/unit/infrastructure/resync-retry-adapter.test.ts` and
`tests/unit/infrastructure/v2-resync-route-adapter.test.ts`, the wired feature
in `tests/component/reconnect/resync-retry.test.ts` (`[UC-RR1]`…`[UC-RR11]`,
the `N` negatives among them), and the real OpenCode 2.3.0 TUI and service in
`tests/live/tui-resync-retry.test.ts`.

### Restore after reconnect (F12)

The TUI registers `container.reconnectRestore` for every V2 TUI (never
Herdr-gated): `RestoreAfterReconnectUseCase` owns the async verify loop over
`VERIFY_BACKOFF` through the reused `TimerPort`, behind
`ReconnectRestoreV2Adapter` (250 ms route poll, `data.on("server.connected")`
and `data.on("session.deleted")`; the disposer unsubscribes both, clears the
poll and releases the port, aborting a pending loop) and
`V2SessionNavigatorAdapter` (`verify` via `data.session.sync` with the
not-found discriminator, `open` via `ui.router.navigate`, `notify` via
`ui.toast.show`). The pure trigger is `decideRestore` in
`src/domain/model/ReconnectRestore.ts` (`WINDOW` 10000, `RESTORE_LIMIT` 3 per
60 s, `VERIFY_BACKOFF` 500/1000/2000/4000/8000). Tests: the trigger in
`tests/unit/domain/reconnect-restore.test.ts`, the loop in
`tests/unit/application/restore-after-reconnect.test.ts`, the adapters in
`tests/unit/infrastructure/reconnect-restore-adapter.test.ts` and
`tests/unit/infrastructure/v2-session-navigator-adapter.test.ts`, the wired
feature in `tests/component/reconnect/restore.test.ts`
(`[UC-R1]`, `[UC-R2N]`…`[UC-R7N]`, `[UC-R8]`), and the real OpenCode 2.3.0 TUI
and service in `tests/live/tui-reconnect-restore.test.ts`.

### Source map

Every file under `src`, by layer (the docs lint fails when one is missing here).
Areas: **plugin** (session id, transfer), **maintenance** (compaction),
**sessions** (profiles, browser, sync, Magic Context), **patches** (the installed
Magic Context, kept patched: model, ports, services, use cases, adapters,
definitions).

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
| `NameRename.ts` | sessions | one folder renamed in place (`parent`, `from`, `to`) |
| `Relocate.ts` | sessions | `relocate` input, moved and skipped sessions, text rewrite counts, checks, the report and `relocateLines` |
| `SessionSync.ts` | sessions | session sync input, map rules, `--prefer`, the action per history relation (`actionFor`), the report |
| `LocationRepair.ts` | plugin | explicit online repair plans, skips, and reports |
| `GitWorktree.ts` | plugin, sessions | the Git work tree a folder belongs to as its `.git` entries describe it, repair plans, link outcomes |
| `ReconnectRestore.ts` | sessions | the pure reconnect-restore trigger (`decideRestore`): the open session, the last reconnect, deletions and recent restores → `none` / `verify` / `navigate` / `giveUp`; `WINDOW` 10000, `RESTORE_LIMIT` 3 per 60 s, `VERIFY_BACKOFF` 500/1000/2000/4000/8000 |
| `ResyncRetry.ts` | sessions | the pure re-sync retry policy: `classifyResyncError` (`missing` / `transient` / `other`), `isSessionNotFound`, `httpStatus`, `RESYNC_BACKOFF` 500/1000/2000/4000/8000, `ResyncRequest` |
| `Verify.ts` | sessions | `verify`: finding kinds and their severity, a session's Magic Context vitals, the report and its text (`verifyLines`) |
| `Build.ts` | maintenance | the six checks of a compacted copy |
| `Database.ts` | maintenance | page statistics, schema, header and per-table fingerprints of a database |
| `DatabasePaths.ts` | all | `baseName`, `dirName`, `joinPath` for either separator, so inner layers never import `node:path` |
| `Sidecars.ts` | maintenance | a database's `-wal`/`-shm`/`-journal` sidecars |
| `StoreLock.ts` | maintenance, sessions | a store's lock: its owner (pid, command, start), a stale lock removed, `lockFileOf` |
| `patches/Patch.ts` | patches | `PatchDefinition` (with its `matcher`), `PatchRelease`, `PatchedFile`, `Replacement`, `CheckedBy` (`reviewed` / `auto`), `DerivedRelease` |
| `patches/Installation.ts` | patches | an installed copy (`spec`, `root`, `version`) and whether it is loaded |
| `patches/Matcher.ts` | patches | `PatchMatcher`, `MatcherSite`, `MatcherShape`: how `follow` finds a patch's sites by content |
| `patches/Reports.ts` | patches | what every command returns, including `FollowReport` and its steps |
| `patches/Status.ts` | patches | file and patch states, and who checked the release compared with |
| `patches/StepLog.ts` | patches | `stepLog(clock)`: the timed steps of a `follow` run (a factory, since use cases never `new` a class) |
| `patches/PatchCommands.ts` | patches | the nine use cases as one record (not a port) |
| `patches/PatchTargets.ts` | patches | `Target` (a patch × copy) and `FileOnDisk`, so `blocker` can live in the domain |
| `Paths.ts` | plugin | `~` expansion and abbreviation |
| `FolderBrowser.ts` | plugin | the folder browser's rules: path or filter, completion split, parent folder, display order (`compareLabels`), `fitMiddle`, scrolling |
| `Session.ts` | plugin | session summaries, projects, transfer and move results, picker options |
| `SessionId.ts` | plugin | the session-id guard and sidebar text |
| `SidebarEntry.ts` | plugin | one sidebar line |
| `PaneTitle.ts` | plugin | the Herdr pane presentation: `paneTitle` (whitespace, 80 characters with `…`), `rootSession` (the top of a sub-agent chain), `SessionLink.agent`, `PanePresentation`, `panePresentation` (both values cleaned; nothing left → `undefined`), `samePresentation` |
| `HerdrPane.ts` | plugin | the Herdr pane a process runs in, from `HERDR_ENV`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID` |

**`src/domain/services`** — pure rules.

| File | Area | Role |
|---|---|---|
| `PathRewriter.ts` | sessions | `TextRewriter`: rewrites Windows profile paths in text, through nested JSON escaping; counts what is left |
| `WindowsMapping.ts` | sessions | the mapping a session's own folders imply (Windows profile → this home, plus a moved folder) |
| `patches/EffectReading.ts` | patches | Magic Context's log summarised (rejections, proactive floors; the threshold in use is floor + 2), the lines since a time |
| `patches/MatcherRules.ts` | patches | `locate`: a matcher over a release's files, accepted or refused with the reason |
| `patches/PatchRules.ts` | patches | files and patches classified by checksum; replacements applied and reverted with exact counts |
| `patches/PatchRefusals.ts` | patches | `blocker`: the refusals `apply` and `undo` share |
| `patches/FollowRules.ts` | patches | the values the `follow` use cases share (`loadsFrom`, `loadsEntry`, `packageRoot`, `CONFIG_REJECTION`, `PREVIOUS_ENTRY`, `LAST_FOLLOW_NOTIFICATION`, `FOLLOW_TITLE`) |
| `RenameRules.ts`, `NameRewriter.ts`, `CompositeTextRewriter.ts` | sessions | `relocate --rename <folder>=<name>` rules → renames and the folder moves they imply; whole-name replacement of the old names (paths, Windows paths, prose, `%XX`, dash-encoded paths); several rewriters as one |
| `RelocateRules.ts` | sessions | `relocate --map` rules → folder moves, the text mapping (absolute, and `~/…` below the home) and the hints a rewrite searches for (`relocationsFromRules`, `relocatedFolder`) |
| `WorktreeRepairPlanner.ts` | plugin, sessions | the one `git worktree repair` explicit mappings prove for a work tree, without guessing |
| `MapRules.ts` | sessions | `--map` rules → a `PathMapping` (`parseMapRule`, `mappingFromRules`, `NO_WINDOWS_PROFILE`) |
| `Versions.ts` | sessions | `compareVersions` (semver 2.0.0 §11 order: numeric core parts, a pre-release below its release, numeric identifiers below alphanumeric, a longer set above its prefix, build metadata ignored; a missing or non-numeric core part counts as 0) |
| `Fork.ts` (model) | sessions | OpenCode 2.0.26's fork rules: `forkTitle`, `isSettled` (what a fork copies), `opencodeId` (OpenCode's id format), slug words, the `fork` report |
| `Rebuild.ts` (model) | sessions | `/ctx-wrapup` / `/ctx-recomp` through the server: snapshots, `phaseOf`, statuses, report text, poll/grace/timeout defaults |
| `Jsonc.ts` | sessions | `stripComments`; `pinnedMagicContext` (what `opencode.jsonc` pins: an npm entry's version, `latest` for a bare package, a folder entry's path); `MAGIC_CONTEXT_PACKAGE`; `StringLiteral`/`stringLiterals` (string literals outside comments, with positions); `isMagicContextEntry`/`magicContextEntries`/`magicContextEntry`; `replaceMagicContextEntry` (byte-exact, exactly one entry); `numericSetting` |
| `GitRemote.ts` | sessions | a remote URL in the form OpenCode hashes into a project id |

**`src/domain/patch-definitions`** — the patches as data: `execute-threshold-min.ts`,
`no-session-model-fallback.ts`, `refusal-recovery.ts`, `fold-identity-stable.ts`,
`fold-provenance-heal.ts` (each with its releases' checksums), `index.ts` (the list, in apply order).
| `PosixPaths.ts` | sessions | `isWithin`, `sessionSubpath` |
| `FingerprintComparer.ts` | maintenance | names every difference between two database fingerprints |
| `ParityPolicy.ts` | maintenance | whether a build passed (strict offline, drift-tolerant rehearsal) |
| `RequiredSpacePolicy.ts` | maintenance | free space a compaction needs |

**`src/domain/errors`** — one class per file:
`DatabaseHeldError.ts`, `DatabaseNotFoundError.ts`, `InsufficientSpaceError.ts`,
`MissingOriginalError.ts`, `ProcessRunningError.ts`, `SwapFailedError.ts`,
`TargetExistsError.ts`, `UnsupportedPlatformError.ts`, `StoreLockedError.ts` (maintenance);
`MagicContextFormatMismatchError.ts`, `MagicContextTooNewError.ts`,
`MagicContextUnavailableError.ts`, `MagicContextUpgradeError.ts`, `PatchError.ts` (patches: refusals — `count-mismatch`, `usage`, `not-installed` — which the CLI turns into exit codes),
`ProfileUnreadableError.ts`, `SyncVerificationError.ts`,
`InvalidMapRuleError.ts`, `OpenCodeFormatMismatchError.ts`,
`UnknownStoreSchemaError.ts`, `BusySessionsError.ts`, `ServerNotFoundError.ts`,
`ServerRefusedError.ts`, `RelocateBusyError.ts`, `RelocateVerificationError.ts`, `InvalidRenameRuleError.ts` (sessions);
`MissingSessionIdError.ts`, `SessionNotFoundError.ts` (plugin).

**`src/domain/tool`** — `SessionIdToolDefinition.ts`, the frozen tool surface.

**`src/domain/ports/inbound`** — one per use case: `CompactPort.ts`,
`PreflightPort.ts`, `RehearsePort.ts`, `RollbackPort.ts` (maintenance);
`OpenProfilePort.ts`, `CatalogProfilePort.ts`, `CopyMagicContextPort.ts`,
`SyncMagicContextPort.ts`, `SyncSessionsPort.ts`, `ApplyQueuePort.ts`, `VerifyProfilePort.ts`,
`MagicContextVersionsPort.ts`, `RebuildContextPort.ts`, `ForkSessionPort.ts`, `RelocateSessionsPort.ts`, `RestoreAfterReconnectPort.ts`,
`RetryResyncPort.ts` (sessions); `ResolveSessionIdToolPort.ts`, `RenderSidebarEntryPort.ts`, `RepairSessionLocationsPort.ts`,
`RepairWorktreeLinksPort.ts`, `MoveSessionPort.ts`, `BuildDirectoryOptionsPort.ts`, `BrowseFoldersPort.ts`,
`ReportPaneTitlePort.ts` (plugin); `PatchStatusPort.ts`, `PatchApplyPort.ts`,
`PatchUndoPort.ts`, `PatchCheckPort.ts`, `PatchInspectPort.ts`, `PatchEffectPort.ts`,
`PatchNotifyPort.ts`, `PatchFollowPort.ts`, `PatchFollowRollbackPort.ts` (patches: one per command).

**`src/domain/ports/outbound`** — what the inner layers need from outside:
`SqlitePort.ts`, `ProjectIdentityPort.ts`,
`ProcessListPort.ts`, `DatabaseHoldersPort.ts`, `MaintenanceFileSystemPort.ts`,
`ReportSinkPort.ts`, `RuntimePort.ts`, `OutputPort.ts`, `StoreLockPort.ts` (maintenance and the
program); `SessionStorePort.ts`, `MagicContextStorePort.ts`,
`MagicContextSyncStorePort.ts`, `SessionSyncStorePort.ts`, `MagicContextReleasePort.ts`,
`MagicContextIdentityPort.ts`, `MagicContextConfigPort.ts`, `PublishedVersionPort.ts`, `OpencodeServerPort.ts`,
`MagicContextProgressPort.ts`, `TimerPort.ts`, `IdentifiersPort.ts`, `RelocationStorePort.ts`,
`MagicContextRelocationStorePort.ts`, `SessionNavigatorPort.ts`, `ResyncRoutePort.ts` (sessions); `SessionHostPort.ts`, `FileSystemPort.ts`, `LocationRepairMappingsPort.ts`,
`KnownDirectoriesPort.ts`, `HomeDirectoryPort.ts`, `ThemePalettePort.ts`, `DirectoryListingPort.ts`,
`SidebarViewPort.ts`, `PaneMetadataPort.ts`, `GitWorktreePort.ts` (plugin);
`FilesPort.ts` (read bytes, mode-keeping one-step replace, list by extension),
`HashPort.ts`, `TextSourcePort.ts` (files and Magic Context's log as text),
`BackupPort.ts`, `AuditLogPort.ts`, `EvidencePort.ts`, `DerivedReleasesPort.ts`,
`ManagedStorePort.ts`, `KeyValuePort.ts`, `RegistryPort.ts` (a version's integrity,
thrown reasons), `PackageInstallerPort.ts`, `SandboxPort.ts` (the isolated proof),
`TranspilePort.ts`, `InstallationsPort.ts` (every copy with its root),
`LivePluginsPort.ts` (the running server's locations and Magic Context),
`ClockPort.ts` (`now`, `sleep`), `LogPort.ts`, `ServicePort.ts` (the running
server's start), `NotifierPort.ts`, `ProcessLivenessPort.ts` (is a lock owner
alive), `FollowLockPort.ts` (one `follow` run at a time) (patches).

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
| `JointSwapService.ts` | sessions | puts checked working copies of several stores in place by renames into one backup folder, undoing the earlier swaps when a later one fails (`sync`, `relocate`) |
| `SwapService.ts` | maintenance, sessions | rename-only swap into a backup folder, restored on failure; `undo` reverses a finished swap |
| `DatabaseSizesService.ts` | maintenance | sizes of a database and its sidecars |
| `OpenProfileUseCase.ts` | sessions | open a profile read-only, from a snapshot when needed, and close it |
| `CatalogProfileUseCase.ts` | sessions | join a profile's sessions with their Magic Context counts |
| `VerifyProfileUseCase.ts` | sessions | `verify`, read-only: both stores' integrity and foreign keys; per session the project OpenCode and Magic Context derive, summaries pointing outside the history, how far summaries lag, the last prompt's size, wrapup markers; Magic Context state of sessions OpenCode lacks |
| `CopyMagicContextUseCase.ts` | sessions | copy a store and upgrade the copy with the installed Magic Context |
| `MagicContextSyncService.ts` | sessions | build and check a working copy of a target Magic Context store holding sessions' state and, for scope `all`, their projects' state |
| `SyncMagicContextUseCase.ts` | sessions | `context sync`: the service's copy swapped in, with a backup |
| `SyncSessionsUseCase.ts` | sessions | `sync`: whole sessions (OpenCode rows + Magic Context state) into working copies of both target stores, checked, swapped in together |
| `RelocateSessionsUseCase.ts` | sessions | `relocate`: sessions in mapped folders (with their sub-agent sessions) get their new folder and the project OpenCode derives there, text naming an old folder is rewritten, Magic Context links and merges their projects; on working copies, checked, swapped in together |
| `ApplyQueueUseCase.ts` | sessions | run the browser's queue as one whole-session sync per direction |
| `RestoreAfterReconnectUseCase.ts` | sessions | restore after reconnect: the async verify loop over `VERIFY_BACKOFF` while the route is still home; `exists` → open + restored-toast, `missing` → nothing, all `failed` → one info notify |
| `RetryResyncUseCase.ts` | sessions | re-sync retry: the retry loop over `RESYNC_BACKOFF` for the routed `children: true` call only; stops when the route leaves, resolves when the session is loaded, else rethrows the last error |
| `ForkSessionUseCase.ts` | sessions | `fork` and the browser's `F`: OpenCode's own fork through the running server (writes nothing itself) |
| `RebuildContextUseCase.ts` | sessions | `context wrapup|recomp` and the browser's `W`/`R`: one session at a time through the OpenCode server, followed in the store (read-only); refuses a session Magic Context already works on |
| `MagicContextVersionsUseCase.ts` | sessions | the Magic Context OpenCode loads here and the newest on npm (the browser's header) |
| `ResolveSessionIdToolUseCase.ts` | plugin | the `session-id` tool |
| `RenderSidebarEntryUseCase.ts` | plugin | the sidebar line |
| `MoveSessionUseCase.ts` | plugin | the transfer through the host |
| `RepairSessionLocationsUseCase.ts` | plugin | moves only a session whose recorded directory is absent and whose explicit mapped target exists; can inspect every session or an explicitly selected one before transfer |
| `RepairWorktreeLinksUseCase.ts` | plugin, sessions | runs Git's own `git worktree repair` only when an explicit mapping proves it, then reports what Git resolves afterwards |
| `BuildDirectoryOptionsUseCase.ts` | plugin | the known folders the transfer offers: once each, existing only, no filesystem root, in display order |
| `BrowseFoldersUseCase.ts` | plugin | the folder browser's steps (type, ↑/↓, →, ←, Enter) over the listing port |
| `ReportPaneTitleUseCase.ts` | plugin | the Herdr pane presentation (agent and root title): one report at a time, only a change of either value, a refused one sent again, `refresh` to resend, `release` on exit |
| `patches/StatusUseCase.ts` | patches | `status`: every installed copy with each patch's state |
| `patches/CheckUseCase.ts` | patches | `check`: passes only when every patch is applied on the loaded copy |
| `patches/ApplyUseCase.ts` | patches | `apply`: every file exactly the recorded original, the result exactly the recorded checksum |
| `patches/UndoUseCase.ts` | patches | `undo`: the originals back, by backup or by reversal |
| `patches/PatchInspector.ts` | patches | reads and classifies a patch's files on one copy |
| `patches/ChangeWriter.ts` | patches | writes one patch's files as a unit (backup, replace, read back, put back on failure), and audits |
| `patches/InstallationCatalog.ts` | patches | installed copies, which one is loaded, the patch × copy targets |
| `patches/ReleaseCatalog.ts` | patches | the release of a patch for a version (reviewed, else derived) |
| `patches/InspectUseCase.ts` | patches | `inspect`: where the replaced text occurs in an unchecked version |
| `patches/EffectUseCase.ts` | patches | `effect`: the threshold really in use, from Magic Context's log |
| `patches/NotifyUseCase.ts` | patches | `notify`: a desktop notification when `check` fails, once per problem |
| `patches/FollowUseCase.ts` | patches | `follow`: detect → stage → locate → patch → prove → publish → confirm → record, under the lock; reverts the entry after a failed confirm |
| `patches/FollowRollbackUseCase.ts` | patches | `follow --rollback`: the previous entry back, confirmed against the running server |
| `patches/follow/ReleaseStager.ts` | patches | stage, locate, patch |
| `patches/follow/ReleaseProver.ts` | patches | prove: the isolated server loads the patched copy without rejection |
| `patches/follow/PluginEntryEditor.ts` | patches | the one `opencode.jsonc` entry, backed up, replaced, read back |
| `patches/follow/EntrySwitcher.ts` | patches | publish, confirm, revert |
| `patches/follow/AdoptionRecorder.ts` | patches | record: derived releases, evidence, audit, the previous entry, notification |

**`src/infrastructure/adapters/inbound`**

| File | Role |
|---|---|
| `cli/CliRouter.ts` | sends each command family to its adapter |
| `cli/CompactCliAdapter.ts` | `preflight`, `rehearse`, `run`, `rollback` |
| `cli/SyncCliAdapter.ts` | `sync` |
| `cli/RelocateCliAdapter.ts` | `relocate` |
| `cli/ForkCliAdapter.ts` | `fork` |
| `cli/arguments.ts` | `parseOptions`: `--name value` options and flags |
| `cli/SessionsCliAdapter.ts` | `sessions` |
| `cli/VerifyCliAdapter.ts` | `verify` |
| `cli/ContextCliAdapter.ts` | `context copy`, `context sync` |
| `cli/BrowseCliAdapter.ts` | `tui`: opens the profiles, shows the browser, wires its controls |
| `cli/HelpCliAdapter.ts` | `--help`, `--version` |
| `cli/PatchesCliAdapter.ts` | patches | `patches <status\|apply\|undo\|check\|inspect\|effect\|notify\|follow> [--json]`: parsing, dispatch, exit codes 0/1/2, `PATCHES_HELP` (see `cli-surface.test.ts`) |
| `cli/PatchesTextFormatter.ts` | patches | the human-readable output of every patches command |
| `manager-tui/OpenTuiBrowser.tsx` | the browser view (the only file there importing OpenTUI at run time) |
| `manager-tui/keys.ts` | keys → commands |
| `manager-tui/format.ts` | state → text |
| `manager-tui/controls.ts` | `BrowserControls`: what the view asks of the program |
| `tui/ReconnectRestoreV2Adapter.ts` | polls the open route and forwards route, reconnect and deletion observations to the restore port; the disposer unsubscribes both host events, clears the poll and releases the port |
| `tui/ResyncRetryV2Adapter.ts` | installs the one wrapper on `data.session.sync` under `Symbol.for("opencode-session-manager.resync-retry")`, per host runtime: one slot re-pointed at the newest port by a re-setup, never unwrapped |
| `server/SessionIdToolV2Adapter.ts` | registers the `session-id` tool (v2) |
| `tui/SessionIdSidebarSlotV2Adapter.ts` | the sidebar slot (v2) |
| `tui/SessionTransferV2TuiAdapter.ts` | `/transfer-session` |
| `tui/SessionLocationRepairV2TuiAdapter.ts` | mapping-only `/repair-sessions` |
| `tui/FolderBrowserDialogV2Adapter.tsx` | the v2 folder browser dialog: path box, rows, keys (modal keymap layer) |
| `tui/HerdrPaneTitleV2Adapter.ts` | reads the open session's agent and its root's title from the TUI's synced data four times a second and reports them; resends every ten seconds; releases on cleanup |

**`src/infrastructure/adapters/outbound`**

| File | Role |
|---|---|
| `sqlite/BunSqliteAdapter.ts` | read-only reads, `VACUUM INTO`, fingerprints, checks |
| `sqlite/BunRelocationStoreAdapter.ts` | moves session rows and rewrites text in a working copy of an OpenCode store (keeps project records and content-addressed blobs) |
| `sqlite/BunMagicContextRelocationStoreAdapter.ts` | relinks sessions' Magic Context projects and rewrites text in a working copy (a memory's key follows its text) |
| `sqlite/InstructionBlobs.ts` | rewrites OpenCode's instruction blobs under OpenCode's own address of their new value (`instructionHash`: sha256 of the canonical JSON) and repoints the instruction states in scope |
| `sqlite/TextRelocation.ts` | rewrites, in place and by primary key, every text cell holding a hint (`rewriteTable`), and counts mentions (`countMentions`) |
| `sqlite/BunSessionSyncStoreAdapter.ts` | reads OpenCode stores for a sync, writes session families into a working copy |
| `sqlite/engine/Store.ts` | the store engine: opens a store (`openStore`, `withStore`), drizzle-orm over it, and the only SQL text in `src` |
| `sqlite/schema/opencode.ts`, `sqlite/schema/magic-context.ts` | generated Drizzle tables of OpenCode 2.0.32 (2.0.24's plus `project.time_archived`; older stores lack the column and work) and Magic Context format 95 (a superset of 94: the code reads only the tables and columns a store has, so 94 and 95 stores both work) |
| `sqlite/schema/value.ts` | the `bigInteger` and pass-through `value` column types the generated schemas use |
| `sqlite/BunSessionStoreAdapter.ts` | reads `opencode.db` sessions and their message ids |
| `sqlite/BunMagicContextStoreAdapter.ts` | reads a `context.db`'s counts and format |
| `sqlite/BunMagicContextSyncStoreAdapter.ts` | reads and writes session state in `context.db` working copies |
| `magic-context/InstalledMagicContextAdapter.ts` | finds the installed Magic Context and runs its store code in a sandboxed child process |
| `magic-context/OpencodeMagicContextConfigAdapter.ts` | the spec `opencode.jsonc` pins and the copy OpenCode installed for it |
| `opencode2/HttpOpencodeServerAdapter.ts` | the server `service.json` records, and its command endpoint (HTTP Basic `opencode`) |
| `sqlite/BunMagicContextProgressAdapter.ts` | a session's Magic Context progress (summaries, reach, wrapup marker, lease, staged recomp rows, historian runs since a moment), read-only |
| `system/OpencodeIdentifiersAdapter.ts` | new session ids, message bases and slugs in OpenCode's format (for offline forks) |
| `system/SystemTimerAdapter.ts` | waiting between looks at a running rebuild (tests pass a timer that does not wait) |
| `npm/NpmRegistryAdapter.ts` | a package's `latest` dist-tag on an npm registry (time-limited) |
| `magic-context/MagicContextIdentityAdapter.ts` | Magic Context's project identity of a folder |
| `project/OpenCodeGitIdentity.ts` | how OpenCode 2.0.26 names a git repository's project (`origin` remote only, the id stored in `<git-common-dir>/opencode`, the first root commit in sorted order) |
| `project/GitProjectIdentityAdapter.ts` | OpenCode 2's project id of a folder (outside a repository: `sha1("directory:" + realpath)`) |
| `project/GitWorktreeAdapter.ts` | reads the `.git` entries Git keeps for its work trees and runs Git itself for the repair and the resolve check |
| `platform/linux/ProcProcessListAdapter.ts`, `platform/linux/ProcFdHoldersAdapter.ts`, `platform/linux/ProcFs.ts` | Linux: running processes and file holders from `/proc` |
| `platform/win32/TasklistAdapter.ts`, `platform/win32/RenameProbeHoldersAdapter.ts` | Windows: `tasklist` and the rename probe |
| `platform/darwin/PsProcessListAdapter.ts`, `platform/darwin/LsofHoldersAdapter.ts` | macOS: running processes from `ps` and file holders from `lsof` |
| `fs/NodeMaintenanceFileSystemAdapter.ts` | the program's file operations |
| `fs/FsStoreLockAdapter.ts` | `<store>.session-manager.lock` files: exclusive create, stale-owner check (`kill(pid, 0)`), release only by the owner |
| `fs/NodeFileSystemAdapter.ts` | the plugin's file operations |
| `fs/NodeLocationRepairMappingsAdapter.ts` | reads explicit JSONC live-repair mappings |
| `fs/NodeDirectoryListingAdapter.ts` | the folder browser's reads: is a folder, folders inside one |
| `fs/JsonReportAdapter.ts` | JSON evidence files |
| `system/ConsoleOutputAdapter.ts` | the program's stdout |
| `system/SystemClockAdapter.ts` | time, process id, platform, temp and home folders; also `ClockPort` (`sleep`) for the patches group |
| `system/StderrOutputAdapter.ts` | patches | `OutputPort` writing to stderr: `PatchesCliAdapter` reports usage and refusals there |
| `magic-context/CompositeInstallationsAdapter.ts`, `magic-context/ManagedInstallationsAdapter.ts`, `magic-context/OpencodeCacheInstallationsAdapter.ts` | patches | installed copies: OpenCode's npm cache (directly or one numbered folder down), `follow`'s installs, both lists in one |
| `crypto/Sha256Adapter.ts` | patches | the hash checksums are compared with |
| `fs/NodeFilesAdapter.ts` | patches | read, one-step replace (staged under `.osm-patches-<pid>`), list by extension |
| `fs/TextFileAdapter.ts` | patches | configuration files and Magic Context's log as text |
| `fs/FileKeyValueAdapter.ts` | patches | the last notification (`notify`, `follow`) |
| `fs/FsBackupAdapter.ts` | patches | read-only, content-addressed backups |
| `fs/FsEvidenceAdapter.ts` | patches | adoption evidence (never overwrites) |
| `fs/FsManagedStoreAdapter.ts` | patches | `installs/<v>/` and staging folders |
| `fs/JsonDerivedReleasesAdapter.ts` | patches | the releases `follow` derived |
| `fs/JsonlAuditLogAdapter.ts` | patches | the audit log |
| `fs/FsFollowLockAdapter.ts` | patches | one `follow` run at a time (`FollowLockPort`), liveness through `ProcessLivenessPort` |
| `npm/ArboristInstallerAdapter.ts` | patches | `@npmcli/arborist` 9.4.0 with OpenCode 2.1.1's options (bundled into the executable) |
| `npm/NpmPackumentAdapter.ts` | patches | the abbreviated packument: `latest`, a version's integrity (thrown reasons) |
| `opencode2/OpencodeLivePluginsAdapter.ts` | patches | the running service's locations and their Magic Context |
| `opencode2/OpencodeSandboxAdapter.ts` | patches | the isolated `opencode serve` of the proof |
| `parse/BunTranspileAdapter.ts` | patches | a changed bundle still parses |
| `platform/linux/ClockTicks.ts` | patches | `clockTicks`: `getconf CLK_TCK` (100 when unaskable) |
| `platform/linux/ProcServiceAdapter.ts` | patches | the newest `opencode … serve` start from `/proc` |
| `platform/linux/ProcLivenessAdapter.ts` | patches | `<procRoot>/<pid>` exists |
| `platform/linux/NotifySendAdapter.ts` | patches | `notify-send --app-name=opencode-session-manager` |
| `platform/darwin/PsServiceAdapter.ts` | patches | the newest `opencode … serve` start from `ps -axo pid=,lstart=,command=` |
| `platform/darwin/KillZeroLivenessAdapter.ts` | patches | `kill -0` (`ESRCH` means gone) |
| `platform/darwin/OsascriptNotifierAdapter.ts` | patches | `osascript -e 'display notification …'` |
| `platform/win32/CimServiceAdapter.ts` | patches | the newest `opencode(.exe) … serve` start from `Get-CimInstance Win32_Process` |
| `platform/win32/GetProcessLivenessAdapter.ts` | patches | `Get-Process -Id <pid>` |
| `platform/win32/PowerShellToastNotifierAdapter.ts` | patches | a PowerShell toast notification (unverified on hardware) |
| `system/SystemHomeDirectoryAdapter.ts` | the home folder, read per call |
| `tui/V2SessionNavigatorAdapter.ts` | verifies the session by re-syncing it (`SessionNotFoundError` name/`_tag` → missing, any other rejection → failed), navigates back through the host router and shows the notice through the host toast; skips what an older host stub omits |
| `tui/V2ResyncRouteAdapter.ts` | reads the routed session from `ui.router.current()` and whether the host holds a session from `data.session.get(id)` |
| `opencode2/OpenCode2HostAdapter.ts` | the OpenCode 2 host API |
| `tui/HostThemePaletteV2Adapter.ts`, `tui/OpenTuiSidebarViewAdapter.tsx` | theme colours and the sidebar line view |
| `herdr/HerdrSocketPaneMetadataAdapter.ts` | Herdr's API socket (a named pipe on Windows): `pane.report_metadata` with `title` (root title) and `display_agent` (the open session's agent), each left out when not known, under the source `opencode-session-manager:title`, guarded by `agent: opencode`, numbered with `seq`; answers `false` (never throws) when Herdr refuses, garbles, hangs up, is silent for a second or is gone |

**`src/infrastructure/host`** — the v2 host API typed structurally:
`V2ServerContext.ts`, `V2TuiContext.ts`, `V2Client.ts`.

**`src/main`** — composition roots and entries: `server-container.ts`,
`tui-container.ts`, `cli-container.ts` (which also wires the patches group through
`createPatchCommands` and registers `patches` in the router),
`patches-container.ts` (the patches group's adapters and use cases, with the
declared fault-injection `Seams`), `darwin-container.ts`, `linux-container.ts`,
`win32-container.ts` (each also exporting `…PatchesAdapters`), `plugin-id.ts`
(plugin ids); `v2/server.ts`, `v2/tui.ts`; `cli/cli.ts` (the program's entry:
exits with the code at once, since Arborist's idle connections would hold the
process), `cli/platform.ts` (loads one platform's container, and the patches
half of it), `cli/patches-paths.ts` (every location the patches group uses).

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
- **Shared runtime.** The v2 TUI shares one Solid/OpenTUI runtime with plugins
  through `opentui:runtime-module:*`. `scripts/build.mjs` keeps those external
  and fails if the bundle imports `solid-js` or `@opentui/*` by name. Node
  built-ins (`node:fs`, `node:path`, …) are allowed: the TUI runs on Bun.
- **Folder browser (v2).** The host's select dialog gives a plugin no keys, so
  v2's `/transfer-session` draws its own dialog (`ui.dialog.show`) and binds its
  keys with a `modal` keymap layer at `priority: 1` (above the host's text-input
  layer, as the host's own dialogs do): ↑/↓/PgUp/PgDn select, → opens the
  folder, ← goes to the parent folder, Enter moves (a folder that does not exist
  needs a second Enter), Esc is the host's. Tab is left to the host. Verified in
  the real 2.0.26 TUI (`tests/live/tui-transfer.test.ts`).
- **Herdr pane title.** Inside a Herdr pane (`HERDR_ENV=1` with `HERDR_SOCKET_PATH`
  and `HERDR_PANE_ID`, which Herdr gives every process it starts in a pane) the
  TUI reports the open session's agent (`data.session.get(id).agent`, which
  OpenCode records when a prompt is sent; the prompt's Tab selection is not
  visible to plugins) as `display_agent`, and the title of the root of its
  sub-agent chain — the session Herdr's own OpenCode integration reports for
  the pane — as `title`; a value not known is left out, because a report
  replaces the source's whole record (`pane.report_metadata`, display only: state,
  waits and notifications stay with Herdr's integration). The values carry the
  guard `agent: opencode`: measured on Herdr 0.9.3, a report arriving before
  Herdr recognises OpenCode in the pane is accepted but dropped, so the title is
  resent every ten seconds; and a title never outlives the OpenCode that set it.
  The route and titles are read on a timer, as Herdr's integration reads the
  route: there is no host event that arrives after the synced data changed.
  Herdr's agent *name* (`agent rename`) is not set: names are
  `[a-z][a-z0-9_-]{0,31}`, so titles would collide. Verified with the real TUI (OpenCode 2.3.0) in a
  real Herdr 0.9.5 (`tests/live/tui-herdr.test.ts`).
- **Reconnect restore.** `data.on("server.connected" | "session.deleted")`
  observes reconnects and deletions, `data.session.sync(S)` verifies the
  session the route left (rejecting with `name`/`_tag` `SessionNotFoundError`
  when it is gone, measured on the real 2.3.0 TUI), and `ui.router.navigate`
  puts it back. The route is polled (`ui.router.current()`) because no host
  event fires after the synced data changes.
- `plugin.list` does not wait for activation; `integration.list` does, so tests
  call it first. The CLI `session list` can answer `[]` for a just-created
  session; tests use `api session.list`.

## 6. Tests: `tests/{unit,component,e2e,live}`

| Tier | What runs | Coverage |
|---|---|---|
| unit | one class at a time with stand-ins; the architecture, SOLID, platform, host-fixture and coverage-completeness gates | **measured, 100%** |
| component | the wired plugin painted by the real OpenTUI renderer; the wired Herdr pane presentation against a fake Herdr socket; tool parity; real SQLite compacting real databases | not gated |
| e2e | `src` driven end to end in-process: the v2 entries through the real 2.0.14 `Host.resolve`/`Host.load` and slot resolver (the Herdr pane title over a Unix socket); the CLI container over real databases (OpenCode 2.0.24's schema), Magic Context stores, folders and git repositories, legacy parity, and the browser applying its queue in OpenTUI's test renderer | **measured, 100%, per platform** |
| live | the real `opencode` executable, the built bundles, the installers, the real TUI in a pseudo-terminal (sidebar line and `/transfer-session`); the real TUI in a pane of a real, private Herdr server (pane title; skipped without a runnable `herdr` server); the CLI on a snapshot of the real `opencode.db`; the compiled browser in a pseudo-terminal; the installed Magic Context upgrading and opening real store copies; a real `sync` and `context sync` into a copy of this machine's profile, listed afterwards by a sandboxed OpenCode (when `OPENCODE_SM_LIVE_OTHER_PROFILE` is set). Variables: README, *Environment variables* | not measurable |

Coverage tools only see code executed in the test process, so "e2e" is the
in-process real-host tier and "live" is the real external process.

OS-specific tests live beside the code they cover: tests of a
`src/infrastructure/adapters/outbound/platform/<platform>/` adapter live in
`tests/unit/platform/<platform>/`, mirroring `src`. `tests/support/platform.ts`
is the only test file allowed to read `process.platform`: `onlyOn(platform)`
skips a test everywhere but that platform, `requires(present, reason)` skips a
test whose external precondition is missing (both print the reason in the test
name), and `currentPlatform()` is how common code reads the platform it adapts
to or fakes. Rule I12 (`tests/unit/architecture/imports.test.ts`) enforces it.
A test that compares a `tmpdir()`-built path with a path the code resolved builds
it from `realpathSync(tmpdir())` (`/var` vs `/private/var` on macOS).

### Test support (`tests/support`)

| File | What it gives a test |
|---|---|
| `source-files.ts` | every `src` file, for the architecture and completeness gates |
| `no-herdr.ts` | preloaded by every test run: removes `HERDR_ENV`, `HERDR_SOCKET_PATH`, `HERDR_PANE_ID`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, so a test run inside a Herdr pane never reports to the user's Herdr |
| `platform.ts` | the only test file that reads `process.platform`: `onlyOn`, `requires`, `currentPlatform` (D29, rule I12) |
| `fakes/herdr-socket.ts` | a stand-in for Herdr's API socket that records requests and answers `ok`, `error`, `garbage`, `split`, `silent` or `close` |
| `fault-proxy.ts` | the event-stream fault proxy (`startFaultProxy`: `pass`, `stall`, `stall-then-fail`, `stall-then-404`, `stall-then-hold`); a repo deliverable used by the live reconnect-restore and re-sync-retry tests |
| `fakes/hosts.ts`, `fakes/transfer-ports.ts` | stand-ins for the OpenCode hosts and the transfer ports (`FakeDirectoryListingAdapter`: folders in memory) |
| `fakes/dialog-host.tsx` | the host's dialog stack and keymap as a plugin dialog sees them: paints with OpenTUI's test renderer, runs the command a modal layer binds to a key, types, clicks, Esc |
| `fixtures/host-2.0.14/` | verbatim OpenCode 2.0.14 host sources (re-extracted, never edited), so tests run the host's own rules |
| `fixtures/legacy-session-id-index.js`, `fixtures/legacy-session-id-index.d.ts` | the hand-written tool this plugin replaced, kept verbatim |
| `live/process.ts` | runs processes, finds OpenCode, `removeTemporary()`/`removeTemporarySync()` |
| `live/sandbox-opencode.ts` | a sandboxed `opencode serve` on copied stores (`serveSandbox`, `sandboxEnvironment`), for the live `fork` and `relocate` tests |
| `live/fixtures.ts` | the real stores of the live tier: OPENCODE_SM_LIVE_OTHER_PROFILE / OPENCODE_SM_LIVE_OLD_CONTEXT, else the folder `bun run fixtures:live` (`scripts/live-fixtures.mjs`, live-tested) fills |
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
| `sessions/opencode-stores.ts`, `sessions/opencode-2.0.24.sql`, `sessions/opencode-2.0.32.sql` | stores with OpenCode 2.0.24's (default) or 2.0.32's (`schema: "2.0.32"`, with its migrations) real schema (every `CREATE`, read from a live store with `select sql from sqlite_master`; refresh it the same way when OpenCode changes its schema) and given projects and sessions, optionally with OpenCode 1 rows and every per-session table filled (`makeOpenCode2Store`) |
| `sessions/magic-context-94.sql` | every `CREATE` statement (tables, virtual tables, indexes, triggers) of a real Magic Context 0.45.0 store, written by `bun run schema -- fixture`; refresh it the same way when Magic Context changes format, then regenerate `schema/magic-context.ts` |
| `sessions/magic-context-95.sql` | the same for a real Magic Context 0.47.0 store (format 95: format 94 plus `temporal_decisions` and `git_commit_fts_rowid_map`, and changed indexes); `schema/magic-context.ts` is generated from it |
| `sessions/magic-context-package.ts` | a stand-in Magic Context package (declared seam) |
| `sessions/catalogs.ts` | catalogued sessions and opened profiles for browser tests |
| `sessions/sql-script.ts` | `runScript`, `statementsOf`: a fixture's extra SQL run one statement at a time (Bun 1.4's `exec` ignores errors of all but the last statement of a script) |
| `sessions/frames.ts` | `waitForText`: waits in real time for text in OpenTUI's test renderer |
| `sessions/terminal-streams.ts` | a silent terminal for OpenTUI's renderer |
| `live/drive-repair.mjs` | opens the real OpenCode TUI in a pseudo-terminal and waits for the startup location repair to report through a toast |
| `repair/repair-process.ts` | one OpenCode window's repair pass, in its own process, over a host whose sessions live in a shared JSON file |
| `patches/fake-opencode.ts` | patches | an `opencode serve` stand-in (`ok`, `reject`, `nolog`, `missing`, `silent`, `exit`) |
| `patches/fakes.ts` | patches | in-memory ports and a small synthetic patch with computed checksums |
| `patches/follow-fakes.ts` | patches | in-memory registry, installer, store, sandbox, running server, lock and evidence |
| `patches/registry.ts` | patches | an npm tarball of a fixture, and a local npm registry |
| `patches/sandbox.ts` | patches | a temporary home holding installed copies, a config pin, a log, a fake `/proc`, a recording `notify-send` |
| `patches/world.ts` | patches | the application wired to the fakes |
| `patches/fixtures/` | patches | the upstream Magic Context files every patch definition moves (16 versions; frozen bytes, checksummed by `definitions/patches.test.ts`, skipped by the docs lint's variable scan) |

### Coverage law

`bun run coverage:unit` (`bunfig.coverage.toml`) and `bun run coverage:e2e`
(`bunfig.coverage.e2e-<platform>.toml`, picked by `scripts/coverage.mjs`) each
require 100 % lines and functions on every `src` file. The e2e gate is per
platform: the real platform adapters only work on their own platform, so each
platform's e2e run leaves the other platforms' adapter folders and containers to
theirs (Linux, Windows and macOS each have a config; darwin's is
`bunfig.coverage.e2e-darwin.toml`), and a release needs the e2e gate green on
every platform it ships. Bun
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
- No tier talks to the user's Herdr: `tests/support/no-herdr.ts` clears the
  `HERDR_*` variables before any test, and the live tier runs its own Herdr
  server under a private `XDG_CONFIG_HOME` in the temporary folder.

## 8. Deployment

`bun run install:plugin:v2` builds, then copies `server.js` and `tui.js` into
`<plugins>/session-manager/` (temp + rename). `<plugins>` is `OPENCODE_V2_PLUGIN_DIR`,
else `$XDG_CONFIG_HOME/opencode/plugins`. Installing removes the retired OpenCode 1
form's files (`session-manager{,.tui}.js`) and the predecessors' (`session-id/`,
`sessions-transfer/`, `sessions-transfer{,.tui}.js`), exact names only; a
non-empty folder is never removed and no configuration is edited.
`bun run install:cli` builds, then copies `dist/cli/opencode-session-manager`
to `OPENCODE_SESSION_MANAGER_BIN_DIR` (default `~/.local/bin`) under a temporary
name and renames it into place (a copy, never a link, so a rebuild cannot break
the command in use); `validate:installed:cli` byte-compares it and runs
`--version` (`scripts/install-cli.mjs`, live-tested in a throwaway folder).
`validate:installed:v2` byte-compares the installed files with `dist/`, checks
the module shapes, and fails if a retired form is present.
`bun run install:watch` installs the watch that runs
`opencode-session-manager patches follow` when OpenCode adds another Magic
Context, when `opencode.jsonc` changes, 2 minutes after login and every 6
hours: systemd user units (`systemd/opencode-session-manager-patches.path`,
`.service`, `.timer`) on Linux, a launchd agent on macOS; on Windows it exits 1
(`scripts/watch.mjs`, `OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR`,
`OPENCODE_SESSION_MANAGER_PATCHES_LAUNCHD_DIR`, template
`launchd/opencode-session-manager-patches.plist`).
`bun run validate:watch` checks the units are installed, valid, enabled and
active; `bun run uninstall:watch` removes them.

## 9. Documents

`README.md` is for users, this file for whoever changes the code. Everything else
lives under `docs/`, named `YYYY-MM-DD-HH-MM-<name>.md` with the real time:
`docs/plans/` (approved plans), `docs/research/` (designs and evaluations before a
plan), `docs/reference/` (ground truth: external formats, frozen predecessors'
docs), `docs/issues/` (bugs being chased), `docs/sessions/` (an agent session's
state), `docs/temp/` (scratch). `bun run lint:diagrams` checks fences, mermaid
blocks, that referenced paths exist (except under `docs/reference/`, `docs/plans/` and `docs/sessions/`, which describe states other than the current tree), that every
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
the compiled CLI have no runtime dependencies. That includes the libraries the
CLI bundles: `@npmcli/arborist` 9.4.0 (the `patches follow` installer) and every
OpenTUI, drizzle and Solid package sit in `devDependencies`. `node_modules/`,
`dist/`, `build/`, `coverage/` are ignored. History is append-only; pushing needs the owner's explicit go-ahead.
