import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, messages, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

// GET messages for a conversation (admin can view all)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;

  const msgs = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderUsername: users.username,
      senderDisplayName: users.displayName,
      kind: messages.kind,
      content: messages.content,
      pinned: messages.pinned,
      deletedAt: messages.deletedAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.conversationId, id))
    .orderBy(desc(messages.createdAt))
    .limit(500);

  return NextResponse.json(msgs);
}

// DELETE a conversation
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  await db.delete(conversations).where(eq(conversations.id, id));
  return NextResponse.json({ ok: true });
}
