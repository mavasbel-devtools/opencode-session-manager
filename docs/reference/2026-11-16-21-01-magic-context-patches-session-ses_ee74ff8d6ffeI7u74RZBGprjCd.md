# Session ses_ee74ff8d6ffeI7u74RZBGprjCd — opencode-magic-context-patches

State record for this repository (Context Restoration Protocol). Newest entry last.

## 2026-10-11 20:05 — built

- Plan: `docs/plans/2026-10-11-19-37-patch-tool.md` (approved: patch the installed copy, full rules,
  systemd notification, local only).
- Verified: the installed Magic Context 0.47.0 files equal the published npm tarball
  (`sha512-ei7HuwbU…ffVvNw==`); recorded before/after checksums in `patches/execute-threshold-min.ts`.
- Source, tests (unit, component, e2e, live), scripts, systemd units and docs written; typecheck
  clean; unit and e2e coverage 100 % lines and functions per file.
- Read-only on the real system before applying: `status` → 0.47.0 loaded, `not-applied`; `effect` →
  11 rejections of `execute_threshold_percentage` since the server started, threshold in use 65 %.

## 2026-10-11 20:10 — installed and applied

- `bun run install:cli` (valid, identical, on PATH) and `bun run install:watch` (units valid,
  enabled, active).
- `apply` at 20:07:45: `dist/v2/server-50hvkg3v.js` dd36bd4a… → 58cb9f82…, `dist/index-m5fe6jch.js`
  6abe7e8c… → 559226c0…; read-only backups and audit entries written; `check` OK.
- `bun run check` passed: docs lint, typecheck, unit 81 tests and e2e 20 tests at 100 % lines and
  functions per file, component 3, live 6 (the watch started a run for a probe folder; with the patch
  applied it reported "OK: nothing to notify").

## 2026-10-11 20:30 — confirmed in use

- The user restarted OpenCode (server start 2026-10-12T02:30:18.920Z UTC).
- `status`: 0.47.0 loaded, `execute-threshold-min` applied (both files at the recorded `after`).
- `check`: OK.
- `effect`: 0 rejections of `execute_threshold_percentage` since the start, proactive floor 11 %,
  threshold in use 13 %, `verdict: respected`. The user also sees 13 in OpenCode.
- `bun run test:live` after the restart: 6 pass, 0 fail (including the effect test, which now
  requires `respected`).

Done. Next time Magic Context updates: `status`, and `inspect` + a new checked release if the version
is `unchecked-version` (README, "After a Magic Context update").

## 2026-10-14 22:59 — Magic Context 0.49.2

- 0.49.2 added as a checked release (commit `b4709dc`; evidence
  `docs/reference/2026-10-14-22-08-magic-context-0.49.2-execute-threshold.md`).
- Pinned `@0.49.2` in `opencode.jsonc`; the running OpenCode installed and loaded it at 04:12 UTC
  without a restart, so it ran the unpatched code: 13 rejections of `execute_threshold_percentage`,
  the last at 04:12:34 UTC, and the sidebar showed 65 %. `apply` at 04:12:42 UTC patched the files on
  disk (`dist/v2/server-cw6521wn.js` → `b8efc88f…`, `dist/index-k6xvbj2e.js` → `535abb2e…`).
- After the user's restart (log from 04:52:04 UTC): `check` OK, `effect` 0 rejections, proactive
  floor 11 %, threshold in use 13 %, `verdict: respected`; `bun run test:live` 6 pass, 0 fail.
- Removed the unused copies 0.40.0, 0.42.6, 0.47.0 and 0.49.0 from `~/.cache/opencode/npm/@cortexkit/`
  (none open or mapped by a process); only 0.49.2 remains.

Lesson: a pin change is picked up by the running OpenCode, so the new copy loads unpatched. Order:
pin → wait for the install → `apply` → restart OpenCode → `effect`.

## 2026-10-16 18:50 — Magic Context 0.49.7

- 0.49.7 added as a checked release (commit `3f80cda`; evidence
  `docs/reference/2026-10-16-17-03-magic-context-0.49.7-execute-threshold.md`): its two schema files
  are byte-identical to 0.49.2's.
- Backup before the pin: `~/.local/share/opencode/mc-upgrade-backup-2026-10-16-17-05-40/` (both
  databases, integrity ok, and both configuration files).
- Pinned `@0.49.7`; the running OpenCode installed it (byte-identical to the npm tarball) and loaded it
  unpatched at 23:07 UTC (10 rejections, 65 %). `apply` at 23:07:27 UTC.
- After the service restart (server from 00:04:40 UTC on 2026-10-17): `check` OK, `effect` 0
  rejections, threshold in use 13 %, `verdict: respected`; per-model `execute_threshold_tokens`
  matched for Antigravity (`matchedModel=antigravity/gemini mode=tokens`, 80,000 of 983,040);
  context.db format 95, `quick_check` ok, 14 historian runs, all `success`; `bun run test:live` 6 pass.
- TUI windows opened before the pin keep showing 0.49.2: each window loads Magic Context's TUI part
  itself when it starts, and restarting the service does not restart the windows. Close and reopen them.

## 2026-10-23 00:39 — `follow` command: prerequisites checked, plan proposed

- Plan: `docs/plans/2026-10-23-00-39-follow-command.md` (not approved; no `src/` change).
- P1 checked: OpenCode 2.1.1 loads Magic Context from an absolute folder path (isolated
  `opencode serve`, `GET /api/plugin` → `active`, source `local`).
- P2 checked: `@npmcli/arborist` 9.4.0 with OpenCode's options reproduces the live install
  byte-for-byte (8,410 files); the npm 11.20.0 CLI does not (8,372 files, missing optional packages).
- The sandbox server had no `TMPDIR`, so it wrote 117 lines into the live Magic Context log
  (06:37:12–06:37:57Z); no rejections among them. Sandbox runs must set `TMPDIR`.
- Waiting for: the rule changes (AGENTS.md rules 5–7) and choices C1–C3.

## 2026-10-23 10:41 — `follow` built, verified, installed

- Approved: AGENTS.md rules 5–7 changed; C1 hot reload, C2 `installs/<v>/` under XDG_DATA_HOME, C3 keep 1 previous.
- Built: `follow [--version <v>]`, `follow --rollback` (FollowUseCase, RollbackUseCase, `src/application/follow/`,
  12 new adapters and 7 new outbound ports); a `matcher` on each patch; `status` marks auto-checked releases.
- `bun run check` exit 0: unit 160/160 and e2e 47/47 at 100 % lines and functions per file, component 4/4, live 7/7.
- Live proof: real registry + Arborist + `~/.opencode/bin/opencode` in a throwaway home adopted 0.49.19 (8 steps ok)
  and rolled back; hot reload proved on a running isolated `opencode serve` (7.0 s each way).
- Installed: CLI 0.2.0, units run `follow` (first run `up-to-date`, Result=success); the real
  `opencode.jsonc` unchanged (sha256 `28e5820e…`).
- Plan updated with the evidence: `docs/plans/2026-10-23-00-39-follow-command.md`.
- Open: push (user's call); the live switch to the managed folder happens with the next release, or now with
  `follow --version 0.49.19`.
