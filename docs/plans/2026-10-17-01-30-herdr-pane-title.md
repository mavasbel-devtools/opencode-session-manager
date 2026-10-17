# Herdr pane title from the open session's title

Approved 2026-10-17 (option 2 of the proposal: report the exact title; Herdr agent
names not set).

## Problem

In Herdr, every OpenCode pane is labelled `opencode`, and the only title Herdr
sees is OpenCode's terminal title `OC | <title>`, which OpenCode shortens to about
37 characters. Four course sessions all read `OC | Claude course recommendations
- Relat…` / `- Non r…`; the full titles (up to 63 characters) are what tell them
apart.

## Evidence

- Herdr 0.9.3 socket API (herdr.dev/docs/socket-api, *Agent state reporting*;
  `herdr api schema`, `PaneReportMetadataParams`): `pane.report_metadata` sets a
  pane's `title` and `display_agent` (display only; capped at 80 characters),
  per `source`, ordered by `seq`, with an optional `agent` guard.
- Measured on a private Herdr server: a report guarded with `agent: opencode` on
  a pane without OpenCode is answered with success but not applied, and is not
  kept for later; on a pane where Herdr recognises OpenCode it is applied.
- Herdr's own OpenCode integration (`~/.config/opencode/herdr-tui-session.js`,
  integration version 13) reports only the session id and state; it finds the
  open session with `api.ui.router.current()` polled every 100 ms and the root
  of the sub-agent chain through `api.data.session.get(id).parentID`.
- OpenCode 2.0.14 and 2.0.26 TUI plugin context (`packages/plugin/src/tui/context.ts`):
  `data.session.get(sessionID): SessionInfo | undefined` with `title?` and
  `parentID?`; `ui.router.current()`; `setup(context)` takes one argument.
- Agent names (`agent rename`) must match `[a-z][a-z0-9_-]{0,31}` and be unique:
  32-character slugs of these titles collide (`claude-course-recommendations-re`).

## Design (strict hexagonal)

| Layer | File | Role |
|---|---|---|
| domain | `src/domain/model/PaneTitle.ts` | `paneTitle` (whitespace, 80 characters with `…`), `rootSession` |
| domain | `src/domain/model/HerdrPane.ts` | `herdrPane(environment)`: socket and pane, or outside Herdr |
| domain | `src/domain/ports/inbound/ReportPaneTitlePort.ts`, `src/domain/ports/outbound/PaneMetadataPort.ts` | the ports |
| application | `src/application/ReportPaneTitleUseCase.ts` | serialised reports, only changes, refused ones resent, `refresh`, `release` |
| infrastructure | `src/infrastructure/adapters/outbound/herdr/HerdrSocketPaneMetadataAdapter.ts` | the socket client; never throws, `false` on any failure |
| infrastructure | `src/infrastructure/adapters/inbound/tui/HerdrPaneTitleV2Adapter.ts` | reads route + root title every 250 ms, refresh every 10 s, release on cleanup |
| main | `src/main/tui-container.ts`, `src/main/v2/tui.ts` | wired only inside Herdr; `setupWith(context, environment, platform)` for tests |

## Tests

- unit (100 % lines/functions per file): domain, use case, both adapters (the
  socket one against a stand-in socket: ok, error, garbage, split, silent,
  hang-up, absent), container, entries.
- e2e (100 % per file): the real 2.0.14 `Host.load` of the TUI entry, the
  plugin reading HERDR_* itself, over a Unix socket: home, session, sub-agent,
  not-synced, looping chain, rename, long title, another session, exit; every
  failure answer; the ten-second resend.
- live: the real OpenCode TUI started by a real, private Herdr server (own
  `XDG_CONFIG_HOME` in the temporary folder) in its pane: title and agent name
  equal the stored title, a rename follows, quitting releases.
- `tests/support/no-herdr.ts` is preloaded by every test run so no test reaches
  the user's Herdr.
