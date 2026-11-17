# Plan — Merge opencode-magic-context-patches into opencode-session-manager, then decommission it

- Plan file: `/Users/mavasbel/Dev/repos/devtools/opencode-session-manager/docs/plans/2026-11-15-23-45-merge-magic-context-patches.md`
  (scratch copy until step 1.7: `/Users/mavasbel/.opencode/plan/2026-11-15-23-45-merge-magic-context-patches.md`;
  step 12.3 deletes the scratch copy)
- Created: `2026-11-15-23-45` (`date +%Y-%m-%d-%H-%M`)
- Repository: `{A}`; worktree `{W}` on branch `feat-magic-context-patches`
- Session record: `{W}/docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` (new in `{A}`). The record of the same
  session kept so far in `{S}/docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` is imported frozen under another
  path by step 5.3 (Appendix E), so the two never collide.
- Rebased base (revision 4): from step 1.14 on, `{base}` is local `main` of `{A}` as step 1.14 records it
  (`3d079851592c159054bec7c0b55b5e76c7095fcf` at planning, "feat(plugin): show the session's agent and its root's title in
  the Herdr pane", 2026-11-16 10:13:54, = `origin/main` by `git ls-remote`). The first base below is `{base0}`; steps
  1.5–1.10 ran against `{base0}`.
- Executed against (first base, `{base0}`): local `main` of `{A}` at `029c1b8` ("chore: ignore worktrees/", 2026-11-15 23:56:50,
  committed by a concurrent session, not pushed). `origin/main` = `166e9de118c27e236b4e2d857bb0d73549d1da7a`
  (`git -C {A} log --format='%h %ci %s' 166e9de..main`; `git ls-remote origin HEAD`, 2026-11-16 00:1x). Step 1.5
  records the full SHA. A concurrent worktree `{A}/worktrees/feat-herdr-pane-agent` (same SHA, untracked
  `tests/live/spike-agent.test.ts`) exists; user decision: start now, rebase later (step 8.1). A second one,
  `{A}/worktrees/feat-macos-store-migration` (created 2026-11-16 00:16, same SHA, clean), was found during the plan
  loop; user decision: the same (D27).
- Revision 1 (2026-11-16, replaces approved SHA-256 `7cfba3d86a1124ba72b386a851228d776a130ca4d408ec2246f40910d8ccee67`): step 1.1 gates 1–2 demanded `10` files but the step's own content enumerates 9 mappings; gates now demand `9`. Nothing else changed.
- Revision 2 (2026-11-16, replaces revision 1 SHA-256 `38b3e76a6767ff6a3fefb73d90cd03e69c02a4297d7829757b2ffddc7517f4e2`): new step 1.13 exempts `docs/plans/` and `docs/sessions/` from lint rule L3 (path-exists); step 1.9 now also depends on 1.13; D28 records the rule change; Appendix E gains row L8. Reason: the plan copy names 296 future paths by design, and the session record must name deleted residue paths to prove `test ! -e` — L3 as written can never pass on either document, which blocks every later lint gate (1.7 gate 2, 1.9 gate 2, 2.2 gate 1, stage gates). Fences and mermaid (L1/L2) still apply to both folders. Nothing else changed.
- Revision 4 (2026-11-16, replaces revision 3 SHA-256 `ae74cea69ae9df76db57df1467a22b5b69fbfc14fc63a72eb5998fdce1fe33bd`): `main` of `{A}` moved from `029c1b8` to `3d07985` (the herdr work, D17, merged and pushed; 19 files, among them `AGENTS.md` and `README.md`, which D1 and step 1.13 also change). The user asked to rebase now (D30). Changes: `{base0}` names the first base and `{base}` the rebased one; `{D1}` names the D1 digest relative to `{base}`; new steps 1.14 (rebase `{W}`), 1.15 (D1 re-backed up against `{base}`, with a three-way proof that only the base changed), 1.16 (the `{A}` bundle and the macOS and Linux `{A}` baselines taken again at `{base}`); step 1.12 depends on 1.11 and 1.16; steps 2.1 and 8.3 use `{D1}` and the re-backed-up patch; D17 row notes the merge; D30 added. Nothing else changed.
- Revision 3 (2026-11-16, replaces revision 2 SHA-256 `34c6b7900110db7248f79990ffddda3cb9300af1e3dc90c5c2f0f58db99d0331`): the macOS baseline (step 1.9) found 6 failures outside the taxonomy — 4 tests compare a `tmpdir()` path (`/var/…`) with a resolved one (`/private/var/…`), 1 needs a running Herdr server, 1 needs the session-manager plugin installed. The user decided (D29) that tests separate OS-specific from common code by guards plus a rule, not by per-OS directories. Changes: D29; step 1.9 gate 3 accepts `other` failures that carry a printed cause and name the step that repairs them; Stage 4 `What`, steps 4.1 and 4.3 gain the guard helper, the architecture rule, the move of the platform-adapter tests beside their `src` mirror, the `realpath` fix and the precondition skips; Appendix E gains rule I12. Nothing else changed.
- Revision 5 (2026-11-17, replaces revision 4 SHA-256 `40eb65de5af32bedec6872133c9befb8fc9ac26faff605895f4c23328e6b7ac01`): `{M}` (msik15k, 192.168.100.6) unreachable — SSH banner-exchange timeout on 2026-11-17 after the dm-crypt+btrfs writeback stall observed 2026-11-16 (Dirty 15.4 GB, dd <1.7 MB/s, trivial ssh timing out). The user directed waiving Linux verification entirely and deferring `{M}` (question 2026-11-17). Changes: D31 added — every gate line requiring execution on `{M}`/Linux is waived, macOS gates are authoritative and must still pass in full; the `{M}` action-halves of Stages 10–11 (cutover, decommission) are deferred-pending until the host returns, not waived. Step 4.5 gate 2, the Stage 4 Linux half-gate, and all later Linux gates close under D31 with the mac evidence recorded. Nothing else changed.
- Revision 6 (2026-11-17, replaces revision 5 SHA-256 `29425a6e103392f056ead43b4a5023c0616783025a115e10f2ee2387bb515079`): step 5.4's gate-2 run surfaced a discovered gap — architecture rule I12 scans all of `tests/` for `process.platform` and flags the 21 frozen upstream fixture files step 5.3 imported (no step owned it; steps 5.5 and 5.7 gates run that suite). D32 added (user-approved 2026-11-17): I12 excludes `tests/support/patches/fixtures/` — frozen upstream bytes checksummed by `patches.test.ts`, not project test code (same rationale as D24) — applied immediately to unblock step 5.5's gate. Nothing else changed.
- Revision 7 (2026-11-17, replaces revision 6 SHA-256 `b2ec89ba95c65a83735bf9f9def5d229b7ca4b1a59a2ffef8c70f242ad6921fe`): step 5.12 review found two letter-of-the-plan gaps on the green tree at `2f85c28`. (a) The Stage 5 gate demands `coverage:e2e` exit 0 with 100 % per file, but the standing `{A}` posture — recorded at baseline 1.10 and unchanged by every Stage 5 commit — is exit 1 on the line-coverage threshold with 23 pre-existing base files below 100 % lines (all funcs 100 %); every file this plan created or edited is 100/100 and the run has 0 test failures (183 pass / 11 skip). The gate now accepts exit 1 solely from that threshold on exactly that pinned 23-file set, with 0 failures and all plan files 100/100; repairing the 23 base files is out of scope. (b) `tests/e2e/patches/prerelease-versions.test.ts` is mandated by the compareVersions 'New cases needed' content (pre-release ordering, build metadata, both use-case effects) but no Appendix E row names the file — the row is added (New files), the file stays. The `On {M}` half of the Stage 5 gate is confirmed waived under D31; the mac live gate is judged on the run with `OPENCODE_SESSION_MANAGER_BIN_DIR={X}/bin` and `OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN=/opt/homebrew/bin/opencode` (step 5.10). Nothing else changed.
- Revision 8 (2026-11-17, replaces revision 7 SHA-256 `98878b32dda83cc289cc5aaeef2e281df156cb99b98696cd50af0e1044503c02`): step 7.4 applies the Revision 7 posture to the Stage 7 gates. `coverage:e2e` exit 1 is accepted when the only cause is the line-coverage threshold on exactly the pinned 23-file pre-existing base set, with 0 test failures and every plan-created/edited file at 100 % funcs and 100 % lines. The three `follow.test.ts` timeouts in the 7.1 GATE run are a confirmed load-flake (mandated file re-run 24 pass / 1 skip / 0 fail exit 0; launcher full-coverage re-run 183 pass / 11 skip / 0 fail with both affected plan files back at 100/100), not a regression. The Linux halves of steps 7.1/7.2/7.4 stay waived under D31; win32 stays blocked under D8 (7.4 gate 3). Nothing else changed.
- Revision 9 (2026-11-17, replaces revision 8 SHA-256 `2d1d97a96fc9e0ea0a4f3af664ce2e0ec37b912ec37ca6ff305aaf951c0506c2`): step 9.2's verbatim run exposed a content/gate conflict — `chmod -R a-w {PD}/backups` strips directory write too (755→555, failing gate 4's mode equality), and 555 directories would block the new tool's future backup writes, while the old tool leaves directories at 755 with files at 444. Content amended to files-only `chmod` (directories untouched); repair is `find {PD}/backups -type d -exec chmod u+w {} +` (files already 444, untouched by the repair). Nothing else changed.
- Revision 10 (2026-11-17, replaces revision 9 SHA-256 `2b5f5c9ff4327209ddb6aa3d2162392908cfc97c041318b6c0d402914f8c4dd4`): step 9.6 findings, user-approved. (a) `NotifyUseCase.ts:12` names the deleted old tool — new step 9.7 renames to the new CLI with typecheck/unit/lint gates. (b) The launchd agent's minimal PATH stops every scheduled `follow` at `prove` — new step 9.8 adds a full-PATH `EnvironmentVariables` to the plist template, commits 9.7+9.8 as one `{IDENT}` commit, re-merges and pushes `main`, reinstalls CLI and agent, and re-verifies with one new `follow` report (adopted → 9.5 re-arms; stopped → reason quoted). Nothing else changed.
- Revision 11 (2026-11-17, replaces revision 10 SHA-256 `df109d4a31edeb26c6a9b3ee60a649cecfe5bd7321c6e2ae04c8f46fcfaf18f1`): two step-9.8 outcomes. (a) The launcher failed to forward the user-approved AdoptionRecorder inclusion into the running 9.8 brief, so `905261c` lacks it — new step 9.9 applies the one-line rename with targeted gates, its own `{IDENT}` commit and push. (b) The re-verification `follow` still stops at `prove`: `OpencodeSandboxAdapter.ts:84-92` hardcodes `PATH: "/usr/bin:/bin"` around a bare `"opencode"`, which the plist `EnvironmentVariables` cannot reach — new step 9.10 reads the adapter first and applies a config-only fix only when the read proves one exists, else reports blocked. Nothing else changed.
- Revision 12 (2026-11-17, replaces revision 11 SHA-256 `e235ff6624a0d5076a6cb3787232cc25c03ecddb6a7a5c378dc9e595a97d84f07589`): `{M}` (msik15k) is unreachable and the user deferred it, so Stage 10 is deferred whole (steps 10.1–10.9, gate not judged); Stage 11 runs its Mac steps now (11.1 re-wired to Stage 9 closed; 11.8 `{S}`-only; 11.9/11.10/11.11 Mac rows) and defers its `{M}` steps (11.5, 11.6, 11.8-`{MS}`, 11.10/11.11-`{M}`); Stage 12 runs 12.1/12.2 Mac-only, keeps `{X}` as retained follow-up backing, defers 12.3; Stage 13 runs now on 12.2-Mac. A follow-up plan takes the deferred `{M}` set when the host is reachable. Nothing else changed.
- Revision 13 (2026-11-17, replaces revision 12 SHA-256 `71b8f728563407321c41a2026aa52e81c3949b3d49e9b89cdc58f5bd90aec23f`): user decision — `{M}` (Linux) and win32 are **out of scope of this plan**; the user handles them himself on those machines, and no follow-up plan is written. Stage 10 and the `{M}` steps of Stage 11 (11.5, 11.6, 11.8-`{MS}`, 11.10/11.11-`{M}`) are recorded as out of scope, not run. `{M}`'s own backups and bundles live in `{MX}` on `{M}` (steps 1.1, 1.2, 1.3, 1.4, 1.8), never on this Mac, so `{MX}` becomes a Retained row on `{M}` for the user's own cutover; this plan never deletes it. On this Mac, `{X}` holds only Mac backups whose protected gates (7.4, 9.x, Mac 11.x) are green, so 12.2 deletes `{X}` whole, plus the 11.11 subagent's stray `{T}/step-11-11-find.out`. 12.3 moves after the record commit as step 13.5, and 13.1 first copies this plan revision into `{W}/docs/plans/` so it is committed. New step 13.1b installs from the merged `main`. The Stage 12 gate is judged on `{X}/before` only. Nothing else changed.
- Plan SHA-256 at approval: quoted in the approval question; `build` recomputes `shasum -a 256` of the scratch copy
  in step 0.1 and stops on any difference
- Baseline gate: steps 1.9 (macOS), 1.10 (Linux, `{A}`), 1.11 (Linux, `{S}`); Appendix A

## Names used in this plan

| Name | Value |
|---|---|
| `{A}` | `/Users/mavasbel/Dev/repos/devtools/opencode-session-manager` |
| `{S}` | `/Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches` |
| `{W}` | `{A}/worktrees/feat-magic-context-patches` |
| `{M}` | ssh host `msik15k` (`HostName 192.168.100.6`, `uname -n` → `mk15`, `Linux 7.1.5+kali-amd64 x86_64`, `/tmp` on btrfs, `TMPDIR` unset) |
| `{MA}` | `/home/mavasbel/Dev/repos/devtools/opencode-session-manager` on `{M}` |
| `{MS}` | `/home/mavasbel/Dev/repos/devtools/opencode-magic-context-patches` on `{M}` |
| `{T}` | `/private/var/folders/_m/jyv5nmsn4y305mjjcm_4fq240000gn/T` (`$TMPDIR` resolved) |
| `{X}` | `{T}/opencode/ses_e1dc7d932ffe69P47CJLyPq6qR/merge` — this plan's only scratch directory on macOS, under the session's scratch root |
| `{MX}` | `/tmp/opencode/ses_e1dc7d932ffe69P47CJLyPq6qR/merge` — this plan's only scratch directory on `{M}` |
| `{C}` | `/Users/mavasbel/.config/opencode` |
| `{SID}` | `ses_e1dc7d932ffe69P47CJLyPq6qR` |
| `{base0}` | `029c1b8f36aded049a131d463c1bb05c582dccba` — `main` of `{A}` when the plan started (steps 1.5–1.10) |
| `{base}` | `main` of `{A}` after the rebase of step 1.14 (recorded there); every step after 1.14 that names `{base}` means this SHA |
| `{D1}` | the Appendix D digest computed in `{A}` by step 1.15, after `{A}`'s main checkout moved to `{base}` with D1 still uncommitted |
| `{IDENT}` | `user.name "Marco Augusto Vásquez Beltrán"`, `user.email m.a.vasbel@epistelabs.com`: the identity of all 51 commits of `{A}` (`git log --format='%an <%ae>\|%cn <%ce>' \| sort \| uniq -c` → `51`); this Mac has no global or local git identity (`git config --global --get-regexp '^user\.'` → empty), so every commit step passes `-c user.name=… -c user.email=…` |
| `{S-final}` | the SHA of `{S}` `main` after plan `2026-11-15-22-13-agent-docs-residue-rule` closes; recorded by step 0.2 |
| `{PD}` | `<XDG_DATA_HOME, else ~/.local/share>/opencode-session-manager/patches` — the new tool's data folder |
| `{PS}` | `<XDG_STATE_HOME, else ~/.local/state>/opencode-session-manager/patches` — the new tool's state folder |
| `{LABEL}` | `com.github.mavasbel-devtools.opencode-session-manager-patches` — the launchd label |
| `{c2}`, `{c4}`, `{c5}`, `{c6}` | the commit SHAs returned by steps 2.3, 4.5, 5.7 (the import commit) and 6.5 |
| `GATE` | the repository gate, in this order, each run from the checkout root with output to `<dir>/<name>.txt` and exit status to `<dir>/<name>.exit`: `bun run typecheck`, `bun run lint:diagrams`, `bun run coverage:unit`, `bun run test:component`, `bun run coverage:e2e`, `bun run test:live` |
| `FAILS(f)` | `grep -E '^\(fail\)' f \| sed -E 's/ \[[0-9.]+m?s\]$//' \| sort -u` — the unique failing test names of one output |

## Objective

**Why.**

1. The user decided (2026-11-15): "Since we cannot contribute anything to the magic-context repo, let's merge
   everything about patching the behaviour of magic-context into our opencode-session-manager". The upstream plan
   `/Users/mavasbel/.opencode/plan/2026-11-15-22-13-upstream-execute-threshold-minimum.md` is withdrawn (step 0.3).
   The residue-rule plan `/Users/mavasbel/.opencode/plan/2026-11-15-22-13-agent-docs-residue-rule.md` (revision 2)
   finishes first (step 0.2): it writes into `{S}`, which this plan imports and then deletes.
2. The user added (2026-11-16): "at the very end, when everything is integrated into opencode-session-manager, we
   delete any installation and residual file of opencode-magic-context-patches" (Stage 11, Appendix C).
3. Decisions taken with the user (question tool, 2026-11-15 and 2026-11-16):

   | # | Decision | Answer |
   |---|---|---|
   | D1 | uncommitted work in `{A}` (18 modified, 12 untracked entries, digest `4d962b44…`, Appendix D) | this plan finishes it (Stage 2) |
   | D2 | CLI surface | one CLI; new command group `opencode-session-manager patches …` |
   | D3 | history of `{S}` | one import commit; the file map is a reference document (step 5.1) |
   | D4 | fate of `{S}` | GitHub repository archived (run by the user), local checkouts removed |
   | D5 | macOS | darwin becomes a third full platform of opencode-session-manager (Stage 4) |
   | D6 | watch on macOS | a launchd agent beside the systemd units (Stage 6) |
   | D7 | `compareVersions` | semver 2.0.0 §11 order, one function (step 5.2) |
   | D8 | Linux gates | run on `{M}`; Windows gates reported blocked (no host) |
   | D9 | old tool's history | migrated into `{PD}`/`{PS}` before the new tool's first write, every file `cmp`-verified (steps 9.2, 10.6) |
   | D10 | `{M}` cutover | `opencode-session-manager patches follow --version 0.49.56`, then the old store is deleted (steps 10.7, 11.6) |
   | D11 | stray worktree on `{M}` | removed only when its status is clean (step 11.5) |
   | D12 | GitHub archive | the user runs it; step 11.9 verifies `isArchived=true` |
   | D13 | names | env `OPENCODE_SESSION_MANAGER_PATCHES_*`, folders `{PD}`/`{PS}`, units `opencode-session-manager-patches.*`, launchd `{LABEL}` |
   | D14 | win32 for `patches` | full adapters (PowerShell), unit-tested with stand-in commands; win32 e2e and live reported blocked |
   | D15 | Bun | 1.4.4 on both hosts, `"packageManager": "bun@1.4.4"` in `package.json` |
   | D16 | commit identity | `{IDENT}` |
   | D17 | concurrent `feat-herdr-pane-agent` work | start now from `{base0}`; whoever integrates second rebases (step 8.1). It merged first (`3d07985`, 2026-11-16 10:13), so this plan rebases (step 1.14, D30) |
   | D30 | `main` moves during the plan | rebase `{W}` onto local `main` as soon as it moves, before the next stage starts (step 1.14 now; step 8.1 before integration), and take the `{A}` baselines again on the new base (step 1.16), so every comparison is against the base the branch sits on |
   | D18 | final cleanup | every installation and residual file of opencode-magic-context-patches deleted on both hosts (Stage 11) |
   | D19 | output of the moved commands | session-manager's style: program name `opencode-session-manager patches`, `--version` as `HelpCliAdapter` prints it, an unexpected error as `ERROR: <message>` exit 1, `notify-send --app-name=opencode-session-manager`, staging prefix `.osm-patches-`; notification titles, flags, JSON shapes and exit codes 0/1/2 unchanged |
   | D20 | source layout | subfolders `src/domain/model/patches/`, `src/domain/services/patches/`, `src/application/patches/`, `src/domain/patch-definitions/`; ports flat with the `Patch` prefix |
   | D21 | `pinnedMagicContext` | one entry reader based on the old `pinnedSpec`: npm specs and folders both recognised (step 5.4) |
   | D22 | configuration file | `patches` reads and edits the file session-manager resolves: `opencode.jsonc`, else `opencode.json` (step 5.6) |
   | D23 | moved test file names | kebab case (`ApplyUndo.test.ts` → `apply-undo.test.ts`) |
   | D24 | docs lint and fixtures | `scripts/lint-diagrams.mjs` L6 skips `tests/support/patches/fixtures/` (upstream bytes, not variables this tool reads) |
   | D25 | `@npmcli/arborist` 9.4.0 | `devDependencies`, as session-manager lists every library it compiles in |
   | D29 | OS-specific vs common tests | common tests stay where they are; tests of `outbound/platform/<p>/` adapters live in `tests/unit/platform/<p>/` (mirroring `src`); `tests/support/platform.ts` is the only place a test may read `process.platform` (helpers `onlyOn(platform)` and `requires(precondition, reason)`, both skipping with the reason, never failing); an architecture test enforces it; a failure outside a guard is always a regression (steps 4.1, 4.3) |
   | D28 | docs lint L3 and working documents | `docs/plans/` and `docs/sessions/` are exempt from rule L3 (referenced paths must exist): plans describe future files and records must name deleted residue to prove its absence; fences and mermaid (L1/L2) still apply (step 1.13) |
   | D26 | small design points | non-semver core parts count as 0; tests reach the seams through `buildContainer(env, { patches: seams })`; the CLI ends with `process.exit(code)` after its output is flushed |
   | D27 | concurrent `feat-macos-store-migration` work | as D17: never touched; step 8.1 rebases over it; darwin adapters it lands first are reused, not duplicated |
   | D32 | I12 and frozen fixtures | architecture rule I12 excludes `tests/support/patches/fixtures/`: frozen upstream bytes (checksummed by `patches.test.ts`), not project test code — same rationale as D24 (Revision 6) |
   | D31 | Linux verification waived, `{M}` actions deferred | `{M}` unreachable (SSH banner timeout 2026-11-17, after the 2026-11-16 writeback stall); user directed waiving all Linux-execution gates. Every gate line requiring runs on `{M}`/Linux is waived — macOS gates are authoritative and must still pass in full. The `{M}` halves of Stages 10–11 (cutover, decommission) are deferred-pending until the host returns, not waived, and are recorded pending in the session record. Risk stated: Linux-only regressions are undetectable until `{M}` returns; mitigations: `Store.ts check()` already Linux-verified (7/7 unit incl. the fallback path + 24/24 e2e on `a-wip3` pre-stall), darwin-only files are excluded from Linux coverage by config, and typecheck/lint/architecture tests are platform-neutral and run on mac (Revision 5) |
   | D33 | Stage 5 gate posture and missing file-map row | `coverage:e2e` exit 1 is accepted when the only cause is the line-coverage threshold on exactly the pinned 23-file pre-existing base set (funcs 100 % everywhere, 0 test failures, every plan-created/edited file 100/100); the 23 base files are out of scope. Appendix E gains the `tests/e2e/patches/prerelease-versions.test.ts` row (compareVersions new-cases content). The `On {M}` Stage 5 gate half stays waived under D31 (Revision 7) |

4. Evidence of the current state (read-only, 2026-11-15 23:00 to 2026-11-16 00:20):
   - `{A}` refuses macOS: `src/main/cli/platform.ts` `LOADERS` holds `linux` and `win32` only, and `buildContainer`
     loads the platform before routing, so `--help` exits 1. A scratch copy of `{A}` with D1's work, Bun 1.4.4, this
     Mac: typecheck 0; `lint:diagrams` 8 failures (the 6 new src files and 2 test-support files of Appendix D are
     missing from `AGENTS.md`); unit 528 pass / 4 fail; component 9 / 1; e2e 22 / 70. 62 failures print
     `UnsupportedPlatformError: unsupported platform: darwin (supported: linux, win32)`; the others read the real
     `/proc` (`ProcFdHoldersAdapter names every holder…`). No `bunfig.coverage.e2e-darwin.toml`, so
     `scripts/coverage.mjs e2e` exits 1 by design.
   - `{S}` is Linux-shaped: `/proc` in `ProcServiceAdapter.ts` and `FileLockAdapter.ts`, `getconf CLK_TCK` in
     `src/main/cli.ts`, `notify-send` in `NotifySendAdapter.ts`, systemd units in `systemd/`.
   - Root cause of `{S}`'s 21 Arborist failures on macOS (unit 1, component 1, e2e 19; memory #8029): tests stage
     under `{T}`, which is reached through the symlink `/var -> private/var`. Reproduced in a scratch copy: the same
     `new Arborist({ path }).reify({ add: [spec] })` against a local registry leaves
     `edges ["@cortexkit/opencode-magic-context"]` when `path` is the `/private/var/…` form and `edges []` when it is
     the `/var/…` form of the same folder. `ArboristInstallerAdapter.install` passes the folder as given. Fixed at the
     root by step 5.8.
   - `{M}`: Bun 1.4.2; OpenCode `v2.2.7` at `/home/mavasbel/.opencode/bin/opencode`; `systemctl --user` running; old
     units `opencode-magic-context-patches.{path,timer}` enabled and active; `~/.config/opencode/opencode.jsonc:259`
     loads `/home/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.56/node_modules/@cortexkit/opencode-magic-context`;
     `{MA}` at `166e9de` with D1's work (same digest); `{MS}` at `20099da`, clean.
   - This Mac: Bun 1.4.4 (`/Users/mavasbel/.bun/bin/bun`), OpenCode 2.3.0 at `/opt/homebrew/bin/opencode`, macOS
     27.0 arm64; `{C}/opencode.jsonc:304` loads `@cortexkit/opencode-magic-context@latest`, patched in place by the
     old tool (all five patches `applied`); `~/Library/LaunchAgents` does not exist.
   - npm registry, 2026-11-16: `bun` latest `1.4.4`; `@types/bun` has `1.4.4`; `bun-types` has `1.4.4`;
     `@npmcli/arborist@9.4.0` exists.

**What.**

1. On `main` of `{A}` and on `origin/main` after the user's integration choice (step 8.3):
   1. D1's location-repair and worktree-link-repair work, finished (Stage 2);
   2. darwin as a full platform (Stage 4): `src/main/darwin-container.ts`,
      `src/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter.ts`,
      `src/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter.ts`, `bunfig.coverage.e2e-darwin.toml`;
   3. the `patches` command group with every command, flag, output and exit code of the old tool (Appendix B), its
      domain, application and adapters per Appendix E, the five patch definitions, the 16 fixture versions, tests in
      every tier, and the old tool's documents imported frozen (Stage 5);
   4. the watch: systemd units and a launchd agent, installed by `bun run install:watch` (Stage 6);
   5. Bun pinned to 1.4.4 (Stage 6);
   6. the design trees `docs/design/2026-11-16-…-product-tree.md` and `…-architecture-tree.md` (Stage 3).
2. On this Mac: `/Users/mavasbel/.local/bin/opencode-session-manager`; the launchd agent `{LABEL}` loaded;
   `opencode-session-manager patches check` exit 0; `patches effect --since <service start>` `respected` at 16; the
   old tool's history in `{PD}`/`{PS}` (Stage 9).
3. On `{M}`: Bun 1.4.4; the new CLI; the new systemd units enabled and active; OpenCode loading Magic Context 0.49.56
   from `{PD}/installs/0.49.56/node_modules/@cortexkit/opencode-magic-context` with all five patches; the old history
   migrated; the session-manager plugin re-installed from the merged tree (Stage 10).
4. Nothing of opencode-magic-context-patches on either host (Appendix C, every row gone), and
   `mavasbel-devtools/opencode-magic-context-patches` archived on GitHub (Stage 11).
5. Zero residue of this plan on either host (Stage 12).

**Out of scope.**

- Windows hardware: no host. The win32 code is written and unit-tested; the win32 e2e coverage gate, the win32 live
  tier and a Windows watch (Task Scheduler) are reported **blocked**, never done; `install:watch` on win32 exits 1
  with `the watch is not supported on win32`.
- Scenario tags and the generated test-granularity report (`{C}/AGENTS.md` 6.4, 6.7): neither repository tags its
  tests (`grep -rn "@feature\|@usecase" {A}/tests {S}/tests` → 0); tagging ~800 tests is a plan of its own. Appendix F
  maps every use case to its tests by file and name instead; 13.1 reports the gap.
- Branch coverage: Bun 1.4 measures lines and functions only (both repositories' `bunfig.coverage*.toml` hold
  `coverageThreshold = { lines = 1.0, functions = 1.0 }`). The gate stays 100 % lines and functions per file; 13.1
  reports the tool limit.
- Upgrading OpenCode (2.3.0 here, 2.2.7 on `{M}`): reported, not changed.
- Installing the session-manager OpenCode plugin on this Mac (never installed: `{C}/plugins` holds only
  `herdr-agent-state.js`): reported, not done.
- The concurrent `feat-herdr-pane-agent` and `feat-macos-store-migration` work: never touched, never cleaned; only
  rebased over (step 8.1).
- The Magic Context project state that the running plugin wrote for `{S}` inside Magic Context's own database
  (`~/.local/share/cortexkit/…`): Magic Context's data, not the old tool's installation; reported in 13.1.
- Residue that existed before this plan and belongs to other work (the 0.49.56 plan's files in `{T}/opencode/`, the
  concurrent session's `herdr-*`, `census-*`, `cat.json`, `pm.json`, `blob*.mjs`, `ids.mjs`, `f.sh`, `s.txt`,
  `pm.h`): never deleted by this plan; plan `2026-11-15-22-13` owns the former, the concurrent session the latter.

**Retained after the plan** (created or changed by this plan, deliberately kept):

| Path | Reason |
|---|---|
| everything in What 1 to 3 | deliverables |
| `{PD}`, `{PS}` on both hosts | the new tool's own data and state, holding the migrated history (D9) |
| `/Users/mavasbel/Library/LaunchAgents/` (new folder) | the standard folder for the launchd agent |
| `~/Library/Logs/opencode-session-manager-patches.log` | the launchd agent's output (systemd uses the journal) |
| new entries in `/Users/mavasbel/.npm/_cacache` and `/home/mavasbel/.npm/_cacache` | npm's shared download cache, present before (580,420 KB here), written by Arborist |
| new entries in `~/.bun/install/cache` on both hosts | Bun's shared download cache |
| `~/.cache/opencode/npm/…` changes | OpenCode's own package cache |
| `{MX}` on `{M}` (Revision 13) | `{M}`'s own backups, bundles and clones (Bun 1.4.2 binary, configs, old-tool tar, D1 patch); kept for the user's own `{M}` cutover, which is out of scope of this plan |

Every backup this plan takes (steps 1.3, 1.4) lives in `{X}`/`{MX}` and is deleted by Stage 12 after the gate it
protects is green.

**Requirements checked before starting** (2026-11-15/16, read-only):

| Requirement | Command | Result |
|---|---|---|
| `{A}` D1 work | Appendix D digest command in `{A}` | `4d962b4474295810b8b037a47bf056888e0f36c2488c82fe1c2d2142ddee3407`; the same in `{MA}` |
| `{A}` stash and worktrees | `git -C {A} stash list`; `git -C {A} worktree list` | empty; main and `feat-herdr-pane-agent` |
| ssh to `{M}` | `ssh -o BatchMode=yes msik15k uname -srm` | `Linux 7.1.5+kali-amd64 x86_64` |
| `{M}` reaches GitHub | `git -C {MA} ls-remote origin HEAD` | `166e9de…` |
| `gh` authenticated | `gh repo view mavasbel-devtools/opencode-session-manager --json visibility` | `PRIVATE` |
| tools here | `command -v osascript lsof launchctl plutil ps` | all present (`/usr/bin`, `/usr/sbin`, `/bin`) |
| `ps` here | `LC_ALL=C ps -o pid=,lstart=,args= -p 46597` | `46597 Sun Nov 15 21:13:36 2026 /opt/homebrew/Cellar/opencode/2.3.0/bin/opencode serve --service` |
| `lsof` here | `lsof -F pcn -- ~/.local/share/opencode/opencode.db` | `p25142` / `cmagic-context-dashboard` / `f19` / `n/Users/…/opencode.db` |
| tools on `{M}` | `command -v notify-send git`; `systemctl --user is-system-running` | present; `running` |

**Open questions** (each answered by a step, never guessed):

| Question | Known | Inferred | Unknown | Answered by |
|---|---|---|---|---|
| Does D1's work pass on Linux? | fails `lint:diagrams` (8) | its tests pass | Linux results | 2.4 |
| Does `{A}`'s live tier run on macOS? | never run here | Herdr/TUI live tests need Linux tools | results | 1.9 |
| Does `{A}`'s e2e coverage gate pass on Linux at `{base}`? | its AGENTS.md says it is gated | yes | result | 1.10 |
| Does `follow --version 0.49.56` reinstall when 0.49.56 is loaded from another store? | `FollowUseCase` skips only when no version is asked | yes | live result | 10.7 |
| Does the sandbox proof run with OpenCode 2.3.0? | proven with 2.1.1 to 2.2.x | yes | result | 7.3 |
| Does `osascript display notification` show from a launchd job? | works from a login shell | yes | result | 9.6 gate 3 |
| Does Arborist compile into `{A}`'s CLI under its Solid transform plugin? | `{S}` compiles it with plain `bun build --compile` | yes | result | 5.7 gate 2 |
| Do the moved classes pass `{A}`'s textual constructor count (P2)? | `{S}` enforced explicit constructors | yes | result | 5.5, 5.6 gate 2 |
| Does `ps -o lstart` (whole seconds) give a usable `effect --since` on darwin? | `/proc` gives clock ticks | yes: a log line in the same second as the start can count once | result | 5.6 gate 3 |
| Does `{A}`'s `process.exit` path truncate piped output of `patches`? | `{S}` exits at once without loss | no | measured | 5.10 gate 3 |

## Delegation map

| Stage | Main session (reason) | Subagents |
|---|---|---|
| 0 | 0.1 approval check, 0.2 review of another plan's closure, 0.3 upstream check (decisions) | — |
| 1 | 1.12 review of baselines | 1.1–1.11 (`general`) |
| 2 | 2.5 review | 2.1–2.4 |
| 3 | 3.3 review against the request | 3.1, 3.2 |
| 4 | 4.6 review | 4.1–4.5 |
| 5 | 5.12 review | 5.1–5.11 |
| 6 | 6.6 review | 6.1–6.5 |
| 7 | 7.4 final gate (`{C}/AGENTS.md` 4.7) | 7.1–7.3 |
| 8 | 8.2 question to the user, 8.3 merge/push (irreversible), 8.5 review | 8.1, 8.4 |
| 9 | 9.3 cutover review, 9.5 and 9.6 questions to the user | 9.1, 9.2, 9.4 |
| 10 | 10.3 reset of `{MA}` (destructive), 10.7 entry switch, 10.9 review | 10.1, 10.2, 10.4–10.6, 10.8 |
| 11 | 11.1 session move, every deletion 11.2–11.6, 11.8, 11.10 (destructive, `{C}/AGENTS.md` 4.7), 11.9 hand-off to the user | 11.7 notice commit, 11.11 re-scan |
| 12 | 12.2, 12.3 deletions | 12.1 scan |
| 13 | 13.1 record, 13.2 worktree removal, 13.3 memory, 13.4 report | — |

## Stage 0 — Enter gates

**Why.** This plan imports `{S}` and later deletes it; plan `2026-11-15-22-13` still writes into `{S}` (stopped at its
step 1.5, worktree `{S}/worktrees/docs-agent-residue-rule`). Importing before it closes would lose its commits.

**What.** `{S-final}` recorded; plan 2 withdrawn with proof that nothing was posted upstream; the approved plan's
digest confirmed.

**Stage gate.** `git -C {S} worktree list` prints one line (`{S}` on `main`); `git -C {S} rev-parse main` equals
`git -C {S} ls-remote origin refs/heads/main | cut -f1`; the session record of `{S}` shows every step of plan
`2026-11-15-22-13` `[x]`.

### Step 0.1 — Confirm the approved plan

- **runs in**: main session (approval is bound to this digest; `{C}/AGENTS.md` 4.7)
- **action**: `run`
- **target**: `shasum -a 256 /Users/mavasbel/.opencode/plan/2026-11-15-23-45-merge-magic-context-patches.md`
- **content**: the command above.
- **depends on**: none
- **gates**: 1. the digest equals the one quoted in the user's approval.
- **problems**: digest differs → the file changed after approval.
- **escalation**: the user: "The plan's digest is `<x>`, not the approved `<y>`; re-approve or restore?" with both digests.
- **failure**: nothing ran; nothing to undo.
- **returns**: the digest.

### Step 0.2 — Plan 2026-11-15-22-13 is closed

- **runs in**: main session (judging another plan's closure is a review of delegated results, `{C}/AGENTS.md` 4.1)
- **action**: `review`
- **target**: `{S}/docs/sessions/{SID}.md`, section `# Plan 2026-11-15-22-13 — agent-docs residue rule`
- **content**: compare the section's checklist against the plan's step list (`1.1`…`8.1`); compare `{S}`'s worktrees,
  status and remote; record `{S-final}` = `git -C {S} rev-parse main`. Read the plan's `Retained` list and note which
  paths under `{T}/opencode/{SID}/` it kept for plan 2 (`upstream-analysis/`, the upstream clone): those become
  this plan's to delete (step 12.2), because plan 2 is withdrawn.
- **depends on**: 0.1
- **gates**:
  1. every checklist item of that section is `[x]`;
  2. `git -C {S} worktree list | wc -l` → `1`; `git -C {S} status --porcelain` → empty;
  3. `git -C {S} rev-parse main` = `git -C {S} ls-remote origin refs/heads/main | cut -f1`;
  4. `{C}/AGENTS.md` contains `3.10` and `Leave no residue` (`grep -c 'Leave no residue' {C}/AGENTS.md` ≥ 1).
- **problems**: plan 1 not closed → this plan cannot start (its import would miss commits).
- **escalation**: the user: "Plan 2026-11-15-22-13 is not closed (open items: …). Finish it first?" with the checklist.
- **failure**: nothing changed.
- **returns**: `{S-final}`, the list of plan-2 scratch paths still present.

### Step 0.3 — Withdraw plan 2 and prove nothing was posted upstream

- **runs in**: main session (records a decision)
- **action**: `run`
- **target**: `gh search issues --repo cortexkit/magic-context --author @me --created '>=2026-11-15' --json number` and
  `gh search prs --repo cortexkit/magic-context --author @me --created '>=2026-11-15' --json number`
- **content**: the two commands; the withdrawal is written into the session record by step 1.7.
- **depends on**: 0.2
- **gates**: 1. both print `[]`.
- **problems**: an item exists → something was posted outside this session's knowledge.
- **escalation**: the user, with the item numbers: "These exist upstream; leave, close, or edit?"
- **failure**: read-only.
- **returns**: both outputs.

## Stage 1 — Scratch, backups, worktree, baselines

**Why.** `{C}/AGENTS.md` 3.8 needs the gate on the unchanged tree on every platform that judges the result, and 7.7
needs the worktree's own environment; D15 needs Bun 1.4.4 on `{M}` before any baseline so before and after run on one
version.

**What.** `{W}` rebased onto `{base}` (D30) with D1 re-backed up against it; `{X}` and `{MX}` with before-snapshots; backups of D1's work, both `opencode.jsonc` files and the old
tool's folders; Bun 1.4.4 on `{M}`; `{W}` prepared; the plan copied and the session record opened; baselines of
`{A}` (macOS, Linux) and `{S}` (Linux) recorded in Appendix A.

**Stage gate.** `test -d {X}/before && ssh msik15k test -d {MX}/before`; `ssh msik15k ~/.bun/bin/bun --version` →
`1.4.4`; `git -C {W} rev-parse HEAD` = `{base}` full SHA; the three baseline output sets exist under
`{X}/gates/baseline-{mac,linux-a,linux-s}/`.

### Step 1.1 — Scratch directories and before-snapshots

- **runs in**: subagent general
- **action**: `run`
- **target**: `{X}` (macOS) and `{MX}` (`{M}`)
- **content**: `mkdir -p -m 700 {X}/before {X}/backup {X}/gates`; then write, each to its own file under
  `{X}/before/`: `find {T}/opencode -maxdepth 2 | sort` → `tmp-opencode.txt`; `find /private/tmp -maxdepth 2 | sort` →
  `private-tmp.txt`; `ls -A1 ~/.opencode/plan ~/.local/bin ~/.local/share ~/.local/state ~/.config/opencode ~/Library/Logs`
  → `home.txt`; `ls -A1 ~/Library/LaunchAgents 2>&1` → `launchagents.txt`; `launchctl print gui/$(id -u) | grep -c '{LABEL}'`
  → `launchd.txt`; `git -C {A} status --porcelain --ignored`, `git -C {A} worktree list`, `git -C {A} branch -a`,
  `git -C {A} stash list` → `git-a.txt`; the same for `{S}` → `git-s.txt`; `ps -axo pid=,lstart=,command= | sort -n` →
  `ps.txt`; `lsof -nP -iTCP -sTCP:LISTEN` → `ports.txt`. On `{M}` (`ssh msik15k`): `mkdir -p -m 700 {MX}/before
  {MX}/backup {MX}/gates`, and the same set with `/tmp` for `/private/tmp`, `~/.config/systemd/user` (recursive) and
  `systemctl --user list-unit-files 'opencode-*'` for launchd, `git -C {MA}` and `git -C {MS}`.
- **depends on**: Stage 0
- **gates**: 1. `ls {X}/before | wc -l` → `9`; 2. `ssh msik15k 'ls {MX}/before | wc -l'` → `9`; 3. `stat -f %Lp {X}` → `700`.
- **problems**: `lsof` prints nothing for a user without listeners → an empty file is a valid snapshot.
- **escalation**: the launcher, with the failing command and its stderr.
- **failure**: `rm -rf {X} ; ssh msik15k rm -rf {MX}` (created by this step only).
- **returns**: the two `ls` outputs with byte counts.

### Step 1.2 — Bun 1.4.4 on `{M}`

- **runs in**: subagent general
- **action**: `run`
- **target**: `/home/mavasbel/.bun/bin/bun` on `{M}`
- **content**: `cp -p ~/.bun/bin/bun {MX}/backup/bun-1.4.2`; `curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"`
  (the official installer with an explicit tag, so a later 1.4.5 cannot land); run over `ssh msik15k`.
- **depends on**: 1.1
- **gates**: 1. `ssh msik15k '~/.bun/bin/bun --version'` → `1.4.4`; 2. `ssh msik15k '{MX}/backup/bun-1.4.2 --version'` → `1.4.2`.
- **problems**: download fails (network) → stop; installer edits `~/.zshrc` → it only appends when the PATH line is
  absent; record `diff` of `~/.zshrc` before/after (expected empty).
- **escalation**: the user, with the installer output.
- **failure**: `cp -p {MX}/backup/bun-1.4.2 ~/.bun/bin/bun`.
- **returns**: both versions, the `~/.zshrc` diff.

### Step 1.3 — Back up D1's work (both hosts)

- **runs in**: subagent general
- **action**: `run`
- **target**: `{X}/backup/a-wip.patch`, `{X}/backup/a-untracked.tar`; `{MX}/backup/a-wip.patch`, `{MX}/backup/a-untracked.tar`
- **content**: in `{A}`: `git diff --binary > {X}/backup/a-wip.patch`;
  `git ls-files -o --exclude-standard -z | xargs -0 tar -cf {X}/backup/a-untracked.tar`; the same in `{MA}` into `{MX}`.
  Recompute the Appendix D digest in both checkouts.
- **depends on**: 1.1
- **gates**: 1. both digests = `4d962b4474295810b8b037a47bf056888e0f36c2488c82fe1c2d2142ddee3407`;
  2. `tar -tf {X}/backup/a-untracked.tar | wc -l` equals the number of files under Appendix D's untracked entries
  (`git -C {A} ls-files -o --exclude-standard | wc -l`); 3. `git -C {A} apply --check -R {X}/backup/a-wip.patch` → exit 0.
- **problems**: the digest differs → someone changed D1's work since 2026-11-15.
- **escalation**: the user: "D1's work changed (digest `<x>`); continue with the new content?" with `git -C {A} diff --stat`.
- **failure**: read-only on the checkouts; delete the two backup files.
- **returns**: digests, file counts.

### Step 1.4 — Back up configuration and the old tool's folders

- **runs in**: subagent general
- **action**: `run`
- **target**: `{X}/backup/` and `{MX}/backup/`
- **content**: macOS: `cp -p {C}/opencode.jsonc {X}/backup/opencode.jsonc`; `cp -p ~/.config/cortexkit/magic-context.jsonc
  {X}/backup/`; `tar -cpf {X}/backup/old-tool.tar -C ~ .local/share/opencode-magic-context-patches
  .local/state/opencode-magic-context-patches`. `{M}`: the same, plus `.config/systemd/user/opencode-magic-context-patches.*`
  and the two `.wants` links in the tar. `chmod 600` every file.
- **depends on**: 1.1
- **gates**: 1. `cmp {C}/opencode.jsonc {X}/backup/opencode.jsonc` → 0 (and on `{M}`); 2. `tar -tf old-tool.tar | wc -l`
  equals `find <the same folders> | wc -l` on each host; 3. `stat -f %Lp {X}/backup/*` → all `600` (`stat -c %a` on `{M}`).
- **problems**: an installed-copy folder is large (`{M}` `installs/` 1,241,712 KB) → it is not in the tar: installs are
  re-creatable from npm (D10) and the live copy stays until step 11.6; the tar holds `backups/`, `derived-releases.json`
  and the state folder only (≈ 10 MB).
- **escalation**: the launcher.
- **failure**: delete the backup files.
- **returns**: sizes and counts.

### Step 1.5 — Worktree

- **runs in**: subagent general
- **action**: `run`
- **target**: `git -C {A} worktree add -b feat-magic-context-patches {W} main`
- **content**: first `git -C {A} show main:.gitignore | grep -x 'worktrees/'` (committed in `{base}`); then the command.
- **depends on**: 1.3
- **gates**: 1. `git -C {W} rev-parse HEAD` = `git -C {A} rev-parse main` (record the full SHA as `{base0}`);
  2. `git -C {W} status --porcelain` → empty; 3. `git -C {A} worktree list` names `{W}`.
- **problems**: the branch name exists → stop (never reuse).
- **escalation**: the user, with `git -C {A} branch -a`.
- **failure**: `git -C {A} worktree remove {W} && git -C {A} branch -D feat-magic-context-patches`.
- **returns**: `{base0}`.

### Step 1.6 — Prepare the worktree's environment

- **runs in**: subagent general
- **action**: `run`
- **target**: `cd {W} && bun install --frozen-lockfile`
- **content**: `{A}` declares no bootstrap command (`package.json` scripts, no `Makefile`); its lockfile is `bun.lock`
  (`{C}/AGENTS.md` 7.7). `bun install --help | grep -- --frozen-lockfile` first. `{A}` reads no untracked runtime file
  (no `.env*`: `git -C {A} ls-files -o -i --exclude-standard | grep -v node_modules` → empty; 7.8 exempt, evidence recorded).
- **depends on**: 1.5
- **gates**: 1. exit 0; 2. `git -C {W} status --porcelain` → empty; 3. `bun --version` → `1.4.4`.
- **problems**: lockfile out of step → evidence of drift; stop, never drop the flag.
- **escalation**: the user, with the install output.
- **failure**: `rm -rf {W}/node_modules`.
- **returns**: the install summary line, versions.

### Step 1.7 — Copy the plan, open the session record

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/docs/sessions/{SID}.md` (and `{W}/docs/plans/2026-11-15-23-45-merge-magic-context-patches.md`)
- **content**: `cp` the scratch plan into `{W}/docs/plans/`; create the record: `# Session {SID}`, the plan's absolute
  path in `{A}` and its approved SHA-256, the line `Plan 2026-11-15-22-13-upstream-execute-threshold-minimum: withdrawn
  2026-11-16 (user decision 2026-11-15; step 0.3 evidence)`, and one checklist line per stage with every step `[ ]`
  except 0.1–0.3 and 1.1–1.6 `[x]`, each with its evidence block.
- **depends on**: 1.6
- **gates**: 1. `cmp` scratch vs copy → 0; 2. `cd {W} && bun run lint:diagrams` → no failure naming either file (D1's
  8 failures do not exist yet in `{W}`: step 2.1 brings that work in and step 2.2 fixes them).
- **problems**: the linter rejects a path reference → fix the record text.
- **escalation**: the launcher.
- **failure**: `git -C {W} clean -fd docs`.
- **returns**: `git -C {W} status --porcelain`.

### Step 1.8 — Bundles for `{M}`

- **runs in**: subagent general
- **action**: `run`
- **target**: `{X}/bundles/a-base.bundle`, `{X}/bundles/s-final.bundle`, copied to `{MX}/bundles/`
- **content**: `{base}` is not on GitHub, so `{M}` gets it as a bundle: `git -C {A} bundle create {X}/bundles/a-base.bundle
  main`; `git -C {S} bundle create {X}/bundles/s-final.bundle main`; `scp` both to `{MX}/bundles/`; on `{M}`:
  `git clone {MX}/bundles/a-base.bundle {MX}/a-base`, `git clone {MX}/bundles/s-final.bundle {MX}/s-final`;
  `bun install --frozen-lockfile` in each.
- **depends on**: 1.2, 1.5, 0.2
- **gates**: 1. `ssh msik15k 'git -C {MX}/a-base rev-parse HEAD'` = `{base}`; 2. `… {MX}/s-final …` = `{S-final}`;
  3. both installs exit 0 with empty `git status --porcelain`.
- **problems**: `bundle verify` fails → recreate.
- **escalation**: the launcher.
- **failure**: `ssh msik15k rm -rf {MX}/a-base {MX}/s-final {MX}/bundles`.
- **returns**: SHAs.

### Step 1.13 — Exempt working documents from lint L3

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{W}/scripts/lint-diagrams.mjs` and `{W}/AGENTS.md`
- **content**: in `scripts/lint-diagrams.mjs`, replace
  ```js
  const frozen = rel.split(/[\\/]/).slice(0, 2).join("/") === "docs/reference"
  for (const match of frozen ? [] : text.matchAll(pathRef)) if (!existsSync(join(ROOT, match[0]))) failures.push(`${rel}: referenced path does not exist: ${match[0]}`)
  ```
  with
  ```js
  const frozen = rel.split(/[\\/]/).slice(0, 2).join("/") === "docs/reference"
  // Plans describe files that do not exist yet and records must name deleted residue to prove its
  // absence; L3 cannot apply to either folder. Fences (L1) and mermaid (L2) still do.
  const working = ["docs/plans", "docs/sessions"].includes(rel.split(/[\\/]/).slice(0, 2).join("/"))
  for (const match of frozen || working ? [] : text.matchAll(pathRef)) if (!existsSync(join(ROOT, match[0]))) failures.push(`${rel}: referenced path does not exist: ${match[0]}`)
  ```
  and in `{W}/AGENTS.md` replace `that referenced paths exist (except under \`docs/reference/\`)` with
  `that referenced paths exist (except under \`docs/reference/\`, \`docs/plans/\` and \`docs/sessions/\`, which describe states other than the current tree)`. Then `cd {W} && bun run lint:diagrams`.
- **depends on**: 1.7
- **gates**: 1. `cd {W} && bun run lint:diagrams` → exit 0 (the record has no findings and the plan copy's 296 are L3, all else clean); 2. `git -C {W} diff --stat` names exactly the two files.
- **problems**: the linter reports a non-L3 finding on either document → fix the document text (plans and records must still be fence- and mermaid-clean).
- **escalation**: the launcher, with the linter output.
- **failure**: `git -C {W} checkout -- scripts/lint-diagrams.mjs AGENTS.md`.
- **returns**: the diff, the linter output.
- **evidence**: record section `1.13` in `{W}/docs/sessions/{SID}.md`, written by the launcher from the returns.

### Step 1.14 — Rebase the worktree onto the moved `main` (D30)

- **runs in**: subagent general
- **action**: `run`
- **target**: `{W}`
- **content**: `git -C {A} fetch origin`; record `git -C {A} rev-parse main origin/main` and
  `git -C {A} log --format='%h %ci %an %s' {base0}..main`; when `origin/main` is ahead of `main`, stop (local `main`
  is updated only by its owner). Then, because `feat-magic-context-patches` has no commit yet and `{W}` holds only
  step 1.7's two untracked documents and step 1.13's two edits:
  `git -C {W} stash push -m 'merge-plan 1.13' -- AGENTS.md scripts/lint-diagrams.mjs`;
  `git -C {W} merge --ff-only main` (with no commit on the branch, a fast-forward is the rebase);
  `git -C {W} stash pop`. When the pop conflicts in `AGENTS.md`, take `main`'s file with
  `git -C {W} checkout main -- AGENTS.md`, re-apply step 1.13's one-sentence replacement by its anchor, then
  `git -C {W} stash drop`. Then `cd {W} && bun install --frozen-lockfile`. Record `{base}` = `git -C {W} rev-parse HEAD`.
- **depends on**: 1.13
- **gates**: 1. `git -C {W} rev-parse HEAD` = `git -C {A} rev-parse main` = `git -C {A} ls-remote origin refs/heads/main | cut -f1`;
  2. `git -C {W} diff --stat` names exactly `AGENTS.md` and `scripts/lint-diagrams.mjs`, and `git -C {W} diff AGENTS.md`
  is exactly step 1.13's one-line change; 3. `git -C {W} status --porcelain` shows only those two `M` lines and the two
  `??` documents of step 1.7; 4. `git -C {W} stash list` → empty; 5. `bun install --frozen-lockfile` exit 0;
  6. `cd {W} && bun run lint:diagrams` → exit 0 and `bun run typecheck` → exit 0.
- **problems**: `origin/main` ahead of `main` → stop; the anchor of step 1.13 is gone from `main`'s `AGENTS.md` →
  stop (checked at planning: present once, `git show main:AGENTS.md | grep -c` → `1`); `merge --ff-only` refuses
  because an untracked document collides with a file of `main` → stop (checked at planning: `main` adds
  `docs/plans/2026-11-15-23-27-herdr-pane-agent.md`, a different name).
- **escalation**: the user, with the `git log` of the new commits and the failing output.
- **failure**: `git -C {W} reset --hard {base0}`, then `git -C {W} stash pop` if the stash still exists; the two
  documents are untracked and untouched.
- **returns**: `{base}`, the new commits, the diff of `AGENTS.md`.

### Step 1.15 — Back up D1's work again against `{base}`

- **runs in**: subagent general
- **action**: `run`
- **target**: `{X}/backup/a-wip-rebased.patch`
- **content**: `{A}`'s main checkout moved to `{base}` with D1 still uncommitted (both sides change `AGENTS.md` and
  `README.md`). Prove that only the base changed, then back it up: `git -C {A} worktree add --detach {X}/d1-proof
  {base}`; `git -C {X}/d1-proof apply --3way {X}/backup/a-wip.patch`; `tar -xpf {X}/backup/a-untracked.tar -C
  {X}/d1-proof`; for each of the 30 Appendix D paths `cmp {X}/d1-proof/<path> {A}/<path>` (for the folder
  `tests/support/repair/`, each file in it). Then `git -C {A} diff --binary > {X}/backup/a-wip-rebased.patch`,
  `chmod 600` it; compute `{D1}` with the Appendix D digest command in `{A}`. Then
  `git -C {A} worktree remove --force {X}/d1-proof && git -C {A} worktree prune`.
- **depends on**: 1.14
- **gates**: 1. the three-way apply exits 0 and every `cmp` exits 0 (D1 in `{A}` is the backed-up D1 on the new base);
  2. `git -C {A} apply --check -R {X}/backup/a-wip-rebased.patch` → exit 0; 3. `git -C {A} ls-files -o
  --exclude-standard | wc -l` → `12` and the 12 files `cmp`-equal their copies in `a-untracked.tar`;
  4. `test ! -e {X}/d1-proof` → 0 and `git -C {A} worktree list` does not name it; 5. `{D1}` recorded.
- **problems**: the three-way apply conflicts, or a `cmp` differs → D1 changed beyond the rebase (someone edited it)
  → stop.
- **escalation**: the user: "D1's work in `{A}` differs from the backup of step 1.3 beyond the rebase: <files>. Use
  the current files?" with `diff` of each differing file.
- **failure**: `git -C {A} worktree remove --force {X}/d1-proof; git -C {A} worktree prune`; delete
  `{X}/backup/a-wip-rebased.patch`. `{A}`'s main checkout is only read.
- **returns**: `{D1}`, the `cmp` results, the patch's sha256.

### Step 1.16 — Take the `{A}` baselines again at `{base}`

- **runs in**: subagent general
- **action**: `run`
- **target**: `{X}/gates/baseline-mac/`, `{MX}/gates/baseline-linux-a/` (and its copy in `{X}`), `{X}/bundles/a-base.bundle`
- **content**: keep the first runs as evidence: `mv {X}/gates/baseline-mac {X}/gates/baseline-mac-base0`,
  `mv {X}/gates/baseline-linux-a {X}/gates/baseline-linux-a-base0`, the same in `{MX}`. Then step 1.8's `{A}` half at
  `{base}`: `git -C {A} bundle create {X}/bundles/a-base.bundle main` (overwrites), `scp` to `{MX}/bundles/`,
  `ssh msik15k rm -rf {MX}/a-base`, `git clone {MX}/bundles/a-base.bundle {MX}/a-base`, `bun install
  --frozen-lockfile` there. Then step 1.9 (macOS, in `{W}`) and step 1.10 (Linux, in `{MX}/a-base`) exactly as
  written, into the original folder names, with step 1.9's gate 3 as revision 3 states it.
- **depends on**: 1.14
- **gates**: 1. `ssh msik15k 'git -C {MX}/a-base rev-parse HEAD'` = `{base}`; 2. the gates of step 1.9; 3. the gates
  of step 1.10; 4. per command, the failing names that are new against the `-base0` run are listed with their printed
  cause (expected: only tests the herdr commit added or changed).
- **problems**: a new failure outside the herdr files → the base itself regressed; record it as pre-existing at
  `{base}` (`{C}/AGENTS.md` 3.8), never as this plan's.
- **escalation**: the user, with the new failures and their causes.
- **failure**: the `-base0` folders stay; delete the new ones and run again.
- **returns**: as steps 1.9 and 1.10, plus the new-against-base0 list.

### Step 1.9 — Baseline, macOS, `{A}`

- **runs in**: subagent general
- **action**: `run`
- **target**: `GATE` in `{W}`, outputs to `{X}/gates/baseline-mac/`
- **content**: `GATE`; then `FAILS` of each output into `<name>.fails`.
- **depends on**: 1.7, 1.13
- **gates**: 1. every command ran to completion (an `.exit` file per command); 2. every failing name is classified as
  `darwin-unsupported` (output shows `UnsupportedPlatformError`), `proc` (reads `/proc`), `no-darwin-coverage-config`
  (`coverage:e2e` prints `no e2e coverage configuration for darwin`) or `other`; 3. every `other` failure carries its
  printed cause and names the step that repairs it (D29: the `tmpdir()`/`realpath` class and the missing-precondition
  class are repaired by step 4.3); an `other` failure without a cause, or without a repairing step, fails the gate.
- **problems**: `test:live` needs Herdr or a TUI → its failures are classified with their printed cause; an `other`
  failure stops the step.
- **escalation**: the launcher, then the user: "Baseline on macOS has unexplained failures: …" with the names and
  output excerpts.
- **failure**: read-only (tests write only to their own temporary folders; step 12.1 checks).
- **returns**: per command the pass/fail counts and the classified failure list, for Appendix A.

### Step 1.10 — Baseline, Linux, `{A}`

- **runs in**: subagent general
- **action**: `run`
- **target**: `GATE` in `{MX}/a-base`, outputs to `{MX}/gates/baseline-linux-a/`, copied back to `{X}/gates/baseline-linux-a/`
- **content**: as 1.9, on `{M}` over ssh, with `PATH=$HOME/.bun/bin:$PATH`.
- **depends on**: 1.8
- **gates**: 1. every command ran to completion; 2. every failure has its printed cause recorded; 3. `coverage:unit`
  and `coverage:e2e` report every file at 100 % lines and functions or the exceptions are listed by file.
- **problems**: a live test needs a display or Herdr → recorded as its cause.
- **escalation**: as 1.9.
- **failure**: read-only.
- **returns**: as 1.9.

### Step 1.11 — Baseline, Linux, `{S}`

- **runs in**: subagent general
- **action**: `run`
- **target**: in `{MX}/s-final`: `bun run typecheck`, `bun run lint:docs`, `bun run coverage:unit`, `bun run coverage:e2e`,
  `bun run test:component`, `bun run test:live`; outputs to `{MX}/gates/baseline-linux-s/`, copied back
- **content**: the six commands, each with output and exit files; `FAILS` of each.
- **depends on**: 1.8
- **gates**: 1. every command ran to completion; 2. failures recorded with causes. (macOS baseline of `{S}` is
  Appendix A of plan 2026-11-15-22-13: unit 228/1, e2e 38/19, component 3/1, live 3/4.)
- **problems**: live tests on `{M}` touch the real units → `test:live` of `{S}` is read-only on the units (it runs
  `systemctl --user is-enabled`), verified by reading `tests/live/live.test.ts` first.
- **escalation**: as 1.9.
- **failure**: read-only.
- **returns**: as 1.9.

### Step 1.12 — Review the baselines

- **runs in**: main session (review of delegated results)
- **action**: `review`
- **target**: `{X}/gates/baseline-*/`
- **content**: re-run `FAILS` on two outputs of each set and compare with the returned lists; write Appendix A rows
  into the session record.
- **depends on**: 1.11, 1.16
- **gates**: 1. re-computed lists `cmp`-equal the returned ones.
- **problems**: a mismatch → the subagent summarised wrongly; re-run the subagent step.
- **escalation**: the user, if a re-run disagrees again.
- **failure**: record-only.
- **returns**: —

## Stage 2 — Finish the uncommitted location-repair work (D1)

**Why.** D1: the work in `{A}`'s main checkout (Appendix D) touches `AGENTS.md`, `README.md`,
`src/main/cli-container.ts` and `HelpCliAdapter.ts`, which the merge also changes; committing it first gives the
merge a clean base. It fails `lint:diagrams` with 8 named findings today.

**What.** One commit on `feat-magic-context-patches` holding D1's work plus the 8 source-map entries, green on Linux
against Appendix A and with no new failure on macOS.

**Stage gate.** `git -C {W} log -1 --format=%s` = `Location repair: worktree links, finished`; Linux `GATE` on that
commit shows no failure absent from Appendix A row `linux-a`, `coverage:unit` and `coverage:e2e` at 100 % per file;
macOS `typecheck` and `lint:diagrams` exit 0.

### Step 2.1 — Transplant D1's work into the worktree

- **runs in**: subagent general
- **action**: `run`
- **target**: `{W}`
- **content**: `git -C {W} apply {X}/backup/a-wip-rebased.patch`; `tar -xpf {X}/backup/a-untracked.tar -C {W}`;
  recompute the Appendix D digest in `{W}`.
- **depends on**: 1.12, 1.15
- **gates**: 1. each of D1's 30 paths in `{W}` `cmp`-equals the same path in `{A}`, except `AGENTS.md`, which equals
  `{A}/AGENTS.md` with step 1.13's sentence re-applied (`diff` shows exactly that line); 2. `git -C {W} status
  --porcelain` shows D1's 18 `M` and 12 `??` entries plus `scripts/lint-diagrams.mjs` and step 1.7's two documents.
- **problems**: the patch does not apply (main moved under it) → stop.
- **escalation**: the user, with `git apply` output.
- **failure**: `git -C {W} checkout -- . && git -C {W} clean -fd` (worktree only).
- **returns**: digest, status.

### Step 2.2 — Name the eight files in `AGENTS.md`

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{W}/AGENTS.md`
- **content**: add the six src files of Appendix D to the source map tables of their layer, in the existing row
  format (`| path | responsibility |`), each with a one-sentence responsibility read from the file's own doc comment:
  `src/application/RepairWorktreeLinksUseCase.ts`, `src/domain/model/GitWorktree.ts`,
  `src/domain/ports/inbound/RepairWorktreeLinksPort.ts`, `src/domain/ports/outbound/GitWorktreePort.ts`,
  `src/domain/services/WorktreeRepairPlanner.ts`, `src/infrastructure/adapters/outbound/project/GitWorktreeAdapter.ts`;
  add `tests/support/live/drive-repair.mjs` and `tests/support/repair/repair-process.ts` to the test support table.
- **depends on**: 2.1
- **gates**: 1. `cd {W} && bun run lint:diagrams` → exit 0; 2. `bun run typecheck` → exit 0.
- **problems**: the linter wants another table → follow its message.
- **escalation**: the launcher.
- **failure**: `git -C {W} checkout -- AGENTS.md` then re-apply 2.1's patch to it.
- **returns**: the diff.

### Step 2.3 — Commit

- **runs in**: subagent general
- **action**: `run`
- **target**: `git -C {W} -c user.name="Marco Augusto Vásquez Beltrán" -c user.email=m.a.vasbel@epistelabs.com commit`
- **content**: `git -C {W} add -A`; commit with subject `Location repair: worktree links, finished` and a body naming
  the 30 entries' purpose in two lines (the repository's style: `git -C {A} log --format=%s -10` is sentence-case
  `Area: sentence`).
- **depends on**: 2.2
- **gates**: 1. `git -C {W} status --porcelain` → empty; 2. `git -C {W} log -1 --format='%an <%ae>|%cn <%ce>'` →
  `Marco Augusto Vásquez Beltrán <m.a.vasbel@epistelabs.com>|Marco Augusto Vásquez Beltrán <m.a.vasbel@epistelabs.com>`.
- **problems**: none foreseen beyond identity, handled by `-c`.
- **escalation**: the launcher.
- **failure**: `git -C {W} reset --soft HEAD~1`.
- **returns**: commit SHA `{c2}`.

### Step 2.4 — Gate D1 on Linux, fix what it breaks

- **runs in**: subagent general
- **action**: `run`
- **target**: `{MX}/a-wip` on `{M}`
- **content**: `git -C {W} bundle create {X}/bundles/a-c2.bundle {base}..feat-magic-context-patches`; copy; on `{M}`:
  `git clone {MX}/bundles/a-base.bundle {MX}/a-wip && git -C {MX}/a-wip pull {MX}/bundles/a-c2.bundle feat-magic-context-patches`;
  `bun install --frozen-lockfile`; `GATE` into `{MX}/gates/d1-linux/`. When a failure is new against Appendix A
  `linux-a`, fix it in `{W}` as a new commit `Location repair: <what>` with `{IDENT}`, and repeat this step.
- **depends on**: 2.3
- **gates**: 1. `FAILS` of every output ⊆ Appendix A `linux-a` list for the same command; 2. `coverage:unit` and
  `coverage:e2e` report no file below 100 % lines or functions; 3. `lint:diagrams` exit 0.
- **problems**: a fix needs a behaviour decision (what a repair should do) → never guessed.
- **escalation**: the user: "D1's work fails `<test>` on Linux because `<cause>`; which behaviour is intended?" with
  the output excerpt.
- **failure**: `git -C {W} reset --hard {c2}` (worktree only); `ssh msik15k rm -rf {MX}/a-wip`.
- **returns**: the fix commits, the four comparisons.

### Step 2.5 — Review Stage 2

- **runs in**: main session (review)
- **action**: `review`
- **target**: `{W}` log and `{X}/gates/d1-linux/`
- **content**: re-run `FAILS` and the coverage greps myself on the copied outputs; on macOS run `bun run typecheck`
  and `bun run lint:diagrams` in `{W}`.
- **depends on**: 2.4
- **gates**: the stage gate.
- **problems**: disagreement → re-run 2.4.
- **escalation**: the user, if the re-run disagrees.
- **failure**: record-only.
- **returns**: —

## Stage 3 — Design trees

**Why.** `{C}/AGENTS.md` 6.1 and 6.2: the product tree and the architecture tree come before code; `{A}` has no
`docs/design/` yet (`ls {A}/docs` → `plans reference research sessions`). They fix the names Stage 4 and 5 use.

**What.** `{W}/docs/design/<ts>-session-manager-product-tree.md` and `{W}/docs/design/<ts>-session-manager-architecture-tree.md`
(`<ts>` from `date +%Y-%m-%d-%H-%M` at writing), covering the whole tool at the level its `AGENTS.md` already
describes, with the `patches` group, the darwin platform and the watch at leaf level; Appendix F completed.

**Stage gate.** `bun run lint:diagrams` → exit 0; every leaf use case of the product tree appears in Appendix F with
a test file per tier; every class/module named in the architecture tree appears in Appendix E or in `{A}` already.

### Step 3.1 — Product tree

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/docs/design/<ts>-session-manager-product-tree.md`
- **content**: purpose → features → use cases → components and interfaces → data and states. Features: the existing
  ones of `{A}` named in its `README.md` sections (sessions, sync, transfer, relocate/repair, maintenance, browser,
  Herdr pane, plugin) at feature level with a link to their README section; `patches` with use cases U1–U11 of
  Appendix F at leaf level, each with purpose, contract (inputs, outputs, failure modes taken from Appendix B's exit
  codes and the old `README.md` sections) and acceptance criteria (the scenarios of Appendix F); `platform` with
  darwin's process list and holders.
- **depends on**: 2.5 (the file map is the plan's Appendix E)
- **gates**: 1. file exists; 2. `grep -c '^#### U' file` → `11` plus the darwin use cases (`U12`, `U13`); 3. lint 0.
- **problems**: an old behaviour has no README source → name the source file and line instead.
- **escalation**: the launcher.
- **failure**: delete the file.
- **returns**: path, digest.

### Step 3.2 — Architecture tree

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/docs/design/<ts>-session-manager-architecture-tree.md`
- **content**: repository → packages (`src/domain`, `src/application`, `src/infrastructure`, `src/main`) → modules →
  classes → methods for every file Appendix E creates or moves, with for each: the product node it serves, one-sentence
  responsibility, public interface, dependencies (ports only), test directory. Existing `{A}` modules appear at module
  level with a pointer to `AGENTS.md`.
- **depends on**: 3.1
- **gates**: 1. every Appendix E target path appears once; 2. lint 0.
- **problems**: a moved class depends on a concrete adapter → Appendix E must split a port first; stop and re-plan.
- **escalation**: the plan author (re-plan of Appendix E), then the user.
- **failure**: delete the file.
- **returns**: path, digest, count of nodes.

### Step 3.3 — Review the trees against the request

- **runs in**: main session (review)
- **action**: `review`
- **target**: both trees, Appendix B, Appendix E, Appendix F
- **content**: every Appendix B command/flag/exit code has a use case; every use case has scenarios in every tier
  that covers it, including a negative one; every D-decision is reflected.
- **depends on**: 3.2
- **gates**: the stage gate.
- **problems**: a gap → back to 3.1/3.2.
- **escalation**: the user for a behaviour question.
- **failure**: record-only.
- **returns**: —

## Stage 4 — darwin as a full platform (D5)

**Why.** D5. The merged `patches` commands must run on this Mac, and `{A}`'s CLI exits 1 on darwin before routing
(`src/main/cli/platform.ts`, `LOADERS`). `{A}`'s platform law (its `AGENTS.md`, section on platforms): a platform's
code lives only in `src/infrastructure/adapters/outbound/platform/<platform>/` and `src/main/<platform>-container.ts`,
loaded on demand, gated by its own e2e coverage configuration.

**What.**
- `src/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter.ts` — `implements ProcessListPort`;
  constructor `(psPath: string)`; `list(image)` runs `LC_ALL=C <psPath> -axo pid=,comm=` (spawnSync, stdout utf8) and
  returns `{ image, pid }` for each line whose `basename(comm)` equals `image` (macOS `comm` is the executable path:
  `/opt/homebrew/Cellar/opencode/2.3.0/bin/opencode`).
- `src/infrastructure/adapters/outbound/platform/darwin/LsofHoldersAdapter.ts` — `implements DatabaseHoldersPort`;
  constructor `(lsofPath: string)`; `heldBy(dbPath)` runs `<lsofPath> -nP -F pc -- <each of db, -wal, -shm, -journal
  that exists>`; exit 1 with empty stdout means no holder → `null`; otherwise `"<command> <pid>"` joined by `, `,
  the tool's own process included (same contract as `ProcFdHoldersAdapter`).
- `src/main/darwin-container.ts` — `export const darwinAdapters: PlatformFactory` returning
  `{ processes: new PsProcessListAdapter("/bin/ps"), holders: new LsofHoldersAdapter("/usr/sbin/lsof"), image: "opencode" }`,
  plus the darwin halves of the `patches` platform ports added by step 5.6.
- `src/main/cli/platform.ts` — `LOADERS.darwin`.
- `tests/support/source-files.ts` — `PLATFORMS = ["linux", "win32", "darwin"]`.
- the four tests that pin the platform list (Appendix E, rules C4, C8, C9, I9):
  `tests/unit/maintenance/infrastructure/platform.test.ts:145-163` (`SUPPORTED_PLATFORMS` = `["linux","win32","darwin"]`;
  the refusal case uses `freebsd`: `unsupported platform: freebsd (supported: linux, win32, darwin)`),
  `tests/e2e/maintenance/failures.test.ts:183-199` (the same refusal with `freebsd`; the loop wires darwin too),
  `tests/unit/architecture/imports.test.ts:99-107` (the container list adds `main/darwin-container.ts`; step 5.7 adds
  `main/patches-container.ts`), `tests/unit/maintenance/architecture.test.ts:11-16, :29-39` (folders and containers
  equal the three platforms). One `SUPPORTED_PLATFORMS` serves both meanings, because darwin has every adapter (D5).
- `bunfig.coverage.e2e-darwin.toml` — as `bunfig.coverage.e2e-linux.toml`, ignoring the `linux/` and `win32/` folders
  and `src/main/{linux,win32}-container.ts`; the linux and win32 configurations add the `darwin/` folder and
  `src/main/darwin-container.ts` to their ignores.
- tests: `tests/unit/maintenance/infrastructure/darwin-adapters.test.ts` (stand-in `ps`/`lsof` scripts: one match,
  none, malformed line, non-zero exit, missing executable, sidecar holder, own pid); the e2e tests that today read
  `/proc` run on darwin through the darwin container unchanged; tests that read the real `/proc` directly
  (`ProcFdHoldersAdapter names every holder…`) run only where `process.platform === "linux"`, using the mechanism the
  win32 tests already use (step 4.1 reads it).
- D29 (tests separate OS-specific from common code):
  - `tests/support/platform.ts` — `onlyOn(platform: NodeJS.Platform)` and `requires(present: boolean, reason: string)`,
    each returning the `describe.skipIf`/`it.skipIf` condition with its reason printed in the test name; the only
    test file allowed to read `process.platform`;
  - every test of a `src/infrastructure/adapters/outbound/platform/<p>/` adapter moves to `tests/unit/platform/<p>/`,
    with `git mv` (names from step 4.1's table); `darwin-adapters.test.ts` is created there, not under `maintenance/`;
  - `tests/unit/architecture/imports.test.ts` gains rule I12: outside `tests/support/platform.ts` and
    `tests/unit/platform/<p>/`, no test file contains `process.platform`;
  - every test that compares a path built from `tmpdir()` with a path the code resolved uses
    `realpathSync(tmpdir())` (the 4 macOS `other` failures of Appendix A `mac`);
  - every live test that needs Herdr or the installed plugin is guarded by `requires(...)` with the reason.
  - `AGENTS.md` testing section names the helper, the folder rule and I12.
- `AGENTS.md` (platform table row `CLI platforms`: `Linux, Windows and macOS (linux, win32, darwin)`, the platform law
  paragraph, the adapter table) and `README.md` (supported platforms).

**Stage gate.** On this Mac: `bun run coverage:e2e` in `{W}` reports every darwin-measured file at 100 % lines and
functions and no failure; `bun run coverage:unit` 100 %; `bun src/main/cli/cli.ts --help` exits 0. On `{M}`: `GATE`
shows no failure absent from Appendix A `linux-a`.

### Step 4.1 — Read how platform-only tests are gated

- **runs in**: subagent explore
- **action**: `read`
- **target**: `{W}/tests` (files listed by `grep -rln "process.platform" {W}/tests`: 17 files)
- **content**: learn the existing idiom (e.g. `describe.if`, `it.skipIf`, a helper in `tests/support/maintenance/platform.ts`)
  and list every test that reads `/proc`, runs `tasklist`, or otherwise needs one OS; for each, the OS it needs.
  Also list (D29): every test file of a `outbound/platform/<p>/` adapter with its target under `tests/unit/platform/<p>/`;
  every test that compares a `tmpdir()`-built path with a resolved one; every live test that needs Herdr or the
  installed plugin.
- **depends on**: 3.3
- **gates**: 1. a table `test file | test name | OS | idiom` covering all 17 files; 2. the three D29 lists, each
  row with file and line; the 6 `other` failures of Appendix A `mac` each appear in exactly one list.
- **problems**: two idioms in use → report both; step 4.3 uses the one in `tests/support`.
- **escalation**: the launcher.
- **failure**: read-only.
- **returns**: the table.

### Step 4.2 — Darwin adapters and container

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/src/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter.ts`
  (and in the same step `LsofHoldersAdapter.ts`, `src/main/darwin-container.ts`, the `LOADERS` line, `PLATFORMS`, the three bunfig files)
- **content**: the What list above, in `{A}`'s style (doc comment per class, explicit constructor, `implements`).
- **depends on**: 4.1
- **gates**: 1. `bun run typecheck` → 0; 2. `bun test tests/unit/architecture` → 0 fail; 3. `bun src/main/cli/cli.ts --help`
  → exit 0 on this Mac.
- **problems**: `ps -o comm` truncates long paths on macOS → measured: `ps -axo pid=,comm= | grep opencode` shows the
  full path (2026-11-15); a truncated basename would fail gate 3 of 4.4 and is handled by matching `args` first token.
- **escalation**: the launcher.
- **failure**: `git -C {W} checkout -- . && git -C {W} clean -fd src tests bunfig*` (uncommitted changes of this stage only).
- **returns**: diff stat.

### Step 4.3 — Darwin tests and platform gating

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/tests/unit/maintenance/infrastructure/darwin-adapters.test.ts` (and the gating edits from 4.1's table)
- **content**: the seven unit scenarios of the What list, each negative path included; create
  `tests/support/platform.ts` (D29) and gate every OS-only test of 4.1's table with `onlyOn`, every precondition test
  with `requires`; `git mv` the platform-adapter tests to `tests/unit/platform/<p>/`; add rule I12 to
  `tests/unit/architecture/imports.test.ts`; apply `realpathSync(tmpdir())` to the tests of 4.1's tmpdir list; name
  the helper and I12 in `AGENTS.md` and `tests/support/platform.ts` in its test support table.
- **depends on**: 4.2
- **gates**: 1. `bun run coverage:unit` → 0 fail, 100 % per file; 2. `bun run coverage:e2e` (darwin) → 0 fail, 100 %
  per darwin-measured file; 3. `bun run test:component` → 0 fail; 4. `grep -rln 'process.platform' {W}/tests` lists
  only `tests/support/platform.ts` and files under `tests/unit/platform/`; 5. I12 fails on a crafted file that reads
  `process.platform` outside them (written to `{X}`, copied in, run, removed, `test ! -e`); 6. the 4 `tmpdir()`
  failures of Appendix A `mac` pass, the 2 precondition failures print as skips with their reason; 7. `bun run
  lint:diagrams` → 0.
- **problems**: an e2e test asserts Linux `comm` truncation (15 characters) → gate it to linux with the reason in a comment.
- **escalation**: the launcher, then the user for behaviour.
- **failure**: as 4.2.
- **returns**: counts, coverage tables' last lines.

### Step 4.4 — Live check of the darwin adapters

- **runs in**: subagent general
- **action**: `run`
- **target**: `bun run test:live` in `{W}` on this Mac, plus
  `bun -e 'import {PsProcessListAdapter} from "./src/infrastructure/adapters/outbound/platform/darwin/PsProcessListAdapter"; console.log(new PsProcessListAdapter("/bin/ps").list("opencode"))'`
- **content**: the two commands; then `lsof` the live OpenCode database through the adapter the same way.
- **depends on**: 4.3
- **gates**: 1. the process list contains the running server's pid (`pgrep -f 'opencode serve'`); 2. `heldBy(~/.local/share/opencode/opencode.db)`
  is non-null and names that pid; 3. `test:live` failures ⊆ Appendix A `mac` live list minus the
  `darwin-unsupported` ones.
- **problems**: no server running → start nothing; record and ask.
- **escalation**: the user: "No OpenCode server is running; start one for the live check?"
- **failure**: read-only.
- **returns**: outputs.

### Step 4.5 — Commit and Linux check

- **runs in**: subagent general
- **action**: `run`
- **target**: commit `Platform: macOS (darwin) as a supported platform` with `{IDENT}`; Linux `GATE` as in 2.4 into
  `{MX}/gates/darwin-linux/`; also `AGENTS.md`/`README.md` edits of the What list before committing
- **content**: as 2.3 and 2.4.
- **depends on**: 4.4
- **gates**: 1. `lint:diagrams` 0; 2. Linux `FAILS` ⊆ Appendix A `linux-a`; coverage 100 % per file on Linux.
- **problems**: the linux e2e config now ignores `darwin/` → a missing ignore shows as a darwin file below 100 % on Linux.
- **escalation**: the launcher.
- **failure**: `git -C {W} reset --hard HEAD~1`.
- **returns**: SHA `{c4}`, comparisons.

### Step 4.6 — Review Stage 4

- **runs in**: main session (review)
- **action**: `review`
- **target**: `git -C {W} show --stat {c4}`; `{X}/gates/darwin-*`
- **content**: re-run `bun run coverage:e2e` myself on this Mac and compare totals.
- **depends on**: 4.5
- **gates**: the stage gate.
- **problems**: disagreement → re-run 4.3.
- **escalation**: the user.
- **failure**: record-only.
- **returns**: —

## Stage 5 — The `patches` command group (D2, D3, D7, D13, D14)

**Why.** D2, D3: every behaviour of the old tool moves into `{A}` under `{A}`'s rules (Appendix E, section
"Rules that constrain the move"), with no behaviour lost (Appendix B) and no rule relaxed.

**What.** Appendix E applied in full: every row of its file map, its new files, its edits to `{A}` files, its
collision resolutions; `compareVersions` in semver order (D7); the Arborist root-cause fix; a rollback guard; the
three macOS test defects fixed; `@npmcli/arborist` 9.4.0 a direct dependency; the old documents imported frozen;
the file map committed as a reference document.

**Stage gate.** On this Mac in `{W}`: `GATE` with `typecheck`, `lint:diagrams`, `coverage:unit`, `test:component`
all exit 0; `coverage:e2e` has 0 test failures with every plan-created/edited file at 100 % funcs and 100 % lines
(exit 1 is accepted solely from the line-coverage threshold on exactly the pinned 23-file pre-existing base set —
Revision 7; the 23 base files are out of scope); `test:live` failures ⊆ Appendix A `mac` live list (judged on the
run with `OPENCODE_SESSION_MANAGER_BIN_DIR={X}/bin` and
`OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN=/opt/homebrew/bin/opencode`); every Appendix B row
reproduced by `tests/e2e/patches/cli-surface.test.ts`. On `{M}`: waived under D31 (Revision 7).
`git -C {W} log --format=%s {c4}..` lists exactly the six subjects of steps 5.1,
5.2, 5.7, 5.8, 5.9, 5.10.

### Step 5.1 — The file map as a reference document

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/docs/reference/<ts>-magic-context-patches-merge-file-map.md`
- **content**: line 1 `# File map: opencode-magic-context-patches imported into opencode-session-manager`; line 3
  `{S-final}` and `{base}` full SHAs; from line 5 the plan's Appendix E body (every line after its heading up to the
  line before `## Appendix F`, trailing blank lines dropped) with each heading promoted one level
  (`sed -E 's/^#(#+ )/\1/'`). Then commit `Docs: file map of the opencode-magic-context-patches import` with `{IDENT}`.
- **depends on**: 4.6
- **gates**: 1. `diff <(sed -n '/^## Appendix E/,/^## Appendix F/{/^## Appendix/d;p;}' <plan> | sed -E 's/^#(#+ )/\1/' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}') <(tail -n +5 <doc>)`
  → empty; 2. `bun run lint:diagrams` → 0.
- **problems**: `docs/reference/` is exempt from the path check (Appendix E rule L3), so `{S}` paths are allowed;
  a fence imbalance (L1) is fixed in the plan's Appendix E first, then the document is regenerated.
- **escalation**: the launcher.
- **failure**: `git -C {W} reset --hard {c4}`.
- **returns**: SHA.

### Step 5.2 — One `compareVersions` in semver order (D7)

- **runs in**: subagent general
- **action**: `edit`
- **target**: the `{A}` definition named in Appendix E section "compareVersions"
- **content**: semver 2.0.0 §11: compare major.minor.patch numerically; a version with a pre-release is lower than
  the same version without; pre-release identifiers compared left to right, numeric ones numerically, alphanumeric
  ones in ASCII order, numeric lower than alphanumeric, a longer set higher when all preceding are equal; build
  metadata ignored. Update every assertion Appendix E lists (`1.0.0-beta.1` vs `1.0.0` becomes `-1`), add the §11
  example chain `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 <
  1.0.0-rc.1 < 1.0.0` as a unit test. Commit `Versions: semver 2.0.0 order` with `{IDENT}` before the import commit.
- **depends on**: 5.1
- **gates**: 1. `bun run coverage:unit` → 0 fail, 100 %; 2. `bun run test:component` and `bun run test:e2e` → no new
  failure against the run at `{c4}`.
- **problems**: a caller relied on equality of pre-release and release (the browser's "newer on npm" header) → Magic
  Context has published 0 pre-releases (`npm view @cortexkit/opencode-magic-context versions --json | grep -c -- -` → 0,
  checked again in this step), so no visible change; record the check.
- **escalation**: the user, if a pre-release exists by then.
- **failure**: `git -C {W} reset --hard HEAD~1`.
- **returns**: SHA, the changed assertions.

### Step 5.3 — Import the data: fixtures, patch definitions, frozen documents

- **runs in**: subagent general
- **action**: `move` (copy from `{S}` at `{S-final}`, which stays untouched until Stage 11)
- **target**: the Appendix E rows whose action is `move` for `tests/fixtures/**`, `patches/**` and `docs/**`
- **content**: `git -C {S} archive {S-final} <paths> | tar -x -C {X}/import`; then place each file at its Appendix E
  target; compare every file `cmp` against `git -C {S} show {S-final}:<path>` except the rows marked `move+rename`
  whose import specifiers change (patch definitions), which are compared after `sed` of the alias only.
- **depends on**: 5.2
- **gates**: 1. a per-file table `S path | A path | cmp` with every row `0`, row count = Appendix E data rows;
  2. `find {W}/tests/support/patches/fixtures -type f | wc -l` → `109` and `du -sk` of it ≈ 50,698 KB (51,914,489 B; ±1 %); 3. no file staged yet.
- **problems**: a fixture path collides with an existing `{A}` file → Appendix E "Collisions" row 12 found none
  (`{A}` has no `tests/fixtures/`); a new collision stops the step.
- **escalation**: the plan author.
- **failure**: `git -C {W} clean -fd tests/fixtures src docs` restricted to the targets listed.
- **returns**: the table.

### Step 5.4 — Domain

- **runs in**: subagent general
- **action**: `create`
- **target**: the Appendix E rows of `src/domain/**` from `{S}` (models, rules, ports split one per file)
- **content**: move and adapt per Appendix E: aliases `@mc-patches/…` → `@session-manager/…`, `@patches/…` →
  `@session-manager/domain/patch-definitions/…`, every multi-port file split one port per file (`Patch` prefix, D20),
  names per Appendix E "Collisions", the extracted files of Appendix E "New files" (`PatchTargets.ts`,
  `PatchRefusals.ts`, `FollowRules.ts`, `ProcessLivenessPort.ts`). `Jsonc.ts`: `{S}`'s functions merged into `{A}`'s,
  and `pinnedMagicContext` re-based on `pinnedSpec` (D21): a folder entry yields the folder, and the browser's
  installed-version lookup reads `<folder>/package.json` for it; unit tests for an npm spec, a folder, a commented
  entry and no entry.
- **depends on**: 5.2, 5.3
- **gates**: 1. `bun run typecheck` limited to these files compiles (`tsc --noEmit` whole project may still fail on
  missing application files: record and continue); 2. `bun test tests/unit/architecture/imports.test.ts` → no finding
  in a new domain file.
- **problems**: a domain file imports `node:` → Appendix E must move it; stop.
- **escalation**: the plan author.
- **failure**: delete the created files.
- **returns**: file list.

### Step 5.5 — Application

- **runs in**: subagent general
- **action**: `create`
- **target**: the Appendix E rows of `src/application/**` from `{S}` (use cases, services, `follow/*`)
- **content**: as 5.4; every use case `implements` its inbound port; dependencies are port types only.
- **depends on**: 5.4
- **gates**: 1. `bun test tests/unit/architecture` → no finding in a new application file.
- **problems**: a use case constructs a collaborator with `new` → `{A}`'s rule allows `new` only in `main/*-container.ts`;
  Appendix E names the injection; stop if not.
- **escalation**: the plan author.
- **failure**: delete the created files.
- **returns**: file list.

### Step 5.6 — Adapters, per platform where the OS differs (D14)

- **runs in**: subagent general
- **action**: `create`
- **target**: the Appendix E rows of `src/infrastructure/**` (inbound CLI adapter for the group, outbound adapters) and
  the new platform adapters of Appendix E section "New files"
- **content**: the OS-specific behaviours become ports with one adapter per platform:
  | Behaviour | linux | darwin | win32 |
  |---|---|---|---|
  | start time of the newest `opencode … serve` | `/proc/<pid>/stat` field 22 ÷ `getconf CLK_TCK` + boot time (as `{S}`) | `LC_ALL=C ps -axo pid=,lstart=,args=` | `powershell -NoProfile -Command "Get-CimInstance Win32_Process … CreationDate"` |
  | is a lock owner alive | `/proc/<pid>` exists | `kill -0 <pid>` (`process.kill(pid, 0)`) | `Get-Process -Id <pid>` |
  | desktop notification | `notify-send` | `osascript -e 'display notification "<body>" with title "<title>"'` | PowerShell toast (`[Windows.UI.Notifications.ToastNotificationManager]`) |
  Adapter names (Appendix E "New files"): linux `ProcServiceAdapter` (moved), `ProcLivenessAdapter`,
  `NotifySendAdapter` (moved; `--app-name=opencode-session-manager`, D19); darwin `PsServiceAdapter`,
  `KillZeroLivenessAdapter`, `OsascriptNotifierAdapter`; win32 `CimServiceAdapter`, `GetProcessLivenessAdapter`,
  `PowerShellToastNotifierAdapter`. Each adapter takes its executable path in its constructor (stand-ins in unit
  tests). The configuration file is the one `{A}` resolves, `opencode.jsonc` else `opencode.json` (D22). Wired in
  `src/main/{linux,darwin,win32}-container.ts` through `PlatformAdapters` (Appendix E edit row).
  Environment names per D13: `OPENCODE_SESSION_MANAGER_PATCHES_{TIMEOUT_MS,SETTLE_MS,NOTIFY_BIN,PROC,REGISTRY,OPENCODE_BIN}`;
  `MAGIC_CONTEXT_LOG_PATH` keeps its name (Magic Context's own variable). Folders per D13: `{PD}` (backups,
  installs, derived-releases.json), `{PS}` (audit.log, evidence, follow.lock, follow-previous-entry, notification state).
  The OpenCode binary default: `~/.opencode/bin/opencode` when it exists, else the first `opencode` on `PATH` (this
  Mac: `/opt/homebrew/bin/opencode`; `{M}`: `~/.opencode/bin/opencode`).
- **depends on**: 5.5
- **gates**: 1. `bun run typecheck` → 0; 2. `bun test tests/unit/architecture tests/unit/maintenance/architecture.test.ts`
  → 0 fail; 3. on this Mac, `PsServiceAdapter` against `/bin/ps` returns the start of `pgrep -f 'opencode serve'`
  equal to `LC_ALL=C ps -o lstart= -p <pid>` converted to UTC (whole seconds; the one-second window is recorded).
- **problems**: the win32 notification needs an AppUserModelID → use PowerShell's own (`{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe`)
  and record that it is unverified on hardware (D14, blocked).
- **escalation**: the launcher.
- **failure**: delete the created files.
- **returns**: file list.

### Step 5.7 — Tests, wiring, CLI group, dependency: the import commit

- **runs in**: subagent general
- **action**: `create`
- **target**: the remaining Appendix E rows (tests, `src/main` wiring, `HelpCliAdapter`, `package.json`, `tsconfig.json`,
  `bunfig*`, `scripts/*`, `tests/support/source-files.ts`, `AGENTS.md`, `README.md`)
- **content**: move and adapt every test of `{S}` per Appendix E; `tests/e2e/patches/cli-surface.test.ts` asserting
  each Appendix B row through `opencode-session-manager patches …` (usage text, `--help`, every flag, every exit
  code); `package.json` `devDependencies`: `"@npmcli/arborist": "9.4.0"` and `"@types/npmcli__arborist": "6.3.3"` (D25), then `bun install` (lockfile changes) and `bun install --frozen-lockfile`
  (proves it); `AGENTS.md` and `README.md`: the `patches` section with the old README's content adapted (commands,
  options, defaults, environment variables, folders, examples, the watch), every new file in the source map;
  moved tests renamed to kebab case (D23); `scripts/lint-diagrams.mjs` L6 skips `tests/support/patches/fixtures/`
  (D24); seams through `buildContainer(env, { patches: seams })` (D26); `src/main/cli/cli.ts` ends with
  `process.exit(code)` (D26); D19's output changes, each asserted in `cli-surface.test.ts`. Commit
  `Patches: import opencode-magic-context-patches at <{S-final} short SHA>` with `{IDENT}` and a body naming the file
  map document.
- **depends on**: 5.2, 5.6
- **gates**: 1. `GATE` on this Mac: `typecheck`, `lint:diagrams`, `coverage:unit`, `test:component` exit 0, 100 % per
  file; `coverage:e2e` failures only the Arborist-symlink ones (fixed next by 5.8); 2. `bun build` of the CLI succeeds
  (`bun run build`); 3. `bun install --frozen-lockfile` exit 0 with empty `git status --porcelain` after commit.
- **problems**: `{A}`'s coverage-completeness test requires every src file loaded by each measured tier → the e2e tier
  must import the new files (its `tests/e2e/coverage-completeness.test.ts`).
- **escalation**: the plan author for a rule conflict; never relax a rule.
- **failure**: `git -C {W} reset --hard <5.2 SHA>`.
- **returns**: SHA `{c5}`, `GATE` summary.

### Step 5.8 — Arborist stages through the real path

- **runs in**: subagent general
- **action**: `edit`
- **target**: the Appendix E target of `ArboristInstallerAdapter.ts`
- **content**: resolve the staging folder with `realpath` before `new Arborist({ path })`, and resolve the installed
  package root from that real path; unit test: a folder reached through a symlink installs and reports
  `edges ["@cortexkit/opencode-magic-context"]` (the scratch reproduction of 2026-11-15, Objective 4). Commit
  `Patches: Arborist stages through the real path` with `{IDENT}`.
- **depends on**: 5.7
- **gates**: 1. the new unit test fails on the parent commit and passes on this one (run both, record both);
  2. the 21 Arborist failures of `{S}`'s macOS baseline pass in their moved form on this Mac.
- **problems**: Arborist also reads `process.cwd()` → measured it does not for `path`-based reify (reproduction);
  a different cause shows as gate 2 failing.
- **escalation**: the user, with the failing output.
- **failure**: `git -C {W} reset --hard HEAD~1`.
- **returns**: SHA, both runs.

### Step 5.9 — Rollback refuses a previous entry that no longer exists

- **runs in**: subagent general
- **action**: `edit`
- **target**: the Appendix E target of `RollbackUseCase.ts`
- **content**: when the recorded previous entry is a folder (not an npm spec) and the folder does not exist, rollback
  stops with `previous entry <path> no longer exists` and changes nothing; unit and e2e tests (negative scenario of U9).
  Commit `Patches: rollback refuses a previous entry that no longer exists` with `{IDENT}`. Reason: after step 11.6
  deletes the old store, a recorded entry naming it must never be written back into `opencode.jsonc` (the ENOENT
  failure of 2026-11-15, session history).
- **depends on**: 5.8
- **gates**: 1. `coverage:unit` and `coverage:e2e` 100 %, 0 fail.
- **problems**: none beyond the test.
- **escalation**: the launcher.
- **failure**: `git -C {W} reset --hard HEAD~1`.
- **returns**: SHA.

### Step 5.10 — The three macOS test defects

- **runs in**: subagent general
- **action**: `edit`
- **target**: the moved live and e2e tests named in plan 2026-11-15-22-13's `Out of scope` (setup outside `try` leaking
  `mc-patches-live-follow-*` folders; `OPENCODE_…_NOTIFY_BIN=/bin/true`, absent on macOS; `effect` without `--since`)
- **content**: setup inside `try`/`finally`; the notifier stand-in resolved with `Bun.which("true")`; the live `effect`
  check passes `--since` = the running server's start time read through the platform port. Commit
  `Patches: tests run on macOS` with `{IDENT}`.
- **depends on**: 5.9
- **gates**: 1. on this Mac `bun run test:live` → the moved patches live tests pass; 2. `find {T} /private/tmp -maxdepth 2
  -name 'mc-patches-*' -newer {X}/before/ps.txt` → empty after the run; 3. `bun run cli patches status --json | jq length`
  piped through `cat` equals the unpiped count (Open question: piped output not truncated).
- **problems**: the live tests need the real OpenCode binary → on this Mac `/opt/homebrew/bin/opencode`.
- **escalation**: the launcher.
- **failure**: `git -C {W} reset --hard HEAD~1`.
- **returns**: SHA.

### Step 5.11 — Linux gate of the import

- **runs in**: subagent general
- **action**: `run`
- **target**: `GATE` on `{M}` in `{MX}/a-wip` after pulling a bundle of `{c4}..feat-magic-context-patches`
- **content**: as 2.4, outputs to `{MX}/gates/patches-linux/`.
- **depends on**: 5.10
- **gates**: 1. `FAILS` ⊆ Appendix A `linux-a`; 2. coverage 100 % per file; 3. the moved `{S}` tests pass where they
  passed in Appendix A `linux-s`, and the live patches tests pass (they use a throwaway home: read first).
- **problems**: a live test would touch the real units or entry → it must not: the moved `tests/live` of `{S}` reads
  `is-enabled` only; verify by reading before running.
- **escalation**: the launcher.
- **failure**: read-only on `{M}` except `{MX}`.
- **returns**: comparisons.

### Step 5.12 — Review Stage 5

- **runs in**: main session (review)
- **action**: `review`
- **target**: `git -C {W} log {c4}..`; `git -C {W} diff --stat {c4}..`; gate outputs
- **content**: Appendix E row count vs files changed; Appendix B vs `cli-surface.test.ts` assertions; re-run
  `bun run coverage:e2e` on this Mac.
- **depends on**: 5.11
- **gates**: the stage gate.
- **problems**: a missing row → back to the step that owns it.
- **escalation**: the user.
- **failure**: record-only.
- **returns**: —

## Stage 6 — Watch, Bun pin, documentation (D6, D13, D15)

**Why.** D6: the watch follows new Magic Context releases on both hosts; D13 renames the units; D15 pins Bun.

**What.**
- `systemd/opencode-session-manager-patches.path`, `.service`, `.timer` — the old units with
  `ExecStart=%h/.local/bin/opencode-session-manager patches follow`, `Documentation=file://%h/Dev/repos/devtools/opencode-session-manager/README.md`,
  `Unit=opencode-session-manager-patches.service`; triggers unchanged (`PathModified` on `%h/.cache/opencode/npm/@cortexkit`
  and `%h/.config/opencode/opencode.jsonc`, `OnStartupSec=2min`, `OnUnitActiveSec=6h`, `ExecStartPre=/usr/bin/sleep 30`,
  `SuccessExitStatus=1`).
- `launchd/opencode-session-manager-patches.plist` — template with `@HOME@`: `Label` `{LABEL}`,
  `ProgramArguments` `["/bin/sh", "-c", "sleep 30; exec @HOME@/.local/bin/opencode-session-manager patches follow"]`,
  `WatchPaths` `[@HOME@/.cache/opencode/npm/@cortexkit, @HOME@/.config/opencode/opencode.jsonc]`,
  `StartInterval` `21600`, `RunAtLoad` `true`, `StandardOutPath`/`StandardErrorPath`
  `@HOME@/Library/Logs/opencode-session-manager-patches.log`.
- `scripts/watch.mjs` and `package.json` script `install:watch`: linux → copy units to `~/.config/systemd/user`,
  `systemctl --user daemon-reload`, `enable --now` path and timer; darwin → substitute `@HOME@`, write
  `~/Library/LaunchAgents/{LABEL}.plist`, `plutil -lint`, `launchctl bootout gui/$(id -u)/{LABEL}` (ignore "not loaded"),
  `launchctl bootstrap gui/$(id -u) <plist>`; win32 → exit 1 `the watch is not supported on win32`. Directory overridable
  by `OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR` / `OPENCODE_SESSION_MANAGER_PATCHES_LAUNCHD_DIR` (as `{S}`'s
  `OPENCODE_MC_PATCHES_SYSTEMD_DIR`).
- `package.json` `"packageManager": "bun@1.4.4"`, `@types/bun` and `bun-types` `1.4.4`.

**Stage gate.** `plutil -lint` of the rendered plist → OK; `systemd-analyze --user verify` of the three units on `{M}`
→ no output; `bun run test:unit` covers `scripts/watch.mjs` behaviour through a test with the directory overrides and
stand-in `systemctl`/`launchctl`; `bun install --frozen-lockfile` exit 0.

### Step 6.1 — Units and plist

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/systemd/opencode-session-manager-patches.path` (and `.service`, `.timer`, `launchd/opencode-session-manager-patches.plist`)
- **content**: the What list.
- **depends on**: 5.12
- **gates**: 1. `plutil -lint` of the plist with `@HOME@` substituted into `{X}/plist-check.plist` → `OK`;
  2. `ssh msik15k systemd-analyze --user verify <copied units>` → empty (copied into `{MX}/units-check/`).
- **problems**: `systemd-analyze verify` reports that `%h/.local/bin/opencode-session-manager` is not executable,
  because the new binary is installed on `{M}` only by step 10.4 → that single line is the only allowed output
  here; step 10.8 gate 2 re-verifies the installed units with an empty output.
- **escalation**: the launcher.
- **failure**: delete the files.
- **returns**: outputs.

### Step 6.2 — `install:watch`

- **runs in**: subagent general
- **action**: `create`
- **target**: `{W}/scripts/watch.mjs` (and `package.json` script, its test `tests/unit/scripts/watch.test.ts`)
- **content**: the What list; the test runs the script with both directory overrides and stand-in
  `systemctl`/`launchctl`/`plutil` on `PATH`, for linux and darwin paths and the win32 refusal.
- **depends on**: 6.1
- **gates**: 1. the test passes; 2. `lint:diagrams` 0.
- **problems**: `{A}`'s coverage ignores `scripts/**` → the test is behavioural; record.
- **escalation**: the launcher.
- **failure**: delete the files.
- **returns**: test output.

### Step 6.3 — Pin Bun

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{W}/package.json`
- **content**: `"packageManager": "bun@1.4.4"`; `@types/bun` `1.4.4`; `bun-types` `1.4.4`; `bun install`; then
  `bun install --frozen-lockfile`.
- **depends on**: 6.2
- **gates**: 1. `bun install --frozen-lockfile` exit 0; 2. `bun run typecheck` 0; 3. `git -C {W} status --porcelain` lists
  only `package.json`, `bun.lock`.
- **problems**: `@types/bun@1.4.4` changes a type → typecheck finds it; fix the code, never pin back.
- **escalation**: the launcher.
- **failure**: `git -C {W} checkout -- package.json bun.lock`.
- **returns**: diff.

### Step 6.4 — Documentation pass

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{W}/README.md` (and `{W}/AGENTS.md`)
- **content**: README: prerequisites (Bun 1.4.4, OpenCode, platform tools per OS), install (`bun run install:cli`,
  `bun run install:watch`), the `patches` commands with options, defaults, environment variables, folders, exit codes,
  and at least four runnable examples (`patches status`, `patches apply --version 0.49.56`, `patches effect --since
  "$(date -u -v-1H +%FT%TZ)"` on macOS / `date -u -d '-1 hour' +%FT%TZ` on Linux, `patches follow --version 0.49.56`);
  the platforms table with darwin; a "Migrating from opencode-magic-context-patches" section (what moved where, D13
  names). AGENTS.md: the rules of `{S}`'s `AGENTS.md` "Safety rules" and "Adding a version" sections adapted to the new
  paths, the watch, the platform table.
- **depends on**: 6.3
- **gates**: 1. `lint:diagrams` 0; 2. every example command runs on this Mac from `{W}` via `bun run cli` with exit 0 or
  its documented exit code (record each).
- **problems**: an example changes state (`apply`) → run it against a sandbox home (`HOME={X}/doc-home`), never the real one.
- **escalation**: the launcher.
- **failure**: `git -C {W} checkout -- README.md AGENTS.md`.
- **returns**: the example outputs.

### Step 6.5 — Commit

- **runs in**: subagent general
- **action**: `run`
- **target**: commit `Patches: watch on Linux and macOS; Bun 1.4.4` with `{IDENT}`
- **content**: `git -C {W} add -A && git commit …`.
- **depends on**: 6.4
- **gates**: 1. status empty; 2. identity as 2.3 gate 2.
- **problems**: —
- **escalation**: the launcher.
- **failure**: `git -C {W} reset --soft HEAD~1`.
- **returns**: SHA `{c6}`.

### Step 6.6 — Review Stage 6

- **runs in**: main session (review)
- **action**: `review`
- **target**: `git -C {W} show {c6}`
- **content**: the What list against the diff; the stage gate re-run.
- **depends on**: 6.5
- **gates**: the stage gate.
- **problems**: a gap → back to its step.
- **escalation**: the user.
- **failure**: record-only.
- **returns**: —

## Stage 7 — Final repository gate

**Why.** `{C}/AGENTS.md` 3.8: the whole gate on the final tree on every platform that judges it, compared with the
baseline; 6.8: e2e last.

**What.** `GATE` outputs for `{W}` HEAD on macOS and Linux; the comparison with Appendix A; the win32 verdict.

**Stage gate.** Step 7.4's gates.

### Step 7.1 — macOS

- **runs in**: subagent general
- **action**: `run`
- **target**: `GATE` in `{W}` into `{X}/gates/final-mac/`
- **content**: `GATE`, then `FAILS`.
- **depends on**: 6.6
- **gates**: 1. `typecheck`, `lint:diagrams`, `coverage:unit`, `test:component`, `coverage:e2e` exit 0; every file at
  100 % lines and functions in both coverage reports; 2. `test:live` `FAILS` ⊆ Appendix A `mac` live failures whose
  cause is not `darwin-unsupported` (those must now pass).
- **problems**: a flaky timing test → re-run that file once; a second failure is a failure.
- **escalation**: the launcher.
- **failure**: read-only.
- **returns**: counts, `FAILS`, the coverage summary lines.

### Step 7.2 — Linux

- **runs in**: subagent general
- **action**: `run`
- **target**: `GATE` on `{M}` in `{MX}/a-final` (fresh clone of the base bundle plus a bundle of `{base}..feat-magic-context-patches`)
- **content**: fresh clone (no state carried from `{MX}/a-wip`), `bun install --frozen-lockfile`, `GATE` into
  `{MX}/gates/final-linux/`, copied back.
- **depends on**: 6.6
- **gates**: 1. as 7.1 gate 1 on Linux; 2. `test:live` `FAILS` ⊆ Appendix A `linux-a` ∪ (`linux-s` live failures);
  the live `follow` test against the real registry, Arborist and `~/.opencode/bin/opencode` 2.2.7 passes.
- **problems**: as 7.1.
- **escalation**: the launcher.
- **failure**: read-only outside `{MX}`.
- **returns**: as 7.1.

### Step 7.3 — Sandbox proof with OpenCode 2.3.0 on macOS

- **runs in**: subagent general
- **action**: `run`
- **target**: the moved live `follow` test on this Mac (`bun test <its Appendix E path>` in `{W}`)
- **content**: the test uses a throwaway home and the real `/opt/homebrew/bin/opencode` (2.3.0).
- **depends on**: 7.1
- **gates**: 1. passes; 2. `find {T} /private/tmp -maxdepth 2 -name 'mc-patches-*' -o -maxdepth 2 -name '*sandbox*' -newer {X}/before/ps.txt`
  → empty.
- **problems**: OpenCode 2.3.0 changed `/api/plugin` → the test fails with the response body; stop.
- **escalation**: the user, with the response.
- **failure**: read-only.
- **returns**: output.

### Step 7.4 — Judge the final gate

- **runs in**: main session (`{C}/AGENTS.md` 4.7: the final gate is never delegated)
- **action**: `review`
- **target**: `{X}/gates/final-*`, Appendix A
- **content**: re-run `bun run coverage:unit` and `bun run coverage:e2e` in `{W}` myself; compute
  `comm -13 <baseline FAILS> <final FAILS>` per command and host (regressions) and `comm -23` (improvements).
- **depends on**: 7.1, 7.2, 7.3
- **gates**: 1. regressions = 0 on both hosts (Linux waived under D31; macOS authoritative); 2. coverage 100 % per file on darwin under the Revision 7 posture — 0 test failures, every plan-created/edited file 100/100, sub-100 set ⊆ pinned 23-file pre-existing base set (Revision 8); Linux waived under D31; 3. the win32 e2e gate is
  written in the record as **blocked** (no Windows host; D8) with the command that would run it
  (`bun run coverage:e2e` on win32).
- **problems**: a regression → back to the stage that owns the file.
- **escalation**: the user, with the regression list.
- **failure**: record-only.
- **returns**: —

## Stage 8 — Integrate the code

**Why.** `{C}/AGENTS.md` 7.5; D17.

**What.** `feat-magic-context-patches` on `{A}` `main` and `origin/main` (or in a pull request), rebased over
whatever reached `main` meanwhile.

**Stage gate.** `git -C {A} rev-parse main` = `git -C {A} ls-remote origin refs/heads/main | cut -f1` and contains
`{c6}`'s tree changes (merge) — or the PR URL is recorded and its merge is confirmed by the user (PR).

### Step 8.1 — Rebase over `main` if it moved (D17)

- **runs in**: subagent general
- **action**: `run`
- **target**: `git -C {W} rebase main` (only when `git -C {A} rev-parse main` ≠ `{base}`), after `git -C {A} fetch origin`
- **content**: when `main` moved (for example `feat-herdr-pane-agent` or `feat-macos-store-migration` merged), rebase;
  when the incoming work already adds a darwin adapter, container or coverage file of Stage 4, keep theirs and drop
  ours in the rebase, then re-run Stage 4's gates; resolve conflicts keeping both
  sides' behaviour; then re-run Stage 7 (7.1–7.4) on the rebased HEAD. When `origin/main` is ahead of local `main`,
  stop: local `main` is updated only by its owner.
- **depends on**: 7.4
- **gates**: 1. `git -C {W} merge-base --is-ancestor main HEAD` → 0; 2. Stage 7 gates green on the rebased HEAD (or
  no rebase needed: `main` = `{base}`).
- **problems**: a conflict needs a behaviour decision → never guessed.
- **escalation**: the user, with the conflicting hunks.
- **failure**: `git -C {W} rebase --abort`.
- **returns**: new HEAD, the re-run Stage 7 summary.

### Step 8.2 — Ask how to integrate

- **runs in**: main session (question to the user)
- **action**: `review`
- **target**: the user, through the question tool
- **content**: "Merge `feat-magic-context-patches` (`<n>` commits) into `main` and push, or push the branch and open a
  pull request?" Options: merge (recommended), PR. Also list every commit on local `main` not on `origin/main`
  (`git -C {A} log origin/main..main --format='%h %an %s'`; today `029c1b8` from the concurrent session), which a push
  of `main` publishes too.
- **depends on**: 8.1
- **gates**: 1. an answer is recorded.
- **problems**: the user declines pushing the foreign commits → choose PR from the branch only.
- **escalation**: —
- **failure**: nothing changed.
- **returns**: the answer.

### Step 8.3 — Merge and push, or open the PR

- **runs in**: main session (irreversible: publishing)
- **action**: `run`
- **target**: merge: `git -C {A} merge --ff-only feat-magic-context-patches && git -C {A} push origin main`; PR:
  `git -C {W} push -u origin feat-magic-context-patches && gh pr create --repo mavasbel-devtools/opencode-session-manager --base main --head feat-magic-context-patches --title 'Patches: merge opencode-magic-context-patches; macOS platform' --body-file {X}/pr-body.md`
- **content**: as chosen. `{A}`'s main checkout still holds D1's work uncommitted: before `merge --ff-only`, confirm
  its digest is `{D1}` (step 1.15), then restore those 18 files and remove the 12 untracked entries (Appendix D list, backed
  up in step 1.3; committed in `{c2}`), so the fast-forward does not refuse on local changes.
- **depends on**: 8.2
- **gates**: 1. merge: `git -C {A} rev-parse main` = `git -C {W} rev-parse HEAD` = remote `main`; `git -C {A} status
  --porcelain` → empty. PR: the URL printed, `gh pr view <url> --json state` → `OPEN`.
- **problems**: ff refused → `main` moved after 8.1; back to 8.1.
- **escalation**: the user.
- **failure**: merge: `git -C {A} reset --hard <main before>` only before the push; after the push, a revert commit
  asked of the user.
- **returns**: SHAs or URL.

### Step 8.4 — PR path only: wait for the merge

- **runs in**: subagent general
- **action**: `run`
- **target**: `gh pr view <url> --json state,mergeCommit`
- **content**: skipped on the merge path. On the PR path, Stages 9 to 11 start only after `state` = `MERGED`; then
  `git -C {A} pull --ff-only` (after the D1 restore of step 8.3).
- **depends on**: 8.3
- **gates**: 1. `MERGED`, and local `main` = remote `main`.
- **problems**: not merged → stop here; the plan resumes at 8.4.
- **escalation**: the user: "Stages 9–13 wait for PR `<url>` to be merged."
- **failure**: —
- **returns**: merge SHA.

### Step 8.5 — Review the integration

- **runs in**: main session (review)
- **action**: `review`
- **target**: `git -C {A} log -3 --format='%h %an <%ae> %s'`; `git ls-remote origin`
- **content**: the stage gate; `{W}` stays until Stage 13 (it holds the session record).
- **depends on**: 8.4
- **gates**: the stage gate.
- **problems**: —
- **escalation**: —
- **failure**: record-only.
- **returns**: —

## Stage 9 — Cutover on this Mac

**Why.** What 2; D9 (history before the first write).

**What.** New CLI installed; old history migrated; launchd agent loaded; `patches check`/`effect` green.

**Stage gate.** `opencode-session-manager patches check` exit 0; `opencode-session-manager patches effect --since
<service start> --json` → `respected` with threshold 16; `launchctl print gui/$(id -u)/{LABEL}` exit 0; every
migrated file `cmp` 0.

### Step 9.1 — Install the CLI

- **runs in**: subagent general
- **action**: `run`
- **target**: `cd {W} && bun run install:cli && bun run validate:installed:cli`
- **content**: the command (builds `dist/cli/opencode-session-manager`, copies to `~/.local/bin`).
- **depends on**: 8.5
- **gates**: 1. both exit 0; 2. `opencode-session-manager --version` → `package.json` version; 3. `opencode-session-manager
  patches --help` exit 0 and prints Appendix B's command list.
- **problems**: `~/.local/bin` not on `PATH` → it is (`command -v opencode-magic-context-patches` resolved there).
- **escalation**: the launcher.
- **failure**: `rm ~/.local/bin/opencode-session-manager` (created by this step: absent in `{X}/before/home.txt`).
- **returns**: outputs.

### Step 9.2 — Migrate the old history (D9)

- **runs in**: subagent general
- **action**: `move` (copy; the originals are deleted in Stage 11)
- **target**: `~/.local/share/opencode-magic-context-patches/backups` → `{PD}/backups`;
  `~/.local/state/opencode-magic-context-patches/audit.log` → `{PS}/audit.log`
- **content**: first `test ! -e {PD} && test ! -e {PS}` (the new tool has written nothing); `mkdir -p {PD} {PS}`;
  `cp -Rp` each; `chmod -R a-w {PD}/backups` keeps the backups read-only as the old tool made them (Revision 9: files only —
  `find {PD}/backups -type f -exec chmod a-w {} +`, directories stay 755; `chmod -R a-w` would also strip directory
  write and block future backup writes, and fails gate 4 since the old tool leaves directories at 755).
- **depends on**: 9.1
- **gates**: 1. `diff -r` old vs new backups → no output; 2. `cmp` audit logs → 0; 3. file counts equal; 4. modes equal
  (`find … -perm` lists).
- **problems**: `{PD}` already exists → something ran the new tool early; stop.
- **escalation**: the user, with `ls -la {PD} {PS}`.
- **failure**: `rm -rf {PD} {PS}`.
- **returns**: counts and diffs.

### Step 9.3 — The new tool sees the loaded copy

- **runs in**: main session (cutover review)
- **action**: `run`
- **target**: `opencode-session-manager patches status --json`, `patches check --json`, `patches effect --since
  <ISO start of pid of 'opencode serve'> --json`
- **content**: read-only commands.
- **depends on**: 9.2
- **gates**: 1. status: five patches `applied` on 0.49.56 at `~/.cache/opencode/npm/@cortexkit/opencode-magic-context@latest/<n>/…`;
  2. check exit 0; 3. effect `respected`, configured 16, 0 rejections since start.
- **problems**: status says `unchecked-version` → the release data did not move; back to 5.3.
- **escalation**: the user.
- **failure**: read-only.
- **returns**: the three outputs.

### Step 9.4 — Load the launchd agent

- **runs in**: subagent general
- **action**: `run`
- **target**: `cd {W} && bun run install:watch`
- **content**: the darwin path of step 6.2.
- **depends on**: 9.3
- **gates**: 1. `plutil -lint ~/Library/LaunchAgents/{LABEL}.plist` → OK; 2. `launchctl print gui/$(id -u)/{LABEL}` → exit
  0, `state` and `last exit code` printed; 3. after ≤ 60 s, `~/Library/Logs/opencode-session-manager-patches.log`
  holds one `follow` report; 4. `cmp {C}/opencode.jsonc {X}/backup/opencode.jsonc` → 0 unless the report says
  `adopted` (then step 9.5 applies).
- **problems**: `RunAtLoad` follow adopts a managed copy → allowed by design (D6); 9.5 handles the restart.
- **escalation**: the launcher.
- **failure**: `launchctl bootout gui/$(id -u)/{LABEL}; rm ~/Library/LaunchAgents/{LABEL}.plist`.
- **returns**: outputs.

### Step 9.5 — Restart only if the entry changed

- **runs in**: main session (question to the user)
- **action**: `review`
- **target**: the follow report of 9.4
- **content**: when `adopted`: ask the user to run `opencode service restart`, then repeat 9.3's gates. Otherwise skip.
- **depends on**: 9.4
- **gates**: 1. 9.3 gates green after the restart, or skipped with the report quoted.
- **problems**: —
- **escalation**: the user.
- **failure**: `opencode-session-manager patches follow --rollback` (puts the entry back).
- **returns**: —

### Step 9.6 — The macOS notification is seen

- **runs in**: main session (question to the user)
- **action**: `run`
- **target**: `HOME={X}/notify-home XDG_CACHE_HOME={X}/notify-home/.cache opencode-session-manager patches notify --json`
- **content**: a throwaway home with no Magic Context copy, so `check` fails and `notify` notifies; ask the user
  "Did a notification titled `<title>` appear?". Then the same command as a one-shot launchd job, the context the
  agent runs in: `launchctl submit -l {LABEL}.notifytest -- /usr/bin/env HOME={X}/notify-home XDG_CACHE_HOME={X}/notify-home/.cache /Users/mavasbel/.local/bin/opencode-session-manager patches notify`;
  ask again; then `launchctl remove {LABEL}.notifytest`.
- **depends on**: 9.5
- **gates**: 1. exit status as Appendix B (1); 2. the user answers yes; 3. the user answers yes for the launchd job;
  4. `launchctl list | grep -c notifytest` → `0`.
- **problems**: no notification → Focus mode or osascript permission; recorded as the user's answer.
- **escalation**: the user.
- **failure**: `rm -rf {X}/notify-home`.
- **returns**: the answer.

### Step 9.7 — Name the new CLI in the notify message (Revision 10)

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{W}/src/application/patches/NotifyUseCase.ts:12` (and its unit test asserting the message)
- **content**: the message names `opencode-session-manager patches status` instead of `opencode-magic-context-patches status`. Update the asserting unit test to the new string.
- **depends on**: 9.6
- **gates**: 1. `bun run typecheck` 0; 2. the notify unit test file passes; 3. `bun run lint:diagrams` 0; 4. the installed CLI's `patches notify --json` (throwaway home) prints the new name.
- **problems**: the message is asserted elsewhere (help text, docs) → update every occurrence (`grep` the old name in `src/`, `tests/`, `README.md`, `AGENTS.md`; docs occurrences updated only if they quote the message).
- **escalation**: the launcher.
- **failure**: `git -C {W} checkout -- <touched files>`.
- **returns**: diff.

### Step 9.8 — Full PATH for the launchd agent, commit, push, re-verify (Revision 10)

- **runs in**: subagent general, then the launcher merges and the user restarts only if the entry changed
- **action**: `edit`, then `run`
- **target**: `{W}/launchd/opencode-session-manager-patches.plist`, `{W}/scripts/watch.mjs` (+ its test), `{W}/scripts/watch.d.mts` if the render shape changes
- **content**: the plist template gains `EnvironmentVariables` with a `PATH` that finds `opencode` on macOS (`/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`); `watch.mjs` renders it on the darwin path (no substitution needed — fixed string); update `tests/unit/scripts/watch.test.ts` if it asserts the rendered plist. Then: `bun run typecheck` 0, watch test file passes, `lint:diagrams` 0; commit both 9.7 and 9.8 work as one commit `Patches: launchd PATH and notify message` with `{IDENT}`; reinstall the CLI (`bun run install:cli && bun run validate:installed:cli`); `git -C {A} merge --ff-only feat-magic-context-patches && git -C {A} push origin main` (only when `git -C {A} rev-parse main` = remote `main`, else stop); reinstall the agent (`cd {W} && bun run install:watch`); wait ≤ 60 s for the new `follow` report in `~/Library/Logs/opencode-session-manager-patches.log`.
- **depends on**: 9.7
- **gates**: 1. typecheck/test/lint green; 2. local main = remote main = branch HEAD after push; 3. `launchctl print` exit 0; 4. one new `follow` report within 60 s — quoted in full; when it says `adopted`, step 9.5 re-arms (ask the user to restart, repeat 9.3's gates); when `stopped`, the reason is quoted and Stage 9 closes on it.
- **problems**: the re-verification `follow` adopts 0.49.61 (npm latest stages, patches and proves) → by design (D6); 9.5 handles the restart; the adopted copy is reported with its `status`.
- **escalation**: the user, with the report.
- **failure**: `launchctl bootout gui/$(id -u)/{LABEL}; rm ~/Library/LaunchAgents/{LABEL}.plist`; `git -C {W} reset --soft HEAD~1` only before the push.
- **returns**: SHAs, the report.

### Step 9.9 — Name the new CLI in the follow-stopped message (Revision 11)

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{W}/src/application/patches/follow/AdoptionRecorder.ts:62` (and its asserting test)
- **content**: the user-approved inclusion the launcher failed to forward into step 9.8: rename `opencode-magic-context-patches follow` to `opencode-session-manager patches follow` in the follow-stopped message; update the asserting test. Then `bun run typecheck` 0, the asserting test file passes, `bun run lint:diagrams` 0; commit with `{IDENT}` as `Patches: name the new CLI in the follow message` (exact-path `git add`, record file excluded); `git -C {A} merge --ff-only feat-magic-context-patches && git -C {A} push origin main` (only when local `main` = remote `main`, else stop); reinstall the CLI (`bun run install:cli && bun run validate:installed:cli`).
- **depends on**: 9.8
- **gates**: 1. typecheck/test/lint green; 2. the installed CLI's follow-stopped message (throwaway home, removed after) names the new CLI; 3. local main = remote main = branch HEAD after push.
- **problems**: the message is asserted in more files → update all and report the list.
- **escalation**: the launcher.
- **failure**: `git -C {W} checkout -- <touched files>` (before the push); `git -C {W} reset --soft HEAD~1` only before the push.
- **returns**: SHA.

### Step 9.10 — Prove PATH inside the sandbox (Revision 11)

- **runs in**: subagent general
- **action**: `read`, then `edit` only when the read proves a config-only fix
- **target**: `{W}/src/infrastructure/adapters/outbound/opencode2/OpencodeSandboxAdapter.ts:84-92`, `{W}/src/main/patches-paths.ts:83`
- **content**: read-only first: does the sandbox adapter (or the paths module) honor `OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN` (or another env var) for the proof server's executable, or does it hardcode `PATH: "/usr/bin:/bin"` around a bare `"opencode"`? When a config-only fix exists (the adapter reads an env var for the binary): add that variable (`/opt/homebrew/bin/opencode`) to the plist template's `EnvironmentVariables`, update the watch test, typecheck + watch test + lint green, commit `{IDENT}` as `Patches: opencode binary for the launchd sandbox`, push as in 9.9, reinstall the agent, and quote one new `follow` report. When the read proves only a code change would work: report blocked with the exact lines, change nothing, and Stage 9 closes with the `stopped`-at-`prove` posture recorded.
- **depends on**: 9.9
- **gates**: 1. the read verdict names the exact lines and the honored-or-not env var; 2a. config fix applied: typecheck/test/lint green, main pushed, agent reinstalled, one new report quoted (adopted → 9.5 re-arms); 2b. no config fix: blocked report with lines, tree unchanged.
- **problems**: the re-verification `follow` adopts 0.49.61 → by design (D6); 9.5 handles the restart.
- **escalation**: the user, with the read verdict or the report.
- **failure**: read-only, except the config-fix path whose failure ops mirror 9.8.
- **returns**: the verdict or the report.

## Stage 10 — Cutover on `{M}`

## Stage 10 — Cutover on `{M}`

## Stage 10 — Cutover on `{M}`

**Why.** What 3; D10. Revision 12 (2026-11-17): this whole stage is DEFERRED — `{M}` (msik15k) is
unreachable (host I/O stall, user: "Forget connecting to msik15, it is deferred"), so steps 10.1–10.9 cannot run and
the stage gate is not judged. A follow-up plan executes them when `{M}` is reachable. Nothing below runs now.
The old units must stop first: old and new tool have different locks and could both switch
the entry.

**What.** Old units stopped; `{MA}` on merged `main`; new CLI; history migrated; plugin re-installed; entry on
`{PD}/installs/0.49.56/…`; new units enabled.

**Stage gate.** On `{M}`: `opencode-session-manager patches check` exit 0; `grep -c '/home/mavasbel/.local/share/opencode-session-manager/patches/installs/0.49.56' ~/.config/opencode/opencode.jsonc` → 1;
`systemctl --user is-active opencode-session-manager-patches.path opencode-session-manager-patches.timer` → `active`
twice; `systemctl --user is-enabled opencode-magic-context-patches.path` → not `enabled`.

### Step 10.1 — Stop the old units

- **runs in**: subagent general
- **action**: `run`
- **target**: `ssh msik15k systemctl --user disable --now opencode-magic-context-patches.path opencode-magic-context-patches.timer`
- **content**: then wait until `systemctl --user is-active opencode-magic-context-patches.service` → `inactive` (a
  running follow finishes first; poll every 10 s, at most 15 min).
- **depends on**: 8.5
- **gates**: 1. `is-active` of path, timer, service → `inactive` ×3; 2. `is-enabled` path, timer → `disabled`; 3. the
  `.wants` links are gone (`ls ~/.config/systemd/user/*.wants | grep -c magic` → 0).
- **problems**: the service stays active > 15 min → a follow is stuck.
- **escalation**: the user, with `journalctl --user -u opencode-magic-context-patches.service -n 50`.
- **failure**: `systemctl --user enable --now` the two units.
- **returns**: outputs.

### Step 10.2 — D1's work on `{M}` is still the backed-up content

- **runs in**: subagent general
- **action**: `read`
- **target**: `{MA}`
- **content**: recompute the Appendix D digest.
- **depends on**: 10.1
- **gates**: 1. = `4d962b44…3407`.
- **problems**: differs → changed since 1.3.
- **escalation**: the user, with `git -C {MA} diff --stat`.
- **failure**: read-only.
- **returns**: digest.

### Step 10.3 — Clear D1's work from `{MA}`

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: the 18 modified files and 12 untracked entries of Appendix D in `{MA}`
- **content**: `git -C {MA} checkout -- <18 paths>`; `rm -r <12 paths>`. Nothing depends on them: the same content is
  committed as `{c2}` (and its fixes) on `main`, and `{MX}/backup/` holds the patch and tar.
- **depends on**: 10.2, 8.5
- **gates**: 1. `git -C {MA} status --porcelain` → empty.
- **problems**: —
- **escalation**: —
- **failure**: `git -C {MA} apply {MX}/backup/a-wip.patch && tar -xpf {MX}/backup/a-untracked.tar -C {MA}`.
- **returns**: status.

### Step 10.4 — Pull, install, build the CLI

- **runs in**: subagent general
- **action**: `run`
- **target**: on `{M}`: `git -C {MA} pull --ff-only && cd {MA} && bun install --frozen-lockfile && bun run install:cli && bun run validate:installed:cli`
- **content**: the command.
- **depends on**: 10.3
- **gates**: 1. `git -C {MA} rev-parse HEAD` = remote `main`; 2. all exit 0; 3. `opencode-session-manager patches --help` exit 0.
- **problems**: —
- **escalation**: the launcher.
- **failure**: `rm ~/.local/bin/opencode-session-manager` if absent before (`{MX}/before/home.txt`), else restore the
  previous binary from `{MX}/backup/` (copied first by this step when present).
- **returns**: outputs.

### Step 10.5 — Re-install the session-manager plugin

- **runs in**: subagent general
- **action**: `run`
- **target**: `cd {MA} && bun run install:plugin:v2 && bun run validate:installed:v2`
- **content**: the plugin at `~/.config/opencode/plugins/session-manager` carries D1's TUI changes.
- **depends on**: 10.4
- **gates**: 1. both exit 0.
- **problems**: —
- **escalation**: the launcher.
- **failure**: the script keeps the previous build (its own backup); record its path.
- **returns**: outputs.

### Step 10.6 — Migrate the old history (D9)

- **runs in**: subagent general
- **action**: `move` (copy)
- **target**: `~/.local/share/opencode-magic-context-patches/{backups,derived-releases.json}` → `{PD}/`;
  `~/.local/state/opencode-magic-context-patches/{audit.log,evidence}` → `{PS}/`
- **content**: as 9.2. Not migrated: `installs/` (D10: re-installed by follow), `follow-previous-entry` (names the old
  store's 0.49.55 folder, which Stage 11 deletes; the new follow records its own).
- **depends on**: 10.4
- **gates**: as 9.2 (19 evidence files, 196 audit lines at the time of inventory, or more if the old units ran since).
- **problems**: as 9.2.
- **escalation**: as 9.2.
- **failure**: `rm -rf {PD} {PS}`.
- **returns**: counts.

### Step 10.7 — `follow --version 0.49.56` with the new tool (D10)

- **runs in**: main session (switches what OpenCode loads)
- **action**: `run`
- **target**: `ssh msik15k 'opencode-session-manager patches follow --version 0.49.56 --json'`
- **content**: the command; it stages, patches, proves in a sandbox, publishes to `{PD}/installs/0.49.56`, switches the
  entry and confirms through the running server.
- **depends on**: 10.5, 10.6
- **gates**: 1. outcome `adopted`; 2. the entry names `{PD}/installs/0.49.56/node_modules/@cortexkit/opencode-magic-context`;
  3. `opencode-session-manager patches check` exit 0; 4. `patches effect --since <start> --json` → `respected` with the
  configured threshold of `{M}`'s `magic-context.jsonc` (read in this step).
- **problems**: `stopped` with a reason → the old entry stays (follow changes nothing on doubt).
- **escalation**: the user, with the report.
- **failure**: `opencode-session-manager patches follow --rollback` (entry back to the old store, which still exists).
- **returns**: the report.

### Step 10.8 — New units

- **runs in**: subagent general
- **action**: `run`
- **target**: `ssh msik15k 'cd {MA} && bun run install:watch'`
- **content**: the linux path of step 6.2.
- **depends on**: 10.7
- **gates**: 1. `is-enabled` and `is-active` path and timer → `enabled`/`active`; 2. `systemd-analyze --user verify` of
  the three installed units → empty; 3. `systemctl --user start opencode-session-manager-patches.service` then
  `journalctl --user -u opencode-session-manager-patches.service -n 20` shows one report from `opencode-session-manager`.
- **problems**: —
- **escalation**: the launcher.
- **failure**: `systemctl --user disable --now` the two units; remove the three files; `daemon-reload`.
- **returns**: outputs.

### Step 10.9 — Review `{M}`

- **runs in**: main session (review)
- **action**: `review`
- **target**: 10.1–10.8 outputs
- **content**: re-run the stage gate commands myself.
- **depends on**: 10.8
- **gates**: the stage gate.
- **problems**: —
- **escalation**: the user.
- **failure**: record-only.
- **returns**: —

## Stage 11 — Decommission opencode-magic-context-patches (D18)

**Why.** The user (2026-11-16): delete every installation and residual file of opencode-magic-context-patches once
everything is integrated. Appendix C is the inventory; each row is deleted only after the gate that makes it
redundant is green, and only by the main session (`{C}/AGENTS.md` 4.7).

**What.** Every Appendix C row gone on both hosts; `{S}` and `{MS}` removed; the GitHub repository archived with a
pointer to its new home; the OpenCode session moved off `{S}`.
Revision 12 (2026-11-17): `{M}` rows deferred — run now: 11.1 (depends: Stage 9 closed, not 10.9), 11.2, 11.3, 11.4,
11.7, 11.8 for `{S}` only (gate 2 stands: ls-remote = 11.7 SHA), 11.9 (depends: 11.8-`{S}`), 11.10 Mac rows only,
11.11 Mac scans only. Deferred to the follow-up plan: 11.5, 11.6, the 11.8 `{MS}` half, the 11.10/11.11 `{M}` rows.
The stage gate is judged on the Mac rows + `isArchived`; the `{M}` rows and Appendix C `{M}` rows go to the follow-up.

**Stage gate.** Step 11.11's re-scan prints only the allowed references of Appendix C; `gh repo view
mavasbel-devtools/opencode-magic-context-patches --json isArchived` → `{"isArchived":true}`.

### Step 11.1 — Move this OpenCode session off `{S}`

- **runs in**: main session (session management)
- **action**: `move`
- **target**: this session (`{SID}`), from `{S}` to `{A}`
- **content**: `execute` → `tools.opencode.session_move({ directory: "{A}" })`. Reason: `{S}` is this session's working
  directory and step 11.8 deletes it.
- **depends on**: 9.6, 10.9
- **gates**: 1. the tool returns `directory` = `{A}`.
- **problems**: the move fails → stop; `{S}` is not deleted while the session lives in it.
- **escalation**: the user.
- **failure**: move back to `{S}`.
- **returns**: the result.

### Step 11.2 — Mac: old binary

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `/Users/mavasbel/.local/bin/opencode-magic-context-patches` (89,748 KB)
- **content**: `rm`; nothing depends on it: no unit or agent runs it on this Mac (`launchctl list | grep -c magic-context-patches` → 0,
  checked first), and `opencode-session-manager patches` reproduces it (Stage 7, 9.3).
- **depends on**: 11.1
- **gates**: 1. `test ! -e` → 0; 2. `command -v opencode-magic-context-patches` → empty.
- **problems**: —
- **escalation**: —
- **failure**: `cd {S} && bun run install:cli` (before 11.8) or from `{X}/bundles/s-final.bundle` after.
- **returns**: —

### Step 11.3 — Mac: old data and state

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `/Users/mavasbel/.local/share/opencode-magic-context-patches` and `/Users/mavasbel/.local/state/opencode-magic-context-patches`
- **content**: re-run 9.2 gates 1–3 first; `chmod -R u+w` (backups are read-only); `rm -rf` both.
- **depends on**: 11.2
- **gates**: 1. `test ! -e` both; 2. `ls {PD}/backups/0.49.56` lists the five patch folders (the migrated copies
  `undo` would use; `undo` itself is not run, because it would change the live copy).
- **problems**: —
- **escalation**: —
- **failure**: `tar -xpf {X}/backup/old-tool.tar -C ~`.
- **returns**: —

### Step 11.4 — Mac: the old tool's leaked and cutover files

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `/private/tmp/opencode/mc-patches-live-follow-40896`, `/private/tmp/opencode/mc-patches-live-follow-44934`
  (created 2026-11-15 20:53 and 21:07 by the old live test's setup outside `try`), `{C}/opencode.jsonc.2026-11-15-21-10.bak`
  (the 0.49.56 plan's step 5.1 backup of the entry the old tool managed)
- **content**: `rm -rf` the two folders; `rm` the backup after `patches check` exit 0 (the current entry works). Then
  `rmdir /private/tmp/opencode` only when `ls -A /private/tmp/opencode` prints nothing (other sessions use it too).
- **depends on**: 11.3
- **gates**: 1. `test ! -e` each.
- **problems**: —
- **escalation**: —
- **failure**: the `.bak` is also in `{X}/backup/` (taken in 1.4 as a copy of the then-current file; the `.bak` itself is
  copied there first by this step).
- **returns**: —

### Step 11.5 — `{M}`: the stray worktree (D11)

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `/home/mavasbel/Dev/repos/opencode/perf/.cache/worktrees/12-f45fa827-1793831308869-84180` (detached
  `db054ce`, 2026-11-04, a worktree of `{MS}`)
- **content**: `git -C <it> status --porcelain` empty → `git -C {MS} worktree remove <it> && git -C {MS} worktree prune`;
  `db054ce` is on `{MS}`'s history (`git -C {MS} merge-base --is-ancestor db054ce main`).
- **depends on**: 11.1
- **gates**: 1. `test ! -e <it>`; 2. `git -C {MS} worktree list` → one line.
- **problems**: not clean or not an ancestor → stop, show the user.
- **escalation**: the user, with `git -C <it> status` and `git -C <it> log -1`.
- **failure**: `git -C {MS} worktree add --detach <it> db054ce`.
- **returns**: —

### Step 11.6 — `{M}`: units, binary, data, state

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `~/.config/systemd/user/opencode-magic-context-patches.{path,service,timer}`, `~/.local/bin/opencode-magic-context-patches`,
  `~/.local/share/opencode-magic-context-patches` (1,251,708 KB, installs 0.49.55 and 0.49.56 included),
  `~/.local/state/opencode-magic-context-patches`, and `{PS}/follow-previous-entry` when it names a path under the old
  folder
- **content**: checks first: `grep -c opencode-magic-context-patches ~/.config/opencode/opencode.jsonc` → 0 (only
  commented lines allowed, listed); `lsof +D ~/.local/share/opencode-magic-context-patches/installs` → empty;
  10.6 gates re-run. Then `rm` the units, `systemctl --user daemon-reload`, `systemctl --user reset-failed`;
  `rm` the binary; `chmod -R u+w` and `rm -rf` the two folders; `rm {PS}/follow-previous-entry` if it names the old folder.
- **depends on**: 11.5
- **gates**: 1. `test ! -e` each; 2. `systemctl --user list-unit-files 'opencode-magic-context-patches*'` → `0 unit files listed.`;
  3. `opencode-session-manager patches follow --rollback --json` → `stopped`, "no previous entry is recorded" (nothing
  changes); 4. `opencode-session-manager patches check` exit 0.
- **problems**: OpenCode still maps a file of the old store → `lsof` shows it; stop until the server restarts.
- **escalation**: the user: "OpenCode on `{M}` still holds `<file>`; restart its server?"
- **failure**: `tar -xpf {MX}/backup/old-tool.tar -C ~` (state, backups, units); installs come back by `npm`-installing
  0.49.56 through the old `follow` (from `{MX}/s-final`).
- **returns**: —

### Step 11.7 — Point the old repository at its new home

- **runs in**: subagent general
- **action**: `edit`
- **target**: `{S}/README.md` through a worktree `{S}/worktrees/docs-archived-notice` (branch `docs-archived-notice`)
- **content**: first line after the title: `**Archived.** Merged into
  [mavasbel-devtools/opencode-session-manager](https://github.com/mavasbel-devtools/opencode-session-manager) as
  `opencode-session-manager patches` (commit `<merge SHA>`, 2026-11-16).` Commit with `{IDENT}`; `git -C {S} merge
  --ff-only docs-archived-notice && git -C {S} push origin main`; remove the worktree and branch.
- **depends on**: 11.4
- **gates**: 1. `bun run lint:docs` in the worktree → `docs ok`; 2. remote `main` = local `main`; 3. `git -C {S}
  worktree list` → one line.
- **problems**: —
- **escalation**: the launcher.
- **failure**: revert commit and push.
- **returns**: SHA.

### Step 11.8 — Remove the local checkouts

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `{S}` (Mac) and `{MS}` (`{M}`)
- **content**: checks first, on each: `git status --porcelain` empty; `git stash list` empty; `git worktree list` one
  line; `git branch -vv` shows no `ahead`; `git rev-parse main` = remote `main`. Then `rm -rf`.
- **depends on**: 11.7, 11.6
- **gates**: 1. `test ! -e` both; 2. `git ls-remote https://github.com/mavasbel-devtools/opencode-magic-context-patches main`
  = the SHA of 11.7 (nothing lost).
- **problems**: a check fails → stop.
- **escalation**: the user, with the failing check.
- **failure**: `git clone https://github.com/mavasbel-devtools/opencode-magic-context-patches <path>`.
- **returns**: —

### Step 11.9 — Archive on GitHub (D12)

- **runs in**: main session (hand-off to the user; outward-facing)
- **action**: `run`
- **target**: the user runs `gh repo archive mavasbel-devtools/opencode-magic-context-patches --yes`
- **content**: ask the user to run it and answer "archived".
- **depends on**: 11.8
- **gates**: 1. `gh repo view mavasbel-devtools/opencode-magic-context-patches --json isArchived` → `{"isArchived":true}`.
- **problems**: —
- **escalation**: the user.
- **failure**: `gh repo unarchive … --yes` (by the user).
- **returns**: —

### Step 11.10 — Shared caches and links

- **runs in**: main session (destructive when a row is found)
- **action**: `delete`
- **target**: any `opencode-magic-context-patches` entry in `~/.bun/install/global`, `~/.npm/_npx`, `crontab -l`,
  shell start files (`~/.zshrc`, `~/.zprofile`, `~/.bashrc`, `~/.profile`) on both hosts
- **content**: list first (`grep -l`, `ls`); delete only rows found, each shown before deletion.
- **depends on**: 11.9
- **gates**: 1. the listing re-run prints nothing.
- **problems**: a shell file line → shown to the user before editing.
- **escalation**: the user.
- **failure**: the edited file's copy in `{X}/backup/`.
- **returns**: the listing.

### Step 11.11 — Re-scan both hosts

- **runs in**: subagent general
- **action**: `run`
- **target**: `find ~ -xdev \( -name '*magic-context-patches*' -o -name '*mc-patches*' \) -not -path '*/node_modules/*' 2>/dev/null`
  and `grep -rIl --exclude-dir=node_modules 'opencode-magic-context-patches' ~/.config ~/.local/bin ~/.local/share ~/.local/state ~/Library/LaunchAgents 2>/dev/null`
  on both hosts
- **content**: compare with Appendix C "Allowed references".
- **depends on**: 11.10
- **gates**: 1. every printed path is in "Allowed references".
- **problems**: a hit outside the list → back to the matching Appendix C row (main session deletes).
- **escalation**: the user, for anything not created by the old tool.
- **failure**: read-only.
- **returns**: both outputs.

## Stage 12 — No residue

**Why.** `{C}/AGENTS.md` rule 3.10 (added by plan 2026-11-15-22-13).

**What.** Every path this plan created that is neither a deliverable nor retained is gone, proved path by path.
Revision 12 (2026-11-17): 12.1 runs on this Mac only (`{X}/after`; `{MX}/after` deferred with `{M}`); 12.2 deletes
the `{T}` scratch dirs and the withdrawn plan-2 copy but KEEPS `{X}` — its evidence and `{X}/backup` back the
deferred `{M}` work, so `{X}` is retained for the follow-up, not residue; 12.3 (delete this plan's scratch copy) is
deferred — the plan is not finished.
Revision 13 (2026-11-17): supersedes the Revision 12 note above — 12.1 and 12.2 run on this Mac only; 12.2 deletes
`{X}` whole (Mac backups only, every gate they protect is green) and `{T}/step-11-11-find.out`, and never touches
`{MX}` (Retained on `{M}`); 12.3 is now step 13.5. The stage gate is judged on `{X}/before` only.

**Stage gate.** The after-snapshot differs from `{X}/before`/`{MX}/before` only by rows in What, Retained, Appendix C
deletions, and foreign rows (other sessions', shown with birth time, never deleted); every deleted path has
`test ! -e` evidence in the record.

### Step 12.1 — After-snapshot and classification

- **runs in**: subagent general
- **action**: `run`
- **target**: the same commands as 1.1 into `{X}/after/` and `{MX}/after/`
- **content**: `diff` each pair; classify every added path: deliverable, retained, plan scratch, plan-2 leftover,
  foreign (with `stat -f %SB` / `stat -c %w` birth time and owner process when known).
- **depends on**: 11.11, 7.4
- **gates**: 1. every added row classified; 2. no row classified as "unknown".
- **problems**: an unknown row → never deleted on a guess.
- **escalation**: the user, with the row and its birth time.
- **failure**: read-only.
- **returns**: the classified table.

### Step 12.2 — Delete plan scratch and plan-2 leftovers

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `{MX}` (on `{M}`; and `/tmp/opencode` when 1.1 shows it absent before and it is now empty); in `{T}/opencode/{SID}/`:
  `merge-research/` (this plan's drafting), `upstream-analysis/` and the upstream clone when step 0.2 found them kept
  for plan 2; `/Users/mavasbel/.opencode/plan/2026-11-15-22-13-upstream-execute-threshold-minimum.md` (withdrawn plan's
  scratch copy; it was never committed: plan 2 did not reach its step 1.4); finally `{X}`
- **content**: the record already holds every gate output (pasted after each step, `{C}/AGENTS.md` 9.3), so `{X}`'s
  outputs are no longer needed; `rm -rf` each; `rmdir {T}/opencode/{SID}` when empty.
- **depends on**: 12.1
- **gates**: 1. `test ! -e` each, printed per path.
- **problems**: a path holds something not created by this plan → 12.1 classified it; stop.
- **escalation**: the user.
- **failure**: none possible after deletion of scratch; backups in `{X}` are deleted last, after 7.4, 9.x and 11.x are green.
- **returns**: per-path output.

### Step 12.3 — Delete this plan's scratch copy (superseded by Revision 13: runs as step 13.5; not run here)

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `/Users/mavasbel/.opencode/plan/2026-11-15-23-45-merge-magic-context-patches.md`
- **content**: `cmp` with `{W}/docs/plans/2026-11-15-23-45-merge-magic-context-patches.md` → 0 (or, when the plan was
  edited after 1.7, `cmp` with the latest committed revision), then `rm`.
- **depends on**: 12.2
- **gates**: 1. `test ! -e`.
- **problems**: —
- **escalation**: —
- **failure**: copy back from `{W}`.
- **returns**: —

## Stage 13 — Record and report

**Why.** `{C}/AGENTS.md` 2.13, 9.3; 7.6.

**What.** The session record complete on `main`; the worktree and branch removed; memory corrected; the report.
Revision 12 (2026-11-17): 13.1 runs now with depends re-wired to 12.2 (Mac rows) — the record covers Mac completion
plus the `{M}` deferral; 13.2–13.4 run now.
Revision 13 (2026-11-17): order is 13.1 → 13.1b → 13.2 → 13.3 → 13.4 → 13.5. 13.1 first runs
`cp /Users/mavasbel/.opencode/plan/2026-11-15-23-45-merge-magic-context-patches.md {W}/docs/plans/2026-11-15-23-45-merge-magic-context-patches.md`
and adds both the plan and the record by exact path to its commit (extra gate: `cmp` of the two copies → 0 before commit).
The record states `{M}` and win32 as out of scope (user-run), not deferred. The 13.2 stage gate stands.

**Stage gate.** `git -C {A} worktree list` → `{A}` plus `feat-herdr-pane-agent` and `feat-macos-store-migration`
(each only if it still exists);
`git -C {A} branch --list feat-magic-context-patches` → empty; remote `main` = local `main`.

### Step 13.1 — Final record, merged

- **runs in**: main session (writes the session record)
- **action**: `edit`
- **target**: `{W}/docs/sessions/{SID}.md`
- **content**: every step `[x]` with its evidence; the report sections: what changed per host, what was verified,
  blocked (win32 e2e/live/watch), gaps (scenario tags, branch coverage, `pinnedMagicContext`, Magic Context project
  data for `{S}`), the retained list. Commit `Docs: session record of the patches merge` with `{IDENT}`; `git -C {A}
  merge --ff-only feat-magic-context-patches && git -C {A} push origin main`.
- **depends on**: 12.3
- **depends on**: 12.2 (Revision 13: Mac rows; 12.3 moved after this step as 13.5)
- **gates**: 1. `bun run lint:diagrams` 0; 2. remote `main` = local `main`.
- **problems**: —
- **escalation**: —
- **failure**: before push, `git -C {A} reset --hard ORIG_HEAD`.
- **returns**: SHA.

### Step 13.1b — Install from the merged `main` (Revision 13)

- **runs in**: main session (installs into the user's `~/.local/bin`; changes the live tool)
- **action**: `run`
- **target**: `cd {W} && bun run install:cli && bun run validate:installed:cli && bun run validate:watch`
- **content**: `{W}` is at local `main` = remote `main` after 13.1. Rebuild and install the CLI from it, byte-compare,
  and confirm the launchd agent is still installed and valid. `bun run install:watch` is **not** re-run: 13.1 changes
  only `docs/`, so the plist template is unchanged since 9.8 (gate 4 proves it).
- **depends on**: 13.1
- **gates**: 1. `validate:installed:cli` exit 0 (byte-identical, `--version` printed); 2. `opencode-session-manager --version`
  prints the `package.json` version; 3. `opencode-session-manager patches check` exit 0; 4. `git -C {W} diff --stat
  fe43262..HEAD -- launchd/ scripts/watch.mjs` prints nothing; 5. `bun run validate:watch` exit 0.
- **problems**: gate 4 prints a change → re-run `bun run install:watch` and then `validate:watch`. Gate 3 exit 1 → stop;
  quote `patches status`.
- **escalation**: the user, with the failing gate's output.
- **failure**: re-install from the same commit; the previous binary is byte-identical by construction (docs-only diff).
- **returns**: gate outputs.

### Step 13.2 — Remove the worktree and branch

- **runs in**: main session
- **action**: `delete`
- **target**: `{W}` and branch `feat-magic-context-patches`
- **content**: `git -C {A} worktree remove {W} && git -C {A} worktree prune && git -C {A} branch -d feat-magic-context-patches`.
  Its evidence goes into the closing report (the record is already committed).
- **depends on**: 13.1b (Revision 13)
- **gates**: the stage gate.
- **problems**: `branch -d` refuses (not merged) → 13.1 did not merge; back to it.
- **escalation**: —
- **failure**: `git -C {A} worktree add {W} feat-magic-context-patches`.
- **returns**: outputs.

### Step 13.3 — Memory

- **runs in**: main session
- **action**: `edit`
- **target**: project memory #8029 and Hindsight
- **content**: update #8029: the patches live in `opencode-session-manager patches …` on both hosts; macOS has a
  launchd agent `{LABEL}`; the old tool and its repository are gone (archived); the new baselines of Stage 7.
  Ingest a `Correction: opencode-magic-context-patches` document into Hindsight with old claim, new truth, evidence.
- **depends on**: 13.2
- **gates**: 1. `ctx_memory get [8029]` shows the new text.
- **problems**: —
- **escalation**: —
- **failure**: —
- **returns**: —

### Step 13.4 — Report

- **runs in**: main session
- **action**: `review`
- **target**: the user
- **content**: per-item table of What 1–5 with evidence; blocked; gaps; 13.2's outputs.
- **depends on**: 13.3
- **gates**: 1. every What item has a row.
- **problems**: —
- **escalation**: —
- **failure**: —
- **returns**: —

### Step 13.5 — Delete this plan's scratch copy (Revision 13; was 12.3)

- **runs in**: main session (destructive)
- **action**: `delete`
- **target**: `/Users/mavasbel/.opencode/plan/2026-11-15-23-45-merge-magic-context-patches.md`
- **content**: `cmp` with `git -C {A} show main:docs/plans/2026-11-15-23-45-merge-magic-context-patches.md` → 0, then `rm`.
- **depends on**: 13.4
- **gates**: 1. `test ! -e` → 0.
- **problems**: `cmp` differs → the committed revision is stale; stop and ask.
- **escalation**: the user.
- **failure**: `git -C {A} show main:docs/plans/2026-11-15-23-45-merge-magic-context-patches.md > <scratch path>`.
- **returns**: —

## Appendix A — Baselines

Filled by steps 1.9–1.11 and reviewed by 1.12; one row per host and command: exit status, pass, fail, skip, the
`FAILS` file's SHA-256 and the classified causes. Known before the plan (evidence only, not the baseline):

| Set | Source | Result |
|---|---|---|
| `{A}` + D1 on macOS (scratch copy, 2026-11-15) | `{T}/opencode/{SID}/merge-research/out/` | typecheck 0; lint 8 failures (Appendix D); unit 528 pass / 4 fail; component 9 / 1; e2e 22 / 70 (62 `UnsupportedPlatformError`) |
| `{S}` at `cd92fff` on macOS | plan 2026-11-15-22-13 Appendix A | unit 228 / 1, e2e 38 / 19, component 3 / 1 (all Arborist `installed no …`), live 3 / 4 (threshold reads the whole log; `/bin/true`; two systemd) |

| Row | Host | Checkout | Filled by |
|---|---|---|---|
| `mac` | this Mac | `{W}` at `{base}` | 1.9 |
| `linux-a` | `{M}` | `{MX}/a-base` at `{base}` | 1.10 |
| `linux-s` | `{M}` | `{MX}/s-final` at `{S-final}` | 1.11 |

## Appendix B — The old tool's command surface (kept by `opencode-session-manager patches`)

From `{S}/src/infrastructure/adapters/inbound/cli/CliAdapter.ts` lines 13–30 at `cd92fff` (the program name becomes
`opencode-session-manager patches`):

```text
status  [--json]                          every patch on every installed copy
apply   [--patch <id>] [--version <v>] [--json]
undo    [--patch <id>] [--version <v>] [--json]
check   [--json]                          exit 0 only if all patches are applied on the loaded copy
inspect --version <v> [--json]            review a version a patch was not checked against
effect  [--since <ISO time>] [--json]     is the configured threshold in use? (Magic Context's log)
notify  [--json]                          desktop notification when check fails
follow  [--version <v>] [--json]          adopt the newest release (or <v>) already patched
follow  --rollback [--json]               put back the entry opencode.jsonc had before
--help | --version
exit codes: 0 ok, 1 not ok / refused / failed / stopped, 2 usage error.
```

Commands: `status apply undo check inspect effect notify follow`; value flags `--patch --version --since`; `--json`
everywhere; `--rollback` only with `follow`; any other argument → usage error, exit 2.

## Appendix C — The old tool's footprint (Stage 11 deletes every row)

| # | Host | Path | Size / state (2026-11-16 00:10) | Deleted by | Gate that makes it redundant |
|---|---|---|---|---|---|
| C1 | Mac | `~/.local/bin/opencode-magic-context-patches` | 89,748 KB | 11.2 | 9.1, 9.3 |
| C2 | Mac | `~/.local/share/opencode-magic-context-patches/` (`backups/0.49.56/<5 patches>`) | 9,012 KB | 11.3 | 9.2 |
| C3 | Mac | `~/.local/state/opencode-magic-context-patches/audit.log` | 8 KB | 11.3 | 9.2 |
| C4 | Mac | `/private/tmp/opencode/mc-patches-live-follow-40896`, `…-44934` | 2 folders | 11.4 | — (leaked test homes) |
| C5 | Mac | `{C}/opencode.jsonc.2026-11-15-21-10.bak` | 1 file | 11.4 | 9.3 |
| C6 | Mac | `{S}` (incl. `node_modules/`, `dist/`, `.cortexkit/`, `worktrees/`) | checkout | 11.8 | 7.4, 11.7 |
| C7 | `{M}` | `~/.config/systemd/user/opencode-magic-context-patches.{path,service,timer}` + 2 `.wants` links | enabled, active | 10.1 (links), 11.6 | 10.8 |
| C8 | `{M}` | `~/.local/bin/opencode-magic-context-patches` | 82,072 KB | 11.6 | 10.4 |
| C9 | `{M}` | `~/.local/share/opencode-magic-context-patches/` (`backups/{0.49.19,0.49.35,0.49.50,config}`, `installs/{0.49.55,0.49.56}`, `derived-releases.json`) | 1,251,708 KB | 11.6 | 10.6, 10.7 |
| C10 | `{M}` | `~/.local/state/opencode-magic-context-patches/` (`audit.log` 196 lines, `evidence/` 19 files, `follow-previous-entry`) | 272 KB | 11.6 | 10.6 |
| C11 | `{M}` | `/home/mavasbel/Dev/repos/opencode/perf/.cache/worktrees/12-f45fa827-1793831308869-84180` | worktree of `{MS}`, detached `db054ce` | 11.5 | D11 |
| C12 | `{M}` | `{MS}` | checkout at `20099da` | 11.8 | 11.7 |
| C13 | GitHub | `mavasbel-devtools/opencode-magic-context-patches` | private, not archived | 11.9 (archived, not deleted: D4) | 11.7 |
| C14 | both | `opencode-magic-context-patches` rows in global Bun/npx, crontab, shell start files | none found at inventory; re-checked | 11.10 | — |

**Allowed references** (history, kept on purpose; 11.11 accepts only these):
- `{A}/docs/…` — the imported frozen documents and the file-map reference (D3);
- `{PD}/backups/…`, `{PS}/audit.log`, `{PS}/evidence/…` — the migrated history (D9), whose records name old paths;
- OpenCode's database `~/.local/share/opencode/opencode.db*`, Magic Context's data under `~/.local/share/cortexkit/`,
  Hindsight's store — conversation and memory history, not installations;
- `~/.npm/_cacache` index entries — npm's shared cache.

## Appendix D — D1's uncommitted work in `{A}` (identical in `{MA}`)

Digest command (run in the checkout): `( git diff --binary; for f in $(git ls-files -o --exclude-standard); do echo
"== $f"; cat "$f"; done ) | shasum -a 256` → `4d962b4474295810b8b037a47bf056888e0f36c2488c82fe1c2d2142ddee3407`.

Modified (18): `AGENTS.md`, `README.md`, `src/application/RepairSessionLocationsUseCase.ts`,
`src/domain/model/LocationRepair.ts`, `src/domain/services/RelocateRules.ts`,
`src/infrastructure/adapters/inbound/cli/HelpCliAdapter.ts`, `src/infrastructure/adapters/inbound/cli/RelocateCliAdapter.ts`,
`src/infrastructure/adapters/inbound/tui/SessionLocationRepairV2TuiAdapter.ts`,
`src/infrastructure/adapters/inbound/tui/SessionTransferV2TuiAdapter.ts`,
`src/infrastructure/adapters/outbound/fs/NodeLocationRepairMappingsAdapter.ts`, `src/main/cli-container.ts`,
`src/main/tui-container.ts`, `tests/e2e/location-repair.test.ts`, `tests/e2e/sessions/relocate.test.ts`,
`tests/unit/maintenance/main/container.test.ts`, `tests/unit/sessions/relocate-cli.test.ts`,
`tests/unit/transfer/repair-session-locations.test.ts`, `tests/unit/transfer/tui-v2-adapter.test.ts`.

Untracked (12 entries): `src/application/RepairWorktreeLinksUseCase.ts`, `src/domain/model/GitWorktree.ts`,
`src/domain/ports/inbound/RepairWorktreeLinksPort.ts`, `src/domain/ports/outbound/GitWorktreePort.ts`,
`src/domain/services/WorktreeRepairPlanner.ts`, `src/infrastructure/adapters/outbound/project/GitWorktreeAdapter.ts`,
`tests/component/location-repair-processes.test.ts`, `tests/live/tui-repair.test.ts`, `tests/support/live/drive-repair.mjs`,
`tests/support/repair/` (folder; holds `repair-process.ts`), `tests/unit/transfer/git-worktree-adapter.test.ts`,
`tests/unit/transfer/worktree-repair.test.ts`.

## Appendix E — File map

From the read-only survey `{T}/opencode/{SID}/merge-research/2026-11-16-file-map.md` (SHA-256
`d46e9cf216724375fec0aa92770eec2faae58584537175dde4c21f5602b22faa`, 2026-11-16 01:07), headings demoted one level,
its Gaps section replaced by the resolutions below. Where a resolution and a row differ, the resolution wins.

Read-only research, written 2026-11-16 (system clock `date +%Y-%m-%d-%H-%M` → `2026-11-16-01-07`).

- **S** = `/Users/mavasbel/Dev/repos/devtools/opencode-magic-context-patches`, committed state, HEAD `cd92fff`
  (`git rev-parse --short HEAD`), 262 tracked files (`git ls-files | wc -l`): 153 outside
  `tests/fixtures/` and 109 inside it.
- **A** = `/Users/mavasbel/Dev/repos/devtools/opencode-session-manager`, committed `029c1b8` plus the
  uncommitted work in the main checkout (18 modified, 12 untracked: `git -C A status --porcelain`).
  `A/worktrees/` is ignored. A's `src` holds 233 files, committed and untracked together
  (`git ls-files src` + `git ls-files --others --exclude-standard src`).
- File:line anchors in A point at the **working tree**. Several of the files they name are modified
  but not committed (`src/main/cli-container.ts`, `src/infrastructure/adapters/inbound/cli/HelpCliAdapter.ts`,
  `AGENTS.md`, `README.md`, `tests/unit/maintenance/main/container.test.ts`), so their line numbers can
  move before the merge.
- Placeholder used below: `<merge-stamp>` = the output of `date +%Y-%m-%d-%H-%M` taken at the step
  that imports the frozen documents (A AGENTS.md:635 requires the real time in document names).

Three labels are used throughout: **known** (checked; the evidence is cited), **inferred** (reasoned
from the cited evidence), and **unknown** (listed under Gaps).

### Rules that constrain the move

Every rule below comes from A's tests, scripts or configuration, or from A/AGENTS.md where the tests
enforce it.

#### `tests/unit/architecture/imports.test.ts`

| # | Rule | Where |
|---|---|---|
| I1 | The SQLite engine `infrastructure/adapters/outbound/sqlite/engine/Store.ts` is the only file allowed to import `bun:sqlite`, import drizzle's `sql`, or run `.query(`/`.prepare(`/`.exec(` on SQL text. S has none of these (an aft grep of `patches/` found 0; S's `.exec(` calls are `RegExp.exec` on identifiers, e.g. `src/domain/services/EffectReading.ts:21`, which the regex `\.(?:query|prepare|exec)\(\s*[`"']` does not match because no quote follows). | imports.test.ts:21-35 |
| I2 | `src` has exactly the four layers `application`, `domain`, `infrastructure`, `main`. | :45-47 |
| I3 | Allowed alias targets per layer: domain → `@session-manager/domain/`; application → domain and application; infrastructure → domain, application, infrastructure; main → everything under `@session-manager/`. | :14-19, :49-56 |
| I4 | No relative imports anywhere in `src`. | :58-60 |
| I5 | `domain` and `application` import only `@session-manager/…`: no `node:`, `bun:` or third-party package. | :62-71 |
| I6 | No `from "@opencode/…"` in any src file. | :73-75 |
| I7 | `@opentui/*` is imported only as `import type` outside `.tsx` files. | :77-87 |
| I8 | Only `main/` imports `main/server-container`, `main/tui-container` or `main/cli-container`. | :89-97 |
| I9 | The `main/<word>-container.ts` files are **exactly** `cli-container.ts`, `linux-container.ts`, `server-container.ts`, `tui-container.ts`, `win32-container.ts`; the import graph of `main/v2/server.ts` holds no `.tsx` file and no `tui-container.ts`. | :99-123 |
| I10 | Ports sit under `domain/ports/inbound/` or `domain/ports/outbound/`, **directly** (the test takes `rest.split("/")[1]` as the file name, so a subfolder fails), and each port file exports exactly one `interface …Port`, whose name equals the file name. | :125-141 |
| I11 | Adapters exist on both the inbound and the outbound side, and every `*Adapter.ts(x)` file is under `infrastructure/adapters/`. | :143-152 |
| I12 | Outside `tests/support/platform.ts` and `tests/unit/platform/<p>/`, no test file reads `process.platform` (D29). | added by step 4.3 |

#### `tests/unit/architecture/solid-principles.test.ts`

| # | Rule | Where |
|---|---|---|
| P1 | A file exports at most one class, and that class is named after the file. | :12-22 |
| P2 | A file has as many `constructor(` as it has `class X` (counted textually, comments included). | :24-31 |
| P3 | A class in an `*Adapter.ts(x)` or `*UseCase.ts(x)` file declares `implements <Port>`. Inbound adapters (under `/adapters/inbound/`) are exempt. | :33-43 |
| P4 | Every file under `application/` imports only from `@session-manager/domain/…`, or uses `import type` from `@session-manager/application/…`. **A value import from another application file fails**, and the text `Adapter` may not appear anywhere in an application file. | :45-64 |
| P5 | `new X` of a class defined in `src` appears only in `main/<word>-container.ts`. Classes whose name ends in `Error` are exempt. | :66-76 |
| P6 | No src class extends another src class. Extending a built-in such as `Error` is allowed. | :78-85 |

#### Coverage, platforms and test support

| # | Rule | Where |
|---|---|---|
| C1 | The unit tier imports every src file, so none escapes the per-file gate. | tests/unit/architecture/coverage-completeness.test.ts:4-8 |
| C2 | The e2e tier imports every src file of the current platform, and no file of another platform. | tests/e2e/coverage-completeness.test.ts:4-10 |
| C3 | `sourceFiles()` collects every `.ts`/`.tsx` under `src`; `PLATFORMS = ["linux", "win32"]`; `platformOf` reads a file's platform from `infrastructure/adapters/outbound/platform/<p>/` or from `main/<p>-container.ts` when `p` is in `PLATFORMS`; `loadEverySource(platform)` keeps only that platform's files. | tests/support/source-files.ts:7-16, :21, :24-29, :41-48 |
| C4 | `PLATFORMS` equals `SUPPORTED_PLATFORMS`; the folders under `outbound/platform/` are exactly `SUPPORTED_PLATFORMS`; each supported platform has `main/<p>-container.ts`. | tests/unit/maintenance/architecture.test.ts:11-16 |
| C5 | Only that platform's container or folder imports `…/outbound/platform/<p>/…`. | tests/unit/maintenance/architecture.test.ts:18-27 |
| C6 | A platform container is loaded only by `main/cli/platform.ts`, and only through `await import(…)`; no static `import … -container"` there. | tests/unit/maintenance/architecture.test.ts:29-39 |
| C7 | `LOADERS` = `linux`, `win32`; `SUPPORTED_PLATFORMS = Object.keys(LOADERS)`; any other platform throws `UnsupportedPlatformError`. | src/main/cli/platform.ts:22-33 |
| C8 | Asserted behaviour: `SUPPORTED_PLATFORMS` deep-equals `["linux","win32"]`, and `darwin` is refused with the exact message `unsupported platform: darwin (supported: linux, win32)`. | tests/unit/maintenance/infrastructure/platform.test.ts:145-163 |
| C9 | Asserted behaviour: `buildContainer` rejects darwin, and wires every supported platform. | tests/e2e/maintenance/failures.test.ts:183-199 |
| C10 | `scripts/coverage.mjs` uses `bunfig.coverage.toml` for unit and `bunfig.coverage.e2e-${process.platform}.toml` for e2e; a missing e2e config exits 1. | scripts/coverage.mjs:11-14, :20-23, :24 |
| C11 | The gate is 100 % lines and functions per file. The e2e configs ignore the other platform's adapter folder and container. | bunfig.coverage.toml:15-16; bunfig.coverage.e2e-linux.toml:16-17; bunfig.coverage.e2e-win32.toml:16-17 |
| C12 | Tests preload `@opentui/solid/preload` and `./tests/support/no-herdr.ts`; plain test runs have `coverage = false`. | bunfig.toml:5-9 |

#### `scripts/lint-diagrams.mjs` (`bun run lint:diagrams`)

| # | Rule | Where |
|---|---|---|
| L1 | Code fences are balanced in every `.md`/`.mdx` of the repository, `docs/reference/` and test fixtures included. | :21-32, :41-42 |
| L2 | Mermaid blocks contain no `->--` and no table row holding `-->`. | :44-48 |
| L3 | Every repo-relative `src|tests?|scripts|docs/….(tsx|ts|mjs|md|json|js)` path written in a document exists, **except** in documents under `docs/reference/`. | :35, :50-51 |
| L4 | Every `bun run <name>` in README.md or AGENTS.md is a real script. | :53-55 |
| L5 | README.md and AGENTS.md together name every package.json script as `bun run <name>`. | :62 |
| L6 | README.md and AGENTS.md together name every `(OPENCODE|XDG|MAGIC_CONTEXT|HERDR)_[A-Z0-9_]+` read in any tracked or untracked `src`, `tests` or `scripts` file ending `.ts`, `.tsx`, `.mjs` or `.js` — **fixture `.js` files included**. | :65-74 |
| L7 | AGENTS.md names every file under `src/` and `tests/support/`: by its path below the folder, by its basename when that is unique, or through a folder written as `` `dir/` `` or `dir/*`. | :76-89 |
| L8 | Rule L3 does not apply under `docs/plans/` or `docs/sessions/` (working documents describe future and deleted states); L1/L2 still do. AGENTS.md §9 names the exception. | lint-diagrams.mjs (step 1.13); AGENTS.md:§9 |

#### Configuration and AGENTS.md rules

| # | Rule | Where |
|---|---|---|
| T1 | Aliases: `@session-manager/*` → `src/*`, `@test/*` → `tests/*`, `@package-json` → `package.json`. Only `.ts`/`.tsx` under `src` and `tests` are included. | tsconfig.json:7-11, :23 |
| T2 | `package.json` has only `devDependencies`, every one pinned exactly; there is no `dependencies` key. | package.json:27-38; AGENTS.md:659-660 |
| T3 | The plugin bundles and the CLI have no runtime dependencies. | AGENTS.md:20, :659-660 |
| T4 | CLI platforms are Linux and Windows; any other is refused. | AGENTS.md:19 |
| T5 | Platform law: OS-specific code lives only in `outbound/platform/<p>/` and is wired only by `main/<p>-container.ts`; adapters take their system root or executable as a constructor argument. | AGENTS.md:198-208 |
| T6 | Every recursive delete in a test goes through `removeTemporary()`/`removeTemporarySync()` (`tests/support/live/process.ts`) or `removeTemporary()` (`tests/support/maintenance/temporary.ts`). | AGENTS.md:603-606 |
| T7 | Documents are named `YYYY-MM-DD-HH-MM-<name>.md`; frozen predecessors' documents go under `docs/reference/`. | AGENTS.md:26, :632-643 |
| T8 | The compiled CLI is built from `src/main/cli/cli.ts` with every autoload off. | scripts/build.mjs:67-83 |
| T9 | Only `src/main/*-container.ts` constructs adapters and use cases; a use case imports from `src/domain` plus the *types* of the application services it composes. | AGENTS.md:178-181 (enforced by P4, P5) |

### File map

How to read this table:

- The table has one row per tracked file of S, and one row per fixture version folder.
- A paths are relative to A's root. `src/…/outbound/` stands for `src/infrastructure/adapters/outbound/`.
- Every moved file keeps its content apart from three mechanical edits: imports rewritten from
  `@mc-patches/…` to `@session-manager/…` (with the new paths), `@patches/…` rewritten to
  `@session-manager/domain/patch-definitions/…`, and `PACKAGE_NAME` replaced by A's
  `MAGIC_CONTEXT_PACKAGE`.
- Rows marked "move+edit" carry further edits, and the why column states them.

Layout chosen for the new files:

- Patch model files go in `src/domain/model/patches/` and patch services in `src/domain/services/patches/`.
- Patch use cases go in `src/application/patches/`.
- Ports stay flat with a `Patch` prefix, because a port subfolder fails I10.
- Patch definitions go in `src/domain/patch-definitions/`. This is legal because each definition file
  imports only `import type { PatchDefinition }` from the domain (I3, I5), defines no class (P1–P6),
  and is loaded and measured like any src file (C1, C11).

| S path | A target path | action | why |
|---|---|---|---|
| `.gitignore` | dropped | drop | A's `.gitignore` already ignores `node_modules/`, `dist/`, `coverage/` and `worktrees/` (A `.gitignore` lines 1, 2, 4, 6) |
| `AGENTS.md` | `docs/reference/<merge-stamp>-legacy-magic-context-patches-agents.md`, with its rules merged into `AGENTS.md` | move+rename, merge | frozen-predecessor precedent (A `docs/reference/2026-10-07-23-30-legacy-db-manager-agents.md`; A AGENTS.md:26). Safety rules 1–7, "Adding a version", the patch-matcher rules and the source map move into A AGENTS.md (see "A files edited") |
| `LICENSE` | dropped | drop | byte-identical to A's `LICENSE` (`cmp` exit 0) |
| `README.md` | `docs/reference/<merge-stamp>-legacy-magic-context-patches-readme.md`, with its user content merged into `README.md` | move+rename, merge | same precedent (A `docs/reference/2026-10-07-23-30-legacy-db-manager-readme.md`). Its one mermaid block passes L2 (checked: no `->--`, no `\|…-->` row); 6 fences pass L1 |
| `bun.lock` | dropped; A `bun.lock` regenerated | drop | A has its own `bun.lock`; adding `@npmcli/arborist` changes it |
| `bunfig.coverage.toml` | dropped | drop | A's `bunfig.coverage.toml` covers all of `src` (C11) |
| `bunfig.toml` | dropped | drop | A's `bunfig.toml` (C12) |
| `package.json` | merged into `package.json` | merge | see Dependencies and "A files edited". Scripts already in A (`build`, `test*`, `coverage*`, `typecheck`, `install:cli`, `validate:installed:cli`, `cli`) keep A's definition; `check` and `lint:docs` are dropped; `install:watch`, `uninstall:watch` and `validate:watch` are added |
| `tsconfig.json` | dropped | drop | A's tsconfig.json:7-11 has no `@mc-patches`/`@patches` aliases; the patches move into `src`, so no alias is added |
| `docs/plans/2026-10-11-19-37-patch-tool.md` | `docs/reference/2026-10-11-19-37-magic-context-patches-plan-patch-tool.md` | move+rename | frozen import. In `docs/plans/` it would fail L3 on S paths that do not exist in A; `docs/reference/` is exempt (lint-diagrams.mjs:50-51) |
| `docs/plans/2026-10-23-00-39-follow-command.md` | `docs/reference/2026-10-23-00-39-magic-context-patches-plan-follow-command.md` | move+rename | same reason (it names 1 repo path) |
| `docs/plans/2026-11-10-22-48-composed-patches-and-fold-identity.md` | `docs/reference/2026-11-10-22-48-magic-context-patches-plan-composed-patches-and-fold-identity.md` | move+rename | same reason (12 repo paths) |
| `docs/plans/2026-11-15-20-44-magic-context-0.49.56.md` | `docs/reference/2026-11-15-20-44-magic-context-patches-plan-magic-context-0.49.56.md` | move+rename | same reason (8 repo paths) |
| `docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md` | `docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md` | move | the name must not change: `evidence` fields (`patches/execute-threshold-min.ts:62`) and `tests/unit/patches/patches.test.ts:16` read `patch.evidence` relative to the repository root. No A file has this name (checked `ls docs/*/<name>`) |
| `docs/reference/2026-10-12-15-13-magic-context-0.48.0-execute-threshold.md` | same path | move | named in the comments of `patches/execute-threshold-min.ts:17`; no collision |
| `docs/reference/2026-10-12-23-15-magic-context-0.49.0-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-14-22-08-magic-context-0.49.2-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-16-17-03-magic-context-0.49.7-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-18-11-42-magic-context-0.49.12-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-19-16-03-magic-context-0.49.13-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-20-20-57-magic-context-0.49.15-execute-threshold.md` | same path | move | same |
| `docs/reference/2026-10-22-01-14-magic-context-0.49.15-no-session-model-fallback.md` | same path | move | `evidence` of `patches/no-session-model-fallback.ts:51` |
| `docs/reference/2026-10-22-23-00-magic-context-0.49.19-patches.md` | same path | move | named in patch comments; no collision |
| `docs/reference/2026-11-02-06-30-magic-context-0.49.35-patches.md` | same path | move | same |
| `docs/reference/2026-11-02-23-06-magic-context-0.49.35-refusal-patches.md` | same path | move | `evidence` of `patches/refusal-recovery.ts:112` |
| `docs/reference/2026-11-03-01-43-magic-context-0.49.35-refusal-recovery-sandbox.md` | same path | move | frozen; no collision |
| `docs/reference/2026-11-07-23-41-magic-context-0.49.41-patches.md` | same path | move | named in patch comments |
| `docs/reference/2026-11-08-10-45-magic-context-0.49.42-0.49.43-patches.md` | same path | move | same |
| `docs/reference/2026-11-10-23-00-magic-context-fold-identity.md` | same path | move | `evidence` of `patches/fold-identity-stable.ts:41` and `patches/fold-provenance-heal.ts:50` |
| `docs/reference/2026-11-11-01-24-magic-context-0.49.46-0.49.50-patches.md` | same path | move | named in patch comments |
| `docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md` | same path | move | same |
| `docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md` | same path | move | same |
| `docs/research/2026-10-11-20-05-patching-approach.md` | `docs/reference/2026-10-11-20-05-magic-context-patches-research-patching-approach.md` | move+rename | frozen; it names 1 repo path (L3) |
| `docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` | `docs/reference/<merge-stamp>-magic-context-patches-session-ses_e1dc7d932ffe69P47CJLyPq6qR.md` | move+rename | `ses_e1dc7d932ffe69P47CJLyPq6qR` is the id of the session doing the merge, so A's `docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` is reserved for its own record; S's file also names 6 repo paths (L3) |
| `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | `docs/reference/<merge-stamp>-magic-context-patches-session-ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | move+rename | A already has `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` with different content (`cmp`: differ at char 55, line 1) |
| `patches/execute-threshold-min.ts` | `src/domain/patch-definitions/execute-threshold-min.ts` | move | patch data in the domain layer (I3, I5); no class |
| `patches/fold-identity-stable.ts` | `src/domain/patch-definitions/fold-identity-stable.ts` | move | same |
| `patches/fold-provenance-heal.ts` | `src/domain/patch-definitions/fold-provenance-heal.ts` | move | same |
| `patches/index.ts` | `src/domain/patch-definitions/index.ts` | move | its `@patches/…` imports become `@session-manager/domain/patch-definitions/…`; the basename `index.ts` does not exist in A `src` (checked) |
| `patches/no-session-model-fallback.ts` | `src/domain/patch-definitions/no-session-model-fallback.ts` | move | same as the first row |
| `patches/refusal-recovery.ts` | `src/domain/patch-definitions/refusal-recovery.ts` | move | same |
| `scripts/build.mjs` | dropped | drop | A's `scripts/build.mjs:67-83` compiles the single CLI from `src/main/cli/cli.ts` |
| `scripts/coverage.mjs` | dropped | drop | A's `scripts/coverage.mjs`, plus completeness tests C1/C2. S's extra check (a src or patches file missing from the report) is covered by C1 |
| `scripts/install-cli.mjs` | dropped | drop | A's `scripts/install-cli.mjs` installs `opencode-session-manager` (`OPENCODE_SESSION_MANAGER_BIN_DIR`) |
| `scripts/lint-docs.mjs` | dropped | drop | A's `scripts/lint-diagrams.mjs` (L1–L7). Not kept: S's checks that README names every CLI command, and that `patches/…` and `systemd/…` paths exist |
| `scripts/watch.mjs` | `scripts/watch.mjs` | move+edit | no A file of that name. `NAME` becomes `opencode-session-manager-patches`; `OPENCODE_MC_PATCHES_SYSTEMD_DIR` becomes `OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR` (watch.mjs:8, :19); systemd only (see Gaps) |
| `systemd/opencode-magic-context-patches.path` | `systemd/opencode-session-manager-patches.path` | move+rename | `Unit=` names the renamed service |
| `systemd/opencode-magic-context-patches.service` | `systemd/opencode-session-manager-patches.service` | move+rename+edit | `ExecStart=%h/.local/bin/opencode-session-manager patches follow`; `Documentation=` points at A's README |
| `systemd/opencode-magic-context-patches.timer` | `systemd/opencode-session-manager-patches.timer` | move+rename | `Unit=` names the renamed service |
| `src/domain/errors/PatchError.ts` | `src/domain/errors/PatchError.ts` | move | errors are one class per file under `src/domain/errors` (A AGENTS.md:174-175). It extends the built-in `Error` (P6 allows), and `new PatchError` is allowed anywhere (P5 exempts `*Error`) |
| `src/domain/model/Installation.ts` | `src/domain/model/patches/Installation.ts` | move | domain model |
| `src/domain/model/Matcher.ts` | `src/domain/model/patches/Matcher.ts` | move | domain model |
| `src/domain/model/Patch.ts` | `src/domain/model/patches/Patch.ts` | move | domain model; the definitions import its `PatchDefinition` type |
| `src/domain/model/Reports.ts` | `src/domain/model/patches/Reports.ts` | move | domain model |
| `src/domain/model/Status.ts` | `src/domain/model/patches/Status.ts` | move | domain model |
| `src/domain/ports/inbound/CommandPorts.ts` | split into 10 files: `src/domain/ports/inbound/PatchStatusPort.ts`, `PatchApplyPort.ts`, `PatchUndoPort.ts`, `PatchCheckPort.ts`, `PatchInspectPort.ts`, `PatchEffectPort.ts`, `PatchNotifyPort.ts`, `PatchFollowPort.ts`, `PatchFollowRollbackPort.ts`, and `src/domain/model/patches/PatchCommands.ts` | split into 10 files | the file holds 9 `…Port` interfaces (CommandPorts.ts:12-48) plus `PatchCommands` (:50-61); I10 needs one port per file, named after the file. S's `RollbackPort` collides with A's `src/domain/ports/inbound/RollbackPort.ts`, so all nine take a `Patch` prefix. `PatchCommands` is not a port, so it moves to the model |
| `src/domain/ports/outbound/AuditLogPort.ts` | `src/domain/ports/outbound/AuditLogPort.ts` | move | one `…Port` interface (`AuditRecord` is not one); no A file of that name |
| `src/domain/ports/outbound/BackupPort.ts` | `src/domain/ports/outbound/BackupPort.ts` | move | same |
| `src/domain/ports/outbound/DerivedReleasesPort.ts` | `src/domain/ports/outbound/DerivedReleasesPort.ts` | move | same |
| `src/domain/ports/outbound/EvidencePort.ts` | `src/domain/ports/outbound/EvidencePort.ts` | move | same |
| `src/domain/ports/outbound/FilesPort.ts` | `src/domain/ports/outbound/FilesPort.ts` | move | kept, not merged: A's `FileSystemPort` (isDirectory, ensureDirectory, canonical) and `MaintenanceFileSystemPort` (synchronous exists, size, freeBytes, rename, mkdirp, remove, copyFile, removeTree) have no read-bytes, no mode-keeping one-step replace and no list-by-extension (S FilesPort.ts:1-9) |
| `src/domain/ports/outbound/HashPort.ts` | `src/domain/ports/outbound/HashPort.ts` | move | A has no hash port |
| `src/domain/ports/outbound/InstallationsPort.ts` | `src/domain/ports/outbound/InstallationsPort.ts` | move | differs from A's `MagicContextConfigPort.installed(spec)`, which returns one version string (A MagicContextConfigPort.ts:5-6); S needs every copy with its root |
| `src/domain/ports/outbound/ManagedStorePort.ts` | `src/domain/ports/outbound/ManagedStorePort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/PackageInstallerPort.ts` | `src/domain/ports/outbound/PackageInstallerPort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/RegistryPort.ts` | `src/domain/ports/outbound/RegistryPort.ts` | move | kept apart from A's `PublishedVersionPort`, whose `latest(): Promise<string \| null>` never throws (A PublishedVersionPort.ts:2-5). S needs `{version, integrity}`, `find(version)`, and a thrown reason (S NpmRegistryAdapter.ts:25-35) |
| `src/domain/ports/outbound/SandboxPort.ts` | `src/domain/ports/outbound/SandboxPort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/SystemPorts.ts` | split into 7 files: `src/domain/ports/outbound/ClockPort.ts`, `NotifierPort.ts`, `LogPort.ts`, `ServicePort.ts`, `KeyValuePort.ts`, `LivePluginsPort.ts` (with `LivePlugin`), `FollowLockPort.ts` | split into 7 files | the file holds 7 `…Port` interfaces (SystemPorts.ts:1-50), which fails I10. `LockPort` is renamed `FollowLockPort` so it cannot be confused with A's `StoreLockPort` |
| `src/domain/ports/outbound/TextSourcePort.ts` | `src/domain/ports/outbound/TextSourcePort.ts` | move | no A equivalent |
| `src/domain/ports/outbound/TranspilePort.ts` | `src/domain/ports/outbound/TranspilePort.ts` | move | no A equivalent |
| `src/domain/services/EffectReading.ts` | `src/domain/services/patches/EffectReading.ts` | move+edit | also receives `THRESHOLD_SETTING` from `src/application/EffectUseCase.ts:8`, because `EntrySwitcher.ts:9` imports that value across application files (P4) |
| `src/domain/services/Jsonc.ts` | merged into `src/domain/services/Jsonc.ts` | merge | `stripComments` is identical in both files apart from the variable name `i`/`index` (diff of S :5-36 against A :2-33). `PACKAGE_NAME` (S :38) equals `MAGIC_CONTEXT_PACKAGE` (A :35). Added to A: `StringLiteral`, `stringLiterals`, `isMagicContextEntry`, `magicContextEntries`, `pinnedSpec`, `replaceMagicContextEntry`, `magicContextEntry`, `numericSetting` (S :40-116) |
| `src/domain/services/MatcherRules.ts` | `src/domain/services/patches/MatcherRules.ts` | move | pure rules |
| `src/domain/services/PatchRules.ts` | `src/domain/services/patches/PatchRules.ts` | move | pure rules |
| `src/domain/services/Versions.ts` | merged into `src/domain/services/Versions.ts` | merge | one semver 2.0.0 §11 `compareVersions` (decision 6; see the compareVersions section) |
| `src/application/ApplyUseCase.ts` | `src/application/patches/ApplyUseCase.ts` | move+edit | `blocker` (:11-21) moves to `src/domain/services/patches/PatchRefusals.ts`, because `UndoUseCase.ts:1` imports it as a value (P4) |
| `src/application/ChangeWriter.ts` | `src/application/patches/ChangeWriter.ts` | move | application service; constructed only in the container |
| `src/application/CheckUseCase.ts` | `src/application/patches/CheckUseCase.ts` | move | implements `PatchCheckPort` (P3) |
| `src/application/EffectUseCase.ts` | `src/application/patches/EffectUseCase.ts` | move+edit | `THRESHOLD_SETTING` moves to the domain (see EffectReading) |
| `src/application/FollowUseCase.ts` | `src/application/patches/FollowUseCase.ts` | move+edit | :3 imports the value `loadsFrom` and :5 the class `StepLog` from application (P4), and :54 and :80 run `new StepLog` (P5). `loadsFrom` and `packageRoot` (:18) move to `src/domain/services/patches/FollowRules.ts`; StepLog becomes a domain factory |
| `src/application/InspectUseCase.ts` | `src/application/patches/InspectUseCase.ts` | move | implements `PatchInspectPort` |
| `src/application/InstallationCatalog.ts` | `src/application/patches/InstallationCatalog.ts` | move+edit | `Target` (:14) moves to `src/domain/model/patches/PatchTargets.ts`, because `blocker` (domain now) needs it |
| `src/application/NotifyUseCase.ts` | `src/application/patches/NotifyUseCase.ts` | move | its exported values are imported only by tests (aft grep: no application importer) |
| `src/application/PatchInspector.ts` | `src/application/patches/PatchInspector.ts` | move+edit | `FileOnDisk` (:10) moves to `src/domain/model/patches/PatchTargets.ts` |
| `src/application/ReleaseCatalog.ts` | `src/application/patches/ReleaseCatalog.ts` | move | application service |
| `src/application/RollbackUseCase.ts` | `src/application/patches/FollowRollbackUseCase.ts` | move+rename+edit | the class and file `RollbackUseCase` collide with A's `src/application/RollbackUseCase.ts`. :1 imports the value `PREVIOUS_ENTRY` and :3 `StepLog`, and :25 runs `new StepLog`; both are fixed as in FollowUseCase. It implements `PatchFollowRollbackPort` |
| `src/application/StatusUseCase.ts` | `src/application/patches/StatusUseCase.ts` | move | implements `PatchStatusPort` |
| `src/application/UndoUseCase.ts` | `src/application/patches/UndoUseCase.ts` | move+edit | `blocker` is imported from the domain |
| `src/application/follow/AdoptionRecorder.ts` | `src/application/patches/follow/AdoptionRecorder.ts` | move+edit | `PREVIOUS_ENTRY`, `LAST_FOLLOW_NOTIFICATION` and `FOLLOW_TITLE` (:11-13) move to `FollowRules.ts`; FollowRollbackUseCase imports `PREVIOUS_ENTRY` as a value |
| `src/application/follow/EntrySwitcher.ts` | `src/application/patches/follow/EntrySwitcher.ts` | move+edit | :2 imports the values `CONFIG_REJECTION` and `loadsFrom` from application, and :9 `THRESHOLD_SETTING` (P4); all come from the domain after the move. `loadsEntry` (:20) moves to `FollowRules.ts` for cohesion |
| `src/application/follow/PluginEntryEditor.ts` | `src/application/patches/follow/PluginEntryEditor.ts` | move | application service |
| `src/application/follow/ReleaseProver.ts` | `src/application/patches/follow/ReleaseProver.ts` | move+edit | `CONFIG_REJECTION` and `loadsFrom` (:6, :9) move to `FollowRules.ts` |
| `src/application/follow/ReleaseStager.ts` | `src/application/patches/follow/ReleaseStager.ts` | move | application service |
| `src/application/follow/StepLog.ts` | `src/domain/model/patches/StepLog.ts` | move+edit | rewritten from `class StepLog` into a factory function `stepLog(clock: ClockPort)` that returns the same methods. Use cases may not `new` a src class (P5), and the class is pure bookkeeping (StepLog.ts:5-38) |
| `src/infrastructure/adapters/inbound/cli/CliAdapter.ts` | `src/infrastructure/adapters/inbound/cli/PatchesCliAdapter.ts` | move+rename+edit | the group adapter behind `CliRouter`; keeps every flag, output and exit code (CliAdapter.ts:31-140). Its `HELP` is renamed `PATCHES_HELP` because A's `HelpCliAdapter.ts:3` already exports `HELP`. It keeps its own `CliOutput {out, err}` (:6-9), which the container wires to `ConsoleOutputAdapter` and a new `StderrOutputAdapter` |
| `src/infrastructure/adapters/inbound/cli/TextFormatter.ts` | `src/infrastructure/adapters/inbound/cli/PatchesTextFormatter.ts` | move+rename | an object literal, not a class (`export const TextFormatter`, :15); renamed so it is not mistaken for A's CLI formatting |
| `src/infrastructure/adapters/outbound/cache/CompositeInstallationsAdapter.ts` | `src/…/outbound/magic-context/CompositeInstallationsAdapter.ts` | move | A keeps its Magic Context adapters in `outbound/magic-context/`; no name collision |
| `src/infrastructure/adapters/outbound/cache/ManagedInstallationsAdapter.ts` | `src/…/outbound/magic-context/ManagedInstallationsAdapter.ts` | move | same |
| `src/infrastructure/adapters/outbound/cache/OpencodeCacheInstallationsAdapter.ts` | `src/…/outbound/magic-context/OpencodeCacheInstallationsAdapter.ts` | move | kept apart from A's `OpencodeMagicContextConfigAdapter.installed`: S lists every copy, installed directly or one numbered folder down, with its root (S adapter :29-40). A reads only the newest version under `…@<spec>/<stamp>/…` (A :27-39) |
| `src/infrastructure/adapters/outbound/crypto/Sha256Adapter.ts` | `src/…/outbound/crypto/Sha256Adapter.ts` | move | A has no hash adapter |
| `src/infrastructure/adapters/outbound/fs/FileKeyValueAdapter.ts` | `src/…/outbound/fs/FileKeyValueAdapter.ts` | move | A has no key-value store |
| `src/infrastructure/adapters/outbound/fs/FileLockAdapter.ts` | `src/…/outbound/fs/FsFollowLockAdapter.ts` | move+rename+edit | the liveness check on `/proc/<pid>` (:28) is Linux-only and leaves for a `ProcessLivenessPort` that the platform containers provide (T5, decision 4). Renamed beside A's `FsStoreLockAdapter`; implements `FollowLockPort` |
| `src/infrastructure/adapters/outbound/fs/FsBackupAdapter.ts` | `src/…/outbound/fs/FsBackupAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/FsEvidenceAdapter.ts` | `src/…/outbound/fs/FsEvidenceAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/FsManagedStoreAdapter.ts` | `src/…/outbound/fs/FsManagedStoreAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/JsonDerivedReleasesAdapter.ts` | `src/…/outbound/fs/JsonDerivedReleasesAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/JsonlAuditLogAdapter.ts` | `src/…/outbound/fs/JsonlAuditLogAdapter.ts` | move | no collision |
| `src/infrastructure/adapters/outbound/fs/NodeFilesAdapter.ts` | `src/…/outbound/fs/NodeFilesAdapter.ts` | move+edit | the staging name `.mc-patches-<pid>` (:21) is kept or renamed `.session-manager-patches-<pid>`: not decided (Gaps) |
| `src/infrastructure/adapters/outbound/fs/TextFileAdapter.ts` | `src/…/outbound/fs/TextFileAdapter.ts` | move | implements `TextSourcePort, LogPort` (P3 regex matches the first) |
| `src/infrastructure/adapters/outbound/notify/NotifySendAdapter.ts` | `src/…/outbound/platform/linux/NotifySendAdapter.ts` | move | `notify-send` is the Linux notifier (decision 4); wired only from `src/main/linux-container.ts` (C5) |
| `src/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter.ts` | `src/…/outbound/npm/ArboristInstallerAdapter.ts` | move | the only third-party runtime import (`@npmcli/arborist`), in infrastructure (I5 allows it there) |
| `src/infrastructure/adapters/outbound/npm/NpmRegistryAdapter.ts` | `src/…/outbound/npm/NpmPackumentAdapter.ts` | move+rename | collides with A's `src/infrastructure/adapters/outbound/npm/NpmRegistryAdapter.ts` (same path and class). They behave differently: A asks `/<pkg>/latest` with a time limit and returns null on failure (A :15-24); S reads the abbreviated packument, returns integrity, and throws a reason (S :13-35) |
| `src/infrastructure/adapters/outbound/opencode/OpencodeLivePluginsAdapter.ts` | `src/…/outbound/opencode2/OpencodeLivePluginsAdapter.ts` | move | A's OpenCode 2 server adapters live in `opencode2/`; it reads the same `service.json` as A's `HttpOpencodeServerAdapter`, but through other endpoints (GET `/api/debug/location`, `/api/plugin`) |
| `src/infrastructure/adapters/outbound/opencode/OpencodeSandboxAdapter.ts` | `src/…/outbound/opencode2/OpencodeSandboxAdapter.ts` | move | same folder reasoning |
| `src/infrastructure/adapters/outbound/parse/BunTranspileAdapter.ts` | `src/…/outbound/parse/BunTranspileAdapter.ts` | move | no A equivalent |
| `src/infrastructure/adapters/outbound/proc/ProcServiceAdapter.ts` | `src/…/outbound/platform/linux/ProcServiceAdapter.ts` | move | reads `/proc` (:22-36), so Linux only (T5, decision 4) |
| `src/infrastructure/adapters/outbound/system/SystemClockAdapter.ts` | merged into `src/…/outbound/system/SystemClockAdapter.ts` | merge | same path and class as A's. A's `now()` (A :16-18) equals S's (S :6-8); A gains `sleep(ms)` (S :10-12) and declares `implements RuntimePort, ClockPort` |
| `src/main/bin.ts` | merged into `src/main/cli/cli.ts` | merge | the entry exits at once with the code, because Arborist keeps idle registry connections for about two minutes (bin.ts:3-5). A's entry sets `process.exitCode` (cli.ts:15) and must call `process.exit` instead |
| `src/main/cli.ts` | split into 2: `src/…/outbound/platform/linux/ClockTicks.ts` (`clockTicks`, :9-13), and `main`/`processOutput` (:16-25) merged into `src/main/cli-container.ts` | split into 2 files | `getconf CLK_TCK` is Linux-only (decision 4). `main` duplicated A's entry; `processOutput` is replaced by `ConsoleOutputAdapter` plus the new `StderrOutputAdapter` |
| `src/main/container.ts` | `src/main/patches-container.ts` | move+rename+edit | P5 allows `new` only in `main/<word>-container.ts`, so the wiring needs that name; I9's list must then add it. `createCommands(paths, patches, clockTicks, seams)` takes the platform's patch adapters instead of `clockTicksPerSecond` and `paths.proc` (:84, :104); `NotifySendAdapter` (:70) comes from the platform; `new SystemClockAdapter()` (:66) is A's adapter |
| `src/main/paths.ts` | `src/main/cli/patches-paths.ts` | move+rename+edit | env `OPENCODE_MC_PATCHES_*` becomes `OPENCODE_SESSION_MANAGER_PATCHES_*` (:59, :69-70, :75, :77, :80); `NAME` folders become `<data>/opencode-session-manager/patches` and `<state>/opencode-session-manager/patches` (:40, :54, :66, :71-74); `Environment` (:38) is replaced by A's `CliEnvironment` (name collision with A's `src/domain/model/Database.ts:70`) |
| `tests/component/adapters-with-use-cases.test.ts` | `tests/component/patches/adapters-with-use-cases.test.ts` | move | A groups tests by area (`tests/component/maintenance/`) |
| `tests/component/follow-with-real-adapters.test.ts` | `tests/component/patches/follow-with-real-adapters.test.ts` | move | same |
| `tests/e2e/effect.test.ts` | `tests/e2e/patches/effect.test.ts` | move+edit | its fake `/proc` via `OPENCODE_MC_PATCHES_PROC` (:30, :49, :51, :60, :72) exercises the Linux adapter only; per-platform split (Gaps) |
| `tests/e2e/faults.test.ts` | `tests/e2e/patches/faults.test.ts` | move+edit | env rename (:134); `rmSync(box.installations, { recursive: true })` (:138) must use `removeTemporarySync` (T6); `main(…)` calls become the `buildContainer(…).run(["patches", …])` path |
| `tests/e2e/follow.test.ts` | `tests/e2e/patches/follow.test.ts` | move+edit | env renames (:84-88, :243-252, :303, :312, :328) |
| `tests/e2e/lifecycle.test.ts` | `tests/e2e/patches/lifecycle.test.ts` | move+edit | env rename (:195) |
| `tests/live/live.test.ts` | `tests/live/patches/live.test.ts` | move+edit | `BIN` becomes `opencode-session-manager` under `OPENCODE_SESSION_MANAGER_BIN_DIR`, with `patches` as the first argument (:18); env renames (:83-84); `rmSync(…, { recursive: true, force: true })` (:65, :103, :133) must use `removeTemporarySync` (T6); the systemd checks are Linux-only |
| `tests/support/fake-opencode.ts` | `tests/support/patches/fake-opencode.ts` | move | L7: AGENTS.md must name it |
| `tests/support/fakes.ts` | `tests/support/patches/fakes.ts` | move+edit | split ports change its imports (`ClockPort` and the other ports of `SystemPorts.ts`) |
| `tests/support/follow-fakes.ts` | `tests/support/patches/follow-fakes.ts` | move+edit | same |
| `tests/support/registry.ts` | `tests/support/patches/registry.ts` | move | — |
| `tests/support/sandbox.ts` | `tests/support/patches/sandbox.ts` | move+edit | `rmSync(directory, { recursive: true, force: true })` (:17) must use `removeTemporarySync` (T6); `FIXTURES` (:5) becomes `tests/support/patches/fixtures`; the `/proc` stand-in becomes per platform |
| `tests/support/source-files.ts` | dropped | drop | A's `tests/support/source-files.ts` (C3). S's was used only by S's architecture test (aft grep) |
| `tests/support/world.ts` | `tests/support/patches/world.ts` | move+edit | wires the renamed use cases |
| `tests/unit/application/ApplyUndo.test.ts` | `tests/unit/patches/application/ApplyUndo.test.ts` | move | A groups unit tests by area (`tests/unit/maintenance/application/`) |
| `tests/unit/application/Follow.test.ts` | `tests/unit/patches/application/Follow.test.ts` | move | — |
| `tests/unit/application/InspectEffectNotify.test.ts` | `tests/unit/patches/application/InspectEffectNotify.test.ts` | move | — |
| `tests/unit/application/Inspector.test.ts` | `tests/unit/patches/application/Inspector.test.ts` | move | — |
| `tests/unit/application/InstallationCatalog.test.ts` | `tests/unit/patches/application/InstallationCatalog.test.ts` | move | — |
| `tests/unit/application/StatusAndCheck.test.ts` | `tests/unit/patches/application/StatusAndCheck.test.ts` | move | — |
| `tests/unit/architecture/architecture.test.ts` | dropped | drop | its checks are covered by A: layers and aliases (I2–I5), constructors (P2), `implements` (P3), construction only in main (P5), completeness (C1). Its declared-dependency check (:15-17, :35-38) is **not** carried over: it would contradict A's convention of bundling devDependencies (`drizzle-orm`, `@opentui/*`) |
| `tests/unit/domain/EffectReading.test.ts` | `tests/unit/patches/domain/EffectReading.test.ts` | move | — |
| `tests/unit/domain/Jsonc.test.ts` | `tests/unit/patches/domain/Jsonc.test.ts` | move+edit | it tests the merged `src/domain/services/Jsonc.ts`; the duplicate `stripComments` cases sit beside A's `tests/unit/sessions/magic-context-versions.test.ts` |
| `tests/unit/domain/MatcherRules.test.ts` | `tests/unit/patches/domain/MatcherRules.test.ts` | move+edit | `FIXTURES` (:11) points at `tests/support/patches/fixtures` |
| `tests/unit/domain/PatchRules.test.ts` | `tests/unit/patches/domain/PatchRules.test.ts` | move | — |
| `tests/unit/domain/Versions.test.ts` | `tests/unit/domain/versions.test.ts` | move+rename+edit | one test file for the single `compareVersions`. :8 flips (see compareVersions); A's assertions from `tests/unit/sessions/magic-context-release.test.ts:99-103` move here |
| `tests/unit/infrastructure/CliAdapter.test.ts` | `tests/unit/patches/infrastructure/PatchesCliAdapter.test.ts` | move+rename | follows the adapter rename |
| `tests/unit/infrastructure/follow-adapters.test.ts` | `tests/unit/patches/infrastructure/follow-adapters.test.ts` | move+edit | fixture path (:164); the `FileLockAdapter` block (:99-117) is rewritten for `FsFollowLockAdapter` and a liveness stand-in; the SystemClockAdapter `sleeps` case (:124) tests A's merged adapter; `NpmRegistryAdapter` (:132-150) becomes `NpmPackumentAdapter` |
| `tests/unit/infrastructure/fs-adapters.test.ts` | `tests/unit/patches/infrastructure/fs-adapters.test.ts` | move+edit | the `SystemClockAdapter` half of the case at :55-61 tests A's merged adapter |
| `tests/unit/infrastructure/system-adapters.test.ts` | split into 2: `tests/unit/patches/infrastructure/installations-adapters.test.ts` (:18-40) and `tests/unit/patches/infrastructure/platform-linux.test.ts` (`ProcServiceAdapter` :42-72, `NotifySendAdapter` :74-82) | split into 2 files | the Linux adapters move to `platform/linux/` |
| `tests/unit/main/main.test.ts` | `tests/unit/patches/main/patches-container.test.ts` | move+rename+edit | `resolvePaths` cases (:16-64) follow the env and folder renames; the clock-ticks case (:90-92) moves to `platform-linux.test.ts`; the `bin` case (:102-121) is replaced by A's entry test |
| `tests/unit/patches/patches.test.ts` | `tests/unit/patches/definitions/patches.test.ts` | move+edit | `fixture()` (:9) points at `tests/support/patches/fixtures/magic-context-<v>/`; `evidence` paths are unchanged because the reference docs keep their names |
| `tests/fixtures/magic-context-0.47.0/` (4 files) | `tests/support/patches/fixtures/magic-context-0.47.0/` | move | A has no `tests/fixtures/` (`ls`: No such file or directory). A keeps fixtures under `tests/support/…/fixtures/` (A AGENTS.md:561-562, :574). L7: AGENTS names `patches/fixtures/` as a folder. L6: the fixture `.js` files hold 12 env names (see "A files edited", lint-diagrams) |
| `tests/fixtures/magic-context-0.48.0/` (4 files) | `tests/support/patches/fixtures/magic-context-0.48.0/` | move | same |
| `tests/fixtures/magic-context-0.49.0/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.0/` | move | same |
| `tests/fixtures/magic-context-0.49.2/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.2/` | move | same |
| `tests/fixtures/magic-context-0.49.7/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.7/` | move | same |
| `tests/fixtures/magic-context-0.49.12/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.12/` | move | same |
| `tests/fixtures/magic-context-0.49.13/` (4 files) | `tests/support/patches/fixtures/magic-context-0.49.13/` | move | same |
| `tests/fixtures/magic-context-0.49.15/` (6 files) | `tests/support/patches/fixtures/magic-context-0.49.15/` | move | same |
| `tests/fixtures/magic-context-0.49.19/` (6 files) | `tests/support/patches/fixtures/magic-context-0.49.19/` | move | same |
| `tests/fixtures/magic-context-0.49.35/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.35/` | move | same |
| `tests/fixtures/magic-context-0.49.41/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.41/` | move | same |
| `tests/fixtures/magic-context-0.49.42/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.42/` | move | same |
| `tests/fixtures/magic-context-0.49.43/` (9 files) | `tests/support/patches/fixtures/magic-context-0.49.43/` | move | same |
| `tests/fixtures/magic-context-0.49.50/` (11 files) | `tests/support/patches/fixtures/magic-context-0.49.50/` | move | same |
| `tests/fixtures/magic-context-0.49.55/` (11 files) | `tests/support/patches/fixtures/magic-context-0.49.55/` | move | same |
| `tests/fixtures/magic-context-0.49.56/` (11 files) | `tests/support/patches/fixtures/magic-context-0.49.56/` | move | same |

Fixture totals: 109 files (77 `.js`, 16 `package.json`, 16 `NOTICE.md`; `git ls-files tests/fixtures`).
No `NOTICE.md` names a repo path that L3 would check (grep of all 16 for the L3 pattern: no match).

### New files

These files exist in neither repository today. Files produced by a split, or extracted from an S file,
are marked with their origin. `src/…/outbound/` stands for `src/infrastructure/adapters/outbound/`.

| Path | Responsibility |
|---|---|
| `src/domain/ports/outbound/ProcessLivenessPort.ts` | `isAlive(pid: number): Promise<boolean>`, so `FsFollowLockAdapter` can tell a live owner from a stale one without OS code (replaces S `FileLockAdapter.ts:28`). |
| `src/domain/model/patches/PatchTargets.ts` | extracted: `Target` (from S `InstallationCatalog.ts:14`) and `FileOnDisk` (from S `PatchInspector.ts:10`), so `blocker` can live in the domain. |
| `src/domain/services/patches/PatchRefusals.ts` | extracted: `blocker`, the refusals apply and undo share (from S `ApplyUseCase.ts:11-21`). |
| `src/domain/services/patches/FollowRules.ts` | extracted values that application files imported from one another: `loadsFrom`, `CONFIG_REJECTION` (S `ReleaseProver.ts:6-9`), `loadsEntry` (S `EntrySwitcher.ts:20`), `packageRoot` (S `FollowUseCase.ts:18`), `PREVIOUS_ENTRY`, `LAST_FOLLOW_NOTIFICATION`, `FOLLOW_TITLE` (S `AdoptionRecorder.ts:11-13`). |
| `src/…/outbound/platform/linux/ClockTicks.ts` | from S `src/main/cli.ts:9-13`: `getconf CLK_TCK`, 100 when it cannot be asked; called by `linux-container.ts`. A function, no class (pattern of A `platform/linux/ProcFs.ts`). |
| `src/…/outbound/platform/linux/ProcLivenessAdapter.ts` | `ProcessLivenessPort` on Linux: `<procRoot>/<pid>` exists (S `FileLockAdapter.ts:28`); takes the proc root as a constructor argument (T5). |
| `src/…/outbound/platform/darwin/PsServiceAdapter.ts` | `ServicePort` on macOS: the newest `opencode … serve` start time from `ps -axo pid=,lstart=,command=` (decision 4); takes the `ps` executable as a constructor argument. |
| `src/…/outbound/platform/darwin/KillZeroLivenessAdapter.ts` | `ProcessLivenessPort` on macOS: `process.kill(pid, 0)`, with `ESRCH` meaning gone (decision 4; same probe as A `FsStoreLockAdapter.ts:11`). |
| `src/…/outbound/platform/darwin/OsascriptNotifierAdapter.ts` | `NotifierPort` on macOS: `osascript -e 'display notification … with title …'` (decision 4); takes the executable as a constructor argument. |
| `src/…/outbound/platform/win32/CimServiceAdapter.ts` | `ServicePort` on Windows: PowerShell `Get-CimInstance Win32_Process` filtered to `opencode(.exe)` with `serve` in `CommandLine`, newest `CreationDate` (decision 4); takes the PowerShell executable as a constructor argument. |
| `src/…/outbound/platform/win32/GetProcessLivenessAdapter.ts` | `ProcessLivenessPort` on Windows: PowerShell `Get-Process -Id <pid>` succeeds (decision 4). |
| `src/…/outbound/platform/win32/PowerShellToastNotifierAdapter.ts` | `NotifierPort` on Windows: a PowerShell toast notification (decision 4). |
| `src/main/darwin-container.ts` | the macOS half: exports `darwinPatchesAdapters` (service, liveness, notifier); loaded only by `main/cli/platform.ts` through `await import` (C6). |
| `src/…/outbound/system/StderrOutputAdapter.ts` | `OutputPort` writing to `process.stderr`. `PatchesCliAdapter` writes usage and refusals to stderr (S `CliAdapter.ts:81-82`); A's `OutputPort` is stdout only (A `ConsoleOutputAdapter.ts:12-14`). This adds no method to `OutputPort`, so no existing implementer changes. |
| `bunfig.coverage.e2e-darwin.toml` | the e2e coverage gate on darwin: ignores `platform/linux/**`, `platform/win32/**`, `src/main/linux-container.ts` and `src/main/win32-container.ts` (C10, C11). `scripts/coverage.mjs:20-23` exits 1 on darwin today because this file is missing. |
| `tests/unit/patches/infrastructure/platform-darwin.test.ts` | unit tests of the three darwin adapters with stand-in executables (they take the executable as an argument, so the tests run on any OS: A AGENTS.md:206-207). |
| `tests/unit/patches/infrastructure/platform-win32.test.ts` | the same for the three win32 adapters. |
| `tests/unit/patches/infrastructure/liveness.test.ts` | `ProcLivenessAdapter`, and `FsFollowLockAdapter` with a liveness stand-in. |
| `tests/e2e/patches/platform-<os>.test.ts` (`linux`, `darwin`, `win32`) | e2e of `patches effect`, `patches notify` and the follow lock through the real platform adapters on their own OS (C2 measures each platform's files only on that platform). Exact split: see Gaps. |
| `tests/live/patches/platform.test.ts` | live check, on the running OS, that the service start time, liveness and notification adapters work against the real system. |
| `tests/e2e/patches/prerelease-versions.test.ts` | compareVersions §11 pairs through `follow` (prerelease ordering incl. the §11 example chain, build metadata ignored, `MagicContextVersionsUseCase` + `FollowUseCase` effects); the 'New cases needed' content of the compareVersions section (Revision 7). |

Help text needs no new file: `PATCHES_HELP` lives in `PatchesCliAdapter.ts`, and one line is added to A's
`HELP` (see below).

### A files edited

| A file | Change | Anchor |
|---|---|---|
| `src/main/cli-container.ts` | import `createPatchCommands` from `@session-manager/main/patches-container`, `PatchesCliAdapter`, `StderrOutputAdapter`, `PATCHES` and `resolvePatchPaths`. Add `patches?: Seams` (S `container.ts:51-54`) to `ContainerOverrides`. Build the group and register `patches: patchesCli` in the router families. The service path computed at :227 is passed on (S `paths.ts:78` uses the same formula). | imports :1-92; `ContainerOverrides` :110-136; `buildContainer` :143-337; router :336 |
| `src/main/cli-container.ts` | **darwin:** `platformAdapters(...)` at :146 runs eagerly and throws `UnsupportedPlatformError` on darwin, so on macOS no command — `patches` included — gets past it. The maintenance half must become lazy, or darwin must get maintenance adapters (Gaps #1). | :146-148, :170 |
| `src/main/cli/platform.ts` | add `PatchesPlatformAdapters { service: ServicePort; liveness: ProcessLivenessPort; notifier: NotifierPort }`, `PatchesPlatformFactory`, a `darwin` loader, and `patchesPlatformAdapters(platform, settings)`. Separate the maintenance platforms (`linux`, `win32`) from the platforms that have adapter folders (`linux`, `win32`, `darwin`). | :7-14, :22-27, :29-33 |
| `src/main/linux-container.ts` | export `linuxPatchesAdapters` (`ProcServiceAdapter(proc, clockTicks())`, `ProcLivenessAdapter(proc)`, `NotifySendAdapter(notifyCommand)`). | :1-10 |
| `src/main/win32-container.ts` | export `win32PatchesAdapters` (`CimServiceAdapter`, `GetProcessLivenessAdapter`, `PowerShellToastNotifierAdapter`). | :1-10 |
| `src/main/cli/cli.ts` | `process.exitCode = …` becomes `process.exit(await bootstrap(…))`, because Arborist's idle connections hold the process for about two minutes (S `bin.ts:3-5`). | :15 |
| `src/infrastructure/adapters/inbound/cli/HelpCliAdapter.ts` | add a `patches <status\|apply\|undo\|check\|inspect\|effect\|notify\|follow> [--json] …` line to `HELP`. `tests/unit/maintenance/main/help.test.ts:13,16` compares against `[...HELP]`, so it follows automatically. | :3-29 |
| `src/infrastructure/adapters/inbound/cli/CliRouter.ts` | no change: families are a record (:11-19). | — |
| `src/infrastructure/adapters/outbound/system/SystemClockAdapter.ts` | `implements RuntimePort, ClockPort`; add `sleep(ms)`. | :5, after :18 |
| `src/domain/services/Versions.ts` | semver 2.0.0 §11 implementation; doc comment changed. | :1-11 |
| `src/domain/services/Jsonc.ts` | add S's string-literal and entry functions plus `numericSetting` (S `Jsonc.ts:40-116`). Keep `stripComments` (:2-33) and `MAGIC_CONTEXT_PACKAGE` (:35). Whether `pinnedMagicContext` (:41-45) is re-based on `pinnedSpec` is Gaps #12. | :1-45 |
| `package.json` | description (:4) names the patches group. Scripts (:7-26): add `install:watch`, `uninstall:watch`, `validate:watch` (S package.json:23-25). Add `@npmcli/arborist` `9.4.0` and `@types/npmcli__arborist` `6.3.3` (see Dependencies). | :4, :7-26, :27-38 |
| `bun.lock` | regenerated by `bun install` after the package.json change. | whole file |
| `tsconfig.json` | no change needed: the patches move under `src` (covered by :23), and `@package-json` already resolves (:10). S's `resolveJsonModule` is not needed, because A imports JSON with `with { type: "json" }` (A cli-container.ts:41). | — |
| `bunfig.coverage.e2e-linux.toml` | add `src/infrastructure/adapters/outbound/platform/darwin/**` and `src/main/darwin-container.ts` to `coveragePathIgnorePatterns`; comment lines 2-3. | :2-3, :16 |
| `bunfig.coverage.e2e-win32.toml` | the same darwin entries. | :2-3, :16 |
| `bunfig.coverage.toml`, `bunfig.toml`, `scripts/coverage.mjs` | no change (`coverage.mjs:13` already picks `e2e-darwin` by platform). | — |
| `scripts/lint-diagrams.mjs` | L6 would read env names out of the fixture `.js` files: `MAGIC_CONTEXT_DEBUG_HEAP_SNAPSHOT_MAX_RSS_MB`, `MAGIC_CONTEXT_DEBUG_RPC`, `MAGIC_CONTEXT_MARKER`, `OPENCODE_CHANNEL`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_DISABLE_AUTOCOMPACT`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_MODELS_PATH` — none named in A README/AGENTS today (`grep -c` = 0) — plus `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, which are named. Either skip `tests/support/patches/fixtures/` in the scan (:70-71) or name the 9 (Gaps #15). | :65-74 |
| `scripts/build.mjs` | comment only: the CLI now also holds the patches group and bundles Arborist (:64-66). Bundling under the Solid transform plugin is unverified (Gaps #10). | :64-66 |
| `.gitignore` | no change. | — |
| `AGENTS.md` | §1 table: CLI row :18 gains the `patches` group; :19 platforms (darwin for `patches`); :20 runtime dependencies. :23-26: the merged predecessor list gains `opencode-magic-context-patches`. New subsection under §3 with S safety rules 1–7 and the env and folder renames. §4 source map (:305-498): every new and moved src file, the `patch-definitions/` folder, the darwin platform adapters, `darwin-container.ts` and `patches-container.ts` (L7). Platform law (:198-208) adds darwin. Test support table (:552-584) adds `patches/fake-opencode.ts`, `patches/fakes.ts`, `patches/follow-fakes.ts`, `patches/registry.ts`, `patches/sandbox.ts`, `patches/world.ts` and the `patches/fixtures/` folder (L7). Coverage law (:586-596) adds darwin. §8 deployment (:616-630) adds `bun run install:watch`, `bun run uninstall:watch`, `bun run validate:watch` (L5). S's "Adding a version" procedure is rewritten for `opencode-session-manager patches inspect`. Every new env name is listed (L6). | :18-20, :23-26, :168-208, :305-498, :552-596, :616-630, :659-660 |
| `README.md` | the program section (:211-260) gains `patches …` commands. The env table (:849-877) gains `OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN`, `…_PROC`, `…_REGISTRY`, `…_OPENCODE_BIN`, `…_TIMEOUT_MS`, `…_SETTLE_MS`, `…_SYSTEMD_DIR` and `MAGIC_CONTEXT_LOG_PATH` (L6). Architecture (:673) and Build and test (:793) are updated. S README's user content is merged here. | :211-260, :673, :793, :849-877 |
| `tests/unit/architecture/imports.test.ts` | the expected `main/*-container.ts` list (:101-107) adds `main/darwin-container.ts` and `main/patches-container.ts`. | :99-107 |
| `tests/unit/maintenance/architecture.test.ts` | :11-16 compares the platform folders and containers with `PLATFORMS` (now `linux`, `win32`, `darwin`), not with the maintenance `SUPPORTED_PLATFORMS`; :33 matches darwin too. | :3, :11-16, :29-39 |
| `tests/support/source-files.ts` | `PLATFORMS` adds `"darwin"` (:21), so `platformOf` and `loadEverySource` treat darwin files as a platform's (C2, C3). | :20-21 |
| `tests/unit/maintenance/infrastructure/platform.test.ts` | :157 `SUPPORTED_PLATFORMS` deep-equal and :159-163 darwin refusal; these change with Gaps #1. Add the `patchesPlatformAdapters` cases for the three platforms. | :145-163 |
| `tests/e2e/maintenance/failures.test.ts` | :183-187 expects `buildContainer` to reject darwin with `unsupported platform: darwin (supported: linux, win32)`; this changes with Gaps #1. :189-199 loops `SUPPORTED_PLATFORMS`. | :183-199 |
| `tests/unit/sessions/magic-context-release.test.ts` | the `compareVersions` assertions (:99-103) move to `tests/unit/domain/versions.test.ts`; :101 flips (see next section); drop the import at :6 if nothing else uses it. | :6, :99-103 |
| `tests/unit/sessions/magic-context-versions.test.ts` | only if `pinnedMagicContext` changes (Gaps #12). | — |
| `tests/unit/maintenance/infrastructure/adapters.test.ts` | covers `SystemClockAdapter.sleep` (it constructs the adapter at :76). | :76 |

### Collisions

| # | Collision | Evidence | Resolution |
|---|---|---|---|
| 1 | inbound port `RollbackPort` | A `src/domain/ports/inbound/RollbackPort.ts`; S `CommandPorts.ts:45-48` | S's becomes `PatchFollowRollbackPort`; the other eight inbound ports take the `Patch` prefix too |
| 2 | class and file `RollbackUseCase` | A `src/application/RollbackUseCase.ts`; S `src/application/RollbackUseCase.ts:14` | S's becomes `src/application/patches/FollowRollbackUseCase.ts` |
| 3 | class and path `SystemClockAdapter` | same path in both repos | merge: A's gains `sleep` and `ClockPort` |
| 4 | class and path `NpmRegistryAdapter` | same path in both repos; behaviour differs (A :15-24 null and time limit; S :13-35 packument, integrity, throws) | S's renamed `NpmPackumentAdapter` |
| 5 | `src/domain/services/Jsonc.ts` | both repos; `stripComments` identical apart from the variable name (diff) | merge into A's; `PACKAGE_NAME` replaced by `MAGIC_CONTEXT_PACKAGE` |
| 6 | `src/domain/services/Versions.ts` / `compareVersions` | the behaviours differ (next section) | one semver implementation (decision 6) |
| 7 | entry `cli.ts` | A `src/main/cli/cli.ts`; S `src/main/cli.ts` | S's split (File map) |
| 8 | exported `HELP` | A `HelpCliAdapter.ts:3`; S `CliAdapter.ts:11` | S's renamed `PATCHES_HELP` |
| 9 | exported `Environment` | A `src/domain/model/Database.ts:70` (interface); S `src/main/paths.ts:38` (type) | S's dropped; patches paths take A's `CliEnvironment` |
| 10 | `architecture.test.ts` basename | A `tests/unit/maintenance/architecture.test.ts`; S `tests/unit/architecture/architecture.test.ts` | S's dropped |
| 11 | `tests/support/source-files.ts` | both repos | S's dropped |
| 12 | `tests/fixtures/` | A has none (`ls`: No such file or directory) | no collision; target `tests/support/patches/fixtures/` follows A's convention |
| 13 | `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` | both repos; `cmp` differs at char 55 | S's frozen as `docs/reference/<merge-stamp>-magic-context-patches-session-ses_ee74ff8d6ffeI7u74RZBGprjCd.md` |
| 14 | `docs/sessions/ses_e1dc7d932ffe69P47CJLyPq6qR.md` | S's file; the same name is the merge session's own record in A | S's frozen under `docs/reference/` |
| 15 | other doc names | `ls docs/*/<basename>` in A for all 26 S docs: only #13 matched | none |
| 16 | `LICENSE` | `cmp` identical | S's dropped |
| 17 | package.json script names `build`, `test`, `test:unit`, `test:component`, `test:e2e`, `test:live`, `coverage`, `coverage:unit`, `coverage:e2e`, `typecheck`, `install:cli`, `validate:installed:cli`, `cli` | S package.json:9-26; A :8-25 | A's definitions kept; S `check` and `lint:docs` dropped |
| 18 | concept: lock | A `StoreLockPort`/`FsStoreLockAdapter` (synchronous, several stores, owner pid+command+start, throws `StoreLockedError`; StoreLockPort.ts:15-17) vs S `LockPort` (asynchronous, one file, returns `null` when held; SystemPorts.ts:46-50) | keep S's as `FollowLockPort`/`FsFollowLockAdapter`: FollowUseCase reports a held lock as an outcome, not an error |
| 19 | concept: running server | A `OpencodeServerPort`/`HttpOpencodeServerAdapter` (POST command/fork; synchronous read of `service.json`) vs S `LivePluginsPort`/`OpencodeLivePluginsAdapter` (GET `/api/debug/location`, `/api/plugin`; asynchronous) | keep S's (different endpoints and contract); reuse A's `service.json` path computation (A cli-container.ts:227 = S paths.ts:78) |
| 20 | concept: installed Magic Context | A `MagicContextConfigPort.installed(spec)` → newest version under `…@<spec>/<stamp>/…` (A OpencodeMagicContextConfigAdapter.ts:27-39); A `InstalledMagicContextAdapter` (newest release, also `packages/…@<version>/`); S `InstallationsPort` → every copy with `spec`, `root`, `version`, direct or one numbered folder down | keep S's adapters (different output) |
| 21 | concept: pinned spec | A `pinnedMagicContext` (regex; folder entries return null because the regex needs `"` right before `@cortexkit`, A Jsonc.ts:42); A reads `opencode.jsonc` else `opencode.json` (A config adapter :23). S `pinnedSpec` (folder entries return the folder; S Jsonc.ts:84-94); S reads only `opencode.jsonc` (S paths.ts:62) | extend A's `Jsonc.ts` with S's functions; the behaviour alignment is Gaps #12 and #13 |
| 22 | concept: npm registry | A `PublishedVersionPort` vs S `RegistryPort` | keep S's (#4) |
| 23 | concept: clock | A `RuntimePort.now` + `TimerPort.sleep` (SystemTimerAdapter) vs S `ClockPort {now, sleep}` | extend A's `SystemClockAdapter` to implement `ClockPort` too (equal `now`; `sleep` equal to A `SystemTimerAdapter.ts:6-8`) |
| 24 | concept: files | A `FileSystemPort`, `MaintenanceFileSystemPort` vs S `FilesPort` | keep S's (no read-bytes, no mode-keeping replace in A) |
| 25 | concept: hash | A has no port (sha256 inline in sqlite and identity adapters) | keep S's `HashPort`/`Sha256Adapter` |
| 26 | concept: key-value | A none | keep S's `FileKeyValueAdapter` |
| 27 | concept: stdout/stderr | A `OutputPort.line` → stdout; S `CliOutput {out, err}` | keep `CliOutput` inside `PatchesCliAdapter`; new `StderrOutputAdapter` |
| 28 | concept: processes | A `ProcessListPort` (`/proc/<pid>/comm` names) vs S `ServicePort` (cmdline holding `serve`, plus start time) | keep separate; S's becomes per platform |
| 29 | env names | A uses `OPENCODE_SESSION_MANAGER_*` and `OPENCODE_SM_LIVE_*` (README:849-877) | the new `OPENCODE_SESSION_MANAGER_PATCHES_*` collide with nothing; `OPENCODE_MC_PATCHES_BIN_DIR` is dropped in favour of `OPENCODE_SESSION_MANAGER_BIN_DIR` |
| 30 | installed program and data | this machine (darwin) has `~/.local/bin/opencode-magic-context-patches`, `~/.local/share/opencode-magic-context-patches`, `~/.local/state/opencode-magic-context-patches` (`ls`, `which`) | the rename (decision 5) leaves them behind: Gaps #2 |
| 31 | exported value and type names | `comm` of exported names in both `src` trees: `compareVersions`, `Environment`, `HELP`, `NpmRegistryAdapter`, `RollbackPort`, `RollbackUseCase`, `stripComments`, `SystemClockAdapter` | each resolved above (#1–#9) |
| 32 | src basenames | `comm` of basenames: `cli.ts`, `Jsonc.ts`, `NpmRegistryAdapter.ts`, `RollbackUseCase.ts`, `SystemClockAdapter.ts`, `Versions.ts` | each resolved above |

### compareVersions

#### Definitions

| Repo | Location | Behaviour |
|---|---|---|
| A | `src/domain/services/Versions.ts:2-11` | splits on `-` and drops everything after it (`value.split("-")[0]`), then compares the dot parts numerically; `parseInt(…) \|\| 0`. So `1.0.0-beta.1 == 1.0.0`. |
| S | `src/domain/services/Versions.ts:1-9` | splits on `.` **and** `-` and compares every part numerically, with `parseInt(…) \|\| 0`. So `1.0.0-beta.2 > 1.0.0`, because the parts are `[1,0,0,0,2]` against `[1,0,0]`. |

The replacement is semver 2.0.0 §11 ([semver.org §11](https://semver.org/spec/v2.0.0.html#spec-item-11)):

- major, minor and patch compare numerically;
- a version with a pre-release sorts below the same version without one;
- pre-release identifiers compare left to right: numeric ones numerically, alphanumeric ones in ASCII
  order, and a numeric identifier sorts below an alphanumeric one;
- a longer set of identifiers wins when all the earlier ones are equal;
- build metadata after `+` is ignored.

Inputs that are not semver are kept as both repos treat them today: a missing core part counts as 0
(`1.0` = `1.0.0`), and a non-numeric core part counts as 0 (`1.x` = `1.0`). This last behaviour is
unverified against intent (Gaps #17).

#### Callers

| Repo | Caller | Use | Effect of semver order |
|---|---|---|---|
| A | `src/application/MagicContextVersionsUseCase.ts:34` | `compareVersions(latest, loaded) > 0`: is an upgrade available | with `loaded = 1.0.0-beta.1` and `latest = 1.0.0`, an upgrade is now shown (before: equal, so none) |
| A | `src/infrastructure/adapters/outbound/magic-context/InstalledMagicContextAdapter.ts:66` | sorts candidates, newest first | a release now outranks its own pre-release |
| A | `src/infrastructure/adapters/outbound/magic-context/OpencodeMagicContextConfigAdapter.ts:38` | `versions.sort(compareVersions).at(-1)` | same |
| S | `src/application/FollowUseCase.ts:133` | `compareVersions(published.version, loaded.version) <= 0`: already up to date | a loaded `1.0.0-beta.2` is now older than a published `1.0.0` (before: newer, so `follow` would stop "up-to-date") |
| S | `src/application/InspectUseCase.ts:52` | newest reviewed release, used as the reference | a release now outranks its pre-release |

#### Test assertions

| Repo | Assertion | Today | After |
|---|---|---|---|
| A | `tests/unit/sessions/magic-context-release.test.ts:99` `compareVersions("0.45.0","0.9.9") > 0` | passes | unchanged |
| A | `tests/unit/sessions/magic-context-release.test.ts:100` `("1.0","1.0.0") toBe(0)` | passes | unchanged (missing part = 0) |
| A | `tests/unit/sessions/magic-context-release.test.ts:101` `("1.0.0-beta.1","1.0.0") toBe(0)` | passes | **changes** to `toBeLessThan(0)` |
| A | `tests/unit/sessions/magic-context-release.test.ts:102` `("1.x","1.0") toBe(0)` | passes | unchanged if non-numeric core = 0 (Gaps #17) |
| A | `tests/unit/sessions/magic-context-release.test.ts:103` `("0.1","0.2") < 0` | passes | unchanged |
| S | `tests/unit/domain/Versions.test.ts:6` sort `["0.9.0","0.47.0","0.47.1","0.100.0"]` | passes | unchanged |
| S | `tests/unit/domain/Versions.test.ts:7` `("1.0","1.0.0") toBe(0)` | passes | unchanged |
| S | `tests/unit/domain/Versions.test.ts:8` `("1.0.0-beta.2","1.0.0") toBeGreaterThan(0)` | passes | **changes** to `toBeLessThan(0)` |

No other test in either repository compares a pre-release. A grep for `\d+\.\d+\.\d+-[0-9A-Za-z]`
found, besides the lines above, only folder names: S `tests/unit/application/Follow.test.ts:91,231,278,289,290`,
`tests/live/live.test.ts:123` and `tests/unit/infrastructure/follow-adapters.test.ts:57`. New cases needed:

- pre-release ordering, such as `alpha < alpha.1 < alpha.beta < beta < beta.2 < beta.11 < rc.1 < 1.0.0`
  (the §11 example);
- build metadata ignored;
- one test each for the `MagicContextVersionsUseCase` and `FollowUseCase` effects above.

### Dependencies

| Package | S | A today | Proposal |
|---|---|---|---|
| `@npmcli/arborist` | `dependencies` `9.4.0` (S package.json:34-36); imported only in `src/infrastructure/adapters/outbound/npm/ArboristInstallerAdapter.ts:1`; compiled into the executable (S scripts/build.mjs:14-18) | absent | add, pinned exactly at `9.4.0`, under **`devDependencies`**. This matches A's convention: bundled libraries such as `drizzle-orm` `0.45.4`, `solid-js`, `@opentui/*` are devDependencies (A package.json:27-38), and the compiled CLI is self-contained (AGENTS.md:20, :659-660). The alternative is a `dependencies` key, which A has never had and which would contradict AGENTS.md:20 as written |
| `@types/npmcli__arborist` | devDependency `6.3.3` (S package.json:30) | absent | add to `devDependencies` at `6.3.3` |
| `@types/bun`, `bun-types`, `typescript` | `1.4.2`, `1.4.2`, `5.9.3` (S :29, :31-32) | the same versions (A :32, :34, :37) | nothing to add |

- **How A treats third-party imports.** `domain` and `application` may import no package (I5,
  imports.test.ts:62-71). `@opencode/*` is forbidden everywhere (I6). `@opentui/*` is type-only outside
  `.tsx` files (I7). `bun:sqlite` and drizzle's `sql` are allowed only in the store engine (I1). A has
  no rule tying imports to declared dependencies; S had one (S architecture.test.ts:15-17, :35-38).
- **Whether A lists `dependencies`.** It does not: package.json:1-39 has only `devDependencies`.

### Gap resolutions

Decision numbers above refer to the survey brief: decision 1 = D2, 4 = D14, 5 = D13, 6 = D7.

| Gap | Resolution |
|---|---|
| 1 darwin refused at startup | D5: darwin gets the maintenance adapters too (Stage 4); `darwin-container.ts` exports `darwinAdapters` and `darwinPatchesAdapters`; one `SUPPORTED_PLATFORMS` |
| 2 migration of old state | D9, D10: history copied and `cmp`-verified (9.2, 10.6); `{M}` re-installs through the new `follow` (10.7); old units stopped first (10.1) |
| 3 watch off Linux | D6: launchd agent (Stage 6); win32 exits 1, reported blocked (D8) |
| 4 output changes | D19 |
| 5 per-platform behaviour | darwin: measured by 5.6 gate 3, 4.4, 7.3, 9.3, 9.6; Magic Context's log at `$TMPDIR/opencode2/magic-context/magic-context.log` and OpenCode's cache at `~/.cache/opencode/npm/@cortexkit` on this Mac (memory #8029; the 0.49.56 copy loaded from there). win32: blocked (D8, D14) |
| 6 e2e per platform | stand-in executables for `ps`, `osascript`, `powershell` through the adapters' constructor arguments (5.6, 5.7); `bunfig.coverage.e2e-darwin.toml` by Stage 4 |
| 7 P2 count on moved classes | 5.5 and 5.6 gate 2 |
| 8 anchors in uncommitted files | Stage 2 commits D1 first; every later step reads the anchor before editing |
| 9 `container.test.ts` | read and updated by 5.7 when it lists router families or override keys |
| 10 Arborist inside the CLI | 5.7 gate 2 (`bun run build`), 7.1–7.3 live `follow` |
| 11 subfolders | D20 |
| 12 `pinnedMagicContext` | D21 (5.4) |
| 13 `opencode.json` fallback | D22 (5.6) |
| 14 test names | D23 |
| 15 L6 and fixtures | D24 |
| 16 `SUPPORTED_PLATFORMS` meaning | one constant (Gap 1) |
| 17 non-semver inputs | D26 |
| 18 seams | D26 |

## Appendix F — Use cases and their scenarios per tier

Every scenario named here exists in `{S}` at `cd92fff` (file given) unless marked **new**; Appendix E gives each file's
target in `{A}`. "neg" names the negative scenario of that tier.

| # | Use case | unit | component | e2e | live |
|---|---|---|---|---|---|
| U1 | `patches status` | `tests/unit/application/StatusAndCheck.test.ts`; neg: unknown version classified `unchecked-version` | `tests/component/adapters-with-use-cases.test.ts`; neg: modified file → `modified` | `tests/e2e/lifecycle.test.ts`; neg: no copy installed → `not-installed` | `tests/live/live.test.ts` "finds the copy opencode.jsonc pins"; neg: — (read-only on the real host; exempt: no negative input exists on a live read) |
| U2 | `patches apply` | `ApplyUndo.test.ts`; neg: checksum not `before` → `refused` | `adapters-with-use-cases.test.ts`; neg: count mismatch | `lifecycle.test.ts`, `faults.test.ts`; neg: write failure puts back every file | exempt (changes the live copy; covered by e2e on real files) |
| U3 | `patches undo` | `ApplyUndo.test.ts`; neg: not `after` → `refused` | same file; neg | `lifecycle.test.ts`; neg | exempt (as U2) |
| U4 | `patches check` | `StatusAndCheck.test.ts`; neg: one patch missing → exit 1 | same | `lifecycle.test.ts`; neg | `live.test.ts` "checks consistently with status"; neg: exempt (as U1) |
| U5 | `patches inspect` | `Inspector.test.ts`, `InspectEffectNotify.test.ts`; neg: version not installed → `not-installed` | — (no adapter beyond files; exempt with this reason) | `lifecycle.test.ts`; neg | exempt (read of fixtures suffices) |
| U6 | `patches effect` | `EffectReading.test.ts`, `InspectEffectNotify.test.ts`; neg: rejection lines → `rejected` | — (log file only; exempt) | `tests/e2e/effect.test.ts`; neg: no log → reported | `live.test.ts` threshold (with `--since`, step 5.10); neg: exempt |
| U7 | `patches notify` | `InspectEffectNotify.test.ts`; neg: check ok → no notification | — | `effect.test.ts`/`lifecycle.test.ts`; neg: notifier missing → reported, exit 1 | 9.6 (manual, user-confirmed) |
| U8 | `patches follow` | `Follow.test.ts`, `follow-adapters.test.ts`; neg: unknown shape → `stopped` | `tests/component/follow-with-real-adapters.test.ts`; neg: sandbox rejects | `tests/e2e/follow.test.ts`; neg: tarball with crafted unknown shape | `live.test.ts` follow-real-registry (fixed by 5.10); neg: — exempt (no crafted release on the real registry) |
| U9 | `patches follow --rollback` | `Follow.test.ts`; neg: none recorded; **new** neg: previous folder missing (5.9) | `follow-with-real-adapters.test.ts`; neg | `follow.test.ts`; neg **new** (5.9) | exempt (would change the live entry) |
| U10 | `install:watch` | **new** `tests/unit/scripts/watch.test.ts` (linux, darwin, win32 refusal = neg) | — | — (scripts are outside the e2e tier in `{A}`) | `live.test.ts` systemd checks (Linux) and **new** launchd check (darwin, read-only `launchctl print`); neg: not installed → reported |
| U11 | help, version, usage | `CliAdapter.test.ts`, `main.test.ts`; neg: unknown command → exit 2 | — | **new** `tests/e2e/patches/cli-surface.test.ts`; neg: every malformed flag → exit 2 | exempt |
| U12 | darwin process list | **new** `darwin-adapters.test.ts`; neg: `ps` exits non-zero | — | `{A}` e2e "refuses while OpenCode is running" on darwin; neg: no process | 4.4 |
| U13 | darwin holders | **new** `darwin-adapters.test.ts`; neg: `lsof` missing | `{A}` component "preflight and the guard work against a real database"; neg | `{A}` e2e "…while the database is held open"; neg | 4.4 |
| U14 | D1 worktree-link repair | `tests/unit/transfer/worktree-repair.test.ts`, `git-worktree-adapter.test.ts` | `tests/component/location-repair-processes.test.ts` | `tests/e2e/location-repair.test.ts` | `tests/live/tui-repair.test.ts` |
| U15 | per-platform patches ports (start time, liveness, notification) | **new** one test per adapter, linux/darwin/win32 stand-ins; neg: command fails | — | darwin and linux through their containers | win32 blocked (D8, D14) |

U14's negative scenarios per tier are read from D1's tests by step 2.4 and listed in the record; any tier without one
is reported as a gap there.
