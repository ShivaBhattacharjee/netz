import { getApiContext } from "@/lib/auth/session";
import { subscribeStore } from "@/server/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 15_000;

export async function GET(request: Request) {
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ storeId: ctx.store.id })}\n\n`);

      const unsubscribe = subscribeStore(ctx.store.id, ({ type, ...data }) => send(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
