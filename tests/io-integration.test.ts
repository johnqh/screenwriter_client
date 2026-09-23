/**
 * B16 against the REAL screenwriter_api (spawned under Bun, dev auth, `screenwriter_test`), through the client: import as a job
 * (declare, PUT to the presigned URL over real HTTP, start), import-over, export jobs and their outputs, a batch for three
 * recipients (one file and one recoverable code each) and the leak lookup, typed errors, template import by `importId`.
 * There is no PDF writer, so the batch runs on Fountain; PDF export and PDF/OCR import are proven to refuse honestly.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import {
  ApiError,
  FormatUnsupportedError,
  OcrUnavailableError,
  ScreenwriterClient,
  UploadIncompleteError,
  WatermarkNotFoundError,
  createFetchNetworkClient,
  sha256Hex,
} from "../src";
import type { Job } from "@sudobility/screenwriter_types";
import postgres from "../../screenwriter_api/node_modules/postgres";

const API_DIR = new URL("../../screenwriter_api/", import.meta.url).pathname;
const PORT = 21300 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}`;
const DB_URL = "postgres://localhost:5432/screenwriter_test";
const RUN = Math.random().toString(36).slice(2, 7);
const U = (name: string) => `clb16-${RUN}-${name}`;
const mk = (uid: string) => new ScreenwriterClient({ network: createFetchNetworkClient(), baseUrl: BASE, getToken: async () => `dev:${uid}:${uid}@x.co`, clientTag: "web/test" });
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

const FOUNTAIN = `Title: Client Import

INT. HARBOUR - DAWN

Gulls circle the mast.

SAM
Cast off.
`;
const FDX = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5"><Content>
<Paragraph Type="Scene Heading"><Text>INT. LAB - DAY</Text></Paragraph>
<Paragraph Type="Action"><Text>Dust floats in the light.</Text></Paragraph>
</Content></FinalDraft>
`;

let server: ChildProcess | null = null;
const sql = () => postgres(DB_URL, { max: 1, onnotice: () => undefined });

async function until<T>(fn: () => Promise<T | false>, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error("timed out");
    await new Promise(r => setTimeout(r, 50));
  }
}
const finished = (c: ScreenwriterClient, job: Job) =>
  until(async () => {
    const j = await c.getJob(job.id);
    return j.status !== "queued" && j.status !== "running" ? j : false;
  });

beforeAll(async () => {
  server = spawn("bun", ["run", "src/index.ts"], {
    cwd: API_DIR,
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB_URL, PUBLIC_APP_URL: "http://localhost:5173", AI_TEST_MODE: "1", LOG_LEVEL: "error", JOB_POLL_MS: "50", NORMALIZE_DEBOUNCE_MS: "600000" },
    stdio: "ignore",
  });
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("API did not start");
}, 60000);

afterAll(async () => {
  if (server) {
    const exited = new Promise(r => server!.once("exit", r));
    server.kill("SIGTERM");
    await exited;
  }
  const db = sql();
  try {
    await db`DELETE FROM audit_log WHERE actor_user_id LIKE ${`clb16-${RUN}-%`}`;
    await db`DELETE FROM idempotency_keys WHERE principal LIKE ${`%clb16-${RUN}-%`}`;
    await db`DELETE FROM templates WHERE owner_user_id LIKE ${`clb16-${RUN}-%`} OR workspace_id IN (SELECT id FROM workspaces WHERE created_by LIKE ${`clb16-${RUN}-%`})`;
    await db`DELETE FROM workspaces WHERE created_by LIKE ${`clb16-${RUN}-%`}`;
    await db`DELETE FROM users WHERE id LIKE ${`clb16-${RUN}-%`}`;
  } finally {
    await db.end();
  }
});

describe("B16 imports, exports and watermark through the client against the real API", () => {
  const owner = mk(U("owner"));
  const other = mk(U("other"));
  let wid = "";
  let pid = "";

  beforeAll(async () => {
    await other.me();
    wid = (await owner.createWorkspace({ name: "IO Client" })).id;
    pid = (await owner.createProject(wid, { name: "Feature" })).id;
  }, 30000);

  it("importFile: upload over HTTP, job runs, the document and its conversion report come back", async () => {
    const job = await owner.importFile({ projectId: pid }, { filename: "harbour.fountain", bytes: enc(FOUNTAIN) });
    expect(job).toMatchObject({ kind: "import.fountain", status: "queued" });
    const done = await finished(owner, job);
    expect(done.status).toBe("succeeded");
    const outs = (await owner.getJobOutputs(job.id)).outputs;
    const documentId = outs[0]!.documentId!;
    const report = JSON.parse(dec(await owner.fetchJobOutput(outs[0]!)));
    expect(report).toMatchObject({ direction: "import", format: "fountain" });
    const doc = await owner.getDocument(documentId);
    expect(doc.title).toBe("Client Import");
    const content = await owner.getDocumentContent(documentId);
    expect(content.elements.map(e => e.text.plain)).toContain("Gulls circle the mast.");
    // starting again returns the same job
    const created = await owner.createImportJob({ targetProjectId: pid, filename: "b.fountain", sizeBytes: 3, sha256Hex: await sha256Hex(enc("abc")) });
    const early = await owner.startImport(created.importId).catch(e => e);
    expect(early).toBeInstanceOf(UploadIncompleteError);
    expect(early.reason).toBe("missing");
  });

  it("typed refusals: PDF, DOCX and forced OCR are never faked", async () => {
    const sha = await sha256Hex(enc("x"));
    for (const format of ["pdf", "docx"]) {
      const e = await owner.createImportJob({ targetProjectId: pid, filename: `a.${format}`, sizeBytes: 1, sha256Hex: sha, format }).catch(x => x);
      expect(e).toBeInstanceOf(FormatUnsupportedError);
      expect(e).toMatchObject({ direction: "import", status: 415 });
      expect(e.supported).toEqual(["fountain", "fdx", "fadein"]);
    }
    const ocr = await owner.createImportJob({ targetProjectId: pid, filename: "a.pdf", sizeBytes: 1, sha256Hex: sha, options: { ocr: "force" } }).catch(x => x);
    expect(ocr).toBeInstanceOf(OcrUnavailableError);
    // real PDF bytes: detected at start, refused with the reason
    const pdf = await owner.importFile({ projectId: pid }, { filename: "scan.pdf", bytes: enc("%PDF-1.4\n%%EOF\n") }).catch(x => x);
    expect(pdf).toBeInstanceOf(FormatUnsupportedError);
    expect(pdf.reason).toBe("pdfImportNotBuilt");
    const doc = (await owner.importFile({ projectId: pid }, { filename: "x.fountain", bytes: enc(FOUNTAIN) })).id;
    expect(doc).toMatch(/^job_/);
    await expect(owner.createExportJob("doc_nope", { format: "pdf" })).rejects.toBeInstanceOf(ApiError);
  });

  it("importOver replaces the content behind a pre-import snapshot; exports read the new text", async () => {
    const first = await finished(owner, await owner.importFile({ projectId: pid }, { filename: "t.fountain", bytes: enc(FOUNTAIN) }));
    const did = (await owner.getJobOutputs(first.id)).outputs[0]!.documentId!;
    const over = await finished(owner, await owner.importFile({ documentId: did }, { filename: "lab.fdx", bytes: enc(FDX) }));
    expect(over).toMatchObject({ kind: "doc.importOver", status: "succeeded", documentId: did });
    expect((await owner.getDocumentContent(did)).elements.map(e => e.text.plain)).toContain("Dust floats in the light.");
    expect((await owner.getDocument(did)).epoch).toBe(1);
    const snaps = await owner.listSnapshots(did);
    expect(snaps.snapshots.some(s => s.autoReason === "pre-import")).toBe(true);

    for (const format of ["fountain", "fdx", "json"] as const) {
      const job = await finished(owner, await owner.createExportJob(did, { format }));
      expect(job.status).toBe("succeeded");
      const outs = (await owner.getJobOutputs(job.id)).outputs;
      expect(dec(await owner.fetchJobOutput(outs[0]!))).toContain("Dust floats in the light.");
    }
    const pdf = await owner.createExportJob(did, { format: "pdf" }).catch(e => e);
    expect(pdf).toBeInstanceOf(FormatUnsupportedError);
    expect(pdf.direction).toBe("export");
    const combined = await finished(owner, await owner.exportCombined({ documentIds: [did], format: "fountain" }));
    expect(combined.status).toBe("succeeded");
  });

  it("a batch for three recipients: three files, distinct recoverable codes, leak lookup, admin-only", async () => {
    const made = await finished(owner, await owner.importFile({ projectId: pid }, { filename: "s.fountain", bytes: enc("Title: Leaky\n\nINT. VAULT - NIGHT\n\nDo not share.\n") }));
    const did = (await owner.getJobOutputs(made.id)).outputs[0]!.documentId!;
    const batch = await owner.createExportJob(did, {
      format: "fountain",
      options: { batchWatermark: { recipients: [{ name: "Ann", email: "ann@a.test" }, { name: "Bo" }, { name: "Cy", company: "Studio" }], visible: { text: "FOR {recipient}" } } },
    });
    expect(batch.kind).toBe("watermark.batch");
    expect((await finished(owner, batch)).status).toBe("succeeded");
    const files = (await owner.getJobOutputs(batch.id)).outputs;
    const recipients = await owner.listJobRecipients(batch.id);
    expect(files).toHaveLength(3);
    expect(new Set(recipients.map(r => r.exportId)).size).toBe(3);
    const texts = await Promise.all(files.map(async f => dec(await owner.fetchJobOutput(f)))); // over the presigned URLs
    texts.forEach((t, i) => {
      expect(t).toContain("Do not share.");
      expect(t).toContain(`FOR ${recipients[i]!.name}`);
      expect(t).toContain(`FWX-${recipients[i]!.exportId}`);
    });
    expect(new Set(texts).size).toBe(3);

    // by code, and from a leaked copy uploaded through the state-upload port
    const byCode = await owner.lookupWatermark(wid, { exportId: recipients[2]!.exportId });
    expect(byCode.matches[0]).toMatchObject({ recipient: { name: "Cy", company: "Studio" }, documentId: did, source: { kind: "live" } });
    const key = await owner.uploadStateBytes(enc(texts[0]!.replace("FOR Ann", "")), "watermark_lookup");
    const leak = await owner.lookupWatermark(wid, { pdfUploadKey: key });
    expect(leak.matches.map(m => m.recipient.name)).toEqual(["Ann"]);
    const miss = await owner.lookupWatermark(wid, { exportId: "A".repeat(26) }).catch(e => e);
    expect(miss).toBeInstanceOf(WatermarkNotFoundError);
    const pdfKey = await owner.uploadStateBytes(enc("%PDF-1.7\nleak"), "watermark_lookup");
    expect(await owner.lookupWatermark(wid, { pdfUploadKey: pdfKey }).catch(e => e)).toMatchObject({ reason: "pdfNotSupported" });
    // a stranger cannot even see the workspace
    await expect(other.lookupWatermark(wid, { exportId: recipients[0]!.exportId })).rejects.toMatchObject({ status: 404 });
  });

  it("template import by importId (and the inline form) through the client", async () => {
    const tpl = await owner.getTemplate("screenplay-standard");
    const created = await owner.createTemplate({ scope: "user", template: { ...tpl, name: "Client Tpl" } });
    const file = await owner.exportTemplate(created.id);
    const made = await owner.createImportJob({ templateTarget: { scope: "workspace", workspaceId: wid }, filename: file.filename, sizeBytes: file.bytes.byteLength, sha256Hex: await sha256Hex(file.bytes) });
    await owner.putUpload(made.upload.url, file.bytes);
    const summary = await owner.importTemplate({ importId: made.importId });
    expect(summary).toMatchObject({ scope: "workspace", workspaceId: wid, name: "Client Tpl" });
    expect((await owner.importTemplate({ scope: "user", filename: file.filename, bytes: file.bytes })).name).toBe("Client Tpl");
  });
});
