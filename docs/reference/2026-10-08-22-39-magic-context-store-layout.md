# Magic Context store layout (formats 94 and 95, `@cortexkit/opencode-magic-context` 0.45.0 and 0.47.0)

Ground truth for the code that reads and writes Magic Context stores
(`BunMagicContextStoreAdapter`, `BunMagicContextSyncStoreAdapter`,
`MagicContextIdentityAdapter`). Every statement below was read from the plugin's
source (`packages/plugin/src` of 0.45.0, as installed by OpenCode) or from a live
store with `select sql from sqlite_master`; the exact `CREATE` statements of the
tables a sync touches are kept in `tests/support/sessions/magic-context-94.sql` (0.45.0) and
`tests/support/sessions/magic-context-95.sql` (0.47.0).

Format 95 (0.47.0, migration "cover cleanup and retention reads, index git FTS rowids and store
temporal replay decisions") adds two tables and changes no column: `temporal_decisions`
(`session_id`, `message_id`, `marker`; in Magic Context's `SESSION_SCOPED_TABLES`, deleted only when no
`session_meta` row is left, like `session_replay_decisions`) and `git_commit_fts_rowid_map`
(`fts_rowid`, `sha`; a search index of git commits, no session). It also drops five single-column
session indexes and adds `idx_git_commit_fts_rowid_map_sha`, `idx_message_fts_rowid_map_session_rowid`,
`idx_plugin_messages_session`, `idx_transform_decisions_retention` and `idx_user_memory_candidates_session`.

## Where it lives

| What | Path |
|---|---|
| Store | `$XDG_DATA_HOME/cortexkit/magic-context/context.db` (default `~/.local/share/…`), WAL mode |
| Format version | `select max(version) from schema_migrations` — 94 on 0.45.0, 95 on 0.47.0; a Windows store written by an older release read 91 |
| Diagnostic log | `<temp>/opencode2/magic-context/magic-context.log` for OpenCode 2 (`<temp>/opencode/…` for OpenCode 1); `MAGIC_CONTEXT_LOG_PATH` overrides it |
| Installed code | OpenCode's plugin cache: `~/.cache/opencode/npm/@cortexkit/opencode-magic-context@<spec>/…`; an `@latest` spec is resolved once and never refreshed |

## Harness label

Most session-owned rows carry a `harness` column: `opencode2` for OpenCode 2
sessions, `opencode` for OpenCode 1. A session started on OpenCode 1 and later
moved to OpenCode 2 can hold rows under both labels; the `opencode` rows then
point at OpenCode 1 message ids the OpenCode 2 session no longer has.

## Session-scoped tables

Magic Context's own list is `SESSION_SCOPED_TABLES` in
`features/magic-context/storage-session-tables.ts`, in dependency-safe deletion
order. What a sync (`context sync`, `sync`) does with each:

| Table | Holds | Sync |
|---|---|---|
| `compartments` | history summaries; `start_message_id`/`end_message_id` and `start_message`/`end_message` (ordinals) anchor each one in the OpenCode history | replaced, text rewritten |
| `compartment_chunk_embeddings` | embeddings of summary chunks (`compartment_id` → `compartments.id`) | replaced, re-linked to the new summary ids |
| `compartment_events` | events a summary published (`compartment_id` may be null) | replaced, re-linked |
| `tags` | the `§N§` handles, `tag_number` per session | replaced, numbers kept |
| `source_contents` | archived contents of dropped items; `tag_id` is a tag **number**, not `tags.id` | replaced |
| `pending_ops` | queued drops; `tag_id` is a tag **number** | replaced |
| `session_facts`, `compression_depth` | per-session facts and depth counters | replaced |
| `notes` (`type = 'session'`) | session notes | replaced, text rewritten, project re-pointed |
| `historian_runs` | each historian run (`compartment_id_min`/`_max` → `compartments.id`, `subagent_invocation_id`) | replaced, re-linked |
| `subagent_invocations` | historian/dreamer subagent calls (`parent_invocation_id` → itself) | replaced, re-linked |
| `primer_candidates` | questions the historian proposed for a project primer | replaced, project re-pointed |
| `user_memory_candidates` | user facts the historian proposed | replaced |
| `session_meta` | per-session settings, counters and two cached context snapshots (`cached_m0_bytes`, `cached_m1_bytes`) | counter raised to the copied tag count; caches cleared, as Magic Context's own session move does |
| `session_projects` | the session's project identity per harness | set to the target project |
| `compartment_history_versions` | the summaries' version and generation | bumped (also by Magic Context's own triggers on `compartments`) |
| `compartment_state_lease`, `recomp_*`, `lkg_slots`, `lkg_slot_chunks` | locks, an in-progress rebuild, last-known-good caches | cleared, never copied |
| `transform_decisions`, `m0_mutation_log`, `session_replay_decisions`, `temporal_decisions` (format 95), `git_commit_fts_rowid_map` (format 95, no session), `message_history_*`, `message_fts_rowid_map`, `plugin_messages`, `synapse_batch_ledger`, `pending_session_cleanup`, `tool_owner_backfill_state`, `embedding_measurement_corpus` | caches, indexes, queues and measurements of the target's own runs | kept, never copied |

## Project-scoped tables (scope `all`)

| Table | Sync |
|---|---|
| `memories` | every `active`/`permanent` memory of the source project, inserted under the target project unless Magic Context's key (`project_path`, `category`, `normalized_hash`) is already there; text rewritten and re-hashed |
| `memory_embeddings` | copied with a new memory when its text was not rewritten (a rewritten one is embedded again by Magic Context) |
| `memory_verifications` | copied with a new memory, file path rewritten |
| `notes` (other types) | project and smart notes, unless one of the same type and text is there |
| `primers` | unless one with the same question is there |
| `dream_runs` | the dreamer's run history, unless a run with the same start and holder is there |
| `retrospective_processed_windows` | unless the window is already marked |
| `project_state` | `project_memory_epoch` bumped when memories, notes or primers were added |
| `user_memories` (global) | unless one with the same text is there |
| `dream_state`, `dream_queue`, `task_schedule_state`, `project_key_files*`, `memory_mutation_log`, `embedding_*`, `git_commits*`, `mirror_*`, workspaces | machine-local scheduling, caches and indexes: never copied |

Magic Context's triggers keep its search indexes (`memories_fts`,
`primers_fts`) and version counters (`tags_version_*`,
`compartment_history_*`) in step with these writes. Its `*_authority_guard_*`
triggers refuse memory and note writes for a project listed in
`authority_managed` or `authority_repair_pending` unless
`context_privilege_state.enabled = 1`; a sync leaves such a project alone.

## Project identity

`resolveProjectIdentity`: `git:<root commit>` — the first of the sorted
`git rev-list --max-parents=0 HEAD` — for a folder inside a git repository with
at least one commit, else `dir:` + the first 12 hex characters of
`md5(path.resolve(directory))` (no `realpath`). A `git:` identity is the same on
every machine; a `dir:` identity changes when the folder's path changes.
Resolved identities are cached under `cortexkit/magic-context/project-identities/`.

## Running state that matters to tools

| Signal | Where |
|---|---|
| A historian run is in progress | `session_meta.compartment_in_progress = 1` and a `compartment_state_lease` row |
| A `/ctx-wrapup` is running | `session_meta.wrapup_in_progress_state` (JSON with `chunkIndex`, `expectedChunks`, `expiresAt`) |
| The last historian outcome | newest `historian_runs` row: `status` (`success`, `failed`, `noop`), `failure_reason`, `chunk_start_ordinal`–`chunk_end_ordinal` |
| How far a session is summarised | `max(compartments.end_message)` against the session's message count |
| The last prompt size | `session_meta.last_input_tokens` against `detected_context_limit` |

The historian summarises one chunk (about 100 messages, about 30k tokens) per
user turn. `/ctx-wrapup [N]` keeps the existing summaries and loops chunks until
N raw messages remain (default 20); `/ctx-recomp` rebuilds every summary from
message 1 and leaves memories alone. Both are registered with OpenCode 2's
command registry (`POST /api/session/:sessionID/command`) and stop when the
OpenCode server restarts.
