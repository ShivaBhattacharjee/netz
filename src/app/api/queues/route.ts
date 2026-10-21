import { NextResponse } from "next/server";
import { withStore } from "@/server/http";
import { queueStats } from "@/server/queue-stats";

export const GET = withStore(async () => NextResponse.json(await queueStats()));
