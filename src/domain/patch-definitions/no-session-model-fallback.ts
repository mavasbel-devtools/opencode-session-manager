import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"

/**
 * Stops the historian from retrying on the parent session's own model.
 *
 * When the configured historian model and every configured `fallback_models` entry have failed,
 * `runFallbackHistorianPass` appends one more candidate: `args.fallbackModelId`, the live model of the
 * session being summarised (`...args.fallbackModelId ? [{ model: args.fallbackModelId }] : []`). No
 * setting turns it off, so a configuration of free models only still ends on whatever model the user
 * is chatting with — Claude or a paid model. The patch empties that spread; the chain is then exactly
 * the configured fallbacks, and when they all fail the run fails (and is retried later) instead.
 * Evidence: docs/reference/2026-10-22-01-14-magic-context-0.49.15-no-session-model-fallback.md.
 *
 * 0.49.15 (sha512-p5sr6sym…SE3lhg==): the text occurs once in each of the two files; `before` equals the
 * published tarball's files and the installed copy.
 *
 * 0.49.19 (sha512-VZpV1voW…VkD9xw==): upstream now appends the session model only when no historian
 * model is configured (`...!primary && args.fallbackModelId ? …`, issue 740 in 0.49.16). That case still
 * runs the session's model, so the patch empties the new spread too; the text occurs once in each of
 * the two files. Evidence: docs/reference/2026-10-22-23-00-magic-context-0.49.19-patches.md.
 *
 * 0.49.35 (sha512-QbvlV5Bl…f6KKA==): `runFallbackHistorianPass` is byte-identical to 0.49.19's; the
 * 0.49.19 text occurs once in each of the two (renamed) files. Evidence:
 * docs/reference/2026-11-02-06-30-magic-context-0.49.35-patches.md.
 *
 * 0.49.41 (sha512-MTzXgCZk…LobwA==): the 0.49.19 text still occurs once in each of the two (renamed)
 * files. Evidence: docs/reference/2026-11-07-23-41-magic-context-0.49.41-patches.md.
 *
 * 0.49.42 (sha512-uroOPFQ6…ccbGQ==) and 0.49.43 (sha512-JpXEEyXI…Hv9Igg==): the bundles were rebuilt under
 * new names (`dist/index-xmqj3cf5.js`, `dist/v2/server-5ydn39x3.js`); the 0.49.19 text still occurs once
 * in each, with `src/` unchanged since 0.49.41. Evidence:
 * docs/reference/2026-11-08-10-45-magic-context-0.49.42-0.49.43-patches.md.
 * 0.49.50 (sha512-RYF7ydrf…J85g==): rebuilt under `dist/index-h8g08nxs.js` and
 * `dist/v2/server-016a1whm.js`; the text and its count are unchanged. Evidence:
 * docs/reference/2026-11-11-01-24-magic-context-0.49.46-0.49.50-patches.md.
 *
 * 0.49.55 (sha512-LqyhQ7hN…SjA7oQ==): `dist/index-xj5bap1r.js`, `dist/v2/server-96g41nad.js`; texts, counts and anchors as in
 * 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.
 *
 * 0.49.56 (sha512-hUfmVxV3…46bEyw==): `dist/index-3jeq08jv.js`, `dist/v2/server-z6sxv6n3.js`; texts, counts
 * and anchors as in 0.49.55. Evidence: docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md.
 *
 * 0.49.63 (sha512-A4ezV8dr…Lu9A==): rebuilt under `dist/index-4yjn3er4.js` and
 * `dist/v2/server-8hcxmt1w.js`; the 0.49.19 text occurs once in each, with the anchor and distance
 * unchanged. Evidence: docs/reference/2026-11-19-19-04-magic-context-0.49.63-patches.md.
 */
const FIND = "...args.fallbackModelId ? [{ model: args.fallbackModelId }] : []"
const FIND_0_49_19 = "...!primary && args.fallbackModelId ? [{ model: args.fallbackModelId }] : []"
const REPLACE = "...[] /* mc-patches: no-session-model-fallback */"

export const noSessionModelFallback: PatchDefinition = {
  id: "no-session-model-fallback",
  title: "the historian never retries on the parent session's model",
  reason: "Only configured models may run the historian; the built-in session-model last resort used paid models.",
  evidence: "docs/reference/2026-10-22-01-14-magic-context-0.49.15-no-session-model-fallback.md",
  // In 0.49.15, 0.49.19 and 0.49.35 the spread sits 207 characters after the start of
  // `runFallbackHistorianPass`, once in each of the two bundles.
  matcher: {
    directory: "dist",
    extension: ".js",
    sites: [
      {
        name: "session-model spread",
        files: 2,
        shapes: [
          { find: FIND, replace: REPLACE, count: 1 },
          { find: FIND_0_49_19, replace: REPLACE, count: 1 },
        ],
        anchor: "async function runFallbackHistorianPass(args) {",
        window: 300,
      },
    ],
  },
  releases: [
    {
      version: "0.49.15",
      files: [
        {
          path: "dist/v2/server-dd0tz6cn.js",
          before: "4687892cee4b13c5f5514d489d39b0fc54115be7b882b590f9829d0d323ea593",
          after: "295e91073677f43c53b658ec642d4ad88a0d7f4f4d8b3488a9b31cd7d1c914d9",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/index-snp5wbge.js",
          before: "f65fdf4b1577935ec38c3b611e5116bbc5c9dc969ba6be22ec8cbc53ba1e56e1",
          after: "6f0f3e071773f868c1969e776cf9c90fba129d8ee591f60c788983e1c70087e8",
          replacements: [{ find: FIND, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.19",
      files: [
        {
          path: "dist/v2/server-6vdzn1td.js",
          before: "51f6eb3552332360c95a69c4b02a66652df27be9fbc3a84b48d3ea8bebb0dcdb",
          after: "1c15b60268584052a3085156a61a6915c9f94d24336f77b4d734ada892fa2678",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/index-rpxdjkm0.js",
          before: "f9d538e4be585626e770dced476ddb463e02bfda78ada94af446005e8bc7713b",
          after: "fe9fceefc730928461d9e18ca5d7eac523f6de444e10591f2b74395fc039895e",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.35",
      files: [
        {
          path: "dist/v2/server-fqj6ddpr.js",
          before: "3033120877326265feff4c85093837a3af7906ef97ae506e07f1c94d27f9ebd3",
          after: "088223099aa65315f87a3289d705f469db54661bc33adc439f94dba580e0845f",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/index-4bgk5ztz.js",
          before: "9bff6855af65a6a86766607df3afb19da2bb63108ad843ef27e592cc0fc16fd7",
          after: "a729ea84f98d36ff0fe10113c91d8a7884b12d337a4502347bb27ebbd7ff9823",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.41",
      files: [
        {
          path: "dist/v2/server-hewk7z3z.js",
          before: "9479661818eb44586239ba55ea1cc8199867754d35359a91f242cf00fa581b53",
          after: "8e582b7a3879f025e095cd2035a9999a986825fedc5d5060064157cdc56b722f",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/index-q9gamh8e.js",
          before: "65325306449a8cbb153d61c6deba6a13777b173c8f044b02ee30c13eeecf000f",
          after: "cb33d51df847952f3216aeec7d82875d53b2c6125e140baa84867a46fffed0f7",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.42",
      files: [
        {
          path: "dist/index-xmqj3cf5.js",
          before: "b32c2d8643f3067c4b3889dad70a088ba75583040830cfeffdf1367710ab39a9",
          after: "69e19b681d6c22d9348ca44fbe5d2f41b4d02d7728f7e2c89e0b1adb63a4bdc8",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/server-5ydn39x3.js",
          before: "33661bf2b18d063b5469e7b1ea87d76e69f33f41d11fd4d59652f69cbe29fa67",
          after: "5bc3c57b8bf6bb6aae3cbd1a3b4d729cff220d84ee4ecdf4d3dc3eb9221a0ab7",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.43",
      files: [
        {
          path: "dist/index-xmqj3cf5.js",
          before: "b32c2d8643f3067c4b3889dad70a088ba75583040830cfeffdf1367710ab39a9",
          after: "69e19b681d6c22d9348ca44fbe5d2f41b4d02d7728f7e2c89e0b1adb63a4bdc8",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/server-5ydn39x3.js",
          before: "33661bf2b18d063b5469e7b1ea87d76e69f33f41d11fd4d59652f69cbe29fa67",
          after: "5bc3c57b8bf6bb6aae3cbd1a3b4d729cff220d84ee4ecdf4d3dc3eb9221a0ab7",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.50",
      files: [
        {
          path: "dist/index-h8g08nxs.js",
          before: "8cad00365594c292c166dd84e085c6d10a10a05194face9eb2bd32a52c1807a5",
          after: "a32af334f90f7f31ec137dbdf28daa9198a8851894dabef0109038dc97111de1",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/server-016a1whm.js",
          before: "ae32672cc231720f99e5028ddc84478fdd063f974c7365667b3777d8533cbb65",
          after: "c0dadb6474e8c9915f0b0833b6801d7859fa1aaf631791e3bda64e11555d33d4",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
    {
      version: "0.49.55",
      files: [
        {
          path: "dist/index-xj5bap1r.js",
          before: "e67f4f7817494cb41b0f6928a5062f3d9af2640966a487affabf3f0a5fd909d3",
          after: "3c9c77c9dedc65eab2705f4596cdeecde89a6327a4e1fd29feb888484563bad6",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/server-96g41nad.js",
          before: "bb34875c349d9e6e9f1b1cc9a30ef3fd7dc3b141bf1b8981562b25b8b120b4ff",
          after: "fa80f7949f0febc8c0e9079541f7f9904b5f9524dd591e12fb763062ff5c319b",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
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
    {
      version: "0.49.63",
      files: [
        {
          path: "dist/index-4yjn3er4.js",
          before: "c23f3dac065a7fc2be8ecb5e7a52032de36ed24866d7b4dd5bd57783b5929898",
          after: "1c63fba45a31fb06b955dc6b18542e0b51d3fa61fbbfbdfb58e6394aabcb7cfd",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
        {
          path: "dist/v2/server-8hcxmt1w.js",
          before: "b2023098cfc377a2345c1f69c84123e26a4394157bac1d481db0107502ccfd5f",
          after: "0afc4d3b878170877ac40dffbac37fe15ccb5689cfaeb76658e8432d8d939d4a",
          replacements: [{ find: FIND_0_49_19, replace: REPLACE, count: 1 }],
        },
      ],
    },
  ],
}
