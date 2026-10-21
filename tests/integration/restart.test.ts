import { type ChildProcess, spawn } from "node:child_process";
import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { count, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import IORedis from "ioredis";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { aiCall, importGroup, importJob, product, sourceRow, store, upload } from "@/db/schema";
import { createImport } from "@/server/imports";
import { TAXONOMY } from "@/server/pipeline/taxonomy";
import { receiveUpload } from "@/server/uploads";
import { evalPath } from "../helpers";

const STORE_ID = "st_integration";
const SHEET = evalPath("medium", "supplier-sheet.csv");
const MAX_IN_FLIGHT = 6;

let aiRequests = 0;
let fakeUrl = "";
const fake = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    const send = (body: unknown) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET") return send({ type: "model", id: req.url?.split("/").pop(), display_name: "fake", created_at: "2026-01-01T00:00:00Z" });
    const n = ++aiRequests;
    const listing = {
      title: `Integration Product ${n}`,
      description_html: "<p>A product.</p>",
      category: TAXONOMY[0],
      tags: ["product"],
      attributes: [],
      claims: [],
      seo: { meta_title: "Product", meta_description: "A product." },
      confidence: ["title", "description_html", "category"].map((field) => ({ field, score: 95 })),
      concerns: [],
    };
    setTimeout(
      () =>
        send({
          id: `msg_${n}`,
          type: "message",
          role: "assistant",
          model: "fake",
          content: [{ type: "text", text: JSON.stringify(listing) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      50,
    );
  });
});

function startWorker(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/worker/index.ts"], {
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: fakeUrl,
      WORKER_QUEUES: "parse,ai.cheap,ai.strong",
      AI_CHEAP_CONCURRENCY: "4",
      AI_STRONG_CONCURRENCY: String(MAX_IN_FLIGHT - 4),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk;
      if (output.includes("worker started")) resolve(child);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => reject(new Error(`worker exited with ${code}:\n${output.slice(-2000)}`)));
  });
}

function stop(child: ChildProcess, signal: NodeJS.Signals) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill(signal);
  });
}

async function waitFor<T>(what: string, check: () => Promise<T | null | undefined | false>, timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function importSheet() {
  const saved = await receiveUpload(Readable.toWeb(createReadStream(SHEET)) as ReadableStream<Uint8Array>, "sheet", "supplier-sheet.csv", statSync(SHEET).size);
  await db.insert(upload).values({ id: saved.id, storeId: STORE_ID, kind: "sheet", fileName: "supplier-sheet.csv", bytes: saved.bytes, sha256: saved.sha256, mime: saved.mime, storageKey: saved.storageKey });
  const created = await createImport(STORE_ID, null, { sheet_upload_id: saved.id, photo_upload_ids: [] });
  return created.id;
}

const importStatus = async (id: string) => (await db.select({ status: importJob.status }).from(importJob).where(eq(importJob.id, id)))[0]?.status;
const total = async (query: Promise<{ n: number }[]>) => (await query)[0].n;
const productCount = () => total(db.select({ n: count() }).from(product).where(eq(product.storeId, STORE_ID)));
const buildCalls = () => total(db.select({ n: count() }).from(aiCall).where(eq(aiCall.task, "build")));

let worker: ChildProcess | undefined;

beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  const admin = new Client({ connectionString: Object.assign(new URL(target), { pathname: "/postgres" }).toString() });
  await admin.connect();
  const name = target.pathname.slice(1);
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();
  await migrate(db, { migrationsFolder: "drizzle" });

  const redis = new IORedis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();

  await db.insert(store).values({ id: STORE_ID, name: "Integration", slug: "integration" });
  await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (worker) await stop(worker, "SIGTERM");
  fake.close();
  await db.$client.end();
});

describe("worker restart and re-upload against real Postgres and Redis", () => {
  let firstImport = "";
  let groups = 0;

  it("finishes every group exactly once after the worker is killed mid-import (3.4)", async () => {
    worker = await startWorker();
    firstImport = await importSheet();

    groups = await waitFor("groups to be parsed", async () => {
      const [imp] = await db.select({ totalRows: importJob.totalRows }).from(importJob).where(eq(importJob.id, firstImport));
      if (!imp?.totalRows) return null;
      return total(db.select({ n: count() }).from(importGroup).where(eq(importGroup.importId, firstImport)));
    });
    await waitFor("some products to be built", async () => (await productCount()) >= Math.min(40, groups / 4));

    await stop(worker, "SIGKILL");
    const builtBeforeKill = await productCount();
    expect(builtBeforeKill).toBeLessThan(groups);

    worker = await startWorker();
    await waitFor("the import to complete", async () => (await importStatus(firstImport)) === "completed");

    const statuses = await db.select({ status: importGroup.status, n: count() }).from(importGroup).where(eq(importGroup.importId, firstImport)).groupBy(importGroup.status);
    expect(statuses.filter((s) => s.status === "pending" || s.status === "failed")).toEqual([]);
    expect(await total(db.select({ n: count() }).from(sourceRow).where(eq(sourceRow.status, "pending")))).toBe(0);

    const products = await db.select({ groupKey: product.groupKey, handle: product.handle }).from(product).where(eq(product.storeId, STORE_ID));
    expect(products).toHaveLength(groups);
    expect(new Set(products.map((p) => p.groupKey)).size).toBe(groups);
    expect(new Set(products.map((p) => p.handle)).size).toBe(groups);

    expect(aiRequests).toBeGreaterThanOrEqual(groups);
    expect(aiRequests).toBeLessThanOrEqual(groups + MAX_IN_FLIGHT);
    expect(await buildCalls()).toBeLessThanOrEqual(groups);  });

  it("re-uploading the same sheet skips every group without calling the AI (3.2)", async () => {
    const requestsBefore = aiRequests;
    const callsBefore = await buildCalls();
    const secondImport = await importSheet();
    await waitFor("the re-upload to complete", async () => (await importStatus(secondImport)) === "completed");

    const statuses = await db.select({ status: importGroup.status, n: count() }).from(importGroup).where(eq(importGroup.importId, secondImport)).groupBy(importGroup.status);
    expect(statuses).toEqual([{ status: "skipped", n: groups }]);
    expect(await productCount()).toBe(groups);
    expect(aiRequests).toBe(requestsBefore);
    expect(await buildCalls()).toBe(callsBefore);
  });
});
