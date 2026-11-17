# Magic Context 0.49.50: the fold identity moves with the mount

Date: 2026-11-10 23:00. Installed copy:
`/home/mavasbel/.local/share/opencode-magic-context-patches/installs/0.49.50/node_modules/@cortexkit/opencode-magic-context`.
Published tarball: `@cortexkit/opencode-magic-context@0.49.50`,
`sha512-RYF7ydrfueVwZqCoW3Ra8mwHjuhwlubNM0uk/0wS/0sGOjvpgrRv2jtw7NCDMl2aiObgr65motYdp9XaSbJ85g==`.

## 1. What Magic Context stores, and what it refuses

Magic Context keeps a **native fold admission** per session: the checkpoint id it folded up to, the
digest of that checkpoint's summary, and `proof.sourceDigest`, the digest of the store identity the
admission was written under. `admits()` re-checks all three before it reuses the fold:

`dist/context-4js5qnnm.js:2708` (and its `dist/v2/context-qkr7z6d0.js` twin):

```js
      if (proof.sourceDigest !== foldDigest(reader.hostIdentity()) || proof.admissionID !== cut.id || proof.summaryDigest !== foldDigest(cut.data.summary ?? "")) {
        this.report(sessionID, "replay refused: invalid checkpoint floor or provenance");
        return false;
      }
```

The stored admission is carried forward unchanged every turn
(`saved.proof` is spread into the next admission, `dist/index-6athgjba.js`, `admissionFor`/`capture`
paths), so once `sourceDigest` is stale the refusal repeats on every transform: the fold is rebuilt
from scratch, and `native-fold/v3` replay is never reused.

## 2. Why the digest changes on its own

`hostIdentity()` hashes the string `hostname + realpath(db) + "${stat.dev}:${stat.ino}:${stat.birthtimeMs}"`
(`dist/index-6athgjba.js:289`, `:127`, `:179`; the `dist/v2/server-rthnpmbp.js` twin carries the same
two expressions).

- The store lives on btrfs (`/home/mavasbel/.local/share/cortexkit/magic-context/context.db`).
- btrfs assigns `st_dev` from an **anonymous block-device number** that is not stable across mounts;
  it changes at every boot.
- `st_ino` and `st_birthtimeMs` do not change for a given file.

So the identity changes exactly once per boot and never otherwise; the admission can never heal,
because healing would require the plugin to rewrite an admission it refuses to reuse.

## 3. What was measured

| Measurement | Value | Command |
|---|---|---|
| `replay refused` lines in the live log, 2026-11-10 | 1 171 and growing (~74/h in the busiest session) | `grep -c "replay refused" /tmp/opencode2/magic-context/magic-context.log` |
| sessions affected | 7 | `grep -l "replay refused"` over the per-session lines |
| turn still completes | yes, 30–40 ms, `cache_hit` | Magic Context transform timings in the same log |
| conversion to `replay refused` per transform | still refused after reboot | log, 04:06Z restart |

The refusal costs no user-visible failure: the fold is rebuilt. It costs the native-fold reuse Magic
Context was built for, on every transform of every affected session, for the lifetime of the store.

## 4. The two patches

### `fold-identity-stable`

Two expressions per bundle, once each:

```js
const acquiredIdentity = identity || `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
```

become `${stat.ino}:${stat.birthtimeMs}`. The identity stays unique per store (inode + creation time),
and stops depending on the mount. Releases: 0.49.15 (`dist/index-snp5wbge.js`,
`dist/v2/server-dd0tz6cn.js`, applied **after** `no-session-model-fallback`, which changes the same two
files) and 0.49.50 (`dist/index-6athgjba.js`, `dist/v2/server-rthnpmbp.js`).

Checksums, 0.49.50:

| file | before | after |
|---|---|---|
| `dist/index-6athgjba.js` | `79892e328d90c35497ea336349e8d9dcc2b3b3497dc781ad98c429b04723c862` | `75b468fa07b52a0f62f3cb5ee7bbb00f825671528dfae1e19f907761329a45fd` |
| `dist/v2/server-rthnpmbp.js` | `a4b67c81aa8c1a67dfd1c9899464c3aabc3ae8b838d2c630e7cde5037a3f0191` | `0682ee82b87c84b6116fcdc074f51325b2ca27fc2d17904fa7ebc3fa417ad8c2` |

### `fold-provenance-heal`

A digest-only mismatch is a moved store, not a different fold. The patch splits the guard:

```js
      const hostDigest = foldDigest(reader.hostIdentity());
      if (proof.admissionID !== cut.id || proof.summaryDigest !== foldDigest(cut.data.summary ?? "")) {
        this.report(sessionID, "replay refused: invalid checkpoint floor or provenance");
        return false;
      }
      if (proof.sourceDigest !== hostDigest) {
        this.report(sessionID, "replay provenance refreshed after the store identity changed");
        saved.proof = { ...proof, sourceDigest: hostDigest };
        const refreshed = encodeAdmissionV3(saved);
        await this.admissions.set(this.admissionKey(sessionID), { payload: refreshed, digest: foldDigest(refreshed) });
      }
```

The admission and summary mismatches keep their refusal; a digest-only mismatch rewrites the
admission and keeps the fold. 0.49.50 only, `dist/context-4js5qnnm.js` and
`dist/v2/context-qkr7z6d0.js`, applied **after** `refusal-recovery` (its toast changes the same files).

| file | before | after |
|---|---|---|
| `dist/context-4js5qnnm.js` | `026a90661806373d5e45281a723990ad0fcc11ebc4f494a9f19d0bdf41b3d4ce` | `0badabe6fdb6f689f66c1a350d7e691420dd07091da9568518c5c149738c29a3` |
| `dist/v2/context-qkr7z6d0.js` | `6da832951427fc690c7578c18bd3bba0939b243f013846731ce3b5c08b6a1215` | `c2c28efec09d256580a7da247c992e18e80c1fa87f85caee5658fa371cf8902c` |

## 5. What the patches do not do

- They do not touch the `readCapturedReplay` / `floorState` fallbacks (`dist/index-6athgjba.js:2473`,
  `:2420`); those only fall back, and the admission `admits()` reads is healed from the next
  transform on.
- They do not change what an admission means: the checkpoint id and the summary digest are still
  required to match exactly.
- `fold-identity-stable` on 0.49.15 is reviewed but never used on this machine unless 0.49.15 is
  followed again; it is there because the patch tool's rule is one definition per behaviour across
  every reviewed release.

## 6. Verification after the restart

- The live log shows no new `replay refused: invalid checkpoint floor or provenance`.
- The affected sessions show `replay provenance refreshed after the store identity changed`, once per
  session, then plain `cache_hit` transforms.
