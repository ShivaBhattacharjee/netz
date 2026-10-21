import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { storeMetrics } from "@/server/metrics";

const DAY = 24 * 3600 * 1000;
const MAX_DAYS = 366;

function parseDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const GET = withStore(async (ctx, request) => {
  const search = new URL(request.url).searchParams;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const to = parseDay(search.get("to")) ?? today;
  const from = parseDay(search.get("from")) ?? new Date(to.getTime() - 13 * DAY);
  if (from > to) return NextResponse.json({ error: "from must be before to" }, { status: 400 });
  if ((to.getTime() - from.getTime()) / DAY >= MAX_DAYS) return NextResponse.json({ error: `Pick at most ${MAX_DAYS} days` }, { status: 400 });
  return NextResponse.json(await storeMetrics(ctx.store.id, from, to));
});
