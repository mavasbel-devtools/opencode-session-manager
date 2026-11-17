# Composed patches, and a mount-stable Magic Context fold identity

Plan of 2026-11-10 22:48, approved by the user ("3. Proceed") after the stack status review of
2026-11-10 22:36. Repository: `/home/mavasbel/Dev/repos/devtools/opencode-magic-context-patches`.

## Why

Magic Context 0.49.50 refuses its own native fold on every transform of seven sessions:
`v3 host fold: replay refused: invalid checkpoint floor or provenance` (1 171 lines and growing,
~74/h in the busiest session). The cause is the store identity itself:

- `/home/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.50/node_modules/@cortexkit/opencode-magic-context/dist/index-6athgjba.js:127,179`
  build `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` and `:289` hashes it into `hostIdentity()`;
- on btrfs `st_dev` is an anonymous per-mount number, so every reboot changes it, every stored
  `proof.sourceDigest` stops matching, and the admission is never rewritten — the loop never heals.

The fix belongs in two new patches. The first (the identity) also has to change
`dist/index-snp5wbge.js` and `dist/v2/server-dd0tz6cn.js` of **0.49.15**, which
`no-session-model-fallback` already changes; the tool refuses two patches on one file
(`src/application/follow/ReleaseStager.ts:77`), so the tool must learn ordered composition first.

## Objective

1. The tool applies, checks and undoes patches that share a file, in `patches/index.ts` order.
2. `fold-identity-stable` removes the mount-dependent component from the store identity.
3. `fold-provenance-heal` refreshes a stored admission whose only mismatch is the source digest.
4. After a restart, the log shows no new `replay refused: invalid checkpoint floor or provenance`
   and the affected sessions show `replay provenance refreshed`.

## Out of scope

- The Hindsight backlog and its consolidation policy (user: defer).
- Any other Magic Context behaviour, any other patch, any OpenCode change.
- Deleting the Hindsight `hindsight-data-0120` volume (kept 24 h for rollback).

## Stage A — the tool composes patches that share a file

**What it leaves behind:** `src/domain/services/PatchRules.ts`, `src/application/PatchInspector.ts`,
`src/application/follow/ReleaseStager.ts`, `src/application/InstallationCatalog.ts`,
`src/application/UndoUseCase.ts`, their unit, component and e2e tests, and the `AGENTS.md`/`README.md`
sentences that state the old rule.

| Step | Action | Target | Content | Depends on | Gates |
|---|---|---|---|---|---|
| A1 | edit | `src/domain/services/PatchRules.ts` | `fileState(file, sha, later: readonly string[] = [])`: `patched` when the sha is `file.after` or any entry of `later` | none | `bun test tests/unit/domain/PatchRules.test.ts` passes |
| A2 | edit | `src/application/PatchInspector.ts` | constructor takes `patches: readonly PatchDefinition[]`; `read`/`readAll`/`status` pass the after-checksums of every later patch that changes the same path for the same version, resolved through `ReleaseCatalog`; `[]` when the patch is not in the list | A1 | `bun run typecheck` passes |
| A3 | edit | `src/application/follow/ReleaseStager.ts` | one sequential loop over `this.patches`: read the matcher's files **from disk**, `locate`, write, next; the "both change" refusal goes; the `locate` and `patch` pass lines are emitted once after the loop | A2 | `bun test tests/unit/application/Follow.test.ts` passes |
| A4 | edit | `src/application/InstallationCatalog.ts` | `targets(filter, order: "apply" \| "undo" = "apply")`, patches reversed for `"undo"` | A3 | `bun run typecheck` |
| A5 | edit | `src/application/UndoUseCase.ts` | calls `targets(filter, "undo")` | A4 | `bun test tests/unit` passes |
| A6 | edit | `tests/unit/application/Follow.test.ts` | the overlap case becomes a composition case: two patches on `dist/a.js` derive `second.before === followPatch.after` and both are written | A3 | `bun test tests/unit/application/Follow.test.ts` |
| A7 | edit | `tests/e2e/follow.test.ts` | the overlap case becomes a composition case with `executeThresholdMin` + a second patch on the same file | A3 | `bun test tests/e2e/follow.test.ts` |
| A8 | edit | `tests/unit/patches/patches.test.ts` | per version, apply the patches in `PATCHES` order over an accumulating text per path; the later `before` is checked against the earlier `after` | A3 | `bun test tests/unit/patches/patches.test.ts` |
| A9 | edit | `tests/unit/domain/MatcherRules.test.ts` | derive the matchers sequentially per version over the text the earlier patches produced | A3 | `bun test tests/unit/domain/MatcherRules.test.ts` |
| A10 | edit | `AGENTS.md`, `README.md` | "One file belongs to one patch" becomes: a file may belong to several patches; they are applied in `patches/index.ts` order, each to the previous one's result | A1–A9 | `bun run lint:docs` |

## Stage B — the two patches

**What it leaves behind:** `patches/fold-identity-stable.ts`, `patches/fold-provenance-heal.ts`,
their entries in `patches/index.ts`, `docs/reference/2026-11-10-23-00-magic-context-fold-identity.md`.

| Step | Action | Target | Content | Depends on | Gates |
|---|---|---|---|---|---|
| B1 | edit | `patches/fold-identity-stable.ts` (create) | site `identity`, 2 files, shape `\`${stat.dev}:${stat.ino}:${stat.birthtimeMs}\`` → `\`${stat.ino}:${stat.birthtimeMs}\`` ×2; releases 0.49.15 (`dist/index-snp5wbge.js`, `dist/v2/server-dd0tz6cn.js`) and 0.49.50 (`dist/index-6athgjba.js`, `dist/v2/server-rthnpmbp.js`) | A | unit patch tests pass |
| B2 | edit | `patches/fold-provenance-heal.ts` (create) | site `heal`, 2 files in 0.49.50 only (`dist/context-4js5qnnm.js`, `dist/v2/context-qkr7z6d0.js`): a `proof.sourceDigest` mismatch that is not an admission or summary mismatch rewrites the admission with the current digest | B1 | unit patch tests pass |
| B3 | edit | `patches/index.ts` | both patches appended, in that order | B1, B2 | `bun run typecheck` |
| B4 | edit | `docs/reference/2026-11-10-23-00-magic-context-fold-identity.md` (create) | the code sites, the btrfs `st_dev` mechanism, the measured refusal counts, the checksums, the healing rule | B3 | `bun run lint:docs` |
| B5 | run | `bun run check` | whole gate | A, B1–B4 | exit 0, 100 % coverage both tiers |
| B6 | run | `bun run install:cli` | build and install | B5 | `opencode-magic-context-patches status` exits 0 |
| B7 | run | `opencode-magic-context-patches apply` | on the loaded 0.49.50 copy | B6 | `check` → OK; `status` → 5 patches applied |
| B8 | run | `opencode service restart`, then the log check | user starts it; then `effect --since <restart>` and the refusal count | B7 | 0 new `replay refused: invalid checkpoint floor or provenance`; ≥1 `replay provenance refreshed` |

## Stage C — delivery

| Step | Action | Target | Content | Depends on | Gates |
|---|---|---|---|---|---|
| C1 | run | `git push origin main` | commits `742a563` plus this work | B8 | `git status -sb` shows no ahead/behind |
| C2 | run | `/home/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.45` | `rm -rf`, only when `/api/plugin` does not name it and no process holds it open | C1 | the folder is gone; `check` still OK |
| C3 | run | the final gate | `bun run check`, `check`, `effect`, Hindsight stats | C1, C2 | recorded in `docs/sessions/<id>.md` |

## Verification

- Every gate above is a command with an observable result; the evidence goes into
  `docs/sessions/ses_ee74ff8d6ffeI7u74RZBGprjCd.md` under `~/Dev/repos/opencode/`.
- The identity change is proved by the composition test (0.49.15) and by the plan-line digests of the
  two staged files.

## Problems and escalation

- A probe whose length shifts the anchor beyond the matcher window (0.49.46 taught this at 400
  characters) → shorten the `find`, keep the anchor.
- A patched bundle that no longer parses → the stager fails `patch`; reduce the replacement to the
  smallest edit.
- `follow` refuses the new releases → `inspect --version 0.49.50` and compare the shapes.
- Escalation: the user, with the exact command and its output. No step is skipped.
