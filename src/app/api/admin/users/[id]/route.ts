import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";
import { hashPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH — edit any user
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

  const b = body as {
    displayName?: unknown;
    username?: unknown;
    email?: unknown;
    bio?: unknown;
    avatarUrl?: unknown;
    showPresence?: unknown;
    isAdmin?: unknown;
    banned?: unknown;
    password?: unknown;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof b.displayName === "string") {
    const v = b.displayName.trim();
    if (!v || v.length > 80)
      return NextResponse.json({ error: "Display name is invalid." }, { status: 400 });
    updates.displayName = v;
  }
  if (typeof b.username === "string") {
    const v = b.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(v))
      return NextResponse.json({ error: "Username is invalid." }, { status: 400 });
    updates.username = v;
  }
  if (typeof b.email === "string" || b.email === null) {
    const v = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (v && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)) {
      return NextResponse.json({ error: "Email is invalid." }, { status: 400 });
    }
    updates.email = v || null;
  }
  if (typeof b.bio === "string" || b.bio === null) {
    const v = typeof b.bio === "string" ? b.bio.trim() : "";
    if (v.length > 240)
      return NextResponse.json({ error: "Bio is too long." }, { status: 400 });
    updates.bio = v || null;
  }
  if (typeof b.avatarUrl === "string" || b.avatarUrl === null) {
    updates.avatarUrl = b.avatarUrl;
  }
  if (typeof b.showPresence === "boolean") updates.showPresence = b.showPresence;
  if (typeof b.isAdmin === "boolean") updates.isAdmin = b.isAdmin;
  if (typeof b.banned === "boolean") updates.banned = b.banned;

  if (typeof b.password === "string" && b.password.length > 0) {
    if (b.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }
    updates.passwordHash = await hashPassword(b.password);
  }

  try {
    await db.update(users).set(updates).where(eq(users.id, id));
  } catch (err) {
    // Likely unique constraint conflict
    return NextResponse.json(
      { error: "That username or email is already in use." },
      { status: 409 }
    );
  }

  const [row] = await db
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
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return NextResponse.json(row);
}

// DELETE — remove a user (cascades to messages, conversations, etc.)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;

  if (id === admin.session.sub) {
    return NextResponse.json(
      { error: "You cannot delete your own admin account." },
      { status: 400 }
    );
  }

  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
