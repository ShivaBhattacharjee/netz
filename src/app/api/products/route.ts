import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { listProducts } from "@/server/products";

export const GET = withStore(async (ctx) => NextResponse.json({ products: await listProducts(ctx.store.id) }));
