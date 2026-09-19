# AGENTS.md — opencode-sessions-transfer

Operational rules for any agent working in this directory. Read this before
touching code, and re-read the laws table after any change that touches the
storage or TUI layer.

## Repo layout

```
src/
  domain/               entities, errors, ports, pure path helpers (zero I/O)
  application/          use cases (TransferSessionUseCase, BuildDirectoryOptionsUseCase, ListRecentDirectoriesUseCase)
  infrastructure/
    adapters/inbound    TUI plugin adapter (SessionsTransferTuiAdapter)
    adapters/outbound   SQLite session DB adapter, project resolver adapter, filesystem scanner
  main/                 composition root (container.ts) + plugin entries
test/
  unit/ component/ e2e/ arch/   always-on tiers (coverage-gated)
  live/                         opt-in tier, never touches the real opencode.db
  fakes/                        fake ports for hermetic unit testing
bunfig.toml                     coverage = true, per-file threshold = 1.0
dist/sessions-transfer.tui.js  TUI bundle (/transfer-session command)
dist/sessions-transfer.js      Server/core bundle
```

## Commands

| Command | Purpose |
|---|---|
| `bun run typecheck` | strict tsc, `exactOptionalPropertyTypes` |
| `bun run test` | unit + component + e2e + arch (hermetic, coverage-gated) |
| `bun run test:live` | opt-in live tier; drives the built bundle on temp resources |
| `bun run coverage` | explicit coverage run; per-file threshold 1.0 |
| `bun run build` | bundles → `dist/sessions-transfer.tui.js` |
| `bun run install:plugin` | copies bundle to `~/.config/opencode/plugins/` |

## Definition of done (checklist)

A change is not done until EVERY step passes:

1. `bun run typecheck` clean.
2. `bun run test` — 0 failures.
3. `bun run coverage` — every `src/**` file at `100.00 / 100.00` (per-file gate; a
   subset run such as `bun test --coverage test/unit` MUST exit non-zero).
4. `bun run build` + `bun run install:plugin`; the installed bundle must be
   byte-identical to `dist/`.
5. If the bundle or entrypoints changed: `bun run test:live`.
6. Verify live in OpenCode TUI.

## Coverage law

- `bunfig.toml` sets `coverageThreshold = { lines = 1.0, functions = 1.0 }`, checked
  **per file** (not the `All files` average).
- Bun only instruments **loaded** files, so every `src/**` file must be imported by a
  test. A new source file with no test silently escapes the gate — wire it into a tier.
- `coveragePathIgnorePatterns` excludes `test/**` and `dist/**`; test support code is
  excluded, not "tested".
- Dead branches must be removed by code shape, not suppressed — Bun has no coverage
  ignore comment. Never add an unreachable `else`/fallback just to look complete.
- `test/live/**` must never read or write the real `opencode.db`; use temp DBs only.

## Architecture law

- Strict hexagonal: `src/domain` must stay I/O-free; dependencies point
  **inward only**. Enforced by `test/arch/imports.test.ts`.
- Only `src/main/container.ts` wires concrete adapters (composition root).
- Imports use the `@transfer/*` (src) and `@test/*` (test) aliases — never
  relative paths (enforced by the arch tests).
- Every class gets an **explicit** `constructor() {}` — even empty ones.

## Plugin API limits (do not re-litigate)

`TuiDialogSelectProps` exposes only `title/placeholder/options/flat/onMove/onFilter/onSelect/skipFilter/current`.
There is **no** `ref`, `bindings`, `actions`, or `footerHints`, and no
session-footer slot. Live filesystem autocomplete in the filter box and
Left/Right drill-down are therefore impossible from a plugin — do not attempt
`dialog.replace` on every keystroke (it remounts the input and clears the
filter). See README "What this plugin can and cannot do".
