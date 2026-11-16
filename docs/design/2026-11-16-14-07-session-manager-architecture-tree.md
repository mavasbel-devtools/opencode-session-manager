# Session manager architecture tree

Covers the whole tool at the level the repository's agent guide already describes: repository, then packages, then modules, then classes, then methods. Every file the merge plan's file map creates or moves is one row below, each with the product node it serves (nodes U1-U13 are the product tree's leaves), a one-sentence responsibility, its public interface, its dependencies (ports only), and its test directory. Existing session-manager modules appear at module level only; the full per-file map of those lives in the agent guide's source map, named in the edited-in-place table. Frozen documents and fixtures are rows too, with model and test columns marked not applicable. Paths are written with a leading dot so the document stays lint-clean until the files land.

## 1. Repositories and packages

One repository, `opencode-session-manager`, holds four source packages with inward-only dependencies: domain (models, rules, ports; no imports outside the domain), application (use cases and services over domain ports only), infrastructure (inbound and outbound adapters implementing the ports), main (the composition root; the only place that constructs adapters and use cases). Tests mirror the layers under unit, component, e2e and live tiers, with shared support below the test-support folder.

Platform test layout (D29): tests of the adapters under outbound/platform/<p>/ live in the unit platform folder for
that platform, mirroring src; the platform helper module (platform.ts) under tests/support — with helpers
onlyOn(platform) and requires(precondition, reason), both skipping with the reason and never failing — is the
only place a test may read process.platform, enforced by an architecture test.

## 2. Existing session-manager modules (module level)

The domain model folder, the domain errors folder, the domain inbound-ports folder, the domain outbound-ports folder, the domain services folder, the application folder with its thirty use cases and services, the inbound CLI folder with the help and router adapters, the outbound folders for the file system, herdr, magic-context, npm, opencode2, platform linux and win32, project, sqlite, system and tui adapters, the main folder with the CLI, linux, server, tui and win32 containers, and the tests folders for maintenance, sessions and the architecture rules stay exactly as the agent guide's source map describes; the merge only adds rows beside them. The one exception is the platform folder, which gains a darwin subfolder in Stage 4, and the main folder, which gains the two containers named below.

## 3. Domain: patch definitions (product node F9, all patch use cases)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/domain/patch-definitions/execute-threshold-min.ts` | Holds the checked before and after bytes of the execute-threshold-minimum patch. | executeThresholdMin: PatchDefinition | none (data) | definitions folder below unit patches |
| `./src/domain/patch-definitions/no-session-model-fallback.ts` | Holds the checked before and after bytes of the no-session-model-fallback patch. | noSessionModelFallback: PatchDefinition | none (data) | definitions folder below unit patches |
| `./src/domain/patch-definitions/refusal-recovery.ts` | Holds the checked before and after bytes of the refusal-recovery patch. | refusalRecovery: PatchDefinition | none (data) | definitions folder below unit patches |
| `./src/domain/patch-definitions/fold-identity-stable.ts` | Holds the checked before and after bytes of the fold-identity-stable patch. | foldIdentityStable: PatchDefinition | none (data) | definitions folder below unit patches |
| `./src/domain/patch-definitions/fold-provenance-heal.ts` | Holds the checked before and after bytes of the fold-provenance-heal patch. | foldProvenanceHeal: PatchDefinition | none (data) | definitions folder below unit patches |
| `./src/domain/patch-definitions/index.ts` | Publishes the ordered list of the five patch definitions. | PATCHES: readonly PatchDefinition[] | none (data) | definitions folder below unit patches |

## 4. Domain: errors and patch models (product node F9)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/domain/errors/PatchError.ts` | Carries patch refusal failures with a machine-readable code. | PatchError extends Error, PatchErrorCode | none | unit patches domain folder |
| `./src/domain/model/patches/Installation.ts` | Describes one installed copy of Magic Context with its spec, root and version. | InstalledCopy, Installation | none | unit patches domain folder |
| `./src/domain/model/patches/Matcher.ts` | Describes how a patch site is located in a file tree. | PatchMatcher, MatcherSite, MatcherShape | none | unit patches domain folder |
| `./src/domain/model/patches/Patch.ts` | Describes one patch release with its files, checksums and replacements. | PatchDefinition, PatchRelease, PatchedFile, Replacement, DerivedRelease, CheckedBy | none | unit patches domain folder |
| `./src/domain/model/patches/Reports.ts` | Carries every report the patch use cases return. | StatusReport, PatchFilter, ActionReport, CheckReport, InspectReport, EffectReport, FollowReport, NotifyReport | none | unit patches domain folder |
| `./src/domain/model/patches/Status.ts` | Carries per-file and per-patch states including unchecked-version. | FileState, PatchState, FileStatus, PatchStatus | none | unit patches domain folder |
| `./src/domain/model/patches/PatchCommands.ts` | Groups the nine patch use-case ports behind one command surface type. | PatchCommands | none | unit patches domain folder |
| `./src/domain/model/patches/StepLog.ts` | Records follow step passes and failures through a factory so use cases never construct it. | stepLog(clock), pass(step, detail), fail(step, detail), steps(), failure() | ClockPort | unit patches application folder |
| `./src/domain/model/patches/PatchTargets.ts` | Shares the apply target and on-disk file shapes between domain rules. | Target, FileOnDisk | none | unit patches domain folder |

## 5. Domain: inbound patch ports (product nodes U1-U9, U11)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/domain/ports/inbound/PatchStatusPort.ts` | Contract for reporting every patch on every installed copy. | PatchStatusPort.status() | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchApplyPort.ts` | Contract for writing the before-state bytes the definitions require. | PatchApplyPort.apply(filter) | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchUndoPort.ts` | Contract for restoring the before-state bytes of applied patches. | PatchUndoPort.undo(filter) | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchCheckPort.ts` | Contract for answering whether every patch is applied on the loaded copy. | PatchCheckPort.check() | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchInspectPort.ts` | Contract for reviewing a version no patch was checked against. | PatchInspectPort.inspect(version) | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchEffectPort.ts` | Contract for telling whether the configured threshold is in use. | PatchEffectPort.effect(sinceMs) | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchNotifyPort.ts` | Contract for sending a desktop notification when check fails. | PatchNotifyPort.notify() | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchFollowPort.ts` | Contract for adopting the newest already-patched release. | PatchFollowPort.follow(version) | none | unit patches application folder |
| `./src/domain/ports/inbound/PatchFollowRollbackPort.ts` | Contract for putting back the configuration entry follow replaced. | PatchFollowRollbackPort.rollback() | none | unit patches application folder |

## 6. Domain: outbound patch ports (product node F9)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/domain/ports/outbound/AuditLogPort.ts` | Contract for appending one audit record per patch action. | AuditLogPort.append(record), location() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/BackupPort.ts` | Contract for saving and finding original file bytes by key. | BackupPort.save(key, bytes), find(key) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/DerivedReleasesPort.ts` | Contract for listing and saving derived checked releases. | DerivedReleasesPort.list(), save(release) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/EvidencePort.ts` | Contract for writing adoption evidence files. | EvidencePort.write(name, content) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/FilesPort.ts` | Contract for reading bytes, mode-keeping replace and listing by extension. | FilesPort.read(path), replace(path, bytes), list(directory, extension) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/HashPort.ts` | Contract for checksumming bytes. | HashPort.sha256(bytes) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/InstallationsPort.ts` | Contract for listing every installed copy with its root. | InstallationsPort.list() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/ManagedStorePort.ts` | Contract for staging, publishing and removing managed installs. | ManagedStorePort.stage(version), published(version), publish(staging, version), versions(), remove(folder) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/PackageInstallerPort.ts` | Contract for installing one npm spec into a folder. | PackageInstallerPort.install(spec, folder) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/RegistryPort.ts` | Contract for reading versions with integrity, throwing a reason on failure. | RegistryPort.latest(), find(version) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/SandboxPort.ts` | Contract for proving a staged copy against an isolated server. | SandboxPort.prove(pluginRoot, magicContextConfig) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/TextSourcePort.ts` | Contract for reading one text file with its location. | TextSourcePort.location(), read() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/TranspilePort.ts` | Contract for reporting the parse error of bundled code. | TranspilePort.error(code) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/ClockPort.ts` | Contract for wall-clock time and sleep shared by step log and follow timing. | ClockPort.now(), sleep(ms) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/NotifierPort.ts` | Contract for desktop notification behind the program name. | NotifierPort.notify(title, body) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/LogPort.ts` | Contract for reading Magic Context log lines with its location. | LogPort.location(), lines() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/ServicePort.ts` | Contract for the start time of the running server process. | ServicePort.startedAt() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/KeyValuePort.ts` | Contract for the small follow state store. | KeyValuePort.get(key), set(key, value) | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/LivePluginsPort.ts` | Contract for reading the live plugin list from the running server. | LivePluginsPort.magicContext() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/FollowLockPort.ts` | Contract for the single follow lock file that reports a held lock as an outcome. | FollowLockPort.acquire() | none | unit patches infrastructure folder |
| `./src/domain/ports/outbound/ProcessLivenessPort.ts` | Contract for telling a live owner pid from a stale one without OS code. | ProcessLivenessPort.isAlive(pid) | none | unit patches infrastructure folder |

## 7. Domain: patch services and rules (product node F9)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/domain/services/patches/EffectReading.ts` | Reads threshold floors and rejections from Magic Context log lines. | linesSince(lines, sinceMs), summarizeEffect(lines, sinceMs), effectVerdict(summary, configured) | none | unit patches domain folder |
| `./src/domain/services/patches/MatcherRules.ts` | Locates every patch site in a file tree or refuses with a reason. | locate(matcher, files) | none | unit patches domain folder |
| `./src/domain/services/patches/PatchRules.ts` | Applies and reverts replacements with exact checksum classification. | releaseFor(patch, version), fileState(file, sha, later, earlier), patchState(states), applyReplacements(text, file), revertReplacements(text, file) | none | unit patches domain folder |
| `./src/domain/services/patches/PatchRefusals.ts` | Shares the single refusal classifier apply and undo both report. | blocker(target, onDisk) | none | unit patches application folder |
| `./src/domain/services/patches/FollowRules.ts` | Shares the follow values application files must not import from each other. | loadsFrom(source, root), loadsEntry(source, entry), packageRoot(folder), CONFIG_REJECTION, PREVIOUS_ENTRY, LAST_FOLLOW_NOTIFICATION, FOLLOW_TITLE | none | unit patches application folder |

## 8. Application: patch use cases (product nodes U1-U9)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/application/patches/ApplyUseCase.ts` | Writes the before-state bytes for the filtered patches and refuses on mismatch. | ApplyUseCase.apply(filter) | InstallationsPort, FilesPort, HashPort, BackupPort, AuditLogPort | unit patches application folder |
| `./src/application/patches/ChangeWriter.ts` | Plans and commits one-step file writes with put-back on failure. | ChangeWriter.unchanged(action, target, outcome, reason, entries), commit(action, target, plans) | FilesPort, BackupPort | unit patches application folder |
| `./src/application/patches/CheckUseCase.ts` | Answers whether every patch is applied on the loaded copy. | CheckUseCase.check() | PatchStatusPort | unit patches application folder |
| `./src/application/patches/EffectUseCase.ts` | Tells whether the configured threshold is in use since an optional time. | EffectUseCase.effect(sinceMs) | LogPort | unit patches application folder |
| `./src/application/patches/FollowUseCase.ts` | Adopts the newest already-patched release through stage, prove, switch and record. | FollowUseCase.follow(version) | RegistryPort, PackageInstallerPort, ManagedStorePort, SandboxPort, EvidencePort, FollowLockPort, KeyValuePort | unit patches application folder |
| `./src/application/patches/InspectUseCase.ts` | Reports per-site match of every patch against one installed version. | InspectUseCase.inspect(version) | InstallationsPort, FilesPort, HashPort, DerivedReleasesPort | unit patches application folder |
| `./src/application/patches/InstallationCatalog.ts` | Loads every copy and resolves the filtered apply and undo targets. | InstallationCatalog.load(), targets(filter, order) | InstallationsPort | unit patches application folder |
| `./src/application/patches/NotifyUseCase.ts` | Sends a notification only when check fails, silent otherwise. | NotifyUseCase.notify(), describeProblems(report) | PatchCheckPort, NotifierPort | unit patches application folder |
| `./src/application/patches/PatchInspector.ts` | Reads on-disk bytes and classifies one patch on one installation. | PatchInspector.read(installation, file, later, earlier), readAll(installation, patch), status(installation, patch), later(version, path, patch), earlier(version, path, patch) | FilesPort, HashPort, DerivedReleasesPort | unit patches application folder |
| `./src/application/patches/ReleaseCatalog.ts` | Finds the checked release for one patch and version. | ReleaseCatalog.find(patch, version) | DerivedReleasesPort | unit patches application folder |
| `./src/application/patches/FollowRollbackUseCase.ts` | Puts back the configuration entry follow replaced. | FollowRollbackUseCase.rollback() | KeyValuePort | unit patches application folder |
| `./src/application/patches/StatusUseCase.ts` | Reports every patch state on every installed copy. | StatusUseCase.status() | InstallationsPort, FilesPort, HashPort | unit patches application folder |
| `./src/application/patches/UndoUseCase.ts` | Restores the before-state bytes for the filtered patches and refuses on mismatch. | UndoUseCase.undo(filter) | InstallationsPort, FilesPort, HashPort, BackupPort, AuditLogPort | unit patches application folder |
| `./src/application/patches/follow/AdoptionRecorder.ts` | Records a completed adoption with evidence and prunes superseded copies. | AdoptionRecorder.adopted(adoption, log), stopped(version, log) | EvidencePort, DerivedReleasesPort, ManagedStorePort, KeyValuePort | unit patches application folder |
| `./src/application/patches/follow/EntrySwitcher.ts` | Switches the configuration entry and confirms the new copy serves. | EntrySwitcher.current(), switchTo(entry, steps, step), revert(previous, steps) | TextSourcePort, ServicePort, LivePluginsPort | unit patches application folder |
| `./src/application/patches/follow/PluginEntryEditor.ts` | Reads and writes the single Magic Context entry in the configuration file. | PluginEntryEditor.location(), current(), set(value) | TextSourcePort | unit patches application folder |
| `./src/application/patches/follow/ReleaseProver.ts` | Proves a staged copy in an isolated sandbox against the running server. | ReleaseProver.prove(root, log) | SandboxPort | unit patches application folder |
| `./src/application/patches/follow/ReleaseStager.ts` | Stages one published version from the registry into a managed folder. | ReleaseStager.stage(published, log) | RegistryPort, PackageInstallerPort, ManagedStorePort | unit patches application folder |

## 9. Infrastructure: inbound patch adapters (product node U11)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/infrastructure/adapters/inbound/cli/PatchesCliAdapter.ts` | Parses the patches command group, renders text or JSON, returns the exit code. | PatchesCliAdapter.run(argv), PATCHES_HELP | PatchStatusPort, PatchApplyPort, PatchUndoPort, PatchCheckPort, PatchInspectPort, PatchEffectPort, PatchNotifyPort, PatchFollowPort, PatchFollowRollbackPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/inbound/cli/PatchesTextFormatter.ts` | Renders every patch report as human text. | TextFormatter.status(report), action(report), check(report), inspect(report), effect(report), follow(report), notify(report) | none | unit patches infrastructure folder |

## 10. Infrastructure: outbound patch adapters (product node F9)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/infrastructure/adapters/outbound/magic-context/CompositeInstallationsAdapter.ts` | Lists copies from every installation source in order. | CompositeInstallationsAdapter.list() | InstallationsPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/magic-context/ManagedInstallationsAdapter.ts` | Lists copies in the tool's own managed installs folder. | ManagedInstallationsAdapter.list() | InstallationsPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/magic-context/OpencodeCacheInstallationsAdapter.ts` | Lists copies in the OpenCode package cache, directly or one numbered folder down. | OpencodeCacheInstallationsAdapter.list() | InstallationsPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/crypto/Sha256Adapter.ts` | Checksums bytes. | Sha256Adapter.sha256(bytes) | HashPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/FileKeyValueAdapter.ts` | Keeps small follow state in one file per key. | FileKeyValueAdapter.get(key), set(key, value) | KeyValuePort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/FsFollowLockAdapter.ts` | Holds the single follow lock file with liveness-checked stale takeover. | FsFollowLockAdapter.acquire() | FollowLockPort, ProcessLivenessPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/FsBackupAdapter.ts` | Saves and finds original file bytes under the data folder. | FsBackupAdapter.save(key, bytes), find(key) | BackupPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/FsEvidenceAdapter.ts` | Writes adoption evidence files without overwrite. | FsEvidenceAdapter.write(name, content) | EvidencePort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/FsManagedStoreAdapter.ts` | Stages, publishes and removes managed install folders. | FsManagedStoreAdapter.stage(version), published(version), publish(staging, version), versions(), remove(folder) | ManagedStorePort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter.ts` | Persists derived checked releases as one JSON file. | JsonDerivedReleasesAdapter.list(), save(release) | DerivedReleasesPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter.ts` | Appends one audit record per line. | JsonlAuditLogAdapter.location(), append(record) | AuditLogPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/NodeFilesAdapter.ts` | Reads bytes, replaces in one mode-keeping step, lists by extension. | NodeFilesAdapter.read(file), replace(file, bytes), list(directory, extension) | FilesPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/fs/TextFileAdapter.ts` | Reads one text file as text and as lines. | TextFileAdapter.location(), read(), lines() | TextSourcePort, LogPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter.ts` | Installs one npm spec into a folder with Arborist. | ArboristInstallerAdapter.install(spec, folder) | PackageInstallerPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/npm/NpmPackumentAdapter.ts` | Reads the abbreviated packument with integrity, throwing a reason on failure. | NpmPackumentAdapter.latest(), find(version) | RegistryPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/opencode2/OpencodeLivePluginsAdapter.ts` | Reads the live Magic Context plugin list from the running server. | OpencodeLivePluginsAdapter.magicContext() | LivePluginsPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/opencode2/OpencodeSandboxAdapter.ts` | Proves a staged copy in an isolated server run. | OpencodeSandboxAdapter.prove(pluginRoot, magicContextConfig) | SandboxPort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/parse/BunTranspileAdapter.ts` | Reports the parse error of bundled code. | BunTranspileAdapter.error(code) | TranspilePort | unit patches infrastructure folder |
| `./src/infrastructure/adapters/outbound/system/StderrOutputAdapter.ts` | Writes usage and refusal lines to standard error. | StderrOutputAdapter.line(text) | OutputPort | unit patches main folder |

## 11. Infrastructure: platform patch adapters (product node F10)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/infrastructure/adapters/outbound/platform/linux/NotifySendAdapter.ts` | Sends desktop notifications with notify-send on Linux. | NotifySendAdapter.notify(title, body) | NotifierPort | platform linux unit folder |
| `./src/infrastructure/adapters/outbound/platform/linux/ProcServiceAdapter.ts` | Reads the newest server start time from the process filesystem on Linux. | ProcServiceAdapter.startedAt() | ServicePort | platform linux unit folder |
| `./src/infrastructure/adapters/outbound/platform/linux/ClockTicks.ts` | Reports clock ticks per second for service-time arithmetic on Linux. | clockTicks() | none (function) | platform linux unit folder |
| `./src/infrastructure/adapters/outbound/platform/linux/ProcLivenessAdapter.ts` | Tells a live owner pid from a stale one through the process filesystem on Linux. | ProcLivenessAdapter.isAlive(pid) | ProcessLivenessPort | liveness unit file |
| `./src/infrastructure/adapters/outbound/platform/darwin/PsServiceAdapter.ts` | Reads the newest server start time from the process lister on macOS. | PsServiceAdapter.startedAt() | ServicePort | platform darwin unit file |
| `./src/infrastructure/adapters/outbound/platform/darwin/KillZeroLivenessAdapter.ts` | Tells a live owner pid from a stale one with a zero-signal probe on macOS. | KillZeroLivenessAdapter.isAlive(pid) | ProcessLivenessPort | platform darwin unit file |
| `./src/infrastructure/adapters/outbound/platform/darwin/OsascriptNotifierAdapter.ts` | Sends desktop notifications with the system scripter on macOS. | OsascriptNotifierAdapter.notify(title, body) | NotifierPort | platform darwin unit file |
| `./src/infrastructure/adapters/outbound/platform/win32/CimServiceAdapter.ts` | Reads the newest server start time from the system inventory on Windows. | CimServiceAdapter.startedAt() | ServicePort | platform win32 unit file |
| `./src/infrastructure/adapters/outbound/platform/win32/GetProcessLivenessAdapter.ts` | Tells a live owner pid from a stale one through the process query on Windows. | GetProcessLivenessAdapter.isAlive(pid) | ProcessLivenessPort | platform win32 unit file |
| `./src/infrastructure/adapters/outbound/platform/win32/PowerShellToastNotifierAdapter.ts` | Sends toast notifications with the system shell on Windows. | PowerShellToastNotifierAdapter.notify(title, body) | NotifierPort | platform win32 unit file |

## 12. Main: composition (product nodes F9, F10, U11)

| Target | Responsibility | Public interface | Depends on (ports) | Tests |
|---|---|---|---|---|
| `./src/main/patches-container.ts` | Wires every patch use case and adapter behind the nine ports. | createCommands(paths, patches, clockTicks, seams) | all patch ports | unit patches main folder |
| `./src/main/cli/patches-paths.ts` | Resolves the patches data, state, registry and watch paths from the environment. | resolvePaths(env, home) | none | unit patches main folder |
| `./src/main/darwin-container.ts` | Wires the macOS service, liveness and notifier adapters for patches. | darwinPatchesAdapters | ServicePort, ProcessLivenessPort, NotifierPort | platform darwin unit file |

## 13. Tests moved into the tree

| Target | Responsibility | Test directory |
|---|---|---|
| `./tests/component/patches/adapters-with-use-cases.test.ts` | Component scenarios of the use cases over real adapters. | component patches folder |
| `./tests/component/patches/follow-with-real-adapters.test.ts` | Component scenarios of follow over real adapters. | component patches folder |
| `./tests/e2e/patches/effect.test.ts` | End-to-end scenarios of effect with the Linux process stand-in. | e2e patches folder |
| `./tests/e2e/patches/faults.test.ts` | End-to-end refusal and write-failure scenarios with put-back. | e2e patches folder |
| `./tests/e2e/patches/follow.test.ts` | End-to-end scenarios of follow and its crafted unknown-shape stop. | e2e patches folder |
| `./tests/e2e/patches/lifecycle.test.ts` | End-to-end apply, undo, check and status lifecycle scenarios. | e2e patches folder |
| `./tests/live/patches/live.test.ts` | Live scenarios of follow against the real registry and service checks. | live patches folder |
| `./tests/support/patches/fake-opencode.ts` | Stand-in server for proving staged copies in tests. | support patches folder |
| `./tests/support/patches/fakes.ts` | In-memory ports for unit scenarios. | support patches folder |
| `./tests/support/patches/follow-fakes.ts` | In-memory follow ports with lock and evidence recording. | support patches folder |
| `./tests/support/patches/registry.ts` | Local registry stand-in with whole or tarball-only failures. | support patches folder |
| `./tests/support/patches/sandbox.ts` | Sandbox layout with the fixtures folder and per-platform process stand-in. | support patches folder |
| `./tests/support/patches/world.ts` | Wires the application to fakes for unit scenarios. | support patches folder |
| `./tests/unit/patches/application/ApplyUndo.test.ts` | Unit scenarios of apply and undo including checksum refusals. | unit patches application folder |
| `./tests/unit/patches/application/Follow.test.ts` | Unit scenarios of follow and rollback including unknown-shape stops. | unit patches application folder |
| `./tests/unit/patches/application/InspectEffectNotify.test.ts` | Unit scenarios of inspect, effect and notify including negatives. | unit patches application folder |
| `./tests/unit/patches/application/Inspector.test.ts` | Unit scenarios of the patch inspector including not-installed. | unit patches application folder |
| `./tests/unit/patches/application/InstallationCatalog.test.ts` | Unit scenarios of catalog loading and target filtering. | unit patches application folder |
| `./tests/unit/patches/application/StatusAndCheck.test.ts` | Unit scenarios of status and check including unchecked-version. | unit patches application folder |
| `./tests/unit/patches/domain/EffectReading.test.ts` | Unit scenarios of log reading including rejection lines. | unit patches domain folder |
| `./tests/unit/patches/domain/Jsonc.test.ts` | Unit scenarios of the merged entry and setting readers. | unit patches domain folder |
| `./tests/unit/patches/domain/MatcherRules.test.ts` | Unit scenarios of site location against the fixtures. | unit patches domain folder |
| `./tests/unit/patches/domain/PatchRules.test.ts` | Unit scenarios of checksum classification and replacement. | unit patches domain folder |
| `./tests/unit/domain/versions.test.ts` | Unit scenarios of the single semver ordering including pre-releases. | unit domain folder |
| `./tests/unit/patches/infrastructure/PatchesCliAdapter.test.ts` | Unit scenarios of the command group including usage exits. | unit patches infrastructure folder |
| `./tests/unit/patches/infrastructure/follow-adapters.test.ts` | Unit scenarios of the follow adapters with liveness stand-ins. | unit patches infrastructure folder |
| `./tests/unit/patches/infrastructure/fs-adapters.test.ts` | Unit scenarios of the file-system adapters. | unit patches infrastructure folder |
| `./tests/unit/patches/infrastructure/installations-adapters.test.ts` | Unit scenarios of the three installation listers. | unit patches infrastructure folder |
| `./tests/unit/patches/infrastructure/platform-linux.test.ts` | Unit scenarios of the Linux service and notifier adapters. | platform linux unit folder |
| `./tests/unit/patches/main/patches-container.test.ts` | Unit scenarios of path resolution and container wiring. | unit patches main folder |
| `./tests/unit/patches/definitions/patches.test.ts` | Proves the recorded checksums against the real fixture files. | unit patches definitions folder |
| `./tests/unit/patches/infrastructure/platform-darwin.test.ts` | Unit scenarios of the three darwin adapters with stand-in executables. | platform darwin unit file |
| `./tests/unit/patches/infrastructure/platform-win32.test.ts` | Unit scenarios of the three win32 adapters with stand-in executables. | platform win32 unit file |
| `./tests/unit/patches/infrastructure/liveness.test.ts` | Unit scenarios of the Linux liveness adapter and the lock with a stand-in. | unit patches infrastructure folder |
| `./tests/e2e/patches/platform-linux.test.ts` | End-to-end effect, notify and lock scenarios on Linux. | e2e patches folder |
| `./tests/e2e/patches/platform-darwin.test.ts` | End-to-end effect, notify and lock scenarios on macOS. | e2e patches folder |
| `./tests/e2e/patches/platform-win32.test.ts` | End-to-end effect, notify and lock scenarios on Windows. | e2e patches folder |
| `./tests/live/patches/platform.test.ts` | Live check of service time, liveness and notification on the running OS. | live patches folder |

## 14. Fixtures, frozen documents, scripts and units

| Target | Responsibility |
|---|---|
| `./tests/support/patches/fixtures/magic-context-0.47.0/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.48.0/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.0/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.2/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.7/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.12/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.13/` | Four upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.15/` | Six upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.19/` | Six upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.35/` | Nine upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.41/` | Nine upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.42/` | Nine upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.43/` | Nine upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.50/` | Eleven upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.55/` | Eleven upstream files the checksums are proved against. |
| `./tests/support/patches/fixtures/magic-context-0.49.56/` | Eleven upstream files the checksums are proved against. |
| `./docs/reference/<merge-stamp>-legacy-magic-context-patches-agents.md` | Frozen predecessor agent guide with its safety rules merged into the agent guide. |
| `./docs/reference/<merge-stamp>-legacy-magic-context-patches-readme.md` | Frozen predecessor readme with its user content merged into the readme. |
| `./docs/reference/2026-10-11-19-37-magic-context-patches-plan-patch-tool.md` | Frozen plan of the patch tool. |
| `./docs/reference/2026-10-23-00-39-magic-context-patches-plan-follow-command.md` | Frozen plan of the follow command. |
| `./docs/reference/2026-11-10-22-48-magic-context-patches-plan-composed-patches-and-fold-identity.md` | Frozen plan of composed patches and fold identity. |
| `./docs/reference/2026-11-15-20-44-magic-context-patches-plan-magic-context-0.49.56.md` | Frozen plan of the 0.49.56 adoption. |
| `./docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-12-15-13-magic-context-0.48.0-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-12-23-15-magic-context-0.49.0-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-14-22-08-magic-context-0.49.2-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-16-17-03-magic-context-0.49.7-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-18-11-42-magic-context-0.49.12-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-19-16-03-magic-context-0.49.13-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-20-20-57-magic-context-0.49.15-execute-threshold.md` | Frozen evidence the execute-threshold-minimum definition points at. |
| `./docs/reference/2026-10-22-01-14-magic-context-0.49.15-no-session-model-fallback.md` | Frozen evidence the no-session-model-fallback definition points at. |
| `./docs/reference/2026-10-22-23-00-magic-context-0.49.19-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-11-02-06-30-magic-context-0.49.35-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-11-02-23-06-magic-context-0.49.35-refusal-patches.md` | Frozen evidence the refusal-recovery definition points at. |
| `./docs/reference/2026-11-03-01-43-magic-context-0.49.35-refusal-recovery-sandbox.md` | Frozen sandbox record of the refusal-recovery proof. |
| `./docs/reference/2026-11-07-23-41-magic-context-0.49.41-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-11-08-10-45-magic-context-0.49.42-0.49.43-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-11-10-23-00-magic-context-fold-identity.md` | Frozen evidence the fold definitions point at. |
| `./docs/reference/2026-11-11-01-24-magic-context-0.49.46-0.49.50-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md` | Frozen evidence the patch comments point at. |
| `./docs/reference/2026-10-11-20-05-magic-context-patches-research-patching-approach.md` | Frozen research on the patching approach. |
| `./docs/reference/<merge-stamp>-magic-context-patches-session-ses_e1dc7d932ffe69P47CJLyPq6qR.md` | Frozen session record of the merge session's predecessor work. |
| `./docs/reference/<merge-stamp>-magic-context-patches-session-ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | Frozen session record colliding by name with the existing record. |
| `./scripts/watch.mjs` | Installs the renamed systemd watch units for the new program. |
| `./systemd/opencode-session-manager-patches.path` | Starts the watch when an installed copy changes. |
| `./systemd/opencode-session-manager-patches.service` | Runs follow from the installed new-program binary. |
| `./systemd/opencode-session-manager-patches.timer` | Runs follow on a schedule. |

## 15. Session-manager files edited in place

| Target | Change | Product node |
|---|---|---|
| `./src/main/cli-container.ts` | Imports the patch commands, builds the group adapter, registers the patches family in the router. | F9, U11 |
| `./src/main/cli/platform.ts` | Adds the patches platform adapters, the darwin loader and the per-group platform split. | F10 |
| `./src/main/linux-container.ts` | Exports the Linux patches adapters. | F10 |
| `./src/main/win32-container.ts` | Exports the Windows patches adapters. | F10 |
| `./src/main/cli/cli.ts` | Exits with the bootstrap code at once for the Arborist idle connections. | F9 |
| `./src/infrastructure/adapters/inbound/cli/HelpCliAdapter.ts` | Adds the one-line patches summary to the help text. | U11 |
| `./src/infrastructure/adapters/inbound/cli/CliRouter.ts` | No change: families are already a record the new group plugs into. | U11 |
| `./src/infrastructure/adapters/outbound/system/SystemClockAdapter.ts` | Implements the clock port beside the runtime port with sleep. | F9 |
| `./src/domain/services/Versions.ts` | Single semver ordering with pre-release below release. | F9 |
| `./src/domain/services/Jsonc.ts` | Gains the entry, pinned-spec and numeric-setting readers. | F9 |
| `./package.json` | Names the patches group, adds the watch scripts, pins `@npmcli/arborist` 9.4.0 under devDependencies, and documents the `OPENCODE_SESSION_MANAGER_PATCHES_*` environment prefix. | F9, U10 |
| `./bun.lock` | Regenerated for the added libraries. | F9 |
| `./tsconfig.json` | No change needed: the patches move under the existing source alias. | F9 |
| `./bunfig.coverage.e2e-linux.toml` | Ignores the darwin folder and container on Linux. | F10 |
| `./bunfig.coverage.e2e-win32.toml` | Ignores the darwin folder and container on Windows. | F10 |
| `./bunfig.coverage.e2e-darwin.toml` | The e2e coverage gate on macOS ignoring the linux and win32 folders and containers. | F10 |
| `./bunfig.coverage.toml` | No change: the unit gate already covers the whole tree. | F9 |
| `./bunfig.toml` | No change: preload and coverage flags already hold. | F9 |
| `./scripts/coverage.mjs` | No change: the platform picker already selects the darwin config. | F10 |
| `./scripts/lint-diagrams.mjs` | Skips the upstream-bytes fixture folder in the variable scan. | F9 |
| `./scripts/build.mjs` | Comment only: the CLI now bundles the installer library. | F9 |
| `./.gitignore` | No change. | none |
| `./AGENTS.md` | Source map, platform law, test-support table, coverage law, deployment and the merged safety rules; also the module-level pointer for every existing module of section 2. | F9, F10 |
| `./README.md` | Program section, architecture, build and test, environment table and the merged user content. | F9, F10 |
| `./tests/unit/architecture/imports.test.ts` | Expects the darwin and patches container files. | F9, F10 |
| `./tests/unit/maintenance/architecture.test.ts` | Compares platform folders and containers with the three platforms. | F10 |
| `./tests/support/source-files.ts` | Adds darwin to the measured platforms. | F10 |
| `./tests/unit/maintenance/infrastructure/platform.test.ts` | Pins the three supported platforms and the patches adapters. | F10 |
| `./tests/e2e/maintenance/failures.test.ts` | Builds every supported platform including darwin. | F10 |
| `./tests/unit/sessions/magic-context-release.test.ts` | Moves its version assertions to the single versions suite with the flipped case. | F9 |
| `./tests/unit/sessions/magic-context-versions.test.ts` | Only if the pinned reader changes behaviour. | F9 |
| `./tests/unit/maintenance/infrastructure/adapters.test.ts` | Covers the merged clock adapter sleep. | F9 |
