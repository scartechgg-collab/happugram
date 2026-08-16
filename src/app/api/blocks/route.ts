import { NextResponse } from "next/server";
import { db } from "@/db";
import { userBlocks, userReports } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// POST — block / unblock / report
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as {
    action?: unknown;
    userId?: unknown;
    reason?: unknown;
    details?: unknown;
  };
  const action = typeof b.action === "string" ? b.action : "";
  const userId = typeof b.userId === "string" ? b.userId : "";
  if (!userId || userId === auth.session.sub) {
    return NextResponse.json({ error: "Invalid target user." }, { status: 400 });
  }

  if (action === "block") {
    await db
      .insert(userBlocks)
      .values({ blockerId: auth.session.sub, blockedId: userId })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }
  if (action === "unblock") {
    await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.blockerId, auth.session.sub),
          eq(userBlocks.blockedId, userId)
        )
      );
    return NextResponse.json({ ok: true });
  }
  if (action === "report") {
    const reason = typeof b.reason === "string" ? b.reason.slice(0, 80) : "other";
    const details = typeof b.details === "string" ? b.details.slice(0, 1000) : null;
    await db.insert(userReports).values({
      reporterId: auth.session.sub,
      reportedId: userId,
      reason,
      details,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
