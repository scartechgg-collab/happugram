import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { isAccessUnlocked } from "@/lib/access";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export async function POST(req: Request) {
  if (!(await isAccessUnlocked())) {
    return NextResponse.json({ error: "Access locked." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const b = body as {
    username?: unknown;
    displayName?: unknown;
    email?: unknown;
    password?: unknown;
  };
  const username = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const displayName =
    typeof b.displayName === "string" && b.displayName.trim().length
      ? b.displayName.trim()
      : username;
  const password = typeof b.password === "string" ? b.password : "";

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–30 letters, numbers, or underscores." },
      { status: 400 }
    );
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }
  if (!displayName || displayName.length > 80) {
    return NextResponse.json({ error: "Display name is invalid." }, { status: 400 });
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

  // Check for existing username or email
  const existing = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(
      email
        ? or(eq(users.username, username), eq(users.email, email))
        : eq(users.username, username)
    )
    .limit(2);

  if (existing.some((u) => u.username === username)) {
    return NextResponse.json(
      { error: "That username is already taken." },
      { status: 409 }
    );
  }
  if (email && existing.some((u) => u.email === email)) {
    return NextResponse.json(
      { error: "That email is already registered." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const isAdmin = !!adminEmail && email === adminEmail;

  const inserted = await db
    .insert(users)
    .values({
      username,
      email: email || null,
      displayName,
      passwordHash,
      isAdmin,
    })
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
    });

  return NextResponse.json(inserted[0], { status: 201 });
}
