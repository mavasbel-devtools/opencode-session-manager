# Session sync: design

Status: Magic Context sync is built (`context sync`, the browser's queue).
Copying OpenCode sessions themselves, and both together as one action, is the
next step; this document is its design. Decisions are the owner's, taken on
2026-10-08 and 2026-10-09.

## Goal

One operation, from the CLI or the browser, that brings a session from one
profile to another — the OpenCode session (its rows in `opencode.db`) together
with its Magic Context state (its rows in `context.db`) — in either direction,
with paths rewritten for the target machine. It replaces `migrate`, which is
removed (decision: keep only `sync`).

## The unit: a session

- The session row (`session_v2`, or `session` for OpenCode 1), its entries
  (`session_message`, or `message` + `part`), its sub-agent sessions
  (`parent_id`; a child always follows its parent), and every other row keyed by
  the session. The exact table list is taken from the OpenCode 2.0.24 schema of
  both stores before any code is written, never assumed.
- Its Magic Context state, as `context sync` copies it today
  (`docs/reference/2026-10-08-22-39-magic-context-store-layout.md`).

## Matching and relation

Sessions are matched by id (`ses_…` ids are kept by every move, migration and
transfer). Two histories are compared by their message ids, in order:

| Relation | Meaning |
|---|---|
| only here / only there | the id exists on one side |
| same | the same message ids |
| source ahead / target ahead | one history is a prefix of the other |
| diverged | they share a prefix and then differ |

## What happens to each session

| Situation | Default | Selectable |
|---|---|---|
| missing on the target | copy session + context | skip |
| the target is a prefix of the source | replace session + context | skip |
| same messages | context only, by `--prefer` | — |
| diverged | skip | fork (both kept: the source arrives as a new session) |

`--prefer further|keep|replace` decides context-only conflicts; `further` takes
the side whose summaries reach further, and only when the target's history
holds every message those summaries point at.

## Paths and projects

- `--map <from>=<to>` rules (repeatable), applied by the existing rewriter: a
  Windows `from` matches both slash forms, escaped once to three times inside
  nested JSON, `file:///` and `@fs/` forms and case variants. Without rules, the
  mapping a session's own folders imply is used, as `context sync` does now.
- Project ids are recomputed the way OpenCode does on the target machine
  (`GitProjectIdentityAdapter`), with the project row created when missing;
  Magic Context identities the way Magic Context does
  (`MagicContextIdentityAdapter`).

## Safety

- Both stores are copied with `VACUUM INTO`; only the copies are written.
- Both copies are checked (integrity, foreign keys, row counts, anchors, no
  source-side path left in a synced session) before anything is swapped.
- Both are swapped in by renames into one backup folder; if the second swap
  fails the first is undone; one `rollback` restores both.
- Refused while any process holds either store open, while a Magic Context
  wrapup or rebuild is running for a synced session, or when the two OpenCode
  stores have different formats.

## Interfaces

- CLI: `sync --from <dataHome> --to <dataHome> [--map <from>=<to>]...
  (--session <id>... | --all) [--prefer further|keep|replace]
  [--diverged skip|fork] [--dry-run]`, with a snake_case JSON report.
- Browser: `>`/`<` queue a session sync; the queue shows each entry's action
  (copy, replace, context only, conflict), `d` dry run, `a` apply.

## Later steps

Magic Context health in the browser (summary lag, wrapup state, the installed
and the newest Magic Context version) and `/ctx-wrapup` / `/ctx-recomp` through
OpenCode's command endpoint; fork (same side or the other, whole or up to a
message) and the plugin's `/fork-with-context`; an external refresh script.
