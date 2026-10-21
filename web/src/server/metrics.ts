import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiCall, importGroup, importJob, product } from "@/db/schema";
import type { Metrics } from "@/lib/types";
import { rateFor } from "./ai/pricing";

const LATENCY_EDGES = [0, 2000, 4000, 6000, 10000, Number.POSITIVE_INFINITY];
const LATENCY_LABELS = ["<2s", "2–4s", "4–6s", "6–10s", "10s+"];

export async function storeMetrics(storeId: string, from: Date, to: Date): Promise<Metrics> {
  const since = from;
  const until = new Date(to.getTime() + 24 * 3600 * 1000);
  const days = Math.round((until.getTime() - since.getTime()) / (24 * 3600 * 1000));
  const strongModel = process.env.GEMINI_MODEL_STRONG ?? "gemini-3.8-flash";
  const strong = rateFor(strongModel) ?? { input: 0, output: 0 };

  const [statusRows, modelRows, latencyRows, coverageRows, funnelRows, dailyGroups, dailyCost] = await Promise.all([
    db
      .select({ status: product.status, n: sql<number>`count(*)::int` })
      .from(product)
      .where(and(eq(product.storeId, storeId), isNull(product.deletedAt)))
      .groupBy(product.status),
    db
      .select({
        model: aiCall.model,
        calls: sql<number>`count(*)::int`,
        products: sql<number>`count(distinct ${aiCall.productId})::int`,
        cost: sql<number>`coalesce(sum(${aiCall.costMicros}), 0)::bigint`,
        input: sql<number>`coalesce(sum(${aiCall.inputTokens}), 0)::bigint`,
        output: sql<number>`coalesce(sum(${aiCall.outputTokens}), 0)::bigint`,
      })
      .from(aiCall)
      .where(and(eq(aiCall.storeId, storeId), gte(aiCall.createdAt, since), lt(aiCall.createdAt, until)))
      .groupBy(aiCall.model),
    db
      .select({ ms: sql<number>`sum(${aiCall.latencyMs})::int` })
      .from(aiCall)
      .where(and(eq(aiCall.storeId, storeId), gte(aiCall.createdAt, since), lt(aiCall.createdAt, until), sql`${aiCall.task} <> 'translate'`, sql`${aiCall.productId} is not null`))
      .groupBy(aiCall.productId),
    db.execute<{ locale: string; current: number; out_of_date: number; missing: number; total: number }>(sql`
      with fields as (
        select p.id, l.locale, f.field, case f.field when 'title' then p.title else p.description_html end as english
        from product p
        cross join (values ('de'), ('fr')) as l(locale)
        cross join (values ('title'), ('description_html')) as f(field)
        where p.store_id = ${storeId} and p.deleted_at is null
      )
      select fields.locale,
        count(*) filter (where t.product_id is not null and t.state = 'current' and t.source_hash = encode(sha256(convert_to(fields.english, 'UTF8')), 'hex'))::int as current,
        count(*) filter (where t.origin = 'manual' and (t.state = 'out_of_date' or t.source_hash <> encode(sha256(convert_to(fields.english, 'UTF8')), 'hex')))::int as out_of_date,
        count(*) filter (where t.product_id is null or (t.origin = 'ai' and t.source_hash <> encode(sha256(convert_to(fields.english, 'UTF8')), 'hex')))::int as missing,
        count(*)::int as total
      from fields
      left join translation t on t.product_id = fields.id and t.locale = fields.locale and t.field = fields.field
      group by fields.locale
      order by fields.locale
    `),
    db
      .select({
        rows: sql<number>`coalesce(sum(${importJob.totalRows}), 0)::int`,
        finished: sql<number>`coalesce(sum(${importJob.totalRows} - (${importJob.counts}->>'pending')::int), 0)::int`,
        built: sql<number>`coalesce(sum((${importJob.counts}->>'done')::int + (${importJob.counts}->>'needs_review')::int), 0)::int`,
      })
      .from(importJob)
      .where(eq(importJob.storeId, storeId)),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${importGroup.updatedAt}), 'YYYY-MM-DD')`,
        done: sql<number>`count(*) filter (where ${importGroup.status} in ('done', 'skipped'))::int`,
        review: sql<number>`count(*) filter (where ${importGroup.status} = 'needs_review')::int`,
        failed: sql<number>`count(*) filter (where ${importGroup.status} = 'failed')::int`,
      })
      .from(importGroup)
      .where(and(eq(importGroup.storeId, storeId), gte(importGroup.updatedAt, since), lt(importGroup.updatedAt, until), sql`${importGroup.status} <> 'pending'`))
      .groupBy(sql`1`),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${aiCall.createdAt}), 'YYYY-MM-DD')`,
        cost: sql<number>`coalesce(sum(${aiCall.costMicros}), 0)::bigint`,
        input: sql<number>`coalesce(sum(${aiCall.inputTokens}), 0)::bigint`,
        output: sql<number>`coalesce(sum(${aiCall.outputTokens}), 0)::bigint`,
      })
      .from(aiCall)
      .where(and(eq(aiCall.storeId, storeId), gte(aiCall.createdAt, since), lt(aiCall.createdAt, until)))
      .groupBy(sql`1`),
  ]);

  const by = { approved: 0, ready: 0, needs_review: 0, failed: 0 };
  for (const r of statusRows) by[r.status] = r.n;
  const total = by.approved + by.ready + by.needs_review + by.failed;

  const baselineOf = (input: number, output: number) => Number(input) * strong.input + Number(output) * strong.output;
  const models = modelRows.map((m) => ({ model: m.model, calls: m.calls, products: m.products, cost_micros: Number(m.cost) }));
  const cost = models.reduce((a, m) => a + m.cost_micros, 0);
  const baseline = modelRows.reduce((a, m) => a + baselineOf(m.input, m.output), 0);

  const latencies = latencyRows.map((r) => r.ms).sort((a, b) => a - b);
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

  const byDay = new Map<string, Metrics["daily"][number]>();
  for (let i = 0; i < days; i++) {
    const day = new Date(since.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    byDay.set(day, { day, done: 0, review: 0, failed: 0, cost_micros: 0, saved_micros: 0 });
  }
  for (const g of dailyGroups) Object.assign(byDay.get(g.day) ?? {}, { done: g.done, review: g.review, failed: g.failed });
  for (const c of dailyCost) {
    const d = byDay.get(c.day);
    if (d) {
      d.cost_micros = Number(c.cost);
      d.saved_micros = Math.max(0, Math.round(baselineOf(c.input, c.output) - Number(c.cost)));
    }
  }

  const funnel = funnelRows[0] ?? { rows: 0, finished: 0, built: 0 };
  return {
    by,
    total,
    cost_micros: cost,
    baseline_micros: Math.round(baseline),
    strong_model: strongModel,
    avg_ms: Math.round(avg),
    p95_ms: p95,
    latency: LATENCY_LABELS.map((bucket, i) => ({ bucket, count: latencies.filter((l) => l >= LATENCY_EDGES[i] && l < LATENCY_EDGES[i + 1]).length })),
    models,
    coverage: coverageRows.rows.map((c) => ({
      language: c.locale === "de" ? "German" : "French",
      current: c.current,
      outOfDate: c.out_of_date,
      missing: c.missing,
      total: c.total,
    })),
    funnel: [
      { label: "Rows uploaded", value: funnel.rows },
      { label: "Cleaned and grouped", value: funnel.finished },
      { label: "Built by AI", value: funnel.built },
      { label: "Approved and live", value: by.approved },
    ],
    daily: [...byDay.values()],
  };
}
