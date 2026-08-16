import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";
import { isConversationMember } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (!(await isConversationMember(id, auth.session.sub))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, auth.session.sub)
      )
    );

  return NextResponse.json({ ok: true });
}
