# Plan — Review Magic Context 0.49.56 for every patch, install the patches, and run Magic Context fully enabled in OpenCode on this Mac

- Plan file (draft): `/Users/mavasbel/.opencode/plan/2026-11-15-20-44-magic-context-0.49.56.md`; Step 1.4 copies it
  byte-for-byte to
  `/Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches/worktrees/test-magic-context-0.49.56/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`
- Created: `2026-11-15-20-44` (local time, from `date +%Y-%m-%d-%H-%M`)
- Repository (`{repo}`): `/Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches`
- Worktree and branch (`{wt}`): `/Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches/worktrees/test-magic-context-0.49.56`
  (branch `test-magic-context-0.49.56`; `test` because, like commit `20099da`, the change adds reviewed releases
  and their fixture)
- Session record (`{record}`): `{wt}/docs/sessions/{session_id}.md`. `{session_id}` is the value of
  `echo $OPENCODE_SESSION_ID` in the executing session; the planning session was `ses_e1dc7d932ffe69P47CJLyPq6qR`
  (the `session-id` tool is not registered in this installation, so the variable is the source)
- Executed against (`{base}`): `main` at `20099da74e9a7a07af71d1fd64697d8822ee3d1d` (evidence:
  `git -C {repo} rev-parse main`, 2026-11-15 20:43 local)
- Plan SHA-256 at approval: a file cannot contain its own digest, so the digest is quoted in the approval
  question and written into `{record}` by Step 1.4. `build` runs `shasum -a 256` on the draft file before
  the first step and stops on any difference
- Baseline gate: recorded by Step 1.5 on the unchanged worktree, with every sub-gate's output, before any change

## Objective

**Why.**

1. The npm `latest` of `@cortexkit/opencode-magic-context` is `0.49.56`, published 2026-11-15T15:22:56.032Z
   (`npm view @cortexkit/opencode-magic-context dist-tags --json` → `{"latest":"0.49.56"}`; `… time --json`),
   integrity `sha512-hUfmVxV3pgVpndHsXHMcLv/rQxSGvsJzPyFFL5Yxf11ShZXuDwUq4Bdk1BaJf5+sZ1324RbWfs9TvO0946bEyw==`
   (`npm view @cortexkit/opencode-magic-context@0.49.56 dist.integrity`).
2. It is installed at
   `/Users/mavasbel/.cache/opencode/npm/@cortexkit/opencode-magic-context@latest/1794794531411/node_modules/@cortexkit/opencode-magic-context`
   (`{cache_copy}`), and `opencode-magic-context-patches status` reports all five patches as
   `unchecked-version` on it. The newest reviewed release in `{repo}/patches/` is 0.49.55 (commit `20099da`).
3. **Magic Context is not loaded by OpenCode on this Mac now.** `/Users/mavasbel/.config/opencode/opencode.jsonc`
   line 252 names
   `/Users/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.56/node_modules/@cortexkit/opencode-magic-context`,
   which does not exist (`ls` → `No such file or directory`).
   `/Users/mavasbel/.local/share/opencode/log/opencode.log` records at `2026-11-16T02:37:41.046Z`
   `level=WARN … message="failed to load plugin" target=/Users/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.56/… cause="…ENOENT…"`.
   The running service lists no Magic Context: `OpencodeLivePluginsAdapter.magicContext()` (read-only,
   `{repo}/src/infrastructure/adapters/outbound/opencode/OpencodeLivePluginsAdapter.ts`) returns
   `[{"directory":"/Users/mavasbel","source":null,"status":null}]`. `check --json` exits 1 with
   `configured but not installed yet`.
4. **Before that, Magic Context ran unpatched, and the configured threshold was rejected.**
   `/private/var/folders/_m/jyv5nmsn4y305mjjcm_4fq240000gn/T/opencode2/magic-context/magic-context.log`
   (`{mc_log}`) holds 7 lines of
   `"execute_threshold_percentage": invalid value (number 16), using default 65.`, the last at
   `2026-11-16T02:33:31.794Z`. `/Users/mavasbel/.config/cortexkit/magic-context.jsonc` line 56 sets
   `"execute_threshold_percentage": 16` and line 5 sets `"enabled": true`.
5. A read-only dry run of the repository's own matchers (`locate` from
   `{repo}/src/domain/services/MatcherRules.ts`, applied in `patches/index.ts` order, in memory) accepts all
   five patches on `{cache_copy}` with the current matcher code. The checksums it produced are in Step 3.2.

**What.**

1. `{repo}/patches/{execute-threshold-min,no-session-model-fallback,refusal-recovery,fold-identity-stable,fold-provenance-heal}.ts`
   each hold a reviewed release `0.49.56`, plus a comment entry for it.
2. `{repo}/tests/fixtures/magic-context-0.49.56/` holds the 9 unmodified tarball files the matchers read, a
   `NOTICE.md` and a reduced `package.json`.
3. `{repo}/tests/unit/domain/MatcherRules.test.ts` counts 16 fixtures, and `{repo}/tests/e2e/lifecycle.test.ts`
   runs on 0.49.56.
4. `{repo}/README.md` lists 0.49.56 under "Checked versions" for all five patches, and `{repo}/AGENTS.md` lists
   every fixture directory, including the 0.49.50, 0.49.55 and 0.49.56 entries it is missing today.
5. The evidence document `{repo}/docs/reference/{T}-magic-context-0.49.56-patches.md` exists, where `{T}` is
   the `date +%Y-%m-%d-%H-%M` value taken by Step 2.4.
6. `{repo}/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md` and `{repo}/docs/sessions/{session_id}.md`
   exist.
7. The work is committed on `test-magic-context-0.49.56` and integrated the way the user chooses in Step 4.3.
8. `/Users/mavasbel/.local/bin/opencode-magic-context-patches` is rebuilt from the reviewed tree.
9. **On this Mac, the five patches are installed and Magic Context is fully enabled in OpenCode:**
   - `opencode.jsonc` loads `"@cortexkit/opencode-magic-context@latest"`;
   - `check` exits 0, so every patch is `applied` on the loaded 0.49.56 copy;
   - the running OpenCode service lists Magic Context from `{cache_copy}` with status `active`;
   - OpenCode logs no `failed to load plugin` for it after the restart;
   - Magic Context logs no `invalid value (number 16)` after the restart;
   - `effect` reports zero rejections, and later reports the verdict `respected`.

**Out of scope.**

- Making the tool officially support macOS: the README "Linux only" line, `/proc`, systemd units and `follow`
  on Darwin.
- Running `follow` on this machine.
- Installing the watch units (`bun run install:watch`).
- Any change to matcher code, adapters or use cases, unless Stage 2 finds a meaning change. In that case the
  plan stops and returns to `plan`.
- Reviewing 0.49.51 to 0.49.54.
- Editing `/Users/mavasbel/.config/cortexkit/magic-context.jsonc`.
- Any `opencode.jsonc` line other than line 252.
- Pruning the stale worktree entry `/home/mavasbel/Dev/repos/opencode/perf/.cache/worktrees/12-f45fa827-1793831308869-84180`
  that `git worktree list` reports as `prunable`.

**Requirements checked before starting** (planning session, 2026-11-15 20:40–20:44 local):

| Requirement | Command | Result |
|---|---|---|
| clean tree on `main` at `{base}` | `git status --short`; `git rev-parse main HEAD` | empty; `20099da…` twice |
| remote | `git remote -v` | `origin https://github.com/mavasbel-devtools/opencode-magic-context-patches.git` |
| tools | `which bun npm node opencode jq gh shasum` | bun `1.4.4`, node `v26.13.1`, opencode `v2.3.0`, all present |
| platform | `uname -a` | `Darwin … 27.0.0 … arm64` |
| installed CLI | `opencode-magic-context-patches --version` | `0.2.0` |
| lockfile | `ls {repo}` | `bun.lock` present |
| service file | `jq 'keys' ~/.local/state/opencode/service.json` | `["id","password","pid","url","version"]` (values never printed) |

**Use cases in scope.** This plan adds data, not behaviour. The features and use cases already exist, and their
tests already exist. The tiers each one runs in:

| Feature | Use case id | Unit | e2e | Component / live |
|---|---|---|---|---|
| patch definitions | `uc-reviewed-release-0.49.56` (each patch derives exactly its reviewed release from the fixture) | `tests/unit/domain/MatcherRules.test.ts` "`{patch}` on 0.49.56: derives exactly the reviewed release" ×5; `tests/unit/patches/patches.test.ts` (recorded checksums on the real fixture files) | — | unchanged; run as the gate |
| apply / undo | `uc-apply-undo-0.49.56` (apply and undo every patch on a copy of the real 0.49.56 files) | — | `tests/e2e/lifecycle.test.ts` "the program on a copy of the real Magic Context 0.49.56" | unchanged; run as the gate |
| inspect | `uc-inspect-newest-checked` (an unknown version is compared with the newest reviewed one) | — | `tests/e2e/lifecycle.test.ts` "checked against 0.49.56" | unchanged |

The negative paths already exist: refused checksums, crafted unknown shapes and partial matches, in
`tests/unit/domain/MatcherRules.test.ts` "locate on crafted releases" and the e2e refusal tests. This plan
adds none.

**Open questions.**

1. *Will OpenCode keep the patched files in `{cache_copy}` across a restart?*
   - Known: the folder name `1794794531411` is a millisecond time (2026-11-16T02:02Z), and the folder was
     created at 20:02 local.
   - Inferred: OpenCode may reinstall `@latest` into a new numbered folder, which would hold unpatched files.
   - Unknown: whether it does that on every start.
   - Answered by: Step 5.6, gate 2 (the loaded root is still `{cache_copy}`) and gate 3 (`check` exits 0).
2. *What happens when 0.49.57 ships?*
   - Known: the entry is `@latest`, and the watch units do not run on macOS.
   - Inferred: OpenCode may then load an unpatched 0.49.57, and the threshold `16` would be rejected again
     with no notification.
   - Unknown: when 0.49.57 ships.
   - Answered by: nobody in this plan, because it is out of scope. It is reported to the user in Step 5.8.
3. *Do the sub-gates of `bun run check` pass on macOS?*
   - Known: `tests/live/live.test.ts` line 25 calls `systemctl --user`, which macOS lacks.
   - Unknown: the results of typecheck, lint, both coverage gates and the component tier on Darwin.
   - Answered by: Step 1.5. The user decided (2026-11-15): a failure present in the baseline is recorded as
     pre-existing and does not block. Only a failure new since the baseline blocks.
4. *Is the code around each site unchanged in meaning?*
   - Inferred unchanged: the dry run matched every shape, anchor and window.
   - Unknown until read: whether the surrounding code still means the same thing.
   - Answered by: Step 2.2.
5. *Is the installed copy the published tarball?*
   - Unknown.
   - Answered by: Step 2.1.

## Delegation map

| Step | Runs in | Why it can run there | Write set | Returns |
|---|---|---|---|---|
| 1.1 | subagent `general` | read-only git queries | none | command outputs |
| 1.2 | main session | creates the branch and worktree the whole plan writes into | `{repo}/worktrees/test-magic-context-0.49.56` | n/a |
| 1.3 | subagent `general` | locked install inside the worktree | `{wt}/node_modules` | install output, versions, status |
| 1.4 | main session | writes the plan copy and the session record, which is the launcher's own duty (AGENTS 4.1) | `{wt}/docs/plans/…`, `{record}` | n/a |
| 1.5 | main session | the baseline gate is never delegated (template N.0) | none (ignored `coverage/`) | n/a |
| 1.6 | main session | stage gate | none | n/a |
| 2.1 | subagent `general` | npm pack and comparisons in the temp folder | `{tmp}` only | integrity, diff result, sha256 table |
| 2.2 | subagent `general` | read-only code comparison | none | per-site verdict with lines |
| 2.3 | subagent `general` | web fetch | none | release text, URL, date, SHA-256 |
| 2.4 | subagent `general` | writes one document from 2.1–2.3 | `{wt}/docs/reference/{T}-…md` | path, `{T}`, lint output |
| 2.5 | main session | stage gate plus review of the delegated results | none | n/a |
| 3.1 | subagent `general` | copies files from `{tmp}` | `{wt}/tests/fixtures/magic-context-0.49.56/` | file list + sha256 |
| 3.2 | subagent `general` | five data edits | `{wt}/patches/*.ts` (five files) | diff |
| 3.3 | subagent `general` | two test edits; disjoint from 3.2 | two test files | diff |
| 3.4 | subagent `general` | two documentation edits; disjoint from 3.2 and 3.3 | `{wt}/README.md`, `{wt}/AGENTS.md` | diff + lint |
| 3.5 | main session | stage gate | none | n/a |
| 4.1 | main session | the final gate is never delegated | none | n/a |
| 4.2 | main session | commit, which is irreversible on a shared branch | git | n/a |
| 4.3 | main session | question to the user | git | n/a |
| 4.4 | subagent `general` | build and copy of the CLI | `/Users/mavasbel/.local/bin/opencode-magic-context-patches` | output + `--version` |
| 4.5 | main session | worktree removal, which is destructive | git | n/a |
| 5.1 | main session | `opencode.jsonc` may hold credentials (AGENTS 4.7, 5.3) | backup file | n/a |
| 5.2 | main session | same file | `opencode.jsonc` line 252 | n/a |
| 5.3 | subagent `general` | one checksum-guarded command, undoable with `undo` | 5 files under `{cache_copy}/dist` + backups + audit log | output |
| 5.4 | main session | question to the user (restart); this session may end | none | n/a |
| 5.5 | main session | restores from `{record}` after the restart | `{record}` | n/a |
| 5.6 | main session | verifies the live system, and reads `service.json`, which holds a password | none | n/a |
| 5.7 | main session | question to the user, then the gate | none | n/a |
| 5.8 | main session | final record and report | `{record}` (main checkout or branch, see 5.8) | n/a |

`{tmp}` is `/private/var/folders/_m/jyv5nmsn4y305mjjcm_4fq240000gn/T/opencode/mc-0.49.56`.

## Rules of execution

1. Stages run in order. A stage starts only when the previous stage gate is green.
2. Inside a stage, a step starts only when every step in its `depends on` is green.
3. Every step is delegated unless its `runs in` says `main session` with its reason, and every ready
   delegation is launched at once. 3.2, 3.3 and 3.4 start together once 3.1 is green; 2.1 and 2.3 start
   together.
4. A brief is a step: action, target, content, depends on, gates, problems, escalation, failure, returns, plus
   these boundaries:
   - it writes only its write set;
   - it never commits, pushes, releases or edits anything under `/Users/mavasbel/.config` or `{cache_copy}`
     unless the step says so;
   - it never prints a credential;
   - it reports gaps instead of filling them.
5. A gate is binary. Its output is pasted into `{record}` under the step id.
6. A failed gate goes to `problems`; when no row matches, `escalation` applies.
7. No gate output, no done.
8. Any change to this plan is made by the `plan` agent and approved again.
9. The step, stage and plan loops below run at every level, and two consecutive clean passes close a loop.
10. Run every command against `{wt}` with absolute paths, `git -C`, or the `workdir` of the shell tool.

## The loops

- **Step loop.**
  - Plan: review every field of each step against AGENTS 3.4, revalidate that each gate proves exactly that
    step, replan and repeat.
  - Build: execute, review the artifact against `target`, `content` and `returns`, re-run every gate, rebuild
    on any difference, and repeat until a full pass shows none.
- **Stage loop.**
  - Plan: review that the stage `what` is covered by its steps and by nothing else, and that the stage gate
    proves the whole `what`.
  - Build: after the last step, re-run the stage gate and reopen the step that should have produced any
    missing artifact.
- **Plan loop.**
  - Plan: review the inventory, the use-case table, the delegation map and the final gate against the request,
    which is "update this repo for patching Magic Context 0.49.56; the patch must be installed and Magic
    Context fully enabled for OpenCode".
  - Build: Step 4.1 and Step 5.8.

Each pass corrects only what it found. Never relax a gate, reorder a stage or widen scope.

## Stage 1 — Worktree, environment, record, baseline

**Why.** AGENTS 7.1 forbids work on `main`, and AGENTS 3.8 requires a baseline before the first change. On
macOS a failure may already exist (Open question 3).

**What.**

- `{wt}` on branch `test-magic-context-0.49.56` from `{base}`, with `{wt}/node_modules` installed;
- `{wt}/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`;
- `{record}`;
- the baseline output in `{record}`, section `Baseline gate`.

**Enter gate.** The user approved this plan by path and SHA-256 (`question` tool answer pasted in `{record}`
by Step 1.4).

### Step 1.1 — Confirm `main` is current

- **runs in**: `subagent general`
- **action**: `run`
- **target**: `{repo}`
- **content**: `git -C {repo} fetch origin`, then `git -C {repo} rev-parse main origin/main`, then
  `git -C {repo} status --porcelain`
- **depends on**: none
- **gates**:
  1. `git -C {repo} fetch origin` → exit 0
  2. `git -C {repo} rev-parse main origin/main` → both lines `20099da74e9a7a07af71d1fd64697d8822ee3d1d`
  3. `git -C {repo} status --porcelain` → empty
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `origin/main` ≠ `{base}` | someone pushed after planning | stop; return both SHAs; the plan goes back to `plan` (the patch files may already hold 0.49.56) |
  | `main` ahead of `origin/main` | unpushed local commits | stop; return `git log origin/main..main --oneline` |
  | `Could not resolve host` | no network | report blocked |

- **escalation**: the user, with both SHAs and `git log --oneline -5 origin/main`. Ask: "rebase this plan on
  the new main, or stop?"
- **failure**: nothing was written; there is nothing to undo.
- **returns**: the three outputs, verbatim.
- **evidence**: `{record}`, section `1.1`.

### Step 1.2 — Create the worktree

- **runs in**: `main session` — it creates the write location of every later step; it takes one command
- **action**: `run`
- **target**: `{repo}/worktrees/test-magic-context-0.49.56`
- **content**: `git -C {repo} worktree add -b test-magic-context-0.49.56 {repo}/worktrees/test-magic-context-0.49.56 main`
  (`worktrees/` is already ignored: `{repo}/.gitignore` line `/worktrees/`)
- **depends on**: 1.1
- **gates**:
  1. the command → exit 0
  2. `git -C {wt} rev-parse HEAD` → `20099da74e9a7a07af71d1fd64697d8822ee3d1d`
  3. `git -C {wt} branch --show-current` → `test-magic-context-0.49.56`
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `a branch named … already exists` | an earlier attempt | stop; return `git -C {repo} log -1 test-magic-context-0.49.56`; never delete it without the user |
  | `already exists` (path) | leftover directory | same as above |

- **escalation**: the user: "a branch or worktree `test-magic-context-0.49.56` already exists at `<sha>`;
  reuse it, or remove it and start again?"
- **failure**: no worktree; undo with `git -C {repo} worktree remove {wt}` and
  `git -C {repo} branch -d test-magic-context-0.49.56`.
- **returns**: n/a
- **evidence**: `{record}`, section `1.2` (written in 1.4).

### Step 1.3 — Prepare the environment

- **runs in**: `subagent general`
- **action**: `run`
- **target**: `{wt}`
- **content**: The project declares no `bootstrap`, `install`, `setup` or `deps` script: `package.json` scripts
  are `test*`, `coverage*`, `typecheck`, `lint:docs`, `check`, `build`, `install:cli`, `install:watch` and
  their uninstall counterparts. So run the locked command for `bun.lock`. First run `bun install --help` and
  confirm that `--frozen-lockfile` is listed, then run `bun install --frozen-lockfile` in `{wt}`.
- **depends on**: 1.2
- **gates**:
  1. `bun install --help | grep -c -- --frozen-lockfile` → ≥ 1
  2. `bun install --frozen-lockfile` (workdir `{wt}`) → exit 0
  3. `bun --version` → `1.4.4`
  4. `git -C {wt} status --porcelain` → empty
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `lockfile had changes, but lockfile is frozen` | `bun.lock` and `package.json` drifted | report; never drop the flag |
  | network error | offline | report blocked |
  | status lists `node_modules/` | ignore rule missing | impossible today (`/node_modules/` is in `.gitignore`); stop and report |

- **escalation**: the launcher, with the full output.
- **failure**: no later step can run; undo by deleting `{wt}/node_modules`.
- **returns**: the four outputs.
- **evidence**: `{record}`, section `Environment`.

**Environment files (AGENTS 7.8): exempt.**

- Evidence: `ls -a {repo}` shows no `.env*` file, and no `.env.example` is tracked. The program reads only
  the user's home, through `{repo}/src/main/paths.ts` lines 49–80.
- `tests/live` uses the caller's real home by design. No file is copied, so no copy gate applies.

### Step 1.4 — Copy the plan and open the session record

- **runs in**: `main session` — the plan copy and the session record are the launcher's own duty (AGENTS 4.1)
- **action**: `create`
- **target**: `{record}`, and `{wt}/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`
- **content**:
  1. `cp /Users/mavasbel/.opencode/plan/2026-11-15-20-44-magic-context-0.49.56.md {wt}/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`
  2. `{record}` with:
     - the title `# Session {session_id}`;
     - the line `Plan: /Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`;
     - the planning session id `ses_e1dc7d932ffe69P47CJLyPq6qR`, with the planning evidence summarised from
       the Objective's "Why";
     - the approved SHA-256 and the user's approval answer;
     - one `[ ]` item per step id 1.1 … 5.8, with 1.1 to 1.3 marked `[x]` with their outputs.
- **depends on**: 1.3
- **gates**:
  1. `shasum -a 256 /Users/mavasbel/.opencode/plan/2026-11-15-20-44-magic-context-0.49.56.md` → the approved
     digest
  2. `cmp -s` of the draft and the copy → exit 0
  3. `grep -c '^- \[[ x]\] ' {record}` → equals the number of step ids in this plan, which is 29 (1.1–1.6, 2.1–2.5,
     3.1–3.5, 4.1–4.5, 5.1–5.8)
  4. `bun run lint:docs` (workdir `{wt}`) → exit 0. The plan writes every repository path in absolute form,
     and the linter's path rule (`scripts/lint-docs.mjs` line 31: the negative lookbehind `(?<![\w./-])`)
     ignores absolute paths.
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | gate 1 differs | the draft changed after approval | stop; it goes back to `plan` for approval again |
  | lint names a path in the plan or the record | a relative path that does not exist yet | rewrite it as an absolute path in `{record}`; for the plan, back to `plan` |

- **escalation**: the user, with both digests.
- **failure**: delete both files.
- **returns**: n/a
- **evidence**: `{record}`, section `1.4`.

### Step 1.5 — Record the baseline gate

- **runs in**: `main session` — the baseline is never delegated
- **action**: `run`
- **target**: `{wt}`
- **content**: run each sub-gate of `bun run check` separately. The script chains them with `&&`, so one
  early failure would hide the later ones. Run, in `{wt}`:
  1. `bun run typecheck`
  2. `bun run lint:docs`
  3. `bun run coverage:unit`
  4. `bun run coverage:e2e`
  5. `bun run test:component`
  6. `bun run test:live`

  Record each one's exit status, its final summary lines (pass/fail counts) and the identifiers of every
  failing test.
- **depends on**: 1.4
- **gates**:
  1. each of the six commands has run to completion, and its exit status and summary are pasted in `{record}`,
     section `Baseline gate`
  2. `git -C {wt} status --porcelain` → only `docs/plans/2026-11-15-20-44-magic-context-0.49.56.md` and
     `docs/sessions/{session_id}.md`
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `test:live` fails on `systemctl` | macOS has no systemd | pre-existing (user decision, 2026-11-15); record the failing test ids |
  | a coverage, component or typecheck failure | Darwin or OpenCode 2.3.0 differences | pre-existing; record it; never repair it in this plan |
  | `test:live` hangs past 180 s per test | network or registry | record the timeout as pre-existing, with the output |

- **escalation**: the user, only when `typecheck` or `lint:docs` fails. Then Stage 4 cannot prove anything.
  Ask: "continue with a baseline that fails `<gate>`, or stop?"
- **failure**: nothing was changed; the plan stops before any change.
- **returns**: n/a
- **evidence**: `{record}`, section `Baseline gate`.

### Step 1.6 — Stage 1 gate

- **runs in**: `main session` — stage gate
- **action**: `run`
- **target**: `{wt}`
- **content**: `git -C {wt} rev-parse HEAD`; `test -d {wt}/node_modules`; `grep -c '^## Baseline gate' {record}`
- **depends on**: 1.1–1.5
- **gates**:
  1. `git -C {wt} rev-parse HEAD` → `20099da74e9a7a07af71d1fd64697d8822ee3d1d`
  2. `test -d {wt}/node_modules` → exit 0
  3. `grep -c '^## Baseline gate' {record}` → `1`
- **problems**: any red gate reopens its step.
- **escalation**: as in the failing step.
- **failure**: Stage 2 does not start.
- **returns**: n/a
- **evidence**: `{record}`, section `Stage 1 gate`.

## Stage 2 — Evidence for 0.49.56

**Why.** `{repo}/AGENTS.md`, "Adding a version to a patch", items 1 and 2:

- the installed copy must be the published tarball;
- every snippet must be read;
- if the meaning around a replacement changed, stop.

**What.**

- `{tmp}/package/` (the unpacked tarball; scratch);
- `{wt}/docs/reference/{T}-magic-context-0.49.56-patches.md`.

**Enter gate.** Stage 1 gate green.

### Step 2.1 — Fetch the tarball and prove the installed copy

- **runs in**: `subagent general`
- **action**: `run`
- **target**: `{tmp}`
- **content**:

  ```sh
  mkdir -p /private/var/folders/_m/jyv5nmsn4y305mjjcm_4fq240000gn/T/opencode/mc-0.49.56
  cd /private/var/folders/_m/jyv5nmsn4y305mjjcm_4fq240000gn/T/opencode/mc-0.49.56
  npm pack @cortexkit/opencode-magic-context@0.49.56 --json > pack.json
  tar -xzf cortexkit-opencode-magic-context-0.49.56.tgz
  jq -r '.[0].integrity' pack.json
  diff -r package /Users/mavasbel/.cache/opencode/npm/@cortexkit/opencode-magic-context@latest/1794794531411/node_modules/@cortexkit/opencode-magic-context
  cd package && shasum -a 256 dist/context-bejy30t5.js dist/index-3jeq08jv.js dist/index-6athgjba.js dist/index-6nqz8hsz.js dist/index-ffab4edg.js dist/v2/context-5hhm89jw.js dist/v2/server-rthnpmbp.js dist/v2/server-rz6g5xne.js dist/v2/server-z6sxv6n3.js
  ```

- **depends on**: Stage 1 gate
- **gates**:
  1. `jq -r '.[0].integrity' pack.json` →
     `sha512-hUfmVxV3pgVpndHsXHMcLv/rQxSGvsJzPyFFL5Yxf11ShZXuDwUq4Bdk1BaJf5+sZ1324RbWfs9TvO0946bEyw==`, equal
     to `npm view @cortexkit/opencode-magic-context@0.49.56 dist.integrity`
  2. `diff -r` → no line except entries that only the installed copy holds. Those are printed as
     `Only in /Users/…/opencode-magic-context: <name>`, and every such name is listed in the return. Any
     `differ` line or `Only in package` line fails the gate.
  3. the sha256 of each of the 9 files equals the `before` value of its file in Step 3.2:
     - `dist/index-6nqz8hsz.js` → `91114903a8d9ca16451912dd2acbf320f1964330ceb3023ee70e033a8087c662`
     - `dist/v2/server-rz6g5xne.js` → `87b0c1c43f6aa7213d5305c44e0d8f62715cf9bda805c1304f7cf2f3b3b23b39`
     - `dist/index-3jeq08jv.js` → `eaca74f957bbe59e59cae48c493b1506ad8329058bcbd1c0c188c32d1c97cff5`
     - `dist/v2/server-z6sxv6n3.js` → `155820316096da9931c9a8c3903fffbeae0c5c2df1cc57a91aba279d636956db`
     - `dist/context-bejy30t5.js` → `ff2d872b77a5dcae25a03c3687db9ba6fcf9583e12401774c058416dd8e6fd78`
     - `dist/index-ffab4edg.js` → `482bc248f08d35964ded3d8da0bd6d426198b7a7411c45ea0a73d668396ce077`
     - `dist/v2/context-5hhm89jw.js` → `a2a4de5308c8651a0cbb63512ae9793cd469886c54a5f1dc35ea21930af78ac5`
     - `dist/index-6athgjba.js` → `79892e328d90c35497ea336349e8d9dcc2b3b3497dc781ad98c429b04723c862`
     - `dist/v2/server-rthnpmbp.js` → `a4b67c81aa8c1a67dfd1c9899464c3aabc3ae8b838d2c630e7cde5037a3f0191`
  4. `cmp -s` of `package/dist/index-6nqz8hsz.js`, `package/dist/v2/server-rz6g5xne.js`,
     `package/dist/index-6athgjba.js` and `package/dist/v2/server-rthnpmbp.js` against the same names under
     `{repo}/tests/fixtures/magic-context-0.49.55/dist/` → exit 0 for all four
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | integrity differs | wrong version or a registry problem | stop; report both values |
  | `diff -r` reports `differ` | the installed copy was modified (for example, patched) | stop; return the list; nothing is applied to a copy that is not the tarball |
  | gate 3 differs | the dry run read something other than the tarball | stop; the checksums in 3.2 go back to `plan` |
  | `Only in …installed…` names files such as `node_modules/` or `.package-lock.json` | files the installer creates | list them; they do not fail gate 2 |

- **escalation**: the user, with the failing output: "the installed 0.49.56 is not byte-identical to the
  tarball; reinstall it with OpenCode, or stop?"
- **failure**: Stage 2 stops; delete `{tmp}`.
- **returns**: the integrity value, the full `diff -r` output, the 9-line sha256 table, the 4 `cmp` exit codes.
- **evidence**: `{record}`, section `2.1`.

### Step 2.2 — Review the meaning around every site against 0.49.55

- **runs in**: `subagent general`
- **action**: `review`
- **target**: `{tmp}/package/dist/`, compared with `{repo}/tests/fixtures/magic-context-0.49.55/dist/`
- **content**: Run `/Users/mavasbel/.local/bin/opencode-magic-context-patches inspect --version 0.49.56`
  (read-only) and record every snippet. Then, for each pair below, compare the named functions or blocks
  (old file → new file) by extracting the function body text and comparing it as a string, and report
  "identical", or the diff:
  1. no-session-model-fallback, `dist/index-xj5bap1r.js` → `dist/index-3jeq08jv.js` and
     `dist/v2/server-96g41nad.js` → `dist/v2/server-z6sxv6n3.js`: `runFallbackHistorianPass`, including the
     `for (const candidateInput of [...])` loop.
  2. refusal-recovery, `dist/index-9n6mdfqy.js` → `dist/index-ffab4edg.js` and `dist/v2/context-13er940g.js` →
     `dist/v2/context-5hhm89jw.js`:
     - `recordUsageRefusal`;
     - `shouldResetRefusedUsage`;
     - the function holding `HISTORIAN_INLINE_JOIN_BUDGET_MS` and the `return Math.max(0, Math.min(…))`;
     - the block holding `This may take up to`;
     - `afterCapture`;
     - the `timedTransform` catch, from `deps.onPassPermission?.(sessionId, postTransformResult.prefixMutationPermitted)`
       to `throw error;`;
     - the `EMERGENCY: fail-closed (reason=` block;
     - `const loadedSessions = new Set;`, with its enclosing function name and line;
     - `const isFirstTransformPassForSession = !loadedSessions.has(sessionId);` with
       `loadedSessions.add(sessionId);`;
     - the count of `loadedSessions.delete(`, which must be 0.

     Measure the thrown-refusal distance, `{THROWN_DISTANCE_0_49_56}`: the offset of the `THROWN_0_49_37` find
     text minus the `lastIndexOf` of the anchor
     `deps.onPassPermission?.(sessionId, postTransformResult.prefixMutationPermitted)` before it, in both
     files.
  3. refusal-recovery TOAST and fold-provenance-heal, `dist/context-vx5gw5h2.js` → `dist/context-bejy30t5.js`
     and `dist/v2/context-13er940g.js` → `dist/v2/context-5hhm89jw.js`: the `if (!compactionOff) { if
     (managedError instanceof …` block; the fold admission guard method containing
     `replay refused: invalid checkpoint floor or provenance`; `encodeAdmissionV3`; `this.admissions.set(`;
     `this.admissionKey(`. The fold-provenance-heal replacement calls the last three, so each must still exist
     with the same signature.
  4. execute-threshold-min and fold-identity-stable: byte-identical files (2.1 gate 4); state "identical by
     cmp".
- **depends on**: 2.1
- **gates**:
  1. the return holds one row per item above, each with old line, new line and verdict (`identical` or a diff)
  2. every verdict is `identical`, or a diff that the subagent shows touches no name or value the replacement
     uses, with the quoted lines as proof
  3. `{THROWN_DISTANCE_0_49_56}` ≤ 600 in both files (the site window, `patches/refusal-recovery.ts`, the
     `thrown refusal` site)
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | a function changed in a way the replacement depends on | upstream changed behaviour | stop the plan; it goes back to `plan` with the diff (AGENTS "Adding a version", item 2: re-do the analysis) |
  | a function is not found by name | renamed by the bundler | search by a distinctive string from the 0.49.55 body; report the new name |

- **escalation**: the user, with the diff: "0.49.56 changed `<function>`; re-analyse the patch (new plan), or
  stop?"
- **failure**: nothing was written.
- **returns**: the table (item, files, old line, new line, verdict, quoted diff when not identical),
  `{THROWN_DISTANCE_0_49_56}` for both files, and the full `inspect` output.
- **evidence**: `{record}`, section `2.2`.

### Step 2.3 — Read the upstream release notes

- **runs in**: `subagent general`
- **action**: `read`
- **target**: https://github.com/cortexkit/magic-context/releases/tag/v0.49.56
- **content**: fetch the page. Learn:
  - every listed change;
  - whether it states that a database migration is needed.

  Record the URL, the fetch time (`date -u +%Y-%m-%dT%H:%M:%SZ`) and the SHA-256 of the fetched body
  (`shasum -a 256`).
- **depends on**: Stage 1 gate
- **gates**:
  1. HTTP 200 and the body names `0.49.56` → pass
  2. the return holds the URL, the time and the SHA-256
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | 404 | no GitHub release for the tag | try https://github.com/cortexkit/magic-context/compare/v0.49.55...v0.49.56; if that also fails, record "no release notes" with both HTTP statuses |

- **escalation**: none needed; absence is recorded as a fact.
- **failure**: 2.4 records "release notes not available" with the evidence.
- **returns**: the change list verbatim, the migration statement, the URL, the time and the SHA-256.
- **evidence**: `{record}`, section `2.3`.

### Step 2.4 — Write the evidence document

- **runs in**: `subagent general`
- **action**: `create`
- **target**: `{wt}/docs/reference/{T}-magic-context-0.49.56-patches.md`, where `{T}` is
  `date +%Y-%m-%d-%H-%M` taken when the step starts
- **content**: a Markdown document in the form of
  `{repo}/docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md`, titled
  `# Magic Context 0.49.56: the patches`, with these sections. Fill them only from the returns of 2.1, 2.2 and
  2.3, and from the Objective's "Why" items 3 and 4.
  1. `## Package`:
     - the name, tarball, integrity and publish time;
     - the `npm pack` command;
     - the `diff -r` result against `{cache_copy}`.
  2. `## Files`: a table with one row per patch, giving the 0.49.55 file → the 0.49.56 file, and whether each is
     byte-identical.
  3. `## Meaning unchanged`: the 2.2 table, with line numbers in the 0.49.56 files, `afterCapture`,
     `loadedSessions` and `{THROWN_DISTANCE_0_49_56}`.
  4. `## Matcher`: the current matcher code accepts 0.49.56 unchanged; no site, shape, anchor or window
     changed.
  5. `## Checksums`: the table of Step 3.2, with columns `Patch | File | before | after`, and the sentence that
     the two fold-provenance-heal `before` values are refusal-recovery's `after` values.
  6. `## Releases`: the 2.3 result, with its URL and SHA-256.
  7. `## This machine`:
     - the macOS state found on 2026-11-15: the missing managed folder, the ENOENT log line and the 7
       `invalid value (number 16)` lines;
     - the user's decision to load `@latest` and run `apply` on `{cache_copy}`.

  Every repository path is written as `tests/…`, `docs/…` or `patches/…` only when it exists by the time
  Stage 3 is done; otherwise it is written as an absolute path.
- **depends on**: 2.1, 2.2, 2.3
- **gates**:
  1. `test -f {wt}/docs/reference/{T}-magic-context-0.49.56-patches.md` → exit 0
  2. `grep -c '^## ' <file>` → `7`
  3. `bun run lint:docs` (workdir `{wt}`) → exit 0, or the only failures are references to
     `tests/fixtures/magic-context-0.49.56/…`, which Step 3.1 creates. Those references are re-checked by
     Step 3.5.
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | lint fails on a path other than the 0.49.56 fixture | a typo or a missing file | fix the path |
  | lint fails on the file name | a wrong `{T}` format | rename using `date +%Y-%m-%d-%H-%M` |

- **escalation**: the launcher, with the lint output.
- **failure**: delete the file.
- **returns**: the path, `{T}` and the lint output.
- **evidence**: `{record}`, section `2.4`.

### Step 2.5 — Stage 2 gate

- **runs in**: `main session` — stage gate, and review of the delegated results (AGENTS 4.6)
- **action**: `review`
- **target**: the returns of 2.1–2.4
- **content**:
  - re-run 2.1 gates 1 and 3 from the main session;
  - read the document produced by 2.4 against the 2.2 table.
- **depends on**: 2.1–2.4
- **gates**:
  1. 2.1 gate 1 and gate 3 → re-run green
  2. every 2.2 verdict permits the patches
  3. the document's checksum table equals Step 3.2, value for value
- **problems**: any difference reopens the step that produced it.
- **escalation**: the user, if 2.2 found a meaning change.
- **failure**: Stage 3 does not start.
- **returns**: n/a
- **evidence**: `{record}`, section `Stage 2 gate`.

## Stage 3 — The reviewed release

**Why.** The repository's tests turn a reviewed release into proof:

- `tests/unit/domain/MatcherRules.test.ts` derives each release from its fixture;
- `tests/unit/patches/patches.test.ts` checks the recorded checksums on the fixture files;
- `tests/e2e/lifecycle.test.ts` applies and undoes every patch on a copy of the fixture.

**What.**

- the fixture;
- the five patch files edited;
- the two test files edited;
- `README.md` and `AGENTS.md` edited.

**Enter gate.** Stage 2 gate green.

### Step 3.1 — Add the fixture

- **runs in**: `subagent general`
- **action**: `create`
- **target**: `{wt}/tests/fixtures/magic-context-0.49.56/`
- **content**:
  1. Copy these files from `{tmp}/package/` to the same relative paths under the target:
     - `dist/context-bejy30t5.js`
     - `dist/index-3jeq08jv.js`
     - `dist/index-6athgjba.js`
     - `dist/index-6nqz8hsz.js`
     - `dist/index-ffab4edg.js`
     - `dist/v2/context-5hhm89jw.js`
     - `dist/v2/server-rthnpmbp.js`
     - `dist/v2/server-rz6g5xne.js`
     - `dist/v2/server-z6sxv6n3.js`
  2. `package.json`, exactly:

     ```json
     {
       "name": "@cortexkit/opencode-magic-context",
       "version": "0.49.56",
       "license": "MIT"
     }
     ```

  3. `NOTICE.md`, exactly:

     ```markdown
     # Magic Context 0.49.56 test fixture

     The JavaScript files under `dist/` are unmodified copies of the files of the same paths in the
     published npm package `@cortexkit/opencode-magic-context@0.49.56`
     (`cortexkit-opencode-magic-context-0.49.56.tgz`, integrity
     `sha512-hUfmVxV3pgVpndHsXHMcLv/rQxSGvsJzPyFFL5Yxf11ShZXuDwUq4Bdk1BaJf5+sZ1324RbWfs9TvO0946bEyw==`),
     obtained with `npm pack @cortexkit/opencode-magic-context@0.49.56`.

     Only the files the patch matchers read are kept: `dist/context-bejy30t5.js`, `dist/index-3jeq08jv.js`,
     `dist/index-6athgjba.js`, `dist/index-6nqz8hsz.js`, `dist/index-ffab4edg.js`,
     `dist/v2/context-5hhm89jw.js`, `dist/v2/server-rthnpmbp.js`, `dist/v2/server-rz6g5xne.js` and
     `dist/v2/server-z6sxv6n3.js`.
     ```

- **depends on**: Stage 2 gate
- **gates**:
  1. `find {wt}/tests/fixtures/magic-context-0.49.56 -type f | wc -l` → `11`
  2. `cmp -s` of each of the 9 files against `{tmp}/package/<same path>` → exit 0 for all 9
  3. `jq -c . {wt}/tests/fixtures/magic-context-0.49.56/package.json` →
     `{"name":"@cortexkit/opencode-magic-context","version":"0.49.56","license":"MIT"}`
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `cmp` non-zero | copied from `{cache_copy}` instead of `{tmp}` | re-copy from `{tmp}/package` |

- **escalation**: the launcher.
- **failure**: `rm -r {wt}/tests/fixtures/magic-context-0.49.56`.
- **returns**: `find` listing with `shasum -a 256` of the 9 files.
- **evidence**: `{record}`, section `3.1`.

### Step 3.2 — Add release 0.49.56 to the five patches

- **runs in**: `subagent general`
- **action**: `edit`
- **target**: `{wt}/patches/execute-threshold-min.ts`, `{wt}/patches/no-session-model-fallback.ts`,
  `{wt}/patches/refusal-recovery.ts`, `{wt}/patches/fold-identity-stable.ts`,
  `{wt}/patches/fold-provenance-heal.ts`. These are one logical change: the checksums of `fold-provenance-heal`
  depend on `refusal-recovery`.
- **content**: the checksums below come from the planning dry run. Step 2.1 gate 3 proves every `before`
  against the tarball. `{T}` comes from 2.4, and `{THROWN_DISTANCE_0_49_56}` comes from 2.2.
  1. `execute-threshold-min.ts`
     - Comment: after line 53
       (` * 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.`), insert:

       ```
        *
        * 0.49.56 (sha512-hUfmVxV3…46bEyw==): the same two files, byte-identical to 0.49.55's; text, counts and
        * anchors unchanged. Evidence: docs/reference/{T}-magic-context-0.49.56-patches.md.
       ```

     - Release: append as the last element of `releases`, after the `0.49.55` object:

       ```ts
           {
             version: "0.49.56",
             files: [
               {
                 path: "dist/index-6nqz8hsz.js",
                 before: "91114903a8d9ca16451912dd2acbf320f1964330ceb3023ee70e033a8087c662",
                 after: "ef088a4a9f5be12e1ef4926607605f4550b7336ab4399ab9c7ca09267389c104",
                 replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
               },
               {
                 path: "dist/v2/server-rz6g5xne.js",
                 before: "87b0c1c43f6aa7213d5305c44e0d8f62715cf9bda805c1304f7cf2f3b3b23b39",
                 after: "b36ea6de8ff6ec6fda9211eec126ac0495ee6425d8c728529af34e817d0c3e20",
                 replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
               },
             ],
           },
       ```

  2. `no-session-model-fallback.ts`
     - Comment: after line 38
       (` * 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.`), insert:

       ```
        *
        * 0.49.56 (sha512-hUfmVxV3…46bEyw==): `dist/index-3jeq08jv.js`, `dist/v2/server-z6sxv6n3.js`; texts, counts
        * and anchors as in 0.49.55. Evidence: docs/reference/{T}-magic-context-0.49.56-patches.md.
       ```

     - Release, after the `0.49.55` object:

       ```ts
           {
             version: "0.49.56",
             files: [
               {
                 path: "dist/index-3jeq08jv.js",
                 before: "eaca74f957bbe59e59cae48c493b1506ad8329058bcbd1c0c188c32d1c97cff5",
                 after: "22023f7130c259ea9ed4ce8275c9488685248055d9a2d75fcfc8b8090d6e7516",
                 replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
               },
               {
                 path: "dist/v2/server-z6sxv6n3.js",
                 before: "155820316096da9931c9a8c3903fffbeae0c5c2df1cc57a91aba279d636956db",
                 after: "9b7741416c9900f998fb86d1ceb8f3510541b6c2480962eea04bc20a7ca4a544",
                 replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
               },
             ],
           },
       ```

  3. `refusal-recovery.ts`
     - Comment: after line 48
       (` * otherwise as in 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.`),
       insert:

       ```
        *
        * 0.49.56 (sha512-hUfmVxV3…46bEyw==): `dist/context-bejy30t5.js`, `dist/index-ffab4edg.js`,
        * `dist/v2/context-5hhm89jw.js`; the five texts, counts and anchors as in 0.49.55, the thrown refusal
        * {THROWN_DISTANCE_0_49_56} characters after its anchor. Evidence: docs/reference/{T}-magic-context-0.49.56-patches.md.
       ```

     - Matcher comment, line 113:
       `  // other distance is unchanged through 0.49.55; from 0.49.53 the anchor has no trailing semicolon.` →
       `  // other distance is unchanged through 0.49.56; from 0.49.53 the anchor has no trailing semicolon.`
     - Release, after the `0.49.55` object:

       ```ts
           {
             version: "0.49.56",
             files: [
               {
                 path: "dist/context-bejy30t5.js",
                 before: "ff2d872b77a5dcae25a03c3687db9ba6fcf9583e12401774c058416dd8e6fd78",
                 after: "e91ed897e2b253ca8694d31ee24fc3503931c00886efb39a1a0c0ffbdd51b2eb",
                 replacements: [TOAST],
               },
               {
                 path: "dist/index-ffab4edg.js",
                 before: "482bc248f08d35964ded3d8da0bd6d426198b7a7411c45ea0a73d668396ce077",
                 after: "4f6a461a25f53266610b3459239e59b5a11c2a7c38256cdcc7cb36574fbf99d7",
                 replacements: TRANSFORM_0_49_37,
               },
               {
                 path: "dist/v2/context-5hhm89jw.js",
                 before: "a2a4de5308c8651a0cbb63512ae9793cd469886c54a5f1dc35ea21930af78ac5",
                 after: "a31e6efde4dc09a8338c734ea1b499cb452f9c921db886801f3f35f3efa3b1dd",
                 replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
               },
             ],
           },
       ```

  4. `fold-identity-stable.ts`
     - Comment: after line 25, which ends `…docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.`,
       insert:

       ```
        *
        * 0.49.56 (sha512-hUfmVxV3…46bEyw==): the same two files, byte-identical to 0.49.55's; texts, counts and
        * anchors unchanged. Evidence: docs/reference/{T}-magic-context-0.49.56-patches.md.
       ```

     - Release, after the `0.49.55` object:

       ```ts
           {
             version: "0.49.56",
             files: [
               {
                 path: "dist/index-6athgjba.js",
                 before: "79892e328d90c35497ea336349e8d9dcc2b3b3497dc781ad98c429b04723c862",
                 after: "75b468fa07b52a0f62f3cb5ee7bbb00f825671528dfae1e19f907761329a45fd",
                 replacements: [{ find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 }, { find: POOL, replace: POOL_FIXED, count: 1 }],
               },
               {
                 path: "dist/v2/server-rthnpmbp.js",
                 before: "a4b67c81aa8c1a67dfd1c9899464c3aabc3ae8b838d2c630e7cde5037a3f0191",
                 after: "0682ee82b87c84b6116fcdc074f51325b2ca27fc2d17904fa7ebc3fa417ad8c2",
                 replacements: [{ find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 }, { find: POOL, replace: POOL_FIXED, count: 1 }],
               },
             ],
           },
       ```

  5. `fold-provenance-heal.ts`
     - Comment: after line 21, which ends `…docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.`,
       insert:

       ```
        *
        * 0.49.56 (sha512-hUfmVxV3…46bEyw==): `dist/context-bejy30t5.js` and `dist/v2/context-5hhm89jw.js`;
        * `refusal-recovery` changes both first, so `before` is that patch's `after`. Evidence:
        * docs/reference/{T}-magic-context-0.49.56-patches.md.
       ```

     - Release, after the `0.49.55` object:

       ```ts
           {
             version: "0.49.56",
             files: [
               {
                 path: "dist/context-bejy30t5.js",
                 before: "e91ed897e2b253ca8694d31ee24fc3503931c00886efb39a1a0c0ffbdd51b2eb",
                 after: "09482698aa35629b00c356a0c49c2ba7c082b50bf1738a31709e3744ba0f8eda",
                 replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
               },
               {
                 path: "dist/v2/context-5hhm89jw.js",
                 before: "a31e6efde4dc09a8338c734ea1b499cb452f9c921db886801f3f35f3efa3b1dd",
                 after: "d27c56b1bdcfe2100aa9f95bf7e9513e1a8a93189908983519440a71741dec8f",
                 replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
               },
             ],
           },
       ```

- **depends on**: 3.1
- **gates**:
  1. `grep -c 'version: "0.49.56"' {wt}/patches/*.ts` → `1` for each of the five files
  2. `bun test tests/unit/domain/MatcherRules.test.ts -t "on 0.49.56"` (workdir `{wt}`) → 5 pass, 0 fail
     (requires 3.3 for the fixture count test only; this filter excludes that test)
  3. `bun test tests/unit/patches` (workdir `{wt}`) → 0 fail
  4. `bun run typecheck` (workdir `{wt}`) → exit 0
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | MatcherRules `toEqual` fails on `after` | a checksum mistyped | recompute from `{tmp}` by applying the replacements; never copy from a failing test message without recomputing |
  | fold-provenance-heal `before` mismatch | refusal-recovery's `after` wrong | fix refusal-recovery first |
  | `bun test -t` matches 0 tests | test title format differs | run the whole file; read the 0.49.56 rows |

- **escalation**: the launcher, with the failing assertion.
- **failure**: `git -C {wt} checkout -- patches/`.
- **returns**: `git -C {wt} diff -- patches/` and the outputs of gates 2–4.
- **evidence**: `{record}`, section `3.2`.

### Step 3.3 — Update the two tests

- **runs in**: `subagent general`
- **action**: `edit`
- **target**: `{wt}/tests/unit/domain/MatcherRules.test.ts`, `{wt}/tests/e2e/lifecycle.test.ts`
- **content**:
  1. `MatcherRules.test.ts`:
     - `  it("covers all fifteen fixtures", () => {` → `  it("covers all sixteen fixtures", () => {`
     - `    expect(VERSIONS.length).toBe(15)` → `    expect(VERSIONS.length).toBe(16)`
  2. `lifecycle.test.ts` line 31: `"0.49.50", "0.49.55"]) {` → `"0.49.50", "0.49.55", "0.49.56"]) {`
  3. `lifecycle.test.ts` line 162: `'execute-threshold-min (checked against 0.49.55): "min(20).max(90"',` →
     `'execute-threshold-min (checked against 0.49.56): "min(20).max(90"',`
- **depends on**: 3.1
- **gates**:
  1. `grep -c 'toBe(16)' {wt}/tests/unit/domain/MatcherRules.test.ts` → `1`
  2. `grep -c '"0.49.56"' {wt}/tests/e2e/lifecycle.test.ts` → `1`, and
     `grep -c 'checked against 0.49.56' {wt}/tests/e2e/lifecycle.test.ts` → `1`
- **problems**: an anchor is not found → the file changed since planning; stop and return the line.
- **escalation**: the launcher.
- **failure**: `git -C {wt} checkout -- tests/unit/domain/MatcherRules.test.ts tests/e2e/lifecycle.test.ts`.
- **returns**: the diff.
- **evidence**: `{record}`, section `3.3`.

### Step 3.4 — Update README and AGENTS

- **runs in**: `subagent general`
- **action**: `edit`
- **target**: `{wt}/README.md`, `{wt}/AGENTS.md`
- **content**:
  1. `README.md`: replace every `0.49.55 |` with `0.49.55, 0.49.56 |`. There are exactly 5 occurrences, the
     last cell of each patch row (lines 30–34). The evidence column does not change, as in commit `20099da`,
     which added a document only where the analysis changed.
  2. `AGENTS.md`, in the fixture sentence: replace
     ``…`tests/fixtures/magic-context-0.49.42/` and `tests/fixtures/magic-context-0.49.43/` hold…`` with
     ``…`tests/fixtures/magic-context-0.49.42/`, `tests/fixtures/magic-context-0.49.43/`, `tests/fixtures/magic-context-0.49.50/`, `tests/fixtures/magic-context-0.49.55/` and `tests/fixtures/magic-context-0.49.56/` hold…``
- **depends on**: 3.1
- **gates**:
  1. `grep -o '0\.49\.55, 0\.49\.56 |' {wt}/README.md | wc -l` → `5`
  2. `grep -c 'magic-context-0.49.56/' {wt}/AGENTS.md` → `1`
  3. `bun run lint:docs` (workdir `{wt}`) → exit 0
- **problems**: the count is not 5 → stop and return the matching lines.
- **escalation**: the launcher.
- **failure**: `git -C {wt} checkout -- README.md AGENTS.md`.
- **returns**: the diff and the lint output.
- **evidence**: `{record}`, section `3.4`.

### Step 3.5 — Stage 3 gate

- **runs in**: `main session` — stage gate
- **action**: `run`
- **target**: `{wt}`
- **content**: `bun test tests/unit/domain/MatcherRules.test.ts tests/unit/patches tests/e2e/lifecycle.test.ts`,
  then `bun run lint:docs`, then `git -C {wt} status --porcelain`
- **depends on**: 3.1–3.4
- **gates**:
  1. the tests → 0 fail, and the output names `covers all sixteen fixtures` and
     `the program on a copy of the real Magic Context 0.49.56`
  2. `bun run lint:docs` → exit 0
  3. `git -C {wt} status --porcelain` → exactly these entries:
     - the five `patches/*.ts`;
     - `tests/fixtures/magic-context-0.49.56/`;
     - the two test files;
     - `README.md` and `AGENTS.md`;
     - `docs/reference/{T}-magic-context-0.49.56-patches.md`;
     - `docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`;
     - `docs/sessions/{session_id}.md`
- **problems**: an extra entry → find the step that wrote it; revert it.
- **escalation**: as in the failing step.
- **failure**: Stage 4 does not start.
- **returns**: n/a
- **evidence**: `{record}`, section `Stage 3 gate`.

## Stage 4 — Gate, commit, integrate, install the CLI

**Why.** The repository's "Definition of done" is `bun run check`, a commit, then `bun run install:cli`. The new
CLI is what lets `apply` treat 0.49.56 as reviewed.

**What.**

- a commit on `test-magic-context-0.49.56`;
- the integration the user chooses;
- `/Users/mavasbel/.local/bin/opencode-magic-context-patches` built from it;
- the worktree removed.

**Enter gate.** Stage 3 gate green.

### Step 4.1 — Final repository gate

- **runs in**: `main session` — the final gate is never delegated
- **action**: `run`
- **target**: `{wt}`
- **content**: the same six commands as Step 1.5, in the same order.
- **depends on**: Stage 3 gate
- **gates**:
  1. `typecheck`, `lint:docs` → exit 0
  2. `coverage:unit`, `coverage:e2e` → exit 0, or the same failures as the baseline and no others; and the
     100 % lines and functions per-file gate of `scripts/coverage.mjs` is not reported failing for any file
     the baseline reported passing
  3. `test:component` → the same pass/fail set as the baseline, plus any new tests passing
  4. `test:live` → no failing test id that is absent from the baseline list
  5. the new tests pass: the 5 MatcherRules rows on 0.49.56, `tests/unit/patches/patches.test.ts`, and the
     lifecycle 0.49.56 block (visible in the coverage runs' output)
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | a failure absent from the baseline | regression | block; reopen the Stage 3 step that touched that file |
  | the coverage gate reports an uncovered patch file | the new release lines are not executed | impossible for data arrays; investigate and report |

- **escalation**: the user, with the baseline and final outputs side by side.
- **failure**: no commit.
- **returns**: n/a
- **evidence**: `{record}`, section `Final gate`.

### Step 4.2 — Commit

- **runs in**: `main session` — a commit is the irreversible record of the change
- **action**: `run`
- **target**: branch `test-magic-context-0.49.56`
- **content**: `git -C {wt} add -A`, then `git -C {wt} commit -F -` with this message:

  ```
  test(patches): check every patch against Magic Context 0.49.56

  The five patches apply to 0.49.56 unchanged, and so do their matchers.
  execute-threshold-min and fold-identity-stable read files byte-identical to
  0.49.55's; the other three patches read rebuilt bundles whose surrounding code
  is unchanged. The fixture holds the nine files the matchers read.

  Evidence: docs/reference/{T}-magic-context-0.49.56-patches.md
  ```

- **depends on**: 4.1
- **gates**:
  1. `git -C {wt} status --porcelain` → empty
  2. `git -C {wt} log -1 --format=%s` → `test(patches): check every patch against Magic Context 0.49.56`
  3. `git -C {wt} diff --stat {base}..HEAD` → only the paths listed in Step 3.5 gate 3
- **problems**: a pre-commit hook fails → fix what it names; never `--no-verify`.
- **escalation**: the user, with the hook output.
- **failure**: `git -C {wt} reset --soft {base}`.
- **returns**: n/a
- **evidence**: `{record}`, section `4.2`.

### Step 4.3 — Integrate

- **runs in**: `main session` — a question to the user (AGENTS 7.5)
- **action**: `run`
- **target**: `{repo}` `main` or `origin`
- **content**: ask with the `question` tool: "Merge `test-magic-context-0.49.56` into `main` directly
  (recommended, as for 0.49.55), or push it and open a pull request?" Then run one of:
  - Merge: `git -C {repo} merge --ff-only test-magic-context-0.49.56`, then, only if the user also asks for
    it, `git -C {repo} push origin main`.
  - PR: `git -C {wt} push -u origin test-magic-context-0.49.56`, then
    `gh pr create --repo mavasbel-devtools/opencode-magic-context-patches --head test-magic-context-0.49.56 --base main --title "test(patches): check every patch against Magic Context 0.49.56" --body-file -`,
    with the commit body as the PR body.
- **depends on**: 4.2
- **gates**:
  1. Merge: `git -C {repo} rev-parse main` → equals `git -C {wt} rev-parse HEAD`
  2. PR: `gh pr view test-magic-context-0.49.56 --json url -q .url` → a URL
- **problems**: `Not possible to fast-forward` → main moved; stop and ask the user (rebase, or a merge
  commit).
- **escalation**: the user.
- **failure**: Merge: `git -C {repo} reset --hard {base}`, only if the merge was not pushed and only with the
  user's consent. PR: close the PR.
- **returns**: n/a
- **evidence**: `{record}`, section `4.3`.

### Step 4.4 — Install the CLI

- **runs in**: `subagent general`
- **action**: `run`
- **target**: `/Users/mavasbel/.local/bin/opencode-magic-context-patches`
- **content**: `bun run install:cli`, with workdir `{wt}` (the reviewed tree, whichever integration was
  chosen)
- **depends on**: 4.3
- **gates**:
  1. `bun run install:cli` → exit 0
  2. `opencode-magic-context-patches status --json | jq -r '.patches[] | select(.installation.version=="0.49.56") | .state' | sort -u`
     → only `not-applied`. That is no longer `unchecked-version`, so 0.49.56 is now reviewed.
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | gate 2 shows `unchecked-version` | the old binary is still on `PATH` | `which -a opencode-magic-context-patches`; report |
  | gate 2 jq path is wrong | the JSON shape differs from planning | use `status` text output: each line must end `: not-applied` |

- **escalation**: the launcher.
- **failure**: the previous binary is gone. Rebuild it from `{base}`:
  1. `git -C {repo} worktree add --detach {repo}/worktrees/rebuild-cli {base}`
  2. `bun install --frozen-lockfile` and `bun run install:cli`, both with workdir `{repo}/worktrees/rebuild-cli`
  3. `git -C {repo} worktree remove {repo}/worktrees/rebuild-cli`
- **returns**: both outputs.
- **evidence**: `{record}`, section `4.4`.

### Step 4.5 — Remove the worktree

- **runs in**: `main session` — destructive
- **action**: `delete`
- **target**: `{wt}`
- **content**: Before removing anything, if the branch was merged:
  - copy `{record}` over `{repo}/docs/sessions/{session_id}.md`, because the record has lines written after
    the commit;
  - then run `git -C {wt} checkout -- docs/sessions/{session_id}.md`, so the worktree is clean.

  If a PR was opened, keep the record on the branch, and keep `{wt}` until Stage 5 has finished writing to it.
  Then:
  - after a merge: `git -C {repo} worktree remove {wt}`, `git -C {repo} worktree prune` and
    `git -C {repo} branch -d test-magic-context-0.49.56`;
  - after a PR: `git -C {repo} worktree remove {wt}` and `git -C {repo} worktree prune`, with the branch kept.

  After this step, `{record}` means `{repo}/docs/sessions/{session_id}.md` (merge) or
  `{wt}/docs/sessions/{session_id}.md` (PR, until Stage 5 ends). Run this step after Step 5.8 when a PR was
  opened.
- **depends on**: 4.4 (merge); 5.8 (PR)
- **gates**:
  1. `git -C {repo} worktree list` → no `test-magic-context-0.49.56` line
- **problems**: `contains modified or untracked files` → something was written after the commit; show
  `git status`; never `--force` without the user.
- **escalation**: the user.
- **failure**: the worktree stays; nothing is lost.
- **returns**: n/a
- **evidence**: `{record}`, section `4.5`.

## Stage 5 — Install the patches and enable Magic Context fully in OpenCode

**Why.** The Objective's "Why" items 3 and 4. The user requires that the patches are installed and Magic
Context is fully enabled for OpenCode. The user chose (2026-11-15) to load `@latest` and patch `{cache_copy}`
with `apply`.

**What.**

- `/Users/mavasbel/.config/opencode/opencode.jsonc` line 252 is `"@cortexkit/opencode-magic-context@latest"`;
- a mode-600 backup of the previous file;
- the five patches applied on `{cache_copy}`;
- after the restart, Magic Context is `active` in the running service from `{cache_copy}`, `check` exits 0,
  and the configured threshold is accepted and in use.

**Enter gate.** Step 4.4 green.

### Step 5.1 — Back up opencode.jsonc

- **runs in**: `main session` — the file may hold credentials (AGENTS 4.7, 5.3); it is never printed
- **action**: `create`
- **target**: `/Users/mavasbel/.config/opencode/opencode.jsonc.{B}.bak`, where `{B}` is
  `date +%Y-%m-%d-%H-%M` at this step
- **content**: `cp -p /Users/mavasbel/.config/opencode/opencode.jsonc /Users/mavasbel/.config/opencode/opencode.jsonc.{B}.bak`,
  then `chmod 600` on the backup
- **depends on**: Stage 4 (4.4)
- **gates**:
  1. `cmp -s` of the original and the backup → exit 0
  2. `stat -f %Lp` on the backup → `600`
  3. `test ! -L` on the backup → exit 0
- **problems**: none foreseen beyond disk errors, which stop the step.
- **escalation**: the user.
- **failure**: delete the backup.
- **returns**: n/a
- **evidence**: `{record}`, section `5.1` (exit codes only).

### Step 5.2 — Point the entry at `@latest`

- **runs in**: `main session` — same file
- **action**: `edit`
- **target**: `/Users/mavasbel/.config/opencode/opencode.jsonc`, line 252
- **content**: replace the string literal
  `"/Users/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.56/node_modules/@cortexkit/opencode-magic-context"`
  with `"@cortexkit/opencode-magic-context@latest"`. Nothing else changes; line 350
  (`// "@cortexkit/opencode-magic-context@latest"`) stays as it is.
- **depends on**: 5.1
- **gates**:
  1. `grep -c 'opencode-magic-context-patches/installs' /Users/mavasbel/.config/opencode/opencode.jsonc` → `0`
  2. `diff /Users/mavasbel/.config/opencode/opencode.jsonc.{B}.bak /Users/mavasbel/.config/opencode/opencode.jsonc | grep -c '^[<>]'`
     → `2` (one line out, one line in; the diff is pasted in `{record}`, since line 252 holds no secret)
  3. `opencode-magic-context-patches status --json | jq -r .loadedSpec` → `@cortexkit/opencode-magic-context@latest`
  4. `opencode-magic-context-patches status --json | jq -r '.installations[] | select(.loaded) | .root'` →
     `{cache_copy}`
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | gate 3 prints `latest` or a differently shaped value | the reader's field form | accept only if gate 4 is green; record the value |
  | gate 4 empty | the tool does not match `@latest` to `{cache_copy}` | restore the backup (`cp -p …bak …jsonc`); escalate |

- **escalation**: the user, with gates 3 and 4: "the tool does not see the cache copy as loaded; restore the
  old entry and stop, or try `follow --version 0.49.56`?"
- **failure**: `cp -p /Users/mavasbel/.config/opencode/opencode.jsonc.{B}.bak /Users/mavasbel/.config/opencode/opencode.jsonc`.
- **returns**: n/a
- **evidence**: `{record}`, section `5.2`.

### Step 5.3 — Apply the five patches to the cache copy

- **runs in**: `subagent general`
- **action**: `run`
- **target**: `{cache_copy}`
- **content**: `opencode-magic-context-patches apply --version 0.49.56`, then
  `opencode-magic-context-patches check --json`
- **depends on**: 5.2
- **gates**:
  1. `apply --version 0.49.56` → exit 0, with every patch reported applied
  2. `check --json` → exit 0, and `jq -r .ok` → `true`
  3. `shasum -a 256` of the 9 files under `{cache_copy}/dist/` → the final `after` of each file in Step 3.2:
     - for `dist/context-bejy30t5.js` and `dist/v2/context-5hhm89jw.js`, fold-provenance-heal's `after`;
     - for the others, the `after` of their only patch.
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `refused` | a checksum differs from the reviewed `before` | stop; nothing was written (safety rule 1); return the output |
  | a permission error | npm cache permissions | stop; return; never `sudo` |

- **escalation**: the launcher, with the output.
- **failure**: `opencode-magic-context-patches undo --version 0.49.56`.
- **returns**: both outputs and the sha256 table.
- **evidence**: `{record}`, section `5.3`.

### Step 5.4 — Restart OpenCode (user action)

- **runs in**: `main session` — a question to the user. The tool never restarts OpenCode (repository safety
  rule 7), and this session runs inside OpenCode, so the restart may end this session.
- **action**: `run`
- **target**: the OpenCode service (`~/.local/state/opencode/service.json`, `pid`)
- **content**:
  1. Write `{record}`, marking 5.3 `[x]` and the line
     `Resume at 5.5; restart requested at <date -u +%Y-%m-%dT%H:%M:%SZ>` (this time is `{R0}`).
  2. Ask: "The five patches are applied on 0.49.56 and opencode.jsonc loads `@latest`. Please quit and
     restart OpenCode now, then reopen this session (`{session_id}`) and say 'restarted'."
- **depends on**: 5.3
- **gates**:
  1. the user answers `restarted`
  2. `jq -r .pid ~/.local/state/opencode/service.json` → a pid different from the one recorded before the
     question
- **problems**: the user declines → stop at 5.3 green; Magic Context is configured and patched but not loaded
  until the next restart.
- **escalation**: the user.
- **failure**: nothing to undo.
- **returns**: n/a
- **evidence**: `{record}`, section `5.4`.

### Step 5.5 — Resume after the restart

- **runs in**: `main session` — restore from the record (AGENTS 9.2)
- **action**: `read`
- **target**: `{record}`
- **content**: read it in full and continue at 5.6. Take `{R0}` from it.
- **depends on**: 5.4
- **gates**:
  1. `{record}` shows 5.1–5.4 `[x]`
- **problems**: the record is missing → it lives in `{wt}` (PR) or `{repo}` (merge); look in both.
- **escalation**: the user.
- **failure**: n/a
- **returns**: n/a
- **evidence**: `{record}`, section `5.5`.

### Step 5.6 — Prove Magic Context is loaded, patched and accepting the configuration

- **runs in**: `main session` — it reads `service.json`, which holds a password; the password is never printed
- **action**: `run`
- **target**: the running OpenCode service, `{mc_log}`, `/Users/mavasbel/.local/share/opencode/log/opencode.log`
- **content**: the gates below, in order.
- **depends on**: 5.5
- **gates**:
  1. Live plugins, a read-only call with workdir `{repo}`:

     ```sh
     bun -e 'import { OpencodeLivePluginsAdapter } from "@mc-patches/infrastructure/adapters/outbound/opencode/OpencodeLivePluginsAdapter"; console.log(JSON.stringify(await new OpencodeLivePluginsAdapter(process.env.HOME + "/.local/state/opencode/service.json").magicContext()))'
     ```

     → every entry has `status` `"active"` and a `source` that starts with
     `/Users/mavasbel/.cache/opencode/npm/@cortexkit/opencode-magic-context@latest/`, or equals
     `@cortexkit/opencode-magic-context@latest`.
  2. `opencode-magic-context-patches status --json | jq -r '.installations[] | select(.loaded) | .root, .version'`
     → `{cache_copy}`, then `0.49.56`.
  3. `opencode-magic-context-patches check --json` → exit 0, and `.ok` is `true`.
  4. `awk -v t="{R0}" 'match($0,/timestamp=[^ ]+/){ts=substr($0,RSTART+10,RLENGTH-10)} ts>=t && /failed to load plugin/ && /magic-context/' /Users/mavasbel/.local/share/opencode/log/opencode.log | wc -l`
     → `0`.
  5. `awk -v t="[{R0}" '$1>=t' {mc_log} | wc -l` → ≥ 1: Magic Context has written since the restart.
  6. `awk -v t="[{R0}" '$1>=t && /invalid value/' {mc_log} | wc -l` → `0`: threshold `16` is now accepted.
  7. `opencode-magic-context-patches effect --since {R0} --json | jq -r '.summary.rejections, .verdict'` →
     `0`, then `respected` or `no-data`. `effect` is given `--since` because, without it, the tool reads the
     service start from `/proc`, which macOS lacks (`{repo}/src/application/EffectUseCase.ts` line 22).
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | gate 2 shows a different numbered folder, and gate 3 fails with `not-applied` | OpenCode reinstalled `@latest` at start (Open question 1) | run `apply --version 0.49.56` again (5.3), then ask for one more restart (5.4); if the folder changes again, escalate |
  | gate 1 `status` is not `active` | plugin load error | read the matching `opencode.log` line after `{R0}`; escalate with it |
  | gate 1 returns `null` | no server is listening, or `service.json` is stale | ask the user to confirm OpenCode is running; re-run |
  | gate 6 > 0 | the execute-threshold patch is not in the loaded code | gates 2 and 3 locate it; same handling as row 1 |

- **escalation**: the user, with the failing gate output. If the copy is replaced on every start, ask:
  "OpenCode replaces the cache copy at every start; pin `@cortexkit/opencode-magic-context@0.49.56`, try
  `follow --version 0.49.56` on macOS (unverified), or stop?"
- **failure**: Magic Context may be loaded unpatched, or not at all. Rollback: restore
  `/Users/mavasbel/.config/opencode/opencode.jsonc.{B}.bak` only if the user asks, because the previous entry
  did not load at all. Otherwise run `undo --version 0.49.56`.
- **returns**: n/a
- **evidence**: `{record}`, section `5.6`.

### Step 5.7 — Prove the configured threshold is in use

- **runs in**: `main session` — it needs the user to run a session
- **action**: `run`
- **target**: `{mc_log}` through `effect`
- **content**: the verdict `respected` needs a proactive-floor line, which Magic Context writes only once a
  session reaches its threshold (`{repo}/src/domain/services/EffectReading.ts` lines 59–70). If 5.6 gate 7
  already shows `respected`, this step is green at once. Otherwise:
  - ask the user with the `question` tool: "Please work in an OpenCode session until its context grows
    beyond 16 % of the window, then answer 'done'";
  - then re-run the gate.
- **depends on**: 5.6
- **gates**:
  1. `opencode-magic-context-patches effect --since {R0} --json | jq -r '.verdict, .summary.effectiveThreshold, .configured'`
     → `respected`, `16`, `16`. The command exits 0.
- **problems**:

  | Symptom | Cause | Handling |
  |---|---|---|
  | `no-data` after the user's session | the threshold was never reached | ask again; never mark green |
  | `differs` | another threshold in use (for example, a per-model override) | return `effect` text output; escalate |
  | `rejected` | the config was rejected again | back to 5.6 |

- **escalation**: the user, with the `effect` text output.
- **failure**: stays open. Report it as "patched and loaded; threshold not yet proven in use". Never report it
  as done.
- **returns**: n/a
- **evidence**: `{record}`, section `5.7`.

### Step 5.8 — Close the plan loop and report

- **runs in**: `main session` — the review of the whole plan and the record are never delegated
- **action**: `review`
- **target**: `{record}` and `git -C {repo} diff --stat {base}..<integrated sha>`
- **content**:
  1. compare the Objective's "What" items 1–9 with the gate evidence in `{record}`;
  2. mark every step `[x]` with its output;
  3. report to the user:
     - every "What" item, with its evidence;
     - Open question 2 (an unpatched 0.49.57 may load, with no watch on macOS);
     - the pre-existing baseline failures.
  4. If the record is in the main checkout after a merge, commit it: `git -C {repo} add docs/sessions/{session_id}.md`
     and `git -C {repo} commit -m "docs(sessions): record the 0.49.56 review and install"`. Ask the user
     before pushing. If a PR was opened, commit the record on the branch and push it, then run Step 4.5.
- **depends on**: 5.7, or 5.6 when 5.7 is reported open
- **gates**:
  1. `grep -c '^- \[ \] ' {record}` → `0`, or only `5.7`, which is then reported open
  2. `git -C {repo} status --porcelain` → empty after the commit
- **problems**: a "What" item without evidence → reopen its step.
- **escalation**: the user, with the list.
- **failure**: the plan stays open at the last green step.
- **returns**: n/a
- **evidence**: `{record}`, section `Plan loop`.

## Inventory (closed)

- **Created**:
  - `{wt}`;
  - `{wt}/node_modules`;
  - `{wt}/docs/plans/2026-11-15-20-44-magic-context-0.49.56.md`;
  - `{record}`;
  - `{wt}/docs/reference/{T}-magic-context-0.49.56-patches.md`;
  - `{wt}/tests/fixtures/magic-context-0.49.56/` (9 `dist` files, `package.json`, `NOTICE.md`);
  - `{tmp}` (scratch);
  - `/Users/mavasbel/.config/opencode/opencode.jsonc.{B}.bak`;
  - backups and audit-log lines that `apply` writes under
    `/Users/mavasbel/.local/share/opencode-magic-context-patches/backups/` and
    `/Users/mavasbel/.local/state/opencode-magic-context-patches/audit.log`;
  - the branch `test-magic-context-0.49.56`, and its commit.
- **Edited**:
  - the five `{wt}/patches/*.ts`;
  - `{wt}/tests/unit/domain/MatcherRules.test.ts`;
  - `{wt}/tests/e2e/lifecycle.test.ts`;
  - `{wt}/README.md`;
  - `{wt}/AGENTS.md`;
  - `/Users/mavasbel/.local/bin/opencode-magic-context-patches`;
  - `/Users/mavasbel/.config/opencode/opencode.jsonc` (line 252 only);
  - 9 files under `{cache_copy}/dist/`.
- **Read only**:
  - `{repo}/tests/fixtures/magic-context-0.49.55/`;
  - `{repo}/scripts/lint-docs.mjs`;
  - `{repo}/src/**`;
  - `/Users/mavasbel/.config/cortexkit/magic-context.jsonc`;
  - `{mc_log}`;
  - `/Users/mavasbel/.local/share/opencode/log/opencode.log`;
  - `~/.local/state/opencode/service.json`;
  - https://github.com/cortexkit/magic-context/releases/tag/v0.49.56;
  - the npm registry.
- **Deleted**: `{wt}` (Step 4.5); `{tmp}` (optional, after Stage 3).
- **Services**: the OpenCode service, restarted by the user in Step 5.4.

## Gaps known at planning

- Hindsight memory tools are not registered in this installation, so memory was not searched. Every claim in
  this plan is backed by a command run on 2026-11-15 instead.
- `follow`, the watch units and `effect` without `--since` are not verified on macOS, and are not used.
