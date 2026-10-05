# opencode-session-id

An OpenCode 2.0.14 plugin that:

1. shows the active session ID in the session sidebar, as the first row under
   the session title (in the theme's muted colour);
2. provides the `session-id` tool, behaving identically to the hand-written
   `session-id/index.js` it replaces.

```
┌ sidebar ─────────────────────────────┐
│ <session title>                      │
│                                      │
│ ses_0123456789abCDEFGHIJKLMNOP       │  ← this plugin (prepend on sidebar.content)
│ Context …                            │
```

## What it can and cannot do

- The title box has no plugin slot, so the ID is the first row of the sidebar's
  scroll area and scrolls with the sidebar content.
- The sidebar only appears when the terminal is wide enough (`session.sidebar: "auto"`).
- OpenCode 1.x is not supported: the plugin targets the 2.0.14 contract only.

## Architecture

Strict hexagonal, dependencies point inward only; the full contract is in
`AGENTS.md`. There is one composition root per host runtime, because the server
and TUI entrypoints load into different processes — a shared root would pull the
OpenTUI view (and its native packages) into the server bundle.

```mermaid
flowchart LR
    SRV[OpenCode server] -->|tool.transform| TA[SessionIdToolV2Adapter]
    TUI[OpenCode TUI] -->|ui.slot prepend sidebar.content| SB[SessionIdSidebarSlotV2Adapter]
    TA --> RU[ResolveSessionIdToolUseCase]
    SB --> RE[RenderSidebarEntryUseCase]
    RU --> DEF[domain: SessionIdToolDefinition, MissingSessionIdError]
    RE --> TP[ThemePalettePort -> HostThemePaletteV2Adapter]
    RE --> SV[SidebarViewPort -> OpenTuiSidebarViewAdapter]
    RE --> SE[domain: SessionId, SidebarEntry]
```

Key files:

- `src/domain/tool/SessionIdToolDefinition.ts` — the tool's name, description, schema and error text
- `src/domain/model/SessionId.ts`, `src/domain/model/SidebarEntry.ts`
- `src/application/ResolveSessionIdToolUseCase.ts`, `src/application/RenderSidebarEntryUseCase.ts`
- `src/infrastructure/adapters/inbound/server/SessionIdToolV2Adapter.ts`
- `src/infrastructure/adapters/inbound/tui/SessionIdSidebarSlotV2Adapter.ts`
- `src/infrastructure/adapters/outbound/tui/HostThemePaletteV2Adapter.ts`
- `src/infrastructure/adapters/outbound/tui/OpenTuiSidebarViewAdapter.tsx`
- `src/main/server-container.ts`, `src/main/tui-container.ts` — the two composition roots
- `src/main/v2/server.ts`, `src/main/v2/tui.ts` — the deployed entrypoints
- `scripts/build.mjs` — binds the TUI bundle to the host's shared Solid/OpenTUI runtime

## Build and test

```
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run coverage
bun run lint:diagrams
```

The four test tiers live under `tests/{unit,component,e2e,live}`:

- **unit** — one class at a time, with stand-ins; includes the architecture and
  SOLID gates.
- **component** — the wired plugin painted by the real OpenTUI renderer.
- **e2e** — this plugin's source driven end to end by the real OpenCode 2.0.14
  host code *in-process* (its real plugin resolver, tool registry, sidebar slot
  and renderer). This is the tier coverage can measure.
- **live** — the real `opencode.exe`, the built bundles, the installer, and the
  real TUI in a Windows pseudo-terminal (200×50). Real by construction, and by
  construction invisible to any coverage tool.

`bun run coverage` gates the **unit** and **e2e** tiers, each of which reaches
100% lines and functions on every `src` file on its own
(`bunfig.coverage.toml`).

## Install

```
bun run install:plugin:v2      # builds, then writes <plugins>\session-id\{server.js,tui.js}
bun run validate:installed:v2  # byte-compares both files with dist\v2 and checks the module shapes
```

`<plugins>` is `OPENCODE_V2_PLUGIN_DIR` when set, otherwise
`%XDG_CONFIG_HOME%\opencode\plugins` (default `%USERPROFILE%\.config\opencode\plugins`).
OpenCode 2.0.14 **auto-discovers** the `session-id` folder there — no `opencode.jsonc`
entry is needed, and the installer never edits configuration. It must be a folder,
not a single file: v2 resolves the TUI entrypoint (the sidebar line) only for a
directory. Writing into the live `plugins` directory hot-activates the plugin in a
running OpenCode v2 host.

To remove the plugin, delete the `session-id` folder from `plugins`.

## License

MIT © mavasbel
