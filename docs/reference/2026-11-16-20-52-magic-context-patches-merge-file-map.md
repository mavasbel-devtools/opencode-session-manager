# File map: opencode-magic-context-patches imported into opencode-session-manager

Sources: opencode-magic-context-patches {S-final}=2f86e63d97ad07c6fe330b7e36f2917c1bd8da09, opencode-session-manager {base}=3d079851592c159054bec7c0b55b5e76c7095fcf


From the read-only survey `{T}/opencode/{SID}/merge-research/2026-11-16-file-map.md` (SHA-256
`d46e9cf216724375fec0aa92770eec2faae58584537175dde4c21f5602b22faa`, 2026-11-16 01:07), headings demoted one level,
its Gaps section replaced by the resolutions below. Where a resolution and a row differ, the resolution wins.

Read-only research, written 2026-11-16 (system clock `date +%Y-%m-%d-%H-%M` → `2026-11-16-01-07`).

- **S** = `/Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches`, committed state, HEAD `cd92fff`
  (`git rev-parse --short HEAD`), 262 tracked files (`git ls-files | wc -l`): 153 outside
  `tests/fixtures/` and 109 inside it.
- **A** = `/Users/mavasbel/Dev/repos/devtools/opencode-session-manager`, committed `029c1b8` plus the
  uncommitted work in the main checkout (18 modified, 12 untracked: `git -C A status --porcelain`).
  `A/worktrees/` is ignored. A's `src` holds 233 files, committed and untracked together
  (`git ls-files src` + `git ls-files --others --exclude-standard src`).
- File:line anchors in A point at the **working tree**. Several of the files they name are modified
  but not committed (`src/main/cli-container.ts`, `src/infrastructure/adapters/inbound/cli/HelpCliAdapter.ts`,
  `AGENTS.md`, `README.md`, `tests/unit/maintenance/main/container.test.ts`), so their line numbers can
  move before the merge.
- Placeholder used below: `<merge-stamp>` = the output of `date +%Y-%m-%d-%H-%M` taken at the step
  that imports the frozen documents (A AGENTS.md:635 requires the real time in document names).

Three labels are used throughout: **known** (checked; the evidence is cited), **inferred** (reasoned
from the cited evidence), and **unknown** (listed under Gaps).

## Rules that constrain the move

Every rule below comes from A's tests, scripts or configuration, or from A/AGENTS.md where the tests
enforce it.

### `tests/unit/architecture/imports.test.ts`

| # | Rule | Where |
|---|---|---|
| I1 | The SQLite engine `infrastructure/adapters/outbound/sqlite/engine/Store.ts` is the only file allowed to import `bun:sqlite`, import drizzle's `sql`, or run `.query(`/`.prepare(`/`.exec(` on SQL text. S has none of these (an aft grep of `patches/` found 0; S's `.exec(` calls are `RegExp.exec` on identifiers, e.g. `src/domain/services/EffectReading.ts:21`, which the regex `\.(?:query|prepare|exec)\(\s*[`"']` does not match because no quote follows). | imports.test.ts:21-35 |
| I2 | `src` has exactly the four layers `application`, `domain`, `infrastructure`, `main`. | :45-47 |
| I3 | Allowed alias targets per layer: domain → `@session-manager/domain/`; application → domain and application; infrastructure → domain, application, infrastructure; main → everything under `@session-manager/`. | :14-19, :49-56 |
| I4 | No relative imports anywhere in `src`. | :58-60 |
| I5 | `domain` and `application` import only `@session-manager/…`: no `node:`, `bun:` or third-party package. | :62-71 |
| I6 | No `from "@opencode/…"` in any src file. | :73-75 |
| I7 | `@opentui/*` is imported only as `import type` outside `.tsx` files. | :77-87 |
| I8 | Only `main/` imports `main/server-container`, `main/tui-container` or `main/cli-container`. | :89-97 |
| I9 | The `main/<word>-container.ts` files are **exactly** `cli-container.ts`, `linux-container.ts`, `server-container.ts`, `tui-container.ts`, `win32-container.ts`; the import graph of `main/v2/server.ts` holds no `.tsx` file and no `tui-container.ts`. | :99-123 |
| I10 | Ports sit under `domain/ports/inbound/` or `domain/ports/outbound/`, **directly** (the test takes `rest.split("/")[1]` as the file name, so a subfolder fails), and each port file exports exactly one `interface …Port`, whose name equals the file name. | :125-141 |
| I11 | Adapters exist on both the inbound and the outbound side, and every `*Adapter.ts(x)` file is under `infrastructure/adapters/`. | :143-152 |
| I12 | Outside `tests/support/platform.ts` and `tests/unit/platform/<p>/`, no test file reads `process.platform` (D29). | added by step 4.3 |

### `tests/unit/architecture/solid-principles.test.ts`

| # | Rule | Where |
|---|---|---|
| P1 | A file exports at most one class, and that class is named after the file. | :12-22 |
| P2 | A file has as many `constructor(` as it has `class X` (counted textually, comments included). | :24-31 |
| P3 | A class in an `*Adapter.ts(x)` or `*UseCase.ts(x)` file declares `implements <Port>`. Inbound adapters (under `/adapters/inbound/`) are exempt. | :33-43 |
| P4 | Every file under `application/` imports only from `@session-manager/domain/…`, or uses `import type` from `@session-manager/application/…`. **A value import from another application file fails**, and the text `Adapter` may not appear anywhere in an application file. | :45-64 |
| P5 | `new X` of a class defined in `src` appears only in `main/<word>-container.ts`. Classes whose name ends in `Error` are exempt. | :66-76 |
| P6 | No src class extends another src class. Extending a built-in such as `Error` is allowed. | :78-85 |

### Coverage, platforms and test support

| # | Rule | Where |
|---|---|---|
| C1 | The unit tier imports every src file, so none escapes the per-file gate. | tests/unit/architecture/coverage-completeness.test.ts:4-8 |
| C2 | The e2e tier imports every src file of the current platform, and no file of another platform. | tests/e2e/coverage-completeness.test.ts:4-10 |
| C3 | `sourceFiles()` collects every `.ts`/`.tsx` under `src`; `PLATFORMS = ["linux", "win32"]`; `platformOf` reads a file's platform from `infrastructure/adapters/outbound/platform/<p>/` or from `main/<p>-container.ts` when `p` is in `PLATFORMS`; `loadEverySource(platform)` keeps only that platform's files. | tests/support/source-files.ts:7-16, :21, :24-29, :41-48 |
| C4 | `PLATFORMS` equals `SUPPORTED_PLATFORMS`; the folders under `outbound/platform/` are exactly `SUPPORTED_PLATFORMS`; each supported platform has `main/<p>-container.ts`. | tests/unit/maintenance/architecture.test.ts:11-16 |
| C5 | Only that platform's container or folder imports `…/outbound/platform/<p>/…`. | tests/unit/maintenance/architecture.test.ts:18-27 |
| C6 | A platform container is loaded only by `main/cli/platform.ts`, and only through `await import(…)`; no static `import … -container"` there. | tests/unit/maintenance/architecture.test.ts:29-39 |
| C7 | `LOADERS` = `linux`, `win32`; `SUPPORTED_PLATFORMS = Object.keys(LOADERS)`; any other platform throws `UnsupportedPlatformError`. | src/main/cli/platform.ts:22-33 |
| C8 | Asserted behaviour: `SUPPORTED_PLATFORMS` deep-equals `["linux","win32"]`, and `darwin` is refused with the exact message `unsupported platform: darwin (supported: linux, win32)`. | tests/unit/maintenance/infrastructure/platform.test.ts:145-163 |
| C9 | Asserted behaviour: `buildContainer` rejects darwin, and wires every supported platform. | tests/e2e/maintenance/failures.test.ts:183-199 |
| C10 | `scripts/coverage.mjs` uses `bunfig.coverage.toml` for unit and `bunfig.coverage.e2e-${process.platform}.toml` for e2e; a missing e2e config exits 1. | scripts/coverage.mjs:11-14, :20-23, :24 |
| C11 | The gate is 100 % lines and functions per file. The e2e configs ignore the other platform's adapter folder and container. | bunfig.coverage.toml:15-16; bunfig.coverage.e2e-linux.toml:16-17; bunfig.coverage.e2e-win32.toml:16-17 |
| C12 | Tests preload `@opentui/solid/preload` and `./tests/support/no-herdr.ts`; plain test runs have `coverage = false`. | bunfig.toml:5-9 |

### `scripts/lint-diagrams.mjs` (`bun run lint:diagrams`)

| # | Rule | Where |
|---|---|---|
| L1 | Code fences are balanced in every `.md`/`.mdx` of the repository, `docs/reference/` and test fixtures included. | :21-32, :41-42 |
| L2 | Mermaid blocks contain no `->--` and no table row holding `-->`. | :44-48 |
| L3 | Every repo-relative `src|tests?|scripts|docs/….(tsx|ts|mjs|md|json|js)` path written in a document exists, **except** in documents under `docs/reference/`. | :35, :50-51 |
| L4 | Every `bun run <name>` in README.md or AGENTS.md is a real script. | :53-55 |
| L5 | README.md and AGENTS.md together name every package.json script as `bun run <name>`. | :62 |
| L6 | README.md and AGENTS.md together name every `(OPENCODE|XDG|MAGIC_CONTEXT|HERDR)_[A-Z0-9_]+` read in any tracked or untracked `src`, `tests` or `scripts` file ending `.ts`, `.tsx`, `.mjs` or `.js` — **fixture `.js` files included**. | :65-74 |
| L7 | AGENTS.md names every file under `src/` and `tests/support/`: by its path below the folder, by its basename when that is unique, or through a folder written as `` `dir/` `` or `dir/*`. | :76-89 |
| L8 | Rule L3 does not apply under `docs/plans/` or `docs/sessions/` (working documents describe future and deleted states); L1/L2 still do. AGENTS.md §9 names the exception. | lint-diagrams.mjs (step 1.13); AGENTS.md:§9 |

### Configuration and AGENTS.md rules

| # | Rule | Where |
|---|---|---|
| T1 | Aliases: `@session-manager/*` → `src/*`, `@test/*` → `tests/*`, `@package-json` → `package.json`. Only `.ts`/`.tsx` under `src` and `tests` are included. | tsconfig.json:7-11, :23 |
| T2 | `package.json` has only `devDependencies`, every one pinned exactly; there is no `dependencies` key. | package.json:27-38; AGENTS.md:659-660 |
| T3 | The plugin bundles and the CLI have no runtime dependencies. | AGENTS.md:20, :659-660 |
| T4 | CLI platforms are Linux and Windows; any other is refused. | AGENTS.md:19 |
| T5 | Platform law: OS-specific code lives only in `outbound/platform/<p>/` and is wired only by `main/<p>-container.ts`; adapters take their system root or executable as a constructor argument. | AGENTS.md:198-208 |
| T6 | Every recursive delete in a test goes through `removeTemporary()`/`removeTemporarySync()` (`tests/support/live/process.ts`) or `removeTemporary()` (`tests/support/maintenance/temporary.ts`). | AGENTS.md:603-606 |
| T7 | Documents are named `YYYY-MM-DD-HH-MM-<name>.md`; frozen predecessors' documents go under `docs/reference/`. | AGENTS.md:26, :632-643 |
| T8 | The compiled CLI is built from `src/main/cli/cli.ts` with every autoload off. | scripts/build.mjs:67-83 |
| T9 | Only `src/main/*-container.ts` constructs adapters and use cases; a use case imports from `src/domain` plus the *types* of the application services it composes. | AGENTS.md:178-181 (enforced by P4, P5) |

## File map

How to read this table:

- The table has one row per tracked file of S, and one row per fixture version folder.
- A paths are relative to A's root. `src/…/outbound/` stands for `src/infrastructure/adapters/outbound/`.
- Every moved file keeps its content apart from three mechanical edits: imports rewritten from
  `@mc-patches/…` to `@session-manager/…` (with the new paths), `@patches/…` rewritten to
  `@session-manager/domain/patch-definitions/…`, and `PACKAGE_NAME` replaced by A's
  `MAGIC_CONTEXT_PACKAGE`.
- Rows marked "move+edit" carry further edits, and the why column states them.

Layout chosen for the new files:

- Patch model files go in `src/domain/model/patches/` and patch services in `src/domain/services/patches/`.
- Patch use cases go in `src/application/patches/`.
- Ports stay flat with a `Patch` prefix, because a port subfolder fails I10.
- Patch definitions go in `src/domain/patch-definitions/`. This is legal because each definition file
  imports only `import type { PatchDefinition }` from the domain (I3, I5), defines no class (P1–P6),
  and is loaded and measured like any src file (C1, C11).

| S path | A target path | action | why |
|---|---|---|---|
| `.gitignore` | dropped | drop | A's `.gitignore` already ignores `node_modules/`, `dist/`, `coverage/` and `worktrees/` (A `.gitignore` lines 1, 2, 4, 6) |
| `AGENTS.md` | `docs/reference/<merge-stamp>-legacy-magic-context-patches-agents.md`, with its rules merged into `AGENTS.md` | move+rename, merge | frozen-predecessor precedent (A `docs/reference/2026-10-07-23-30-legacy-db-manager-agents.md`; A AGENTS.md:26). Safety rules 1–7, "Adding a version", the patch-matcher rules and the source map move into A AGENTS.md (see "A files edited") |
| `LICENSE` | dropped | drop | byte-identical to A's `LICENSE` (`cmp` exit 0) |
| `README.md` | `docs/reference/<merge-stamp>-legacy-magic-context-patches-readme.md`, with its user content merged into `README.md` | move+rename, merge | same precedent (A `docs/reference/2026-10-07-23-30-legacy-db-manager-readme.md`). Its one mermaid block passes L2 (checked: no `->--`, no `\|…-->` row); 6 fences pass L1 |
| `bun.lock` | dropped; A `bun.lock` regenerated | drop | A has its own `bun.lock`; adding `@npmcli/arborist` changes it |
| `bunfig.coverage.toml` | dropped | drop | A's `bunfig.coverage.toml` covers all of `src` (C11) |
| `bunfig.toml` | dropped | drop | A's `bunfig.toml` (C12) |
| `package.json` | merged into `package.json` | merge | see Dependencies and "A files edited". Scripts already in A (`build`, `test*`, `coverage*`, `typecheck`, `install:cli`, `validate:installed:cli`, `cli`) keep A's definition; `check` and `lint:docs` are dropped; `install:watch`, `uninstall:watch` and `validate:watch` are added |
| `tsconfig.json` | dropped | drop | A's tsconfig.json:7-11 has no `@mc-patches`/`@patches` aliases; the patches move into `src`, so no alias is added |
| `docs/plans/2026-10-11-19-37-patch-tool.md` | `docs/reference/2026-10-11-19-37-magic-context-patches-plan-patch-tool.md` | move+rename | frozen import. In `docs/plans/` it would fail L3 on S paths that do not exist in A; `docs/reference/` is exempt (lint-diagrams.mjs:50-51) |
| `docs/plans/2026-10-23-00-39-follow-command.md` | `docs/reference/2026-10-23-00-39-magic-context-patches-plan-follow-command.md` | move+rename | same reason (it names 1 repo path) |
| `docs/plans/2026-11-10-22-48-composed-patches-and-fold-identity.md` | `docs/reference/2026-11-10-22-48-magic-context-patches-plan-composed-patches-and-fold-identity.md` | move+rename | same reason (12 repo paths) |
| `docs/plans/2026-11-15-20-44-magic-context-0.49.56.md` | `docs/reference/2026-11-15-20-44-magic-context-patches-plan-magic-context-0.49.56.md` | move+rename | same reason (8 repo paths) |
| `docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md` | `docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md` | move | the name must not change: `evidence` fields (`patches/execute-threshold-min.ts:62`) and `tests/unit/patches/patches.test.ts:16` read `patch.evidence` relative to the repository root. No A file has this name (checked `ls docs/*/<name>`) |
| `docs/reference/2026-10-12-15-13-magic-context-0.48.0-execute-threshold.md` | same path | move | named in the comments of `patches/execute-threshold-min.ts:17`; no collision |
| `docs/reference/2026-10-12-23-15-magic-context-0.49.0-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-14-22-08-magic-context-0.49.2-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-16-17-03-magic-context-0.49.7-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-18-11-42-magic-context-0.49.12-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-19-16-03-magic-context-0.49.13-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-20-20-57-magic-context-0.49.15-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-22-01-14-magic-context-0.49.15-no-session-model-fallback.md` | same path | move | `evidence` of `patches/no-session-model-fallback.ts:51` |
| `docs/reference/2026-10-22-23-00-magic-context-0.49.19-patches.md` | same path | move | named in patch comments; no collision |
| `docs/reference/2026-11-02-06-30-magic-context-0.49.35-patches.md` | same path | move | same |
| `docs/reference/2026-11-02-23-06-magic-context-0.49.35-refusal-patches.md` | same path | move | `evidence` of `patches/refusal-recovery.ts:112` |
| `docs/reference/2026-11-03-01-43-magic-context-0.49.35-refusal-recovery-sandbox.md` | same path | move | frozen; no collision |
| `docs/reference/2026-11-07-23-41-magic-context-0.49.41-patches.md` | same path | move | named in patch comments |
| `docs/reference/2026-11-08-10-45-magic-context-0.49.42-0.49.43-patches.md` | same path | move | same |
| `docs/reference/2026-11-10-23-00-magic-context-fold-identity.md` | same path | move | `evidence` of `patches/fold-identity-stable.ts:41` and `patches/fold-provenance-heal.ts:50` |
| `docs/reference/2026-11-11-01-24-magic-context-0.49.46-0.49.50-patches.md` | same path | move | named in patch comments |
| `docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md` | same path | move | same |
| `docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md` | same path | move | same |
| `docs/research/2026-10-11-20-05-patching-approach.md` | `docs/reference/2026-10-11-20-05-magic-context-patches-research-patching-approach.md` | move+rename | frozen; it names 1 repo path (L3) |
| `docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` | `docs/reference/<merge-stamp>-magic-context-patches-session-ses_e1dc7d932ffe69P47CJLyPq6qR.md` | move+rename | `ses_e1dc7d932ffe69P47CJLyPq6qR` is the id of the session doing the merge, so A's `docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` is reserved for its own record; S's file also names 6 repo paths (L3) |
| `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | `docs/reference/<merge-stamp>-magic-context-patches-session-ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | move+rename | A already has `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` with different content (`cmp`: differ at char 55, line 1) |
| `patches/execute-threshold-min.ts` | `src/domain/patch-definitions/execute-threshold-min.ts` | move | patch data in the domain layer (I3, I5); no class |
| `patches/fold-identity-stable.ts` | `src/domain/patch-definitions/fold-identity-stable.ts` | move | same |
| `patches/fold-provenance-heal.ts` | `src/domain/patch-definitions/fold-provenance-heal.ts` | move | same |
| `patches/index.ts` | `src/domain/patch-definitions/index.ts` | move | its `@patches/…` imports become `@session-manager/domain/patch-definitions/…`; the basename `index.ts` does not exist in A `src` (checked) |
| `patches/no-session-model-fallback.ts` | `src/domain/patch-definitions/no-session-model-fallback.ts` | move | same as the first row |
| `patches/refusal-recovery.ts` | `src/domain/patch-definitions/refusal-recovery.ts` | move | same |
| `scripts/build.mjs` | dropped | drop | A's `scripts/build.mjs:67-83` compiles the single CLI from `src/main/cli/cli.ts` |
| `scripts/coverage.mjs` | dropped | drop | A's `scripts/coverage.mjs`, plus completeness tests C1/C2. S's extra check (a src or patches file missing from the report) is covered by C1 |
| `scripts/install-cli.mjs` | dropped | drop | A's `scripts/install-cli.mjs` installs `opencode-session-manager` (`OPENCODE_SESSION_MANAGER_BIN_DIR`) |
| `scripts/lint-docs.mjs` | dropped | drop | A's `scripts/lint-diagrams.mjs` (L1–L7). Not kept: S's checks that README names every CLI command, and that `patches/…` and `systemd/…` paths exist |
| `scripts/watch.mjs` | `scripts/watch.mjs` | move+edit | no A file of that name. `NAME` becomes `opencode-session-manager-patches`; `OPENCODE_MC_PATCHES_SYSTEMD_DIR` becomes `OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR` (watch.mjs:8, :19); systemd only (see Gaps) |
| `systemd/opencode-magic-context-patches.path` | `systemd/opencode-session-manager-patches.path` | move+rename | `Unit=` names the renamed service |
| `systemd/opencode-magic-context-patches.service` | `systemd/opencode-session-manager-patches.service` | move+rename+edit | `ExecStart=%h/.local/bin/opencode-session-manager patches follow`; `Documentation=` points at A's README |
| `systemd/opencode-magic-context-patches.timer` | `systemd/opencode-session-manager-patches.timer` | move+rename | `Unit=` names the renamed service |
| `src/domain/errors/PatchError.ts` | `src/domain/errors/PatchError.ts` | move | errors are one class per file under `src/domain/errors` (A AGENTS.md:174-175). It extends the built-in `Error` (P6 allows), and `new PatchError` is allowed anywhere (P5 exempts `*Error`) |
| `src/domain/model/Installation.ts` | `src/domain/model/patches/Installation.ts` | move | domain model |
| `src/domain/model/Matcher.ts` | `src/domain/model/patches/Matcher.ts` | move | domain model |
| `src/domain/model/Patch.ts` | `src/domain/model/patches/Patch.ts` | move | domain model; the definitions import its `PatchDefinition` type |
| `src/domain/model/Reports.ts` | `src/domain/model/patches/Reports.ts` | move | domain model |
| `src/domain/model/Status.ts` | `src/domain/model/patches/Status.ts` | move | domain model |
| `src/domain/ports/inbound/CommandPorts.ts` | split into 10 files: `src/domain/ports/inbound/PatchStatusPort.ts`, `PatchApplyPort.ts`, `PatchUndoPort.ts`, `PatchCheckPort.ts`, `PatchInspectPort.ts`, `PatchEffectPort.ts`, `PatchNotifyPort.ts`, `PatchFollowPort.ts`, `PatchFollowRollbackPort.ts`, and `src/domain/model/patches/PatchCommands.ts` | split into 10 files | the file holds 9 `…Port` interfaces (CommandPorts.ts:12-48) plus `PatchCommands` (:50-61); I10 needs one port per file, named after the file. S's `RollbackPort` collides with A's `src/domain/ports/inbound/RollbackPort.ts`, so all nine take a `Patch` prefix. `PatchCommands` is not a port, so it moves to the model |
| `src/domain/ports/outbound/AuditLogPort.ts` | `src/domain/ports/outbound/AuditLogPort.ts` | move | one `…Port` interface (`AuditRecord` is not one); no A file of that name |
| `src/domain/ports/outbound/BackupPort.ts` | `src/domain/ports/outbound/BackupPort.ts` | move | same |
| `src/domain/ports/outbound/DerivedReleasesPort.ts` | `src/domain/ports/outbound/DerivedReleasesPort.ts` | move | same |
| `src/domain/ports/outbound/EvidencePort.ts` | `src/domain/ports/outbound/EvidencePort.ts` | move | same |
| `src/domain/ports/outbound/FilesPort.ts` | `src/domain/ports/outbound/FilesPort.ts` | move | kept, not merged: A's `FileSystemPort` (isDirectory, ensureDirectory, canonical) and `MaintenanceFileSystemPort` (synchronous exists, size, freeBytes, rename, mkdirp, remove, copyFile, removeTree) have no read-bytes, no mode-keeping one-step replace and no list-by-extension (S FilesPort.ts:1-9) |
| `src/domain/ports/outbound/HashPort.ts` | `src/domain/ports/outbound/HashPort.ts` | move | A has no hash port |
| `src/domain/ports/outbound/InstallationsPort.ts` | `src/domain/ports/outbound/InstallationsPort.ts` | move | differs from A's `MagicContextConfigPort.installed(spec)`, which returns one version string (A MagicContextConfigPort.ts:5-6); S needs every copy with its root |
| `src/domain/ports/outbound/ManagedStorePort.ts` | `src/domain/ports/outbound/ManagedStorePort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/PackageInstallerPort.ts` | `src/domain/ports/outbound/PackageInstallerPort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/RegistryPort.ts` | `src/domain/ports/outbound/RegistryPort.ts` | move | kept apart from A's `PublishedVersionPort`, whose `latest(): Promise<string \| null>` never throws (A PublishedVersionPort.ts:2-5). S needs `{version, integrity}`, `find(version)`, and a thrown reason (S NpmRegistryAdapter.ts:25-35) |
| `src/domain/ports/outbound/SandboxPort.ts` | `src/domain/ports/outbound/SandboxPort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/SystemPorts.ts` | split into 7 files: `src/domain/ports/outbound/ClockPort.ts`, `NotifierPort.ts`, `LogPort.ts`, `ServicePort.ts`, `KeyValuePort.ts`, `LivePluginsPort.ts` (with `LivePlugin`), `FollowLockPort.ts` | split into 7 files | the file holds 7 `…Port` interfaces (SystemPorts.ts:1-50), which fails I10. `LockPort` is renamed `FollowLockPort` so it cannot be confused with A's `StoreLockPort` |
| `src/domain/ports/outbound/TextSourcePort.ts` | `src/domain/ports/outbound/TextSourcePort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/TranspilePort.ts` | `src/domain/ports/outbound/TranspilePort.ts` | move | no A equivalent |
| `src/domain/services/EffectReading.ts` | `src/domain/services/patches/EffectReading.ts` | move+edit | also receives `THRESHOLD_SETTING` from `src/application/EffectUseCase.ts:8`, because `EntrySwitcher.ts:9` imports that value across application files (P4) |
| `src/domain/services/Jsonc.ts` | merged into `src/domain/services/Jsonc.ts` | merge | `stripComments` is identical in both files apart from the variable name `i`/`index` (diff of S :5-36 against A :2-33). `PACKAGE_NAME` (S :38) equals `MAGIC_CONTEXT_PACKAGE` (A :35). Added to A: `StringLiteral`, `stringLiterals`, `isMagicContextEntry`, `magicContextEntries`, `pinnedSpec`, `replaceMagicContextEntry`, `magicContextEntry`, `numericSetting` (S :40-116) |
| `src/domain/services/MatcherRules.ts` | `src/domain/services/patches/MatcherRules.ts` | move | pure rules |
| `src/domain/services/PatchRules.ts` | `src/domain/services/patches/PatchRules.ts` | move | pure rules |
| `src/domain/services/Versions.ts` | merged into `src/domain/services/Versions.ts` | merge | one semver 2.0.0 §11 `compareVersions` (decision 6; see the compareVersions section) |
| `src/application/ApplyUseCase.ts` | `src/application/patches/ApplyUseCase.ts` | move+edit | `blocker` (:11-21) moves to `src/domain/services/patches/PatchRefusals.ts`, because `UndoUseCase.ts:1` imports it as a value (P4) |
| `src/application/ChangeWriter.ts` | `src/application/patches/ChangeWriter.ts` | move | application service; constructed only in the container |
| `src/application/CheckUseCase.ts` | `src/application/patches/CheckUseCase.ts` | move | implements `PatchCheckPort` (P3) |
| `src/application/EffectUseCase.ts` | `src/application/patches/EffectUseCase.ts` | move+edit | `THRESHOLD_SETTING` moves to the domain (see EffectReading) |
| `src/application/FollowUseCase.ts` | `src/application/patches/FollowUseCase.ts` | move+edit | :3 imports the value `loadsFrom` and :5 the class `StepLog` from application (P4), and :54 and :80 run `new StepLog` (P5). `loadsFrom` and `packageRoot` (:18) move to `src/domain/services/patches/FollowRules.ts`; StepLog becomes a domain factory |
| `src/application/InspectUseCase.ts` | `src/application/patches/InspectUseCase.ts` | move | implements `PatchInspectPort` |
| `src/application/InstallationCatalog.ts` | `src/application/patches/InstallationCatalog.ts` | move+edit | `Target` (:14) moves to `src/domain/model/patches/PatchTargets.ts`, because `blocker` (domain now) needs it |
| `src/application/NotifyUseCase.ts` | `src/application/patches/NotifyUseCase.ts` | move | its exported values are imported only by tests (aft grep: no application importer) |
| `src/application/PatchInspector.ts` | `src/application/patches/PatchInspector.ts` | move+edit | `FileOnDisk` (:10) moves to `src/domain/model/patches/PatchTargets.ts` |
| `src/application/ReleaseCatalog.ts` | `src/application/patches/ReleaseCatalog.ts` | move | application service |
| `src/application/RollbackUseCase.ts` | `src/application/patches/FollowRollbackUseCase.ts` | move+rename+edit | the class and file `RollbackUseCase` collide with A's `src/application/RollbackUseCase.ts`. :1 imports the value `PREVIOUS_ENTRY` and :3 `StepLog`, and :25 runs `new StepLog`; both are fixed as in FollowUseCase. It implements `PatchFollowRollbackPort` |
| `src/application/StatusUseCase.ts` | `src/application/patches/StatusUseCase.ts` | move | implements `PatchStatusPort` |
| `src/application/UndoUseCase.ts` | `src/application/patches/UndoUseCase.ts` | move+edit | `blocker` is imported from the domain |
| `src/application/follow/AdoptionRecorder.ts` | `src/application/patches/follow/AdoptionRecorder.ts` | move+edit | `PREVIOUS_ENTRY`, `LAST_FOLLOW_NOTIFICATION` and `FOLLOW_TITLE` (:11-13) move to `FollowRules.ts`; FollowRollbackUseCase imports `PREVIOUS_ENTRY` as a value |
| `src/application/follow/EntrySwitcher.ts` | `src/application/patches/follow/EntrySwitcher.ts` | move+edit | :2 imports the values `CONFIG_REJECTION` and `loadsFrom` from application, and :9 `THRESHOLD_SETTING` (P4); all come from the domain after the move. `loadsEntry` (:20) moves to `FollowRules.ts` for cohesion |
| `src/application/follow/PluginEntryEditor.ts` | `src/application/patches/follow/PluginEntryEditor.ts` | move | application service |
| `src/application/follow/ReleaseProver.ts` | `src/application/patches/follow/ReleaseProver.ts` | move+edit | `CONFIG_REJECTION` and `loadsFrom` (:6, :9) move to `FollowRules.ts` |
| `src/application/follow/ReleaseStager.ts` | `src/application/patches/follow/ReleaseStager.ts` | move | application service |
| `src/application/follow/StepLog.ts` | `src/domain/model/patches/StepLog.ts` | move+edit | rewritten from `class StepLog` into a factory function `stepLog(clock: ClockPort)` that returns the same methods. Use cases may not `new` a src class (P5), and the class is pure bookkeeping (StepLog.ts:5-38) |
| `src/infrastructure/adapters/inbound/cli/CliAdapter.ts` | `src/infrastructure/adapters/inbound/cli/PatchesCliAdapter.ts` | move+rename+edit | the group adapter behind `CliRouter`; keeps every flag, output and exit code (CliAdapter.ts:31-140). Its `HELP` is renamed `PATCHES_HELP` because A's `HelpCliAdapter.ts:3` already exports `HELP`. It keeps its own `CliOutput {out, err}` (:6-9), which the container wires to `ConsoleOutputAdapter` and a new `StderrOutputAdapter` |
| `src/infrastructure/adapters/inbound/cli/TextFormatter.ts` | `src/infrastructure/adapters/inbound/cli/PatchesTextFormatter.ts` | move+rename | an object literal, not a class (`export const TextFormatter`, :15); renamed so it is not mistaken for A's CLI formatting |
| `src/infrastructure/adapters/outbound/cache/CompositeInstallationsAdapter.ts` | `src/…/outbound/magic-context/CompositeInstallationsAdapter.ts` | move | A keeps its Magic Context adapters in `outbound/magic-context/`; no name collision |
| `src/infrastructure/adapters/outbound/cache/ManagedInstallationsAdapter.ts` | `src/…/outbound/magic-context/ManagedInstallationsAdapter.ts` | move | same |
| `src/infrastructure/adapters/outbound/cache/OpencodeCacheInstallationsAdapter.ts` | `src/…/outbound/magic-context/OpencodeCacheInstallationsAdapter.ts` | move | kept apart from A's `OpencodeMagicContextConfigAdapter.installed`: S lists every copy, installed directly or one numbered folder down, with its root (S adapter :29-40). A reads only the newest version under `…@<spec>/<stamp>/…` (A :27-39) |
| `src/infrastructure/adapters/outbound/crypto/Sha256Adapter.ts` | `src/…/outbound/crypto/Sha256Adapter.ts` | move | A has no hash adapter |
| `src/infrastructure/adapters/outbound/fs/FileKeyValueAdapter.ts` | `src/…/outbound/fs/FileKeyValueAdapter.ts` | move | A has no key-value store |
| `src/infrastructure/adapters/outbound/fs/FileLockAdapter.ts` | `src/…/outbound/fs/FsFollowLockAdapter.ts` | move+rename+edit | the liveness check on `/proc/<pid>` (:28) is Linux-only and leaves for a `ProcessLivenessPort` that the platform containers provide (T5, decision 4). Renamed beside A's `FsStoreLockAdapter`; implements `FollowLockPort` |
| `src/infrastructure/adapters/outbound/fs/FsBackupAdapter.ts` | `src/…/outbound/fs/FsBackupAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/FsEvidenceAdapter.ts` | `src/…/outbound/fs/FsEvidenceAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/FsManagedStoreAdapter.ts` | `src/…/outbound/fs/FsManagedStoreAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter.ts` | `src/…/outbound/fs/JsonDerivedReleasesAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter.ts` | `src/…/outbound/fs/JsonlAuditLogAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/NodeFilesAdapter.ts` | `src/…/outbound/fs/NodeFilesAdapter.ts` | move+edit | the staging name `.mc-patches-<pid>` (:21) is kept or renamed `.session-manager-patches-<pid>`: not decided (Gaps) |
| `src/infrastructure/adapters/outbound/fs/TextFileAdapter.ts` | `src/…/outbound/fs/TextFileAdapter.ts` | move | implements `TextSourcePort, LogPort` (P3 regex matches the first) |
| `src/infrastructure/adapters/outbound/notify/NotifySendAdapter.ts` | `src/…/outbound/platform/linux/NotifySendAdapter.ts` | move | `notify-send` is the Linux notifier (decision 4); wired only from `src/main/linux-container.ts` (C5) |
| `src/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter.ts` | `src/…/outbound/npm/ArboristInstallerAdapter.ts` | move | the only third-party runtime import (`@npmcli/arborist`), in infrastructure (I5 allows it there) |
| `src/infrastructure/adapters/outbound/npm/NpmRegistryAdapter.ts` | `src/…/outbound/npm/NpmPackumentAdapter.ts` | move+rename | collides with A's `src/infrastructure/adapters/outbound/npm/NpmRegistryAdapter.ts` (same path and class). They behave differently: A asks `/<pkg>/latest` with a time limit and returns null on failure (A :15-24); S reads the abbreviated packument, returns integrity, and throws a reason (S :13-35) |
| `src/infrastructure/adapters/outbound/opencode/OpencodeLivePluginsAdapter.ts` | `src/…/outbound/opencode2/OpencodeLivePluginsAdapter.ts` | move | A's OpenCode 2 server adapters live in `opencode2/`; it reads the same `service.json` as A's `HttpOpencodeServerAdapter`, but through other endpoints (GET `/api/debug/location`, `/api/plugin`) |
| `src/infrastructure/adapters/outbound/opencode/OpencodeSandboxAdapter.ts` | `src/…/outbound/opencode2/OpencodeSandboxAdapter.ts` | move | same folder reasoning |
| `src/infrastructure/adapters/outbound/parse/BunTranspileAdapter.ts` | `src/…/outbound/parse/BunTranspileAdapter.ts` | move | no A equivalent |
| `src/infrastructure/adapters/outbound/proc/ProcServiceAdapter.ts` | `src/…/outbound/platform/linux/ProcServiceAdapter.ts` | move | reads `/proc` (:22-36), so Linux only (T5, decision 4) |
| `src/infrastructure/adapters/outbound/system/SystemClockAdapter.ts` | merged into `src/…/outbound/system/SystemClockAdapter.ts` | merge | same path and class as A's. A's `now()` (A :16-18) equals S's (S :6-8); A gains `sleep(ms)` (S :10-12) and declares `implements RuntimePort, ClockPort` |
| `src/main/bin.ts` | merged into `src/main/cli/cli.ts` | merge | the entry exits at once with the code, because Arborist keeps idle registry connections for about two minutes (bin.ts:3-5). A's entry sets `process.exitCode` (cli.ts:15) and must call `process.exit` instead |
| `src/main/cli.ts` | split into 2: `src/…/outbound/platform/linux/ClockTicks.ts` (`clockTicks`, :9-13), and `main`/`processOutput` (:16-25) merged into `src/main/cli-container.ts` | split into 2 files | `getconf CLK_TCK` is Linux-only (decision 4). `main` duplicated A's entry; `processOutput` is replaced by `ConsoleOutputAdapter` plus the new `StderrOutputAdapter` |
| `src/main/container.ts` | `src/main/patches-container.ts` | move+rename+edit | P5 allows `new` only in `main/<word>-container.ts`, so the wiring needs that name; I9's list must then add it. `createCommands(paths, patches, clockTicks, seams)` takes the platform's patch adapters instead of `clockTicksPerSecond` and `paths.proc` (:84, :104); `NotifySendAdapter` (:70) comes from the platform; `new SystemClockAdapter()` (:66) is A's adapter |
| `src/main/paths.ts` | `src/main/cli/patches-paths.ts` | move+rename+edit | env `OPENCODE_MC_PATCHES_*` becomes `OPENCODE_SESSION_MANAGER_PATCHES_*` (:59, :69-70, :75, :77, :80); `NAME` folders become `<data>/opencode-session-manager/patches` and `<state>/opencode-session-manager/patches` (:40, :54, :66, :71-74); `Environment` (:38) is replaced by A's `CliEnvironment` (name collision with A's `src/domain/model/Database.ts:70`) |
| `tests/component/adapters-with-use-cases.test.ts` | `tests/component/patches/adapters-with-use-cases.test.ts` | move | A groups tests by area (`tests/component/maintenance/`) |
| `tests/component/follow-with-real-adapters.test.ts` | `tests/component/patches/follow-with-real-adapters.test.ts` | move | same |
| `tests/e2e/effect.test.ts` | `tests/e2e/patches/effect.test.ts` | move+edit | its fake `/proc` via `OPENCODE_MC_PATCHES_PROC` (:30, :49, :51, :60, :72) exercises the Linux adapter only; per-platform split (Gaps) |
| `tests/e2e/faults.test.ts` | `tests/e2e/patches/faults.test.ts` | move+edit | env rename (:134); `rmSync(box.installations, { recursive: true })` (:138) must use `removeTemporarySync` (T6); `main(…)` calls become the `buildContainer(…).run(["patches", …])` path |
| `tests/e2e/follow.test.ts` | `tests/e2e/patches/follow.test.ts` | move+edit | env renames (:84-88, :243-252, :303, :312, :328) |
| `tests/e2e/lifecycle.test.ts` | `tests/e2e/patches/lifecycle.test.ts` | move+edit | env rename (:195) |
| `tests/live/live.test.ts` | `tests/live/patches/live.test.ts` | move+edit | `BIN` becomes `opencode-session-manager` under `OPENCODE_SESSION_MANAGER_BIN_DIR`, with `patches` as the first argument (:18); env renames (:83-84); `rmSync(…, { recursive: true, force: true })` (:65, :103, :133) must use `removeTemporarySync` (T6); the systemd checks are Linux-only |
| `tests/support/fake-opencode.ts` | `tests/support/patches/fake-opencode.ts` | move | L7: AGENTS.md must name it |
| `tests/support/fakes.ts` | `tests/support/patches/fakes.ts` | move+edit | split ports change its imports (`ClockPort` and the other ports of `SystemPorts.ts`) |
| `tests/support/follow-fakes.ts` | `tests/support/patches/follow-fakes.ts` | move+edit | same |
| `tests/support/registry.ts` | `tests/support/patches/registry.ts` | move | — |
| `tests/support/sandbox.ts` | `tests/support/patches/sandbox.ts` | move+edit | `rmSync(directory, { recursive: true, force: true })` (:17) must use `removeTemporarySync` (T6); `FIXTURES` (:5) becomes `tests/support/patches/fixtures`; the `/proc` stand-in becomes per platform |
| `tests/support/source-files.ts` | dropped | drop | A's `tests/support/source-files.ts` (C3). S's was used only by S's architecture test (aft grep) |
| `tests/support/world.ts` | `tests/support/patches/world.ts` | move+edit | wires the renamed use cases |
| `tests/unit/application/ApplyUndo.test.ts` | `tests/unit/patches/application/ApplyUndo.test.ts` | move | A groups unit tests by area (`tests/unit/maintenance/application/`) |
| `tests/unit/application/Follow.test.ts` | `tests/unit/patches/application/Follow.test.ts` | move | — |
| `tests/unit/application/InspectEffectNotify.test.ts` | `tests/unit/patches/application/InspectEffectNotify.test.ts` | move | — |
| `tests/unit/application/Inspector.test.ts` | `tests/unit/patches/application/Inspector.test.ts` | move | — |
| `tests/unit/application/InstallationCatalog.test.ts` | `tests/unit/patches/application/InstallationCatalog.test.ts` | move | — |
| `tests/unit/application/StatusAndCheck.test.ts` | `tests/unit/patches/application/StatusAndCheck.test.ts` | move | — |
| `tests/unit/architecture/architecture.test.ts` | dropped | drop | its checks are covered by A: layers and aliases (I2–I5), constructors (P2), `implements` (P3), construction only in main (P5), completeness (C1). Its declared-dependency check (:15-17, :35-38) is **not** carried over: it would contradict A's convention of bundling devDependencies (`drizzle-orm`, `@opentui/*`) |
| `tests/unit/domain/EffectReading.test.ts` | `tests/unit/patches/domain/EffectReading.test.ts` | move | — |
| `tests/unit/domain/Jsonc.test.ts` | `tests/unit/patches/domain/Jsonc.test.ts` | move+edit | it tests the merged `src/domain/services/Jsonc.ts`; the duplicate `stripComments` cases sit beside A's `tests/unit/sessions/magic-context-versions.test.ts` |
| `tests/unit/domain/MatcherRules.test.ts` | `tests/unit/patches/domain/MatcherRules.test.ts` | move+edit | `FIXTURES` (:11) points at `tests/support/patches/fixtures` |
| `tests/unit/domain/PatchRules.test.ts` | `tests/unit/patches/domain/PatchRules.test.ts` | move | — |
| `tests/unit/domain/Versions.test.ts` | `tests/unit/domain/versions.test.ts` | move+rename+edit | one test file for the single `compareVersions`. :8 flips (see compareVersions); A's assertions from `tests/unit/sessions/magic-context-release.test.ts:99-103` move here |
| `tests/unit/infrastructure/CliAdapter.test.ts` | `tests/unit/patches/infrastructure/PatchesCliAdapter.test.ts` | move+rename | follows the adapter rename |
| `tests/unit/infrastructure/follow-adapters.test.ts` | `tests/unit/patches/infrastructure/follow-adapters.test.ts` | move+edit | fixture path (:164); the `FileLockAdapter` block (:99-117) is rewritten for `FsFollowLockAdapter` and a liveness stand-in; the SystemClockAdapter `sleeps` case (:124) tests A's merged adapter; `NpmRegistryAdapter` (:132-150) becomes `NpmPackumentAdapter` |
| `tests/unit/infrastructure/fs-adapters.test.ts` | `tests/unit/patches/infrastructure/fs-adapters.test.ts` | move+edit | the `SystemClockAdapter` half of the case at :55-61 tests A's merged adapter |
| `tests/unit/infrastructure/system-adapters.test.ts` | split into 2: `tests/unit/patches/infrastructure/installations-adapters.test.ts` (:18-40) and `tests/unit/patches/infrastructure/platform-linux.test.ts` (`ProcServiceAdapter` :42-72, `NotifySendAdapter` :74-82) | split into 2 files | the Linux adapters move to `platform/linux/` |
| `tests/unit/main/main.test.ts` | `tests/unit/patches/main/patches-container.test.ts` | move+rename+edit | `resolvePaths` cases (:16-64) follow the env and folder renames; the clock-ticks case (:90-92) moves to `platform-linux.test.ts`; the `bin` case (:102-121) is replaced by A's entry test |
| `tests/unit/patches/patches.test.ts` | `tests/unit/patches/definitions/patches.test.ts` | move+edit | `fixture()` (:9) points at `tests/support/patches/fixtures/magic-context-<v>/`; `evidence` paths are unchanged because the reference docs keep their names |
| `tests/fixtures/magic-context-0.47.0/` (4 files) | `tests/support/patches/fixtures/magic-context-0.47.0/` | move | A has no `tests/fixtures/` (`ls`: No such file or directory). A keeps fixtures under `tests/support/…/fixtures/` (A AGENTS.md:561-562, :574). L7: AGENTS names `patches/fixtures/` as a folder. L6: the fixture `.js` files hold 12 env names (see "A files edited", lint-diagrams) |
| `tests/fixtures/magic-context-0.48.0/` (4 files) | `tests/support/patches/fixtures/magic-context-0.48.0/` | move | same |
| `tests/fixtures/magic-context-0.49.0/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.0/` | move | same |
| `tests/fixtures/magic-context-0.49.2/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.2/` | move | same |
| `tests/fixtures/magic-context-0.49.7/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.7/` | move | same |
| `tests/fixtures/magic-context-0.49.12/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.12/` | move | same |
| `tests/fixtures/magic-context-0.49.13/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.13/` | move | same |
| `tests/fixtures/magic-context-0.49.15/` (6 files) | `tests/support/patches/fixtures/magic-context-0.49.15/` | move | same |
| `tests/fixtures/magic-context-0.49.19/` (6 files) | `tests/support/patches/fixtures/magic-context-0.49.19/` | move | same |
| `tests/fixtures/magic-context-0.49.35/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.35/` | move | same |
| `tests/fixtures/magic-context-0.49.41/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.41/` | move | same |
| `tests/fixtures/magic-context-0.49.42/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.42/` | move | same |
| `tests/fixtures/magic-context-0.49.43/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.43/` | move | same |
| `tests/fixtures/magic-context-0.49.50/` (11 files) | `tests/support/patches/fixtures/magic-context-0.49.50/` | move | same |
| `tests/fixtures/magic-context-0.49.55/` (11 files) | `tests/support/patches/fixtures/magic-context-0.49.55/` | move | same |
| `tests/fixtures/magic-context-0.49.56/` (11 files) | `tests/support/patches/fixtures/magic-context-0.49.56/` | move | same |

Fixture totals: 109 files (77 `.js`, 16 `package.json`, 16 `NOTICE.md`; `git ls-files tests/fixtures`).
No `NOTICE.md` names a repo path that L3 would check (grep of all 16 for the L3 pattern: no match).

## New files

These files exist in neither repository today. Files produced by a split, or extracted from an S file,
are marked with their origin. `src/…/outbound/` stands for `src/infrastructure/adapters/outbound/`.

| Path | Responsibility |
|---|---|
| `src/domain/ports/outbound/ProcessLivenessPort.ts` | `isAlive(pid: number): Promise<boolean>`, so `FsFollowLockAdapter` can tell a live owner from a stale one without OS code (replaces S `FileLockAdapter.ts:28`). |
| `src/domain/model/patches/PatchTargets.ts` | extracted: `Target` (from S `InstallationCatalog.ts:14`) and `FileOnDisk` (from S `PatchInspector.ts:10`), so `blocker` can live in the domain. |
| `src/domain/services/patches/PatchRefusals.ts` | extracted: `blocker`, the refusals apply and undo share (from S `ApplyUseCase.ts:11-21`). |
| `src/domain/services/patches/FollowRules.ts` | extracted values that application files imported from one another: `loadsFrom`, `CONFIG_REJECTION` (S `ReleaseProver.ts:6-9`), `loadsEntry` (S `EntrySwitcher.ts:20`), `packageRoot` (S `FollowUseCase.ts:18`), `PREVIOUS_ENTRY`, `LAST_FOLLOW_NOTIFICATION`, `FOLLOW_TITLE` (S `AdoptionRecorder.ts:11-13`). |
| `src/…/outbound/platform/linux/ClockTicks.ts` | from S `src/main/cli.ts:9-13`: `getconf CLK_TCK`, 100 when it cannot be asked; called by `linux-container.ts`. A function, no class (pattern of A `platform/linux/ProcFs.ts`). |
| `src/…/outbound/platform/linux/ProcLivenessAdapter.ts` | `ProcessLivenessPort` on Linux: `<procRoot>/<pid>` exists (S `FileLockAdapter.ts:28`); takes the proc root as a constructor argument (T5). |
| `src/…/outbound/platform/darwin/PsServiceAdapter.ts` | `ServicePort` on macOS: the newest `opencode … serve` start time from `ps -axo pid=,lstart=,command=` (decision 4); takes the `ps` executable as a constructor argument. |
| `src/…/outbound/platform/darwin/KillZeroLivenessAdapter.ts` | `ProcessLivenessPort` on macOS: `process.kill(pid, 0)`, with `ESRCH` meaning gone (decision 4; same probe as A `FsStoreLockAdapter.ts:11`). |
| `src/…/outbound/platform/darwin/OsascriptNotifierAdapter.ts` | `NotifierPort` on macOS: `osascript -e 'display notification … with title …'` (decision 4); takes the executable as a constructor argument. |
| `src/…/outbound/platform/win32/CimServiceAdapter.ts` | `ServicePort` on Windows: PowerShell `Get-CimInstance Win32_Process` filtered to `opencode(.exe)` with `serve` in `CommandLine`, newest `CreationDate` (decision 4); takes the PowerShell executable as a constructor argument. |
| `src/…/outbound/platform/win32/GetProcessLivenessAdapter.ts` | `ProcessLivenessPort` on Windows: PowerShell `Get-Process -Id <pid>` succeeds (decision 4). |
| `src/…/outbound/platform/win32/PowerShellToastNotifierAdapter.ts` | `NotifierPort` on Windows: a PowerShell toast notification (decision 4). |
| `src/main/darwin-container.ts` | the macOS half: exports `darwinPatchesAdapters` (service, liveness, notifier); loaded only by `main/cli/platform.ts` through `await import` (C6). |
| `src/…/outbound/system/StderrOutputAdapter.ts` | `OutputPort` writing to `process.stderr`. `PatchesCliAdapter` writes usage and refusals to stderr (S `CliAdapter.ts:81-82`); A's `OutputPort` is stdout only (A `ConsoleOutputAdapter.ts:12-14`). This adds no method to `OutputPort`, so no existing implementer changes. |
| `bunfig.coverage.e2e-darwin.toml` | the e2e coverage gate on darwin: ignores `platform/linux/**`, `platform/win32/**`, `src/main/linux-container.ts` and `src/main/win32-container.ts` (C10, C11). `scripts/coverage.mjs:20-23` exits 1 on darwin today because this file is missing. |
| `tests/unit/patches/infrastructure/platform-darwin.test.ts` | unit tests of the three darwin adapters with stand-in executables (they take the executable as an argument, so the tests run on any OS: A AGENTS.md:206-207). |
| `tests/unit/patches/infrastructure/platform-win32.test.ts` | the same for the three win32 adapters. |
| `tests/unit/patches/infrastructure/liveness.test.ts` | `ProcLivenessAdapter`, and `FsFollowLockAdapter` with a liveness stand-in. |
| `tests/e2e/patches/platform-<os>.test.ts` (`linux`, `darwin`, `win32`) | e2e of `patches effect`, `patches notify` and the follow lock through the real platform adapters on their own OS (C2 measures each platform's files only on that platform). Exact split: see Gaps. |
| `tests/live/patches/platform.test.ts` | live check, on the running OS, that the service start time, liveness and notification adapters work against the real system. |

Help text needs no new file: `PATCHES_HELP` lives in `PatchesCliAdapter.ts`, and one line is added to A's
`HELP` (see below).

## A files edited

| A file | Change | Anchor |
|---|---|---|
| `src/main/cli-container.ts` | import `createPatchCommands` from `@session-manager/main/patches-container`, `PatchesCliAdapter`, `StderrOutputAdapter`, `PATCHES` and `resolvePatchPaths`. Add `patches?: Seams` (S `container.ts:51-54`) to `ContainerOverrides`. Build the group and register `patches: patchesCli` in the router families. The service path computed at :227 is passed on (S `paths.ts:78` uses the same formula). | imports :1-92; `ContainerOverrides` :110-136; `buildContainer` :143-337; router :336 |
| `src/main/cli-container.ts` | **darwin:** `platformAdapters(...)` at :146 runs eagerly and throws `UnsupportedPlatformError` on darwin, so on macOS no command — `patches` included — gets past it. The maintenance half must become lazy, or darwin must get maintenance adapters (Gaps #1). | :146-148, :170 |
| `src/main/cli/platform.ts` | add `PatchesPlatformAdapters { service: ServicePort; liveness: ProcessLivenessPort; notifier: NotifierPort }`, `PatchesPlatformFactory`, a `darwin` loader, and `patchesPlatformAdapters(platform, settings)`. Separate the maintenance platforms (`linux`, `win32`) from the platforms that have adapter folders (`linux`, `win32`, `darwin`). | :7-14, :22-27, :29-33 |
| `src/main/linux-container.ts` | export `linuxPatchesAdapters` (`ProcServiceAdapter(proc, clockTicks())`, `ProcLivenessAdapter(proc)`, `NotifySendAdapter(notifyCommand)`). | :1-10 |
| `src/main/win32-container.ts` | export `win32PatchesAdapters` (`CimServiceAdapter`, `GetProcessLivenessAdapter`, `PowerShellToastNotifierAdapter`). | :1-10 |
| `src/main/cli/cli.ts` | `process.exitCode = …` becomes `process.exit(await bootstrap(…))`, because Arborist's idle connections hold the process for about two minutes (S `bin.ts:3-5`). | :15 |
| `src/infrastructure/adapters/inbound/cli/HelpCliAdapter.ts` | add a `patches <status\|apply\|undo\|check\|inspect\|effect\|notify\|follow> [--json] …` line to `HELP`. `tests/unit/maintenance/main/help.test.ts:13,16` compares against `[...HELP]`, so it follows automatically. | :3-29 |
| `src/infrastructure/adapters/inbound/cli/CliRouter.ts` | no change: families are a record (:11-19). | — |
| `src/infrastructure/adapters/outbound/system/SystemClockAdapter.ts` | `implements RuntimePort, ClockPort`; add `sleep(ms)`. | :5, after :18 |
| `src/domain/services/Versions.ts` | semver 2.0.0 §11 implementation; doc comment changed. | :1-11 |
| `src/domain/services/Jsonc.ts` | add S's string-literal and entry functions plus `numericSetting` (S `Jsonc.ts:40-116`). Keep `stripComments` (:2-33) and `MAGIC_CONTEXT_PACKAGE` (:35). Whether `pinnedMagicContext` (:41-45) is re-based on `pinnedSpec` is Gaps #12. | :1-45 |
| `package.json` | description (:4) names the patches group. Scripts (:7-26): add `install:watch`, `uninstall:watch`, `validate:watch` (S package.json:23-25). Add `@npmcli/arborist` `9.4.0` and `@types/npmcli__arborist` `6.3.3` (see Dependencies). | :4, :7-26, :27-38 |
| `bun.lock` | regenerated by `bun install` after the package.json change. | whole file |
| `tsconfig.json` | no change needed: the patches move under `src` (covered by :23), and `@package-json` already resolves (:10). S's `resolveJsonModule` is not needed, because A imports JSON with `with { type: "json" }` (A cli-container.ts:41). | — |
| `bunfig.coverage.e2e-linux.toml` | add `src/infrastructure/adapters/outbound/platform/darwin/**` and `src/main/darwin-container.ts` to `coveragePathIgnorePatterns`; comment lines 2-3. | :2-3, :16 |
| `bunfig.coverage.e2e-win32.toml` | the same darwin entries. | :2-3, :16 |
| `bunfig.coverage.toml`, `bunfig.toml`, `scripts/coverage.mjs` | no change (`coverage.mjs:13` already picks `e2e-darwin` by platform). | — |
| `scripts/lint-diagrams.mjs` | L6 would read env names out of the fixture `.js` files: `MAGIC_CONTEXT_DEBUG_HEAP_SNAPSHOT_MAX_RSS_MB`, `MAGIC_CONTEXT_DEBUG_RPC`, `MAGIC_CONTEXT_MARKER`, `OPENCODE_CHANNEL`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_DISABLE_AUTOCOMPACT`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_MODELS_PATH` — none named in A README/AGENTS today (`grep -c` = 0) — plus `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, which are named. Either skip `tests/support/patches/fixtures/` in the scan (:70-71) or name the 9 (Gaps #15). | :65-74 |
| `scripts/build.mjs` | comment only: the CLI now also holds the patches group and bundles Arborist (:64-66). Bundling under the Solid transform plugin is unverified (Gaps #10). | :64-66 |
| `.gitignore` | no change. | — |
| `AGENTS.md` | §1 table: CLI row :18 gains the `patches` group; :19 platforms (darwin for `patches`); :20 runtime dependencies. :23-26: the merged predecessor list gains `opencode-magic-context-patches`. New subsection under §3 with S safety rules 1–7 and the env and folder renames. §4 source map (:305-498): every new and moved src file, the `patch-definitions/` folder, the darwin platform adapters, `darwin-container.ts` and `patches-container.ts` (L7). Platform law (:198-208) adds darwin. Test support table (:552-584) adds `patches/fake-opencode.ts`, `patches/fakes.ts`, `patches/follow-fakes.ts`, `patches/registry.ts`, `patches/sandbox.ts`, `patches/world.ts` and the `patches/fixtures/` folder (L7). Coverage law (:586-596) adds darwin. §8 deployment (:616-630) adds `bun run install:watch`, `bun run uninstall:watch`, `bun run validate:watch` (L5). S's "Adding a version" procedure is rewritten for `opencode-session-manager patches inspect`. Every new env name is listed (L6). | :18-20, :23-26, :168-208, :305-498, :552-596, :616-630, :659-660 |
| `README.md` | the program section (:211-260) gains `patches …` commands. The env table (:849-877) gains `OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN`, `…_PROC`, `…_REGISTRY`, `…_OPENCODE_BIN`, `…_TIMEOUT_MS`, `…_SETTLE_MS`, `…_SYSTEMD_DIR` and `MAGIC_CONTEXT_LOG_PATH` (L6). Architecture (:673) and Build and test (:793) are updated. S README's user content is merged here. | :211-260, :673, :793, :849-877 |
| `tests/unit/architecture/imports.test.ts` | the expected `main/*-container.ts` list (:101-107) adds `main/darwin-container.ts` and `main/patches-container.ts`. | :99-107 |
| `tests/unit/maintenance/architecture.test.ts` | :11-16 compares the platform folders and containers with `PLATFORMS` (now `linux`, `win32`, `darwin`), not with the maintenance `SUPPORTED_PLATFORMS`; :33 matches darwin too. | :3, :11-16, :29-39 |
| `tests/support/source-files.ts` | `PLATFORMS` adds `"darwin"` (:21), so `platformOf` and `loadEverySource` treat darwin files as a platform's (C2, C3). | :20-21 |
| `tests/unit/maintenance/infrastructure/platform.test.ts` | :157 `SUPPORTED_PLATFORMS` deep-equal and :159-163 darwin refusal; these change with Gaps #1. Add the `patchesPlatformAdapters` cases for the three platforms. | :145-163 |
| `tests/e2e/maintenance/failures.test.ts` | :183-187 expects `buildContainer` to reject darwin with `unsupported platform: darwin (supported: linux, win32)`; this changes with Gaps #1. :189-199 loops `SUPPORTED_PLATFORMS`. | :183-199 |
| `tests/unit/sessions/magic-context-release.test.ts` | the `compareVersions` assertions (:99-103) move to `tests/unit/domain/versions.test.ts`; :101 flips (see next section); drop the import at :6 if nothing else uses it. | :6, :99-103 |
| `tests/unit/sessions/magic-context-versions.test.ts` | only if `pinnedMagicContext` changes (Gaps #12). | — |
| `tests/unit/maintenance/infrastructure/adapters.test.ts` | covers `SystemClockAdapter.sleep` (it constructs the adapter at :76). | :76 |

## Collisions

| # | Collision | Evidence | Resolution |
|---|---|---|---|
| 1 | inbound port `RollbackPort` | A `src/domain/ports/inbound/RollbackPort.ts`; S `CommandPorts.ts:45-48` | S's becomes `PatchFollowRollbackPort`; the other eight inbound ports take the `Patch` prefix too |
| 2 | class and file `RollbackUseCase` | A `src/application/RollbackUseCase.ts`; S `src/application/RollbackUseCase.ts:14` | S's becomes `src/application/patches/FollowRollbackUseCase.ts` |
| 3 | class and path `SystemClockAdapter` | same path in both repos | merge: A's gains `sleep` and `ClockPort` |
| 4 | class and path `NpmRegistryAdapter` | same path in both repos; behaviour differs (A :15-24 null and time limit; S :13-35 packument, integrity, throws) | S's renamed `NpmPackumentAdapter` |
| 5 | `src/domain/services/Jsonc.ts` | both repos; `stripComments` identical apart from the variable name (diff) | merge into A's; `PACKAGE_NAME` replaced by `MAGIC_CONTEXT_PACKAGE` |
| 6 | `src/domain/services/Versions.ts` / `compareVersions` | the behaviours differ (next section) | one semver implementation (decision 6) |
| 7 | entry `cli.ts` | A `src/main/cli/cli.ts`; S `src/main/cli.ts` | S's split (File map) |
| 8 | exported `HELP` | A `HelpCliAdapter.ts:3`; S `CliAdapter.ts:11` | S's renamed `PATCHES_HELP` |
| 9 | exported `Environment` | A `src/domain/model/Database.ts:70` (interface); S `src/main/paths.ts:38` (type) | S's dropped; patches paths take A's `CliEnvironment` |
| 10 | `architecture.test.ts` basename | A `tests/unit/maintenance/architecture.test.ts`; S `tests/unit/architecture/architecture.test.ts` | S's dropped |
| 11 | `tests/support/source-files.ts` | both repos | S's dropped |
| 12 | `tests/fixtures/` | A has none (`ls`: No such file or directory) | no collision; target `tests/support/patches/fixtures/` follows A's convention |
| 13 | `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | both repos; `cmp` differs at char 55 | S's frozen as `docs/reference/<merge-stamp>-magic-context-patches-session-ses_ee74ff8d6ffeI7u74RZBGprjCd.md` |
| 14 | `docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` | S's file; the same name is the merge session's own record in A | S's frozen under `docs/reference/` |
| 15 | other doc names | `ls docs/*/<basename>` in A for all 26 S docs: only #13 matched | none |
| 16 | `LICENSE` | `cmp` identical | S's dropped |
| 17 | package.json script names `build`, `test`, `test:unit`, `test:component`, `test:e2e`, `test:live`, `coverage`, `coverage:unit`, `coverage:e2e`, `typecheck`, `install:cli`, `validate:installed:cli`, `cli` | S package.json:9-26; A :8-25 | A's definitions kept; S `check` and `lint:docs` dropped |
| 18 | concept: lock | A `StoreLockPort`/`FsStoreLockAdapter` (synchronous, several stores, owner pid+command+start, throws `StoreLockedError`; StoreLockPort.ts:15-17) vs S `LockPort` (asynchronous, one file, returns `null` when held; SystemPorts.ts:46-50) | keep S's as `FollowLockPort`/`FsFollowLockAdapter`: FollowUseCase reports a held lock as an outcome, not an error |
| 19 | concept: running server | A `OpencodeServerPort`/`HttpOpencodeServerAdapter` (POST command/fork; synchronous read of `service.json`) vs S `LivePluginsPort`/`OpencodeLivePluginsAdapter` (GET `/api/debug/location`, `/api/plugin`; asynchronous) | keep S's (different endpoints and contract); reuse A's `service.json` path computation (A cli-container.ts:227 = S paths.ts:78) |
| 20 | concept: installed Magic Context | A `MagicContextConfigPort.installed(spec)` → newest version under `…@<spec>/<stamp>/…` (A OpencodeMagicContextConfigAdapter.ts:27-39); A `InstalledMagicContextAdapter` (newest release, also `packages/…@<version>/`); S `InstallationsPort` → every copy with `spec`, `root`, `version`, direct or one numbered folder down | keep S's adapters (different output) |
| 21 | concept: pinned spec | A `pinnedMagicContext` (regex; folder entries return null because the regex needs `"` right before `@cortexkit`, A Jsonc.ts:42); A reads `opencode.jsonc` else `opencode.json` (A config adapter :23). S `pinnedSpec` (folder entries return the folder; S Jsonc.ts:84-94); S reads only `opencode.jsonc` (S paths.ts:62) | extend A's `Jsonc.ts` with S's functions; the behaviour alignment is Gaps #12 and #13 |
| 22 | concept: npm registry | A `PublishedVersionPort` vs S `RegistryPort` | keep S's (#4) |
| 23 | concept: clock | A `RuntimePort.now` + `TimerPort.sleep` (SystemTimerAdapter) vs S `ClockPort {now, sleep}` | extend A's `SystemClockAdapter` to implement `ClockPort` too (equal `now`; `sleep` equal to A `SystemTimerAdapter.ts:6-8`) |
| 24 | concept: files | A `FileSystemPort`, `MaintenanceFileSystemPort` vs S `FilesPort` | keep S's (no read-bytes, no mode-keeping replace in A) |
| 25 | concept: hash | A has no port (sha256 inline in sqlite and identity adapters) | keep S's `HashPort`/`Sha256Adapter` |
| 26 | concept: key-value | A none | keep S's `FileKeyValueAdapter` |
| 27 | concept: stdout/stderr | A `OutputPort.line` → stdout; S `CliOutput {out, err}` | keep `CliOutput` inside `PatchesCliAdapter`; new `StderrOutputAdapter` |
| 28 | concept: processes | A `ProcessListPort` (`/proc/<pid>/comm` names) vs S `ServicePort` (cmdline holding `serve`, plus start time) | keep separate; S's becomes per platform |
| 29 | env names | A uses `OPENCODE_SESSION_MANAGER_*` and `OPENCODE_SM_LIVE_*` (README:849-877) | the new `OPENCODE_SESSION_MANAGER_PATCHES_*` collide with nothing; `OPENCODE_MC_PATCHES_BIN_DIR` is dropped in favour of `OPENCODE_SESSION_MANAGER_BIN_DIR` |
| 30 | installed program and data | this machine (darwin) has `~/.local/bin/opencode-magic-context-patches`, `~/.local/share/opencode-magic-context-patches`, `~/.local/state/opencode-magic-context-patches` (`ls`, `which`) | the rename (decision 5) leaves them behind: Gaps #2 |
| 31 | exported value and type names | `comm` of exported names in both `src` trees: `compareVersions`, `Environment`, `HELP`, `NpmRegistryAdapter`, `RollbackPort`, `RollbackUseCase`, `stripComments`, `SystemClockAdapter` | each resolved above (#1–#9) |
| 32 | src basenames | `comm` of basenames: `cli.ts`, `Jsonc.ts`, `NpmRegistryAdapter.ts`, `RollbackUseCase.ts`, `SystemClockAdapter.ts`, `Versions.ts` | each resolved above |

## compareVersions

### Definitions

| Repo | Location | Behaviour |
|---|---|---|
| A | `src/domain/services/Versions.ts:2-11` | splits on `-` and drops everything after it (`value.split("-")[0]`), then compares the dot parts numerically; `parseInt(…) \|\| 0`. So `1.0.0-beta.1 == 1.0.0`. |
| S | `src/domain/services/Versions.ts:1-9` | splits on `.` **and** `-` and compares every part numerically, with `parseInt(…) \|\| 0`. So `1.0.0-beta.2 > 1.0.0`, because the parts are `[1,0,0,0,2]` against `[1,0,0]`. |

The replacement is semver 2.0.0 §11 ([semver.org §11](https://semver.org/spec/v2.0.0.html#spec-item-11)):

- major, minor and patch compare numerically;
- a version with a pre-release sorts below the same version without one;
- pre-release identifiers compare left to right: numeric ones numerically, alphanumeric ones in ASCII
  order, and a numeric identifier sorts below an alphanumeric one;
- a longer set of identifiers wins when all the earlier ones are equal;
- build metadata after `+` is ignored.

Inputs that are not semver are kept as both repos treat them today: a missing core part counts as 0
(`1.0` = `1.0.0`), and a non-numeric core part counts as 0 (`1.x` = `1.0`). This last behaviour is
unverified against intent (Gaps #17).

### Callers

| Repo | Caller | Use | Effect of semver order |
|---|---|---|---|
| A | `src/application/MagicContextVersionsUseCase.ts:34` | `compareVersions(latest, loaded) > 0`: is an upgrade available | with `loaded = 1.0.0-beta.1` and `latest = 1.0.0`, an upgrade is now shown (before: equal, so none) |
| A | `src/infrastructure/adapters/outbound/magic-context/InstalledMagicContextAdapter.ts:66` | sorts candidates, newest first | a release now outranks its own pre-release |
| A | `src/infrastructure/adapters/outbound/magic-context/OpencodeMagicContextConfigAdapter.ts:38` | `versions.sort(compareVersions).at(-1)` | same |
| S | `src/application/FollowUseCase.ts:133` | `compareVersions(published.version, loaded.version) <= 0`: already up to date | a loaded `1.0.0-beta.2` is now older than a published `1.0.0` (before: newer, so `follow` would stop "up-to-date") |
| S | `src/application/InspectUseCase.ts:52` | newest reviewed release, used as the reference | a release now outranks its pre-release |

### Test assertions

| Repo | Assertion | Today | After |
|---|---|---|---|
| A | `tests/unit/sessions/magic-context-release.test.ts:99` `compareVersions("0.45.0","0.9.9") > 0` | passes | unchanged |
| A | `tests/unit/sessions/magic-context-release.test.ts:100` `("1.0","1.0.0") toBe(0)` | passes | unchanged (missing part = 0) |
| A | `tests/unit/sessions/magic-context-release.test.ts:101` `("1.0.0-beta.1","1.0.0") toBe(0)` | passes | **changes** to `toBeLessThan(0)` |
| A | `tests/unit/sessions/magic-context-release.test.ts:102` `("1.x","1.0") toBe(0)` | passes | unchanged if non-numeric core = 0 (Gaps #17) |
| A | `tests/unit/sessions/magic-context-release.test.ts:103` `("0.1","0.2") < 0` | passes | unchanged |
| S | `tests/unit/domain/Versions.test.ts:6` sort `["0.9.0","0.47.0","0.47.1","0.100.0"]` | passes | unchanged |
| S | `tests/unit/domain/Versions.test.ts:7` `("1.0","1.0.0") toBe(0)` | passes | unchanged |
| S | `tests/unit/domain/Versions.test.ts:8` `("1.0.0-beta.2","1.0.0") toBeGreaterThan(0)` | passes | **changes** to `toBeLessThan(0)` |

No other test in either repository compares a pre-release. A grep for `\d+\.\d+\.\d+-[0-9A-Za-z]`
found, besides the lines above, only folder names: S `tests/unit/application/Follow.test.ts:91,231,278,289,290`,
`tests/live/live.test.ts:123` and `tests/unit/infrastructure/follow-adapters.test.ts:57`. New cases needed:

- pre-release ordering, such as `alpha < alpha.1 < alpha.beta < beta < beta.2 < beta.11 < rc.1 < 1.0.0`
  (the §11 example);
- build metadata ignored;
- one test each for the `MagicContextVersionsUseCase` and `FollowUseCase` effects above.

## Dependencies

| Package | S | A today | Proposal |
|---|---|---|---|
| `@npmcli/arborist` | `dependencies` `9.4.0` (S package.json:34-36); imported only in `src/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter.ts:1`; compiled into the executable (S scripts/build.mjs:14-18) | absent | add, pinned exactly at `9.4.0`, under **`devDependencies`**. This matches A's convention: bundled libraries such as `drizzle-orm` `0.45.4`, `solid-js`, `@opentui/*` are devDependencies (A package.json:27-38), and the compiled CLI is self-contained (AGENTS.md:20, :659-660). The alternative is a `dependencies` key, which A has never had and which would contradict AGENTS.md:20 as written |
| `@types/npmcli__arborist` | devDependency `6.3.3` (S package.json:30) | absent | add to `devDependencies` at `6.3.3` |
| `@types/bun`, `bun-types`, `typescript` | `1.4.2`, `1.4.2`, `5.9.3` (S :29, :31-32) | the same versions (A :32, :34, :37) | nothing to add |

- **How A treats third-party imports.** `domain` and `application` may import no package (I5,
  imports.test.ts:62-71). `@opencode/*` is forbidden everywhere (I6). `@opentui/*` is type-only outside
  `.tsx` files (I7). `bun:sqlite` and drizzle's `sql` are allowed only in the store engine (I1). A has
  no rule tying imports to declared dependencies; S had one (S architecture.test.ts:15-17, :35-38).
- **Whether A lists `dependencies`.** It does not: package.json:1-39 has only `devDependencies`.

## Gap resolutions

Decision numbers above refer to the survey brief: decision 1 = D2, 4 = D14, 5 = D13, 6 = D7.

| Gap | Resolution |
|---|---|
| 1 darwin refused at startup | D5: darwin gets the maintenance adapters too (Stage 4); `darwin-container.ts` exports `darwinAdapters` and `darwinPatchesAdapters`; one `SUPPORTED_PLATFORMS` |
| 2 migration of old state | D9, D10: history copied and `cmp`-verified (9.2, 10.6); `{M}` re-installs through the new `follow` (10.7); old units stopped first (10.1) |
| 3 watch off Linux | D6: launchd agent (Stage 6); win32 exits 1, reported blocked (D8) |
| 4 output changes | D19 |
| 5 per-platform behaviour | darwin: measured by 5.6 gate 3, 4.4, 7.3, 9.3, 9.6; Magic Context's log at `$TMPDIR/opencode2/magic-context/magic-context.log` and OpenCode's cache at `~/.cache/opencode/npm/@cortexkit` on this Mac (memory #8029; the 0.49.56 copy loaded from there). win32: blocked (D8, D14) |
| 6 e2e per platform | stand-in executables for `ps`, `osascript`, `powershell` through the adapters' constructor arguments (5.6, 5.7); `bunfig.coverage.e2e-darwin.toml` by Stage 4 |
| 7 P2 count on moved classes | 5.5 and 5.6 gate 2 |
| 8 anchors in uncommitted files | Stage 2 commits D1 first; every later step reads the anchor before editing |
| 9 `container.test.ts` | read and updated by 5.7 when it lists router families or override keys |
| 10 Arborist inside the CLI | 5.7 gate 2 (`bun run build`), 7.1–7.3 live `follow` |
| 11 subfolders | D20 |
| 12 `pinnedMagicContext` | D21 (5.4) |
| 13 `opencode.json` fallback | D22 (5.6) |
| 14 test names | D23 |
| 15 L6 and fixtures | D24 |
| 16 `SUPPORTED_PLATFORMS` meaning | one constant (Gap 1) |
| 17 non-semver inputs | D26 |
| 18 seams | D26 |
