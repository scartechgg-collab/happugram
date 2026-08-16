import { NextResponse } from "next/server";
import { db } from "@/db";
import { attachments, conversationMembers, messages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";
import { absolutePath } from "@/lib/storage";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);
  const att = rows[0];
  if (!att) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (att.messageId) {
    const msgRows = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, att.messageId))
      .limit(1);
    if (!msgRows.length) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const member = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, msgRows[0]!.conversationId),
          eq(conversationMembers.userId, auth.session.sub)
        )
      )
      .limit(1);
    if (!member.length) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  } else {
    if (att.uploaderId !== auth.session.sub) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const abs = absolutePath(att.storageKey);
  let s;
  try {
    s = await stat(abs);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const stream = createReadStream(abs);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  const safeName = att.filename.replace(/"/g, "");
  const disposition = download
    ? `attachment; filename="${safeName}"`
    : "inline";

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": att.mimeType,
      "Content-Length": String(s.size),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
