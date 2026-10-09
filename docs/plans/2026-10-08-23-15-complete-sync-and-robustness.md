# Plan: complete session + Magic Context sync, robustness, Magic Context 0.46.1

Status: approved 2026-10-09. Branch `session-sync`. Builds on `e8af252` (docs pass)
and the uncommitted session-sync work (phase 2).

## Goal

`opencode-session-manager` copies and syncs **everything** that belongs to a
session — its OpenCode rows and all of its Magic Context state, including the
project-level memory it feeds — from one profile to another, in either direction,
from the CLI and the TUI, as safely as it can be done. At the end, the installed
Magic Context goes from 0.45.0 to the latest release (0.46.1, store format 95).

## Evidence this plan rests on

- Magic Context's own list of session-scoped tables (`SESSION_SCOPED_TABLES`,
  `storage-session-tables.ts`, 0.45.0) — 31 tables, harness-scoped or not.
- The live store (format 94) holds 107 tables; the Windows copy (format 91)
  holds 1,413 memories, 2,065 memory verifications, 154 primer candidates,
  1,053 dream runs and 3,041 historian runs, against 844 / 37 / 31 / 70 / 173 here.
- Every Windows memory names its `source_session_id` (none null): memories can be
  followed to the session that created them.
- Today's sync copies 18 of those tables (`compartments`, embeddings, events,
  `tags`, `source_contents`, `pending_ops`, facts, depth, session notes,
  `session_meta`, `session_projects`, memories the session created and their
  embeddings, plus clearing leases/rebuild/lkg rows).
- Magic Context 0.46.1 (GitHub release `v0.46.1`): store format 95, no migration
  from 0.46.0; OpenCode 2 does not update plugins by itself.

## Phases

### 0. Unblock `ses_ee930a7beffePydwFXtiqP1s5d` (now)
- `~/.config/cortexkit/magic-context.jsonc`: `historian_timeout_ms` 600000 →
  1800000; historian `fallback_models`: `opencode-go/deepseek-v4.1-flash`,
  `opencode-go/deepseek-v4-pro`. Backup in `~/.config/opencode/backups/`.
- The user restarts OpenCode, then runs `/ctx-wrapup` in that session.

### 1. Finish whole-session sync (phase 2 of the earlier plan)
- `sync --from --to [--map]… (--session…|--all) [--prefer] [--dry-run]`;
  `migrate` removed; joint swap of both stores into one `sync-backup-<stamp>/`;
  `rollback <dir> --db … --db …`.
- Docs (README, AGENTS, source map), commit.

### 2. Storage on Drizzle ORM, raw SQL in one place
- `drizzle-orm` pinned exactly, `drizzle-orm/bun-sqlite`, synchronous API.
- Typed schemas: OpenCode 2.0.24 tables (from OpenCode's own Drizzle
  definitions), Magic Context format 94 and 95 tables (written from the real
  `CREATE` statements; a test compares them with the fixtures).
- One engine adapter owns what no ORM expresses (`PRAGMA`, `VACUUM INTO`,
  `ATTACH`, `sqlite_master`); an architecture test fails on raw SQL anywhere else.
- Trial first: confirm Drizzle on `bun:sqlite` releases the file on `close()`
  (the `prepare()` constraint), else wrap statements so they are finalized.
- A store whose format the registry does not know is refused, not guessed at.

### 3. Everything in Magic Context, classified
Every table gets one rule, from Magic Context's source, recorded in
`docs/reference/…-magic-context-store-layout.md`:

| Rule | Tables |
|---|---|
| copy with the session (ids remapped, harness relabelled, text path-rewritten) | the 18 above, plus `historian_runs`, `subagent_invocations`, `primer_candidates`, `user_memory_candidates`, `m0_mutation_log`, `session_replay_decisions`, `transform_decisions` |
| merge into the target project (dedupe by Magic Context's own keys) | all `memories` of the project (not only those of synced sessions) with `memory_embeddings`, `memory_verifications`, `memory_mutation_log`; project `notes`; `primers`; `project_key_files`; `dream_state`, `dream_runs`, `task_schedule_state`, `retrospective_processed_windows`; `project_state` epochs bumped |
| merge globally | `user_memories` |
| never copied, rebuilt by Magic Context | FTS tables and their maps, `message_history_*`, leases, `lkg_*`, `recomp_*`, backfill/migration state, mirrors, `git_commits*`, embedding registrations and measurements, `tool_definition_measurements`, `schema_*`, workspaces |

- Embeddings are copied only when both stores use the same embedding identity
  (`embedding_identity_active`); otherwise left for Magic Context to compute.
- Project identity: `git:` kept, `dir:` recomputed from the mapped folder.
- Scope option: `--context sessions|projects|all` (default `all`).

### 4. Robustness
- Preflight refuses: OpenCode holding either store; a running wrapup, recomp or
  historian lease on any synced session; unknown store formats; too little space;
  a second sync already running (lock file next to the target).
- Checks after the copy, per store: integrity, foreign keys, per-table row counts
  per session, summary anchors, no source-side paths, unique memory keys, every
  session's project present, Magic Context opens the copy with its own code.
- Idempotent: syncing twice changes nothing the second time (tested).
- Fault injection for every write and swap step; rollback restores both stores.
- `verify --data <dir>`: read-only consistency report of a profile (OpenCode ↔
  Magic Context anchors, orphans, lagging summaries).
- Live tests on real copies of both profiles; an isolated OpenCode lists the
  synced sessions.

### 5. TUI on top of sync
- `>` / `<` queue a whole-session sync (copy / replace / context only / skip),
  diverged sessions skip or fork (both selectable); scope per entry; dry run,
  apply, result with rollback command.
- Health per session: summarised N of M, last prompt vs limit, wrapup state,
  last historian failure; header shows installed and latest Magic Context.
- `W` / `R`: `/ctx-wrapup` / `/ctx-recomp` on this machine's running OpenCode.

### 6. Fork
- Same side or across, whole or up to a message; new ids, Magic Context state
  translated; plugin `/fork-with-context`.

### 7. Magic Context 0.45.0 → 0.46.1 (last)
- First: the tool supports format 95 (fixture from 0.46.1, `context copy`
  94 → 95 on a copy, sync between 95 stores).
- Then, with no wrapup running: pin `@cortexkit/opencode-magic-context@0.46.1` in
  `~/.config/opencode/opencode.jsonc` (backup), remove the stale
  `~/.cache/opencode/npm/@cortexkit/opencode-magic-context@latest/`, restart
  OpenCode, confirm 0.46.1 in the sidebar and format 95 in `context.db`.

Every phase ends with: four test tiers green, 100 % per-file coverage (unit, and
e2e per platform), docs updated, a dry run on real copies, a commit.
