# Herdr pane: the session's agent as the displayed agent name

Approved 2026-11-15. Supersedes the decision of
`docs/plans/2026-10-17-01-30-herdr-pane-title.md` ("report the exact title;
Herdr agent names not set") for `display_agent` only: `title` stays the root
session's title.

## Problem

The plugin sent the root title as both `title` and `display_agent`, so Herdr's
sidebar showed the title twice over and never which agent a pane runs.

## Evidence

- OpenCode 2.0.14 and 2.3.0 `SessionInfo` carry `agent?` next to `title?` and
  `parentID?` (`@opencode/client` types); no TUI plugin accessor exists for the
  prompt's selected agent.
- Herdr 0.9.5 `pane.report_metadata` replaces a source's whole record on each
  report, so every report carries both values or leaves one out to clear it.
- Herdr 0.9.5 sidebar: `agent` renders `display_agent`; `pane` renders the
  metadata `title`, else the manual label; tokens join with ` · `.

## Design

| Value | Source |
|---|---|
| `display_agent` | `data.session.get(<session on screen>).agent`; left out when not known |
| `title` | the root session's title; left out when not known |
| neither | `clear_title` + `clear_display_agent` |

Source `opencode-session-manager:title`, guard `agent: opencode`, poll 250 ms,
resend every 10 s, timeout 1 s: unchanged.

## Tests

- unit: `tests/unit/domain/pane-title.test.ts`,
  `tests/unit/application/report-pane-title.test.ts`,
  `tests/unit/infrastructure/herdr-pane-title-adapter.test.ts`,
  `tests/unit/infrastructure/herdr-socket-adapter.test.ts`
- component: `tests/component/herdr/pane-presentation.test.ts`
- e2e: `tests/e2e/herdr/pane-title.test.ts`
- live: `tests/live/tui-herdr.test.ts`
