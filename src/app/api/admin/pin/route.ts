import { NextResponse } from "next/server";
import { db } from "@/db";
import { privateAccessCredentials } from "@/db/schema";
import { hashAccessCode } from "@/lib/auth";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

// POST — admin can rotate the 4-digit private access code.
// The raw digits are hashed with bcrypt; we never store them.
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as { code?: unknown };
  const code = typeof b.code === "string" ? b.code : "";
  if (!/^\d{4}$/.test(code)) {
    return NextResponse.json(
      { error: "The private code must be exactly 4 digits." },
      { status: 400 }
    );
  }

  const hash = await hashAccessCode(code);
  // Upsert singleton row (id=1)
  const existing = await db.select().from(privateAccessCredentials).limit(1);
  if (existing.length) {
    await db
      .update(privateAccessCredentials)
      .set({ codeHash: hash, updatedAt: new Date() });
  } else {
    await db.insert(privateAccessCredentials).values({ id: 1, codeHash: hash });
  }
  return NextResponse.json({ ok: true });
}
