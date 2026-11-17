# Repo note — restore session after reconnect (F3, plan Step 8.1)

- Plan: `~/Dev/docs/plans/2026-11-16-22-17-home-reset-fix.md`
- Product tree: `~/Dev/docs/design/2026-11-16-22-17-reconnect-restore-product-tree.md`
- Architecture tree: `~/Dev/docs/design/2026-11-16-22-17-reconnect-restore-architecture-tree.md`
- Upstream: [anomalyco/opencode#59542](https://github.com/anomalyco/opencode/issues/59542)

## Decision rules (domain, pure — plan Step 5.1)

1. Track `lastSession` while the route is a session route.
2. On session S → home at time t: trigger only if `t − lastConnected ≤
   WINDOW` (`10000` ms) **or** a `server.connected` arrives ≤ `WINDOW` after t
   (both orders); and S ∉ deleted; and `restores(S, last 60 s) <
   RESTORE_LIMIT` (3 per `RESTORE_WINDOW_MS` = `60000` ms).
3. Then `verify S` with `VERIFY_BACKOFF` (`500, 1000, 2000, 4000, 8000` ms,
   five attempts) while the route is still home: `exists` → navigate S +
   toast `Restored <session ID> after reconnect`; `missing` → nothing; all
   `failed` → one info toast (`Session restore skipped` / `Could not verify
   <session ID> after reconnect`), nothing.
4. Route leaves home during verify → abort (UC-R5N). Route session → session
   never triggers (UC-R7N).

## Where it lives

Pure trigger `decideRestore` in `src/domain/model/ReconnectRestore.ts`; async
loop in `src/application/RestoreAfterReconnectUseCase.ts` (reuses
`TimerPort`); inbound `src/infrastructure/adapters/inbound/tui/ReconnectRestoreV2Adapter.ts`
(250 ms poll); outbound
`src/infrastructure/adapters/outbound/tui/V2SessionNavigatorAdapter.ts`;
ports `src/domain/ports/inbound/RestoreAfterReconnectPort.ts` and
`src/domain/ports/outbound/SessionNavigatorPort.ts`; wiring in
`src/main/tui-container.ts` (`reconnectRestore`, never Herdr-gated) and
`src/main/v2/tui.ts`.
