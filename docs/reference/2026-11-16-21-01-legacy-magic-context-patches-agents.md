# AGENTS.md — opencode-magic-context-patches

Rules for anyone (person or agent) changing this repository. README.md says what the tool does.

## Safety rules (never break these)

1. A file is written only when its sha256 is the recorded `before` (apply) or `after` (undo), and the
   new content's sha256 is the recorded `after` (apply) or `before` (undo) — computed before writing.
   Anything else is `refused` and nothing is written.
2. Every original is backed up (read-only, content-addressed) before it is replaced.
3. Files are replaced in one step: written beside the target, given its mode, renamed over it, then
   read back and checked. On any failure, every file already written for that patch is put back.
4. Every apply and undo, including refusals, is appended to the audit log.
5. A patch is applied automatically to an unreviewed version only by `follow`, and only when every
   matcher count, file count and anchor holds AND the sandbox proof (an isolated `opencode serve` with
   the patched copy and the user's `magic-context.jsonc`) passes; otherwise never. A version becomes
   reviewed only by a person adding it to `patches/` after `inspect --version <v>` and the published
   npm tarball. (Rule changed 2026-10-23 with the user's approval.)
6. The systemd units run `follow`, which may install a new patched copy; it never applies a patch to,
   or removes, a copy OpenCode has already loaded. `notify` only reports.
7. The tool never restarts OpenCode. The only configuration it edits is the one Magic Context entry of
   `opencode.jsonc` (`follow` and `follow --rollback`): the whole file is backed up first, only that
   string literal changes, and the file is read back; a mismatch puts the original back.

## Adding a version to a patch, or a new patch

1. `npm pack @cortexkit/opencode-magic-context@<v>` in `/tmp/opencode/…`; confirm the installed
   files are byte-identical to the tarball's (sha256).
2. `opencode-magic-context-patches inspect --version <v>`; read every snippet. If the code around the
   replaced text changed meaning, stop and re-do the analysis in a new `docs/reference/` document.
3. Add a release `{ version, files: [{ path, before, after, replacements }] }` to the patch in
   `patches/`; `after` is the sha256 of the tarball's file with the replacements made.
4. Copy the tarball's files into `tests/fixtures/magic-context-<v>/` (with `package.json` reduced to
   `name`, `version`, `license`, and a `NOTICE.md` naming the tarball and its integrity).
   `tests/unit/patches/patches.test.ts` then proves the recorded checksums on the real files.
5. `bun run check`, commit, `bun run install:cli`, `apply`, restart OpenCode, `effect`.

A new patch is a new file in `patches/`, listed in `patches/index.ts`, with an evidence document in
`docs/reference/` named by its `evidence` field, and a `matcher` (directory, extension, and its `sites`:
each a name, file count, shapes with counts, anchor and window) that
`tests/unit/domain/MatcherRules.test.ts` proves derives exactly every reviewed release from the
fixtures. A new shape of an existing site (as 0.49.19 brought for the fallback) is added to that
site's `shapes` after review. A file may belong to several patches: they are applied in
`patches/index.ts` order, each matcher reading the file as the previous patch left it, and the later
release's `before` is therefore the earlier release's `after` — `no-session-model-fallback` then
`fold-identity-stable` on 0.49.15 is the case to copy. A patch that changes several places in the
same files lists them as several sites. A patch whose site upstream introduced or dropped in some
release marks its matcher `optional: true`: no file holding any of its sites means nothing to change
on that version, while a partial match still stops `follow`.

## Layout (hexagonal; dependencies point inward only)

```
src/domain/          models, rules, ports — no I/O, no node:/bun: imports
src/application/     use cases and services — only domain imports
src/infrastructure/  adapters: inbound (CLI) and outbound (files, hashing, cache, /proc, log, notify-send,
                     npm registry, Arborist, OpenCode sandbox and running server, parser)
src/main/            the composition root: the only place adapters are constructed
patches/             patch definitions (data)
systemd/             the watch units
```

`tests/unit/architecture/architecture.test.ts` enforces it: layers point inward, imports use the
`@mc-patches/…` aliases, no `node:`/`bun:` in domain or application, adapters are constructed only in
`src/main/`, every outbound adapter implements a domain port, every use case its inbound port, and
every class has an explicit constructor (Bun 1.4 counts an implicit constructor as an uncovered function).

### Files

Domain:
- `Patch.ts` — `PatchDefinition` (with its `matcher`), `PatchRelease`, `PatchedFile`, `Replacement`,
  `CheckedBy` (`reviewed` / `auto`), `DerivedRelease`.
- `Matcher.ts` — `PatchMatcher`, `MatcherSite` and `MatcherShape`: how `follow` finds a patch's sites by content.
- `Installation.ts` — an installed copy (`spec`, `root`, `version`) and whether it is loaded.
- `Status.ts` — file and patch states, and who checked the release compared with.
- `Reports.ts` — what each command returns, including `FollowReport` and its steps.
- `PatchError.ts` — refusals (`count-mismatch`, `usage`, `not-installed`).
- `PatchRules.ts` — classify files and patches by checksum; apply and revert replacements with exact counts.
- `Jsonc.ts` — strip comments; string literals with positions; the Magic Context entry (npm spec or
  folder) of opencode.jsonc, read and replaced byte-exactly; a numeric setting from magic-context.jsonc.
- `MatcherRules.ts` — `locate`: a matcher over a release's files, accepted or refused with the reason.
- `EffectReading.ts` — summarise Magic Context's log (rejections, proactive floors; threshold = floor + 2); the lines since a time.
- `Versions.ts` — numeric version order.
- `CommandPorts.ts` — the inbound ports, one per command (`FollowPort`, `RollbackPort` for `follow`), and `PatchCommands`.
- Outbound ports: `InstallationsPort.ts`, `TextSourcePort.ts`, `FilesPort.ts`, `HashPort.ts`,
  `BackupPort.ts`, `AuditLogPort.ts`, `SystemPorts.ts` (clock with sleep, notifier, log, OpenCode server
  start, the running server's plugins, a lock, key-value store), `RegistryPort.ts`, `PackageInstallerPort.ts`,
  `ManagedStorePort.ts`, `SandboxPort.ts`, `TranspilePort.ts`, `DerivedReleasesPort.ts`, `EvidencePort.ts`.

Application:
- `InstallationCatalog.ts` — installed copies, which one is loaded, and the patch × copy targets of a command.
- `ReleaseCatalog.ts` — the release of a patch for a version: reviewed (`patches/`), else derived by `follow`.
- `PatchInspector.ts` — reads and classifies a patch's files on one copy.
- `ChangeWriter.ts` — writes one patch's files as a unit (backup, replace, read back, put back on failure) and audits.
- `StatusUseCase.ts`, `ApplyUseCase.ts` (also the shared refusals), `UndoUseCase.ts`, `CheckUseCase.ts`,
  `InspectUseCase.ts`, `EffectUseCase.ts`, `NotifyUseCase.ts`.
- `FollowUseCase.ts` — `follow`: detect → stage → locate → patch → prove → publish → confirm → record,
  under the lock; reverts the entry after a failed confirm. `RollbackUseCase.ts` — `follow --rollback`.
- `follow/StepLog.ts` (steps with times), `follow/ReleaseStager.ts` (stage, locate, patch),
  `follow/ReleaseProver.ts` (prove), `follow/PluginEntryEditor.ts` (the one opencode.jsonc entry, backed
  up and read back), `follow/EntrySwitcher.ts` (publish, confirm, revert), `follow/AdoptionRecorder.ts`
  (record, evidence, notifications).

Infrastructure:
- `CliAdapter.ts` — argument parsing, dispatch, exit codes; `TextFormatter.ts` — the text output.
- `OpencodeCacheInstallationsAdapter.ts` — copies under the npm cache (directly or one numbered folder down).
- `ManagedInstallationsAdapter.ts` — copies `follow` installed (spec = their folder);
  `CompositeInstallationsAdapter.ts` — both lists in one.
- `NpmRegistryAdapter.ts` — the abbreviated packument: `latest`, a version's integrity.
  `ArboristInstallerAdapter.ts` — `@npmcli/arborist` 9.4.0 with OpenCode 2.1.1's options.
- `FsManagedStoreAdapter.ts` — `installs/<v>/` and staging folders. `JsonDerivedReleasesAdapter.ts`,
  `FsEvidenceAdapter.ts` (never overwrites), `FileLockAdapter.ts` (pid lock, stale owner taken over).
- `OpencodeSandboxAdapter.ts` — the isolated `opencode serve` of the proof. `OpencodeLivePluginsAdapter.ts`
  — the running service's locations and their Magic Context (`service.json`, `/api/debug/location`, `/api/plugin`).
- `BunTranspileAdapter.ts` — does a bundle still parse.
- `NodeFilesAdapter.ts` — read, one-step replace, list. `Sha256Adapter.ts`. `SystemClockAdapter.ts` (now, sleep).
- `FsBackupAdapter.ts` — content-addressed, read-only backups. `JsonlAuditLogAdapter.ts` — the audit log.
- `TextFileAdapter.ts` — configuration files and Magic Context's log. `FileKeyValueAdapter.ts` — the last notification.
- `ProcServiceAdapter.ts` — the newest `opencode … serve` start time from `/proc`.
- `NotifySendAdapter.ts` — `notify-send`.

Main:
- `paths.ts` — every location from the environment (`XDG_CACHE_HOME`, `XDG_CONFIG_HOME`,
  `XDG_DATA_HOME`, `XDG_STATE_HOME`, `TMPDIR`, `MAGIC_CONTEXT_LOG_PATH`, `OPENCODE_MC_PATCHES_NOTIFY_BIN`,
  `OPENCODE_MC_PATCHES_PROC`, `OPENCODE_MC_PATCHES_REGISTRY`, `OPENCODE_MC_PATCHES_OPENCODE_BIN`,
  `OPENCODE_MC_PATCHES_TIMEOUT_MS`, `OPENCODE_MC_PATCHES_SETTLE_MS`).
- `container.ts` — `createCommands`: wires everything; its `Seams` argument holds the declared
  fault-injection seams (wrap the files adapter, wrap the installer), used only by `tests/e2e/faults.test.ts`
  and `tests/e2e/follow.test.ts`.
- `cli.ts` — `main(argv, env, output)`, `processOutput`, `clockTicks` (`getconf CLK_TCK`).
- `bin.ts` — the process entry the build compiles; it exits with the code at once (Arborist's npm
  client keeps idle connections that would hold the process for about two minutes).

Patches: `execute-threshold-min.ts`, `no-session-model-fallback.ts`, `refusal-recovery.ts`,
`fold-identity-stable.ts`, `fold-provenance-heal.ts`, `index.ts` (the list, in apply order).
Runtime dependency: `@npmcli/arborist` 9.4.0, exactly the version OpenCode 2.1.1 pins (its root
`package.json` catalog); compiled into the executable. `tests/unit/architecture/architecture.test.ts`
allows a third-party import only in infrastructure, and only of a declared dependency.

Scripts: `scripts/build.mjs` (compiled executable, every autoload off), `scripts/install-cli.mjs`
(`OPENCODE_MC_PATCHES_BIN_DIR`), `scripts/watch.mjs` (`OPENCODE_MC_PATCHES_SYSTEMD_DIR`),
`scripts/coverage.mjs`, `scripts/lint-docs.mjs`.

## Tests

| Tier | What | Gate |
|---|---|---|
| `tests/unit` | every src file with fakes or temp folders; the patch definitions and matchers against the real fixture files; the follow adapters against a local registry and an OpenCode stand-in; architecture | 100 % lines and functions per file (`bun run coverage:unit`) |
| `tests/component` | the use cases over the real adapters on a sandbox; `follow` with a local registry, real Arborist, the OpenCode stand-in and a running-server stand-in | passes |
| `tests/e2e` | the whole program (`main`, `createCommands`, `bin.ts`) on copies of the real Magic Context files in a sandboxed home; `follow` from tarballs of those files (reviewed, unreviewed, and crafted unknown shapes); refusals with crafted definitions; system errors by making folders unreadable; faults through the declared seams | 100 % lines and functions per file (`bun run coverage:e2e`) |
| `tests/live` | opt-in: the installed program and the systemd units on this machine; `follow` against the real npm registry, Arborist and OpenCode binary inside a throwaway home | passes |

`scripts/coverage.mjs` also fails when a src or patches file with code never appears in the coverage
report. Test support:
- `fakes.ts` — in-memory ports and a small synthetic patch with computed checksums.
- `world.ts` — the application wired to those fakes.
- `sandbox.ts` — a temporary home laid out like OpenCode 2.0.24 and Magic Context (installs a fixture
  copy, pins it, writes a log, a fake `/proc`, a recording `notify-send`), and `capture` for CLI output.
- `source-files.ts` — the src files, for the architecture and completeness tests.
- `follow-fakes.ts` — in-memory registry, installer, store, sandbox, running server, lock and evidence,
  and `followWorld`: follow and rollback wired to them.
- `registry.ts` — `tarball` (an npm tarball of a fixture, optionally edited) and `LocalRegistry` (a
  local npm registry; whole or tarball-only failures).
- `fake-opencode.ts` — an `opencode serve` stand-in (`ok`, `reject`, `nolog`, `missing`, `silent`,
  `exit`), run through `Sandbox.opencodeStandIn`; `Sandbox.liveServer` stands in for the running service.

`tests/fixtures/magic-context-0.47.0/`, `tests/fixtures/magic-context-0.48.0/`,
`tests/fixtures/magic-context-0.49.0/`, `tests/fixtures/magic-context-0.49.2/`,
`tests/fixtures/magic-context-0.49.7/`, `tests/fixtures/magic-context-0.49.12/`,
`tests/fixtures/magic-context-0.49.13/`, `tests/fixtures/magic-context-0.49.15/`, `tests/fixtures/magic-context-0.49.19/`, `tests/fixtures/magic-context-0.49.35/`, `tests/fixtures/magic-context-0.49.41/`, `tests/fixtures/magic-context-0.49.42/`, `tests/fixtures/magic-context-0.49.43/`, `tests/fixtures/magic-context-0.49.50/`, `tests/fixtures/magic-context-0.49.55/` and `tests/fixtures/magic-context-0.49.56/` hold the unmodified upstream files each patch changes in each checked release (MIT; see each NOTICE.md).

## Definition of done

`bun run check` (typecheck, docs lint, both coverage gates, component and live tiers), then
`bun run install:cli` and, when the units changed, `bun run install:watch`. Docs follow the
`YYYY-MM-DD-HH-MM-name.md` rule in `docs/{plans,research,reference}`; the session record is
`docs/sessions/<session id>.md`.
