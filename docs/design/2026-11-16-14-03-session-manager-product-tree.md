# Session manager product tree

Purpose: one program and one plugin that keep OpenCode sessions and their
Magic Context state usable, movable and repairable across machines, profiles
and Magic Context releases — without ever writing to a store OpenCode holds
open, and without losing behaviour the merged-in patch tool provided.

Features F1–F8 already exist; each links to the README section that defines
it. Feature F9 (patches) carries use cases U1–U11 at leaf level. Feature F10
(platform) carries the existing Linux and Windows process-list and holder
guards plus the new darwin leaves U12–U13. Each leaf states its purpose, its
contract (inputs, outputs, failure modes; exit codes 0 ok, 1 not ok /
refused / failed / stopped, 2 usage error) and its acceptance criteria (the
scenarios Appendix F of the merge plan assigns it, named by test file
basename and scenario).

## Features

### F1 — Sessions

A profile is one OpenCode installation (its OpenCode store and, when
present, its Magic Context store under one data home). The sessions command
lists a profile's sessions, newest first, with entry counts and what Magic
Context holds for each. See [Profiles](../../README.md#profiles).

### F2 — Sync

Copy sessions and Magic Context state between profiles, with conflict
policies, dry runs, backups and rollback. See
[Session sync](../../README.md#session-sync).

### F3 — Transfer

Move one session to another folder through the host's own session-move API
(the plugin's Transfer session command), repairing its recorded folder
first when it is gone and mapped. See the plugin summary at the top of
[the README](../../README.md#opencode-session-manager).

### F4 — Relocate and repair

Rewrite recorded folders after moves on disk (renamed in place, already
moved, or configured mappings), verify the result, and repair git worktree
links (use case U14, brought in finished by Stage 2: unit scenarios in the
worktree-repair and git-worktree-adapter suites, component scenarios in the
location-repair-processes suite, e2e scenarios in the location-repair suite,
live scenarios in the tui-repair suite; negatives per tier as read from
those suites by step 2.4). See
[Moving sessions whose folders moved](../../README.md#moving-sessions-whose-folders-moved-relocate).

### F5 — Maintenance

Offline database maintenance of the OpenCode store: preflight checks,
rehearsal on a copy, a full run with evidence, and rollback of a backup.
See [Compaction](../../README.md#compaction).

### F6 — Browser

An interactive session browser over two profiles: read-only inspection, a
dry-run queue, and an apply step that writes through the same guarded path
as sync. See
[The session browser](../../README.md#the-session-browser).

### F7 — Herdr pane

When OpenCode runs in a Herdr pane, the pane shows the open session's agent
and full title. See
[Herdr pane title](../../README.md#herdr-pane-title).

### F8 — Plugin

The OpenCode 2 plugin (session ID in the sidebar, the session-id tool, the
Transfer session and Repair session locations commands, the Herdr title),
installed by the plugin installer. See
[Install the plugin](../../README.md#install-the-plugin).

### F9 — Patches

Keep five behaviour patches applied to every installed copy of Magic
Context (execute-threshold-min, no-session-model-fallback, refusal-recovery,
fold-identity-stable, fold-provenance-heal; what each changes and why comes
from the old tool's README The patches section), and adopt already-patched
releases with a watch that runs follow on updates. Command group
`opencode-session-manager patches`, one flag set everywhere (`--patch`,
`--version`, `--since`, `--json`; `--rollback` only with follow; anything
else is a usage error, exit 2). Every command prints human text by default
and JSON with `--json`; `--version` prints as the program's help adapter
prints it; an unexpected error prints as an error line and exits 1;
notifications go through the platform notifier under the program name. The
patches group reads and edits the file session-manager resolves:
opencode.jsonc, else opencode.json, so every U1–U9 contract below inherits
that rule.

#### U1 patches status

Purpose: report every patch on every installed copy. Contract: no required
flags; output is the per-copy per-patch state table (JSON form with
`--json`). Failure modes: a copy whose version matches no checked release
is reported as unchecked-version, never as applied. Acceptance: unit
scenarios in StatusAndCheck (negative: unknown version is classified
unchecked-version); component scenarios in adapters-with-use-cases
(negative: modified file reads as modified); e2e scenarios in lifecycle
(negative: no copy installed reads as not-installed); live scenario finding
the copy the configuration pins (negative exempt: a live read has no
negative input).

#### U2 patches apply

Purpose: write the before-state bytes the patch definitions require.
Contract: optional `--patch` (one patch, default all) and `--version` (one
copy, default the loaded one). Failure modes: a file whose checksum is not
the recorded before-state refuses the whole apply (exit 1) and nothing is
written. Acceptance: unit scenarios in ApplyUndo (negative: checksum not
before refuses); component scenarios in adapters-with-use-cases (negative:
site count mismatch); e2e scenarios in lifecycle and faults (negative: a
write failure puts back every file); live exempt (it changes the live copy;
e2e on real files covers it).

#### U3 patches undo

Purpose: restore the before-state bytes of applied patches. Contract:
same flags as apply. Failure modes: a file whose checksum is not the
recorded after-state refuses (exit 1). Acceptance: unit scenarios in
ApplyUndo (negative: checksum not after refuses); component scenarios in
adapters-with-use-cases (negative as apply); e2e scenarios in lifecycle
(negative as apply); live exempt as U2.

#### U4 patches check

Purpose: answer whether every patch is applied on the loaded copy, for the
watch and for scripts. Contract: no required flags; exit 0 only when all
patches are applied, else exit 1 with the missing list. Acceptance: unit
scenarios in StatusAndCheck (negative: one patch missing exits 1);
component scenarios in adapters-with-use-cases (negative as unit); e2e
scenarios in lifecycle (negative as unit); live scenario checking
consistently with status (negative exempt as U1).

#### U5 patches inspect

Purpose: review a version a patch was not checked against, before deciding
to derive a release for it. Contract: `--version` is required; reports per
site whether each patch still matches. Acceptance: unit scenarios in
Inspector and InspectEffectNotify (negative: version not installed reports
not-installed); component exempt (no adapter beyond files); e2e scenarios
in lifecycle (negative as unit); live exempt (reading fixtures suffices).

#### U6 patches effect

Purpose: tell whether the configured threshold is actually in use, by
reading Magic Context's log. Contract: optional `--since` (ISO time,
default the service start). States: respected, rejected (rejection lines
present), or reported absence of a log. Acceptance: unit scenarios in
EffectReading and InspectEffectNotify (negative: rejection lines read as
rejected); component exempt (log file only); e2e scenarios in effect
(negative: no log is reported); live threshold scenario with `--since`
(negative exempt).

#### U7 patches notify

Purpose: send a desktop notification when check fails, for the watch path.
Contract: no required flags; notifies only when check fails, otherwise
silent with exit 0. Failure modes: a missing notifier is reported with
exit 1. Acceptance: unit scenarios in InspectEffectNotify (negative: check
ok sends nothing); e2e scenarios in effect and lifecycle (negative:
notifier missing is reported, exit 1); live is a manual user-confirmed
check.

#### U8 patches follow

Purpose: adopt the newest already-patched release (or the `--version`
asked for): stage it from the registry, prove it in an isolated sandbox
against the running OpenCode, switch the configuration entry to it, and
record the adoption. Contract: optional `--version`; `--json` throughout.
Failure modes: an unknown file shape stops the run (stopped, exit 1) and
nothing is switched; a sandbox rejection stops before any switch.
Acceptance: unit scenarios in Follow and follow-adapters (negative: unknown
shape stops); component scenarios in follow-with-real-adapters (negative:
sandbox rejects); e2e scenarios in follow (negative: tarball with a crafted
unknown shape); live follow against the real registry (negative exempt: no
crafted release exists on the real registry).

#### U9 patches follow --rollback

Purpose: put back the configuration entry follow replaced. Contract: only
with follow; `--rollback` takes no version. Failure modes: nothing
recorded, or the previous folder missing, is reported with exit 1 and the
entry is left untouched. Acceptance: unit scenarios in Follow (negative:
none recorded; new negative: previous folder missing); component scenarios
in follow-with-real-adapters (negative as unit); e2e scenarios in follow
(negative new as unit); live exempt (it would change the live entry).

#### U10 install:watch

Purpose: install the watch that runs follow on Magic Context updates:
systemd user units on Linux, a launchd agent on darwin; win32 refuses with
an explanatory message. Contract: installer names the units for the new
program, enables and activates them; validation reports enabled and
active. Acceptance: new unit scenarios in the watch suite covering Linux,
darwin and the win32 refusal (the refusal is the negative); live systemd
checks on Linux and a new read-only launchd check on darwin (negative: not
installed is reported); e2e has no installer tier in this repository.

#### U11 help, version, usage

Purpose: the command group documents itself and rejects misuse loudly.
Contract: `--help` prints the command list of Appendix B under the program
name `opencode-session-manager patches`; `--version` prints the version as
the program's help adapter prints it; an unexpected error prints
`ERROR: <message>` and exits 1; the CLI ends with `process.exit(code)`
after its output is flushed; any other argument or malformed flag exits 2.
Acceptance: unit scenarios in the CLI adapter suite and the main suite
(negative: unknown command exits 2); new e2e scenarios in cli-surface
(negative: every malformed flag exits 2); live exempt.

### F10 — Platform

OS-specific process listing, store-holder detection and notification live
behind one port each; only the current platform's adapters are loaded, wired
by its container. The Linux and Windows guards already exist (refuse a write
while a process holds the target store open). Darwin becomes the third full
platform: process listing runs the system process lister and matches the
executable basename; holder detection runs the open-files lister over the
store and its journal files (no holder reads as free); both take their
executable path as a constructor argument and are used through the darwin
container. Per-platform patches ports (start time, liveness, notification)
are one adapter per platform with stand-in tests (U15; win32 e2e and live
stay blocked with no Windows host).

#### U12 darwin process list

Purpose: name the running processes of one image on darwin, so the guard
can refuse while OpenCode runs. Contract: input an image name, output its
pids; a failing lister is reported with exit 1. Acceptance: new unit
scenarios in darwin-adapters (negative: lister exits non-zero); e2e refusal
scenarios on darwin (negative: no such process); live run per the platform
plan step.

#### U13 darwin holders

Purpose: name what holds a database file open on darwin, so a write can
refuse with a cause. Contract: input a store path, output holder commands
and pids or free; a missing lister is reported. Acceptance: new unit
scenarios in darwin-adapters (negative: lister missing); component preflight
and guard scenarios against a real database (negative: held file refuses);
e2e scenarios writing while the database is held open (negative as
component); live run per the platform plan step.

### F11 — Re-sync retry

Keep the open session on screen through a transient failure of the reconnect
re-sync, instead of letting the TUI show an error toast and send the route home.
The feature applies to one call only: `data.session.sync(id, { children: true })`
while the route shows session `id` — the call the session screen makes on every
event-stream reconnect. Every other call passes through unchanged, and the only
outputs are the call resolving or the original error rethrown; the failure modes
are the use-case table below. At most 6 attempts are made, 500 ms apart and
doubling, retried only for a transient transport error or an HTTP 503, never
for a missing session; the retries stop when the route leaves the session, and
when they run out the call resolves if the session is loaded, otherwise it
rethrows the last error so the stock behaviour stands. A call without
`children: true`, or one whose route is not on that session, is not eligible
and passes through untouched. The plugin re-runs `setup` after a reconnect, so
the wrapper is installed once and re-pointed at the newest context, and
`cleanup` leaves it in place.

| Use case id | Behaviour | Component scenario | Live |
|---|---|---|---|
| UC-RR1 | 503 retried; resolves; route kept | `[UC-RR1]` | LR1: one 503 then 200 from the server |
| UC-RR2 | transport error (ECONNRESET/ECONNREFUSED/… in message, `code` or cause chain) retried; route kept | `[UC-RR2]` | LR3: proxy killed 3 s mid-GET |
| UC-RR3N | `SessionNotFoundError` (`name` or `_tag`) rethrown at once; the host goes home | `[UC-RR3N]` | LR2: 404 after delete |
| UC-RR4N | status 404 never retried | `[UC-RR4N]` | LR2: exactly one 404 |
| UC-RR5N | route left the session during the retries → stop, rethrow | `[UC-RR5N]` | live gap: needs a route change inside a ≤15.5 s window |
| UC-RR6N | retries exhausted: session loaded → resolve (route kept); not loaded → rethrow the last error | `[UC-RR6N]` (both branches) | LR4: 25 s outage, session loaded |
| UC-RR7N | not eligible (no `children: true`, or the route is not on that session) → exactly one call, error unchanged | `[UC-RR7N]` | LR1: the guard's own plain verify stays a single call |
| UC-RR8 | plugin re-setup keeps one wrapper pointed at the newest context; cleanup leaves it in place | `[UC-RR8]` | not reachable as a separate signal |
| UC-RR9N | host without a function `sync`, or with a read-only `sync` → nothing installed, no throw | `[UC-RR9N]` | n/a: the stock host has both |
| UC-RR10N | other errors (400, 401, 500, unknown) → not retried | `[UC-RR10N]` | n/a |
| UC-RR11 | together with the F12 guard: a one-shot 503 leaves neither a home flip nor a restore toast | `[UC-RR11]` | LR1: 0 home samples |

Acceptance: unit scenarios in `./tests/unit/domain/resync-retry.test.ts`,
`./tests/unit/application/retry-resync.test.ts`,
`./tests/unit/infrastructure/resync-retry-adapter.test.ts` and
`./tests/unit/infrastructure/v2-resync-route-adapter.test.ts`; component
scenarios in `./tests/component/reconnect/resync-retry.test.ts`; e2e scenarios
in `./tests/e2e/reconnect/resync-retry.test.ts`, one scenario per use case;
live scenarios in `./tests/live/tui-resync-retry.test.ts`.

### F12 — Restore after reconnect

When OpenCode's event stream reconnects, the TUI re-syncs the open session;
when that re-sync fails the TUI shows an error toast and sends the route home
("splash"), even though the session still exists (UC-R1). The plugin watches
for that and navigates back: when the route leaves session `S` for home within
10 s of a `server.connected` event — in either order — and `S` still exists,
the plugin verifies `S` (`data.session.sync`) with delays of 500, 1000, 2000,
4000 and 8000 ms and navigates back to `S` with a success toast. It does nothing
when the home screen is not a reconnect reset. See
[Restore after reconnect](../../README.md#restore-after-reconnect).

| Use case | When | Outcome |
|---|---|---|
| UC-R1 | the route leaves session `S` for home within 10 s of `server.connected`, in either order, and `S` still exists | verified with 500/1000/2000/4000/8000 ms delays, then navigated back to `S` with a success toast |
| UC-R2N | home with no `server.connected` within 10 s either side (a deliberate trip home) | no verify, no navigate, no toast |
| UC-R3N | `S` was deleted (`session.deleted`), or the verify rejects as `SessionNotFoundError` | no navigate, no toast |
| UC-R4N | the verify keeps failing | after the fifth attempt one info toast (`Session restore skipped` / `Could not verify <session ID> after reconnect`), no navigate |
| UC-R5N | the route leaves home while verifying | the loop aborts, no navigate, no toast |
| UC-R6N | `S` already reached 3 restores in the last 60 s | no verify, no navigate, no toast |
| UC-R7N | the route moves session → session (tabs, multi-tab) without going home | never a trigger, no verify, no navigate, no toast |
| UC-R8 | dispose | events and polls go nowhere |

Constants: `WINDOW` 10000 ms, `RESTORE_LIMIT` 3 per `RESTORE_WINDOW_MS`
60000 ms, `VERIFY_BACKOFF` 500/1000/2000/4000/8000 (about 15.5 s), and a 250 ms
route poll. Acceptance: unit scenarios in
`./tests/unit/domain/reconnect-restore.test.ts`,
`./tests/unit/application/restore-after-reconnect.test.ts`,
`./tests/unit/infrastructure/reconnect-restore-adapter.test.ts` and
`./tests/unit/infrastructure/v2-session-navigator-adapter.test.ts`; component
scenarios in `./tests/component/reconnect/restore.test.ts` (`[UC-R1]`,
`[UC-R2N]`…`[UC-R7N]`, `[UC-R8]`); live scenarios in
`./tests/live/tui-reconnect-restore.test.ts`. Live gap this plan introduces:
with F11 installed a one-shot 503 no longer sends the TUI home, so the UC-R1
live scenario cannot reach home any more; UC-R1 stays proven at component and
e2e level, and the live file's first scenario is re-targeted to assert the new
outcome.

## Components and interfaces

The patches command group is one inbound CLI adapter behind the router: it
parses the Appendix B surface, renders text or JSON, and returns the exit
code. Behind it stand nine use-case ports (status, apply, undo, check,
inspect, effect, notify, follow, follow-rollback) plus the help path, each
implemented by one application use case constructed only in the platform
containers. The use cases compose domain services (refusal rules, follow
rules, matcher rules, effect reading, version comparison) over outbound
ports: installations (list every copy with its root), files (read bytes and
one-step mode-keeping replace), backup, hash, registry (version plus
integrity, with a thrown reason), installer (Arborist), sandbox proof,
evidence, audit log, key-value store, notifier, log, service control,
follow lock, live plugins, text source and transpile. The five patch
definitions are data in the domain layer with their matchers, evidence
references and checked versions. The watch is a service plus a timer on
Linux and an agent on darwin, both running the new program's follow. The
platform feature adds the darwin container with its process-list and
holders adapters beside the Linux and Windows ones.

## Data and states

The tool owns a data folder (installs with their backups, the derived
releases record) and a state folder (the audit log, the evidence set, the
previous-entry record for rollback), holding the old tool's migrated
history. Per installed copy, each patch is in one state: applied,
modified, unchecked-version (version matches no checked release),
not-installed, or refused (checksum matched neither before nor after).
Follow moves a release through staged, proven, switched and recorded, or
stops before the switch. Effect reads respected, rejected, or no log.
Every command ends in exit 0 (done, or check/notification confirming),
exit 1 (not ok, refused, failed or stopped), or exit 2 (usage error).
