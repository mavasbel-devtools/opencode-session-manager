# Plan: `follow` — adopt new Magic Context releases automatically, already patched

Status: **approved 2026-10-23 (all three rule changes, C1 hot reload, C2 `~/.local/share/…/installs/<v>/`,
C3 keep 1 previous); implemented, verified and installed 2026-10-23** — see
[Implementation and verification](#implementation-and-verification). Hindsight initiative page
`kp-8b422c88ad6844af8f4ed3e86bcdee0f`.

## Goal

When npm publishes a new `@cortexkit/opencode-magic-context`, the tool installs it **already
patched**, so that OpenCode never loads an unpatched copy, and stops (staying on the current
version and telling the user) whenever a patch site has a shape it does not recognise.

## Why the current flow cannot do this

- Magic Context's own updater does not install anything for a plugin pinned by hand. This was
  established during the 0.49.19 upgrade on 2026-10-22 and is the reason `auto_update` is `false`.
- With an npm pin, OpenCode installs and loads the new copy itself, and this tool patches the files
  afterwards. Observed on 2026-10-23: the live log
  `/tmp/opencode2/magic-context/magic-context.log` shows `config reload failed … invalid value
  (number 13)` at 05:04:50Z and 05:04:59Z. The audit log
  `~/.local/state/opencode-magic-context-patches/audit.log` shows the 0.49.19 apply at 05:05:12Z.
  For those seconds, the unpatched copy was running.

## Verified prerequisites (2026-10-23, sandbox `/tmp/opencode/follow-probe`)

| # | Question | Evidence | Result |
|---|---|---|---|
| P1 | Does OpenCode 2.1.1 load a plugin from an absolute folder path? | `packages/core/src/config/plugin/source.ts` `scan` (lines 134–188): absolute targets are resolved through `Host.resolve` (`packages/plugin/src/host.ts`), which tries `server`, then `index`, then `tui`; the plugin folder is watched (lines 50–72). Live run: an isolated `opencode serve --port 49911` (all XDG folders and HOME in the sandbox) with `"plugins": ["/tmp/opencode/follow-probe/managed2/node_modules/@cortexkit/opencode-magic-context"]` listed it in `GET /api/plugin` as `{"id":"opencode-magic-context","source":{"type":"local","path":".../index.js"},"features":{"server":true,"tui":true},"state":{"status":"active"}}`. The plugin created its own `context.db` in the sandbox and applied 95 migrations there. | **Yes.** The entry shows as `local`, not `package`, so `opencode plugin check/update` no longer touch it. |
| P2 | Does installing it ourselves give the same files OpenCode installs? | OpenCode installs with `@npmcli/arborist` 9.4.0 (root `package.json` catalog), using `ignoreScripts: true`, `binLinks: true`, `savePrefix: ""`, `audit: false`, `save: true`, `saveType: "prod"` (`packages/util/src/npm.ts` lines 209–243). Arborist 9.4.0 with those options in an empty folder: 8,410 files. All are byte-identical (sha256) to the live install `~/.cache/opencode/npm/@cortexkit/opencode-magic-context@0.49.19/1792731824443/node_modules`, except the 4 files we patch. In those 4 files our install equals the unmodified upstream fixture `tests/fixtures/magic-context-0.49.19/` and the live install equals each patch's recorded `after`. | **Yes, with Arborist 9.4.0.** The npm 11.20.0 CLI is **not** equivalent: 8,372 files, missing the optional `@emnapi/runtime`, `@img/sharp-wasm32` and `tslib`. |

Side effect of the P1 run: the sandbox server had no `TMPDIR` set, so Magic Context wrote 117 lines to
the live log `/tmp/opencode2/magic-context/magic-context.log` (06:37:12–06:37:57Z). None of them is a
rejection, an `invalid value` or a session-model fallback, so `effect` is unaffected. Future sandbox
runs must set `TMPDIR` (or `MAGIC_CONTEXT_LOG_PATH`) inside the sandbox.

## Design

### Flow (one run of `follow`)

| Step | Action | Stops when |
|---|---|---|
| 1 Detect | `dist-tags.latest` from the npm registry. Compare it with the version OpenCode loads now. | Not newer: exit 0, nothing to do |
| 2 Stage | Arborist 9.4.0 reify (P2 options) into `<state>/installs/.staging-<v>-<uuid>/`. Check the tarball's `dist.integrity` against the registry. | Integrity mismatch, or install failure |
| 3 Locate | Each patch gets a **matcher**: the file is found by content, not by its hashed name (`dist/v2/server-*.js`, `dist/index-*.js`). A matcher states the exact needle(s), the exact count per file, the exact number of files, and an anchor that must surround each hit (for example `runFallbackHistorianPass` for the fallback line). Known shapes: `min(20).max(90` ×3 in exactly 2 files; the 0.49.15 and the 0.49.19 fallback lines ×1 in exactly 2 files. | Any other count, file count or shape: stop, notify, stay on the current version |
| 4 Patch | Apply the replacements to the staged copy and record a `PatchRelease` (`before` and `after` sha256) **derived** for that version. Every changed file must still transpile (`Bun.Transpiler`). A reviewed version must give exactly its reviewed checksums. Then rename the staging folder to `installs/<v>/` (one step), so the proof loads the very folder the entry will name. | Transpile error, read-back mismatch, reviewed checksum differs |
| 5 Prove | Start an isolated `opencode serve --port 0` (sandbox HOME, XDG and `TMPDIR`; only those variables and `PATH=/usr/bin:/bin`, so no `HINDSIGHT_CONFIG`; the user's real `magic-context.jsonc`) with that folder as its only plugin. Require `GET /api/plugin` → `active` from that folder, and the sandbox log to contain no `config reload failed` (the line Magic Context writes for every rejected setting, including `invalid value (number 13)`). | Any check fails: the folder is removed |
| 6 Publish | Change the Magic Context plugin entry in `~/.config/opencode/opencode.jsonc` to that absolute path, only that string literal, keeping comments (whole-file backup first, read back after). | Not exactly one entry, or read-back mismatch: the original is put back |
| 7 Confirm | OpenCode watches its config and loads the new entry. `follow` waits until every loaded location of the running server (`/api/debug/location`, then `/api/plugin` each) reports the plugin `active` from the new folder, then reads Magic Context's live log from the switch: no `config reload failed`, and the threshold in use must not differ from the configured one. | Timeout, rejection or a differing threshold: put the previous entry back, confirm that, notify |
| 8 Record | Keep the derived releases (`derived-releases.json`, used by `status`, `apply`, `undo`), remove older installs nothing names or loads, append to `audit.log`, write the evidence to `<state>/evidence/YYYY-MM-DD-HH-MM-magic-context-<v>-follow.md`, remember the previous entry for `--rollback`, notify. Versions accepted this way are marked `auto-checked` in `status`. Adding the fixture and committing remains a manual review step. | – |

Rollback at any time: `follow --rollback` restores the previous entry. The previous folder is kept until the next successful `follow`.

### Hexagonal layout (new or changed parts)

- Domain:
  - `model/Matcher.ts` (`PatchMatcher`: needles, per-file count, file count, anchors)
  - `model/FollowReport.ts`
  - `services/MatcherRules.ts` (locate and derive a `PatchRelease`, pure)
  - outbound ports `RegistryPort` (dist-tags, integrity), `PackageInstallerPort` (stage, publish), `PluginEntryPort` (read and replace the plugin entry in opencode.jsonc), `SandboxServerPort` (start, plugin state, log lines, stop), `TranspilePort`
  - inbound port `FollowPort`
- Application: `FollowUseCase` (steps 1–8), `RollbackUseCase`. Each port is used only through its abstraction.
- Infrastructure (outbound): `NpmRegistryAdapter`, `ArboristInstallerAdapter` (pinned `@npmcli/arborist@9.4.0`), `JsoncPluginEntryAdapter`, `OpencodeSandboxServerAdapter`, `BunTranspileAdapter`. New installations adapter `ManagedInstallationsAdapter`, so `status`, `check` and `effect` see `<state>/installs/<v>/`. The loaded-copy check reads either an npm spec or an absolute path.
- `patches/*.ts`: each definition gains a `matcher`. The fixed `releases` stay; they are the reviewed versions.
- systemd: `opencode-magic-context-patches.service` runs `follow` instead of `notify` (timer: 2 min after boot, then every 6 h).

As built, the hexagonal layout differs from this sketch only in names and granularity: the use cases
are `FollowUseCase` and `RollbackUseCase`, with the steps in `src/application/follow/` (`ReleaseStager`,
`ReleaseProver`, `PluginEntryEditor`, `EntrySwitcher`, `AdoptionRecorder`, `StepLog`); the entry is
edited by `PluginEntryEditor` over the existing `FilesPort` and `BackupPort` (no separate
`PluginEntryPort`); the running server is read through `LivePluginsPort`; the install folders through
`ManagedStorePort`; derived releases and evidence through `DerivedReleasesPort` and `EvidencePort`.
AGENTS.md lists every file.

### Tests

- `tests/unit`: matchers against every fixture (0.47.0 … 0.49.19). Synthetic unknown shapes, wrong counts and one file too many or too few must all stop. `FollowUseCase` and `RollbackUseCase` with fakes, covering every stop branch. 100 % lines and functions.
- `tests/component`: the use case over the real adapters, with a local registry fixture (a tarball served from a temp folder) and a fake OpenCode.
- `tests/e2e`: the whole program on a sandboxed home, from a pinned 0.49.15 to a staged 0.49.19 and back with `--rollback`, with crafted unknown shapes. 100 % lines and functions.
- `tests/live` (opt-in): the real registry, Arborist, and an isolated `opencode serve`.

## Rule changes this needs (user decision)

`AGENTS.md` currently says: rule 5, *nothing applies a patch to a version it has not been checked
against*; rule 6, *`notify` and the systemd units only report*; rule 7, *the tool never restarts
OpenCode and never edits configuration files*. `follow` breaks all three by design:

1. Rule 5 would become: *automatically, only through a matcher whose every count and anchor holds,
   and only after the sandbox proof (step 5); otherwise never.*
2. Rule 6 would become: *the units run `follow`, which may install; it never applies to a copy OpenCode has already loaded.*
3. Rule 7 would become: *the tool edits exactly one value, the Magic Context plugin entry in
   opencode.jsonc, with a backup and a read-back check. It never restarts OpenCode.*

## Open choices

| # | Choice | Recommended | Alternative |
|---|---|---|---|
| C1 | Switch-over | Hot reload: OpenCode watches its config and absolute plugin folders (`source.ts` lines 45–91) and re-activates the plugin by itself; the copy it picks up is already patched. Step 7 verifies this on the live log before it accepts. | Prepare only and notify; the user runs `opencode service restart` |
| C2 | Where installs live | `~/.local/share/opencode-magic-context-patches/installs/<v>/` | `~/.config/opencode/vendor/…` (inside the config tree, which OpenCode also watches) |
| C3 | How many old versions to keep | 1 (the previous one) | 2 |

## Decisions (2026-10-23)

The user approved all three rule changes (now AGENTS.md rules 5–7), C1 hot reload, C2
`~/.local/share/opencode-magic-context-patches/installs/<v>/`, and C3 keep 1 previous version.

## Implementation and verification

Commit: see `git log` (`feat(follow): …`). Package version 0.2.0; runtime dependency
`@npmcli/arborist` 9.4.0 (exactly OpenCode 2.1.1's pin), compiled into the executable.

| Check | Result |
|---|---|
| Matchers on all 9 fixtures (`tests/unit/domain/MatcherRules.test.ts`) | Each patch derives exactly its reviewed release (same files, `before`, `after`) where reviewed, and refuses (`found it in 0`) where it was never reviewed. Measured anchors: the threshold hits sit 52, 132, 201 characters after `execute_threshold_percentage`; the fallback spread 207 after `async function runFallbackHistorianPass(args) {` (window 300). |
| Crafted unknown shapes (e2e, tarballs built from the 0.49.19 fixture) | A fourth threshold site, the fallback site gone from one bundle, both fallback shapes in one bundle, a replacement already present, the anchor renamed: each stops at `locate` with its exact reason, the staged copy is removed, `opencode.jsonc` is byte-identical. |
| `bun run check` (2026-10-23 10:39 local) | exit 0: typecheck; docs lint (16 files, 18 scripts, 14 variables); unit 160/160 at 100 % lines and functions per file; e2e 47/47 at 100 %; component 4/4; live 7/7. |
| Live `follow` (in `tests/live`: real npm registry, real Arborist, real `~/.opencode/bin/opencode` 2.1.1, throwaway home, copy of the real `magic-context.jsonc`) | `adopted` 0.49.19 with all 8 steps ok, prove log `0 "config reload failed"`; `--rollback` restored the entry; no sandbox home left behind. |
| Compiled binary, throwaway home, real registry and OpenCode | 18 s end to end (detect 0.4 s, stage 9.5 s, locate 0.1 s, patch 0.1 s, prove 7.4 s); the install has 8,410 files, byte-identical to OpenCode's own install except the 4 patched files, whose sha256 are the reviewed `after`. |
| Hot reload against a running isolated `opencode serve` (2.1.1) | The server switched from the npm entry to the folder by itself: confirm passed in 7.0 s (`1 locations load it (active)`, 0 `config reload failed` after the switch, although the unpatched npm copy had logged `invalid value (number 13)` at start); `--rollback` back to npm likewise in 7.0 s. |
| Installed on this machine | `~/.local/bin/opencode-magic-context-patches` 0.2.0 (byte-identical to the build); units reinstalled, `ExecStart=… follow`, path and timer enabled and active. The units' first run: `follow: up-to-date (0.49.19)`, `Result=success`. `~/.config/opencode/opencode.jsonc` sha256 `28e5820e…` unchanged before and after. |

What happens next on this machine: npm `latest` is 0.49.19, the version OpenCode loads, so every run
reports `up-to-date`. When 0.49.20 (or later) is published, the next run (a cache or config change, 2
minutes after login, or every 6 hours) adopts it already patched, or stops and notifies.
`opencode-magic-context-patches follow --version 0.49.19` would move to the managed folder now.
