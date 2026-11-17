# How to make Magic Context respect `execute_threshold_percentage: 13`

The facts are in `docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md`: the
configuration schema of Magic Context 0.47.0 accepts 20–90 and falls back to 65 otherwise, while the
code that uses the threshold has no lower bound.

## Options compared (2026-10-10, before the build)

| Option | How | For | Against |
|---|---|---|---|
| A. Patch the installed copy (chosen) | Change `min(20)` to `min(1)` in the two compiled files, with checksums, backups and an audit log; re-apply after each update | Works now; `13` stays exactly as configured | Each update replaces the files, so the patch must be re-checked and re-applied; not supported by Magic Context |
| B. Ask upstream | An issue or PR at cortexkit/magic-context to lower the minimum | Permanent | Depends on them; takes time |
| C. No code change | `execute_threshold_tokens` per model (13 % of each window), its own limits 5,000 tokens to 90 % of the window | Supported; survives updates | A fixed token count per model, not a percentage; the `13` line would still be rejected unless removed |

The user chose A, kept the `13` in the configuration (project memory #890), and asked for the
patching to be a repository that can be audited and re-run.

## Why a checksum-pinned text replacement

- The compiled bundles change file names between versions (`server-50hvkg3v.js`), so a patch is
  tied to exact files of an exact version, identified by sha256 against the published tarball.
- Counting occurrences before and after, and comparing the result with a recorded checksum, means a
  file that differs in any way from what was reviewed is never written.
- A text replacement whose replacement text did not occur before is exactly reversible, so `undo`
  works even without the backup.
