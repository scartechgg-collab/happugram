import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      showPresence: users.showPresence,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, auth.session.sub))
    .limit(1);
  const u = rows[0];
  if (!u) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(u);
}
