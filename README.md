# opencode-sessions-transfer

OpenCode plugin that relocates a session's working directory to **any** folder —
a nested project, a sibling repository, a plain non-git folder, or a path that
does not exist yet — from the TUI.

It is the installable companion to the upstream `/move` fix
([anomalyco/opencode#49560](https://github.com/anomalyco/opencode/pull/49560))
for users running a build that does not yet include it.

## Usage

* **Slash command:** `/transfer-session` (alias: `/relocate`)
* **Command palette:** `Transfer session` (`session.transfer`)

Flow:

1. Inside a session, run `/transfer-session`.
2. Pick a known directory (all session directories are listed, nested projects
   included), or choose **Enter custom path…** to type any path.
3. The destination is created when missing, the session row is re-pointed at the
   new project, and the agent is notified of the new working directory.


## OpenCode compatibility

| Host | Exact tested plugin SDK | Built entrypoints |
|---|---:|---|
| OpenCode v1.18.32 | `@opencode-ai/plugin@1.18.32` | `dist/sessions-transfer.js`, `dist/sessions-transfer.tui.js` |
| OpenCode v2.0.14 | `@opencode/plugin@2.0.14` | `dist/v2/server.js`, `dist/v2/tui.js` |

### OpenCode v2

`bun run build` also emits a v2 directory plugin at `dist/v2/`:

* `dist/v2/server.js` — no-op server entry `{ id, setup }`; required because a
  v2 directory plugin is admitted through `<dir>/server` (or `<dir>/index`),
  and it is what makes the server advertise `features.tui`.
* `dist/v2/tui.js` — TUI entry `{ id, setup }` registering `/transfer-session`
  (alias `/relocate`, palette “Transfer session”).

`dist/v2` is a build input, never a deployed mutable checkout. Stage it with the
v2 installer, then point the v2 configuration at the immutable release directory
printed by that command:

```jsonc
{
  "plugins": [
    { "package": "<absolute-path-to-v2-plugins>/sessions-transfer/releases/sha256-<aggregate-hash>" }
  ]
}
```

For example, set `OPENCODE_V2_PLUGIN_DIR` to an isolated test profile or the
reviewed global release root, run `bun run install:plugin:v2`, and retain the
printed `sha256-...` path in the deployment manifest. The installer never edits
`opencode.jsonc`; the reviewed deployment transaction changes the configuration.

### OpenCode v1

`bun run install:plugin:v1` installs the v1 server and TUI bundles into the legacy
OpenCode plugin locations (requires `OPENCODE_V1_PLUGIN_DIR` or `OPENCODE_V1_RELEASE_DIRECTORY`). Its v1 dependency is pinned to
`@opencode-ai/plugin@1.18.32`; v1 never loads the v2 `{ id, setup }` entries.

v2 already ships `/cd <path>` (moves the open session to any existing folder,
cross-project included) and `/worktrees` (current project's worktrees only).
On v2 this plugin adds: a picker over **every** registered project root,
worktree and session directory across projects; moving a session other than
the open one; and creating a destination that does not exist yet. The move
itself goes through the host `session.move` API — no SQLite writes on v2 — so
the host re-resolves the project and tells the agent about the new directory.
Folder creation happens in the TUI process (same machine as a local server).

## Architecture

Hexagonal:

* `src/domain/` — pure entities, ports, and `paths` helpers (`expandHome`, `abbreviateHome`). Zero I/O.
* `src/application/` — `TransferSessionUseCase`, `BuildDirectoryOptionsUseCase`, `ListRecentDirectoriesUseCase`.
* `src/infrastructure/adapters/outbound/` — `SqliteSessionDbAdapter`, `ProjectResolverAdapter`, `DirectoryScannerAdapter`.
* `src/infrastructure/adapters/inbound/tui/` — command + dialog wiring.
* `src/main/` — composition root and bundle entrypoints.

## What this plugin can and cannot do

OpenCode's TUI plugin API is intentionally narrow. Verified against
`packages/plugin/src/tui.ts` and `packages/tui/src/plugin/adapters.tsx`:

| Behaviour | Supported |
|---|---|
| Relocate a session to an arbitrary / non-git / new directory | **Yes** (direct SQLite + agent notification) |
| List every known session directory (nested projects discoverable) | **Yes** |
| Free-form path entry (with `~` expansion and on-disk casing) | **Yes** |
| Replace or restyle the builtin `/move` command | **No** |
| Live filesystem autocomplete inside the filter box | **No** — `DialogSelect` exposes no filter handle to plugins |
| Left/Right arrow directory drill-down inside the dialog | **No** — plugins get no `bindings`/`ref` on `DialogSelect` |
| Live footer directory indicator refresh | **No** — builtin `useDirectory` is not slot-replaceable |

Those last four are delivered by the upstream core change; this plugin is the
best-effort equivalent for stock builds.

## Development & Test

```bash
bun test
bun run typecheck
bun run coverage
bun run build
OPENCODE_V1_PLUGIN_DIR="/isolated/v1-profile/plugins" bun run install:plugin:v1
OPENCODE_V2_PLUGIN_DIR="/isolated/v2-plugins" bun run install:plugin:v2
```

`install:plugin:v1` requires `OPENCODE_V1_PLUGIN_DIR` (or `OPENCODE_V1_RELEASE_DIRECTORY`);
`install:plugin:v2` requires `OPENCODE_V2_PLUGIN_DIR` (or `OPENCODE_V2_PLUGIN_ROOT`).
Both installers build first and never edit configuration. Re-hash staged output with `validate:installed:v1` and
`validate:installed:v2` (the latter requires `OPENCODE_V2_RELEASE_DIRECTORY`).
Global v2 deployment is performed from immutable artifact directories and v2's
object-form `plugins` configuration.
