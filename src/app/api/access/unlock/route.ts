import { NextResponse } from "next/server";
import { db } from "@/db";
import { privateAccessCredentials } from "@/db/schema";
import {
  verifyAccessCode,
  getClientKey,
} from "@/lib/auth";
import {
  checkRateLimit,
  recordFailure,
  resetRateLimit,
  maybeCleanup,
} from "@/lib/rate-limit";
import { setAccessUnlocked, ensureAccessCredentialInitialized } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  maybeCleanup();
  try {
    await ensureAccessCredentialInitialized();

    const key = await getClientKey();
    const rl = checkRateLimit(`access:${key}`, { maxFailures: 5 });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "Too many attempts. Please wait and try again.",
          retryAfterMs: rl.retryAfterMs,
        },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request." },
        { status: 400 }
      );
    }
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? String((body as { code: unknown }).code)
        : "";
    if (!/^\d{4}$/.test(code)) {
      // Treat malformed input as a failed attempt — do NOT reveal whether
      // a code exists at all.
      recordFailure(`access:${key}`);
      return NextResponse.json(
        { ok: false, error: "Incorrect private code." },
        { status: 401 }
      );
    }

    const rows = await db
      .select()
      .from(privateAccessCredentials)
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Incorrect private code." },
        { status: 401 }
      );
    }

    // Constant-time-safe compare via bcrypt.
    const ok = await verifyAccessCode(code, row.codeHash);
    if (!ok) {
      recordFailure(`access:${key}`);
      return NextResponse.json(
        { ok: false, error: "Incorrect private code." },
        { status: 401 }
      );
    }

    resetRateLimit(`access:${key}`);
    await setAccessUnlocked();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("access/unlock error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
