import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  conversations,
  conversationMembers,
  messages,
  users,
  attachments,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";
import { findDirectConversation, isUserBlocked } from "@/lib/conversations";

export const dynamic = "force-dynamic";

// GET /api/conversations — list user's conversations with last message
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const userId = auth.session.sub;

  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      isGroup: conversations.isGroup,
      updatedAt: conversations.updatedAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .innerJoin(
      conversationMembers,
      eq(conversations.id, conversationMembers.conversationId)
    )
    .where(eq(conversationMembers.userId, userId))
    .orderBy(desc(conversations.updatedAt));

  const result = await Promise.all(
    rows.map(async (c) => {
      // Get other members
      const members = await db
        .select({
          userId: conversationMembers.userId,
          muted: conversationMembers.muted,
          archived: conversationMembers.archived,
          pinnedAt: conversationMembers.pinnedAt,
          lastReadAt: conversationMembers.lastReadAt,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          lastSeenAt: users.lastSeenAt,
          showPresence: users.showPresence,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(eq(conversationMembers.conversationId, c.id));

      const myMembership = members.find((m) => m.userId === userId);
      const others = members.filter((m) => m.userId !== userId);

      // Last message
      const lastMsg = await db
        .select({
          id: messages.id,
          kind: messages.kind,
          content: messages.content,
          senderId: messages.senderId,
          createdAt: messages.createdAt,
          deletedAt: messages.deletedAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      // Unread count
      const lastRead = myMembership?.lastReadAt;
      let unread = 0;
      if (lastRead) {
        const unreadRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, c.id),
              sql`${messages.createdAt} > ${lastRead}`,
              sql`${messages.senderId} != ${userId}`,
              sql`${messages.deletedAt} is null`
            )
          );
        unread = unreadRows[0]?.count ?? 0;
      } else if (lastMsg.length) {
        const cnt = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, c.id),
              sql`${messages.senderId} != ${userId}`,
              sql`${messages.deletedAt} is null`
            )
          );
        unread = cnt[0]?.count ?? 0;
      }

      return {
        id: c.id,
        title: c.title,
        isGroup: c.isGroup,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        members: others,
        muted: myMembership?.muted ?? false,
        archived: myMembership?.archived ?? false,
        pinnedAt: myMembership?.pinnedAt,
        lastReadAt: lastRead,
        lastMessage: lastMsg[0] ?? null,
        unread,
      };
    })
  );

  return NextResponse.json(result);
}

// POST /api/conversations — start a direct conversation with another user
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as { userId?: unknown };
  const targetUserId = typeof b.userId === "string" ? b.userId : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  if (targetUserId === auth.session.sub) {
    return NextResponse.json(
      { error: "Cannot start a conversation with yourself." },
      { status: 400 }
    );
  }

  if (await isUserBlocked(auth.session.sub, targetUserId)) {
    return NextResponse.json(
      { error: "You cannot start this conversation." },
      { status: 403 }
    );
  }

  const existing = await findDirectConversation(auth.session.sub, targetUserId);
  if (existing) {
    return NextResponse.json({ id: existing }, { status: 200 });
  }

  const inserted = await db
    .insert(conversations)
    .values({ isGroup: false })
    .returning({ id: conversations.id });
  const convId = inserted[0]!.id;

  await db.insert(conversationMembers).values([
    { conversationId: convId, userId: auth.session.sub },
    { conversationId: convId, userId: targetUserId },
  ]);

  return NextResponse.json({ id: convId }, { status: 201 });
}
