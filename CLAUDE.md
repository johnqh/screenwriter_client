# screenwriter_client

Frontend network client library for Fadewright (`screenwriter_api`). Slice F1 of `../screenwriter_plans/plans/2026-09-20-frontend-mvp.md`. Local package: no publishing, no versions, no CI workflow. Consumers import it by path (`tsconfig` `paths` + Vite alias to `../screenwriter_client/src/index.ts`).

## Tech stack

Bun, TypeScript (ESM, `moduleResolution: bundler`), Yjs (V2 encoding), `@tanstack/react-query` v5 and `react` as peer deps, Vitest. Platform-free: global `fetch` and `WebSocket` only, no Node built-ins in `src/` (tests use `node:child_process`).

## Structure

```
src/
  index.ts            barrel
  errors/             ApiError (code, status, details), RoleInsufficientError, ShareLinkExpiredError, isApiError
  network/            NetworkClient interface + createFetchNetworkClient (the only fetch call), retry.ts (policy, gzip, idempotency keys);
                      ScreenwriterClient (typed method per route) + API_ROUTE_METHODS (route -> method map)
  hooks/              query-keys.ts (central factory), query-config.ts, client-context.ts (Provider + useScreenwriterClient),
                      one hook file per resource group (account, projects, documents, scenes, templates, versions, snapshots, import-export, ai, api-keys, sharing, jobs)
  sync/               SyncClient (framework-free), awareness.ts (JSON relay format + RemoteAwareness), backoff.ts
tests/                contract, backoff/awareness units, hooks (fake network), integration (spawns the real API)
```

## Commands

- `bun install`
- `bun run typecheck` (`bunx tsc --noEmit`)
- `bunx vitest run` (never `bun test`). `tests/integration.test.ts` and `tests/sharing-integration.test.ts` spawn `bun run src/index.ts` in `../screenwriter_api` on a random port with `AI_TEST_MODE=1` and `DATABASE_URL=postgres://localhost:5432/screenwriter_test`. Needs local Postgres with that DB (`bun run db:init` in the api creates tables; the API also does it at boot). Vitest runs on Node 22+, which has a global `WebSocket`.

## Patterns

- **DI**: `ScreenwriterClient({network, baseUrl, getToken})`. `baseUrl` is the origin (no `/api/v1`). `getToken(forceRefresh)` is retried once with `true` after a 401. Envelope `data` is unwrapped; failures throw `ApiError` (`code` is an API error code or `NETWORK_ERROR`/`BAD_RESPONSE`).
- **Route contract**: `API_ROUTE_METHODS` is a `Record<ApiRouteName, method | null>`; a new route in `screenwriter_types` fails typecheck until mapped, and `tests/contract.test.ts` allows `null` only for `jobWebhook` (a server-to-server, HMAC route no client calls): full parity otherwise, every route the API declares has a client method. Add the method, its hook and its query key in the same change as the route.
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

`getAiStatus` (`GET /ai/status`: `{available, mode: live|fixture|unavailable}`), `startAiJob`, `listAiJobs`, `getAiJob`, `cancelAiJob`, `listSuggestionSets`, `getSuggestionSet`, `acceptSuggestions` (409 `CONTENT_CHANGED` with `details.suggestionIds` is an `ApiError`), `rejectSuggestions`. Hooks in `hooks/use-ai.ts`: `useAiStatus`, `useStartAiJob`, `useAiJob(jobId)` (polls 1.5 s while queued/running), `useAiJobs`, `useCancelAiJob`, `useSuggestionSets`, `useSuggestionSet`, `useAcceptSuggestions`, `useRejectSuggestions`. ## Commands and scene reads

`applyCommands(did, {commands, baseEpoch, expectedHashes?, dryRun?})` (409 `EPOCH_MISMATCH` / `CONTENT_CHANGED` are `ApiError`s; `details.ids` lists stale ids), `getOutline`, `getScene`, `getScenes(did, sceneIds)` (max 20), `getElements(did, elementIds)` (max 500). Hooks in `hooks/use-scenes.ts`: `useOutline`, `useScene`, `useScenes`, `useElements` (all `staleTime: 0`; idle without inputs) and `useApplyCommands(did)` (a real batch invalidates `queryKeys.documentFamily(did)`; a `dryRun` invalidates nothing). An open editor writes through its own Y.Doc, not this route: it is for panels, bulk tools and scripts that hold no replica.

## Tenancy, roles, sharing (B8)

- **Methods** (one per route, plus dispatchers): `createWorkspace|updateWorkspace|deleteWorkspace(wid, confirmName)|transferWorkspace|leaveWorkspace|getWorkspaceUsage|downloadWorkspaceAudit` (CSV text), `listMembers|updateMemberRole|removeMember`, `inviteToWorkspace|inviteToProject|inviteToDocument` (dispatcher `inviteMember(target, body)`), `listWorkspaceInvitations|listMyInvitations|renewInvitation|cancelInvitation|acceptInvitation(token)|declineInvitation`, `listSharedWithMe`, `lockDocument|unlockDocument|createUnlockSession`, `listDocumentGrants|listProjectGrants` (`listGrants(target)`), `updateGrant|removeGrant`, `createDocumentShareLink|createProjectShareLink|createSnapshotShareLink` (`createShareLink(target, body)`), `listDocumentShareLinks|listProjectShareLinks` (`listShareLinks(target)`), `updateShareLink|revokeShareLink`, public `resolveShareLink(token)` (sent with NO Authorization), `unlockShareLink(token, password?)` (sends the user's token if signed in: a comment session needs it), `getSharedState(token, {linkSession?, documentId?})`. The dispatchers are extras: `API_ROUTE_METHODS` maps each route to its own method (the contract test wants unique methods).
- **Credentials**: `send(..., auth)` with `AuthMode` `"user"` (default, retried once on 401), `"none"`, `{bearer}` (a `linkSession`, never retried with a user token). Public share methods use `none`/`bearer` so they work signed out.
- **Typed errors** (`apiErrorFrom` in `errors/`): `RoleInsufficientError` (403 `FORBIDDEN` whose `details.requiredRole` is set; `.requiredRole`, `.role`, `.permission`) and `ShareLinkExpiredError` (404 `SHARE_LINK_INVALID`; `.reason` `unknown|revoked|expired|unavailable|session`); both extend `ApiError`. A 403 without `requiredRole` (e.g. "you need access" on a restricted link, a read-only key) stays a plain `ApiError`.
- **Unlock sessions**: `createUnlockSession(did)` stores the token; every request to `/documents/<did>/...` then sends `X-Doc-Unlock`. `setDocumentUnlock|getDocumentUnlock` manage it by hand; for the socket pass `getUnlockToken` to `SyncClient` (one token per connection).
- **Hooks** (`hooks/use-sharing.ts`; keys under `queryKeys.sharing()` so one invalidation refreshes a Share dialog; public link reads under `queryKeys.shareLink(token)`): `useMembers`, `useWorkspaceInvitations`, `useMyInvitations`, `useSharedWithMe`, `useGrants(target)`, `useShareLinks(target)`, `useShareLink(token)` (no auth header, no retry on 4xx), `useSharedState`, `useWorkspaceUsage`, and mutations for everything above (`useUpdateMemberRole`, `useRemoveMember`, `useInviteMember({target, body})`, `useAcceptInvitation`, `useCreateShareLink({target, body})` (one-time token: `reset()` after copying), `useUpdateShareLink`, `useRevokeShareLink`, `useShareUnlock(token)`, `useCreateUnlockSession(did)`, ...). Role, membership and accept mutations also invalidate workspaces, projects and documents.
- **Sync**: `SyncClient` `scheme: "link"` (`getToken` returns a `linkSession`, re-sent every 10 min; a revoked link gives `authError LINK_EXPIRED` then close 4401) and `roleChanged` now really arrives (`{documentId, role, markPermissions}`; `role: "none"` is followed by close 4403 = `stopped`). A viewer subscribed in `edit` mode simply has its updates rejected (`rejected` event, code `FORBIDDEN`): read `role` from `roleChanged`/REST and disable editing.
- Tests: `tests/sharing.test.tsx` (fake network), `tests/sharing-integration.test.ts` (real API; reads invitation tokens from the API's dev outbox `INVITATION_OUTBOX_FILE`, cleans up through the API's `postgres`).

## Request funnel, jobs (B9)

- **Funnel** (`ScreenwriterClient.send`, `network/retry.ts`): builds headers (token, `X-Client` from `ClientOptions.clientTag`, `X-Doc-Unlock`, **`Idempotency-Key` on every POST** except `/export`, `/documents/import`, `/(elements|scenes)/batch` and share unlock; one UUID per logical call via `newIdempotencyKey`, reused by every retry), **gzips JSON bodies >= 1 KiB** when `CompressionStream` exists (`Content-Encoding: gzip`; `gzip: false` turns it off; `NetworkRequest.body` is `string | Uint8Array`, `readRequestBody(req)` decodes it in fakes), refreshes the token once on 401 (not a retry attempt), then applies the **retry policy** of spec 10 §2.4 (`ClientOptions.retry`: `false` or a partial `RetryPolicy`): 3 attempts, base 400 ms, cap 8 s, full jitter, `Retry-After` overrides on 429/503 (cap 60 s); retried = no response, 408, 429 `RATE_LIMITED`, 502, 503 (except the "not configured" codes `CONFIG_MISSING`, `AI_UNAVAILABLE`, `STORAGE_UNAVAILABLE`, `GRAMMAR_UNAVAILABLE`, `OCR_UNAVAILABLE`), 504; GET/PUT/DELETE always, POST only with a key, PATCH never; 4xx, `QUOTA_EXCEEDED` never. Tests inject `retry: {sleep, random}` and `newIdempotencyKey`. React Query's own retry stays off in the app's hooks; retry lives here.
- **Errors**: `RateLimitedError` (`retryAfterS`, `bucket`; `Retry-After` is copied into `details.retryAfterS`), `PayloadTooLargeError` (413 `PAYLOAD_TOO_LARGE|IMPORT_TOO_LARGE|ASSET_TOO_LARGE`), `JobKindDisabledError` (501, `.kind`), plus `isRateLimited|isPayloadTooLarge|isJobKindDisabled`.
- **Jobs**: `listJobs({documentId?, kind?, status?, cursor?, limit?})`, `getJob(id, {wait?})` (long-poll, seconds <= 120), `createJob({kind, input, sources, idempotencyKey?, dryRun?})` (202; sends the key as header AND body field so the replay works past the 24 h header window; `dryRun: true` returns `{estimate}`), `cancelJob`, `getJobOutputs` (`data:` URL for inline outputs, signed URL later), `listJobRecipients`. AI jobs stay on `startAiJob`/`getAiJob`; the same job is also readable through `getJob` (D21a). Hooks in `hooks/use-jobs.ts`, keys under `queryKeys.jobs()`: `useJobs(query)`, `useJob(id)` (polls 1 s for the first 30 reads, then 5 s, stops when terminal: `jobPollInterval`), `useJobOutputs(id, enabled)`, `useJobRecipients`, `useCreateJob`, `useCancelJob`.
- Tests: `tests/jobs.test.tsx` (fake network: funnel, retry, hooks), `tests/jobs-integration.test.ts` (spawns two real APIs: lost-response retry creates one job, gzip, typed errors, rate limit with `Retry-After`, AI mirror).

## Single Yjs (important)

`yjs` and `lib0` resolve to `../writing_core/node_modules/` through a two-entry `paths` mapping (extensionless `dist/yjs` first so Bun loads `yjs.mjs`, then the directory for types). `vitest.config.ts` mirrors it as aliases; keep both in sync. The integration test decodes API bytes with this repo's own `yjs` import to prove one instance. Same recipe as `screenwriter_api/CLAUDE.md`.

## Gotchas

- Do not import `y-protocols`; awareness is our own JSON relay.
- Do not write another frame codec: `encodeFrame`/`decodeFrame` come from `@sudobility/screenwriter_types`.
- Server does not replay awareness on subscribe; the client introduces itself to each newly seen peer.

## Related

`../screenwriter_types` (shared types + codec), `../screenwriter_api` (server), `../screenwriter_lib` (F2, will consume this), `../sudojo_client` (convention reference).
