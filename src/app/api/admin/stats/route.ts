import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  messages,
  conversations,
  attachments,
  userReports,
} from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  const [uAdmin] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.isAdmin, true));
  const [uBanned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.banned, true));
  const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(conversations);
  const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(messages);
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(attachments);
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(userReports);

  return NextResponse.json({
    users: u?.n ?? 0,
    admins: uAdmin?.n ?? 0,
    banned: uBanned?.n ?? 0,
    conversations: c?.n ?? 0,
    messages: m?.n ?? 0,
    attachments: a?.n ?? 0,
    reports: r?.n ?? 0,
  });
}
