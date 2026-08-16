import { NextResponse } from "next/server";
import { isAccessUnlocked, ensureAccessCredentialInitialized } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureAccessCredentialInitialized();
    const unlocked = await isAccessUnlocked();
    return NextResponse.json({ unlocked });
  } catch (err) {
    return NextResponse.json(
      { unlocked: false, error: "Unable to verify access." },
      { status: 500 }
    );
  }
}
