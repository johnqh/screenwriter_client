# screenwriter_client

Frontend network client library for Fadewright (`screenwriter_api`). Slice F1 of `../screenwriter_plans/plans/2026-09-20-frontend-mvp.md`. Local package: no publishing, no versions, no CI workflow. Consumers import it by path (`tsconfig` `paths` + Vite alias to `../screenwriter_client/src/index.ts`).

## Tech stack

Bun, TypeScript (ESM, `moduleResolution: bundler`), Yjs (V2 encoding), `@tanstack/react-query` v5 and `react` as peer deps, Vitest. Platform-free: global `fetch` and `WebSocket` only, no Node built-ins in `src/` (tests use `node:child_process`).

## Structure

```
src/
  index.ts            barrel
  errors/             ApiError (code, status, details), isApiError
  network/            NetworkClient interface + createFetchNetworkClient (the only fetch call);
                      ScreenwriterClient (typed method per route) + API_ROUTE_METHODS (route -> method map)
  hooks/              query-keys.ts (central factory), query-config.ts, client-context.ts (Provider + useScreenwriterClient),
                      one hook file per resource group (account, projects, documents, templates, versions, snapshots, import-export)
  sync/               SyncClient (framework-free), awareness.ts (JSON relay format + RemoteAwareness), backoff.ts
tests/                contract, backoff/awareness units, hooks (fake network), integration (spawns the real API)
```

## Commands

- `bun install`
- `bun run typecheck` (`bunx tsc --noEmit`)
- `bunx vitest run` (never `bun test`). `tests/integration.test.ts` spawns `bun run src/index.ts` in `../screenwriter_api` on a random port with `AI_TEST_MODE=1` and `DATABASE_URL=postgres://localhost:5432/screenwriter_test`. Needs local Postgres with that DB (`bun run db:init` in the api creates tables; the API also does it at boot). Vitest runs on Node 22+, which has a global `WebSocket`.

## Patterns

- **DI**: `ScreenwriterClient({network, baseUrl, getToken})`. `baseUrl` is the origin (no `/api/v1`). `getToken(forceRefresh)` is retried once with `true` after a 401. Envelope `data` is unwrapped; failures throw `ApiError` (`code` is an API error code or `NETWORK_ERROR`/`BAD_RESPONSE`).
- **Route contract**: `API_ROUTE_METHODS` is a `Record<ApiRouteName, method | null>`; a new route in `screenwriter_types` fails typecheck until mapped. `null` = declared but not served (B5: commands/outline/scene).
- **Hooks** read the client from `<ScreenwriterClientProvider client>` (inside a `QueryClientProvider`). Keys come from `queryKeys`; mutations invalidate the affected lists/details (create project -> project lists; restore version / open snapshot -> whole document family).
- **Import/export**: `importDocument(pid, {filename, bytes|contentB64, ...})` base64s with `util/base64.ts` (btoa/atob, no `Buffer`); `exportDocument(did, format)` returns decoded `{filename, mimeType, bytes, report, format}`; `getFormats()`. Hooks `useFormats`, `useImportDocument(pid)` (invalidates document lists), `useExportDocument(did)`.
- **Binary state**: `getDocumentState`/`getSnapshotState`/`getVersionState` return `{state: Uint8Array (Yjs V2), epoch, stateVector}`.
- **SyncClient**: see the class doc. Events via `on(event, fn)`: `status`, `docStatus`, `epochChanged`, `authError`, `subscribeError`, `rejected`, `roleChanged`, `documentDeleted`, `stopped`, `closed`, `error`. Per-document handle: `status` (`syncing|synced`), `state` (`pending|active|stale|failed`), `unackedCount`, `setLocalAwareness`, `unsubscribe`.
  - Yjs frames are V2. Remote updates are applied with an internal origin; only non-remote-origin doc updates are sent.
  - Awareness payload is UTF-8 JSON `{clientId: doc.clientID, state}` (server relays opaque bytes). Remote peers expire after `awarenessTimeoutMs` (30 s); local state is re-broadcast at half that.
  - **Epoch changes are reported, not handled.** `epochChanged`, `subscribeError EPOCH_MISMATCH`, `reject EPOCH_MISMATCH` and close 4409 mark the document `stale`, emit `epochChanged({documentId, liveEpoch})` once (`liveEpoch` null if only 4409 was seen) and skip it on reconnect. The caller resumes by calling `subscribe` again with a new doc and epoch (rebase = screenwriter_lib).
  - Close codes: 4401 refresh token once then stop, 4403/4406 stop (`stopped` event), 4400 x3 in 10 min stop, 4429 backs off at least 5 s, 1001 honours `serverShutdown.reconnectAfterMs`, everything else full-jitter exponential backoff (attempt resets after a 60 s healthy connection). `online` event triggers an immediate reconnect.
  - The subprotocol is deliberately NOT offered: the API does not echo `fadewright-sync.v1`, and browsers fail a socket whose offered protocol is not selected.

## AI (B7)

`getAiStatus` (`GET /ai/status`: `{available, mode: live|fixture|unavailable}`), `startAiJob`, `listAiJobs`, `getAiJob`, `cancelAiJob`, `listSuggestionSets`, `getSuggestionSet`, `acceptSuggestions` (409 `CONTENT_CHANGED` with `details.suggestionIds` is an `ApiError`), `rejectSuggestions`. Hooks in `hooks/use-ai.ts`: `useAiStatus`, `useStartAiJob`, `useAiJob(jobId)` (polls 1.5 s while queued/running), `useAiJobs`, `useCancelAiJob`, `useSuggestionSets`, `useSuggestionSet`, `useAcceptSuggestions`, `useRejectSuggestions`. Routes the client does not wrap (commands, outline, scene, scenesBatch, elementsBatch, API keys) are `null` in `API_ROUTE_METHODS`.

## Single Yjs (important)

`yjs` and `lib0` resolve to `../writing_core/node_modules/` through a two-entry `paths` mapping (extensionless `dist/yjs` first so Bun loads `yjs.mjs`, then the directory for types). `vitest.config.ts` mirrors it as aliases; keep both in sync. The integration test decodes API bytes with this repo's own `yjs` import to prove one instance. Same recipe as `screenwriter_api/CLAUDE.md`.

## Gotchas

- Do not import `y-protocols`; awareness is our own JSON relay.
- Do not write another frame codec: `encodeFrame`/`decodeFrame` come from `@sudobility/screenwriter_types`.
- Server does not replay awareness on subscribe; the client introduces itself to each newly seen peer.

## Related

`../screenwriter_types` (shared types + codec), `../screenwriter_api` (server), `../screenwriter_lib` (F2, will consume this), `../sudojo_client` (convention reference).
