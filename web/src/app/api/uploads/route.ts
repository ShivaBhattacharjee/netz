import { NextResponse } from "next/server";
import { db } from "@/db";
import { upload } from "@/db/schema";
import { getApiContext } from "@/lib/auth/session";
import { UploadError, type UploadKind, receiveUpload } from "@/server/uploads";

const KINDS = new Set<UploadKind>(["sheet", "zip", "photo"]);

function cleanFileName(raw: string | null) {
  let name = raw ?? "";
  try {
    name = decodeURIComponent(name);
  } catch {}
  name = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").trim();
  return name.slice(0, 200);
}

export async function POST(request: Request) {
  const ctx = await getApiContext();
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const kind = new URL(request.url).searchParams.get("kind") as UploadKind | null;
  if (!kind || !KINDS.has(kind)) return NextResponse.json({ error: "kind must be sheet, zip or photo" }, { status: 400 });

  const fileName = cleanFileName(request.headers.get("x-file-name"));
  if (!fileName) return NextResponse.json({ error: "x-file-name header is required" }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: `${fileName} is empty` }, { status: 400 });

  const declared = request.headers.get("content-length");
  try {
    const saved = await receiveUpload(request.body, kind, fileName, declared ? Number(declared) : null);
    await db.insert(upload).values({
      id: saved.id,
      storeId: ctx.store.id,
      userId: ctx.user.id,
      kind,
      fileName,
      bytes: saved.bytes,
      sha256: saved.sha256,
      mime: saved.mime,
      storageKey: saved.storageKey,
    });
    return NextResponse.json({ id: saved.id, kind, file_name: fileName, bytes: saved.bytes }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
