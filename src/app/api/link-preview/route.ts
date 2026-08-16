import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { fetchLinkPreview } from "@/lib/link-preview";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }
  // Basic URL validation + allowlist common schemes
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  try {
    const preview = await fetchLinkPreview(target);
    return NextResponse.json(preview);
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch preview." },
      { status: 502 }
    );
  }
}
