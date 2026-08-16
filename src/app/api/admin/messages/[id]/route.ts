import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";
import { bus, Events } from "@/lib/bus";

export const dynamic = "force-dynamic";

// Admin can hard-delete any message
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const m = rows[0];
  if (!m) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, id));
  bus.emit(Events.MESSAGE_DELETED, { messageId: id, conversationId: m.conversationId });
  return NextResponse.json({ ok: true });
}

// Admin can edit message content
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as { content?: unknown };
  if (typeof b.content !== "string") {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const m = rows[0];
  if (!m) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await db
    .update(messages)
    .set({ content: b.content.slice(0, 4000), editedAt: new Date() })
    .where(eq(messages.id, id));
  bus.emit(Events.MESSAGE_UPDATED, { messageId: id, conversationId: m.conversationId });
  return NextResponse.json({ ok: true });
}
