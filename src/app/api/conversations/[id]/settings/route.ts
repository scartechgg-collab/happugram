import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";
import { isConversationMember } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (!(await isConversationMember(id, auth.session.sub))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as { muted?: unknown; archived?: unknown; pinned?: unknown };

  const updates: {
    muted?: boolean;
    archived?: boolean;
    pinnedAt?: Date | null;
  } = {};
  if (typeof b.muted === "boolean") updates.muted = b.muted;
  if (typeof b.archived === "boolean") updates.archived = b.archived;
  if (typeof b.pinned === "boolean") {
    updates.pinnedAt = b.pinned ? new Date() : null;
  }

  await db
    .update(conversationMembers)
    .set(updates)
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, auth.session.sub)
      )
    );

  return NextResponse.json({ ok: true });
}
