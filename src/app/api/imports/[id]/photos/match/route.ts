import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { matchPhotosWithAi } from "@/server/imports";

export const POST = withStore<{ id: string }>(async (ctx, _request, { id }) => NextResponse.json(await matchPhotosWithAi(ctx.store.id, id)), { sessionOnly: true });
