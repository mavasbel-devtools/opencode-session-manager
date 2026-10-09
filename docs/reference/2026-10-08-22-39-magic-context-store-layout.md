# Magic Context store layout (format 94, `@cortexkit/opencode-magic-context` 0.45.0)

Ground truth for the code that reads and writes Magic Context stores
(`BunMagicContextStoreAdapter`, `BunMagicContextSyncStoreAdapter`,
`MagicContextIdentityAdapter`). Every statement below was read from the plugin's
source (`packages/plugin/src` of 0.45.0, as installed by OpenCode) or from a live
store with `select sql from sqlite_master`; the exact `CREATE` statements of the
tables a sync touches are kept in `tests/support/sessions/magic-context-94.sql`.

## Where it lives

| What | Path |
|---|---|
| Store | `$XDG_DATA_HOME/cortexkit/magic-context/context.db` (default `~/.local/share/…`), WAL mode |
| Format version | `select max(version) from schema_migrations` — 94 on 0.45.0; a Windows store written by an older release read 91 |
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
order. What a sync (`context sync`) does with each:

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
| `session_meta` | per-session settings, counters and two cached context snapshots (`cached_m0_bytes`, `cached_m1_bytes`) | counter set to the copied tag count; caches cleared, as Magic Context's own session move does |
| `session_projects` | the session's project identity per harness | set to the target project |
| `compartment_state_lease`, `recomp_*`, `lkg_slots`, `lkg_slot_chunks` | locks, an in-progress rebuild, last-known-good caches | cleared, never copied |
| `historian_runs`, `subagent_invocations`, `transform_decisions`, `message_history_*`, `plugin_messages`, other caches | statistics and indexes of the target's own history | kept |

Outside the list, a sync also bumps `compartment_history_versions.version` for
the session and `project_state.project_memory_epoch` for a project that gained
memories, so Magic Context re-reads what changed.

## Memories

`memories` belong to a project (`project_path`), not a session;
`source_session_id` names the session that created one. They are unique on
`(project_path, category, normalized_hash)`, where `normalized_hash` is the md5
of the content lower-cased with runs of whitespace collapsed to one space and
trimmed. `memory_embeddings.memory_id` → `memories.id`. A sync copies the
memories the session created into the target project, re-hashing the rewritten
text; one with the same hash already there is kept.

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
