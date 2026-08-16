import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, conversationMembers, messages, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      isGroup: conversations.isGroup,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(500);

  const result = await Promise.all(
    rows.map(async (c) => {
      const members = await db
        .select({
          userId: conversationMembers.userId,
          username: users.username,
          displayName: users.displayName,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(eq(conversationMembers.conversationId, c.id));
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, c.id));
      return { ...c, members, messageCount: count?.n ?? 0 };
    })
  );

  return NextResponse.json(result);
}
