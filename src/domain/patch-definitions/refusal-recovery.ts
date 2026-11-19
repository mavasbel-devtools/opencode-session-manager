import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"

/**
 * Lets a session recover after Magic Context refuses a turn before the provider request.
 *
 * Without it, a turn is interrupted with `EmergencyFailClosedError` ("historian did not complete
 * within 60 s") when the historian runs longer than 60 s, whatever `historian_timeout_ms` says; the
 * user sees no reason; and the next turns reuse the usage reading that caused the refusal, so they
 * are refused too until OpenCode restarts (cortexkit/magic-context#828). Five sites:
 *
 * - `historian wait`: `resolveHistorianInlineJoinBudget` no longer clamps the configured
 *   `historian_timeout_ms` to 60 s; with no value set it is still 60 s.
 * - `historian status`: the "This may take up to … seconds" notice states that same wait.
 * - `refusal toast`: `EmergencyFailClosedError` gets the error toast the three other blocking
 *   errors already get, with its message as the reason.
 * - `thrown refusal` and `aborted refusal`: after a refusal the session is removed from
 *   `loadedSessions`, so its next pass runs the existing first-pass reset (stale usage cleared, the
 *   request measured from the wire), as after a restart.
 *
 * Evidence: docs/reference/2026-11-02-23-06-magic-context-0.49.35-refusal-patches.md.
 *
 * 0.49.35 (sha512-QbvlV5Bl…f6KKA==): every text occurs once in each of its two files, the live
 * bundle OpenCode 2 loads (`dist/index-b6xz3qbe.js`, `dist/context-fk8e3h9p.js`) and the
 * second copy in `dist/v2/context-znqfkap4.js`; `before` equals the published tarball's files and
 * the installed copy.
 *
 * 0.49.41 (sha512-MTzXgCZk…LobwA==): 0.49.37 rewrote `timedTransform` into an async wrapper with an
 * explicit catch, so `thrown refusal` uses its second shape there; the other four texts are
 * unchanged, each in the same two files, with the same anchor distances. Evidence:
 * docs/reference/2026-11-07-23-41-magic-context-0.49.41-patches.md.
 *
 * 0.49.42 (sha512-uroOPFQ6…ccbGQ==) and 0.49.43 (sha512-JpXEEyXI…Hv9Igg==): the bundles were rebuilt under
 * new names (`dist/context-zf1yj1g0.js`, `dist/index-adt3jghq.js`, `dist/v2/context-2xr6vbt2.js`); the five
 * texts, their counts and their anchor distances are unchanged, and `src/` is unchanged since 0.49.41.
 * Evidence: docs/reference/2026-11-08-10-45-magic-context-0.49.42-0.49.43-patches.md.
 *
 * 0.49.46 (sha512-NA5cxSbS…RO5w==): two host-checkpoint lines (`forgetHostCheckpointPass`,
 * `revertHostCheckpointPass`) were added inside the `timedTransform` catch, moving the pass-permission
 * anchor from 295 to 526 (measured on the 0.49.50 fixture) characters before the hit; that site's
 * window is therefore 600. The other
 * four sites keep their text, counts and distances, and that holds through 0.49.50
 * (sha512-RYF7ydrf…J85g==).
 *
 * 0.49.55 (sha512-LqyhQ7hN…SjA7oQ==): 0.49.53 wraps the pass-permission callback in
 * `afterCapture(sessionId, "pass permission report", () => …)`, so the text after it is `));` and the
 * anchor no longer ends in `;`. The anchor's start, and so every distance, is unchanged: 88 (0.49.35),
 * 295 (0.49.41 to 0.49.43), 526 (0.49.50), 527 (0.49.55). The five texts, their counts and files are
 * otherwise as in 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.
 *
 * 0.49.56 (sha512-hUfmVxV3…46bEyw==): `dist/context-bejy30t5.js`, `dist/index-ffab4edg.js`,
 * `dist/v2/context-5hhm89jw.js`; the five texts, counts and anchors as in 0.49.55, the thrown refusal
 * 527 characters after its anchor. Evidence: docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md.
 *
 * 0.49.63 (sha512-A4ezV8dr…Lu9A==): `dist/context-aaht09yh.js`, `dist/index-bqd5dmm4.js` and
 * `dist/v2/context-hk9x7ngz.js`; the five texts, counts and anchors as in 0.49.56, the thrown refusal
 * 527 characters after its anchor. Evidence: docs/reference/2026-11-19-19-04-magic-context-0.49.63-patches.md.
 */
const MARK = "/* mc-patches: refusal-recovery */"

const WAIT = {
  find: "return Math.max(0, Math.min(requested, HISTORIAN_INLINE_JOIN_BUDGET_MS));",
  replace: `return Math.max(0, requested); ${MARK}`,
  count: 1,
}
const STATUS = {
  find: "This may take up to ${HISTORIAN_INLINE_JOIN_BUDGET_MS / 1000} seconds.",
  replace: `This may take up to \${resolveHistorianInlineJoinBudget(args.historianTimeoutMs) / 1000 ${MARK}} seconds.`,
  count: 1,
}
const TOAST = {
  find: "if (managedError instanceof UnresolvedHistoryBoundaryError || managedError instanceof UnmanagedOverWindowError || managedError instanceof DegradedPassRefusalError) {",
  replace: `if (managedError instanceof EmergencyFailClosedError ${MARK} || managedError instanceof UnresolvedHistoryBoundaryError || managedError instanceof UnmanagedOverWindowError || managedError instanceof DegradedPassRefusalError) {`,
  count: 1,
}
const THROWN = {
  find: "const timedTransform = (input, output) => withTransformTimingSummary(() => transform(input, output));",
  replace:
    "const timedTransform = (input, output) => withTransformTimingSummary(() => transform(input, output)).catch((error) => { " +
    `${MARK} if (error instanceof EmergencyFailClosedError) loadedSessions.delete(findSessionId(output.messages)); throw error; });`,
  count: 1,
}
/**
 * 0.49.37 refactored the same site into an `async` wrapper with an explicit catch, so the outer
 * arrow no longer exists. The nearest anchor is now the pass-permission callback, 295 characters
 * before the catch in both bundles (it was 88 before the one-line arrow in 0.49.35).
 */
const THROWN_0_49_37 = {
  find: [
    "      if (sessionId && !deps.compactionOff && error instanceof EmergencyFailClosedError)",
    "        recordUsageRefusal(deps.db, sessionId);",
    "      throw error;",
  ].join("\n"),
  replace: [
    "      if (sessionId && !deps.compactionOff && error instanceof EmergencyFailClosedError) {",
    `        loadedSessions.delete(sessionId); ${MARK}`,
    "        recordUsageRefusal(deps.db, sessionId);",
    "      }",
    "      throw error;",
  ].join("\n"),
  count: 1,
}
const ABORTED = {
  find: "sessionLog2(sessionId, `EMERGENCY: fail-closed (reason=",
  replace: `loadedSessions.delete(sessionId); ${MARK} sessionLog2(sessionId, \`EMERGENCY: fail-closed (reason=`,
  count: 1,
}

const TRANSFORM = [WAIT, STATUS, THROWN, ABORTED]
const TRANSFORM_0_49_37 = [WAIT, STATUS, THROWN_0_49_37, ABORTED]

export const refusalRecovery: PatchDefinition = {
  id: "refusal-recovery",
  title: "a refused turn waits historian_timeout_ms, says why, and does not refuse the next turn",
  reason:
    "The historian wait is clamped to 60 s, EmergencyFailClosedError shows no message, and the stale usage reading that caused a refusal refuses every later turn until a restart.",
  evidence: "docs/reference/2026-11-02-23-06-magic-context-0.49.35-refusal-patches.md",
  // In 0.49.35 each hit sits 143 (wait), 311 (status), 247 (toast), 88 (thrown) and 208 (aborted)
  // characters after its anchor, in exactly two files per site. From 0.49.37 the thrown refusal sits
  // 295 characters after the pass-permission callback and uses its own shape; from 0.49.46 two
  // host-checkpoint lines in the same catch push that distance to 526, so its window is 600. Every
  // other distance is unchanged through 0.49.56; from 0.49.53 the anchor has no trailing semicolon.
  matcher: {
    directory: "dist",
    extension: ".js",
    sites: [
      { name: "historian wait", files: 2, shapes: [WAIT], anchor: "function resolveHistorianInlineJoinBudget(configuredTimeoutMs) {", window: 200 },
      { name: "historian status", files: 2, shapes: [STATUS], anchor: "activeRun.notificationSent = true;", window: 400 },
      { name: "refusal toast", files: 2, shapes: [TOAST], anchor: "const managedError = !compactionOff && !isBlockingV2TransformError(error)", window: 300 },
      {
        name: "thrown refusal",
        files: 2,
        shapes: [THROWN, THROWN_0_49_37],
        anchor: "deps.onPassPermission?.(sessionId, postTransformResult.prefixMutationPermitted)",
        window: 600,
      },
      { name: "aborted refusal", files: 2, shapes: [ABORTED], anchor: "clearEmergencyDropSample(db, sessionId);", window: 300 },
    ],
  },
  releases: [
    {
      version: "0.49.35",
      files: [
        { path: "dist/context-fk8e3h9p.js", before: "1798cab25fcb4861a362a93fba629cf7f4eebd1bfc11bd5c2c0f63821a503014", after: "1ad5f850845b1282d6c89ef83a6e8cb69f87e2556d5994de171b51967c0b32fd", replacements: [TOAST] },
        { path: "dist/index-b6xz3qbe.js", before: "c5159a3b8f8de65e14ed3c99711cfcaac8ef249da1ef83172aa1ef71d82845a3", after: "4be26c8d9b497445acf8aeed7a5b8c5dd32747c62e4664a91d1851963fc0315b", replacements: TRANSFORM },
        {
          path: "dist/v2/context-znqfkap4.js",
          before: "34de2ef127ebb0c6e40a82a3f461d08db561acfdef6611ede767c7dcb04d0f17",
          after: "0d41b21bc543324b1c08b1b19a99c36a0bc1f97b10fb1a095dc4db6c7059fdb2",
          replacements: [WAIT, STATUS, TOAST, THROWN, ABORTED],
        },
      ],
    },
    {
      version: "0.49.41",
      files: [
        {
          path: "dist/context-3szg46w6.js",
          before: "a57cbdc0dc6b0ddbf22d001d6d7605b40845145d54636dd9236202b6cb794946",
          after: "109d4fa9f87b670a2d7c36b482dd2bb2d16b19db13d1fc78af0a6b9f6e77b204",
          replacements: [TOAST],
        },
        {
          path: "dist/index-216tae7b.js",
          before: "9a2f5ae50b881f7b925a337a9c9869dc7cee9c82b03ed2800b1a8f1d159d4bb9",
          after: "00b25a12595f598dea4f5fa482ecf1770ea9ea931355b7dca7ec9c377f64adb7",
          replacements: TRANSFORM_0_49_37,
        },
        {
          path: "dist/v2/context-eq5bhf40.js",
          before: "1c62c2179fc716da09a782cda31a6b01af65e8a50a49cd9a6b943d7a4a5a02a0",
          after: "ef0699aa454f496d558c08e20e5099bdc816f8a803e0d513f87257d6cfd1fa06",
          replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
        },
      ],
    },
    {
      version: "0.49.42",
      files: [
        {
          path: "dist/context-zf1yj1g0.js",
          before: "6b49a52fe569c0c3616b5dd854102f0140851ce741727b0b42950ab88bcd2f48",
          after: "da58a40c8bb727ea9c4ef32f9fd02cda36de7463d6bf5e13fcf59e301c557cb0",
          replacements: [TOAST],
        },
        {
          path: "dist/index-adt3jghq.js",
          before: "0ef48d3d8819e467d5fb8162d2408c4dd9dd0970c2c6f44f03f5d116c1e39167",
          after: "fccc1f383d385188b3e4d66a65d787808900a35b2786fc9f36abe414eaab8ad9",
          replacements: TRANSFORM_0_49_37,
        },
        {
          path: "dist/v2/context-2xr6vbt2.js",
          before: "995c25e7e5e3cfa023f4f1956d3eaf197b594b64c32d3b25ea334dbf4e9a981d",
          after: "a06da2de0ab6b954081cdfa418ece7dc18f612af1cf10f018754b702c5c7e514",
          replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
        },
      ],
    },
    {
      version: "0.49.43",
      files: [
        {
          path: "dist/context-zf1yj1g0.js",
          before: "6b49a52fe569c0c3616b5dd854102f0140851ce741727b0b42950ab88bcd2f48",
          after: "da58a40c8bb727ea9c4ef32f9fd02cda36de7463d6bf5e13fcf59e301c557cb0",
          replacements: [TOAST],
        },
        {
          path: "dist/index-adt3jghq.js",
          before: "0ef48d3d8819e467d5fb8162d2408c4dd9dd0970c2c6f44f03f5d116c1e39167",
          after: "fccc1f383d385188b3e4d66a65d787808900a35b2786fc9f36abe414eaab8ad9",
          replacements: TRANSFORM_0_49_37,
        },
        {
          path: "dist/v2/context-2xr6vbt2.js",
          before: "995c25e7e5e3cfa023f4f1956d3eaf197b594b64c32d3b25ea334dbf4e9a981d",
          after: "a06da2de0ab6b954081cdfa418ece7dc18f612af1cf10f018754b702c5c7e514",
          replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
        },
      ],
    },
    {
      version: "0.49.50",
      files: [
        {
          path: "dist/context-4js5qnnm.js",
          before: "cdf4b1937b27f08871109ef5858f0fe128c94b5c993c9106ef63f544af9a6f39",
          after: "026a90661806373d5e45281a723990ad0fcc11ebc4f494a9f19d0bdf41b3d4ce",
          replacements: [TOAST],
        },
        {
          path: "dist/index-5g6npyw5.js",
          before: "6c5f4d8c74d828b1a9e5d13fdefe18dfab8ec18b67a98f8b1cf501c721dd1b2b",
          after: "1f29585356d342f57bf19b182fb150331bd62a57458c0f0241eb34bb0649ad3b",
          replacements: TRANSFORM_0_49_37,
        },
        {
          path: "dist/v2/context-qkr7z6d0.js",
          before: "32fe4c930bc7d826cc70c72edb85903e7cf855fdc3d7d73827e56012a6dfe865",
          after: "6da832951427fc690c7578c18bd3bba0939b243f013846731ce3b5c08b6a1215",
          replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
        },
      ],
    },
    {
      version: "0.49.55",
      files: [
        {
          path: "dist/context-vx5gw5h2.js",
          before: "c823d597e3a77b6fad65a3abd84cff5c2bdeb682abd3c1b28627616fcab199be",
          after: "d8341aa4bec1aa9e4fae20b97c04efb439e64e3e3e7d158008f159a91088bee1",
          replacements: [TOAST],
        },
        {
          path: "dist/index-9n6mdfqy.js",
          before: "7db8dc192cde5844da8f8f33099b581135a5d5f5d675f6295ae5c578028f8dc6",
          after: "ec952e375c4e09c615cbf72fb35c48f3a5a4f323773db65921463e958483154d",
          replacements: TRANSFORM_0_49_37,
        },
        {
          path: "dist/v2/context-13er940g.js",
          before: "920df7ec2001e6606cec82dc5232fb6ac1a062f88b292828f049b352199addf8",
          after: "eaca32401cee439451748e23315d5fbe081523b610e4b1811fb96163fab15baf",
          replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
        },
      ],
    },
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
    {
      version: "0.49.63",
      files: [
        {
          path: "dist/context-aaht09yh.js",
          before: "d4da7c68297c590d4fa9b4f7f5432d043ef53dd5cb903dba841d154d9955fa2d",
          after: "53ad471b5aecdad7e2cf07b42c6c52604123d9c9a0f9d6b9ed6b9017cc4f1a66",
          replacements: [TOAST],
        },
        {
          path: "dist/index-bqd5dmm4.js",
          before: "8adbf832d97c6666ad301f5a451d93bb9454baee7f397f243d9335746ee5cd7a",
          after: "fe32df07ccb68565e7449999b17bf0f9b00985dc8fbb1922e78d443b2e9be601",
          replacements: TRANSFORM_0_49_37,
        },
        {
          path: "dist/v2/context-hk9x7ngz.js",
          before: "2855791409dfb52216abcb66c3d52f337a45037e4708a02588122decdbffc1f4",
          after: "3e22172353e017f71c9324f6378f66168fd935a092d28a05d4621288cf21e000",
          replacements: [WAIT, STATUS, TOAST, THROWN_0_49_37, ABORTED],
        },
      ],
    },
  ],
}
