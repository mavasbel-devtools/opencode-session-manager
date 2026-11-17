# Magic Context 0.49.42 test fixture

The JavaScript files under `dist/` are unmodified copies of the files of the same paths in the
published npm package `@cortexkit/opencode-magic-context@0.49.42`
(`cortexkit-opencode-magic-context-0.49.42.tgz`, integrity
`sha512-uroOPFQ6DMAWkZYWFRM34aEPWN3AAQo5kov06HUb7uo7zhZwKyqXEjsTUAFAlaD5powJqMc0Z2GnD7/xfccbGQ==`,
obtained with `npm pack @cortexkit/opencode-magic-context@0.49.42` on 2026-11-08).

| File | sha256 |
|---|---|
| `dist/index-c5dzns43.js` | `e08252cb38e1786f0105f968c2f4473a92dd774066374cfd7b37da5ec3f43bb5` |
| `dist/v2/server-7zacmty5.js` | `1ab717d3e37d0d96f30672053e72c4e390c0b890cfbafdcbe4a8c089be7755ac` |
| `dist/index-xmqj3cf5.js` | `b32c2d8643f3067c4b3889dad70a088ba75583040830cfeffdf1367710ab39a9` |
| `dist/v2/server-5ydn39x3.js` | `33661bf2b18d063b5469e7b1ea87d76e69f33f41d11fd4d59652f69cbe29fa67` |
| `dist/context-zf1yj1g0.js` | `6b49a52fe569c0c3616b5dd854102f0140851ce741727b0b42950ab88bcd2f48` |
| `dist/index-adt3jghq.js` | `0ef48d3d8819e467d5fb8162d2408c4dd9dd0970c2c6f44f03f5d116c1e39167` |
| `dist/v2/context-2xr6vbt2.js` | `995c25e7e5e3cfa023f4f1956d3eaf197b594b64c32d3b25ea334dbf4e9a981d` |

`package.json` here is reduced to the three fields the tool reads (`name`, `version`, `license`).

All seven files are byte-identical to 0.49.42's: `src/` did not change between 0.49.41 and 0.49.43,
so 0.49.43 is a rebuild of the same source with the version bumped (its `dist/index.js` and
`dist/v2/server.js` differ only by that string).
