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
bun run install:plugin
```

`install:plugin` copies both bundles to `~/.config/opencode/plugins/`. TUI
plugins are loaded from `~/.config/opencode/tui.jsonc`.
