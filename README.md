# @sudobility/screenwriter_client

Network client for the Fadewright screenwriting app: a typed REST wrapper over an injected `NetworkClient`, react-query hooks, and a framework-free Yjs sync client for the `screenwriter_api` WebSocket.

Local package (not published). Import by path; see `CLAUDE.md` for the tsconfig `paths` needed, including the single-Yjs mapping.

## Usage

```ts
import * as Y from "yjs";
import { createFetchNetworkClient, ScreenwriterClient, SyncClient } from "@sudobility/screenwriter_client";

const getToken = async () => "dev:u1:a@b.co"; // Firebase ID token in production
const api = new ScreenwriterClient({ network: createFetchNetworkClient(), baseUrl: "http://localhost:8042", getToken });

const me = await api.me();
const project = await api.createProject(me.personalWorkspaceId, { name: "My film" });
const doc = await api.createDocument(project.id, { title: "Pilot", kind: "script" });

const sync = new SyncClient({ url: api.syncUrl(), getToken });
const ydoc = new Y.Doc();
const sub = sync.subscribe(doc.id, ydoc, { epoch: doc.epoch });
sync.on("epochChanged", ({ documentId, liveEpoch }) => { /* rebase: resubscribe with a fresh doc */ });
sub.setLocalAwareness({ name: "Ann" });
```

React: wrap in `QueryClientProvider` and `<ScreenwriterClientProvider client={api}>`, then use `useProjects`, `useCreateProject`, `useDocument`, `useSnapshots`, ...

## API summary

- `ScreenwriterClient`: one method per served route (me, workspaces, projects, documents incl. `getDocumentState` bytes, templates, versions, snapshots). Throws `ApiError`.
- Hooks: `useMe`, `useWorkspaces`, `useProjects`, `useCreateProject`, `useDocuments`, `useCreateDocument`, `useTemplates`, `useVersions`, `useSnapshots`, `useOpenSnapshot`, ... with `queryKeys`.
- `SyncClient`: `connect`, `subscribe`, `unsubscribe`, `disconnect`, `on(...)`, awareness relay, reconnect with backoff, epoch-change reporting.

## Development

```bash
bun install
bun run typecheck
bunx vitest run   # integration tests spawn ../screenwriter_api against the local screenwriter_test database
```

## License

BUSL-1.1
