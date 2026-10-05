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

`bun run install:plugin:v2` copies both entries into one folder,
`<plugins>/sessions-transfer/` (`server.js`, `tui.js`), where OpenCode 2.0.14
**auto-discovers** it — no configuration entry is needed or written. It must be a
folder: v2 resolves a TUI entrypoint only for a directory, and a loose file would
get the (no-op) server entry alone.

### OpenCode v1

`bun run install:plugin:v1` writes the v1 server and TUI bundles,
`sessions-transfer.js` and `sessions-transfer.tui.js`, into `<plugins>`. They are
two files because v1.18.32 rejects a module exporting both `server()` and `tui()`.
Its v1 dependency is pinned to `@opencode-ai/plugin@1.18.32`; v1 never loads the
v2 `{ id, setup }` entries (its `{plugin,plugins}/*.{ts,js}` scan reads files only,
never the v2 folder).

`<plugins>` is `OPENCODE_V1_PLUGIN_DIR` / `OPENCODE_V2_PLUGIN_DIR` when set,
otherwise `$XDG_CONFIG_HOME/opencode/plugins` (default `~/.config/opencode/plugins`).
Installing one lane removes this plugin's files of the other lane, so a v2 host
never loads both forms. Never list the plugin in `opencode.jsonc` (v2.0.14 rejects
a file path in `plugins`). Writing into the live `plugins` directory hot-activates
the plugin in a running v2 host.

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
bun run install:plugin:v2      # or install:plugin:v1
bun run validate:installed:v2  # or validate:installed:v1
```

Both installers build first and never edit configuration. Validation compares
every installed file byte-for-byte with `dist/`, imports it exactly as the host
does, and fails if the other lane's form is present. `test/e2e/installer-contract.test.ts`
covers the slot handover, the XDG default and tamper rejection;
`test/e2e/v2-host-discovery.test.ts` proves a real OpenCode 2.0.14 host with an empty
config auto-discovers `plugins/sessions-transfer/` and reports it active with
`features.tui`.
