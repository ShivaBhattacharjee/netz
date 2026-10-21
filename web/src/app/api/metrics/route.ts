import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { storeMetrics } from "@/server/metrics";

export const GET = withStore(async (ctx, request) => {
  const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 14;
  return NextResponse.json(await storeMetrics(ctx.store.id, days));
});
