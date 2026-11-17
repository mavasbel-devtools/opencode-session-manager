# Magic Context 0.49.7 test fixture

The two JavaScript files under `dist/` are unmodified copies of the files of the same paths in the
published npm package `@cortexkit/opencode-magic-context@0.49.7`
(`cortexkit-opencode-magic-context-0.49.7.tgz`, integrity
`sha512-dnvLs+YRidxchyjuu/slNlGPkvzuuucRJ1qisCFBzA+s3XgzvsGKiiD6ob05oqThLSLHZW834Gd1nn8qP194Ew==`,
obtained with `npm pack @cortexkit/opencode-magic-context@0.49.7` on 2026-10-16).

| File | sha256 |
|---|---|
| `dist/v2/server-cw6521wn.js` | `4a69e2a3d21c72e39dc1e9a2547e6a0a753feba4af3a92279a46ac58b9bb1337` |
| `dist/index-k6xvbj2e.js` | `21f82c8cb19b7b2552827edf2837144e167e10cc098662f8bfbf1f2b2fd4d976` |

Both files are byte-identical to the 0.49.2 fixture (same names, same checksums).

`package.json` here is reduced to the three fields the tool reads (`name`, `version`, `license`).

Magic Context is published under the MIT License (the package's `license` field), by CortexKit
(https://github.com/cortexkit/magic-context). The copies are here only so the tests run the patch
against the real files.
