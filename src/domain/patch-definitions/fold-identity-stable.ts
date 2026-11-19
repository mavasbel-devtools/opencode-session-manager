import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"

/**
 * Keeps Magic Context's store identity the same from one boot to the next.
 *
 * The identity is hashed (`hostIdentity()`) into the `proof.sourceDigest` of every native-fold
 * admission Magic Context stores. It is built from `${stat.dev}:${stat.ino}:${stat.birthtimeMs}` in
 * two places of each of its two server bundles: the `connect(path, identity = "")` path and the
 * connection pool's `acquire()`. On btrfs `st_dev` is an anonymous per-mount number, so every reboot
 * gives every stored admission a different digest, every transform refuses its own checkpoint
 * ("v3 host fold: replay refused: invalid checkpoint floor or provenance"), and the fold is rebuilt
 * instead of reused. `st_ino` and `birthtimeMs` still tell two stores apart, so dropping `st_dev`
 * leaves the identity unique without binding it to a mount.
 *
 * Evidence: docs/reference/2026-11-10-23-00-magic-context-fold-identity.md.
 *
 * 0.49.15 (sha512-p5sr6sym…SE3lhg==): both texts occur once in each of its two bundles, the live
 * `dist/index-snp5wbge.js` and `dist/v2/server-dd0tz6cn.js`. `no-session-model-fallback` changes both
 * files first, so `before` is that patch's `after`, not the published tarball's file.
 *
 * 0.49.50 (sha512-RYF7ydrf…bJ85g==): the same two texts, once each in `dist/index-6athgjba.js` and
 * `dist/v2/server-rthnpmbp.js`; `before` equals the published tarball's files.
 *
 * 0.49.55 (sha512-LqyhQ7hN…SjA7oQ==): `dist/index-6athgjba.js` and `dist/v2/server-rthnpmbp.js`, byte-identical to 0.49.50's
 * files of the same names; texts, counts and anchors as in 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.
 *
 * 0.49.56 (sha512-hUfmVxV3…46bEyw==): the same two files, byte-identical to 0.49.55's; texts, counts and
 * anchors unchanged. Evidence: docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md.
 *
 * 0.49.63 (sha512-A4ezV8dr…Lu9A==): `dist/index-6athgjba.js` and `dist/v2/server-rthnpmbp.js`,
 * byte-identical to 0.49.56's; texts, counts and anchors unchanged. Evidence:
 * docs/reference/2026-11-19-19-04-magic-context-0.49.63-patches.md.
 */

const ACQUIRED = "const acquiredIdentity = identity || `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;"
const POOL = "const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;"
const ACQUIRED_FIXED = "const acquiredIdentity = identity || `${stat.ino}:${stat.birthtimeMs}`;"
const POOL_FIXED = "const identity = `${stat.ino}:${stat.birthtimeMs}`;"

export const foldIdentityStable: PatchDefinition = {
  id: "fold-identity-stable",
  title: "store identity without the mount-dependent st_dev",
  reason:
    "btrfs gives st_dev a new anonymous number at every boot, so every stored fold admission stops matching its own store, the native fold is refused on every transform and rebuilt, and the refusal never heals itself",
  evidence: "docs/reference/2026-11-10-23-00-magic-context-fold-identity.md",
  matcher: {
    directory: "dist",
    extension: ".js",
    // The identity code arrived after 0.49.43: releases without it have nothing to change.
    optional: true,
    sites: [
      {
        name: "acquired identity",
        files: 2,
        shapes: [{ find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 }],
        anchor: "statSync",
        window: 300,
      },
      {
        name: "pool identity",
        files: 2,
        shapes: [{ find: POOL, replace: POOL_FIXED, count: 1 }],
        anchor: "statSync",
        window: 300,
      },
    ],
  },
  releases: [
    {
      version: "0.49.15",
      files: [
        {
          path: "dist/index-snp5wbge.js",
          before: "6f0f3e071773f868c1969e776cf9c90fba129d8ee591f60c788983e1c70087e8",
          after: "39c44a137393c01f617a7a4c975e1661a82eb8c13f327177f01cac90e4568810",
          replacements: [
            { find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 },
            { find: POOL, replace: POOL_FIXED, count: 1 },
          ],
        },
        {
          path: "dist/v2/server-dd0tz6cn.js",
          before: "295e91073677f43c53b658ec642d4ad88a0d7f4f4d8b3488a9b31cd7d1c914d9",
          after: "dc475b003c0fda6de6552cc90531ae17beffe62908034f480c49240aeb3260a4",
          replacements: [
            { find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 },
            { find: POOL, replace: POOL_FIXED, count: 1 },
          ],
        },
      ],
    },
    {
      version: "0.49.50",
      files: [
        {
          path: "dist/index-6athgjba.js",
          before: "79892e328d90c35497ea336349e8d9dcc2b3b3497dc781ad98c429b04723c862",
          after: "75b468fa07b52a0f62f3cb5ee7bbb00f825671528dfae1e19f907761329a45fd",
          replacements: [
            { find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 },
            { find: POOL, replace: POOL_FIXED, count: 1 },
          ],
        },
        {
          path: "dist/v2/server-rthnpmbp.js",
          before: "a4b67c81aa8c1a67dfd1c9899464c3aabc3ae8b838d2c630e7cde5037a3f0191",
          after: "0682ee82b87c84b6116fcdc074f51325b2ca27fc2d17904fa7ebc3fa417ad8c2",
          replacements: [
            { find: ACQUIRED, replace: ACQUIRED_FIXED, count: 1 },
            { find: POOL, replace: POOL_FIXED, count: 1 },
          ],
        },
      ],
    },
    {
      version: "0.49.55",
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
    {
      version: "0.49.63",
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
  ],
}
