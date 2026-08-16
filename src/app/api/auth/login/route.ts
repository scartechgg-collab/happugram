import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import {
  verifyPassword,
  signSessionToken,
  setSessionCookie,
  getClientKey,
} from "@/lib/auth";
import {
  checkRateLimit,
  recordFailure,
  resetRateLimit,
  maybeCleanup,
} from "@/lib/rate-limit";
import { isAccessUnlocked } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  maybeCleanup();
  if (!(await isAccessUnlocked())) {
    return NextResponse.json({ error: "Access locked." }, { status: 403 });
  }
  const key = await getClientKey();
  const rl = checkRateLimit(`login:${key}`, { maxFailures: 8 });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many login attempts. Please wait and try again.",
        retryAfterMs: rl.retryAfterMs,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as { username?: unknown; password?: unknown };
  const identifier = typeof b.username === "string" ? b.username.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Enter your username or email and password." },
      { status: 400 }
    );
  }

  // Allow login with username OR email
  const rows = await db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)))
    .limit(1);
  const user = rows[0];
  if (!user) {
    recordFailure(`login:${key}`);
    return NextResponse.json(
      { error: "Incorrect credentials." },
      { status: 401 }
    );
  }
  if (user.banned) {
    return NextResponse.json(
      { error: "This account has been suspended." },
      { status: 403 }
    );
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    recordFailure(`login:${key}`);
    return NextResponse.json(
      { error: "Incorrect credentials." },
      { status: 401 }
    );
  }

  resetRateLimit(`login:${key}`);
  const token = await signSessionToken({ sub: user.id, username: user.username });
  await setSessionCookie(token);

  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));

  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    showPresence: user.showPresence,
    isAdmin: user.isAdmin,
  });
}
