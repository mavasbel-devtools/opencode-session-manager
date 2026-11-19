import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"

/**
 * Lets `execute_threshold_percentage` go below 20.
 *
 * Magic Context's configuration schema accepts 20–90 (`z.number().min(20).max(90, …)`, three times:
 * a plain number, the `default` key and per-model keys). A value outside it is rejected with
 * "config reload failed … invalid value (number 13), using default 65". The code that uses the
 * threshold has no lower bound: `resolveExecuteThresholdDetail` only caps it at 90 and the proactive
 * historian trigger is the threshold minus 2. So lowering the schema minimum to 1 is enough for a
 * configured 13 to be used as 13. Evidence: docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md.
 *
 * The 0.47.0 checksums: `before` equals the files in the published npm tarball
 * (@cortexkit/opencode-magic-context-0.47.0.tgz, sha512-ei7HuwbU…ffVvNw==) and the installed copy;
 * `after` is that file with the three replacements made. 0.48.0 (sha512-A0A2emS5…iANs+Q==): the same
 * three places in its two files, and the same runtime without a lower bound; evidence:
 * docs/reference/2026-10-12-15-13-magic-context-0.48.0-execute-threshold.md. 0.49.0
 * (sha512-y1AtvSLM…u14Hzow==): the OpenCode 2 file is byte-identical to 0.48.0's, the OpenCode 1 file
 * is rebuilt with the same three places, and the runtime is unchanged; evidence:
 * docs/reference/2026-10-12-23-15-magic-context-0.49.0-execute-threshold.md. 0.49.2
 * (sha512-K/qpYOF0…ZMwd9oA==): both files are rebuilt under new names with the same three places, and
 * the runtime is unchanged; evidence: docs/reference/2026-10-14-22-08-magic-context-0.49.2-execute-threshold.md.
 * 0.49.7 (sha512-dnvLs+YR…qP194Ew==): both files are byte-identical to 0.49.2's (same names, same
 * checksums) and the runtime is unchanged; evidence:
 * docs/reference/2026-10-16-17-03-magic-context-0.49.7-execute-threshold.md.
 * 0.49.12 (sha512-y6hmByPA…AKSCEQ==): both files are rebuilt under new names with the same three
 * places, and the threshold runtime is unchanged; evidence:
 * docs/reference/2026-10-18-11-42-magic-context-0.49.12-execute-threshold.md.
 * 0.49.13 (sha512-cIz9hhZ2…AsZQow==): both files are byte-identical to 0.49.12's (same names, same
 * checksums) and the threshold runtime is unchanged; evidence:
 * docs/reference/2026-10-19-16-03-magic-context-0.49.13-execute-threshold.md.
 * 0.49.15 (sha512-p5sr6sym…SE3lhg==): both files are byte-identical to 0.49.13's (same names, same
 * checksums) and the threshold runtime is unchanged; evidence:
 * docs/reference/2026-10-20-20-57-magic-context-0.49.15-execute-threshold.md.
 * 0.49.19 (sha512-VZpV1voW…VkD9xw==): both files are rebuilt under new names with the same three
 * places, and the threshold runtime is unchanged; evidence:
 * docs/reference/2026-10-22-23-00-magic-context-0.49.19-patches.md.
 * 0.49.35 (sha512-QbvlV5Bl…f6KKA==): both files are rebuilt under new names with the same three
 * places, and the threshold runtime is unchanged; evidence:
 * docs/reference/2026-11-02-06-30-magic-context-0.49.35-patches.md.
 * 0.49.41 (sha512-MTzXgCZk…LobwA==): both files are byte-identical to 0.49.40's (same names, same
 * checksums) with the same three places; evidence:
 * docs/reference/2026-11-07-23-41-magic-context-0.49.41-patches.md.
 *
 * 0.49.42 (sha512-uroOPFQ6…ccbGQ==) and 0.49.43 (sha512-JpXEEyXI…Hv9Igg==): both files are byte-identical
 * to 0.49.41's, same names, same checksums, same three places; `src/` is unchanged since 0.49.41, so the
 * two releases are rebuilds. Evidence: docs/reference/2026-11-08-10-45-magic-context-0.49.42-0.49.43-patches.md.
 * 0.49.50 (sha512-RYF7ydrf…J85g==): the two bundles were rebuilt again (`dist/index-jjy5a5w0.js`,
 * `dist/v2/server-0ms13pc8.js`); the text and its count are unchanged. Evidence:
 * docs/reference/2026-11-11-01-24-magic-context-0.49.46-0.49.50-patches.md.
 *
 * 0.49.55 (sha512-LqyhQ7hN…SjA7oQ==): `dist/index-6nqz8hsz.js`, `dist/v2/server-rz6g5xne.js`; text, counts and anchors as in
 * 0.49.50. Evidence: docs/reference/2026-11-14-18-33-magic-context-0.49.51-0.49.55-patches.md.
 *
 * 0.49.56 (sha512-hUfmVxV3…46bEyw==): the same two files, byte-identical to 0.49.55's; text, counts and
 * anchors unchanged. Evidence: docs/reference/2026-11-15-21-01-magic-context-0.49.56-patches.md.
 *
 * 0.49.63 (sha512-A4ezV8dr…Lu9A==): `dist/index-6nqz8hsz.js` and `dist/v2/server-rz6g5xne.js`, byte-identical to
 * 0.49.56's; text, counts and anchors unchanged. Evidence:
 * docs/reference/2026-11-19-19-04-magic-context-0.49.63-patches.md.
 */
export const executeThresholdMin: PatchDefinition = {
  id: "execute-threshold-min",
  title: "execute_threshold_percentage accepts values from 1 instead of 20",
  reason: "The schema minimum of 20 rejects a configured 13; the runtime has no lower bound, so the minimum is lowered to 1.",
  evidence: "docs/reference/2026-10-11-19-37-magic-context-0.47.0-execute-threshold.md",
  // In every checked release (0.47.0 … 0.49.41) the three hits sit 52, 132 and 201 characters after
  // `execute_threshold_percentage`, in exactly two bundles: the OpenCode 1 and the OpenCode 2 server.
  matcher: {
    directory: "dist",
    extension: ".js",
    sites: [
      {
        name: "schema minimum",
        files: 2,
        shapes: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        anchor: "execute_threshold_percentage",
        window: 300,
      },
    ],
  },
  releases: [
    {
      version: "0.47.0",
      files: [
        {
          path: "dist/v2/server-50hvkg3v.js",
          before: "dd36bd4a24181727645ec0267ef1d67c657865cd914d842c9739eaecbabbb105",
          after: "58cb9f82d7f3e8c993b37b992c1af4c0f4727c077ef32eb8db71a26929ba373c",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-m5fe6jch.js",
          before: "6abe7e8c60c97bf35e9cf992ad9fe9936dc0557303a445a8c27859b47c94c3ba",
          after: "559226c00606568d810b30a6fa9e6cbf5ab0d1acdcbf443590a960588099c7ff",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.48.0",
      files: [
        {
          path: "dist/v2/server-zm570tr2.js",
          before: "65d3758954b2eec1494ba86e74c90b84ae3d14ccb8fd07044d2fd18e88a499bb",
          after: "eca9a54c95272292a1823fc222a1a496587b235e49001f21fed4de650d72d930",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-bhvjj0ys.js",
          before: "29a4766f76ca0626b7977e105f23b4beebd7c29b1ac9a4cb4aeb3f194976bcf6",
          after: "4bda57abe641e334c2dca1ce077ed84cef3dbbad968fa13d435b821586b8d0a5",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.0",
      files: [
        {
          path: "dist/v2/server-zm570tr2.js",
          before: "65d3758954b2eec1494ba86e74c90b84ae3d14ccb8fd07044d2fd18e88a499bb",
          after: "eca9a54c95272292a1823fc222a1a496587b235e49001f21fed4de650d72d930",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-kq57tdf0.js",
          before: "8e8e990341945d8cb235989caacfc4eb5709829d332f275bedf42e0b8889e32c",
          after: "20e439636a0ec5ccf3b86e24cbd1f948894b103b22ddeb668f5f2ad5bb655bd8",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.2",
      files: [
        {
          path: "dist/v2/server-cw6521wn.js",
          before: "4a69e2a3d21c72e39dc1e9a2547e6a0a753feba4af3a92279a46ac58b9bb1337",
          after: "b8efc88f59566ec6538aa93717cb55d624f6c1d7ce7f73cd7b802d999f958ad1",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-k6xvbj2e.js",
          before: "21f82c8cb19b7b2552827edf2837144e167e10cc098662f8bfbf1f2b2fd4d976",
          after: "535abb2ee865f6b9a3bd52b6869b4d88604a278a38c8f56b2961a7b933ad4143",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.7",
      files: [
        {
          path: "dist/v2/server-cw6521wn.js",
          before: "4a69e2a3d21c72e39dc1e9a2547e6a0a753feba4af3a92279a46ac58b9bb1337",
          after: "b8efc88f59566ec6538aa93717cb55d624f6c1d7ce7f73cd7b802d999f958ad1",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-k6xvbj2e.js",
          before: "21f82c8cb19b7b2552827edf2837144e167e10cc098662f8bfbf1f2b2fd4d976",
          after: "535abb2ee865f6b9a3bd52b6869b4d88604a278a38c8f56b2961a7b933ad4143",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.12",
      files: [
        {
          path: "dist/v2/server-th4y11y7.js",
          before: "356e368c866aac3082c6df21e12a560f48dec7ad564d948e175ce5e4f0ed7048",
          after: "5a72f0a29d267ca82e050e996893f7ae9cb92283e0b8c5a04acd989db6c5ddbb",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-1sarmj9z.js",
          before: "8b31320747c6f95a7d1aa33def6f970fd729d8c6f3e73fdb416d0ca37badad2e",
          after: "2f2dc54b9ff1103bbd53dd6a6b153e5d4fced745f7f246dce52c4d4027995f32",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.13",
      files: [
        {
          path: "dist/v2/server-th4y11y7.js",
          before: "356e368c866aac3082c6df21e12a560f48dec7ad564d948e175ce5e4f0ed7048",
          after: "5a72f0a29d267ca82e050e996893f7ae9cb92283e0b8c5a04acd989db6c5ddbb",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-1sarmj9z.js",
          before: "8b31320747c6f95a7d1aa33def6f970fd729d8c6f3e73fdb416d0ca37badad2e",
          after: "2f2dc54b9ff1103bbd53dd6a6b153e5d4fced745f7f246dce52c4d4027995f32",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.15",
      files: [
        {
          path: "dist/v2/server-th4y11y7.js",
          before: "356e368c866aac3082c6df21e12a560f48dec7ad564d948e175ce5e4f0ed7048",
          after: "5a72f0a29d267ca82e050e996893f7ae9cb92283e0b8c5a04acd989db6c5ddbb",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-1sarmj9z.js",
          before: "8b31320747c6f95a7d1aa33def6f970fd729d8c6f3e73fdb416d0ca37badad2e",
          after: "2f2dc54b9ff1103bbd53dd6a6b153e5d4fced745f7f246dce52c4d4027995f32",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.19",
      files: [
        {
          path: "dist/v2/server-271qxsf5.js",
          before: "1ee7a5e5d351304de3c9410663be804724d9f82570053a02fdb2037bcdbcbecf",
          after: "af1201b4c204ec3899b325dd4b67e0ddc0505fe54903d97bba605590dbdf5058",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-wgypt3cs.js",
          before: "b5a8258a252a53e531e5e352a0247c0c4cb07bef7b2c9815d0f4712ccc4b1b5a",
          after: "f43b582abce5704590819e546fd375e83c9b45360487a676239aa806fc09b407",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.35",
      files: [
        {
          path: "dist/v2/server-24g8r2d0.js",
          before: "ea1a00ed600dba637265ae8e8937222db7fd05e225020710f475de3a1a1af04f",
          after: "c4d784c1add87ff87f7fa010edab530d247ec624a42ef47416c70c17fbd65af2",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-nxrsns5x.js",
          before: "e8fa846851679adbc7f4f2a5dd5244d62f27cfca08fa8cb937fc3d5ad429ec58",
          after: "ba409e7721a4c799a85443c6907ca1d9d95d7e48d3ae1097842808ac147a6529",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.41",
      files: [
        {
          path: "dist/v2/server-7zacmty5.js",
          before: "1ab717d3e37d0d96f30672053e72c4e390c0b890cfbafdcbe4a8c089be7755ac",
          after: "76d97410991b256a39be33797effe12e9f87ff8252d05ec9fe27ce2abc9f77bf",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/index-c5dzns43.js",
          before: "e08252cb38e1786f0105f968c2f4473a92dd774066374cfd7b37da5ec3f43bb5",
          after: "9e884459af8bed4a7b064756a08c750e04dd45fe880750096778ee0afc14859d",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.42",
      files: [
        {
          path: "dist/index-c5dzns43.js",
          before: "e08252cb38e1786f0105f968c2f4473a92dd774066374cfd7b37da5ec3f43bb5",
          after: "9e884459af8bed4a7b064756a08c750e04dd45fe880750096778ee0afc14859d",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/v2/server-7zacmty5.js",
          before: "1ab717d3e37d0d96f30672053e72c4e390c0b890cfbafdcbe4a8c089be7755ac",
          after: "76d97410991b256a39be33797effe12e9f87ff8252d05ec9fe27ce2abc9f77bf",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.43",
      files: [
        {
          path: "dist/index-c5dzns43.js",
          before: "e08252cb38e1786f0105f968c2f4473a92dd774066374cfd7b37da5ec3f43bb5",
          after: "9e884459af8bed4a7b064756a08c750e04dd45fe880750096778ee0afc14859d",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/v2/server-7zacmty5.js",
          before: "1ab717d3e37d0d96f30672053e72c4e390c0b890cfbafdcbe4a8c089be7755ac",
          after: "76d97410991b256a39be33797effe12e9f87ff8252d05ec9fe27ce2abc9f77bf",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.50",
      files: [
        {
          path: "dist/index-jjy5a5w0.js",
          before: "768b2147a84e608ac119cd55bf87c3feccf2793c3763363d10622c3f109b67a4",
          after: "0cf779a38c8c21cdfe7e23239f6a9bb78b6b3008ebbab7950d93c1508d5980ae",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
        {
          path: "dist/v2/server-0ms13pc8.js",
          before: "fc5826990bc81ecc1a0e911ed1f315361fef10c86cbe321a1345759a89f0afa0",
          after: "30ed7116977d60154b5775b60c7b086d33d817c5f7bf958a3e9badbaccae7bb6",
          replacements: [{ find: "min(20).max(90", replace: "min(1).max(90", count: 3 }],
        },
      ],
    },
    {
      version: "0.49.55",
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
    {
      version: "0.49.63",
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
  ],
}
