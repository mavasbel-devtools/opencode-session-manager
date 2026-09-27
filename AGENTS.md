# AGENTS.md — engineering contract for opencode-session-id

This file is the authority for how this repository is built and changed. It is
enforced by tests, not by convention. If a rule here and the code disagree, the
code is wrong until one of them is deliberately changed.

## 1. Fixed identity

| Thing | Value | Do not change without a migration |
|---|---|---|
| package name | `opencode-session-id` | — |
| plugin id | `session-id-tool` | the global AGENTS.md startup routine loads a tool by this id |
| tool name | `session-id` | referenced by name in prompts/routines |
| host | `@opencode/cli` 2.0.14 | v1 is out of scope |
| plugin contract | `@opencode/plugin` 2.0.14 | types-only; never a runtime import in `src` |
| deployed at | `<v2 plugin root>/session-id/` | already in the user's `opencode.jsonc` `plugins` list |
| build outputs | `dist/v2/server.js`, `dist/v2/tui.js` | the two entrypoints the host loads |
| licence | MIT © mavasbel | — |

## 2. The tool contract is frozen

The `session-id` tool must behave field-for-field like the hand-written plugin
it replaces. That original is kept verbatim as
`tests/support/fixtures/legacy-session-id-index.js`
(SHA-256 `54657b2b8706d5b4ebc869f241305dec559ac4b8cd3daa3840aa0f90819173c6`),
and `tests/component/tool-parity.test.ts` fails if the deployed tool drifts from
it. Frozen surface:

- name `session-id`;
- description `Extracts and returns the active 'session ID' directly from the opencode plugin execution context.`;
- input schema `{ type: "object", properties: {}, additionalProperties: false }`;
- `options.codemode: false` (without it the tool is only reachable through v2's `execute` tool, not by name);
- on a missing session ID, the exact error
  `State Inconsistency: 'sessionID' is undefined or null within the execution context.`;
- on success, `{ content: String(sessionID) }`.

The single source of that surface in `src` is
`src/domain/tool/SessionIdToolDefinition.ts`.

## 3. Architecture law (strict hexagonal)

- Dependencies point inward only: `domain` ← `application` ← `infrastructure`,
  and `main` wires them. `src/domain` performs no I/O and names no UI or host
  package type — colours and view elements are type parameters.
- Ports are split: `src/domain/ports/inbound` (`ResolveSessionIdToolPort`,
  `RenderSidebarEntryPort`) and `src/domain/ports/outbound` (`ThemePalettePort`,
  `SidebarViewPort`). Every adapter declares `implements` its port.
- Imports in `src` use only the `@session-id/*` alias; tests use `@session-id/*`
  and `@test/*`. No relative cross-layer paths.
- Every class has an explicit constructor. Only a composition root constructs
  adapters and use cases (`new` on our classes is allowed nowhere else).
- No runtime `@opencode/*` import anywhere in `src`. The host API is typed
  structurally in `src/infrastructure/host/V2ServerContext.ts` and
  `src/infrastructure/host/V2TuiContext.ts`.
- These are enforced by `tests/unit/architecture/imports.test.ts` and
  `tests/unit/architecture/solid-principles.test.ts`.

### One composition root per runtime

There are two roots — `src/main/server-container.ts` and
`src/main/tui-container.ts` — not one. Measured: a single shared root made the
server entry import the TUI view adapter, so `Bun.build` of `src/main/v2/server.ts`
tried to bundle OpenTUI's native packages (`@opentui/core-darwin-x64`, …) and
failed. `imports.test.ts` walks the server entry's import graph and fails if any
`.tsx` file, or `tui-container.ts`, ever appears in it again.

## 4. TUI runtime law

OpenCode 2.0.14 shares a single Solid/OpenTUI runtime with its TUI plugins
through `opentui:runtime-module:*` virtual modules. Therefore:

- `scripts/build.mjs` compiles `.tsx` with `@opentui/solid/bun-plugin` and keeps
  every runtime specifier external; it fails the build if the bundle imports
  `solid-js` or `@opentui/*` by package name (a bundled second copy would not
  update with the host).
- The sidebar line is a `prepend` on the `sidebar.content` slot. The title box
  has no plugin slot, so the ID is the first row of the sidebar scroll area,
  directly under the title, and scrolls with the content. This is not a bug to
  "fix" by moving it into the title box — there is no slot there.

## 5. Tests: `tests/{unit,component,e2e,live}`

| Tier | What runs | Coverage |
|---|---|---|
| unit | one class at a time with stand-ins; plus the architecture, SOLID, host-fixture and coverage-completeness gates | **measured, 100%** |
| component | the wired plugin painted by the real OpenTUI renderer | not gated |
| e2e | this plugin's `src` driven end to end by real OpenCode 2.0.14 host code **in-process** (real `Host.resolve`/`Host.load`, the verbatim v2.0.14 slot resolver, the real renderer) | **measured, 100%** |
| live | the real `opencode.exe`, the built bundles, the installer, and the real TUI in a Windows ConPTY | not measurable |

The global rule requires measured coverage on the **unit** and **e2e** tiers.
Coverage tools only see code executed in the test process — measured: the same
call reports covered in-process and 0% in a child process — so "e2e" here is the
in-process real-host tier (measurable) and "live" is the real external process
(by construction invisible to coverage). This naming is deliberate and load-bearing.

### Coverage completeness

Bun instruments only files that are loaded. So each measured tier has a
completeness test that imports every `src` file
(`tests/unit/architecture/coverage-completeness.test.ts`,
`tests/e2e/coverage-completeness.test.ts`); without it an unimported source file
would silently escape the per-file gate. Coverage is measured with
`bunfig.coverage.toml` (per-file threshold 100% lines and functions), run by
`bun run coverage:unit` and `bun run coverage:e2e`. Never claim coverage without
reading the report. There are no coverage-ignore comments — a branch that cannot
be reached is removed by code shape.

## 6. Measured host behaviour these tests rely on

- `plugin.list` does not wait for activation (a cold call returns `data: []`),
  while `integration.list` waits — tests query it first.
- `Host.resolve` looks for `server` then `index`, and separately `tui`; the entry
  file names under `src/main/v2` are chosen so the real resolver accepts the
  directory.
- The CLI `session list` can answer `[]` for a session just created in the same
  cwd, so tests read sessions through `api session.list` instead.

## 7. Test safety (learned the hard way)

A test teardown once ran `fs.rm("", { recursive: true, force: true })` — its
`beforeAll` threw before assigning the temp path, and `""` resolves to the
process working directory — and deleted this repository, including `.git`. Rules:

- A test never calls a recursive delete on a path it did not just create, and
  never on an unvalidated variable. All deletes go through
  `removeTemporary()` in `tests/support/live/process.ts`, which refuses any path
  not strictly inside the OS temporary directory.
- A `beforeAll`/`beforeEach` that can throw leaves every variable it assigns
  unset; the matching teardown must treat each as possibly empty.
- `tests/live/**` and `tests/e2e/**` never touch the real `opencode.db` or the
  user's real `opencode.jsonc`; the live host runs under fully isolated XDG dirs.

## 8. Deployment

`scripts/install-plugin.mjs` never chooses a profile and never edits
`opencode.jsonc`; the plugin root comes from `OPENCODE_V2_PLUGIN_DIR` /
`OPENCODE_V2_PLUGIN_ROOT`. `bun run deploy:v2` builds, stages an immutable
content-addressed release under `session-id/releases/sha256-…/`, and points the
`index.js` / `tui.js` shims at it after backing up any existing ones. A test run
must never overwrite the deployed bundle, and a shim must never point at the
mutable `dist/`.

## 9. Git and change discipline

- Dev dependencies are pinned to exact versions (no `^`/`~`/`latest`); the built
  plugin has no runtime dependencies.
- `node_modules/`, `dist/`, `build/`, `coverage/` are ignored. `.gitattributes`
  pins line endings and marks `tests/support/fixtures/**` as binary so the
  byte-verified fixtures survive checkout.
- History is append-only after the first published commit.
- A change is done only when: `bun run typecheck` is clean; all four tiers pass
  with 0 failures; `bun run coverage` shows 100% lines and functions per `src`
  file on both measured tiers; `bun run build` succeeds and a staged install
  validates byte-identical to the build; `bun run lint:diagrams` passes and
  README/AGENTS/package.json/code/diagrams agree; and a secrets + personal-data
  scan is clean with the staged diff reviewed.
