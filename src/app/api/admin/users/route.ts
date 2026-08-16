import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, messages, conversationMembers } from "@/db/schema";
import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

// GET /api/admin/users?q=&sort=asc|desc
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const sort = url.searchParams.get("sort") === "desc" ? "desc" : "asc";

  const where = q
    ? or(
        ilike(users.username, `%${q}%`),
        ilike(users.displayName, `%${q}%`),
        ilike(users.email, `%${q}%`)
      )
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isAdmin: users.isAdmin,
      banned: users.banned,
      showPresence: users.showPresence,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where as any)
    .orderBy(sort === "desc" ? desc(users.username) : asc(users.username))
    .limit(500);

  // Attach quick counts
  const enriched = await Promise.all(
    rows.map(async (u) => {
      const msgCountRow = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.senderId, u.id));
      const convCountRow = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, u.id));
      return {
        ...u,
        messageCount: msgCountRow[0]?.n ?? 0,
        conversationCount: convCountRow[0]?.n ?? 0,
      };
    })
  );

  return NextResponse.json(enriched);
}
