# Verbatim OpenCode 2.0.14 host sources

These files are **unmodified copies** of host sources, used so the live tier runs the host's own
code instead of a re-implementation of its rules. They are never edited; they are re-extracted.

| File | Origin (tag `v2.0.14`, commit `8864eb507e4111f5e8b50a48d10f77d8d7cc8c62`) | Bytes | SHA-256 |
|---|---|---|---|
| `structure.ts` | `packages/tui/src/plugin/structure.ts` | 6279 | `14513c9decc897c137a3712de389bbb779ddeaac0c7e12c6669838940e52e753` |

`structure.ts` is the host's slot-placement resolver (`resolveSlots`, `contains`). It has zero
imports — no Solid, no I/O — which is why it can be loaded in-process. `tests/live` feeds this
plugin's real slot claim through it to prove the line lands in the `prepend` bucket of
`sidebar.content` under the host's real policy.

Re-extract with (LF preserved, byte-identical):

```
git -C <opencode checkout> show v2.0.14:packages/tui/src/plugin/structure.ts > structure.ts
```

`tests/unit/architecture/host-fixtures.test.ts` fails if the bytes or the hash change, so an
accidental edit cannot pass unnoticed.
